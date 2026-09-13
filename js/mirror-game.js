// ================================================================
// MIRROR-GAME.JS : l'écran de « Mirror Chess »
// ================================================================
// Le plateau, les bandeaux, le journal, la fin de partie. C'est le pendant de
// game-render.js + game-flow.js pour la variante, en beaucoup plus court : il
// n'y a ici ni pouvoir, ni effet spécial, ni armée misée, ni pendule, ni ELO.
// La variante ne coûte rien et ne rapporte rien — on y joue pour la règle.
//
// POURQUOI UN ÉCRAN SÉPARÉ PLUTÔT QUE #page-game : même raison que pour la
// Chute des Royaumes. La partie ordinaire tient dans un objet GS que quinze
// fichiers lisent et écrivent ; y greffer des pièces jumelées aurait demandé
// de toucher à chacun d'eux. Cet écran réutilise donc la FEUILLE DE STYLE de
// la partie (mêmes classes, même plateau, même colonne latérale, même mise en
// page sur téléphone) et rien d'autre : aucun état partagé, donc aucune
// régression possible sur le jeu principal.
//
// DEUX TEMPS PAR COUP, ET C'EST TOUTE LA MISE EN SCÈNE. La pièce jouée se
// déplace d'abord ; un battement plus tard, sa jumelle part à son tour. Jouer
// les deux dans le même rendu donnerait deux pièces qui bougent ensemble sans
// qu'on comprenne laquelle commande — alors que là, on VOIT la règle
// s'appliquer. C'est la même couche de pièces que le jeu principal
// (.gc-layer / .gc-piece en translate3d), donc c'est une vraie transition CSS
// et non un redessin.
//
// TROIS CHOSES MONTRENT LE JUMELAGE, parce qu'une règle qui ne se voit pas se
// prend pour un défaut d'affichage :
//   · L'AXE, un trait vertical au milieu du plateau — la symétrie qui a
//     distribué les paires au coup d'envoi ;
//   · LA JUMELLE DE LA PIÈCE SAISIE, marquée dès qu'on saisit une pièce
//     (.mir-mate). Une pièce veuve n'en marque aucune : on apprend son
//     veuvage en la prenant en main, pas en perdant un coup ;
//   · LA DESTINATION DU COUP JUMEAU, montrée quand on survole une case
//     d'arrivée (.mir-twin). C'est LA question qu'on se pose avant chaque
//     coup de cette variante — « et ma jumelle, elle va où ? » — et il serait
//     absurde d'obliger à la calculer de tête.
//
// Dépendances : mirror-rules.js, mirror-ai.js, piece-art.js (pieceSVG),
// main.js (showPage, escH, showConfirmModal), rules-engine.js (playSound),
// economy-ui.js (getBoardSkin, facultatif). mirror-mp.js se branche dessus
// pour les parties en ligne, et n'est pas nécessaire pour jouer contre l'IA.
// ================================================================

const MIR_MOVE_MS=200;    // durée du déplacement, alignée sur .gc-piece
const MIR_TWIN_MS=300;    // battement avant le départ de la jumelle
const MIR_AI_DELAY=320;   // temps de respiration avant que l'IA ne joue

const MIR={
  st:null,
  mode:'ia',          // 'ia' | 'online'
  level:'soldat',
  myColor:'w',
  oppName:'Adversaire',
  oppSub:'',
  sel:null,           // case saisie
  moves:[],           // ses destinations légales (chacune porte son coup jumeau)
  hover:null,         // case d'arrivée survolée, pour montrer le coup jumeau
  anim:false,         // un coup est en cours : plus d'entrée
  pendingPromo:null,  // coups en attente d'un choix de promotion
  promoStage:0,       // 0 = la pièce jouée, 1 = sa jumelle
  onLocalMove:null,   // branché par mirror-mp.js : émet le coup sur le réseau
  onEnd:null,         // branché par mirror-mp.js : prévient l'adversaire
};

function mirBoardEl(){return document.getElementById('mir-board');}
function mirFlipped(){return MIR.myColor==='b';}

// ----------------------------------------------------------------
// LES 64 CASES
// ----------------------------------------------------------------
// Bâties une fois par orientation, jamais recréées ensuite : ce sont elles qui
// portent les écouteurs, et une grille immobile est ce qui rend le pointage
// fiable pendant qu'une pièce glisse au-dessus.
let _mirCells=null,_mirFlip=null,_mirCellAt=[],_mirNodes=new Map(),_mirPieceAt=[];

