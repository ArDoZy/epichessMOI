// ================================================================
// REPLAY.JS : LE MODE ANALYSE — revoir une partie déjà jouée
// ================================================================
// LE JEU N'AVAIT AUCUNE MÉMOIRE DE SES PARTIES. Une ligne d'historique
// portait un verdict et un écart d'ELO — « Défaite, −18 » — et c'était tout.
// La partie elle-même, ses coups, l'armée d'en face, le moment où ça a
// basculé : rien de tout cela n'existait une seconde après le modal de fin.
// On ne pouvait donc ni relire sa propre défaite, ni voir comment joue le
// joueur qu'on s'apprête à défier, alors que c'est exactement ce qu'on va
// chercher sur un profil.
//
// Une partie est maintenant enregistrée sous sa forme la plus courte qui se
// rejoue (buildReplayRecord, plus bas) : les deux armées, la couleur du
// joueur, et la liste des coups en quatre chiffres chacun. Deux cents octets.
// Elle voyage dans la ligne d'historique du serveur (`replay`, voir
// ec_report_match dans supabase/schema.sql), donc les dix dernières parties
// de N'IMPORTE QUEL joueur sont consultables depuis son profil.
//
// -- POURQUOI ON REPASSE PAR LE MOTEUR -----------------------------
// La relecture ne rejoue pas une vidéo : elle REJOUE LES COUPS, en appelant
// executeGameMove() (js/rules-engine.js), le même que la partie en direct.
// C'est la seule façon d'être certain qu'une partie relue se déroule comme
// elle s'est jouée — un second moteur, écrit pour la relecture, aurait
// divergé du vrai au premier pouvoir modifié. Le drapeau REPLAYING
// (js/rules-engine.js) coupe pendant ce temps tout ce qui n'est pas du
// calcul : le son, les effets, les quêtes, l'IA, la fin de partie.
//
// C'est aussi pour cela que le roque, la prise en passant, la charge du
// Dresseur et les pouvoirs n'ont rien à noter dans l'enregistrement : ils se
// déduisent des deux cases, puisque c'est le moteur qui les rejoue.
//
// -- CE QU'ON VOIT ------------------------------------------------
// Une page à soi (#page-replay) : les deux camps, le plateau, la barre de
// commandes ⏮ ◀ ▶ ⏭ et le journal des coups. On avance coup par coup, au
// bouton, à la flèche du clavier ou en balayant le plateau ; toucher une
// ligne du journal saute directement à cette position.
//
// Dépendances : rules-engine.js (executeGameMove, getLegalMoves, REPLAYING,
// cloneBoard, updateMedusaParalysis/Pretre/GrandMaitre, opp),
// game-flow.js (buildGameBoard), game-render.js (applyGardePierre),
// data-pieces.js (PIECES), piece-art.js (pieceIcon), main.js (escH, showPage).
// Utilisé par : leaderboard.js (profil d'un joueur), account-ui.js (le sien).
// ================================================================

// ----------------------------------------------------------------
// 1. ENREGISTRER — appelé une fois, à la fin d'une partie
// ----------------------------------------------------------------
// Les clés sont courtes (`pc`, `w`, `b`, `m`, `pl`) parce que ce bloc est
// recopié trente fois par compte dans une colonne JSON : ce sont les seuls
// octets du jeu qu'on paie au nombre de parties.
function replayArmyRecord(a){
  if(!a)return null;
  const id=x=>(x&&x.id)?x.id:(typeof x==='string'?x:null);
  return{
    mon:id(a.mon),gen:id(a.gen),
    extras:(a.extras||[]).map(id).filter(Boolean),
    pl:a.placements||{},
  };
}
function buildReplayRecord(gs){
  if(!gs||!Array.isArray(gs.replay)||!gs.replay.length)return null;
  const pc=gs.playerColor||'w';
  // buildGameBoard() prend l'armée des BLANCS puis celle des NOIRS : on
  // enregistre dans cet ordre-là, pas dans l'ordre « moi puis lui », pour que
  // la relecture n'ait aucune conversion à faire.
  const mine=replayArmyRecord(gs.playerArmy);
  const theirs=replayArmyRecord(gs.aiArmy);
  if(!mine||!theirs||!mine.mon||!theirs.mon)return null;
  return{v:1,pc,w:pc==='w'?mine:theirs,b:pc==='w'?theirs:mine,m:gs.replay.slice(0,400)};
}

