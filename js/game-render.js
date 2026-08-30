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
  }
  boardLayer(boardEl);
}

// Écouteurs d'une case : posés UNE FOIS pour la vie de la case. Ils lisent
// donc GS au moment de l'événement et non une partie capturée dans une
// fermeture — les cases survivent d'une partie à l'autre, une référence figée
// piloterait le plateau d'hier.
function bindBoardCell(el,r,c){
  const playable=gs=>gs&&!gs.gameOver&&gs.turn===(gs.playerColor||'w');
  const mine=gs=>{
    const cell=gs&&gs.board&&gs.board[r]&&gs.board[r][c];
    return !!cell&&cell.color===(gs.playerColor||'w');
  };

  el.addEventListener('click',()=>{
    const gs=GS;if(!gs)return;
    if(gs.gameOver||gs.turn!==(gs.playerColor||'w'))return;
    if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
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
    if(gs.gameOver||gs.turn!==(gs.playerColor||'w'))return;
    if(dragState){
      e.preventDefault();
      const t=e.changedTouches[0];
      if(t)endDrag(t.clientX,t.clientY);
      return;
    }
    if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
    e.preventDefault();
    handleGameClick(r,c,gs);
  },{passive:false});

  // LE GLISSÉ-DÉPOSÉ PART DE LA CASE, plus de la pièce : la couche des
  // pièces ne reçoit aucun clic (pointer-events:none), c'est ce qui garantit
  // que le hit-testing porte toujours sur une grille immobile.
  el.addEventListener('mousedown',e=>{
    const gs=GS;
    if(!gs||e.button!==0||gs.historyView!==null)return;
    if(!playable(gs)||!mine(gs))return;
    startDrag(r,c,gs,e.clientX,e.clientY);
  });
  el.addEventListener('touchstart',e=>{
    const gs=GS;
    if(!gs||gs.historyView!==null)return;
    if(!playable(gs)||!mine(gs))return;
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
    if(cell&&cell.color===playerCol&&gs.turn===playerCol&&!gs.gameOver)cls+=' gc-holds';
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
      if(node.style.transform!==tf){
        // Une pièce qui bouge passe au-dessus des autres le temps du
        // glissement : sinon, en capturant, elle disparaît sous sa victime.
        node.style.transform=tf;
        node.classList.add('gc-moving');
        clearTimeout(node._movTid);
        node._movTid=setTimeout(()=>node.classList.remove('gc-moving'),BOARD_MOVE_MS+40);
      }
    }

    const key=r+','+c;
    node.classList.toggle('pc-para',!!(gs.medusaParalyzed&&gs.medusaParalyzed.has(key)));
    node.classList.toggle('gc-anchored',!!(gs.anchored&&gs.anchored.has(key)));
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
    setTimeout(()=>{if(node.parentNode)node.parentNode.removeChild(node);},BOARD_DEATH_MS);
  });

  _pieceAt=at;
}

