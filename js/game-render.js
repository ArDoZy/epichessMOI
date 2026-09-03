// ================================================================
// GAME-RENDER.JS : Rendu du plateau de jeu, interactions (clic/drag&drop),
// navigation d'historique, menu contextuel en partie
// ================================================================
// Contient : renderGame() (rendu complet du plateau), le système de
// drag&drop (startDrag/moveDrag/endDrag), le handler de clic
// (handleGameClick) avec les cas spéciaux (repositionnement Amazone...),
// la navigation d'historique (boutons ⏮◀▶⏭), et le menu contextuel en
// partie (pouvoirs activables).
//
// Dépendances : rules-engine.js (GS, getLegalMoves, executeGameMove, inB,
// opp, generateMovesRaw), data-pieces.js (PIECES), main.js
// (showPieceCtxMenu, showNotif).
// Utilisé par : game-flow.js (au démarrage de partie), ai-engine.js
// (après un coup IA, indirectement via executeGameMove → postMoveUpdate).
// ================================================================

// ----------------------------------------------------------------
// MENU CONTEXTUEL EN PARTIE (pouvoirs activables : Garde de Pierre)
// ----------------------------------------------------------------
let ctxActivePower=null;
function closeCtx(){document.getElementById('ctx-menu').classList.remove('show');}
document.addEventListener('click',e=>{if(!e.target.closest('#ctx-menu'))closeCtx();});
function showCtxMenu(e,r,c,gs){
  e.preventDefault();
  const cell=gs.board[r][c];
  if(!cell)return;
  const pid=cell.pieceId;const pd=PIECES.find(p=>p.id===pid)||null;
  const canUsePower=pd?.hasPower&&cell.color===gs.turn&&!gs.gameOver;
  let opts=null;
  if(canUsePower){
    const used=gs.gardePierreUsed[cell.color];
    opts={powerActive:true,powerLabel:pd.powerLabel||'Activer pouvoir',powerDisabled:!!used,powerCtx:{r,c,pieceId:pd.id,color:cell.color}};
  }
  showPieceCtxMenu(e,pd||{id:pid,name:pid},opts);
}
// Ancrage du Garde de Pierre, extrait d'activatePower() : ce pouvoir change
// le tour sans passer par executeGameMove(), il doit donc pouvoir être rejoué
// à l'identique par un adversaire en ligne (mpApplyRemotePower).
function applyGardePierre(r,c,color,gs){
  gs.anchored=gs.anchored||new Set();gs.anchored.add(`${r},${c}`);gs.gardePierreUsed[color]=true;
  // LE SEUL POUVOIR QU'ON DÉCLENCHE À LA MAIN N'AVAIT AUCUN GESTE. Le joueur
  // choisissait « Retour à l'État Fondamental » dans un menu, la pièce prenait
  // un halo doré permanent, et rien ne marquait l'INSTANT. C'est pourtant le
  // seul moment du jeu où l'on dépense un pouvoir à usage unique : il mérite
  // son image. Posé ici et non dans activatePower() parce que ce guichet est
  // aussi celui de l'adversaire en ligne (mpApplyRemotePower) — les deux
  // plateaux doivent montrer la même chose.
  if(typeof fxPower==='function')fxPower('ancre',r,c);
  // `choc` est la recette de « la masse qui rencontre la masse » (js/sfx.js) :
  // c'est exactement ce qu'est un Garde de Pierre qui se referme sur lui-même.
  // L'œil et l'oreille doivent dire la même chose — c'est la règle que suit
  // déjà toute la table des effets (voir fxForce, js/combat-fx.js).
  if(typeof playSound==='function')playSound('choc',{force:0.5});
  recordMove(gs.board[r][c],{r,c},false,gs,{r,c});gs.turn=opp(gs.turn);gs.turnCount++;
  postMoveUpdate(gs);
}
window.activatePower=()=>{
  if(!ctxActivePower)return;
  const{r,c,pieceId,color}=ctxActivePower;
  if(pieceId==='garde-pierre'){
    if(GS.gardePierreUsed[color]){showNotif('Déjà utilisé !');closeCtx();return;}
    // En ligne, on ne peut activer que ses propres pièces, et à son tour.
    if(GS.multiplayer&&(color!==GS.playerColor||GS.turn!==GS.playerColor)){showNotif('Ce n\'est pas à vous de jouer.','err');closeCtx();return;}
    applyGardePierre(r,c,color,GS);
    showNotif('Garde de Pierre ancré !','ok');
    if(GS.multiplayer&&typeof mpSendPower==='function')mpSendPower(r,c,pieceId);
  }
  closeCtx();
};

// ----------------------------------------------------------------
// RENDU DU PLATEAU DE JEU
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// LE PLATEAU : UNE GRILLE FIXE, UNE COUCHE DE PIÈCES VIVANTE
// ----------------------------------------------------------------
// AVANT, CHAQUE COUP RECONSTRUISAIT LES 64 CASES. renderGame() assemblait une
// chaîne de HTML et l'affectait d'un bloc à boardEl.innerHTML : tous les
// nœuds du plateau — cases, pièces, repères — étaient détruits et recréés à
// chaque demi-coup, à chaque sélection de pièce, à chaque retour
// d'historique. Trois conséquences, et ce sont les trois murs du game feel :
//
//   1. AUCUNE ANIMATION CONTINUE N'ÉTAIT POSSIBLE. Une transition CSS a
//      besoin que l'élément SURVIVE au changement pour interpoler entre deux
//      états. Un nœud détruit n'interpole rien : la pièce disparaissait d'une
//      case et réapparaissait sur l'autre. C'est pour contourner ça que
//      l'ancien animateLastMove() injectait un décalage en pixels et faisait
//      GLISSER la pièce depuis sa position d'arrivée — un trompe-l'œil qui ne
//      marchait que pour une pièce, une fois, et jamais pour un roque (deux
//      pièces), une capture (la pièce prise devait mourir), une paralysie qui
//      pulse ou une zone du Typhon qui se propage.
//   2. LE TACTILE EN SOUFFRAIT. Un événement tactile reste attaché à
//      l'élément d'origine pendant tout le geste. Comme le toucher d'une
//      pièce redessinait le plateau, la case touchée était détachée de
//      l'arbre AVANT le relâchement du doigt : son touchend ne remontait plus
//      jusqu'à document. Il a fallu tout un contournement (voir l'historique
//      du fichier) pour qu'un seul appui suffise à jouer un coup.
//   3. C'ÉTAIT CHER. 64 cases, 32 pièces avec leur SVG, et 256 écouteurs
//      reposés — à chaque rendu, sur un téléphone d'entrée de gamme.
//
// -- CE QU'ON FAIT MAINTENANT --------------------------------------------
//
//   · LES 64 CASES SONT CONSTRUITES UNE FOIS (ensureBoardCells) et ne sont
//     plus jamais recréées. Elles ne bougent pas : seules leurs CLASSES
//     changent (sélection, cases jouables, dernier coup, échec). Leurs
//     écouteurs sont posés une seule fois, à la construction.
//   · LES PIÈCES VIVENT DANS UNE COUCHE À PART (.gc-layer), un nœud par
//     pièce, identifié par l'`id` que buildGameBoard lui a donné. Elles sont
//     positionnées en `transform: translate3d()` sur une grille en
//     pourcentages — donc sans une seule mesure en pixels, et sans rien à
//     recalculer au redimensionnement.
//   · LE RENDU EST UN DIFF (syncPieces) : créer, déplacer, retirer. Déplacer,
//     c'est changer le transform ; la transition CSS fait le reste, et TOUTES
//     les pièces qui bougent glissent en même temps. Le roque anime ses deux
//     pièces sans une ligne de code en plus.
//
// -- POURQUOI LA COUCHE NE REÇOIT AUCUN CLIC ------------------------------
// .gc-layer est en pointer-events:none : tout le hit-testing reste sur les 64
// cases, qui ne bougent jamais. C'est ce qui fait disparaître le problème (2)
// ci-dessus, et c'est aussi pourquoi le glissé-déposé démarre désormais
// depuis la CASE et non depuis la pièce.
//
// -- IDENTITÉ D'UNE PIÈCE -------------------------------------------------
// Tout repose sur `cell.id`, posé par buildGameBoard. Une promotion remplace
// l'objet par {...p, pieceId, type} : l'id survit, donc le nœud aussi, et le
// pion devient une créature SANS disparaître. cloneBoard() conserve l'id lui
// aussi, ce qui fait que la relecture d'historique anime les positions au
// lieu de les faire clignoter.

// Durée du glissement d'une pièce. Doit rester alignée sur la transition CSS
// de .gc-piece (voir [BOARD-MOTION] dans css/style.css).
const BOARD_MOVE_MS=200;
// Durée de l'agonie d'une pièce capturée, alignée sur l'animation gcDie.
const BOARD_DEATH_MS=260;

let _boardCells=null;      // les 64 .gc, dans l'ordre visuel
let _boardFlipped=null;    // orientation pour laquelle elles ont été bâties
let _boardGS=null;         // partie pour laquelle la couche a été peuplée
let _pieceNodes=new Map(); // id de pièce -> son nœud .gc-piece
let _pieceAt=[];           // [r][c] -> nœud, pour retrouver une pièce par sa case
let _cellAt=[];            // [r][c] -> la case, pour la désigner sans balayer les 64
let _autoPieceId=0;        // repli d'identité (voir syncPieces)

function boardLayer(boardEl){
  let layer=boardEl.querySelector('.gc-layer');
  if(!layer){
    layer=document.createElement('div');
    layer.className='gc-layer';
    boardEl.appendChild(layer);
  }
  return layer;
}

// Les nœuds des pièces d'une partie terminée n'ont rien à faire dans la
// suivante : buildGameBoard repart de uid=0, donc les identifiants se
// répètent d'une partie à l'autre et un nœud survivant serait recyclé pour
// une pièce qui n'a rien à voir.
function boardResetPieces(boardEl){
  const layer=boardLayer(boardEl);
  layer.innerHTML='';
  _pieceNodes=new Map();
  _pieceAt=[];
}