// ----------------------------------------------------------------
// 2. REJOUER — de l'enregistrement aux positions successives
// ----------------------------------------------------------------
// L'identifiant d'une pièce de promotion ne se trouve pas toujours dans
// PIECES : les quatre promotions standard portent des identifiants d'art
// (`dame-promo`, `tour-promo`…) qui n'ont pas d'entrée de catalogue.
const REPLAY_PROMO_TYPE={
  'dame-promo':'q','tour-promo':'r','fou-promo':'b','cav-promo':'n',
  'tour-primordiale':'r','fou-primordial':'b','cavalier-primordial':'n',
};
const REPLAY_PROMO_EMOJI={
  q:{w:'♕',b:'♛'},r:{w:'♖',b:'♜'},b:{w:'♗',b:'♝'},n:{w:'♘',b:'♞'},
};
function replayPromoOption(pieceId,color){
  const p=(typeof PIECES!=='undefined')?PIECES.find(x=>x.id===pieceId):null;
  if(p)return{type:p.pieceType||'q',emoji:p.emoji,pieceId};
  const t=REPLAY_PROMO_TYPE[pieceId]||'q';
  return{type:t,emoji:(REPLAY_PROMO_EMOJI[t]||{})[color]||'♛',pieceId};
}

function replayArmyFromRecord(a){
  const fp=id=>(typeof PIECES!=='undefined')?PIECES.find(p=>p.id===id):null;
  return{mon:fp(a&&a.mon),gen:fp(a&&a.gen),
         extras:((a&&a.extras)||[]).slice(),placements:(a&&a.pl)||{}};
}

// Rejoue l'enregistrement du début à la fin et renvoie une IMAGE par position
// — position de départ comprise, d'où `moves.length + 1` images. Tout est
// calculé d'un coup à l'ouverture : parcourir une partie de quarante coups en
// avant et en arrière doit être instantané, et rejouer depuis le début à
// chaque appui sur « précédent » ne l'aurait pas été.
//
// Renvoie null si l'enregistrement est inexploitable — une partie d'avant la
// mise en place du mode analyse, ou une créature retirée du catalogue depuis.
function replayFrames(rec){
  if(!rec||!rec.w||!rec.b)return null;
  if(typeof buildGameBoard!=='function'||typeof executeGameMove!=='function')return null;
  const white=replayArmyFromRecord(rec.w),black=replayArmyFromRecord(rec.b);
  if(!white.mon||!white.gen||!black.mon||!black.gen)return null;
  const pc=rec.pc==='b'?'b':'w';
  const gs={
    board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,
    halfmoveClock:0,gameOver:false,
    playerArmy:pc==='w'?white:black,aiArmy:pc==='w'?black:white,
    playerColor:pc,aiColor:pc==='w'?'b':'w',
    multiplayer:false,tuto:null,movePairs:[],capturedW:[],capturedB:[],
    pendingPromo:null,medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),
    pretreProtected:new Set(),amazonePostCapture:null,
    grandMaitreAlive:{w:false,b:false},gardePierreUsed:{w:false,b:false},
    turnCount:0,historyView:null,lastMoveHistory:[],
    clockMs:0,incrementMs:0,timeWhite:0,timeBlack:0,replay:[],
  };
  let frames;
  const wasReplaying=REPLAYING;
  REPLAYING=true;
  try{
    gs.board=buildGameBoard(white,black);
    updateMedusaParalysis(gs.board,gs);
    updatePretreProtection(gs.board,gs);
    updateGrandMaitre(gs.board,gs);
    frames=[{board:cloneBoard(gs.board),pairs:[],from:null,to:null,
             capW:[],capB:[]}];
    for(const code of (rec.m||[])){
      const s=String(code);
      const from={r:+s[0],c:+s[1]},to={r:+s[2],c:+s[3]};
      if(!(from.r>=0&&from.r<8&&from.c>=0&&from.c<8&&to.r>=0&&to.r<8&&to.c>=0&&to.c<8))break;
      const piece=gs.board[from.r][from.c];
      if(!piece)break;                       // l'enregistrement ne colle plus
      const i=s.indexOf(':');
      if(i>=0)gs._forcedPromo=replayPromoOption(s.slice(i+1),piece.color);
      // L'ANCRAGE DU GARDE DE PIERRE NE PASSE PAS PAR executeGameMove : c'est
      // le seul « coup » du jeu où la pièce ne bouge pas, et il se reconnaît
      // à cela — case de départ et case d'arrivée confondues.
      if(from.r===to.r&&from.c===to.c){
        if(typeof applyGardePierre==='function')applyGardePierre(from.r,from.c,piece.color,gs);
        else break;
      }else{
        // Le coup LÉGAL porte ses drapeaux (roque, prise en passant, charge du
        // Dresseur) : les deux cases seules n'en disent rien. On les retrouve
        // en redemandant au moteur ce que cette pièce pouvait faire.
        const legal=(typeof getLegalMoves==='function')?getLegalMoves(gs.board,from.r,from.c,gs):[];
        const mv=legal.find(m=>m.r===to.r&&m.c===to.c);
        if(!mv)break;                        // coup devenu illégal : on s'arrête là
        executeGameMove(from,mv,gs);
      }
      gs._forcedPromo=null;
      frames.push({board:cloneBoard(gs.board),
                   pairs:JSON.parse(JSON.stringify(gs.movePairs)),
                   from,to,capW:gs.capturedW.slice(),capB:gs.capturedB.slice()});
    }
  }catch(e){
    console.warn('[REPLAY] partie inexploitable :',e&&e.message);
    if(!frames||frames.length<2)frames=null;
  }finally{
    REPLAYING=wasReplaying;
  }
  if(!frames)return null;
  return{frames,white,black,pc};
}