function renderGame(gs){
  if(gs.historyView!==null){updateHistoryNav();return;}
  const boardEl=document.getElementById('game-board');if(!boardEl)return;
  const playerCol=gs.playerColor||'w';
  const flipped=playerCol==='b'; // échiquier retourné si le joueur joue les noirs

  ensureBoardCells(gs,boardEl,flipped);
  paintBoardCells(gs);
  syncPieces(gs,boardEl,flipped);
  if(typeof applyBoardSkin==='function')applyBoardSkin();

  buildGameLabels(gs);updateCaptured(gs);updateHistoryNav();renderClocks(gs);updateTurnBars(gs);
  // La barre d'emotes n'existe qu'en ligne, et disparaît dès que la partie
  // est finie : on ne parle plus à quelqu'un qui n'est plus là.
  if(typeof mpRenderEmoteBar==='function')mpRenderEmoteBar();
  // La feuille du journal est maintenant visible : c'est le seul moment où la
  // mesurer veut dire quelque chose. On repasse une image plus tard, parce
  // qu'au premier rendu la poignée n'a pas encore sa taille définitive (le
  // journal des coups s'y remplit, les polices se posent) — et --sheet-h
  // borne la taille du plateau, une valeur trop basse le laisserait déborder.
  gameWatchSheetHeight();
  requestAnimationFrame(gameSyncSheetHeight);
  clearTimeout(_sheetSettleTid);
  _sheetSettleTid=setTimeout(gameSyncSheetHeight,260);
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
// LA PLACE QUE PREND LA FEUILLE DU JOURNAL
// ----------------------------------------------------------------
// Sur téléphone, le journal des coups est une feuille ancrée en bas d'écran
// (voir [MOBILE-APP] dans css/style.css). La page réservait sa hauteur avec
// une constante — 112 px — et c'était faux : sur un écran de 350 px, la
// poignée en fait davantage, et « Abandonner » se retrouvait coupé en deux
// par la feuille. Le bouton le plus définitif du jeu, à moitié inaccessible.
//
// On mesure donc la hauteur RÉELLE et on la publie en variable CSS. Un
// ResizeObserver suit toute variation : rotation de l'appareil, police
// système agrandie, apparition d'un coup dans le journal.
// LA MESURE SE PREND QUAND LA PARTIE EST À L'ÉCRAN, PAS AU CHARGEMENT.
// Un premier jet observait la feuille dès DOMContentLoaded : à cet instant
// #page-game est masquée, la feuille est encore dans le flux et mesure une
// vingtaine de pixels. C'est cette valeur-là qui partait dans --sheet-h, et
// « Abandonner » restait coupé en deux. gameSyncSheetHeight() est donc
// appelée depuis renderGame(), c'est-à-dire à chaque rendu de partie, plus au
// redimensionnement et à la rotation.
function gameSyncSheetHeight(){
  const board=document.getElementById('game-board');
  const btns=document.querySelector('.game-btns');
  const sheet=document.querySelector('.gs-block.gs-grow');
  if(!board||!btns)return;
  const b=board.getBoundingClientRect();
  if(b.height<=0)return;                      // la partie n'est pas à l'écran

  // La feuille du journal : déployée, elle couvre volontairement la page, il
  // n'y a rien à lui réserver.
  const sh=(sheet&&!sheet.classList.contains('sheet-open'))
    ?Math.round(sheet.getBoundingClientRect().height):0;
  if(sh>0)document.documentElement.style.setProperty('--sheet-h',sh+'px');

  // TOUT CE QUI N'EST PAS LE PLATEAU, MESURÉ PLUTÔT QUE DEVINÉ. La formule
  // CSS retranchait 200 px en dur pour « le reste » : en réalité il y a le
  // chrome du haut, le bandeau adverse, la barre de statut, le bandeau du
  // joueur, les deux boutons de partie ET la feuille ancrée en bas — plus de
  // 400 px sur un petit écran. D'où « Abandonner » coupé en deux par la
  // feuille sur un téléphone de 640 px de haut.
  //
  // On mesure donc la somme réelle : ce qu'il y a AU-DESSUS du plateau
  // (sa position à l'écran) plus ce qu'il y a EN DESSOUS (du bas du plateau
  // au bas des boutons), plus la feuille, plus un peu d'air. La boucle
  // converge d'un seul tour : réduire le plateau ne change rien à la hauteur
  // de ce qui l'entoure.
  const below=btns.getBoundingClientRect().bottom-b.bottom;
  const chrome=Math.round(b.top+below+sh+12);
  if(chrome>0&&chrome<3000)
    document.documentElement.style.setProperty('--game-chrome',chrome+'px');
}
let _sheetRO=null,_sheetSettleTid=null;
function gameWatchSheetHeight(){
  const sheet=document.querySelector('.gs-block.gs-grow');
  if(!sheet)return;
  // Le ResizeObserver reste : il rattrape ce que renderGame ne voit pas —
  // une police système agrandie, un coup qui rallonge la poignée.
  if(!_sheetRO&&typeof ResizeObserver==='function'){
    _sheetRO=new ResizeObserver(gameSyncSheetHeight);
    _sheetRO.observe(sheet);
  }
  gameSyncSheetHeight();
}
document.addEventListener('DOMContentLoaded',gameWatchSheetHeight);
window.addEventListener('resize',gameSyncSheetHeight);
window.addEventListener('orientationchange',()=>setTimeout(gameSyncSheetHeight,120));

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
  const draw=list=>list.map(x=>pieceIcon(x.id,x.color,1.3)).join('');
  const adv=val(takenByMe)-val(takenByOpp);
  meEl.innerHTML=draw(takenByMe)+(adv>0?'<span class="gp-adv">+'+adv+'</span>':'');
  oppEl.innerHTML=draw(takenByOpp)+(adv<0?'<span class="gp-adv">+'+(-adv)+'</span>':'');
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
  const alreadySelected=gs.selected&&gs.selected.r===r&&gs.selected.c===c;
  const moves=getLegalMoves(b,r,c,gs);
  gs.selected={r,c};gs.legalMoves=moves;
  dragState={fromR:r,fromC:c,gs,moved:false,startX:clientX,startY:clientY,alreadySelected};
  dragGhost.innerHTML=pieceSVG(cell.pieceId,cell.color);
  dragGhost.style.left=clientX+'px';dragGhost.style.top=clientY+'px';
  // PRENDRE UNE PIÈCE EN MAIN NE FAISAIT AUCUN BRUIT. C'est le geste le plus
  // fréquent du jeu et le seul qui n'avait aucun retour : entre l'appui et
  // l'affichage des cases jouables, rien ne confirmait que le jeu avait
  // entendu. Le son est volontairement à la limite du perceptible (voir la
  // recette 'tap', js/sfx.js) — c'est une confirmation, pas un événement — et
  // il n'est joué QUE sur une vraie prise en main, pas quand on repose le
  // doigt sur une pièce déjà sélectionnée.
  if(!alreadySelected&&typeof playSound==='function')playSound('tap',{force:0.3});
  if(!alreadySelected)renderGame(gs);
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
  const prevSelected={r:dragState.fromR,c:dragState.fromC};
  dragState=null;

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
    gs.selected=null;gs.legalMoves=[];renderGame(gs);return;
  }
  if(cell&&cell.color===playerCol){gs.selected={r,c};gs.legalMoves=getLegalMoves(b,r,c,gs);renderGame(gs);}
}