// Construit les 64 cases, une fois. On ne les refait que si l'orientation
// change (le joueur passe aux Noirs) ou si le plateau a été vidé par
// quelqu'un d'autre.
function ensureBoardCells(gs,boardEl,flipped){
  const intact=_boardCells&&_boardFlipped===flipped&&boardEl.querySelector('.gc');
  if(intact){
    if(_boardGS!==gs){boardResetPieces(boardEl);_boardGS=gs;}
    return;
  }
  boardEl.innerHTML='';
  boardEl.setAttribute('role','grid');
  boardEl.setAttribute('aria-label','Échiquier');
  _boardCells=[];_boardFlipped=flipped;_boardGS=gs;
  _pieceNodes=new Map();_pieceAt=[];
  _cellAt=[];for(let i=0;i<8;i++)_cellAt.push(new Array(8).fill(null));
  for(let vi=0;vi<8;vi++)for(let vc=0;vc<8;vc++){
    const r=flipped?7-vi:vi;
    const c=flipped?7-vc:vc;
    const el=document.createElement('div');
    el.className='gc '+(((r+c)%2===0)?'l':'d');
    el.dataset.r=r;el.dataset.c=c;
    // LE PLATEAU SE JOUE AU CLAVIER. Un jeu au tour par tour est l'un des
    // rares genres réellement jouables sans souris et sans voir parfaitement,
    // et celui-ci ne l'était pas du tout : aucune case n'était atteignable
    // autrement qu'au pointeur, et rien n'était annoncé.
    // Une seule case est tabulable à la fois (« roving tabindex ») : sans
    // cela, il faudrait soixante-quatre tabulations pour traverser le
    // plateau. Les flèches déplacent le curseur, Entrée joue.
    el.setAttribute('role','gridcell');
    el.tabIndex=(vi===0&&vc===0)?0:-1;
    el.dataset.vi=vi;el.dataset.vc=vc;
    // LES REPÈRES SONT DANS LE PLATEAU. Une colonne de chiffres à gauche et
    // une ligne de lettres en bas consommaient ~40 px que le plateau — dont
    // la dimension est bornée par la hauteur — peut prendre. Ils vont dans
    // les cases de bord, comme le veut la convention : le chiffre dans
    // l'angle supérieur gauche de la première colonne affichée, la lettre
    // dans l'angle inférieur droit de la dernière rangée affichée.
    let coord='';
    if(vc===0)coord+='<span class="gc-rank">'+(8-r)+'</span>';
    if(vi===7)coord+='<span class="gc-file">'+FILES[c]+'</span>';
    if(coord)el.innerHTML=coord;
    bindBoardCell(el,r,c);
    boardEl.appendChild(el);
    _boardCells.push(el);
    _cellAt[r][c]=el;
  }
  boardLayer(boardEl);
}

// Écouteurs d'une case : posés UNE FOIS pour la vie de la case. Ils lisent
// donc GS au moment de l'événement et non une partie capturée dans une
// fermeture — les cases survivent d'une partie à l'autre, une référence figée
// piloterait le plateau d'hier.
function bindBoardCell(el,r,c){
  const playable=gs=>gs&&!gs.gameOver&&gs.turn===(gs.playerColor||'w');
  // On peut PRENDRE une pièce en main même quand ce n'est pas à nous : le
  // glissé pose alors un prémouvement au lieu de jouer.
  const grabbable=gs=>gs&&!gs.gameOver&&(playable(gs)||premoveAllowed(gs));
  const mine=gs=>{
    const cell=gs&&gs.board&&gs.board[r]&&gs.board[r][c];
    return !!cell&&cell.color===(gs.playerColor||'w');
  };

  el.addEventListener('click',()=>{
    const gs=GS;if(!gs)return;
    if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
    // CE N'EST PAS ENCORE À NOUS : le geste n'est plus perdu, il devient un
    // PRÉMOUVEMENT (voir la section du même nom plus bas).
    if(gs.gameOver)return;
    if(gs.turn!==(gs.playerColor||'w')){premoveClick(r,c,gs);return;}
    handleGameClick(r,c,gs);
  });

  // Le relâchement du doigt se résout ICI, sur la case touchée. Le
  // contournement historique (voir l'en-tête de section) n'est plus
  // nécessaire — la case n'est plus détachée en cours de geste — mais la
  // logique reste : un appui sur une pièce que ce même geste vient de
  // sélectionner ne doit pas repasser par handleGameClick, qui la verrait
  // sélectionnée et la désélectionnerait aussitôt.
  el.addEventListener('touchend',e=>{
    const gs=GS;if(!gs)return;
    // L'appui long vient d'ouvrir la fiche de la pièce : le relâchement ne
    // doit pas, en plus, la sélectionner et refermer la fiche.
    if(typeof longPressJustFired==='function'&&longPressJustFired())return;
    if(gs.gameOver)return;
    if(dragState){
      e.preventDefault();
      const t=e.changedTouches[0];
      if(t)endDrag(t.clientX,t.clientY);
      return;
    }
    if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
    e.preventDefault();
    if(gs.turn!==(gs.playerColor||'w')){premoveClick(r,c,gs);return;}
    handleGameClick(r,c,gs);
  },{passive:false});

  // LE GLISSÉ-DÉPOSÉ PART DE LA CASE, plus de la pièce : la couche des
  // pièces ne reçoit aucun clic (pointer-events:none), c'est ce qui garantit
  // que le hit-testing porte toujours sur une grille immobile.
  el.addEventListener('mousedown',e=>{
    const gs=GS;
    if(!gs||e.button!==0||gs.historyView!==null)return;
    if(!grabbable(gs)||!mine(gs))return;
    startDrag(r,c,gs,e.clientX,e.clientY);
  });
  el.addEventListener('touchstart',e=>{
    const gs=GS;
    if(!gs||gs.historyView!==null)return;
    if(!grabbable(gs)||!mine(gs))return;
    const t=e.touches[0];
    if(t)startDrag(r,c,gs,t.clientX,t.clientY);
  },{passive:true});

  // Le survol grossit la pièce. Il vivait sur .gc-piece:hover ; la couche
  // n'étant plus survolable, c'est la case qui porte l'état — et elle est de
  // toute façon la bonne cible, on survole une case, pas un dessin.
  el.addEventListener('mouseenter',()=>{const n=pieceNodeAt(r,c);if(n)n.classList.add('gc-hover');});
  el.addEventListener('mouseleave',()=>{const n=pieceNodeAt(r,c);if(n)n.classList.remove('gc-hover');});

  bindBoardKeys(el,r,c);
  el.addEventListener('contextmenu',e=>{if(GS)showCtxMenu(e,r,c,GS);});
  // Écrans tactiles : appui long = clic droit (js/main.js::bindLongPress).
  if(typeof bindLongPress==='function')bindLongPress(el,e=>{if(GS)showCtxMenu(e,r,c,GS);});
}

function pieceNodeAt(r,c){return (_pieceAt[r]&&_pieceAt[r][c])||null;}

// Le nom parlé d'une case : « e4, Cavalier Primordial blanc ». C'est la seule
// façon de savoir ce qu'on survole quand on ne voit pas le plateau — et c'est
// aussi ce qui s'affiche en infobulle au pointeur.
function cellLabel(gs,r,c){
  const coord=FILES[c]+(8-r);
  const cell=gs.board&&gs.board[r]&&gs.board[r][c];
  if(!cell)return coord+', case vide';
  const p=(typeof PIECES!=='undefined')?PIECES.find(x=>x.id===cell.pieceId):null;
  const nom=p?p.name:(cell.pieceId||'').replace('std-','');
  const camp=cell.color==='w'?'blanc':'noir';
  return coord+', '+nom+' '+camp;
}

// Déplace le curseur clavier d'une case, en coordonnées VISUELLES : la flèche
// droite va à droite de l'écran, que le joueur ait les Blancs ou les Noirs.
function boardMoveFocus(from,dvi,dvc){
  if(!_boardCells)return;
  const vi=Math.max(0,Math.min(7,(+from.dataset.vi)+dvi));
  const vc=Math.max(0,Math.min(7,(+from.dataset.vc)+dvc));
  const next=_boardCells[vi*8+vc];
  if(!next||next===from)return;
  _boardCells.forEach(el=>{el.tabIndex=-1;});
  next.tabIndex=0;
  next.focus();
}

function bindBoardKeys(el,r,c){
  el.addEventListener('keydown',e=>{
    const gs=GS;if(!gs)return;
    const pas={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];
    if(pas){e.preventDefault();boardMoveFocus(el,pas[0],pas[1]);return;}
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){
      e.preventDefault();
      if(gs.gameOver||gs.turn!==(gs.playerColor||'w'))return;
      if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
      handleGameClick(r,c,gs);
      return;
    }
    // Échap désélectionne : au clavier, il n'y a pas de « cliquer à côté ».
    if(e.key==='Escape'&&gs.selected){
      e.preventDefault();
      gs.selected=null;gs.legalMoves=[];renderGame(gs);
    }
  });
}

// Met à jour les classes des 64 cases. Aucune n'est recréée : c'est tout
// l'intérêt, et c'est ce qui rend un rendu quasi gratuit.
function paintBoardCells(gs){
  if(!_boardCells)return;
  const b=gs.board;
  const playerCol=gs.playerColor||'w';
  const checkedColor=isInCheckSimple(gs.turn,b)?gs.turn:null;
  for(const el of _boardCells){
    const r=+el.dataset.r,c=+el.dataset.c;
    const cell=b[r][c];
    let cls='gc '+(((r+c)%2===0)?'l':'d');
    if(gs.selected&&gs.selected.r===r&&gs.selected.c===c)cls+=' sel';
    const isAvail=gs.legalMoves.some(m=>m.r===r&&m.c===c&&!m.stayPut);
    const hasEnemy=cell&&isAvail&&cell.color!==gs.turn;
    if(isAvail&&hasEnemy)cls+=' avail-cap';
    else if(isAvail)cls+=' avail';
    // Départ et arrivée reçoivent deux marques DIFFÉRENTES : teintées à
    // l'identique, les deux cases ne disaient pas le sens du coup.
    if(gs.lastMove){
      if(gs.lastMove.from.r===r&&gs.lastMove.from.c===c)cls+=' lm-from';
      else if(gs.lastMove.to.r===r&&gs.lastMove.to.c===c)cls+=' lm-to';
    }
    if(gs.lastMove&&gs.lastMove.capture&&gs.lastMove.to.r===r&&gs.lastMove.to.c===c)cls+=' cap-flash';
    // Le roi en échec est signalé sur le plateau lui-même : la barre de
    // statut seule passait inaperçue au milieu d'une partie rapide.
    if(cell&&(cell.isKing||cell.type==='k')&&cell.color===gs.turn&&checkedColor===gs.turn)cls+=' gc-check';
    // Le curseur « main ouverte » vivait sur la pièce ; il vit sur la case,
    // seule chose que le pointeur peut désormais atteindre.
    // Le curseur « main ouverte » reste offert pendant le tour adverse : on
    // peut y prendre une pièce en main, elle inscrit un prémouvement.
    if(cell&&cell.color===playerCol&&!gs.gameOver&&(gs.turn===playerCol||premoveAllowed(gs)))cls+=' gc-holds';
    // LE PRÉMOUVEMENT A SES PROPRES MARQUES, et elles ne ressemblent à
    // aucune autre : ce qu'elles montrent n'est pas encore joué, et peut
    // très bien ne jamais l'être. Elles sont donc violettes là où tout le
    // reste du plateau est vert (l'action en cours) ou orange (la menace).
    if(gs.pmSel&&gs.pmSel.r===r&&gs.pmSel.c===c)cls+=' pm-sel';
    else if(gs.pmMoves&&gs.pmMoves.some(m=>m.r===r&&m.c===c&&!m.stayPut))cls+=' pm-avail';
    if(gs.premove){
      if(gs.premove.from.r===r&&gs.premove.from.c===c)cls+=' pm-from';
      else if(gs.premove.to.r===r&&gs.premove.to.c===c)cls+=' pm-to';
    }
    if(el.className!==cls)el.className=cls;
    // Le libellé parlé suit le plateau : sans ça, une case annoncée « vide »
    // le resterait après qu'une pièce s'y est posée.
    const lab=cellLabel(gs,r,c)+(isAvail?(hasEnemy?', prise possible':', déplacement possible'):'');
    if(el.getAttribute('aria-label')!==lab)el.setAttribute('aria-label',lab);
    el.setAttribute('aria-selected',(gs.selected&&gs.selected.r===r&&gs.selected.c===c)?'true':'false');
  }
}