function mirEnsureCells(){
  const el=mirBoardEl();
  const flipped=mirFlipped();
  if(_mirCells&&_mirFlip===flipped&&el.querySelector('.gc'))return;
  el.innerHTML='';
  el.setAttribute('role','grid');
  el.setAttribute('aria-label','Échiquier de Mirror Chess');
  _mirCells=[];_mirFlip=flipped;_mirNodes=new Map();_mirPieceAt=[];
  _mirCellAt=[];for(let i=0;i<8;i++)_mirCellAt.push(new Array(8).fill(null));
  for(let vi=0;vi<8;vi++)for(let vc=0;vc<8;vc++){
    const r=flipped?7-vi:vi,c=flipped?7-vc:vc;
    const d=document.createElement('div');
    d.className='gc '+(((r+c)%2===0)?'l':'d');
    d.dataset.r=r;d.dataset.c=c;
    d.setAttribute('role','gridcell');
    d.tabIndex=(vi===0&&vc===0)?0:-1;
    let coord='';
    if(vc===0)coord+='<span class="gc-rank">'+(8-r)+'</span>';
    if(vi===7)coord+='<span class="gc-file">'+MIR_FILES[c].toUpperCase()+'</span>';
    if(coord)d.innerHTML=coord;
    d.addEventListener('click',()=>mirClick(r,c));
    d.addEventListener('keydown',e=>mirKey(e,r,c,vi,vc));
    d.addEventListener('pointerdown',e=>mirPointerDown(e,r,c));
    d.addEventListener('pointerenter',()=>mirSetHover(r,c));
    d.addEventListener('pointerleave',()=>mirSetHover(null));
    el.appendChild(d);
    _mirCells.push(d);
    _mirCellAt[r][c]=d;
  }
  // L'AXE DE SYMÉTRIE, entre les colonnes d et e. C'est lui qui a distribué
  // les paires au coup d'envoi, et il ne bouge plus de la partie : un trait
  // plutôt qu'un texte d'explication.
  const axis=document.createElement('div');
  axis.className='mir-axis';
  axis.setAttribute('aria-hidden','true');
  el.appendChild(axis);
  const layer=document.createElement('div');
  layer.className='gc-layer';
  el.appendChild(layer);
  if(typeof getBoardSkin==='function'){
    const sk=getBoardSkin();
    if(sk&&sk.file){
      el.style.backgroundImage='url("'+sk.file+'")';
      el.style.setProperty('--sq-light',sk.sqLight||'#e2cba6');
      el.style.setProperty('--sq-dark',sk.sqDark||'#5a4130');
    }
  }
}

function mirLayer(){return mirBoardEl().querySelector('.gc-layer');}

// ----------------------------------------------------------------
// PEINTURE DES CASES ET DIFF DES PIÈCES
// ----------------------------------------------------------------
// Où se trouve la jumelle de la pièce actuellement saisie (null si la pièce
// est veuve, ou si rien n'est saisi).
function mirSelMate(){
  const st=MIR.st;
  if(!st||!MIR.sel)return null;
  const p=st.board[MIR.sel.r][MIR.sel.c];
  return p?mirFindMate(st.board,p):null;
}
// Où irait la jumelle si on jouait la case survolée.
function mirHoverTwin(){
  if(!MIR.hover)return null;
  const m=MIR.moves.find(x=>x.to.r===MIR.hover.r&&x.to.c===MIR.hover.c);
  return m&&m.twin?m.twin.to:null;
}
function mirSetHover(r,c){
  const next=(r===null||r===undefined)?null:{r,c};
  const same=(!next&&!MIR.hover)||(next&&MIR.hover&&next.r===MIR.hover.r&&next.c===MIR.hover.c);
  if(same)return;
  MIR.hover=next;
  if(MIR.sel)mirPaintCells();
}

function mirPaintCells(){
  const st=MIR.st;if(!st||!_mirCells)return;
  const check=mirInCheck(st.board,st.turn);
  const mine=!st.gameOver&&st.turn===MIR.myColor&&!MIR.anim;
  const mate=mirSelMate();
  const twin=mirHoverTwin();
  const lm=st.lastMove;
  for(const el of _mirCells){
    const r=+el.dataset.r,c=+el.dataset.c;
    const cell=st.board[r][c];
    let cls='gc '+(((r+c)%2===0)?'l':'d');
    if(MIR.sel&&MIR.sel.r===r&&MIR.sel.c===c)cls+=' sel';
    if(mate&&mate.r===r&&mate.c===c)cls+=' mir-mate';
    if(twin&&twin.r===r&&twin.c===c)cls+=' mir-twin';
    const avail=MIR.moves.some(m=>m.to.r===r&&m.to.c===c);
    if(avail)cls+=(cell?' avail-cap':' avail');
    if(lm){
      if((lm.from.r===r&&lm.from.c===c)||(lm.tfrom&&lm.tfrom.r===r&&lm.tfrom.c===c))cls+=' lm-from';
      else if((lm.to.r===r&&lm.to.c===c)||(lm.tto&&lm.tto.r===r&&lm.tto.c===c))cls+=' lm-to';
    }
    if(cell&&cell.t==='k'&&cell.color===st.turn&&check)cls+=' gc-check';
    if(cell&&cell.color===MIR.myColor&&mine)cls+=' gc-holds';
    if(el.className!==cls)el.className=cls;
    // Le jumelage est ANNONCÉ : ce qui se voit par un liseré doit s'entendre,
    // sinon la règle est invisible au lecteur d'écran.
    let lab=mirSquare(r,c)+(cell?', '+MIR_NAME[cell.t]+(cell.color==='w'?' blanc':' noir'):', case vide');
    if(mate&&mate.r===r&&mate.c===c)lab+=', pièce jumelle';
    if(twin&&twin.r===r&&twin.c===c)lab+=', arrivée du coup jumeau';
    if(avail)lab+=cell?', prise possible':', déplacement possible';
    if(el.getAttribute('aria-label')!==lab)el.setAttribute('aria-label',lab);
  }
}