// ----------------------------------------------------------------
// 3. MONTRER — la page d'analyse
// ----------------------------------------------------------------
const RP_FILES=['A','B','C','D','E','F','G','H'];
let _rpState=null;    // {frames, i, pc, meta, back}

// Le plateau est dessiné ICI et non par renderGame() : celui-là est marié à
// #game-board, à GS et à toute la mécanique d'une partie en cours (sélection,
// prémouvement, effets). Une relecture n'a besoin que de soixante-quatre cases
// et d'un liseré sur le dernier coup.
function rpBoardHTML(frame,pc){
  const flip=pc==='b';
  let h='';
  for(let i=0;i<8;i++)for(let j=0;j<8;j++){
    const r=flip?7-i:i,c=flip?7-j:j;
    const cell=frame.board[r][c];
    const dark=(r+c)%2===1;
    const isFrom=frame.from&&frame.from.r===r&&frame.from.c===c;
    const isTo=frame.to&&frame.to.r===r&&frame.to.c===c;
    h+='<div class="rp-cell'+(dark?' rp-dark':' rp-light')+
       (isFrom?' rp-from':'')+(isTo?' rp-to':'')+'">'+
       (j===0?'<span class="rp-rank">'+(8-r)+'</span>':'')+
       (i===7?'<span class="rp-file">'+RP_FILES[c]+'</span>':'')+
       (cell?'<span class="rp-piece">'+pieceIcon(cell.pieceId,cell.color)+'</span>':'')+
     '</div>';
  }
  return h;
}

function rpArmyStripHTML(army,color,name,sub,cls){
  const list=[army.mon,army.gen].concat((army.extras||[])
    .map(id=>PIECES.find(p=>p.id===id))).filter(Boolean);
  return '<div class="rp-side'+(cls?' '+cls:'')+'">'+
    '<div class="rp-side-id"><span class="rp-side-name">'+escH(name||'—')+'</span>'+
      (sub?'<span class="rp-side-sub">'+escH(sub)+'</span>':'')+'</div>'+
    '<div class="rp-side-army">'+
      list.map(p=>'<span class="rp-side-p" title="'+escH(p.name)+'">'+
        pieceIcon(p.id,color)+'</span>').join('')+
    '</div></div>';
}

