// ================================================================
// BOARD-PLACEMENT.JS — Page de placement des pièces sur l'échiquier (#page-board)
// ================================================================
// Contient : la logique de placement pré-partie où le joueur choisit sur
// quelle colonne poser chacune de ses 3 pièces libres (le Monarque et le
// Général sont fixes au centre, les pions se placent automatiquement).
// Le placement est symétrique : poser une pièce sur une colonne pose
// automatiquement son miroir sur la colonne opposée.
//
// Dépendances : main.js (army, extraPieces via builder.js, boardSaveTarget,
// editingArmyId, builderMode, showPage, showNotif), accounts.js
// (savedArmies/savedAiArmies, saveArmies/saveAiArmies), armies.js
// (renderArmiesPage/renderAiArmiesPage), data-pieces.js (PIECES).
//
// Constantes de plateau (MC, GC, PR, PAWR, mirrorCol) définies dans main.js.
// ================================================================

const initBoard=()=>{
  boardGrid=Array.from({length:8},()=>Array(8).fill(null));
  placedMap={};selectedTray=null;
  for(let c=0;c<8;c++)boardGrid[PAWR][c]={kind:'pawn',emoji:'♙'};
  boardGrid[PR][MC]={kind:'fixed',emoji:army.mon.emoji,name:army.mon.name,pieceClass:army.mon.class};
  boardGrid[PR][GC]={kind:'fixed',emoji:army.gen.emoji,name:army.gen.name,pieceClass:army.gen.class};
};
const canPlace=col=>{
  if(col===MC||col===GC)return false;const mc=mirrorCol(col);
  if(mc===MC||mc===GC)return false;if(boardGrid[PR][col]!==null)return false;return true;
};
const countPlaced=()=>extraPieces().filter(p=>(placedMap[p.id]||0)>0).length;
const allPlaced=()=>countPlaced()>=extraPieces().length;
const doPlace=(col,piece)=>{
  boardGrid[PR][col]={kind:'placed',emoji:piece.emoji,name:piece.name,pieceId:piece.id,removable:true};
  const mc=mirrorCol(col);
  boardGrid[PR][mc]={kind:'mirror',emoji:piece.emoji,name:piece.name,pieceId:piece.id,mirrorOf:col,removable:true};
  placedMap[piece.id]=(placedMap[piece.id]||0)+1;selectedTray=null;
};
const doRemove=col=>{
  const cell=boardGrid[PR][col];if(!cell||!cell.removable)return;
  const pid=cell.pieceId;const mc=mirrorCol(col);
  boardGrid[PR][col]=null;boardGrid[PR][mc]=null;
  if(placedMap[pid]>0)placedMap[pid]--;
};
const cellCls=(r,c)=>{
  const l=(r+c)%2===0;
  if(r===PR)return l?'zr1l':'zr1d';if(r===PAWR)return l?'zr2l':'zr2d';
  if(r>=2&&r<=5)return l?'zmidl':'zmidd';return l?'zenyl':'zenyd';
};
const renderBoard=()=>{
  const board=document.getElementById('chessboard');const hasSel=!!selectedTray;let html='';
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const zc=cellCls(r,c);const cell=boardGrid[r][c];const mc=mirrorCol(c);
      let cls='cell '+zc;let inner='';let attrs='';
      if(cell){
        if(cell.kind==='pawn'){cls+=' no-click';inner='<span class="pc-cell">♙</span>';}
        else if(cell.kind==='fixed'){const gc=cell.pieceClass==='Monarque'?'#3b82f6':cell.pieceClass==='Général'?'#f97316':'#aaa';cls+=' no-click';inner='<span class="pc-cell" style="filter:drop-shadow(0 0 5px '+gc+')">'+cell.emoji+'</span>';}
        else if(cell.kind==='placed'||cell.kind==='mirror'){cls+=' no-click';inner='<span class="pc-cell rmv" data-pid="'+cell.pieceId+'" onclick="handleRemove('+c+')">'+cell.emoji+'</span>';}
      }else{
        if(r===PR&&hasSel&&canPlace(c)){cls+=' can-place';attrs='data-col="'+c+'" data-mc="'+mc+'"';}
        else cls+=' no-click';
      }
      html+='<div class="'+cls+'" '+attrs+'>'+inner+'</div>';
    }
  }
  board.innerHTML=html;
  board.querySelectorAll('.can-place').forEach(el=>{
    const myCol=parseInt(el.dataset.col),myMc=parseInt(el.dataset.mc);
    el.addEventListener('click',()=>handlePlace(myCol));
    el.addEventListener('mouseenter',()=>{const cells=board.children;const mIdx=PR*8+myMc;if(cells[mIdx])cells[mIdx].classList.add('mhigh');});
    el.addEventListener('mouseleave',()=>{board.querySelectorAll('.mhigh').forEach(x=>x.classList.remove('mhigh'));});
  });
  // Clic droit sur une pièce posée sur le plateau → afficher les infos
  board.querySelectorAll('.pc-cell[data-pid]').forEach(el=>{
    el.addEventListener('contextmenu',e=>{
      const p=PIECES.find(x=>x.id===el.dataset.pid);if(!p)return;
      showPieceCtxMenu(e,p);
    });
  });
};
const renderTray=()=>{
  const extras=extraPieces();let html='';
  extras.forEach(p=>{
    const done=(placedMap[p.id]||0)>0;const active=selectedTray?.id===p.id;
    html+='<div class="tray-item'+(done?' placed':'')+(active?' active-pick':'')+'" data-pid="'+p.id+'"><span class="tray-emoji">'+p.emoji+'</span><span class="tray-name">'+p.name+'</span>'+(done?'<span class="tray-check">✓</span>':'')+'</div>';
  });
  document.getElementById('tray-items').innerHTML=html;
  document.querySelectorAll('.tray-item:not(.placed)').forEach(el=>{
    el.addEventListener('click',()=>{const p=extraPieces().find(x=>x.id===el.dataset.pid);selectedTray=selectedTray?.id===p.id?null:p;renderTray();updBoardInfo();renderBoard();});
    el.addEventListener('contextmenu',e=>{const p=PIECES.find(x=>x.id===el.dataset.pid);showPieceCtxMenu(e,p);});
  });
  document.querySelectorAll('.tray-item.placed').forEach(el=>{
    el.style.pointerEvents='auto';
    el.addEventListener('contextmenu',e=>{const p=PIECES.find(x=>x.id===el.dataset.pid);showPieceCtxMenu(e,p);});
  });
};
const updBoardInfo=()=>{
  document.getElementById('bd-save').disabled=!allPlaced();
  const box=document.getElementById('bd-info');
  if(selectedTray)box.textContent='Sélectionné : '+selectedTray.emoji+' '+selectedTray.name+' — Cliquez sur la rangée 1.';
  else if(allPlaced())box.textContent='Toutes les pièces sont placées ! Vous pouvez enregistrer.';
  else box.textContent='Sélectionnez une pièce puis cliquez sur une case disponible.';
};
const buildBoardLabels=()=>{
  const rl=document.getElementById('row-labels-col');const cl=document.getElementById('col-labels-row');
  if(!rl||!cl)return;
  requestAnimationFrame(()=>{
    const board=document.getElementById('chessboard');if(!board)return;
    const cellH=board.offsetWidth/8;
    rl.innerHTML='';cl.innerHTML='';
    for(let i=0;i<8;i++){const d=document.createElement('div');d.className='row-lbl';d.style.height=cellH+'px';d.textContent=8-i;rl.appendChild(d);}
    ['A','B','C','D','E','F','G','H'].forEach(f=>{const d=document.createElement('div');d.className='col-lbl';d.textContent=f;cl.appendChild(d);});
  });
};
window.handlePlace=col=>{if(!selectedTray||!canPlace(col))return;doPlace(col,selectedTray);renderTray();updBoardInfo();renderBoard();};
window.handleRemove=col=>{doRemove(col);renderTray();updBoardInfo();renderBoard();};
const openBoardPage=()=>{
  initBoard();boardSaveTarget=builderMode;
  document.getElementById('board-page-title').textContent=builderMode==='ai'?'Placement — Armée de l\'IA':'Placement des pièces';
  showPage('page-board');buildBoardLabels();renderTray();updBoardInfo();renderBoard();
};
window.addEventListener('resize',()=>{
  if(document.getElementById('page-board').classList.contains('active')){buildBoardLabels();renderBoard();}
  if(document.getElementById('page-game').classList.contains('active'))buildGameLabels(GS);
});
document.getElementById('bd-back').addEventListener('click',()=>showPage('page-builder'));
document.getElementById('bd-save').addEventListener('click',()=>{
  if(!allPlaced())return;
  const placements={};
  for(let c=0;c<8;c++){const cell=boardGrid[PR][c];if(cell&&cell.kind==='placed')placements[cell.pieceId]=c;}
  const isAi=boardSaveTarget==='ai';const targetList=isAi?savedAiArmies:savedArmies;
  const ad={
    id:editingArmyId||Date.now().toString(),
    createdAt:editingArmyId?(targetList.find(a=>a.id===editingArmyId)?.createdAt||Date.now()):Date.now(),
    updatedAt:Date.now(),mon:{id:army.mon.id},gen:{id:army.gen.id},
    extras:extraPieces().map(p=>p.id),placements,totalValue:getVal()
  };
  if(editingArmyId){const idx=targetList.findIndex(a=>a.id===editingArmyId);if(idx!==-1)targetList[idx]=ad;else targetList.push(ad);}
  else targetList.push(ad);
  if(isAi){savedAiArmies=targetList;saveAiArmies();}else{savedArmies=targetList;saveArmies();}
  editingArmyId=null;showNotif('Armée enregistrée !','ok');
  setTimeout(()=>{if(isAi){renderAiArmiesPage();showPage('page-ai-armies');}else{renderArmiesPage();showPage('page-armies');}},700);
});