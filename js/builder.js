// ================================================================
// BUILDER.JS — Page de composition d'armée (#page-builder)
// ================================================================
// Contient : la logique de sélection des pièces (Monarque/Général/3 pièces
// libres, budget 24 points), les filtres (tri, classes), le rendu des cartes
// de pièces et des slots de composition, et les boutons de la topbar
// (réinitialiser / valider / mes armées / voie / tournoi).
//
// Dépendances : data-pieces.js (PIECES, CLASS_ORDER, filters via main.js),
// main.js (army, filters, editingArmyId, builderMode, showPieceCtxMenu,
// showNotif, updateBuilderBanner), accounts.js (VV_UNLOCKED),
// board-placement.js (openBoardPage), armies.js (renderArmiesPage/renderAiArmiesPage).
//
// Si vous ajoutez un filtre ou changez les règles de composition d'armée
// (budget, nombre de pièces), c'est ici. Le rendu visuel des cartes suit
// les classes CSS .piece-card / .comp-slot définies dans css/style.css
// section [BUILDER].
// ================================================================

// ----------------------------------------------------------------
// HELPERS ARMÉE
// ----------------------------------------------------------------
const isSel=p=>{
  if(p.class==='Monarque')return army.mon?.id===p.id;
  if(p.class==='Général')return army.gen?.id===p.id;
  if(p.class==='Primordiale')return army.prims.some(x=>x?.id===p.id);
  return army.pcs.some(x=>x?.id===p.id);
};
const getVal=()=>(army.mon?.value||0)+(army.gen?.value||0)+army.prims.reduce((s,p)=>s+(p?.value||0),0)+army.pcs.reduce((s,p)=>s+(p?.value||0),0);
const totalCt=()=>(army.mon?1:0)+(army.gen?1:0)+army.pcs.filter(Boolean).length+army.prims.filter(Boolean).length;
const armyValid=()=>army.mon&&army.gen&&(army.pcs.filter(Boolean).length+army.prims.filter(Boolean).length)===3;
const extraPieces=()=>[...army.pcs.filter(Boolean),...army.prims.filter(Boolean)];

window.removePiece=(type,idx)=>{
  if(type==='mon')army.mon=null;
  else if(type==='gen')army.gen=null;
  else{
    const all=extraPieces();const p=all[idx];if(!p)return;
    if(p.class==='Primordiale'){const i=army.prims.findIndex(x=>x?.id===p.id);if(i!==-1)army.prims.splice(i,1);}
    else{const i=army.pcs.findIndex(x=>x?.id===p.id);if(i!==-1){army.pcs.splice(i,1);while(army.pcs.length<3)army.pcs.push(null);}}
  }
  updAll();
};

