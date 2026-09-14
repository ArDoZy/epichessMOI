// ================================================================
// VARIANT-ANALYSIS.JS : LE MODE ANALYSE DES VARIANTES
// ================================================================
// LES VARIANTES N'AVAIENT AUCUNE MÉMOIRE DE LEUR PARTIE EN COURS. Le journal
// des coups disait « e2–e4 » ; il ne montrait rien. Un joueur qui voulait
// revoir la position d'il y a trois coups — pour comprendre où sa Dame a
// glissé, où sa jumelle était partie, quel cavalier avait bougé — n'avait
// aucun moyen d'y retourner, et le jeu principal, lui, a sa relecture
// (js/replay.js) depuis longtemps.
//
// CE FICHIER EST CE MANQUE, COMBLÉ UNE SEULE FOIS POUR LES TROIS VARIANTES.
// Board Quake, Mirror Chess et le Cheval de Troie ont chacun leur moteur,
// leur écran et leurs identifiants ; ils n'ont aucune raison d'avoir chacun
// leur mode analyse. Tout ce qui suit est donc générique : on lui donne un
// préfixe d'identifiants (`fok`, `mir`, `tro`) et une fonction de rendu, il
// s'occupe du reste.
//
// -- DES IMAGES, PAS UN MOTEUR ------------------------------------
// La relecture du jeu principal REJOUE les coups dans le moteur. Ici, on
// PHOTOGRAPHIE la position après chaque demi-coup (vanFrame) et on affiche la
// photo. Deux raisons, et elles pèsent lourd :
//   · Les trois variantes ont trois moteurs différents, dont deux jouent un
//     coup en deux temps (la bande qui glisse, la jumelle qui part) et un
//     troisième cache de l'information (l'espion du Cheval de Troie). Rejouer
//     voudrait dire écrire trois relectures, et les garder d'accord avec
//     trois moteurs qui bougent.
//   · Une photo est exacte par construction. Une relecture qui diverge du
//     moteur montre une partie qui n'a pas eu lieu — le pire de tous les
//     bogues, puisqu'il se lit comme une vérité.
// Une photo coûte 64 cases et une poignée de champs : quatre kilo-octets pour
// une partie de cent coups, dans un onglet qui en porte déjà mille.
//
// -- CE QUE L'ÉCRAN FAIT DE LA PHOTO ------------------------------
// Les écrans de variante ne lisent plus `st.board` directement : ils passent
// par vanBoard(), qui rend le VRAI plateau tant qu'on est en direct et la
// photo dès qu'on remonte le temps. Une seule indirection par écran, et le
// mode analyse n'a plus à exister dans le reste du fichier.
//
// LA PARTIE CONTINUE PENDANT QU'ON REGARDE EN ARRIÈRE. Remonter le temps ne
// met rien en pause : un coup de l'IA ou de l'adversaire en ligne ajoute sa
// photo à la pile pendant qu'on consulte la position d'il y a dix coups. En
// revanche on ne PEUT PLUS JOUER tant qu'on n'est pas revenu au présent —
// jouer un coup depuis une position ancienne n'aurait aucun sens, et la
// tentation d'y croire serait grande.
//
// Dépendances : piece-art.js (pieceIcon), main.js (escH). Utilisé par :
// fok-game.js, mirror-game.js, troie-game.js.
// ================================================================

// La photo d'un plateau. Les pièces sont RECOPIÉES et non partagées : les
// moteurs promeuvent, révèlent et remplacent des objets de pièce, et une
// photo qui pointerait sur les objets vivants changerait sous les yeux du
// joueur — c'est-à-dire montrerait le présent en prétendant montrer le passé.
function vanCloneBoard(board){
  const out=[];
  for(let r=0;r<8;r++){
    const row=new Array(8).fill(null);
    for(let c=0;c<8;c++){const p=board[r][c];row[c]=p?Object.assign({},p):null;}
    out.push(row);
  }
  return out;
}

// Tout ce dont un écran a besoin pour peindre une position : le plateau, le
// dernier coup (ses cases se surlignent), les prises des deux camps, le trait
// et l'échec. Rien d'autre — les coups légaux d'une position passée ne sont
// jamais demandés, puisqu'on ne peut pas y jouer.
function vanFrame(st){
  return{
    board:vanCloneBoard(st.board),
    lastMove:st.lastMove?JSON.parse(JSON.stringify(st.lastMove)):null,
    captured:{w:((st.captured&&st.captured.w)||[]).slice(),
              b:((st.captured&&st.captured.b)||[]).slice()},
    turn:st.turn,
    check:!!st.check,
  };
}