// LE DIFF. C'est ici que tout se joue : on parcourt le plateau, on retrouve
// chaque pièce par son id, et on ne touche que ce qui a changé.
function syncPieces(gs,boardEl,flipped,board){
  const b=board||gs.board;
  const layer=boardLayer(boardEl);
  const seen=new Set();
  const at=[];
  for(let r=0;r<8;r++)at.push(new Array(8).fill(null));

  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const cell=b[r][c];
    if(!cell)continue;
    // Toute pièce doit avoir une identité stable. buildGameBoard en pose une
    // à chacune ; un plateau construit ailleurs (bataille scriptée du
    // tutoriel) pourrait ne pas le faire, on la lui donne alors une bonne
    // fois — l'objet vit tout le reste de la partie, l'identité tiendra.
    if(!cell.id)cell.id='auto'+(_autoPieceId++);
    const id=cell.id;
    seen.add(id);
    const art=cell.pieceId+':'+cell.color;
    const vi=flipped?7-r:r, vc=flipped?7-c:c;
    const tf='translate3d('+(vc*100)+'%,'+(vi*100)+'%,0)';

    let node=_pieceNodes.get(id);
    if(!node){
      node=document.createElement('div');
      node.className='gc-piece gc-born';
      node.dataset.pid=id;
      node.innerHTML='<span class="gc-art">'+pieceSVG(cell.pieceId,cell.color)+'</span>';
      node._art=art;
      // LE TRANSFORM EST POSÉ AVANT L'INSERTION. Une transition ne se
      // déclenche jamais sur la première résolution de style d'un élément :
      // en le plaçant après coup, les 32 pièces glisseraient depuis le coin
      // supérieur gauche au début de chaque partie.
      node.style.transform=tf;
      node._tf=tf;
      layer.appendChild(node);
      _pieceNodes.set(id,node);
      setTimeout(()=>node.classList.remove('gc-born'),BOARD_MOVE_MS);
    }else{
      if(node._art!==art){
        // Promotion : même pièce (même id), autre créature. Le nœud reste,
        // seul son dessin change — le pion ne disparaît pas pour laisser la
        // place à une Dame, il DEVIENT une Dame.
        const artEl=node.querySelector('.gc-art');
        if(artEl){artEl.innerHTML=pieceSVG(cell.pieceId,cell.color);artEl.classList.add('gc-morph');
          setTimeout(()=>artEl.classList.remove('gc-morph'),320);}
        node._art=art;
      }
      // LA POSITION VOULUE EST RETENUE SUR LE NŒUD, ET RELUE SUR LUI. Elle
      // était comparée à `node.style.transform`, que le navigateur REND
      // NORMALISÉ : on écrit « translate3d(12.5%,0%,0) » et on relit
      // « translate3d(12.5%, 0%, 0px) ». Les deux chaînes ne sont jamais
      // égales, la condition était donc toujours vraie — le diff de la couche
      // des pièces, dont c'est toute la raison d'être, « déplaçait » les 32
      // pièces à chaque rendu, y compris pour un simple survol. Invisible
      // tant que le déplacement ne portait qu'un z-index ; le jour où il
      // porte un geste, le plateau entier se met à tressauter.
      if(node._tf!==tf){
        node._tf=tf;
        // Une pièce qui bouge passe au-dessus des autres le temps du
        // glissement : sinon, en capturant, elle disparaît sous sa victime.
        node.style.transform=tf;
        node.classList.add('gc-moving');
        clearTimeout(node._movTid);
        node._movTid=setTimeout(()=>node.classList.remove('gc-moving'),BOARD_MOVE_MS+40);
        // TOUTES LES PIÈCES GLISSAIENT PAREIL. Un cavalier traversait la case
        // qui le bloque comme s'il n'existait pas, et une tour posait son
        // coup avec la même mollesse qu'un pion : le mouvement ne disait plus
        // rien de la créature qui le fait.
        //
        // Un déplacement qui n'est ni une ligne, ni une colonne, ni une
        // diagonale ne peut PAS être un glissement — c'est un saut, par
        // définition, et c'est vrai de toute créature qui viendra. La pièce
        // s'élève donc au-dessus du plateau et retombe, sans que le module
        // ait à connaître un seul identifiant. Les autres, elles, marquent
        // seulement l'ARRIVÉE : un poids qui se pose.
        markMoveStyle(node,+node.dataset.r,+node.dataset.c,r,c,cell.pieceId,flipped);
      }
    }

    const key=r+','+c;
    // La créature portée par le nœud, retenue pour l'instant où il MOURRA :
    // la boucle des disparues, plus bas, n'a plus le plateau sous les yeux et
    // ne saurait pas de quelle classe teinter sa poussière.
    node._pid=cell.pieceId;
    node.classList.toggle('pc-para',!!(gs.medusaParalyzed&&gs.medusaParalyzed.has(key)));
    node.classList.toggle('gc-anchored',!!(gs.anchored&&gs.anchored.has(key)));
    // ---- LES POUVOIRS PASSIFS, PORTÉS PAR LA PIÈCE ELLE-MÊME ----------
    // Trois pouvoirs ne se déclenchent jamais : ils sont VRAIS tant que la
    // créature vit. La Cuirasse du Preux Chevalier, la Domination du Grand
    // Maître, la Foi Inébranlable du Prêtre sur ses voisines. Un pouvoir
    // permanent ne peut pas être un effet jetable — il n'a pas d'instant. Il
    // devient donc un ÉTAT sur la pièce, comme la pétrification de la Méduse
    // (.pc-para) et l'ancrage du Garde de Pierre (.gc-anchored) avant lui.
    //
    // C'est ce qui transforme trois règles invisibles en trois choses qu'on
    // VOIT sur le plateau — et une partie où l'on comprend pourquoi un coup
    // est refusé est une partie qu'on a envie de rejouer.
    //
    // Aucune de ces classes n'anime quoi que ce soit : ce sont des ombres
    // portées statiques. Trente-deux pièces qui palpiteraient en permanence
    // coûteraient une image sur deux à un téléphone d'entrée de gamme, et
    // rendraient le plateau illisible bien avant.
    node.classList.toggle('pc-cuirasse',cell.pieceId==='preux-chevalier');
    node.classList.toggle('pc-dominant',cell.pieceId==='grand-maitre');
    node.classList.toggle('pc-warded',
      !!(gs.pretreProtected&&gs.pretreProtected.has(cell.color+':'+key)));
    node.dataset.r=r;node.dataset.c=c;
    at[r][c]=node;
  }

  // Les disparues : capturées, mangées par le Typhon, effacées par la
  // Banshee. Elles ne s'évanouissent pas d'un coup — elles ont désormais une
  // agonie, c'est la moitié de la sensation d'une prise.
  _pieceNodes.forEach((node,id)=>{
    if(seen.has(id))return;
    _pieceNodes.delete(id);
    node.classList.add('gc-dying');
    // LA POUSSIÈRE EST POSÉE ICI, ET C'EST CE QUI LA REND UNIVERSELLE. Ce
    // point de passage voit TOUTE pièce qui quitte le plateau, sans savoir
    // pourquoi : la prise ordinaire, les victimes collatérales du Typhon, la
    // case effacée par le Dresseur, et tout pouvoir qui viendra. Le module
    // d'effets n'a donc pas un seul pouvoir à connaître (js/combat-fx.js).
    if(typeof fxPuff==='function')fxPuff(+node.dataset.r,+node.dataset.c,node._pid);
    setTimeout(()=>{if(node.parentNode)node.parentNode.removeChild(node);},BOARD_DEATH_MS);
  });

  _pieceAt=at;
}

// ----------------------------------------------------------------
// LE GESTE D'UNE CRÉATURE : chaque pièce se déplace comme elle-même
// ----------------------------------------------------------------
// Toutes les pièces partageaient DEUX gestes : le SAUT quand le déplacement
// n'était ni une ligne, ni une colonne, ni une diagonale, et l'ATTERRISSAGE
// partout ailleurs. C'était déjà mieux qu'un glissement uniforme, mais ça ne
// disait que la GÉOMÉTRIE du coup — jamais QUI le joue. Un Éléphant de guerre
// qui charge deux cases et une Méduse qui dérive d'une diagonale avaient
// rigoureusement le même mouvement.
//
// Chaque créature a maintenant son geste. C'est la seule manière d'animer une
// pièce qui ne coûte RIEN : tout est en `transform` et en `opacity`, les deux
// seules propriétés que le compositeur sait jouer sans repeindre. Pas un
// fichier à charger, pas un maillage, pas une texture — et le geste survit à
// n'importe quel dessin de pièce, présent ou futur.
//
// -- LA RÈGLE QUI TIENT TOUT LE TABLEAU ---------------------------------
// L'ARC DOIT TOUCHER TERRE À BOARD_MOVE_MS. La POSITION est portée par la
// transition de .gc-piece (200 ms) ; le geste, lui, est une animation
// indépendante. Si elle retombe APRÈS 200 ms, la pièce est déjà arrivée
// pendant qu'elle redescend, et le geste se lit comme un sursaut sur place.
// Chaque animation de [BOARD-MOTION] porte donc en commentaire sa durée ET le
// pourcentage auquel elle touche terre : le produit des deux vaut 200 ms.
//
// -- `air` : LA CRÉATURE SAIT-ELLE SAUTER ELLE-MÊME ? ---------------------
// Un déplacement qui n'est ni aligné ni diagonal ENJAMBE, par définition. Un
// geste qui reste au sol (la poussée de la Tour, le pas du Preux Chevalier)
// mentirait sur un tel coup : ces créatures-là repassent alors au saut
// générique. Celles dont le geste emporte déjà la pièce — la charge, le
// galop, la phase, le tourbillon — le gardent, saut ou pas.
const MOVE_GESTURE={
  // BRUTES. Le poids se lit à l'arrivée : ce sont les seules créatures dont
  // l'écrasement dépasse ce qu'on remarque, et c'est tout leur propos.
  'dresseur-elephant': {cls:'gc-charge',  air:true},   // il s'arc-boute, puis il part
  'preux-chevalier':   {cls:'gc-stomp',   air:false},  // le pas d'un homme en armure
  'garde-pierre':      {cls:'gc-stomp',   air:false},
  'garde-eau':         {cls:'gc-flow',    air:true},   // il se verse d'une case à l'autre
  'garde-feu':         {cls:'gc-flicker', air:true},   // il vacille au lieu de glisser
  'fourmi':            {cls:'gc-scuttle', air:true},   // pressee, minuscule, saccadee

  // SORCIERS. Aucun ne touche vraiment le sol : ils se déplacent par un autre
  // moyen que la marche, et le geste est ce qui le dit sans une ligne de texte.
  'typhon':            {cls:'gc-spin',    air:true},   // il EST le tourbillon
  'banshee':           {cls:'gc-phase',   air:true},   // elle s'efface et se repose ailleurs
  'meduse':            {cls:'gc-drift',   air:true},   // elle ondule, elle ne marche pas
  'pretre':            {cls:'gc-solemn',  air:false},  // lent, droit, sans écrasement

  // GÉNÉRAUX ET MONARQUES. La retenue est leur signature : ils s'élèvent d'un
  // rien et se posent d'aplomb. Une pièce qui vaut treize points n'a pas
  // besoin de s'agiter pour qu'on la regarde.
  'roi':               {cls:'gc-regal',   air:false},
  'empereur':          {cls:'gc-regal',   air:false},
  'dame':              {cls:'gc-regal',   air:false},
  'amazone':           {cls:'gc-regal',   air:false},
  'grand-maitre':      {cls:'gc-regal',   air:false},
  'chevaucheur-rhinoceros':{cls:'gc-gallop',air:true}, // deux temps, comme un galop

  // PRIMORDIALES. Le vocabulaire de base du plateau, et leurs gestes sont les
  // trois façons élémentaires d'aller d'une case à l'autre : enjamber,
  // pousser en ligne, filer en biais.
  'cavalier-primordial':{cls:'gc-leap',   air:true},
  'tour-primordiale':  {cls:'gc-slam',    air:false},  // elle ne s'élève jamais
  'fou-primordial':    {cls:'gc-glide',   air:false},  // il s'incline dans sa diagonale
};
// Toutes les classes de geste, pour le nettoyage : un nom oublié ici et deux
// gestes se superposent sur la même pièce au coup suivant.
const GESTURE_CLASSES=['gc-leap','gc-land','gc-charge','gc-stomp','gc-flow','gc-flicker',
  'gc-scuttle','gc-spin','gc-phase','gc-drift','gc-solemn','gc-regal','gc-gallop',
  'gc-slam','gc-glide'];