// Chaque pièce garde son nœud pour toute la partie : c'est ce qui fait que le
// coup jumeau se VOIT partir tout seul, un battement après la pièce jouée, au
// lieu d'apparaître d'un coup ailleurs.
function mirSyncPieces(){
  const st=MIR.st,layer=mirLayer(),flipped=mirFlipped();
  const seen=new Set();
  const at=[];for(let r=0;r<8;r++)at.push(new Array(8).fill(null));
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    if(!p)continue;
    seen.add(p.id);
    const vi=flipped?7-r:r,vc=flipped?7-c:c;
    const tf='translate3d('+(vc*100)+'%,'+(vi*100)+'%,0)';
    const art=p.t+':'+p.color;
    let node=_mirNodes.get(p.id);
    if(!node){
      node=document.createElement('div');
      node.className='gc-piece gc-born';
      node.innerHTML='<span class="gc-art">'+pieceSVG(MIR_ART[p.t],p.color)+'</span>';
      node._art=art;node._tf=tf;
      node.style.transform=tf;      // posé AVANT l'insertion : sinon la pièce
      layer.appendChild(node);      // glisserait depuis le coin du plateau
      _mirNodes.set(p.id,node);
      setTimeout(()=>node.classList.remove('gc-born'),MIR_MOVE_MS);
    }else{
      if(node._art!==art){          // promotion : le pion DEVIENT la pièce
        const a=node.querySelector('.gc-art');
        if(a){a.innerHTML=pieceSVG(MIR_ART[p.t],p.color);a.classList.add('gc-morph');
          setTimeout(()=>a.classList.remove('gc-morph'),320);}
        node._art=art;
      }
      if(node._tf!==tf){
        node._tf=tf;
        node.classList.add('gc-moving');
        node.style.transform=tf;
        clearTimeout(node._mt);
        node._mt=setTimeout(()=>node.classList.remove('gc-moving'),MIR_MOVE_MS+40);
      }
    }
    at[r][c]=node;
  }
  for(const[id,node]of _mirNodes){
    if(seen.has(id))continue;
    _mirNodes.delete(id);
    node.classList.add('gc-dying');
    setTimeout(()=>node.remove(),260);
  }
  _mirPieceAt=at;
}

function mirRender(){
  if(!MIR.st)return;
  mirEnsureCells();
  mirPaintCells();
  mirSyncPieces();
  mirPaintBars();
}

// ----------------------------------------------------------------
// BANDEAUX, STATUT, JOURNAL
// ----------------------------------------------------------------
function mirPaintBars(){
  const st=MIR.st;
  const mine=st.turn===MIR.myColor;
  document.getElementById('mir-me-bar').classList.toggle('gp-turn',mine&&!st.gameOver);
  document.getElementById('mir-opp-bar').classList.toggle('gp-turn',!mine&&!st.gameOver);
  mirDrawCaptured('mir-cap-me',st.captured[MIR.myColor],mirOpp(MIR.myColor));
  mirDrawCaptured('mir-cap-opp',st.captured[mirOpp(MIR.myColor)],MIR.myColor);
}
function mirDrawCaptured(id,list,color){
  const el=document.getElementById(id);if(!el)return;
  const order=['q','r','b','n','p'];
  const html=(list||[]).slice().sort((a,b)=>order.indexOf(a)-order.indexOf(b))
    .map(t=>pieceIcon(MIR_ART[t],color)).join('');
  if(el.innerHTML!==html)el.innerHTML=html;
}

function mirSetStatus(){
  const st=MIR.st,el=document.getElementById('mir-status');
  if(!el)return;
  let cls='status-bar',txt;
  if(st.gameOver){
    cls+=' mate';
    if(st.result==='draw')txt='Partie nulle — '+st.reason+'.';
    else txt=(st.result===MIR.myColor?'Victoire':'Défaite')+' — '+st.reason+'.';
  }else if(st.turn===MIR.myColor){
    txt=st.check?'Échec ! À vous de jouer.':'À votre tour.';
    cls+=st.check?' check':' ok';
  }else{
    txt=st.check?'Échec à l’adversaire.':(MIR.mode==='ia'?'L’adversaire réfléchit…':'Au tour de votre adversaire.');
    cls+=st.check?' check':' thinking';
  }
  el.className=cls;
  if(el.textContent!==txt)el.textContent=txt;
}

