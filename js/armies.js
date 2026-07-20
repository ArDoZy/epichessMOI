// ================================================================
// ARMIES.JS — Pages "Mes armées" / "Armées IA" + générateur d'armée IA
// ================================================================
// Contient : le rendu des listes d'armées sauvegardées (#page-armies et
// #page-ai-armies), les actions modifier/supprimer/lancer combat/lancer
// tournoi, le chargement d'une armée sauvegardée dans le builder pour
// édition, et generateAIArmy() qui compose une armée aléatoire légale pour
// l'adversaire IA quand aucune armée IA personnalisée n'est choisie.
//
// Dépendances : data-pieces.js (PIECES), accounts.js (savedArmies,
// savedAiArmies, saveArmies, saveAiArmies, VV_UNLOCKED), main.js (army,
// editingArmyId, builderMode, updateBuilderBanner, updAll, showPage,
// showNotif), tournoi.js (tournamentState, renderTournoiPage, startTournoi),
// combat-intro.js (renderCombatPage, launchParticles).
// ================================================================

// ----------------------------------------------------------------
// PAGE ARMÉES JOUEUR
// ----------------------------------------------------------------
const loadArmyForEdit=ad=>{
  const fp=id=>PIECES.find(p=>p.id===id);
  army.mon=fp(ad.mon.id)||null;army.gen=fp(ad.gen.id)||null;army.pcs=[null,null,null];army.prims=[];
  ad.extras.forEach(id=>{const p=fp(id);if(!p)return;if(p.class==='Primordiale')army.prims.push(p);else{const i=army.pcs.findIndex(x=>!x);if(i!==-1)army.pcs[i]=p;}});
  editingArmyId=ad.id;
};

const renderArmiesPage=()=>{
  const grid=document.getElementById('armies-grid');
  if(!savedArmies.length){grid.innerHTML='<div class="empty-armies"><span class="ea-icon">⚔️</span><p>Aucune armée enregistrée.<br>Composez votre première armée !</p></div>';return;}
  grid.innerHTML=savedArmies.map(a=>{
    const mon=PIECES.find(p=>p.id===a.mon.id);const gen=PIECES.find(p=>p.id===a.gen.id);
    const extras=a.extras.map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
    const all=[mon,gen,...extras].filter(Boolean);const isEdited=a.updatedAt&&a.updatedAt!==a.createdAt;
    return '<div class="army-card"><div class="ac-date">Créée le '+fmtDate(a.createdAt)+(isEdited?' · modifiée le '+fmtDate(a.updatedAt):'')+'</div><div class="ac-pieces">'+all.map(p=>'<span title="'+p.name+'">'+p.emoji+'</span>').join('')+'</div><div class="ac-names">'+( mon?.name||'?')+' (Monarque) · '+(gen?.name||'?')+' (Général)<br>'+extras.map(p=>p.name).join(' · ')+'</div><div class="ac-val">⚡ '+a.totalValue+' pts</div><div class="ac-btns"><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="editPlayerArmy(\''+a.id+'\')">Modifier</button><button class="btn btn-gold" style="font-size:11px;padding:6px 12px" onclick="launchCombat(\''+a.id+'\')">Combat</button><button class="btn btn-primary" style="font-size:11px;padding:6px 12px;border-color:var(--accent2)" onclick="launchTournoiFromArmy(\''+a.id+'\')">🏆 Tournoi</button><button class="btn btn-danger" style="font-size:11px;padding:6px 10px" onclick="deletePlayerArmy(\''+a.id+'\')">Suppr.</button></div></div>';
  }).join('');
};
window.editPlayerArmy=id=>{const a=savedArmies.find(x=>x.id===id);if(!a)return;builderMode='player';updateBuilderBanner();loadArmyForEdit(a);updAll();showPage('page-builder');};
window.deletePlayerArmy=id=>{if(!confirm('Supprimer cette armée ?'))return;savedArmies=savedArmies.filter(a=>a.id!==id);saveArmies();renderArmiesPage();};
window.launchTournoiFromArmy=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);currentArmyData=a;
  tournamentState.active=false; // reset pour permettre nouveau tournoi
  renderTournoiPage();showPage('page-tournoi');
  setTimeout(()=>{if(confirm('Lancer un tournoi avec cette armée ?'))startTournoi();},150);
};
document.getElementById('ar-back').addEventListener('click',()=>showPage('page-builder'));
document.getElementById('ar-new').addEventListener('click',()=>{builderMode='player';updateBuilderBanner();army={mon:null,gen:null,pcs:[null,null,null],prims:[]};editingArmyId=null;updAll();showPage('page-builder');});