// Le geste du déplacement. Il porte sur .gc-art et jamais sur .gc-piece, dont
// le transform tient la POSITION — c'est la règle de la couche des pièces, et
// la seule chose à ne pas casser ici.
//
// `flipped` n'est pas un détail : l'inclinaison se prend dans le sens OÙ LA
// PIÈCE PART À L'ÉCRAN. Calculée sur les coordonnées du plateau, une charge
// vers la droite pencherait à gauche pour le joueur des Noirs.
function markMoveStyle(node,fromR,fromC,toR,toC,pieceId,flipped){
  const art=node.querySelector('.gc-art');
  if(!art)return;
  const dr=Math.abs(toR-fromR),dc=Math.abs(toC-fromC);
  const leap=dr>0&&dc>0&&dr!==dc;
  const g=MOVE_GESTURE[pieceId];
  // Sans entrée au tableau, la pièce garde exactement les deux gestes
  // d'avant : le jeu reste jouable si une créature est ajoutée sans geste.
  const cls=(!g||(leap&&!g.air))?(leap?'gc-leap':'gc-land'):g.cls;

  // L'inclinaison, en sens ÉCRAN : -1 vers la gauche, +1 vers la droite, 0
  // pour un coup purement vertical, qu'aucun geste ne doit faire pencher.
  const vdc=flipped?(fromC-toC):(toC-fromC);
  art.style.setProperty('--glean',vdc>0?'1':(vdc<0?'-1':'0'));
  // La DISTANCE, de 0 à 1 sur les sept cases du plateau. Une charge de deux
  // cases et une travée de Dame d'un bout à l'autre ne s'élancent pas pareil :
  // c'est ce qui évite qu'un geste ample paraisse ridicule sur une case.
  const span=Math.max(dr,dc);
  art.style.setProperty('--gspan',Math.min(1,span/7).toFixed(2));

  art.classList.remove.apply(art.classList,GESTURE_CLASSES);
  void art.offsetWidth;                     // redémarre sur deux coups d'affilée
  art.classList.add(cls);
  clearTimeout(art._gestTid);
  art._gestTid=setTimeout(()=>{
    art.classList.remove.apply(art.classList,GESTURE_CLASSES);
  },BOARD_MOVE_MS+320);
}

function renderGame(gs){
  syncGameButtons(gs);
  if(gs.historyView!==null){updateHistoryNav();return;}
  const boardEl=document.getElementById('game-board');if(!boardEl)return;
  const playerCol=gs.playerColor||'w';
  const flipped=playerCol==='b'; // échiquier retourné si le joueur joue les noirs

  ensureBoardCells(gs,boardEl,flipped);
  // Les effets ne DEVINENT pas l'orientation, ils la reçoivent : un joueur
  // des noirs verrait sinon ses éclats sur la case symétrique de la prise.
  if(typeof fxSetFlipped==='function')fxSetFlipped(flipped);
  paintBoardCells(gs);
  syncPieces(gs,boardEl,flipped);
  if(typeof applyBoardSkin==='function')applyBoardSkin();

  buildGameLabels(gs);updateCaptured(gs);updateHistoryNav();renderClocks(gs);updateTurnBars(gs);
  // Le bouton « Chat » n'existe qu'en ligne, et disparaît dès que la partie
  // est finie : on ne parle plus à quelqu'un qui n'est plus là.
  if(typeof mpRefreshChat==='function')mpRefreshChat();
  // La partie est maintenant à l'écran : c'est le seul moment où mesurer ce
  // qui entoure le plateau veut dire quelque chose. On repasse une image plus
  // tard, parce qu'au premier rendu rien n'a sa taille définitive (les
  // polices se posent, le journal se remplit) — et --game-chrome borne la
  // taille du plateau, une valeur trop basse le laisserait déborder.
  gameWatchChrome();
  requestAnimationFrame(gameSyncChrome);
  clearTimeout(_chromeSettleTid);
  _chromeSettleTid=setTimeout(gameSyncChrome,260);
}

// Le bandeau du joueur au trait s'allume : indication permanente de « à qui
// de jouer », lisible du coin de l'oeil sans lire la barre de statut.
function updateTurnBars(gs){
  const me=document.getElementById('human-player-bar');
  const opp=document.getElementById('ai-player-bar');
  if(!me||!opp)return;
  const pc=gs.playerColor||'w';
  const myTurn=!gs.gameOver&&gs.turn===pc;
  me.classList.toggle('gp-turn',myTurn);
  opp.classList.toggle('gp-turn',!gs.gameOver&&gs.turn!==pc);
}

// Affiche les deux badges d'horloge (masqués si gs.clockMs===0 = illimité).
function renderClocks(gs){
  const hEl=document.getElementById('human-player-clock');const aEl=document.getElementById('ai-player-clock');
  if(!hEl||!aEl)return;
  if(!gs.clockMs){hEl.style.display='none';aEl.style.display='none';return;}
  const fmt=ms=>{const s=Math.max(0,Math.ceil(ms/1000));const m=Math.floor(s/60);const ss=s%60;return m+':'+(ss<10?'0':'')+ss;};
  const playerCol=gs.playerColor||'w';const aiCol=gs.aiColor||'b';
  const hTime=playerCol==='w'?gs.timeWhite:gs.timeBlack;
  const aTime=aiCol==='w'?gs.timeWhite:gs.timeBlack;
  hEl.style.display='';aEl.style.display='';
  hEl.textContent=fmt(hTime);aEl.textContent=fmt(aTime);
  // Sous 30 s la pendule passe en rouge et pulse : c'est le seul moment ou
  // elle doit reclamer l'attention.
  hEl.classList.toggle('clock-low',hTime<30000&&!gs.gameOver);
  aEl.classList.toggle('clock-low',aTime<30000&&!gs.gameOver);
}

// ----------------------------------------------------------------
// LA PLACE QUE PREND TOUT CE QUI N'EST PAS LE PLATEAU
// ----------------------------------------------------------------
// L'échiquier est borné par la HAUTEUR d'écran sur un téléphone, et la page
// réservait pour le reste une constante — 200 px — qui était fausse : il y a
// le chrome du haut, les deux bandeaux de joueur, la barre de statut, les
// boutons de partie et la zone sous le plateau, qui GRANDIT quand on y ouvre
// le journal ou la discussion. Plus de 400 px sur un petit écran, et
// « Abandonner » finissait hors de l'écran.
//
// On mesure donc la somme réelle et on la publie en variable CSS : ce qu'il y
// a AU-DESSUS du plateau (sa position à l'écran) plus ce qu'il y a EN DESSOUS
// (du bas du plateau au bas du dernier bouton), plus un peu d'air. La boucle
// converge d'un seul tour : réduire le plateau ne change rien à la hauteur de
// ce qui l'entoure.
//
// LA MESURE SE PREND QUAND LA PARTIE EST À L'ÉCRAN, PAS AU CHARGEMENT. Un
// premier jet observait la page dès DOMContentLoaded : à cet instant
// #page-game est masquée et tout mesure zéro. D'où l'appel depuis
// renderGame(), c'est-à-dire à chaque rendu de partie, plus au
// redimensionnement, à la rotation et à l'ouverture d'un panneau.
function gameSyncChrome(){
  const board=document.getElementById('game-board');
  const btns=document.querySelector('.game-btns');
  const wrap=document.querySelector('.game-wrap');
  const main=document.querySelector('.game-main');
  if(!board||!btns||!wrap||!main)return;
  const b=board.getBoundingClientRect();
  if(b.height<=0)return;                      // la partie n'est pas à l'écran
  // ON MESURE DES HAUTEURS, PLUS UNE DISTANCE. « Abandonner » est collé au
  // bas de l'écran (margin-top:auto) : entre la zone sous le plateau et lui,
  // il y a désormais du VIDE, dont la taille dépend de celle du plateau. Le
  // mesurer comme un encombrement rendait le calcul récursif — plus le
  // plateau rétrécissait, plus le vide grandissait, plus le plateau
  // rétrécissait, jusqu'au plancher de 200 px.
  //
  // Ce qui suit ne somme donc que ce qui OCCUPE réellement de la place : la
  // hauteur propre de chaque élément sous le plateau, les écarts de la
  // colonne, et le rembourrage du bas. Le vide, lui, est justement ce qu'on
  // cherche à laisser.
  const cs=getComputedStyle(wrap);
  const gap=parseFloat(cs.rowGap||cs.gap)||0;
  const padB=parseFloat(cs.paddingBottom)||0;
  const m=main.getBoundingClientRect();
  let below=Math.max(0,m.bottom-b.bottom);    // repères de colonnes, marges internes
  let n=0;
  for(const el of [document.getElementById('human-player-bar'),
                   document.getElementById('game-status'),
                   document.getElementById('game-under'),
                   btns]){
    if(!el||el.offsetParent===null)continue;
    below+=el.getBoundingClientRect().height;
    n++;
  }
  below+=gap*n+padB;
  const chrome=Math.round(b.top+below+12);
  if(chrome>0&&chrome<3000)
    document.documentElement.style.setProperty('--game-chrome',chrome+'px');
}
let _chromeRO=null,_chromeSettleTid=null;
function gameWatchChrome(){
  const under=document.getElementById('game-under');
  if(!under)return;
  // Le ResizeObserver rattrape ce que renderGame ne voit pas : une police
  // système agrandie, un panneau qui s'ouvre, un coup qui rallonge la barre.
  if(!_chromeRO&&typeof ResizeObserver==='function'){
    _chromeRO=new ResizeObserver(gameSyncChrome);
    _chromeRO.observe(under);
  }
  gameSyncChrome();
}
document.addEventListener('DOMContentLoaded',gameWatchChrome);
window.addEventListener('resize',gameSyncChrome);
window.addEventListener('orientationchange',()=>setTimeout(gameSyncChrome,120));