function rpRender(){
  const st=_rpState;
  const host=document.getElementById('rp-body');
  if(!st||!host)return;
  const f=st.frames[st.i];
  const total=st.frames.length-1;
  const haut=st.pc==='w'?st.black:st.white;      // l'adversaire est en haut
  const bas=st.pc==='w'?st.white:st.black;
  const hautCol=st.pc==='w'?'b':'w',basCol=st.pc==='w'?'w':'b';
  host.innerHTML=
    rpArmyStripHTML(haut,hautCol,st.meta.opp,st.meta.oppSub)+
    '<div class="rp-board" id="rp-board">'+rpBoardHTML(f,st.pc)+'</div>'+
    rpArmyStripHTML(bas,basCol,st.meta.me,st.meta.meSub,'rp-side-bot')+
    '<div class="rp-nav">'+
      '<button id="rp-first" title="Position de départ"'+(st.i===0?' disabled':'')+'>⏮</button>'+
      '<button id="rp-prev" title="Coup précédent"'+(st.i===0?' disabled':'')+'>◀</button>'+
      '<span class="rp-count">'+(st.i===0?'Départ':'Coup '+Math.ceil(st.i/2))+
        ' <span class="rp-count-tot">/ '+Math.ceil(total/2)+'</span></span>'+
      '<button id="rp-next" title="Coup suivant"'+(st.i>=total?' disabled':'')+'>▶</button>'+
      '<button id="rp-last" title="Position finale"'+(st.i>=total?' disabled':'')+'>⏭</button>'+
    '</div>'+
    '<div class="rp-log" id="rp-log">'+rpLogHTML(st)+'</div>';
  rpWire();
  // On amène la ligne courante au milieu DU JOURNAL, et de rien d'autre.
  // scrollIntoView() entraîne tous les ancêtres : il poussait le plateau
  // au-dessus du bord de l'écran à l'ouverture, alors que le plateau est
  // justement ce qu'on vient voir.
  // `offsetTop` se mesure depuis le premier ANCÊTRE POSITIONNÉ : sans le
  // `position:relative` posé sur .rp-log ([REPLAY], css/style.css), il se
  // comptait depuis la page entière et le journal partait toujours en butée
  // basse — la ligne courante n'était jamais celle qu'on voyait.
  const log=document.getElementById('rp-log');
  const here=log&&log.querySelector('.rp-log-item.rp-here');
  if(log&&here)log.scrollTop=Math.max(0,here.offsetTop-(log.clientHeight-here.offsetHeight)/2);
}

// Le journal complet, toujours : on lit une partie finie, il n'y a rien à
// cacher. La ligne du coup regardé est surlignée, et toucher une ligne y
// saute — c'est le geste le plus rapide pour retrouver « le moment où ».
function rpLogHTML(st){
  const pairs=st.frames[st.frames.length-1].pairs||[];
  const cur=st.i>0?Math.floor((st.i-1)/2):-1;
  const curW=st.i>0&&(st.i-1)%2===0;
  return pairs.map((pair,i)=>
    '<div class="rp-log-item'+(i===cur?' rp-here':'')+'">'+
      '<span class="rp-log-num">'+(i+1)+'.</span>'+
      '<button class="rp-log-w'+(i===cur&&curW?' rp-log-on':'')+'" data-ply="'+(i*2+1)+'">'+pair[0]+'</button>'+
      (pair[1]?'<button class="rp-log-b'+(i===cur&&!curW?' rp-log-on':'')+'" data-ply="'+(i*2+2)+'">'+pair[1]+'</button>':'<span class="rp-log-b"></span>')+
    '</div>').join('');
}

function rpGo(i){
  if(!_rpState)return;
  const max=_rpState.frames.length-1;
  _rpState.i=Math.max(0,Math.min(max,i));
  rpRender();
}
function rpWire(){
  document.getElementById('rp-first')?.addEventListener('click',()=>rpGo(0));
  document.getElementById('rp-prev')?.addEventListener('click',()=>rpGo(_rpState.i-1));
  document.getElementById('rp-next')?.addEventListener('click',()=>rpGo(_rpState.i+1));
  document.getElementById('rp-last')?.addEventListener('click',()=>rpGo(_rpState.frames.length-1));
  document.querySelectorAll('#rp-log [data-ply]').forEach(b=>{
    b.addEventListener('click',()=>rpGo(parseInt(b.dataset.ply,10)));
  });
  // Le balayage horizontal sur le plateau avance et recule d'un coup : c'est
  // le geste qu'on fait naturellement pour feuilleter, et il évite d'aller
  // viser deux boutons de 40 px à chaque demi-coup.
  const board=document.getElementById('rp-board');
  if(board){
    let x0=null;
    board.addEventListener('touchstart',e=>{x0=e.touches.length===1?e.touches[0].clientX:null;},{passive:true});
    board.addEventListener('touchend',e=>{
      if(x0===null)return;
      const dx=(e.changedTouches[0]||{}).clientX-x0;
      x0=null;
      if(Math.abs(dx)<40)return;
      rpGo(_rpState.i+(dx<0?1:-1));
    });
  }
}