function mirRenderLog(){
  const el=document.getElementById('mir-log');if(!el)return;
  const rows=[];
  const m=MIR.st.moves;
  for(let i=0;i<m.length;i+=2){
    const w=m[i],b=m[i+1];
    rows.push('<div class="move-log-item"><span class="move-log-num">'+(i/2+1)+'.</span>'+
      '<span class="move-log-w">'+pieceIcon(MIR_ART[w.piece],'w')+escH(w.text)+'</span>'+
      '<span class="move-log-b">'+(b?pieceIcon(MIR_ART[b.piece],'b')+escH(b.text):'')+'</span></div>');
  }
  el.innerHTML=rows.join('');
  el.scrollTop=el.scrollHeight;
}

// ----------------------------------------------------------------
// SAISIE
// ----------------------------------------------------------------
function mirPlayable(){
  return MIR.st&&!MIR.st.gameOver&&!MIR.anim&&!MIR.pendingPromo&&MIR.st.turn===MIR.myColor;
}

function mirSelect(r,c){
  MIR.sel={r,c};
  MIR.moves=mirMovesFrom(MIR.st,r,c);
  if(typeof playSound==='function')playSound('tap',{force:.3});
  mirPaintCells();
}
function mirDeselect(){MIR.sel=null;MIR.moves=[];MIR.hover=null;mirPaintCells();}

function mirClick(r,c){
  if(!mirPlayable())return;
  const st=MIR.st,cell=st.board[r][c];
  if(MIR.sel){
    if(MIR.sel.r===r&&MIR.sel.c===c){mirDeselect();return;}
    const target=MIR.moves.find(m=>m.to.r===r&&m.to.c===c);
    if(target){mirTryMove(MIR.sel,{r,c});return;}
  }
  if(cell&&cell.color===MIR.myColor)mirSelect(r,c);
  else mirDeselect();
}

// Le coup demandé par le joueur. LA PROMOTION PEUT ÊTRE DEMANDÉE DEUX FOIS —
// une paire de pions arrivée ensemble sur la dernière rangée promeut des deux
// côtés, et rien n'oblige à choisir la même pièce. On pose donc la question
// pour la pièce jouée, puis pour sa jumelle si elle promeut aussi.
function mirTryMove(from,to){
  const st=MIR.st;
  const all=mirMovesTo(st,from,to);
  if(!all.length)return;
  mirDeselect();
  if(all.length===1){mirPlayMove(all[0],true);return;}
  MIR.pendingPromo=all;MIR.promoStage=0;
  mirAskPromo();
}

// Pose la question du moment (pièce jouée, puis jumelle), ou joue dès qu'il ne
// reste plus qu'un coup possible.
function mirAskPromo(){
  const list=MIR.pendingPromo;
  if(!list)return;
  if(list.length===1){
    MIR.pendingPromo=null;
    document.getElementById('mir-promo').classList.remove('show');
    mirPlayMove(list[0],true);
    return;
  }
  const key=MIR.promoStage===0?(m=>m.promo||null):(m=>(m.twin&&m.twin.promo)||null);
  const opts=[];
  for(const m of list){const k=key(m);if(k&&opts.indexOf(k)<0)opts.push(k);}
  if(opts.length<2){                      // rien à demander à cette étape
    if(MIR.promoStage===0){MIR.promoStage=1;mirAskPromo();return;}
    MIR.pendingPromo=null;
    document.getElementById('mir-promo').classList.remove('show');
    mirPlayMove(list[0],true);
    return;
  }
  const who=MIR.promoStage===0?'Votre pion promeut':'Son pion jumeau promeut aussi';
  document.getElementById('mir-promo-title').textContent='Promotion';
  document.getElementById('mir-promo-sub').textContent=who+' — choisissez sa pièce.';
  document.getElementById('mir-promo-row').innerHTML=['q','r','b','n']
    .filter(t=>opts.indexOf(t)>=0).map(t=>
      '<button class="mir-promo-btn" data-t="'+t+'" title="'+MIR_NAME[t]+'">'+
        pieceSVG(MIR_ART[t],MIR.myColor)+'<span>'+MIR_NAME[t]+'</span></button>').join('');
  document.getElementById('mir-promo').classList.add('show');
}
function mirChoosePromo(t){
  const list=MIR.pendingPromo;
  if(!list)return;
  const key=MIR.promoStage===0?(m=>m.promo||null):(m=>(m.twin&&m.twin.promo)||null);
  const kept=list.filter(m=>key(m)===t);
  MIR.pendingPromo=kept.length?kept:list;
  if(MIR.promoStage===0){MIR.promoStage=1;mirAskPromo();return;}
  MIR.pendingPromo=null;
  document.getElementById('mir-promo').classList.remove('show');
  mirPlayMove(kept[0]||list[0],true);
}