function buildGameLabels(gs){
  // Les repères vivent maintenant DANS les cases de bord : il n'y a plus de
  // bande extérieure à reconstruire. La fonction reste appelée par plusieurs
  // modules et au redimensionnement ; elle n'a plus rien à faire.
}

// Chaque bandeau montre les pieces que CE joueur a prises, plus son avantage
// materiel : c'est l'information utile, alors que deux listes « blanches » et
// « noires » dans une colonne obligeaient a faire la soustraction de tete.
function updateCaptured(gs){
  const meEl=document.getElementById('cap-me');const oppEl=document.getElementById('cap-opp');
  if(!meEl||!oppEl)return;
  const pc=gs.playerColor||'w';
  // capturedW = pieces BLANCHES capturees, donc prises par les Noirs.
  const takenByMe=pc==='w'?gs.capturedB:gs.capturedW;
  const takenByOpp=pc==='w'?gs.capturedW:gs.capturedB;
  const val=list=>list.reduce((t,x)=>t+(pieceMaterialValue(x.id)||0),0);
  const adv=val(takenByMe)-val(takenByOpp);
  meEl.innerHTML=drawCaptured(takenByMe)+(adv>0?'<span class="gp-adv">+'+adv+'</span>':'');
  oppEl.innerHTML=drawCaptured(takenByOpp)+(adv<0?'<span class="gp-adv">+'+(-adv)+'</span>':'');
}
// LES PRISES SE LISENT EN UN COUP D'ŒIL, ET TIENNENT DANS LEUR PLACE.
//
// Elles étaient posées dans l'ordre où elles tombaient, une par une, chacune
// prenant sa largeur. Deux conséquences, et les deux sont des pertes sèches :
//
// · L'ORDRE NE DISAIT RIEN. La prise la plus lourde de la partie — la seule
//   qu'on cherche des yeux — pouvait se trouver n'importe où dans la file,
//   entre deux pions. On range donc par valeur DÉCROISSANTE : ce qui compte
//   est à gauche, à la même place à chaque partie.
// · HUIT PIONS PRENAIENT LA LARGEUR DE HUIT PIÈCES, pour une information qui
//   tient en un dessin et un nombre. Sur un bandeau de téléphone, les
//   dernières prises finissaient sous la pendule, invisibles. Les exemplaires
//   d'une même créature se CHEVAUCHENT donc, en pile : on voit qu'il y en a
//   plusieurs sans avoir à compter, et la pile coûte un tiers de largeur par
//   exemplaire au lieu d'une pleine. Au-delà de trois, la pile cesse de
//   grandir et un « ×N » prend le relais — trois formes empilées se
//   distinguent encore, huit ne se distinguent plus.
const CAP_STACK_MAX=3;
function drawCaptured(list){
  if(!list||!list.length)return '';
  // Regroupement par créature ET par couleur : deux camps peuvent aligner la
  // même pièce, et ce ne sont pas les mêmes prises.
  const groups=new Map();
  for(const x of list){
    const k=x.id+':'+x.color;
    if(!groups.has(k))groups.set(k,{id:x.id,color:x.color,n:0});
    groups.get(k).n++;
  }
  const arr=[...groups.values()];
  // Le tri est STABLE à valeur égale (identifiant), sinon deux rendus
  // successifs pourraient réordonner la même rangée sous les yeux du joueur.
  arr.sort((a,b)=>{
    const d=pieceMaterialValue(b.id)-pieceMaterialValue(a.id);
    return d!==0?d:(a.id<b.id?-1:a.id>b.id?1:0);
  });
  return arr.map(g=>{
    const shown=Math.min(g.n,CAP_STACK_MAX);
    let h='<span class="cap-stack'+(g.n>1?' cap-multi':'')+'">';
    for(let i=0;i<shown;i++)h+=pieceIcon(g.id,g.color,1.3);
    if(g.n>CAP_STACK_MAX)h+='<span class="cap-n">×'+g.n+'</span>';
    return h+'</span>';
  }).join('');
}

// Valeur « points d'armee » (celle du builder), pas la valeur interne de
// l'IA : c'est celle que le joueur connait, affichee sur chaque carte.
function pieceMaterialValue(id){
  if(id==='std-pawn')return 1;
  if(id==='std-r')return 5;
  if(id==='std-n'||id==='std-b')return 3;
  const p=PIECES.find(x=>x.id===id);
  return p?p.value:1;
}

// ----------------------------------------------------------------
// DRAG & DROP
// ----------------------------------------------------------------
let dragState=null;const dragGhost=document.getElementById('drag-ghost');

function getBoardCell(clientX,clientY,gs){
  const boardEl=document.getElementById('game-board');if(!boardEl)return null;
  const rect=boardEl.getBoundingClientRect();
  const x=clientX-rect.left,y=clientY-rect.top;
  if(x<0||y<0||x>rect.width||y>rect.height)return null;
  const flipped=gs&&gs.playerColor==='b';
  const vi=Math.floor(y/(rect.height/8));
  const vc=Math.floor(x/(rect.width/8));
  const r=flipped?7-vi:vi;
  const c=flipped?7-vc:vc;
  return inB(r,c)?{r,c}:null;
}

function startDrag(r,c,gs,clientX,clientY){
  const b=gs.board;const cell=b[r][c];if(!cell)return;
  // Prendre en main pendant le tour adverse, c'est préparer un prémouvement :
  // le geste est le même, seule la destination du résultat change.
  const pre=gs.turn!==(gs.playerColor||'w');
  const alreadySelected=pre
    ?!!(gs.pmSel&&gs.pmSel.r===r&&gs.pmSel.c===c)
    :!!(gs.selected&&gs.selected.r===r&&gs.selected.c===c);
  // Le glissé de prémouvement propose les mêmes cases que le clic : celles
  // de la CRÉATURE (plateau vide), pas celles de la position d'avant le coup
  // adverse — voir premoveTargets.
  if(pre){gs.pmSel={r,c};gs.pmMoves=premoveTargets(r,c,gs);}
  else{gs.selected={r,c};gs.legalMoves=getLegalMoves(b,r,c,gs);}
  dragState={fromR:r,fromC:c,gs,moved:false,startX:clientX,startY:clientY,alreadySelected,pre};
  dragGhost.innerHTML=pieceSVG(cell.pieceId,cell.color);
  dragGhost.style.left=clientX+'px';dragGhost.style.top=clientY+'px';
  // PRENDRE UNE PIÈCE EN MAIN NE FAISAIT AUCUN BRUIT. C'est le geste le plus
  // fréquent du jeu et le seul qui n'avait aucun retour : entre l'appui et
  // l'affichage des cases jouables, rien ne confirmait que le jeu avait
  // entendu. Le son est volontairement à la limite du perceptible (voir la
  // recette 'tap', js/sfx.js) — c'est une confirmation, pas un événement — et
  // il n'est joué QUE sur une vraie prise en main, pas quand on repose le
  // doigt sur une pièce déjà sélectionnée.
  if(!alreadySelected&&typeof playSound==='function')playSound('tap',{force:pre?0.22:0.3});
  if(!alreadySelected){if(pre)paintBoardCells(gs);else renderGame(gs);}
}

function moveDrag(clientX,clientY){
  if(!dragState)return;
  const dx=clientX-dragState.startX,dy=clientY-dragState.startY;
  if(!dragState.moved&&Math.sqrt(dx*dx+dy*dy)>6){
    dragState.moved=true;
    dragGhost.style.display='block';
    // La pièce s'efface sur le plateau dès que le fantôme apparaît : sinon on
    // voit la même pièce à deux endroits pendant tout le glissement. La
    // classe est posée ICI et non dans renderGame, qui n'est pas rappelé
    // pendant le geste.
    const n=pieceNodeAt(dragState.fromR,dragState.fromC);
    if(n)n.classList.add('dragging');
  }
  if(dragState.moved){
    dragGhost.style.left=clientX+'px';dragGhost.style.top=clientY+'px';
  }
}
function endDrag(clientX,clientY){
  if(!dragState)return;
  dragGhost.style.display='none';
  const held=pieceNodeAt(dragState.fromR,dragState.fromC);
  if(held)held.classList.remove('dragging');
  const gs=dragState.gs;
  const wasDrag=dragState.moved;
  const wasAlreadySelected=dragState.alreadySelected;
  const wasPre=dragState.pre;
  const prevSelected={r:dragState.fromR,c:dragState.fromC};
  dragState=null;

  // GLISSÉ PENDANT LE TOUR ADVERSE : on ne joue pas, on inscrit.
  if(wasPre){
    if(wasDrag){
      const cell=getBoardCell(clientX,clientY,gs);
      const move=cell&&(gs.pmMoves||[]).find(m=>m.r===cell.r&&m.c===cell.c&&!m.stayPut);
      if(move)premoveSet(gs,prevSelected,{r:move.r,c:move.c});
      else{premoveDeselect(gs);paintBoardCells(gs);}
    }else if(wasAlreadySelected){premoveDeselect(gs);paintBoardCells(gs);}
    return;
  }

  if(wasDrag){
    const cell=getBoardCell(clientX,clientY,gs);
    if(!cell){gs.selected=null;gs.legalMoves=[];renderGame(gs);return;}
    const move=gs.legalMoves.find(m=>m.r===cell.r&&m.c===cell.c);
    if(move){
      gs.lastMove={from:prevSelected,to:move,capture:!!gs.board[move.r][move.c]};
      const from={...prevSelected};gs.selected=null;gs.legalMoves=[];
      executeGameMove(from,move,gs);
    }else{gs.selected=null;gs.legalMoves=[];renderGame(gs);}
  }else if(wasAlreadySelected){
    // Un simple appui sur la pièce déjà sélectionnée la désélectionne (comme
    // un clic sur la pièce sélectionnée). Sinon (appui sur une pièce qui
    // vient tout juste d'être sélectionnée par ce même geste), rien à faire
    // de plus : startDrag l'a déjà sélectionnée et affichée.
    gs.selected=null;gs.legalMoves=[];renderGame(gs);
  }
}