// Les flèches du clavier, pour l'ordinateur. Posées une seule fois, sur le
// document : la page est reconstruite à chaque coup, un écouteur posé sur elle
// serait reposé quarante fois.
document.addEventListener('keydown',e=>{
  const page=document.getElementById('page-replay');
  if(!page||!page.classList.contains('active')||!_rpState)return;
  if(e.key==='ArrowRight'){e.preventDefault();rpGo(_rpState.i+1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();rpGo(_rpState.i-1);}
  else if(e.key==='Home'){e.preventDefault();rpGo(0);}
  else if(e.key==='End'){e.preventDefault();rpGo(_rpState.frames.length-1);}
  else if(e.key==='Escape'){e.preventDefault();rpClose();}
});

// meta : {me, meSub, opp, oppSub, title, sub, back}
// `back` est ce qu'il faut faire pour revenir — la page d'où l'on vient le
// sait, la relecture non.
function openReplay(rec,meta){
  const built=replayFrames(rec);
  if(!built){
    if(typeof showNotif==='function')
      showNotif('Cette partie ne peut pas être rejouée.','err');
    return false;
  }
  _rpState={frames:built.frames,white:built.white,black:built.black,pc:built.pc,
            i:built.frames.length-1,meta:meta||{},back:(meta&&meta.back)||null};
  const t=document.getElementById('rp-title');
  if(t)t.textContent=(meta&&meta.title)||'Analyse de la partie';
  const sb=document.getElementById('rp-sub');
  if(sb)sb.textContent=(meta&&meta.sub)||'';
  // ON OUVRE SUR LA POSITION FINALE. C'est celle qu'on cherche : « comment ça
  // s'est terminé ». Remonter le fil se fait ensuite, à l'envers, ce qui est
  // aussi la façon dont on analyse une partie perdue.
  if(typeof showPage==='function')showPage('page-replay');
  rpRender();
  return true;
}
function rpClose(){
  const back=_rpState&&_rpState.back;
  _rpState=null;
  if(typeof back==='function')back();
  else if(typeof goToMainMenu==='function')goToMainMenu();
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('rp-back')?.addEventListener('click',rpClose);
});

// ----------------------------------------------------------------
// 4. LA LISTE DES DIX DERNIÈRES PARTIES
// ----------------------------------------------------------------
// Le même composant sur son propre profil et sur celui des autres : une
// partie se lit de la même façon quel que soit celui qui l'a jouée.
//
// LA PLUS RÉCENTE EN HAUT. La bande de forme, elle, se lit de gauche à droite
// comme une frise ; une LISTE se lit de haut en bas et commence par ce qui
// vient d'arriver — c'est la première ligne qu'on vient chercher.
const RP_RESULT={win:{k:'Victoire',c:'rp-win'},loss:{k:'Défaite',c:'rp-loss'},
                 draw:{k:'Nulle',c:'rp-draw'}};
