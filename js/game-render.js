// ================================================================
// GAME-RENDER.JS — Rendu du plateau de jeu, interactions (clic/drag&drop),
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
  showPieceCtxMenu(e,pd||{emoji:getPieceEmoji(cell),name:pid},opts);
}
window.activatePower=()=>{
  if(!ctxActivePower)return;
  const{r,c,pieceId,color}=ctxActivePower;
  if(pieceId==='garde-pierre'){
    if(GS.gardePierreUsed[color]){showNotif('Déjà utilisé !');return;}
    GS.anchored=GS.anchored||new Set();GS.anchored.add(`${r},${c}`);GS.gardePierreUsed[color]=true;
    recordMove(GS.board[r][c],{r,c},false,GS);GS.turn=opp(GS.turn);GS.turnCount++;
    showNotif('Garde de Pierre ancré !','ok');postMoveUpdate(GS);
  }
  closeCtx();
};

// ----------------------------------------------------------------
// RENDU DU PLATEAU DE JEU
// ----------------------------------------------------------------
function renderGame(gs){
  if(gs.historyView!==null){updateHistoryNav();return;}
  const boardEl=document.getElementById('game-board');if(!boardEl)return;
  const b=gs.board;
  const playerCol=gs.playerColor||'w';
  const aiCol=gs.aiColor||'b';
  const flipped=playerCol==='b'; // échiquier retourné si le joueur joue les noirs
  let html='';
  for(let vi=0;vi<8;vi++)for(let c=0;c<8;c++){
    // vi = index visuel de rangée (0=haut), r = index réel dans board[]
    const r=flipped?7-vi:vi;
    const vc=flipped?7-c:c; // colonne visuelle
    const isLight=(r+c)%2===0;const cell=b[r][c];
    let cls='gc '+(isLight?'l':'d');
    const key=`${r},${c}`;
    if(gs.selected&&gs.selected.r===r&&gs.selected.c===c)cls+=' sel';
    const isAvail=gs.legalMoves.some(m=>m.r===r&&m.c===c&&!m.stayPut);
    const hasEnemy=cell&&gs.legalMoves.some(m=>m.r===r&&m.c===c&&!m.stayPut)&&cell.color!==gs.turn;
    if(isAvail&&hasEnemy)cls+=' avail-cap';
    else if(isAvail)cls+=' avail';
    if(gs.lastMove&&((gs.lastMove.from.r===r&&gs.lastMove.from.c===c)||(gs.lastMove.to.r===r&&gs.lastMove.to.c===c)))cls+=' last-move';
    if(gs.lastMove&&gs.lastMove.capture&&gs.lastMove.to.r===r&&gs.lastMove.to.c===c)cls+=' cap-flash';
    const isAnchored=gs.anchored?.has(key);
    let showCell=cell;
    let inner='';
    if(showCell){
      const em=getPieceEmoji(showCell);const paraStyle=gs.medusaParalyzed?.has(key)?'filter:sepia(1) brightness(.55);':'';
      let displayEm=em;let badge='';
      inner='<div class="gc-piece'+(isAnchored?' gc-anchored':'')+'" style="'+paraStyle+'" data-r="'+r+'" data-c="'+c+'">'+displayEm+badge+(isAnchored?'<span style="position:absolute;bottom:0;right:0;font-size:7px">⚓</span>':'')+'</div>';
    }
    html+='<div class="'+cls+'" data-r="'+r+'" data-c="'+c+'">'+inner+'</div>';
  }
  boardEl.innerHTML=html;
  boardEl.querySelectorAll('.gc').forEach(el=>{
    const r=+el.dataset.r,c=+el.dataset.c;
    el.addEventListener('click',()=>{
      if(gs.gameOver||gs.turn!==playerCol)return;
      if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
      handleGameClick(r,c,gs);
    });
    // Touch tap sur mobile : si pas de drag actif, traiter comme un clic
    el.addEventListener('touchend',e=>{
      if(gs.gameOver||gs.turn!==playerCol)return;
      if(dragState&&dragState.moved)return; // drag actif, géré par endDrag
      if(gs.historyView!==null){gs.historyView=null;renderGame(gs);updateStatus(gs);updateHistoryNav();return;}
      e.preventDefault();
      handleGameClick(r,c,gs);
    },{passive:false});
    el.addEventListener('contextmenu',e=>showCtxMenu(e,r,c,gs));
  });
  boardEl.querySelectorAll('.gc-piece[data-r]').forEach(el=>{
    const r=+el.dataset.r,c=+el.dataset.c;const cell=b[r][c];
    if(!cell||cell.color!==playerCol||gs.turn!==playerCol||gs.gameOver)return;
    el.addEventListener('mousedown',e=>{
      if(e.button!==0)return;if(gs.historyView!==null)return;
      startDrag(r,c,gs,e.clientX,e.clientY);
    });
    el.addEventListener('touchstart',e=>{
      if(gs.historyView!==null)return;
      const t=e.touches[0];
      startDrag(r,c,gs,t.clientX,t.clientY);
    },{passive:true});
  });
  buildGameLabels(gs);updateCaptured(gs);updateHistoryNav();renderClocks(gs);
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
  hEl.classList.toggle('clock-active',gs.turn===playerCol&&!gs.gameOver);
  aEl.classList.toggle('clock-active',gs.turn===aiCol&&!gs.gameOver);
  hEl.classList.toggle('clock-low',hTime<30000);
  aEl.classList.toggle('clock-low',aTime<30000);
}