// ----------------------------------------------------------------
// RENDU SLOTS DE COMPOSITION
// ----------------------------------------------------------------
const updSlots=()=>{
  const g=document.getElementById('comp-grid');const all=extraPieces();
  const mk=(cls,lbl,p,rm)=>p
    ?'<div class="comp-slot filled '+cls+'" data-pid="'+p.id+'"><div class="cs-label">'+lbl+'</div><span class="cs-emoji">'+p.emoji+'</span><div class="cs-name">'+p.name+'</div><div class="cs-val">'+p.value+' pts</div><div class="cs-rm" onclick="'+rm+'">'+svgX+'</div></div>'
    :'<div class="comp-slot"><div class="cs-label">'+lbl+'</div><div style="font-size:28px;opacity:.15;margin-top:8px">?</div></div>';
  const ic=['Pièce 1','Pièce 2','Pièce 3'];
  let h=mk('Monarque','Monarque',army.mon,"removePiece('mon')")+mk('Général','Général',army.gen,"removePiece('gen')");
  for(let i=0;i<3;i++)h+=mk(all[i]?.class||'',ic[i],all[i],"removePiece('pc',"+i+")");
  g.innerHTML=h;
  g.querySelectorAll('.comp-slot.filled[data-pid]').forEach(el=>{
    el.addEventListener('contextmenu',e=>{
      const p=PIECES.find(x=>x.id===el.dataset.pid);if(!p)return;
      showPieceCtxMenu(e,p);
    });
  });
};
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
    if(sel){const i=army.prims.findIndex(x=>x?.id===p.id);if(i!==-1)army.prims.splice(i,1);}
    else{if(army.prims.filter(Boolean).length>=1){showNotif('1 primordiale maximum.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}if(extraPieces().length>=3){showNotif('3 pièces max.');return;}army.prims.push(p);}
  }else{
    if(sel){const i=army.pcs.findIndex(x=>x?.id===p.id);if(i!==-1){army.pcs.splice(i,1);while(army.pcs.length<3)army.pcs.push(null);}}
    else{if(extraPieces().length>=3){showNotif('3 pièces max.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}const idx=army.pcs.findIndex(x=>!x);if(idx!==-1)army.pcs[idx]=p;}
  }
  updAll();
};

// ----------------------------------------------------------------
// TRI / FILTRAGE / RENDU DES CARTES
// ----------------------------------------------------------------
const getSorted=()=>[...PIECES].filter(p=>filters.classes.has(p.class)).sort((a,b)=>{const d=CLASS_ORDER[a.class]-CLASS_ORDER[b.class];return d||(filters.order==='asc'?a.value-b.value:b.value-a.value);});

const renderCards=()=>{
  const ps=getSorted();const byClass={};
  ps.forEach(p=>{if(!byClass[p.class])byClass[p.class]=[];byClass[p.class].push(p);});
  let html='';
  ['Monarque','Général','Primordiale','Brute','Sorcier','Mirage','Maudit'].forEach(cls=>{
    if(!byClass[cls]?.length)return;
    html+='<div class="class-sec"><div class="class-hdr '+cls+'"><span class="class-hdr-name '+cls+'">'+cls+'</span><span class="class-hdr-ct">'+byClass[cls].length+' pièce'+(byClass[cls].length>1?'s':'')+'</span></div><div class="cards-grid">';
    byClass[cls].forEach(p=>{
      const unlocked=VV_UNLOCKED.has(p.id);
      if(!unlocked){
        const m=UNLOCK_MILESTONES.find(u=>u.pieceId===p.id);
        const isCoffre=m?.coffre;
        const rankLabel=isCoffre?'🗝 Coffre':(m&&m.eloRequired<999999?vvGetRank(m.eloRequired).name+' ('+m.eloRequired+' ELO)':'');
        html+='<div class="piece-card '+p.class+' locked" data-id="'+p.id+'"><span class="pc-emoji">'+p.emoji+'</span><div class="pc-head"><div class="pc-name">'+p.name+'</div><div class="pc-val '+p.class+'">'+p.value+'</div></div><div class="pc-class '+p.class+'">'+p.class+'</div>'+(p.movement?'<div class="pc-mvt">🚶 '+p.movement+'</div>':'')+'<div class="locked-overlay"><span class="lock-icon">🔒</span><span class="lock-rank">'+rankLabel+'</span></div></div>';
      }else{
        html+='<div class="piece-card '+p.class+(isSel(p)?' sel':'')+'" data-id="'+p.id+'"><span class="pc-emoji">'+p.emoji+'</span><div class="pc-head"><div class="pc-name">'+p.name+'</div><div class="pc-val '+p.class+'">'+p.value+'</div></div><div class="pc-class '+p.class+'">'+p.class+'</div>'+(p.movement?'<div class="pc-mvt">🚶 '+p.movement+'</div>':'')+(p.ability?'<div class="pc-ability">✨ '+p.ability+'</div>':'')+'</div>';
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
};

function updateBuilderBanner(){
  const banner=document.getElementById('builder-mode-banner');
  const armyTitle=document.querySelector('.army-box-title');
  if(builderMode==='ai'){banner.textContent='⚙ Mode IA — Vous composez une armée pour l\'IA adversaire';banner.classList.add('show');if(armyTitle)armyTitle.textContent='⚙ Armée de l\'IA';}
  else{banner.classList.remove('show');if(armyTitle)armyTitle.textContent='⚔ Votre armée';}
}

// ----------------------------------------------------------------
// LISTENERS UI
// ----------------------------------------------------------------
document.querySelectorAll('.sort-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');filters.order=btn.dataset.order;renderCards();}));
document.querySelectorAll('.clf-btn').forEach(btn=>btn.addEventListener('click',()=>{const c=btn.dataset.class;if(filters.classes.has(c)){filters.classes.delete(c);btn.classList.remove('on');}else{filters.classes.add(c);btn.classList.add('on');}renderCards();}));
document.getElementById('b-reset').addEventListener('click',()=>{army={mon:null,gen:null,pcs:[null,null,null],prims:[]};editingArmyId=null;updAll();});
document.getElementById('b-validate').addEventListener('click',()=>{if(armyValid())openBoardPage();});
document.getElementById('b-armies').addEventListener('click',()=>{if(builderMode==='ai'){renderAiArmiesPage();showPage('page-ai-armies');}else{renderArmiesPage();showPage('page-armies');}});