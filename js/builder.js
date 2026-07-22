// ================================================================
// BUILDER.JS — Page de composition d'armée (#page-builder)
// ================================================================
// Contient : la logique de sélection des pièces (Monarque/Général/3 pièces
// libres, budget 24 points), le rendu des cartes de pièces (triées par
// classe puis valeur croissante, sans tri/filtre manuel) et des slots de
// composition, l'armée aléatoire, et les boutons de la topbar
// (réinitialiser / aléatoire / valider / mes armées / voie / tournoi).
//
// Dépendances : data-pieces.js (PIECES, CLASS_ORDER),
// main.js (army, editingArmyId, builderMode, showPieceCtxMenu,
// showNotif, updateBuilderBanner), accounts.js (VV_UNLOCKED),
// armies.js (renderArmiesPage/renderAiArmiesPage), accounts.js (saveArmies).
//
// Si vous changez les règles de composition d'armée (budget, nombre de
// pièces), c'est ici. Le rendu visuel des cartes suit les classes CSS
// .piece-card / .comp-slot définies dans css/style.css section [BUILDER].
// ================================================================

// ----------------------------------------------------------------
// HELPERS ARMÉE
// ----------------------------------------------------------------
// army.extras : liste ORDONNÉE des pièces choisies (max 3, max 1 Primordiale).
// L'ordre définit la disposition en partie (voir derivePlacements) : la 1re
// pièce est placée le plus près du Monarque/Général, la dernière dans les coins.
const isSel=p=>{
  if(p.class==='Monarque')return army.mon?.id===p.id;
  if(p.class==='Général')return army.gen?.id===p.id;
  return army.extras.some(x=>x?.id===p.id);
};
const getVal=()=>(army.mon?.value||0)+(army.gen?.value||0)+army.extras.reduce((s,p)=>s+(p?.value||0),0);
const totalCt=()=>(army.mon?1:0)+(army.gen?1:0)+army.extras.length;
const armyValid=()=>army.mon&&army.gen&&army.extras.length===3;
const extraPieces=()=>army.extras.slice();

window.removePiece=(type,idx)=>{
  if(type==='mon')army.mon=null;
  else if(type==='gen')army.gen=null;
  else{if(idx>=0&&idx<army.extras.length)army.extras.splice(idx,1);}
  updAll();
};

// ----------------------------------------------------------------
// RENDU SLOTS DE COMPOSITION
// ----------------------------------------------------------------
const updSlots=()=>{
  const g=document.getElementById('comp-grid');const all=extraPieces();
  // eidx = index dans army.extras (uniquement pour les 3 pièces déplaçables)
  const mk=(cls,lbl,p,rm,eidx)=>p
    ?'<div class="comp-slot filled '+cls+(eidx!=null?' draggable-slot':'')+'" data-pid="'+p.id+'"'+(eidx!=null?' draggable="true" data-eidx="'+eidx+'"':'')+'><div class="cs-label">'+lbl+'</div><span class="cs-emoji">'+p.emoji+'</span><div class="cs-name">'+p.name+'</div><div class="cs-val">'+p.value+' pts</div><div class="cs-rm" onclick="'+rm+'">'+svgX+'</div></div>'
    :'<div class="comp-slot"><div class="cs-label">'+lbl+'</div><div style="font-size:28px;opacity:.15;margin-top:8px">?</div></div>';
  const ic=['Pièce 1','Pièce 2','Pièce 3'];
  let h=mk('Monarque','Monarque',army.mon,"removePiece('mon')")+mk('Général','Général',army.gen,"removePiece('gen')");
  for(let i=0;i<3;i++)h+=mk(all[i]?.class||'',ic[i],all[i],"removePiece('pc',"+i+")",all[i]?i:null);
  g.innerHTML=h;
  g.querySelectorAll('.comp-slot.filled[data-pid]').forEach(el=>{
    el.addEventListener('contextmenu',e=>{
      const p=PIECES.find(x=>x.id===el.dataset.pid);if(!p)return;
      showPieceCtxMenu(e,p);
    });
  });
  wireSlotDragSwap(g);
};