document.addEventListener('mousemove',e=>{moveDrag(e.clientX,e.clientY);});
document.addEventListener('mouseup',e=>{endDrag(e.clientX,e.clientY);});
document.addEventListener('touchmove',e=>{
  if(!dragState)return;
  e.preventDefault();
  const t=e.touches[0];moveDrag(t.clientX,t.clientY);
},{passive:false});
document.addEventListener('touchend',e=>{
  if(!dragState)return;
  e.preventDefault();
  const t=e.changedTouches[0];endDrag(t.clientX,t.clientY);
},{passive:false});
document.addEventListener('touchcancel',()=>{
  if(!dragState)return;
  dragGhost.style.display='none';
  if(dragState.gs){dragState.gs.selected=null;dragState.gs.legalMoves=[];renderGame(dragState.gs);}
  dragState=null;
});

// ----------------------------------------------------------------
// LE PRÉMOUVEMENT
// ----------------------------------------------------------------
// PENDANT LE TOUR DE L'ADVERSAIRE, LE PLATEAU ÉTAIT MORT. Tout geste était
// jeté : ni sélection, ni prise en main, rien — et c'est la moitié du temps
// d'une partie. Sur une pendule courte, c'est aussi la moitié du temps qu'on
// a pour jouer, dépensée à attendre le droit d'agir.
//
// On désigne donc son coup à l'avance, exactement du même geste (clic ou
// glissé). Il est INSCRIT, pas joué : rien ne bouge, deux cases s'allument en
// violet, et à l'instant où l'adversaire pose son coup, le nôtre part.
//
// Trois règles, et elles décident de tout :
//
// · LES CASES PROPOSÉES SONT CELLES DE LA PIÈCE, PAS CELLES DE LA POSITION.
//   On les calcule sur un plateau VIDE (premoveTargets) : tout ce que la
//   créature sait faire, sans que rien ne la gêne. C'est le seul calcul
//   honnête — la position sur laquelle le coup se jouera n'existe pas encore,
//   et proposer les coups d'AVANT le coup adverse interdirait justement ceux
//   qu'on prépare : reprendre la pièce qui va venir, occuper la case qu'elle
//   va libérer.
// · LA LÉGALITÉ SE VÉRIFIE À L'EXÉCUTION, jamais à l'inscription. Le coup est
//   recalculé sur le plateau réel au moment de partir : légal, il part ;
//   illégal, il ne part pas, et rien d'autre ne se produit — c'est un pari,
//   et un pari perdu n'a pas à être commenté.
// · UN SEUL PRÉMOUVEMENT À LA FOIS. En désigner un second remplace le
//   premier : une file d'attente jouerait des coups que le joueur ne voit
//   plus, sur une position qu'il n'a pas regardée.
//
// La bataille scriptée du tutoriel en est exclue : elle attend un coup précis
// à un moment précis, et un coup parti tout seul lui passerait sous le nez.
function premoveAllowed(gs){
  return !!gs&&!gs.gameOver&&!gs.tuto&&!gs.pendingPromo
    &&gs.historyView===null&&gs.turn!==(gs.playerColor||'w');
}
function premoveDeselect(gs){gs.pmSel=null;gs.pmMoves=[];}
// Annule le prémouvement inscrit ET la sélection en cours. `repaint` est faux
// quand l'appelant va de toute façon redessiner (renderGame le fait).
function premoveCancel(gs,repaint){
  if(!gs)return false;
  const had=!!(gs.premove||gs.pmSel);
  gs.premove=null;premoveDeselect(gs);
  if(had&&repaint!==false&&_boardCells)paintBoardCells(gs);
  return had;
}

// LES CASES QU'UNE PIÈCE PEUT THÉORIQUEMENT ATTEINDRE, plateau vide.
//
// Le moteur ne sait répondre qu'à « où peut-elle aller MAINTENANT » : sur la
// position actuelle, une pièce derrière ses propres lignes n'a presque aucun
// coup, et un prémouvement n'aurait presque jamais rien à proposer. Or ce
// qu'on prépare est précisément le coup d'APRÈS — reprendre sur la case où
// l'adversaire va venir, passer par la ligne qu'il va ouvrir.
//
// On rejoue donc le générateur du moteur sur un plateau où la pièce est
// SEULE. Deux passes, parce qu'un pion (et toute créature qui capture
// autrement qu'elle n'avance) ne montre ses diagonales que s'il y a quelqu'un
// dessus :
//   1. plateau vide  → tous les déplacements ;
//   2. une victime posée tour à tour sur chaque case restante → toutes les
//      prises.
// Soixante-trois générations sur un plateau presque vide, une seule fois par
// sélection : c'est gratuit, et surtout ça ne connaît AUCUNE créature en
// particulier — la règle vaudra pour celles qui viendront.
function premoveTargets(r,c,gs){
  const p=gs.board[r][c];
  if(!p||typeof generateMovesRaw!=='function')return [];
  const empty=()=>{const b=[];for(let i=0;i<8;i++)b.push(new Array(8).fill(null));return b;};
  // Un état de partie NEUTRE : les paralysies, ancrages et protections de la
  // position actuelle n'ont rien à faire dans un calcul théorique, et la prise
  // en passant dépend du coup que l'adversaire n'a pas encore joué.
  const ghostGs={...gs,medusaParalyzed:new Set(),pretreProtected:new Set(),
    anchored:new Set(),enPassant:null,lastMoveHistory:[]};
  const seen=new Map();
  const keep=list=>{for(const m of list){if(m.stayPut)continue;const k=m.r+','+m.c;if(!seen.has(k))seen.set(k,m);}};

  const b0=empty();b0[r][c]={...p};
  ghostGs.board=b0;
  keep(generateMovesRaw(b0,r,c,ghostGs));

  const foe=p.color==='w'?'b':'w';
  for(let tr=0;tr<8;tr++)for(let tc=0;tc<8;tc++){
    if(tr===r&&tc===c)continue;
    if(seen.has(tr+','+tc))continue;
    const b=empty();
    b[r][c]={...p};
    // Une victime générique : un pion adverse suffit à révéler une prise, et
    // n'ouvre aucun pouvoir particulier.
    b[tr][tc]={pieceId:'std-pawn',type:'p',color:foe,id:'pmGhost',hasMoved:true};
    ghostGs.board=b;
    keep(generateMovesRaw(b,r,c,ghostGs));
  }
  return [...seen.values()];
}

function premoveSet(gs,from,to){
  gs.premove={from:{r:from.r,c:from.c},to:{r:to.r,c:to.c}};
  premoveDeselect(gs);
  paintBoardCells(gs);
  if(typeof playSound==='function')playSound('tap',{force:0.28});
}
function premoveSelect(r,c,gs){
  gs.pmSel={r,c};
  gs.pmMoves=premoveTargets(r,c,gs);
  paintBoardCells(gs);
  if(typeof playSound==='function')playSound('tap',{force:0.22});
}
// Le même enchaînement que handleGameClick, mais sans jamais jouer.
//
// TOUT CLIC SUR L'ÉCHIQUIER QUI N'EST PAS LA DESTINATION ANNULE. C'est le
// geste qu'on cherche quand l'adversaire vient de jouer autre chose que ce
// qu'on avait parié, et il ne doit pas se chercher : n'importe où sur le
// plateau, et c'est effacé. En dehors de l'échiquier, rien ne bouge — on n'a
// pas annulé son coup parce qu'on a touché la pendule ou le journal.
function premoveClick(r,c,gs){
  if(!premoveAllowed(gs)){premoveCancel(gs);return;}
  const cell=gs.board[r][c];
  const playerCol=gs.playerColor||'w';

  if(gs.pmSel){
    const same=gs.pmSel.r===r&&gs.pmSel.c===c;
    const target=(gs.pmMoves||[]).find(m=>m.r===r&&m.c===c&&!m.stayPut);
    if(target&&!same){premoveSet(gs,gs.pmSel,{r,c});return;}
    // Tout le reste referme la sélection ; sur une AUTRE de nos pièces, elle
    // se rouvre aussitôt sur celle-là (on change d'avis sans double clic).
    premoveDeselect(gs);
    if(!same&&cell&&cell.color===playerCol){premoveSelect(r,c,gs);return;}
    paintBoardCells(gs);
    return;
  }

  gs.premove=null;                       // n'importe quel clic efface l'inscrit
  if(cell&&cell.color===playerCol){premoveSelect(r,c,gs);return;}
  paintBoardCells(gs);
}
// LA SÉLECTION PRISE EN COURS DE ROUTE. On désigne une pièce pour préparer un
// prémouvement, et l'adversaire joue AVANT qu'on ait choisi la case d'arrivée.
// La sélection violette restait alors à l'écran alors que c'était devenu notre
// tour : elle proposait les cases théoriques de la pièce, aucun clic ne les
// jouait, et plus rien ne la refermait — le joueur était bloqué, plateau
// mort, sur son propre trait.
//
// Le geste n'était pas perdu pour autant : il disait « c'est cette pièce que
// je veux jouer », et c'est vrai maintenant plus encore qu'avant. La
// sélection devient donc une sélection ORDINAIRE — les vraies cases légales,
// en vert — et la partie reprend exactement là où le joueur la croyait.
function premoveSettleSelection(gs){
  if(!gs||!gs.pmSel)return;
  const sel=gs.pmSel;
  if(gs.gameOver||gs.turn!==(gs.playerColor||'w')){
    // Toujours le tour d'en face : la sélection reste ce qu'elle est.
    if(gs.gameOver)premoveDeselect(gs);
    return;
  }
  premoveDeselect(gs);
  const p=gs.board[sel.r]&&gs.board[sel.r][sel.c];
  if(!p||p.color!==(gs.playerColor||'w')){
    // La pièce vient d'être prise : il n'y a plus rien à sélectionner.
    gs.selected=null;gs.legalMoves=[];
    paintBoardCells(gs);
    return;
  }
  gs.selected={r:sel.r,c:sel.c};
  gs.legalMoves=getLegalMoves(gs.board,sel.r,sel.c,gs);
  // postMoveUpdate a DÉJÀ rendu la partie avant de nous appeler : sans ce
  // repeint, la sélection changerait de nature sans changer de couleur.
  paintBoardCells(gs);
}

// L'EXÉCUTION. Appelée par postMoveUpdate (js/rules-engine.js) à chaque
// changement de trait : c'est le seul endroit qui voit tous les coups, celui
// de l'IA comme celui d'un adversaire en ligne.
//
// Légal → joué tout de suite. Illégal → pas joué, et rien de plus.
function premoveRun(gs){
  if(!gs)return;
  premoveSettleSelection(gs);
  if(!gs.premove)return;
  const pm=gs.premove;
  if(gs.gameOver){premoveCancel(gs);return;}
  if(gs.turn!==(gs.playerColor||'w')||gs.pendingPromo)return;  // pas encore à nous
  gs.premove=null;premoveDeselect(gs);
  const b=gs.board;
  const p=b[pm.from.r]&&b[pm.from.r][pm.from.c];
  const moves=(p&&p.color===(gs.playerColor||'w'))?getLegalMoves(b,pm.from.r,pm.from.c,gs):[];
  const move=moves.find(m=>m.r===pm.to.r&&m.c===pm.to.c&&!m.stayPut);
  if(!move){paintBoardCells(gs);return;}
  // LE COUP PART TOUT DE SUITE, mais pas DANS l'appel qui vient de jouer le
  // coup adverse : executeGameMove appelé depuis lui-même empilerait deux
  // coups sur le même instantané d'historique. Un tour de boucle
  // d'événements suffit à les séparer, et ne se voit pas.
  setTimeout(()=>{
    if(gs.gameOver||gs.turn!==(gs.playerColor||'w')||gs.pendingPromo)return;
    const still=getLegalMoves(gs.board,pm.from.r,pm.from.c,gs)
      .find(m=>m.r===pm.to.r&&m.c===pm.to.c&&!m.stayPut);
    if(!still)return;
    gs.lastMove={from:pm.from,to:still,capture:!!gs.board[still.r][still.c]};
    gs.selected=null;gs.legalMoves=[];
    executeGameMove({...pm.from},still,gs);
  },0);
}