// ----------------------------------------------------------------
// NAVIGATION D'HISTORIQUE (⏮ ◀ ▶ ⏭ + flèches clavier)
// ----------------------------------------------------------------
function updateHistoryNav(){
  const total=GS.history.length;const view=GS.historyView;
  const badge=document.getElementById('history-badge');
  if(view!==null)badge.textContent='Position '+view+'/'+total;
  else badge.textContent=total>0?total+' coup'+(total>1?'s joués':' joué'):'';
  document.getElementById('hist-first').disabled=(view===null&&total===0)||(view===0);
  document.getElementById('hist-prev').disabled=(view===null&&total===0)||(view===0);
  document.getElementById('hist-next').disabled=(view===null);
  document.getElementById('hist-last').disabled=(view===null);
}
function renderHistoryPosition(idx){
  const snap=GS.history[idx];if(!snap)return;
  renderBoardFromSnapshot(snap.board,null);updateHistoryNav();
  const bar=document.getElementById('game-status');
  if(bar){bar.textContent='Historique : position '+idx+'/'+GS.history.length;bar.className='status-bar';}
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
document.addEventListener('keydown',e=>{
  if(!document.getElementById('page-game').classList.contains('active'))return;
  if(e.key==='ArrowLeft')document.getElementById('hist-prev').click();
  else if(e.key==='ArrowRight')document.getElementById('hist-next').click();
  else if(e.key==='Home')document.getElementById('hist-first').click();
  else if(e.key==='End')document.getElementById('hist-last').click();
});

// ----------------------------------------------------------------
// STATUT DE PARTIE (échec/mat/pat/nulle) : appelée par postMoveUpdate()
// dans rules-engine.js. Déclenche triggerEndOfGame() (game-flow.js).
// ----------------------------------------------------------------
function updateStatus(gs){
  const bar=document.getElementById('game-status');if(!bar)return;
  const qBtn=document.getElementById('game-quit');
  if(qBtn)qBtn.textContent=gs.gameOver?'Quitter':'Abandonner';
  if(gs.historyView!==null){bar.textContent='Historique : coup '+gs.historyView+'/'+gs.history.length;bar.className='status-bar';return;}
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
  if(check){bar.textContent='Échec ! '+(myTurn?TURN_YOU:TURN_OPP);bar.className='status-bar check';playSound('check');}
  else{
    bar.textContent=myTurn?TURN_YOU:TURN_OPP;
    bar.className='status-bar '+(myTurn?'ok':'thinking');
  }
}

// Rebuild des repères du plateau au redimensionnement de la fenêtre.
window.addEventListener("resize",()=>{if(document.getElementById("page-game").classList.contains("active")&&typeof GS!=="undefined")buildGameLabels(GS);});

// ----------------------------------------------------------------
// LE JOURNAL EN FEUILLE GLISSANTE (téléphone)
// ----------------------------------------------------------------
// Sous 820 px, le bloc du journal est ancré en bas d'écran et ne montre au
// repos que sa POIGNÉE : le nombre de coups, le dernier coup joué et les
// quatre commandes de relecture — ce qu'on regarde entre deux coups. Il
// empilait auparavant, sous le plateau, un titre, une rangée de commandes, un
// compteur et la liste entière : environ 300 px de défilement pour une
// information consultée par intermittence.
//
// Le déploiement est purement visuel (une classe) : aucune commande ne change
// de comportement, et les quatre boutons de relecture restent cliquables
// feuille repliée — c'est même leur place naturelle.
(function wireMoveSheet(){
  const sheet=document.querySelector('.gs-block.gs-grow');
  if(!sheet)return;
  let scrim=null;
  const close=()=>{
    sheet.classList.remove('sheet-open');
    if(scrim){scrim.remove();scrim=null;}
  };
  const open=()=>{
    sheet.classList.add('sheet-open');
    if(!scrim){
      scrim=document.createElement('div');
      scrim.className='sheet-scrim';
      scrim.addEventListener('click',close);
      sheet.parentNode.insertBefore(scrim,sheet);
    }
  };
  sheet.addEventListener('click',e=>{
    // Les commandes de relecture et le journal lui-même gardent leur rôle :
    // seul un appui sur le fond de la feuille la déploie ou la referme.
    if(e.target.closest('button,.move-log'))return;
    sheet.classList.contains('sheet-open')?close():open();
  });
  // Un nouveau coup pendant la consultation : on rend le plateau.
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
})();