// Glisser-déposer entre les 3 slots de pièces pour réordonner (= changer la
// disposition en partie). Le Monarque et le Général ne sont pas déplaçables.
function wireSlotDragSwap(g){
  g.querySelectorAll('.comp-slot.draggable-slot').forEach(el=>{
    el.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',el.dataset.eidx);el.classList.add('slot-dragging');});
    el.addEventListener('dragend',()=>{el.classList.remove('slot-dragging');g.querySelectorAll('.slot-over').forEach(x=>x.classList.remove('slot-over'));});
    el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('slot-over');});
    el.addEventListener('dragleave',()=>el.classList.remove('slot-over'));
    el.addEventListener('drop',e=>{
      e.preventDefault();el.classList.remove('slot-over');
      const from=parseInt(e.dataTransfer.getData('text/plain'),10);
      const to=parseInt(el.dataset.eidx,10);
      if(isNaN(from)||isNaN(to)||from===to)return;
      const tmp=army.extras[from];army.extras[from]=army.extras[to];army.extras[to]=tmp;
      updAll();
    });
  });
}
const updStats=()=>{
  document.getElementById('s-count').textContent=totalCt()+'/5';
  document.getElementById('s-val').textContent=getVal()+'/24';
  document.getElementById('b-validate').disabled=!armyValid();
};
const updAll=()=>{updSlots();renderCards();updStats();};