// ----------------------------------------------------------------
// HANDLER DE CLIC (sélection / déplacement / cas spéciaux)
// ----------------------------------------------------------------
function handleGameClick(r,c,gs){
  const b=gs.board;const cell=b[r][c];const playerCol=gs.playerColor||'w';

  if(gs.selected){
    if(gs.selected.r===r&&gs.selected.c===c){gs.selected=null;gs.legalMoves=[];renderGame(gs);return;}
    const normalMove=gs.legalMoves.find(m=>m.r===r&&m.c===c&&!m.stayPut);
    const selCell=b[gs.selected.r][gs.selected.c];
    const move=normalMove||gs.legalMoves.find(m=>m.r===r&&m.c===c);
    if(move){
      gs.lastMove={from:gs.selected,to:move,capture:!!b[move.r][move.c]};const from={...gs.selected};gs.selected=null;gs.legalMoves=[];executeGameMove(from,move,gs);return;
    }
    if(cell&&cell.color===playerCol){gs.selected={r,c};gs.legalMoves=getLegalMoves(b,r,c,gs);renderGame(gs);return;}
    // LA CUIRASSE, AU SEUL INSTANT OÙ ELLE S'EXPLIQUE. Le pouvoir du Preux
    // Chevalier — les pions adverses ne peuvent pas le capturer — vit dans la
    // GÉNÉRATION des coups : la prise n'est jamais proposée, et le joueur qui
    // clique dessus voit sa pièce se désélectionner sans un mot. Il n'en
    // conclut pas « ce chevalier est cuirassé », il en conclut que le jeu ne
    // répond pas.
    //
    // C'est le bon endroit, et le seul : on ne peut RIEN poser dans la
    // génération de coups, qui tourne des milliers de fois par seconde dans la
    // recherche de l'IA. Ici, on est sur un clic humain refusé, une fois.
    // Trois conditions, pour ne jamais mentir : un VRAI pion (la Fourmi, elle,
    // peut le prendre — voir TRUE_PAWN_IDS), une case en diagonale AVANT lui,
    // et un Preux Chevalier adverse dessus.
    if(typeof fxPower==='function'&&selCell&&typeof isTruePawn==='function'&&isTruePawn(selCell)
       &&cell&&cell.pieceId==='preux-chevalier'&&cell.color!==selCell.color){
      const dir=selCell.color==='w'?-1:1;
      if(r===gs.selected.r+dir&&Math.abs(c-gs.selected.c)===1){
        fxPower('cuirasse',r,c);
        // `deny` est LA recette du coup refusé (js/sfx.js). Un refus qu'on
        // voit sans l'entendre reste ambigu : on croit avoir mal cliqué.
        if(typeof playSound==='function')playSound('deny');
      }
    }
    gs.selected=null;gs.legalMoves=[];renderGame(gs);return;
  }
  if(cell&&cell.color===playerCol){gs.selected={r,c};gs.legalMoves=getLegalMoves(b,r,c,gs);renderGame(gs);}
}

// ----------------------------------------------------------------
// NAVIGATION D'HISTORIQUE (⏮ ◀ ▶ ⏭ + flèches clavier)
// ----------------------------------------------------------------
// PLUS DE COMPTEUR DE POSITION. Une ligne « Position 12/31 » vivait sous le
// pseudo du joueur, et une autre — « Historique : coup 12/31 » — remplaçait la
// barre de statut pendant la relecture. Les deux disaient la même chose, et
// aucune n'apprenait rien : le numéro de chaque coup est déjà écrit à côté de
// sa notation, dans le journal, à l'endroit exact où on le lit.
function updateHistoryNav(){
  const total=GS.history.length;const view=GS.historyView;
  document.getElementById('hist-first').disabled=(view===null&&total===0)||(view===0);
  document.getElementById('hist-prev').disabled=(view===null&&total===0)||(view===0);
  document.getElementById('hist-next').disabled=(view===null);
  document.getElementById('hist-last').disabled=(view===null);
}
function renderHistoryPosition(idx){
  const snap=GS.history[idx];if(!snap)return;
  renderBoardFromSnapshot(snap.board,null);updateHistoryNav();
}
// La relecture d'historique emprunte EXACTEMENT le même plateau que la
// partie en cours : les mêmes 64 cases, la même couche de pièces. Elle
// réécrivait tout en innerHTML, ce qui détruisait les cases persistantes (et
// leurs écouteurs) dès qu'on remontait d'un coup. En passant par syncPieces,
// les positions s'ENCHAÎNENT : remonter le fil d'une partie rejoue les coups
// à l'envers au lieu de faire clignoter des positions.
//
// cloneBoard() conserve l'`id` de chaque pièce (c'est un spread) : c'est ce
// qui permet au diff de la reconnaître d'une position à l'autre.
function renderBoardFromSnapshot(board,lastMove){
  const boardEl=document.getElementById('game-board');if(!boardEl)return;
  const gs=GS;if(!gs)return;
  const flipped=gs.playerColor==='b';
  ensureBoardCells(gs,boardEl,flipped);
  // Ni sélection ni cases jouables dans une position passée : on ne montre
  // que le coup qui venait d'être joué à ce moment-là.
  if(_boardCells){
    for(const el of _boardCells){
      const r=+el.dataset.r,c=+el.dataset.c;
      let cls='gc '+(((r+c)%2===0)?'l':'d');
      if(lastMove){
        if(lastMove.from&&lastMove.from.r===r&&lastMove.from.c===c)cls+=' lm-from';
        else if(lastMove.to&&lastMove.to.r===r&&lastMove.to.c===c)cls+=' lm-to';
      }
      if(el.className!==cls)el.className=cls;
    }
  }
  syncPieces(gs,boardEl,flipped,board);
  if(typeof applyBoardSkin==='function')applyBoardSkin();
  buildGameLabels(gs);
}
document.getElementById('hist-first').addEventListener('click',()=>{if(GS.history.length===0)return;GS.historyView=0;renderHistoryPosition(0);updateHistoryNav();});
document.getElementById('hist-prev').addEventListener('click',()=>{if(GS.history.length===0)return;const cur=GS.historyView!==null?GS.historyView:GS.history.length;const next=Math.max(0,cur-1);GS.historyView=next;renderHistoryPosition(next);updateHistoryNav();});
document.getElementById('hist-next').addEventListener('click',()=>{if(GS.historyView===null)return;const next=GS.historyView+1;if(next>=GS.history.length){GS.historyView=null;renderGame(GS);updateStatus(GS);}else{GS.historyView=next;renderHistoryPosition(next);}updateHistoryNav();});
document.getElementById('hist-last').addEventListener('click',()=>{GS.historyView=null;renderGame(GS);updateStatus(GS);updateHistoryNav();});
// LES FLÈCHES OUVRENT LE JOURNAL AVANT DE LE PARCOURIR. Elles pilotent les
// quatre commandes de relecture, qui vivent maintenant DANS le panneau : sans
// cette ouverture, une flèche remonterait le fil de la partie sans que rien
// ne dise qu'on est en train de relire — le plateau changerait tout seul.
// C'était le rôle de la ligne « Historique : coup 12/31 » dans la barre de
// statut, qui redisait ce que le journal écrit déjà à côté de chaque coup.
document.addEventListener('keydown',e=>{
  if(!document.getElementById('page-game').classList.contains('active'))return;
  // Échap efface le prémouvement AVANT de servir à quoi que ce soit d'autre :
  // c'est la touche qu'on cherche quand l'adversaire vient de jouer autre
  // chose que ce qu'on avait parié.
  if(e.key==='Escape'&&typeof GS!=='undefined'&&GS&&premoveCancel(GS))return;
  const nav={ArrowLeft:'hist-prev',ArrowRight:'hist-next',Home:'hist-first',End:'hist-last'}[e.key];
  if(!nav)return;
  if(typeof gamePanelOpen==='function'&&!gamePanelIsOpen('history'))gamePanelOpen('history');
  document.getElementById(nav).click();
});

// ----------------------------------------------------------------
// LES DEUX BOUTONS DE PARTIE SUIVENT L'ÉTAT
// ----------------------------------------------------------------
// « Annuler coup » n'existe que pendant une partie HORS LIGNE, et les deux
// conditions sont décidées ici, ensemble. Elles ont vécu à deux endroits —
// startGame masquait le bouton en ligne, updateStatus le rendait à chaque
// rendu — et c'est le classique de la propriété écrite par deux règles : la
// seconde efface la première à chaque coup.
//   · EN LIGNE, l'annulation serait unilatérale et désynchroniserait les deux
//     plateaux ;
//   · PARTIE TERMINÉE, il n'y a plus rien à reprendre : le résultat est
//     enregistré, l'ELO est compté. On relit, on n'amende pas.
//
// APPELÉE DEPUIS renderGame ET NON DEPUIS updateStatus SEULE, et c'est le
// point à ne pas perdre : c'est updateStatus qui DÉCLARE la fin de partie
// (`gs.gameOver=true`, puis triggerEndOfGame). Un état lu en tête de cette
// fonction est donc l'état d'AVANT — le mat tombait, et « Annuler coup »
// restait offert pendant toute l'analyse, faute d'un rendu ultérieur pour le
// corriger. renderGame, lui, passe après.
function syncGameButtons(gs){
  const qBtn=document.getElementById('game-quit');
  if(qBtn)qBtn.textContent=gs.gameOver?'Quitter':'Abandonner';
  const uBtn=document.getElementById('game-undo');
  if(uBtn)uBtn.style.display=(gs.gameOver||gs.multiplayer)?'none':'';
}