// L'objet d'analyse d'un écran. `view` vaut null en direct, et l'indice de la
// photo regardée sinon : UN SEUL champ dit dans quel temps on est, et tout le
// reste du fichier le lit ici.
function vanNew(opts){
  return{frames:[],view:null,prefix:(opts&&opts.prefix)||'',
         render:(opts&&opts.render)||null};
}

// Au coup d'envoi : une seule photo, la position de départ.
function vanReset(an,st){
  if(!an)return;
  an.frames=[vanFrame(st)];
  an.view=null;
  vanPaintNav(an);
}
// Après chaque demi-coup joué pour de bon.
function vanPush(an,st){
  if(!an)return;
  an.frames.push(vanFrame(st));
  vanPaintNav(an);
}

function vanLive(an){return !an||an.view===null;}
function vanCount(an){return an?an.frames.length:0;}
// L'indice regardé, que l'on soit en direct (la dernière photo) ou non.
function vanIndex(an){return vanLive(an)?Math.max(0,vanCount(an)-1):an.view;}
function vanAt(an){return an&&an.frames[vanIndex(an)]||null;}

// LES TROIS LECTURES QUE FONT LES ÉCRANS. Elles rendent le vivant en direct
// et la photo en analyse, et c'est tout ce qui sépare les deux modes dans
// fok-game.js, mirror-game.js et troie-game.js.
function vanBoard(an,st){return vanLive(an)?st.board:an.frames[an.view].board;}
function vanLastMove(an,st){return vanLive(an)?st.lastMove:an.frames[an.view].lastMove;}
function vanCaptured(an,st,color){
  return vanLive(an)?(st.captured[color]||[]):(an.frames[an.view].captured[color]||[]);
}
// Le trait de la position regardée : c'est lui qui décide quel bandeau
// s'allume et quel roi peut être en échec.
function vanTurn(an,st){return vanLive(an)?st.turn:an.frames[an.view].turn;}

// ----------------------------------------------------------------
// NAVIGUER
// ----------------------------------------------------------------
// Aller à la DERNIÈRE photo, c'est revenir en direct : il n'y a pas deux
// façons d'être au présent, sans quoi l'écran resterait figé sur une photo
// pendant que la partie continue derrière.
function vanGoto(an,i){
  if(!an||!an.frames.length)return;
  const last=an.frames.length-1;
  i=Math.max(0,Math.min(last,i));
  an.view=(i===last)?null:i;
  vanPaintNav(an);
  if(an.render)an.render();
}
function vanStep(an,d){vanGoto(an,vanIndex(an)+d);}
function vanCommand(an,cmd){
  if(cmd==='first')vanGoto(an,0);
  else if(cmd==='prev')vanStep(an,-1);
  else if(cmd==='next')vanStep(an,1);
  else vanGoto(an,vanCount(an)-1);
}

// Le bandeau de commande, sous le journal. Il dit toujours OÙ l'on est —
// « Position actuelle » ou « Coup 7 sur 21 » —, parce qu'un plateau qui
// montre une position ancienne sans le dire se lit comme un plateau cassé.
function vanPaintNav(an){
  if(!an||!an.prefix)return;
  const nav=document.getElementById(an.prefix+'-nav');
  if(!nav)return;
  const i=vanIndex(an),last=Math.max(0,vanCount(an)-1);
  const pos=document.getElementById(an.prefix+'-nav-pos');
  if(pos){
    const txt=vanLive(an)
      ?(last?'Position actuelle':'Début de la partie')
      :(i===0?'Début de la partie — coup 0 sur '+last:'Coup '+i+' sur '+last);
    if(pos.textContent!==txt)pos.textContent=txt;
  }
  nav.classList.toggle('is-past',!vanLive(an));
  for(const b of nav.querySelectorAll('[data-van]')){
    const k=b.dataset.van;
    const off=(k==='first'||k==='prev')?i<=0:i>=last;
    if(b.disabled!==off)b.disabled=off;
  }
}