// ----------------------------------------------------------------
// TOGGLE SÉLECTION D'UNE PIÈCE
// ----------------------------------------------------------------
const toggle=p=>{
  if(!VV_UNLOCKED.has(p.id)){
    const m=UNLOCK_MILESTONES.find(u=>u.pieceId===p.id);
    if(m&&m.coffre)showNotif('🗝 Cette pièce s\'obtient dans un coffre !');
    else showNotif('🔒 Pièce verrouillée — requis : '+(m&&m.eloRequired<999999?vvGetRank(m.eloRequired).name+' ('+m.eloRequired+' ELO)':'ELO insuffisant'));
    return;
  }
  const sel=isSel(p);
  if(p.class==='Monarque'){
    if(sel)army.mon=null;
    else{if(army.mon){showNotif('Vous avez déjà un monarque.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}army.mon=p;}
  }else if(p.class==='Général'){
    if(sel)army.gen=null;
    else{if(army.gen){showNotif('Vous avez déjà un général.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}army.gen=p;}
  }else if(p.class==='Primordiale'){
    if(sel){const i=army.extras.findIndex(x=>x?.id===p.id);if(i!==-1)army.extras.splice(i,1);}
    else{if(army.extras.some(x=>x.class==='Primordiale')){showNotif('1 primordiale maximum.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}if(army.extras.length>=3){showNotif('3 pièces max.');return;}army.extras.push(p);}
  }else{
    if(sel){const i=army.extras.findIndex(x=>x?.id===p.id);if(i!==-1)army.extras.splice(i,1);}
    else{if(army.extras.length>=3){showNotif('3 pièces max.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}army.extras.push(p);}
  }
  updAll();
};

// ----------------------------------------------------------------
// RENDU DES CARTES — toujours triées par classe puis par valeur croissante
// (plus de tri/filtre manuel : voir le bandeau de raccourcis par catégorie,
// géré plus bas par wireClassJumpRail()).
// ----------------------------------------------------------------
const getSorted=()=>[...PIECES].sort((a,b)=>{const d=CLASS_ORDER[a.class]-CLASS_ORDER[b.class];return d||a.value-b.value;});

const renderCards=()=>{
  const ps=getSorted();const byClass={};
  ps.forEach(p=>{if(!byClass[p.class])byClass[p.class]=[];byClass[p.class].push(p);});
  let html='';
  ['Monarque','Général','Primordiale','Brute','Sorcier'].forEach(cls=>{
    if(!byClass[cls]?.length)return;
    html+='<div class="class-sec" id="cls-sec-'+cls+'"><div class="class-hdr '+cls+'"><span class="class-hdr-name '+cls+'">'+cls+'</span></div><div class="cards-grid">';
    byClass[cls].forEach(p=>{
      const unlocked=VV_UNLOCKED.has(p.id);
      if(!unlocked){
        const m=UNLOCK_MILESTONES.find(u=>u.pieceId===p.id);
        const isCoffre=m?.coffre;
        const rankLabel=isCoffre?'🗝 Coffre':(m&&m.eloRequired<999999?vvGetRank(m.eloRequired).name+' ('+m.eloRequired+' ELO)':'');
        html+='<div class="piece-card '+p.class+' locked" data-id="'+p.id+'"><span class="pc-emoji">'+p.emoji+'</span><div class="pc-head"><div class="pc-name">'+p.name+'</div><div class="pc-val '+p.class+'">'+p.value+'</div></div>'+(p.movement?'<div class="pc-mvt">🚶 '+p.movement+'</div>':'')+'<div class="locked-overlay"><span class="lock-icon">🔒</span><span class="lock-rank">'+rankLabel+'</span></div></div>';
      }else{
        html+='<div class="piece-card '+p.class+(isSel(p)?' sel':'')+'" data-id="'+p.id+'"><span class="pc-emoji">'+p.emoji+'</span><div class="pc-head"><div class="pc-name">'+p.name+'</div><div class="pc-val '+p.class+'">'+p.value+'</div></div>'+(p.movement?'<div class="pc-mvt">🚶 '+p.movement+'</div>':'')+(p.ability?'<div class="pc-ability">✨ '+p.ability+'</div>':'')+'</div>';
      }
    });
    html+='</div></div>';
  });
  document.getElementById('cards-container').innerHTML=html;
  document.querySelectorAll('.piece-card:not(.locked)').forEach(el=>{
    const p=PIECES.find(x=>x.id===el.dataset.id);
    el.addEventListener('click',()=>{if(!el.classList.contains('sel')||isSel(p))toggle(p);});
    el.addEventListener('contextmenu',e=>showPieceCtxMenu(e,p));
  });
  document.querySelectorAll('.piece-card.locked').forEach(el=>{
    const p=PIECES.find(x=>x.id===el.dataset.id);
    if(p)el.addEventListener('contextmenu',e=>showPieceCtxMenu(e,p));
  });
  equalizeCardHeights();
};

// Uniformise la hauteur de toutes les cartes de pièces sur celle de la plus
// grande (le contenu — mouvement/pouvoir — varie beaucoup en longueur).
function equalizeCardHeights(){
  const cards=document.querySelectorAll('.piece-card');
  if(!cards.length)return;
  cards.forEach(el=>{el.style.height='auto';});
  let max=0;
  cards.forEach(el=>{if(el.offsetHeight>max)max=el.offsetHeight;});
  cards.forEach(el=>{el.style.height=max+'px';});
}

function updateBuilderBanner(){
  const banner=document.getElementById('builder-mode-banner');
  const armyTitle=document.querySelector('.army-box-title');
  if(builderMode==='ai'){banner.textContent='⚙ Mode Instructeur — Vous composez une armée pour l\'Instructeur adverse';banner.classList.add('show');if(armyTitle)armyTitle.textContent='⚙ Armée de l\'Instructeur';}
  else{banner.classList.remove('show');if(armyTitle)armyTitle.textContent='⚔ Votre armée';}
}

// ----------------------------------------------------------------
// PLACEMENT DÉRIVÉ DE L'ORDRE + ENREGISTREMENT DE L'ARMÉE
// ----------------------------------------------------------------
// La disposition en partie découle de l'ORDRE des 3 pièces choisies :
// la Pièce 1 flanque directement le Monarque/Général (colonnes 2 & 5),
// la Pièce 2 suit (colonnes 1 & 6), la Pièce 3 occupe les coins (0 & 7).
// buildGameBoard() place à `col` puis miroir en 7-col, d'où une seule colonne
// « gauche » suffit par pièce.
const ORDER_COLS=[2,1,0];
function derivePlacements(orderedPieces){
  const placements={};
  orderedPieces.forEach((p,i)=>{placements[p.id]=ORDER_COLS[i]!==undefined?ORDER_COLS[i]:i;});
  return placements;
}
function saveArmyFromBuilder(){
  if(!armyValid())return;
  const ordered=extraPieces();
  const placements=derivePlacements(ordered);
  const isAi=builderMode==='ai';
  const targetList=isAi?savedAiArmies:savedArmies;
  const ad={
    id:editingArmyId||Date.now().toString(),
    createdAt:editingArmyId?(targetList.find(a=>a.id===editingArmyId)?.createdAt||Date.now()):Date.now(),
    updatedAt:Date.now(),mon:{id:army.mon.id},gen:{id:army.gen.id},
    extras:ordered.map(p=>p.id),placements,totalValue:getVal()
  };
  if(editingArmyId){const idx=targetList.findIndex(a=>a.id===editingArmyId);if(idx!==-1)targetList[idx]=ad;else targetList.push(ad);}
  else targetList.push(ad);
  if(isAi){savedAiArmies=targetList;saveAiArmies();}else{savedArmies=targetList;saveArmies();}
  editingArmyId=null;
  if(isAi){renderAiArmiesPage();showPage('page-ai-armies');}else{renderArmiesPage();showPage('page-armies');}
}

// ----------------------------------------------------------------
// ARMÉE ALÉATOIRE — 1 monarque, 1 général, 3 pièces, tirés parmi les
// pièces débloquées par le joueur (budget 24 pts, 1 primordiale max).
// ----------------------------------------------------------------
function randomizeArmy(){
  const unlocked=VV_UNLOCKED;
  const monarques=PIECES.filter(p=>p.class==='Monarque'&&unlocked.has(p.id));
  const generaux=PIECES.filter(p=>p.class==='Général'&&unlocked.has(p.id));
  const others=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&unlocked.has(p.id));
  if(!monarques.length||!generaux.length||others.length<3){showNotif('Débloquez plus de pièces pour une armée aléatoire complète.','err');return;}
  const rnd=arr=>arr[Math.floor(Math.random()*arr.length)];
  let tries=0;
  while(tries++<2000){
    const mon=rnd(monarques);const gen=rnd(generaux);
    if(mon.value+gen.value>22)continue;
    const budget=24-mon.value-gen.value;
    const pool=[...others].sort(()=>Math.random()-0.5);
    let chosen=[];let val=0;let primCount=0;const usedIds=new Set();
    for(const p of pool){
      if(chosen.length>=3)break;
      if(usedIds.has(p.id))continue;
      if(p.class==='Primordiale'&&primCount>=1)continue;
      if(val+p.value>budget)continue;
      chosen.push(p);val+=p.value;usedIds.add(p.id);
      if(p.class==='Primordiale')primCount++;
    }
    if(chosen.length===3){
      army.mon=mon;army.gen=gen;army.extras=chosen;editingArmyId=null;updAll();return;
    }
  }
  showNotif('Impossible de générer une armée aléatoire avec vos pièces actuelles.','err');
}

// ----------------------------------------------------------------
// LISTENERS UI
// ----------------------------------------------------------------
document.getElementById('b-reset').addEventListener('click',()=>{army={mon:null,gen:null,extras:[]};editingArmyId=null;updAll();});
document.getElementById('b-random').addEventListener('click',randomizeArmy);
document.getElementById('b-validate').addEventListener('click',()=>{if(armyValid())saveArmyFromBuilder();});
document.getElementById('b-armies').addEventListener('click',()=>{if(builderMode==='ai'){renderAiArmiesPage();showPage('page-ai-armies');}else{renderArmiesPage();showPage('page-armies');}});
// Bandeau de raccourcis à droite : clic sur une catégorie → défilement vers
// sa section (les sections n'existent que si la classe a au moins 1 pièce,
// donc un clic sans effet est simplement ignoré).
document.querySelectorAll('.cj-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.getElementById('cls-sec-'+btn.dataset.class)?.scrollIntoView({behavior:'smooth',block:'start'});
  });
});