function replayListHTML(history,opts){
  const o=opts||{};
  const games=(history||[]).slice(-10).reverse();
  if(!games.length)return '';
  return '<div class="rp-games">'+
    '<div class="acc-form-k">10 dernières parties</div>'+
    games.map((h,i)=>{
      const res=RP_RESULT[h.result]||{k:'Partie',c:'rp-draw'};
      const d=(h.delta>0?'+':'')+(h.delta||0);
      const quand=h.date?new Date(h.date).toLocaleDateString():'';
      const rejouable=!!(h.replay&&h.replay.m&&h.replay.m.length);
      // L'index est celui de la liste AFFICHÉE : c'est lui qu'on redonne au
      // clic, la page d'accueil de la relecture n'a pas à retrouver la partie.
      return '<button class="rp-game '+res.c+(rejouable?'':' rp-game-off')+'" '+
          'data-game="'+i+'"'+(rejouable?'':' disabled title="Partie enregistrée avant le mode analyse"')+'>'+
        '<span class="rp-game-res">'+res.k+'</span>'+
        '<span class="rp-game-opp">'+escH(h.opp||'Adversaire')+'</span>'+
        '<span class="rp-game-meta">'+(quand?escH(quand):'')+
          (h.ranked===false?' · amicale':'')+'</span>'+
        '<span class="rp-game-delta">'+(h.ranked===false?'—':d)+'</span>'+
        '<span class="rp-game-go">'+(rejouable?'Analyser':'—')+'</span>'+
      '</button>';
    }).join('')+
  '</div>';
}
// Câblage de la liste : `host` est le conteneur, `history` la même liste que
// celle passée à replayListHTML, `meta` ce qu'il faut pour titrer la page.
function wireReplayList(host,history,meta){
  if(!host)return;
  const games=(history||[]).slice(-10).reverse();
  host.querySelectorAll('[data-game]').forEach(b=>{
    b.addEventListener('click',()=>{
      const h=games[parseInt(b.dataset.game,10)];
      if(!h||!h.replay)return;
      const res=RP_RESULT[h.result]||{k:'Partie'};
      openReplay(h.replay,Object.assign({
        title:res.k+' contre '+(h.opp||'Adversaire'),
        sub:(h.date?new Date(h.date).toLocaleDateString():'')+
            (h.ranked===false?' · partie amicale':' · '+((h.delta>0?'+':'')+(h.delta||0))+' ELO'),
        opp:h.opp||'Adversaire',oppSub:h.aiElo?h.aiElo+' ELO':'',
      },meta||{}));
    });
  });
}

// ----------------------------------------------------------------
// 5. CE QU'UN JOUEUR PEUT ALIGNER — armée, pièces, pouvoirs
// ----------------------------------------------------------------
// Un profil montrait un ELO, une bande de forme et une créature fétiche, puis
// proposait « Défier ». On partait donc au duel sans la moindre idée de ce
// qu'on allait avoir en face — alors que l'armée est exactement ce qui
// distingue deux joueurs de même niveau, et que le jeu repose là-dessus.
//
// Trois blocs, et ils répondent à trois questions différentes :
//   · L'ARMÉE CHOISIE      ce qu'il alignera à la prochaine partie
//   · LES PIÈCES DÉBLOQUÉES ce dont il dispose pour en changer
//   · LES POUVOIRS          ce qui peut tomber sur le plateau
//
// Ces trois choses sont PUBLIQUES par nature : elles se voient de toute façon
// dès le premier coup d'une partie contre lui. Ce qui ne l'est pas — son
// inventaire, ses perles, sa progression — ne sort pas du serveur (voir
// ec_public, supabase/schema.sql).
//
// Les fonctions sont ici et non dans leaderboard.js parce que la page Comptes
// les affiche aussi, sur son propre profil : un profil se lit de la même façon
// qu'il soit le sien ou celui d'un inconnu.

// L'armée enregistrée telle que le serveur la donne : `pub_army` est le
// tableau `armies` du compte, dont on ne garde que la première (il n'y en a
// qu'une depuis la fusion de « Mes armées » et de la composition).
function profileArmyPieces(pub){
  const list=Array.isArray(pub)?pub:(pub?[pub]:[]);
  const a=list[0];
  if(!a||!a.mon||!a.gen)return null;
  const fp=id=>(typeof PIECES!=='undefined')?PIECES.find(p=>p.id===id):null;
  const mon=fp(a.mon.id||a.mon),gen=fp(a.gen.id||a.gen);
  if(!mon||!gen)return null;
  // L'ordre des trois pièces est celui de la composition, qui est celui du
  // plateau (voir derivePlacements, js/builder.js) : la première flanque le
  // Monarque, la dernière tient les coins. Le rétablir plutôt que de lire le
  // tableau tel quel montre l'armée dans l'ordre où on la verra.
  const dist=c=>Math.abs((c==null?0:c)-3.5);
  let ids=(a.extras||[]).slice();
  if(a.placements)ids.sort((x,y)=>dist(a.placements[x])-dist(a.placements[y]));
  return{mon,gen,extras:ids.map(fp).filter(Boolean).slice(0,3),
         value:a.totalValue|0};
}