function buildGameLabels(gs){
  const rowLabels=document.getElementById('game-row-labels');const colLabels=document.getElementById('game-col-labels');
  if(!rowLabels||!colLabels)return;
  const board=document.getElementById('game-board');if(!board)return;
  const flipped=(gs&&gs.playerColor==='b');
  requestAnimationFrame(()=>{
    const cellH=board.offsetHeight/8;
    const rowNums=flipped?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1];
    const colFiles=flipped?[...FILES].reverse():FILES;
    if(cellH===0){requestAnimationFrame(()=>{const cH=board.offsetHeight/8;rowLabels.innerHTML='';colLabels.innerHTML='';for(let i=0;i<8;i++){const d=document.createElement('div');d.className='game-row-lbl';d.style.height=cH+'px';d.textContent=rowNums[i];rowLabels.appendChild(d);}colFiles.forEach(f=>{const d=document.createElement('div');d.className='game-col-lbl';d.textContent=f;colLabels.appendChild(d);});});return;}
    rowLabels.innerHTML='';colLabels.innerHTML='';
    for(let i=0;i<8;i++){const d=document.createElement('div');d.className='game-row-lbl';d.style.height=cellH+'px';d.textContent=rowNums[i];rowLabels.appendChild(d);}
    colFiles.forEach(f=>{const d=document.createElement('div');d.className='game-col-lbl';d.textContent=f;colLabels.appendChild(d);});
  });
}
function updateCaptured(gs){
  const cw=document.getElementById('cap-white');const cb=document.getElementById('cap-black');
  if(cw)cw.innerHTML=gs.capturedW.join('');if(cb)cb.innerHTML=gs.capturedB.join('');
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
  dragState={fromR:r,fromC:c,gs,moved:false,startX:clientX,startY:clientY};
  dragGhost.textContent=getPieceEmoji(cell);
  dragGhost.style.left=clientX+'px';dragGhost.style.top=clientY+'px';
  if(!alreadySelected)renderGame(gs);
}
function moveDrag(clientX,clientY){
  if(!dragState)return;
  const dx=clientX-dragState.startX,dy=clientY-dragState.startY;
  if(!dragState.moved&&Math.sqrt(dx*dx+dy*dy)>6){
    dragState.moved=true;
    dragGhost.style.display='block';
  }
  if(dragState.moved){
    dragGhost.style.left=clientX+'px';dragGhost.style.top=clientY+'px';
  }
}
function endDrag(clientX,clientY){
  if(!dragState)return;
  dragGhost.style.display='none';
  const gs=dragState.gs;
  const wasDrag=dragState.moved;
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
  else badge.textContent=total>0?total+' coups joués':'';
  document.getElementById('hist-first').disabled=(view===null&&total===0)||(view===0);
  document.getElementById('hist-prev').disabled=(view===null&&total===0)||(view===0);
  document.getElementById('hist-next').disabled=(view===null);
  document.getElementById('hist-last').disabled=(view===null);
}
function renderHistoryPosition(idx){
  const snap=GS.history[idx];if(!snap)return;
  renderBoardFromSnapshot(snap.board,null);updateHistoryNav();
  const bar=document.getElementById('game-status');
  if(bar){bar.textContent='Historique — position '+idx+'/'+GS.history.length;bar.className='status-bar';}
}
function renderBoardFromSnapshot(board,lastMove){
  const boardEl=document.getElementById('game-board');if(!boardEl)return;
  const flipped=GS&&GS.playerColor==='b';
  let html='';
  for(let vi=0;vi<8;vi++)for(let vc=0;vc<8;vc++){
    const r=flipped?7-vi:vi;
    const c=flipped?7-vc:vc;
    const isLight=(r+c)%2===0;const cell=board[r][c];
    let cls='gc '+(isLight?'l':'d');
    if(lastMove&&((lastMove.from?.r===r&&lastMove.from?.c===c)||(lastMove.to?.r===r&&lastMove.to?.c===c)))cls+=' last-move';
    const inner=cell?'<div class="gc-piece">'+getPieceEmoji(cell)+'</div>':'';
    html+='<div class="'+cls+'" data-r="'+r+'" data-c="'+c+'">'+inner+'</div>';
  }
  boardEl.innerHTML=html;buildGameLabels(GS);
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
// STATUT DE PARTIE (échec/mat/pat/nulle) — appelée par postMoveUpdate()
// dans rules-engine.js. Déclenche triggerEndOfGame() (game-flow.js) ou
// triggerTournoiEndOfGame() (tournoi.js) selon le contexte.
// ----------------------------------------------------------------
function updateStatus(gs){
  const bar=document.getElementById('game-status');if(!bar)return;
  const qBtn=document.getElementById('game-quit');
  if(qBtn)qBtn.textContent=gs.gameOver?'Quitter':'Abandonner';
  if(gs.historyView!==null){bar.textContent='Historique — coup '+gs.historyView+'/'+gs.history.length;bar.className='status-bar';return;}
  const t=gs.turn;

  // Règle des 50 coups
  if(gs.halfmoveClock>=100){
    bar.textContent='Nulle — règle des 50 coups';bar.className='status-bar';
    gs.gameOver=true;if(!_endGameTriggered)triggerEndOfGame('draw');return;
  }

  // Mat insuffisant
  if(isInsufficientMaterial(gs.board)){
    bar.textContent='Nulle — matériel insuffisant';bar.className='status-bar';
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
      bar.textContent='Nulle — répétition de position (3×)';bar.className='status-bar';
      gs.gameOver=true;if(!_endGameTriggered)triggerEndOfGame('draw');return;
    }
  }

  const check=isInCheckSimple(t,gs.board);
  const hasLegal=hasLegalMovesForColor(t,gs.board,gs);
  const playerCol=gs.playerColor||'w';
  const aiCol=gs.aiColor||'b';
  if(!hasLegal){
    if(check){
      const playerWins=opp(t)===playerCol;
      bar.textContent='Échec et mat ! '+(playerWins?'Vous gagnez !':'L\'IA gagne !');
      bar.className='status-bar mate';gs.gameOver=true;
      if(!_endGameTriggered)triggerEndOfGame(playerWins?'win':'loss');
      playSound(playerWins?'win':'loss');
    }else{
      bar.textContent='Pat — Partie nulle (aucun coup légal)';
      bar.className='status-bar';gs.gameOver=true;
      if(!_endGameTriggered)triggerEndOfGame('draw');
    }
    return;
  }
  if(check){bar.textContent='Échec ! Tour : '+(t===playerCol?'Vous':'IA');bar.className='status-bar check';playSound('check');}
  else{
    if(t===aiCol){
      const inst=AI_INSTRUCTORS[selectedAILevel];
      const timeStr=inst.timeMs===0?'':inst.timeMs<1000?' ('+inst.timeMs+'ms)':' (~'+Math.round(inst.timeMs/1000)+'s)';
      bar.textContent=inst.emoji+' '+inst.name+' réfléchit…'+timeStr;
    }else bar.textContent='Votre tour ('+(playerCol==='w'?'Blancs':'Noirs')+')';
    bar.className='status-bar '+(t===aiCol?'thinking':'ok');
  }
}

// Rebuild des repères du plateau au redimensionnement de la fenêtre.
window.addEventListener("resize",()=>{if(document.getElementById("page-game").classList.contains("active")&&typeof GS!=="undefined")buildGameLabels(GS);});