// --- Glissé-déposé. La case reste la cible du pointeur (la couche des pièces
// ne reçoit aucun clic) : on suit le doigt avec le fantôme du jeu principal,
// et on résout sur la case relâchée. ---
let _mirDrag=null;
function mirPointerDown(e,r,c){
  if(!mirPlayable()||e.button&&e.button!==0)return;
  const cell=MIR.st.board[r][c];
  if(!cell||cell.color!==MIR.myColor)return;
  const already=!!(MIR.sel&&MIR.sel.r===r&&MIR.sel.c===c);
  if(!already)mirSelect(r,c);
  _mirDrag={r,c,x:e.clientX,y:e.clientY,moved:false,already};
  const ghost=document.getElementById('drag-ghost');
  if(ghost){ghost.innerHTML=pieceSVG(MIR_ART[cell.t],cell.color);
    ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';}
}
function mirPointerMove(e){
  if(!_mirDrag)return;
  const dx=e.clientX-_mirDrag.x,dy=e.clientY-_mirDrag.y;
  const ghost=document.getElementById('drag-ghost');
  if(!_mirDrag.moved&&Math.sqrt(dx*dx+dy*dy)>6){
    _mirDrag.moved=true;
    if(ghost)ghost.style.display='block';
    const n=_mirPieceAt[_mirDrag.r]&&_mirPieceAt[_mirDrag.r][_mirDrag.c];
    if(n)n.classList.add('dragging');
  }
  if(_mirDrag.moved&&ghost){
    ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
    // Le doigt cache la case : sans ce suivi, on ne verrait jamais où part la
    // jumelle pendant qu'on déplace une pièce — c'est-à-dire au seul moment
    // où on a besoin de le savoir.
    const cell=mirCellFromPoint(e.clientX,e.clientY);
    mirSetHover(cell?cell.r:null,cell?cell.c:null);
  }
}
function mirPointerUp(e){
  const d=_mirDrag;if(!d)return;
  _mirDrag=null;
  const ghost=document.getElementById('drag-ghost');
  if(ghost)ghost.style.display='none';
  const n=_mirPieceAt[d.r]&&_mirPieceAt[d.r][d.c];
  if(n)n.classList.remove('dragging');
  if(!d.moved)return;      // simple appui : le clic s'en charge
  const cell=mirCellFromPoint(e.clientX,e.clientY);
  if(cell&&MIR.moves.some(m=>m.to.r===cell.r&&m.to.c===cell.c))mirTryMove({r:d.r,c:d.c},cell);
  else mirDeselect();
}
function mirCellFromPoint(x,y){
  const el=mirBoardEl();if(!el)return null;
  const b=el.getBoundingClientRect();
  const px=x-b.left,py=y-b.top;
  if(px<0||py<0||px>b.width||py>b.height)return null;
  const vi=Math.floor(py/(b.height/8)),vc=Math.floor(px/(b.width/8));
  const flipped=mirFlipped();
  const r=flipped?7-vi:vi,c=flipped?7-vc:vc;
  return mirIn(r,c)?{r,c}:null;
}
document.addEventListener('pointermove',mirPointerMove);
document.addEventListener('pointerup',mirPointerUp);
document.addEventListener('pointercancel',()=>{ _mirDrag=null;
  const g=document.getElementById('drag-ghost');if(g)g.style.display='none';});

// Clavier : les flèches déplacent le curseur, Entrée saisit et joue.
function mirKey(e,r,c,vi,vc){
  if(e.key==='Enter'||e.key===' '){e.preventDefault();mirClick(r,c);return;}
  if(e.key==='Escape'){mirDeselect();return;}
  const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];
  if(!d)return;
  e.preventDefault();
  const nvi=Math.min(7,Math.max(0,vi+d[0])),nvc=Math.min(7,Math.max(0,vc+d[1]));
  const flipped=mirFlipped();
  const tr=flipped?7-nvi:nvi,tc=flipped?7-nvc:nvc;
  const el=_mirCellAt[tr]&&_mirCellAt[tr][tc];
  if(el){_mirCells.forEach(x=>x.tabIndex=-1);el.tabIndex=0;el.focus();
    mirSetHover(tr,tc);}
}

// ----------------------------------------------------------------
// JOUER UN COUP : la pièce, puis sa jumelle
// ----------------------------------------------------------------
// `local` distingue le coup du joueur (à émettre sur le réseau) de celui qui
// arrive de l'adversaire ou de l'IA (déjà connu de tout le monde).
function mirPlayMove(mv,local){
  const st=MIR.st;
  if(st.gameOver||MIR.anim)return;
  const mover=st.board[mv.from.r][mv.from.c];
  if(!mover)return;
  const type=mover.t,color=mover.color;
  if(local&&MIR.onLocalMove)MIR.onLocalMove(mirPackMove(mv));

  const rec=mirMakeFirst(st,mv);
  if(rec.taken[0])st.captured[color].push(rec.taken[0].t);
  st.lastMove={from:{r:mv.from.r,c:mv.from.c},to:{r:mv.to.r,c:mv.to.c},tfrom:null,tto:null};
  MIR.anim=true;
  mirRender();
  if(typeof playSound==='function')
    playSound(mv.castle?'castle':(mv.promo?'promo':(rec.taken[0]?'capture':'move')));

  // LA JUMELLE, un battement plus tard. C'est la variante elle-même : on lui
  // laisse son propre temps à l'écran, sans quoi on ne verrait qu'une position
  // qui change à deux endroits à la fois.
  setTimeout(()=>{
    mirMakeRest(st,rec);
    if(rec.taken[1])st.captured[color].push(rec.taken[1].t);
    if(mv.twin)st.lastMove.tfrom={r:mv.twin.from.r,c:mv.twin.from.c};
    if(mv.twin)st.lastMove.tto={r:mv.twin.to.r,c:mv.twin.to.c};
    mirUpdateStatus(st);
    mirRecord(st,mv,rec.taken,color,type);
    MIR.anim=false;
    mirRender();mirRenderLog();mirSetStatus();mirSyncChrome();
    if(mv.twin&&typeof playSound==='function')
      playSound(rec.taken[1]?'capture':(mv.twin.promo?'promo':'move'),{force:.55});
    if(st.check&&!st.gameOver&&typeof playSound==='function')playSound('check');
    if(st.gameOver){mirFinish();return;}
    if(MIR.mode==='ia'&&st.turn!==MIR.myColor)setTimeout(mirAITurn,MIR_AI_DELAY);
  },MIR_TWIN_MS);
}