function profileArmyHTML(pub){
  const a=profileArmyPieces(pub);
  if(!a)return '';
  const slot=p=>'<div class="pf-army-slot pf-'+p.class+'">'+
    '<span class="pf-army-logo">'+pieceIcon(p.id,'n')+'</span>'+
    '<span class="pf-army-n">'+escH(p.name)+'</span></div>';
  return '<section class="pf-sec">'+
    '<div class="pf-sec-title">Armée choisie'+
      (a.value?'<span class="pf-sec-n">'+a.value+' / 24 pts</span>':'')+'</div>'+
    '<div class="pf-army">'+[a.mon,a.gen].concat(a.extras).map(slot).join('')+'</div>'+
  '</section>';
}

// Les pièces débloquées, rangées comme partout ailleurs dans le jeu : par
// classe puis par valeur croissante. Le compte est dans le titre — c'est lui
// qu'on compare d'un profil à l'autre, plus que la liste elle-même.
function profileUnlockedPieces(ids){
  const set=new Set(Array.isArray(ids)?ids:[]);
  if(!set.size||typeof PIECES==='undefined')return [];
  return PIECES.filter(p=>set.has(p.id)).sort((a,b)=>
    ((CLASS_ORDER&&CLASS_ORDER[a.class])||9)-((CLASS_ORDER&&CLASS_ORDER[b.class])||9)
    ||a.value-b.value);
}
function profilePiecesHTML(ids){
  const list=profileUnlockedPieces(ids);
  if(!list.length)return '';
  return '<section class="pf-sec">'+
    '<div class="pf-sec-title">Pièces débloquées'+
      '<span class="pf-sec-n">'+list.length+' / '+PIECES.length+'</span></div>'+
    '<div class="pf-pieces">'+list.map(p=>
      '<span class="pf-piece pf-'+p.class+'" title="'+escH(p.class)+' · '+p.value+' pts">'+
        '<span class="pf-piece-ico">'+pieceIcon(p.id,'n')+'</span>'+escH(p.name)+
      '</span>').join('')+'</div>'+
  '</section>';
}

// LES POUVOIRS SE DÉDUISENT DES PIÈCES, ils ne sont pas une donnée de plus :
// une créature débloquée apporte son pouvoir avec elle. On ne liste donc que
// les créatures qui EN ONT un (le Roi, la Dame, les Primordiales n'en ont
// pas), sous le nom du pouvoir et non celui de la pièce — c'est le nom du
// pouvoir qu'on redoute en jouant.
function profilePowersHTML(ids){
  const list=profileUnlockedPieces(ids).filter(p=>p.ability);
  if(!list.length)return '';
  return '<section class="pf-sec">'+
    '<div class="pf-sec-title">Pouvoirs débloqués'+
      '<span class="pf-sec-n">'+list.length+'</span></div>'+
    '<div class="pf-powers">'+list.map(p=>{
      const ab=(typeof pieceSplitAbility==='function')?pieceSplitAbility(p):null;
      const accent=(typeof CLASS_COLOR_VARS!=='undefined'&&CLASS_COLOR_VARS[p.class])||'var(--accent2)';
      const ico=(typeof powerIconSVG==='function')?powerIconSVG(p.id):'';
      return '<div class="pf-power" style="--pw:'+accent+'" title="'+escH(p.ability)+'">'+
        '<span class="pf-power-ico">'+ico+'</span>'+
        '<div class="pf-power-txt">'+
          '<div class="pf-power-n">'+escH((ab&&ab.name)||p.ability)+'</div>'+
          '<div class="pf-power-p">'+escH(p.name)+'</div>'+
        '</div></div>';
    }).join('')+'</div>'+
  '</section>';
}

// Les trois blocs d'un coup : c'est ce qu'appellent les deux profils.
function profileArsenalHTML(pubArmy,pubUnlocked){
  return profileArmyHTML(pubArmy)+profilePiecesHTML(pubUnlocked)+profilePowersHTML(pubUnlocked);
}