// ----------------------------------------------------------------
// LE JOURNAL, QUI DEVIENT UNE TABLE DES MATIÈRES
// ----------------------------------------------------------------
// Le journal des trois variantes était le même bloc recopié trois fois ; il
// est écrit ici une fois, et chaque demi-coup y devient un bouton qui saute à
// sa position. C'est la façon la plus directe de « revenir en arrière dans la
// partie » : on clique sur le coup qu'on veut revoir.
function vanLogHTML(moves,art){
  const rows=[];
  const half=(m,ply,color)=>{
    if(!m)return'<span class="move-log-'+color+'"></span>';
    return'<span class="move-log-'+color+' van-jump" data-ply="'+ply+'" role="button" tabindex="0">'+
      pieceIcon(art[m.piece],color)+escH(m.text)+'</span>';
  };
  for(let i=0;i<moves.length;i+=2){
    rows.push('<div class="move-log-item"><span class="move-log-num">'+(i/2+1)+'.</span>'+
      half(moves[i],i+1,'w')+half(moves[i+1],i+2,'b')+'</div>');
  }
  return rows.join('');
}

// Marque le demi-coup regardé et amène-le sous les yeux. En direct, le
// journal se comporte comme avant : il colle au dernier coup joué.
function vanMarkLog(an,el){
  if(!el)return;
  const i=vanIndex(an);
  let here=null;
  for(const s of el.querySelectorAll('[data-ply]')){
    const on=(+s.dataset.ply===i);
    s.classList.toggle('van-at',on);
    if(on)here=s;
  }
  if(vanLive(an)||!here){el.scrollTop=el.scrollHeight;return;}
  const row=here.closest('.move-log-item');
  if(row&&row.offsetTop<el.scrollTop+8)el.scrollTop=Math.max(0,row.offsetTop-8);
  else if(row&&row.offsetTop+row.offsetHeight>el.scrollTop+el.clientHeight-8)
    el.scrollTop=row.offsetTop+row.offsetHeight-el.clientHeight+8;
}

// Ce que le bandeau de statut dit pendant qu'on regarde le passé — ou null
// quand on est en direct, et l'écran reprend alors ses propres phrases.
function vanStatusText(an){
  if(vanLive(an))return null;
  const i=vanIndex(an),last=Math.max(0,vanCount(an)-1);
  return'Analyse — position après le coup '+i+' sur '+last+
    '. ⏭ pour revenir à la partie.';
}

// ----------------------------------------------------------------
// BRANCHEMENTS
// ----------------------------------------------------------------
// Posés une seule fois par écran (les nœuds portent leur propre drapeau) :
// les panneaux ne sont jamais recréés, mais une partie relancée rappelle
// vanBind, et deux écouteurs empilés feraient sauter deux coups par clic.
function vanBind(an,prefix){
  if(!an)return;
  an.prefix=prefix;
  const nav=document.getElementById(prefix+'-nav');
  if(nav&&!nav._vanBound){
    nav._vanBound=true;
    nav.addEventListener('click',e=>{
      const b=e.target.closest&&e.target.closest('[data-van]');
      if(b&&!b.disabled)vanCommand(an,b.dataset.van);
    });
  }
  const log=document.getElementById(prefix+'-log');
  if(log&&!log._vanBound){
    log._vanBound=true;
    log.addEventListener('click',e=>{
      const s=e.target.closest&&e.target.closest('[data-ply]');
      if(s)vanGoto(an,+s.dataset.ply);
    });
    log.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const s=e.target.closest&&e.target.closest('[data-ply]');
      if(!s)return;
      e.preventDefault();vanGoto(an,+s.dataset.ply);
    });
  }
  // Les flèches gauche/droite, quand le panneau a le focus. Le plateau a déjà
  // les siennes (elles déplacent le curseur de case) : on ne prend donc que
  // les touches qui n'ont pas encore servi, d'où le `defaultPrevented`.
  const panel=document.getElementById(prefix+'-panel-history');
  if(panel&&!panel._vanBound){
    panel._vanBound=true;
    panel.addEventListener('keydown',e=>{
      if(e.defaultPrevented)return;
      if(e.key==='ArrowLeft'){e.preventDefault();vanStep(an,-1);}
      else if(e.key==='ArrowRight'){e.preventDefault();vanStep(an,1);}
      else if(e.key==='Home'){e.preventDefault();vanGoto(an,0);}
      else if(e.key==='End'){e.preventDefault();vanGoto(an,vanCount(an)-1);}
    });
  }
  vanPaintNav(an);
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={vanNew,vanReset,vanPush,vanLive,vanCount,vanIndex,vanAt,vanBoard,
    vanLastMove,vanCaptured,vanTurn,vanGoto,vanStep,vanCommand,vanFrame,vanCloneBoard,
    vanLogHTML,vanMarkLog,vanPaintNav,vanBind,vanStatusText};
}