// ----------------------------------------------------------------
// STATUT DE PARTIE (échec/mat/pat/nulle) : appelée par postMoveUpdate()
// dans rules-engine.js. Déclenche triggerEndOfGame() (game-flow.js).
// ----------------------------------------------------------------
function updateStatus(gs){
  const bar=document.getElementById('game-status');if(!bar)return;
  syncGameButtons(gs);
  // En relecture, la barre garde ce qu'elle disait : ce qu'on regarde est une
  // position passée, il n'y a pas de « tour » à y annoncer, et le numéro du
  // coup est déjà dans le journal, à côté de sa notation.
  if(gs.historyView!==null)return;
  const t=gs.turn;

  // Règle des 50 coups
  if(gs.halfmoveClock>=100){
    bar.textContent='Nulle : règle des 50 coups';bar.className='status-bar';
    gs.gameOver=true;if(!_endGameTriggered)triggerEndOfGame('draw');return;
  }

  // Mat insuffisant
  if(isInsufficientMaterial(gs.board)){
    bar.textContent='Nulle : matériel insuffisant';bar.className='status-bar';
    gs.gameOver=true;if(!_endGameTriggered)triggerEndOfGame('draw');return;
  }

  // Répétition de position (3× la même position)
  if(gs.history.length>=8){
    const curFEN=boardFEN(gs.board);
    let count=1;
    for(let i=gs.history.length-2;i>=0;i-=2){
      if(boardFEN(gs.history[i].board)===curFEN)count++;
      if(count>=3)break;
    }
    if(count>=3){
      bar.textContent='Nulle : répétition de position (3×)';bar.className='status-bar';
      gs.gameOver=true;if(!_endGameTriggered)triggerEndOfGame('draw');return;
    }
  }

  const check=isInCheckSimple(t,gs.board);
  const hasLegal=hasLegalMovesForColor(t,gs.board,gs);
  const playerCol=gs.playerColor||'w';
  // Le jeu n'a plus « une IA » mais UN adversaire nommé : l'Instructeur (ou
  // l'instructeur du tutoriel en cours). Le dire par son nom, partout.
  const oppLabel=gs.multiplayer?'Votre adversaire':((gs.tuto&&gs.tuto.name)||
    ((typeof aiCurrentOpponent==='function')?aiCurrentOpponent().name:INSTRUCTOR.name));
  // Le journal note l'échec et le mat. C'est calculé ICI et non dans
  // recordMove : à l'inscription du coup, les états spéciaux (paralysie de la
  // Méduse, protection du Prêtre) n'ont pas encore été recalculés, et le mat
  // serait jugé sur un plateau périmé.
  if(typeof markLastMove==='function')markLastMove(gs,(!hasLegal&&check)?'#':check?'+':'');
  // QUÊTES « donner échec / échec et mat avec X » (js/rewards.js). Le camp au
  // trait (`t`) est celui qui SUBIT l'échec : il vient donc du joueur quand
  // `t` n'est pas sa couleur. Compté une seule fois par demi-coup —
  // updateStatus est rappelée à chaque rendu, y compris sans nouveau coup —,
  // d'où le repère sur la longueur de l'historique, qui n'avance que d'un cran
  // par coup joué.
  if(check&&t!==playerCol&&!gs.tuto&&typeof questNoteCheck==='function'){
    const ply=(gs.history&&gs.history.length)||0;
    if(gs._questPly!==ply){gs._questPly=ply;questNoteCheck(gs,t,!hasLegal);}
  }
  if(!hasLegal){
    if(check){
      const playerWins=opp(t)===playerCol;
      bar.textContent='Échec et mat ! '+(playerWins?'Vous gagnez !':oppLabel+' gagne !');
      bar.className='status-bar mate';gs.gameOver=true;
      // LE PLATEAU DIT L'ISSUE AVANT LA FENÊTRE, ET C'EST POURQUOI IL PARLE
      // EN PREMIER. triggerEndOfGame enchaîne sur la cinématique d'issue
      // (js/cinematics.js), un voile plein écran : appelée avant, elle
      // recouvrirait l'effet du mat avant qu'on en voie une image. L'effet
      // est donc allumé d'abord, et c'est lui qui dit à la cinématique
      // combien de temps l'attendre (fxOutcomeDelay, js/combat-fx.js) — sur
      // une victoire, le plateau se dissout en or et la fenêtre se lève sur
      // l'or plutôt que de tomber sur un échiquier encore là.
      if(typeof fxMate==='function'){
        const kc=fxKingCell(gs.board,t);
        if(kc)fxMate(kc.r,kc.c,playerWins);
      }
      if(!_endGameTriggered)triggerEndOfGame(playerWins?'win':'loss');
      playSound(playerWins?'win':'loss');
    }else{
      bar.textContent='Pat : Partie nulle (aucun coup légal)';
      bar.className='status-bar';gs.gameOver=true;
      if(!_endGameTriggered)triggerEndOfGame('draw');
    }
    return;
  }
  // LE BANDEAU NE DIT PLUS QU'UNE CHOSE : à qui de jouer. Il a porté trois
  // formulations pour deux états (« À vous de jouer », « Au tour de votre
  // adversaire… », « Cinabre réfléchit… ») ; celle qui nommait l'adversaire
  // obligeait à se rappeler QUI est Cinabre pour savoir si l'on attend ou si
  // l'on joue. Deux phrases, toujours les mêmes, se lisent d'un coup d'œil au
  // milieu d'une partie — le nom de l'adversaire, lui, est déjà en haut de
  // l'écran.
  //
  // LES DEUX PHRASES S'AFFICHENT, TOUJOURS ET PARTOUT. « À votre tour » était
  // masqué sur téléphone (voir .status-bar.ok dans css/style.css) : la barre
  // ne disait jamais que l'attente, et le joueur n'avait rien à lire au moment
  // où c'était à lui de jouer. Une ligne qui ne s'allume que la moitié du
  // temps n'est pas un repère.
  //
  // Le camp au trait se compare à CELUI DU JOUEUR et non à celui de l'IA :
  // c'est la même chose dans une partie contre le laboratoire, mais `aiColor`
  // ne veut rien dire face à un autre joueur.
  const TURN_YOU='À votre tour';
  const TURN_OPP='Au tour de votre adversaire';
  const myTurn=(t===playerCol);
  // LA BARRE NE DIT QU'UNE CHOSE À LA FOIS. Elle a porté « Échec ! Au tour de
  // votre adversaire » : deux informations de nature différente cousues sur
  // une ligne, dont la plus urgente — un roi attaqué — se retrouvait diluée
  // dans la plus banale. Un échec est un ÉVÉNEMENT, il occupe la ligne seul ;
  // le reste du temps, la ligne dit à qui de jouer, et rien d'autre.
  if(check){
    bar.textContent='Échec !';bar.className='status-bar check';playSound('check');
    // UNE FOIS PAR DEMI-COUP, PAS UNE PAR RENDU. updateStatus est rappelée à
    // chaque redessin — sélection d'une pièce, retour d'historique, simple
    // redimensionnement —, et sans ce repère l'alarme se rejouerait sur un
    // échec vieux de dix secondes. Le repère est la longueur de l'historique,
    // qui n'avance que d'un cran par coup joué : c'est déjà celui dont se
    // servent les quêtes, quelques lignes plus haut.
    if(typeof fxCheck==='function'){
      const ply=(gs.history&&gs.history.length)||0;
      if(gs._fxCheckPly!==ply){
        gs._fxCheckPly=ply;
        const kc=fxKingCell(gs.board,t);
        if(kc)fxCheck(kc.r,kc.c);
      }
    }
  }
  else{
    bar.textContent=myTurn?TURN_YOU:TURN_OPP;
    bar.className='status-bar '+(myTurn?'ok':'thinking');
  }
}

// Rebuild des repères du plateau au redimensionnement de la fenêtre.
window.addEventListener("resize",()=>{if(document.getElementById("page-game").classList.contains("active")&&typeof GS!=="undefined")buildGameLabels(GS);});

// ----------------------------------------------------------------
// LES DEUX PANNEAUX DE LA ZONE SOUS LE PLATEAU
// ----------------------------------------------------------------
// Le journal des coups a été une FEUILLE ancrée en bas d'écran. Repliée, elle
// mangeait cent pixels de hauteur — pris à l'échiquier, la seule chose qu'on
// regarde. Dépliée, elle recouvrait le plateau derrière un voile : on ne
// pouvait donc pas lire le journal ET jouer, ce qui est pourtant la seule
// chose qu'on demande à un journal des coups.
//
// Deux boutons l'ouvrent maintenant — « Historique » à gauche, « Chat » à
// droite —, et le panneau se pose sur la ZONE SOUS LE PLATEAU et sur elle
// seule (voir [GAME-PANEL] dans css/style.css). Il recouvre l'indication de
// tour, « Annuler coup » et les deux boutons ; le plateau reste entier,
// visible et jouable. Il n'y a volontairement PAS de voile : un voile dirait
// « le reste est suspendu », et justement il ne l'est pas.
//
// Un seul panneau à la fois : deux superposés laisseraient l'un des deux
// orphelin sous l'autre, et il n'y a de toute façon qu'une zone.
const GAME_PANELS={history:'panel-history',chat:'panel-chat'};
let _openPanel=null;

function gamePanelClose(){
  if(!_openPanel)return;
  const el=document.getElementById(GAME_PANELS[_openPanel]);
  if(el)el.hidden=true;
  const btn=document.getElementById(_openPanel==='history'?'btn-history':'btn-chat');
  if(btn)btn.setAttribute('aria-expanded','false');
  _openPanel=null;
  const under=document.getElementById('game-under');
  if(under)under.classList.remove('gu-open','gu-chat');
  // La zone rétrécit : le plateau récupère sa place au même instant, sans
  // quoi il resterait petit jusqu'au coup suivant.
  gameSyncChrome();
}

function gamePanelOpen(name){
  if(!GAME_PANELS[name])return;
  if(_openPanel===name)return;
  gamePanelClose();
  const el=document.getElementById(GAME_PANELS[name]);
  if(!el)return;
  el.hidden=false;
  _openPanel=name;
  const btn=document.getElementById(name==='history'?'btn-history':'btn-chat');
  if(btn)btn.setAttribute('aria-expanded','true');
  const under=document.getElementById('game-under');
  if(under){under.classList.add('gu-open');under.classList.toggle('gu-chat',name==='chat');}
  if(name==='history'){
    renderMoveLog(GS);
    gameScrollLogToEnd();
  }
  if(name==='chat'&&typeof mpOpenChat==='function')mpOpenChat();
  gameSyncChrome();
}
function gamePanelToggle(name){
  _openPanel===name?gamePanelClose():gamePanelOpen(name);
}
function gamePanelIsOpen(name){return name?_openPanel===name:!!_openPanel;}

// Le dernier coup est en bas : c'est là qu'on regarde en ouvrant le journal,
// et c'est le seul endroit qu'un défilement automatique a le droit d'imposer.
function gameScrollLogToEnd(){
  const log=document.getElementById('move-log');
  if(log)log.scrollTop=log.scrollHeight;
}

(function wireGamePanels(){
  document.getElementById('btn-history')?.addEventListener('click',()=>gamePanelToggle('history'));
  document.getElementById('btn-chat')?.addEventListener('click',()=>gamePanelToggle('chat'));
  document.querySelectorAll('[data-close-panel]').forEach(b=>{
    b.addEventListener('click',gamePanelClose);
  });
  // Échap ferme, comme partout ailleurs dans le jeu.
  document.addEventListener('keydown',e=>{if(e.key==='Escape')gamePanelClose();});
})();