function mirAITurn(){
  const st=MIR.st;
  if(!st||st.gameOver||st.turn===MIR.myColor||MIR.mode!=='ia')return;
  // La recherche est synchrone et bornée (voir mirror-ai.js) : on la laisse
  // partir après un rendu, pour que « L'adversaire réfléchit… » soit
  // effectivement affiché avant que le fil ne se bloque.
  requestAnimationFrame(()=>{
    const mv=mirAIMove(st,MIR.level);
    if(!mv)return;
    mirPlayMove(mv,false);
  });
}

// Coup reçu du réseau (mirror-mp.js). Il est REVÉRIFIÉ par le moteur, coup
// jumeau compris : un client modifié ne peut pas faire jouer un coup illégal
// chez l'adversaire, ni décider où part une jumelle.
function mirRemoteMove(pk){
  const st=MIR.st;
  if(!st||st.gameOver)return false;
  if(st.turn===MIR.myColor)return false;
  const mv=mirFindMove(st,pk);
  if(!mv)return false;
  if(MIR.anim){setTimeout(()=>mirRemoteMove(pk),MIR_TWIN_MS);return true;}
  mirPlayMove(mv,false);
  return true;
}

// ----------------------------------------------------------------
// FIN DE PARTIE
// ----------------------------------------------------------------
function mirFinish(){
  mirSetStatus();
  const st=MIR.st;
  const win=st.result==='draw'?null:st.result===MIR.myColor;
  if(typeof playSound==='function')playSound(win===null?'draw':(win?'win':'loss'));
  document.getElementById('mir-res-title').textContent=
    st.result==='draw'?'Partie nulle':(win?'Victoire':'Défaite');
  document.getElementById('mir-res-sub').textContent=
    'Mirror Chess — '+st.reason+', en '+Math.ceil(st.moves.length/2)+' coups.';
  const btns=document.getElementById('mir-res-btns');
  btns.innerHTML=(MIR.mode==='ia'?'<button class="btn btn-gold" id="mir-res-again">Rejouer</button>':'')+
    '<button class="btn btn-ghost" id="mir-res-quit">Quitter</button>';
  document.getElementById('mir-result').classList.add('show');
  const again=document.getElementById('mir-res-again');
  if(again)again.onclick=()=>{
    document.getElementById('mir-result').classList.remove('show');
    mirStartGame({mode:'ia',level:MIR.level,myColor:MIR.myColor==='w'?'b':'w',
      oppName:MIR.oppName,oppSub:MIR.oppSub});
  };
  document.getElementById('mir-res-quit').onclick=mirLeave;
  const quit=document.getElementById('mir-quit');
  if(quit)quit.querySelector('span').textContent='Quitter';
}

function mirResign(){
  const st=MIR.st;
  if(!st||st.gameOver){mirLeave();return;}
  showConfirmModal('Abandonner cette partie ?',()=>{
    if(!MIR.st||MIR.st.gameOver)return;
    MIR.st.gameOver=true;MIR.st.result=mirOpp(MIR.myColor);MIR.st.reason='abandon';
    if(MIR.onEnd)MIR.onEnd('resign');
    mirFinish();mirRender();
  },{okLabel:'Abandonner',cancelLabel:'Continuer'});
}

// Défaite/victoire imposée de l'extérieur (adversaire parti, abandon reçu).
function mirDeclare(result,reason){
  const st=MIR.st;
  if(!st||st.gameOver)return;
  st.gameOver=true;st.result=result;st.reason=reason||'abandon';
  mirFinish();mirRender();
}

function mirLeave(){
  document.getElementById('mir-result').classList.remove('show');
  document.getElementById('mir-promo').classList.remove('show');
  MIR.pendingPromo=null;
  if(MIR.onEnd)MIR.onEnd('leave');
  MIR.onLocalMove=null;MIR.onEnd=null;
  if(typeof goToMainMenu==='function')goToMainMenu();
  else showPage('page-jouer');
}

