// ================================================================
// TUTO-DRILL.JS : l'exercice de déplacement d'une nouvelle créature
// ================================================================
// À quoi ça sert : une fiche de pièce MONTRE un déplacement (le schéma 9×9 de
// js/piece-moves.js, qui a remplacé les phrases du genre « exactement 2 cases
// en diagonale, en sautant »). Mais même en image, un déplacement se retient
// surtout en le faisant, pas en le regardant. Cet exercice
// s'ouvre donc juste après le déblocage d'une créature (pendant le tutoriel
// comme en dehors, voir drillMaybeForPiece) et ne demande qu'une chose :
// ramasser cinq repères avec la pièce, seule sur le plateau.
//
// LE POINT DÉLICAT, ET LA RAISON DE L'ALGORITHME CI-DESSOUS : tous les
// déplacements ne vont pas partout. La Fourmi n'a pas le droit de reculer ni
// d'aller sur le côté, le Peureux ne sort jamais des quatre rangées de son
// camp. Cinq repères tirés au hasard seraient, pour ces pièces, souvent impossibles à
// ramasser. Les repères ne sont donc PAS tirés au hasard sur le plateau : ils
// sont posés le long d'une PROMENADE de la pièce (on part de sa case, on tire
// un de ses coups légaux, on pose un repère à l'arrivée, et on recommence
// depuis là). Un chemin qui les ramasse tous existe donc par construction —
// celui qui a servi à les poser.
//
// Ni tour par tour, ni adversaire : la pièce est seule, aucun coup n'est
// illégal pour cause d'échec, et rien ne bloque le passage.
//
// Dépendances : rules-engine.js (generateMovesRaw, playSound), piece-art.js
// (pieceSVG), data-pieces.js (PIECES), main.js (showPage, escH).
// Utilisé par : tutorial.js (étapes `drill`), economy-ui.js (déblocage d'une
// pièce inédite dans un coffre, hors tutoriel).
// ================================================================

const DRILL_DOTS=5;

let _drill=null;   // {pieceId,color,pos,dots:Set('r,c'),onDone,moves}

// gs minimal accepté par generateMovesRaw : aucun pouvoir actif, aucun
// en-passant, aucun Grand Maître. La pièce est seule au monde.
function drillGs(){
  return{medusaParalyzed:new Set(),anchored:new Set(),pretreProtected:new Set(),
    grandMaitreAlive:{w:false,b:false},enPassant:null,lastMoveHistory:[]};
}

// Plateau ne contenant QUE la pièce de l'exercice : les repères ne sont pas
// des pièces, ils ne bloquent donc jamais un déplacement.
function drillBoard(pos,pieceId,color){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  const def=PIECES.find(p=>p.id===pieceId);
  b[pos.r][pos.c]={type:def?.pieceType||'q',color,pieceId,emoji:def?.emoji||'',
    hasMoved:true,isKing:(def?.pieceType==='k'),id:'drill'};
  return b;
}

function drillMovesFrom(pos,pieceId,color){
  const b=drillBoard(pos,pieceId,color);
  // hasMoved:true plus haut n'est pas un détail : sans lui, un Monarque
  // proposerait des roques vers une tour qui n'existe pas.
  return generateMovesRaw(b,pos.r,pos.c,drillGs())
    .filter(m=>m.r>=0&&m.r<8&&m.c>=0&&m.c<8);
}

// Promenade de DRILL_DOTS coups : garantit que les repères sont tous
// ramassables (voir l'en-tête). Si la pièce se retrouve sans coup possible,
// on s'arrête là plutôt que de boucler : mieux vaut 3 repères posés que 5
// impossibles.
function drillLayDots(start,pieceId,color){
  const dots=new Set();
  let pos={...start};
  let guard=0;
  while(dots.size<DRILL_DOTS&&guard++<60){
    const moves=drillMovesFrom(pos,pieceId,color);
    const fresh=moves.filter(m=>!dots.has(m.r+','+m.c)&&!(m.r===start.r&&m.c===start.c));
    const pick=(fresh.length?fresh:moves)[Math.floor(Math.random()*(fresh.length?fresh.length:moves.length))];
    if(!pick)break;
    if(!(pick.r===start.r&&pick.c===start.c))dots.add(pick.r+','+pick.c);
    pos={r:pick.r,c:pick.c};
  }
  return dots;
}

// Les repères restants sont-ils tous encore atteignables depuis la case
// courante ? Un joueur qui s'écarte du chemin peut se coincer (typiquement la
// Fourmi, qui ne recule pas) : on le lui dit au lieu de le laisser chercher.
function drillAllReachable(){
  if(!_drill)return true;
  const seen=new Set([_drill.pos.r+','+_drill.pos.c]);
  const queue=[{..._drill.pos}];
  const found=new Set();
  while(queue.length){
    const cur=queue.shift();
    drillMovesFrom(cur,_drill.pieceId,_drill.color).forEach(m=>{
      const k=m.r+','+m.c;
      if(_drill.dots.has(k))found.add(k);
      if(seen.has(k))return;
      seen.add(k);queue.push({r:m.r,c:m.c});
    });
  }
  return found.size===_drill.dots.size;
}