// ----------------------------------------------------------------
// PAGE ARMÉES IA
// ----------------------------------------------------------------
const renderAiArmiesPage=()=>{
  const grid=document.getElementById('ai-armies-grid');
  if(!savedAiArmies.length){grid.innerHTML='<div class="empty-armies"><span class="ea-icon">🤖</span><p>Aucune armée IA enregistrée.<br>Créez une armée pour l\'IA !</p></div>';return;}
  grid.innerHTML=savedAiArmies.map(a=>{
    const mon=PIECES.find(p=>p.id===a.mon.id);const gen=PIECES.find(p=>p.id===a.gen.id);
    const extras=a.extras.map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
    const all=[mon,gen,...extras].filter(Boolean);
    return '<div class="army-card" style="border-top-color:var(--accent2)"><div class="ac-date">'+fmtDate(a.createdAt)+'</div><div class="ac-pieces">'+all.map(p=>'<span>'+p.emoji+'</span>').join('')+'</div><div class="ac-names">'+(mon?.name||'?')+' · '+(gen?.name||'?')+'<br>'+extras.map(p=>p.name).join(' · ')+'</div><div class="ac-val">⚡ '+a.totalValue+' pts</div><div class="ac-btns"><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="editAiArmy(\''+a.id+'\')">Modifier</button><button class="btn btn-primary" style="font-size:11px;padding:6px 12px" onclick="selectAiArmy(\''+a.id+'\')">Choisir</button><button class="btn btn-danger" style="font-size:11px;padding:6px 10px" onclick="deleteAiArmy(\''+a.id+'\')">Suppr.</button></div></div>';
  }).join('');
};
window.editAiArmy=id=>{const a=savedAiArmies.find(x=>x.id===id);if(!a)return;builderMode='ai';updateBuilderBanner();loadArmyForEdit(a);updAll();showPage('page-builder');};
window.deleteAiArmy=id=>{if(!confirm('Supprimer ?'))return;savedAiArmies=savedAiArmies.filter(a=>a.id!==id);saveAiArmies();renderAiArmiesPage();};
window.selectAiArmy=id=>{
  const a=savedAiArmies.find(x=>x.id===id);if(!a)return;
  const fp=id=>PIECES.find(p=>p.id===id);
  aiArmyData={mon:fp(a.mon.id),gen:fp(a.gen.id),extras:a.extras,placements:a.placements,totalValue:a.totalValue};
  if(currentArmyData){renderCombatPage(currentArmyData,true);showPage('page-combat');launchParticles();}
  else{showNotif('Sélectionnez d\'abord votre armée.');renderArmiesPage();showPage('page-armies');}
};
document.getElementById('ai-ar-back').addEventListener('click',()=>{if(currentArmyData){renderCombatPage(currentArmyData,aiArmyData&&!aiArmyData._random);showPage('page-combat');launchParticles();}else showPage('page-builder');});
document.getElementById('ai-ar-new').addEventListener('click',()=>{builderMode='ai';updateBuilderBanner();army={mon:null,gen:null,pcs:[null,null,null],prims:[]};editingArmyId=null;updAll();showPage('page-builder');});

// ----------------------------------------------------------------
// GÉNÉRATEUR D'ARMÉE IA ALÉATOIRE
// ----------------------------------------------------------------
function generateAIArmy(){
  const unlocked=VV_UNLOCKED;
  const monarques=PIECES.filter(p=>p.class==='Monarque'&&unlocked.has(p.id));
  const generaux=PIECES.filter(p=>p.class==='Général'&&unlocked.has(p.id));
  // L'IA peut utiliser TOUTES les Primordiaux (exception spéciale), + les autres pièces débloquées
  // Règle : une pièce avec qty>=2 crée une paire — l'IA ne peut avoir qu'UNE paire de Primordiale max
  // et jamais plusieurs paires de la même pièce (ie. une seule pièce qty>=2 au total parmi les extras)
  const primordiaux=PIECES.filter(p=>p.class==='Primordiale');
  const othersUnlocked=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&p.class!=='Primordiale'&&unlocked.has(p.id));
  const others=[...primordiaux,...othersUnlocked];
  const allMon=monarques.length?monarques:PIECES.filter(p=>p.id==='roi');
  const allGen=generaux.length?generaux:PIECES.filter(p=>p.id==='dame');
  const allOth=others.length>=3?others:PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général').slice(0,6);
  const rnd=arr=>arr[Math.floor(Math.random()*arr.length)];
  let tries=0;
  while(tries++<2000){
    const mon=rnd(allMon);const gen=rnd(allGen);
    if(mon.value+gen.value>22)continue;
    const budget=24-mon.value-gen.value;
    const pool=[...allOth].sort(()=>Math.random()-0.5);
    let chosen=[];let val=0;let primCount=0;let pairCount=0;
    const usedIds=new Set(); // pas de doublon de pièce
    for(const p of pool){
      if(chosen.length>=3)break;
      if(usedIds.has(p.id))continue; // même pièce déjà choisie
      if(p.class==='Primordiale'&&primCount>=1)continue; // max 1 paire de Primordiale
      // Une pièce qty>=2 crée une paire : l'IA ne peut avoir qu'une seule paire de ce type
      if(p.qty>=2&&pairCount>=1)continue; // pas plus d'une paire parmi les extras
      if(val+p.value>budget)continue;
      chosen.push(p);val+=p.value;usedIds.add(p.id);
      if(p.class==='Primordiale')primCount++;
      if(p.qty>=2)pairCount++;
    }
    if(chosen.length===3){
      const placements={};const availCols=[0,1,2,5,6,7];
      const shuffled=[...availCols].sort(()=>Math.random()-0.5);
      chosen.forEach((p,i)=>{placements[p.id]=shuffled[i];});
      return{mon,gen,extras:chosen.map(p=>p.id),placements,totalValue:mon.value+gen.value+val,_random:true};
    }
  }
  // Fallback: 3 pièces distinctes sans paires doublées
  const mon=allMon[0],gen=allGen[0];
  const ext=allOth.filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i&&!(p.qty>=2)).slice(0,3);
  if(ext.length<3){
    // accepter 1 pièce qty>=2 si nécessaire
    const ext2=allOth.filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,3);
    return{mon,gen,extras:ext2.map(p=>p.id),placements:{[ext2[0]?.id]:0,[ext2[1]?.id]:1,[ext2[2]?.id]:2},totalValue:mon.value+gen.value+ext2.reduce((s,p)=>s+p.value,0),_random:true};
  }
  return{mon,gen,extras:ext.map(p=>p.id),placements:{[ext[0].id]:0,[ext[1].id]:1,[ext[2].id]:2},totalValue:mon.value+gen.value+ext.reduce((s,p)=>s+p.value,0),_random:true};
}