// ----------------------------------------------------------------
// DÉMARRAGE
// ----------------------------------------------------------------
function mirStartGame(opts){
  opts=opts||{};
  MIR.st=mirNewState();
  MIR.mode=opts.mode||'ia';
  MIR.level=opts.level||'soldat';
  MIR.myColor=opts.myColor||'w';
  MIR.oppName=opts.oppName||'Adversaire';
  MIR.oppSub=opts.oppSub||'';
  MIR.sel=null;MIR.moves=[];MIR.hover=null;MIR.anim=false;
  MIR.pendingPromo=null;MIR.promoStage=0;
  _mirCells=null;_mirFlip=null;_mirNodes=new Map();
  const board=mirBoardEl();
  if(board)board.innerHTML='';
  mirUpdateStatus(MIR.st);

  const me=(typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur';
  document.getElementById('mir-me-name').textContent=me;
  document.getElementById('mir-me-av').textContent=me.charAt(0).toUpperCase();
  document.getElementById('mir-me-sub').textContent=MIR.myColor==='w'?'Blancs':'Noirs';
  document.getElementById('mir-opp-name').textContent=MIR.oppName;
  document.getElementById('mir-opp-av').textContent=(MIR.oppName||'?').charAt(0).toUpperCase();
  document.getElementById('mir-opp-sub').textContent=MIR.oppSub||(MIR.myColor==='w'?'Noirs':'Blancs');
  const quit=document.getElementById('mir-quit');
  if(quit)quit.querySelector('span').textContent='Abandonner';
  document.getElementById('mir-result').classList.remove('show');
  mirPanelClose();

  showPage('page-mirror');
  mirRender();mirRenderLog();mirSetStatus();
  requestAnimationFrame(()=>{mirSyncChrome();mirRender();});
  if(MIR.mode==='ia'&&MIR.st.turn!==MIR.myColor)setTimeout(mirAITurn,600);
}

// ----------------------------------------------------------------
// PANNEAUX ET MESURE DE L'ÉCRAN
// ----------------------------------------------------------------
let _mirPanel=null;
function mirPanelClose(){
  if(!_mirPanel)return;
  const el=document.getElementById(_mirPanel);
  if(el)el.hidden=true;
  document.querySelectorAll('#mir-under .gt-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
  _mirPanel=null;
}
function mirPanelToggle(id,btn){
  if(_mirPanel===id){mirPanelClose();return;}
  mirPanelClose();
  const el=document.getElementById(id);
  if(!el)return;
  el.hidden=false;_mirPanel=id;
  btn.setAttribute('aria-expanded','true');
  if(id==='mir-panel-history'){const l=document.getElementById('mir-log');if(l)l.scrollTop=l.scrollHeight;}
}

// Hauteur occupée par tout ce qui n'est pas le plateau : c'est elle qui borne
// la taille de l'échiquier sur téléphone (--game-chrome, voir [MOBILE-GAME]).
function mirSyncChrome(){
  const page=document.getElementById('page-mirror');
  if(!page||!page.classList.contains('active'))return;
  const board=mirBoardEl(),wrap=page.querySelector('.game-wrap'),main=page.querySelector('.game-main');
  if(!board||!wrap||!main)return;
  const b=board.getBoundingClientRect();
  if(b.height<=0)return;
  const cs=getComputedStyle(wrap);
  const gap=parseFloat(cs.rowGap||cs.gap)||0;
  const padB=parseFloat(cs.paddingBottom)||0;
  const m=main.getBoundingClientRect();
  let below=Math.max(0,m.bottom-b.bottom),n=0;
  const under=document.getElementById('mir-under');
  for(const el of[document.getElementById('mir-me-bar'),document.getElementById('mir-status'),
                  under,page.querySelector('.game-btns')]){
    if(!el||el.offsetParent===null)continue;
    if(el===under){
      // La zone des panneaux s'étend sur tout l'espace libre : on ne compte
      // que ce qu'elle porte VRAIMENT, sinon le plateau rétrécirait pour
      // laisser de la place à du vide (la boucle serait sans fin).
      let h=0,k=0;
      for(const ch of el.children){
        if(ch.hidden)continue;
        const st2=getComputedStyle(ch);
        if(st2.position==='absolute'||st2.display==='none')continue;
        const rr=ch.getBoundingClientRect();
        if(rr.height>0){h+=rr.height;k++;}
      }
      const g2=parseFloat(getComputedStyle(el).rowGap||getComputedStyle(el).gap)||0;
      below+=k?h+g2*(k-1):0;
    }else below+=el.getBoundingClientRect().height;
    n++;
  }
  below+=gap*n+padB;
  const chrome=Math.round(b.top+below+12);
  if(chrome>0&&chrome<3000)document.documentElement.style.setProperty('--game-chrome',chrome+'px');
}
window.addEventListener('resize',mirSyncChrome);
window.addEventListener('orientationchange',()=>setTimeout(mirSyncChrome,120));

// ----------------------------------------------------------------
// BRANCHEMENTS
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('mir-quit')?.addEventListener('click',()=>{
    if(MIR.st&&MIR.st.gameOver)mirLeave();else mirResign();
  });
  document.getElementById('mir-btn-history')?.addEventListener('click',e=>
    mirPanelToggle('mir-panel-history',e.currentTarget));
  document.getElementById('mir-btn-regle')?.addEventListener('click',e=>
    mirPanelToggle('mir-panel-regle',e.currentTarget));
  document.querySelectorAll('[data-mir-close]').forEach(b=>b.addEventListener('click',mirPanelClose));
  document.getElementById('mir-promo-row')?.addEventListener('click',e=>{
    const b=e.target.closest('.mir-promo-btn');
    if(b)mirChoosePromo(b.dataset.t);
  });
});