// ----------------------------------------------------------------
// CYCLE DE VIE
// ----------------------------------------------------------------
// onDone est appelé une seule fois, quand tous les repères sont pris. Il n'y
// a pas de sortie « abandon » : l'exercice est court, et pouvoir le fuir
// reviendrait à ne pas l'avoir fait.
function drillStart(pieceId,onDone){
  const def=PIECES.find(p=>p.id===pieceId);
  if(!def){if(onDone)onDone();return;}
  _drill={pieceId,color:'w',pos:null,dots:new Set(),onDone,sel:false,done:false};
  drillReset();
  showPage('page-drill');
}

// Nouvelle position de départ sur la première rangée du joueur (rangée du
// bas, r=7) et nouveaux repères.
function drillReset(){
  if(!_drill)return;
  _drill.pos={r:7,c:Math.floor(Math.random()*8)};
  _drill.dots=drillLayDots(_drill.pos,_drill.pieceId,_drill.color);
  _drill.sel=false;
  _drill.done=false;
  drillRender();
}

function drillRender(){
  const board=document.getElementById('drill-board');
  if(!board||!_drill)return;
  const def=PIECES.find(p=>p.id===_drill.pieceId);
  const legal=_drill.sel?drillMovesFrom(_drill.pos,_drill.pieceId,_drill.color):[];
  const isLegal=(r,c)=>legal.some(m=>m.r===r&&m.c===c);
  let html='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const light=(r+c)%2===0;
    const here=_drill.pos.r===r&&_drill.pos.c===c;
    const dot=_drill.dots.has(r+','+c);
    html+='<div class="drill-cell '+(light?'light':'dark')+
      (here&&_drill.sel?' drill-sel':'')+(isLegal(r,c)?' drill-legal':'')+
      '" data-r="'+r+'" data-c="'+c+'">'+
      (dot?'<span class="drill-dot"></span>':'')+
      (here?pieceSVG(_drill.pieceId,_drill.color):'')+
    '</div>';
  }
  board.innerHTML=html;

  const title=document.getElementById('drill-title');
  if(title)title.innerHTML='Apprivoiser '+escH(def.name);
  // Le rappel du déplacement : le schéma de la pièce (js/piece-moves.js), pas
  // la phrase qui décrivait ses cases — c'est justement cette traduction-là
  // que l'exercice remplace.
  const sub=document.getElementById('drill-sub');
  if(sub)sub.innerHTML=(typeof pieceMoveDiagramHTML==='function')
    ?pieceMoveDiagramHTML(_drill.pieceId,{legend:true,cls:'pmv-sm'}):'';
  const count=document.getElementById('drill-count');
  if(count)count.textContent=_drill.dots.size?('Repères restants : '+_drill.dots.size):'Tous les repères sont pris !';
  const warn=document.getElementById('drill-warn');
  if(warn){
    const stuck=_drill.dots.size>0&&!drillAllReachable();
    warn.textContent=stuck?'Ce repère n\'est plus atteignable d\'ici. Recommencez pour repartir de zéro.':'';
    warn.style.display=stuck?'':'none';
  }
}

function drillCellClick(r,c){
  if(!_drill||_drill.done)return;
  if(_drill.pos.r===r&&_drill.pos.c===c){_drill.sel=!_drill.sel;drillRender();return;}
  const legal=drillMovesFrom(_drill.pos,_drill.pieceId,_drill.color);
  if(!legal.some(m=>m.r===r&&m.c===c)){
    // Un clic hors de portée sélectionne la pièce plutôt que de ne rien
    // faire : le joueur voit alors où elle peut aller.
    _drill.sel=true;drillRender();return;
  }
  _drill.pos={r,c};
  const key=r+','+c;
  const took=_drill.dots.delete(key);
  _drill.sel=false;
  if(typeof playSound==='function')playSound(took?'capture':'move');
  drillRender();
  if(!_drill.dots.size)drillFinish();
}

function drillFinish(){
  if(!_drill||_drill.done)return;
  _drill.done=true;
  if(typeof playSound==='function')playSound('win');
  const board=document.getElementById('drill-board');
  if(board)board.classList.add('drill-cleared');
  const cb=_drill.onDone;
  // Une seconde de répit : l'exercice se termine sur une réussite visible,
  // pas sur un écran qui disparaît sous le curseur.
  setTimeout(()=>{
    if(board)board.classList.remove('drill-cleared');
    _drill=null;
    if(cb)cb();
  },900);
}

// Hors tutoriel : proposé au déblocage d'une créature inédite (coffre). Rend
// true si l'exercice a bien été lancé, pour que l'appelant sache qu'il doit
// attendre son `onDone` avant d'enchaîner.
function drillMaybeForPiece(pieceId,onDone){
  if(!PIECES.find(p=>p.id===pieceId)){if(onDone)onDone();return false;}
  drillStart(pieceId,onDone);
  return true;
}

document.addEventListener('DOMContentLoaded',()=>{
  const board=document.getElementById('drill-board');
  if(board)board.addEventListener('click',e=>{
    const cell=e.target.closest('.drill-cell');
    if(!cell)return;
    drillCellClick(+cell.dataset.r,+cell.dataset.c);
  });
  document.getElementById('drill-restart')?.addEventListener('click',drillReset);
});