// ================================================================
// LE SALON DE LA VARIANTE
// ================================================================
// Une seule fenêtre, quatre vues : choisir l'adversaire, choisir le niveau de
// l'IA, choisir la façon de trouver un joueur, attendre. Elle est ouverte par
// la carte « Mirror Chess » de la page Variantes (js/variantes.js).
//
// Les trois entrées en ligne (partie rapide, partie privée, code) appellent
// js/mirror-mp.js. Si ce fichier n'est pas chargé — ou si le multijoueur n'est
// pas configuré —, la vue le DIT au lieu d'ouvrir un écran qui n'aboutit pas.
let _mirLobbyView='menu';

function mirOpenLobby(){
  _mirLobbyView='menu';
  mirLobbyRender();
  document.getElementById('mir-lobby').classList.add('show');
}
function mirCloseLobby(){
  document.getElementById('mir-lobby').classList.remove('show');
  if(typeof mirMpCancel==='function')mirMpCancel();
}

function mirLobbyRender(msg){
  const body=document.getElementById('mir-lobby-body');
  if(!body)return;
  let h='';
  if(_mirLobbyView==='menu'){
    h='<div class="fok-lob-grid">'+
      '<button class="fok-lob-card" data-view="ia"><b>Affronter l’IA</b><span>Quatre adversaires, de l’Apprenti à l’Usurpateur.</span></button>'+
      '<button class="fok-lob-card" data-view="online"><b>Affronter un joueur</b><span>Partie rapide, ou partie privée entre amis.</span></button>'+
    '</div>';
  }else if(_mirLobbyView==='ia'){
    h='<div class="fok-lob-grid">'+MIR_AI_LEVELS.map(l=>
      '<button class="fok-lob-card" data-level="'+l.id+'"><b>'+escH(l.nom)+'</b><span>'+escH(l.desc)+'</span></button>').join('')+
      '</div><button class="btn btn-ghost fok-lob-back" data-view="menu">Retour</button>';
  }else if(_mirLobbyView==='online'){
    const ok=(typeof mirMpAvailable==='function')&&mirMpAvailable();
    h=ok?('<div class="fok-lob-grid">'+
      '<button class="fok-lob-card" data-online="quick"><b>Partie rapide</b><span>On vous trouve un adversaire qui attend la même chose.</span></button>'+
      '<button class="fok-lob-card" data-online="host"><b>Créer une partie privée</b><span>Vous recevez un code à quatre lettres à transmettre.</span></button>'+
      '</div>'+
      '<div class="fok-lob-join"><input id="mir-code" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false">'+
      '<button class="btn btn-gold" data-online="join">Rejoindre</button></div>')
      :'<div class="fok-lob-note">Le jeu en ligne n’est pas disponible ici (bibliothèque réseau bloquée ou hors connexion). L’IA, elle, fonctionne toujours.</div>';
    h+='<button class="btn btn-ghost fok-lob-back" data-view="menu">Retour</button>';
  }else if(_mirLobbyView==='wait'){
    h='<div class="fok-lob-wait"><div class="mp-radar"><span></span><span></span><span></span></div>'+
      '<div class="fok-lob-note" id="mir-wait-note">'+escH(msg||'Recherche d’un adversaire…')+'</div></div>'+
      '<button class="btn btn-ghost fok-lob-back" data-view="cancel">Annuler</button>';
  }
  body.innerHTML=h;
}

function mirLobbyWait(msg){
  if(_mirLobbyView!=='wait'){_mirLobbyView='wait';mirLobbyRender(msg);return;}
  const n=document.getElementById('mir-wait-note');
  if(n)n.textContent=msg;
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('mir-lobby-close')?.addEventListener('click',mirCloseLobby);
  document.getElementById('mir-lobby-body')?.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.view==='cancel'){_mirLobbyView='online';if(typeof mirMpCancel==='function')mirMpCancel();mirLobbyRender();return;}
    if(b.dataset.view){_mirLobbyView=b.dataset.view;mirLobbyRender();return;}
    if(b.dataset.level){
      const l=mirAILevel(b.dataset.level);
      document.getElementById('mir-lobby').classList.remove('show');
      mirStartGame({mode:'ia',level:l.id,myColor:'w',oppName:l.nom,oppSub:'Intelligence artificielle'});
      return;
    }
    if(b.dataset.online&&typeof mirMpStart==='function'){
      const code=(document.getElementById('mir-code')?.value||'').trim().toUpperCase();
      mirMpStart(b.dataset.online,code);
    }
  });
});
