// ================================================================
// COMBAT-INTRO.JS — Page d'introduction du combat (#page-combat)
// ================================================================
// Contient : le rendu de l'écran "VS" avant une partie (aperçu des deux
// armées, sélection de l'armée IA aléatoire/personnalisée/miroir),
// et l'animation de particules décoratives.
//
// Dépendances : data-pieces.js (PIECES), ai-level-modal.js (showAILevelModal,
// selectedAILevel, AI_INSTRUCTORS), armies.js (generateAIArmy,
// renderArmiesPage, renderAiArmiesPage), game-flow.js (startGame),
// main.js (currentArmyData, aiArmyData, showPage, showNotif).
// ================================================================

// ----------------------------------------------------------------
// LANCEMENT COMBAT DEPUIS "MES ARMÉES"
// ----------------------------------------------------------------
window.launchCombat=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);currentArmyData=a;aiArmyData=generateAIArmy();
  renderCombatPage(a,false);showPage('page-combat');launchParticles();
};

const renderCombatPage=(ad,aiIsCustom)=>{
  const mon=PIECES.find(p=>p.id===ad.mon.id);const gen=PIECES.find(p=>p.id===ad.gen.id);
  const extras=ad.extras.map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
  const all=[mon,gen,...extras].filter(Boolean);
  const aiMon=aiArmyData.mon?.id?PIECES.find(p=>p.id===aiArmyData.mon.id)||aiArmyData.mon:aiArmyData.mon;
  const aiGen=aiArmyData.gen?.id?PIECES.find(p=>p.id===aiArmyData.gen.id)||aiArmyData.gen:aiArmyData.gen;
  const aiExtras=(aiArmyData.extras||[]).map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
  const aiAll=[aiMon,aiGen,...aiExtras].filter(Boolean);
  const inst=AI_INSTRUCTORS[selectedAILevel];
  document.getElementById('cvs-display').innerHTML=
    '<div class="cside"><div class="cside-lbl">Votre armée</div><div class="cside-pieces">'+all.map(p=>'<span>'+p.emoji+'</span>').join('')+'</div><div class="cside-name">'+ad.totalValue+' pts</div></div>'+
    '<div class="vs-div">VS</div>'+
    '<div class="cside"><div class="cside-lbl">'+inst.emoji+' '+inst.name+'</div><div class="cside-pieces">'+aiAll.map(p=>'<span>'+p.emoji+'</span>').join('')+'</div><div class="cside-name">'+aiArmyData.totalValue+' pts</div></div>';
};

const launchParticles=()=>{
  const cont=document.getElementById('cparts');cont.innerHTML='';
  const cols=['#e8c766','#c9a227','#b6394a','#7a1f2b','#f0b04a','#e8c766','#8a5f38','#c9a227'];
  for(let i=0;i<38;i++){const p=document.createElement('div');p.className='rise-particle';const sz=Math.random()*8+3;const dur=3+Math.random()*6;p.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+Math.random()*100+'%;bottom:0;background:'+cols[i%cols.length]+';animation:rise '+dur+'s '+Math.random()*4+'s linear infinite;opacity:0';cont.appendChild(p);}
};

document.getElementById('cb-back').addEventListener('click',()=>{renderArmiesPage();showPage('page-armies');});
document.getElementById('cb-choose-ai').addEventListener('click',()=>{
  if(!savedAiArmies.length){builderMode='ai';updateBuilderBanner();army={mon:null,gen:null,pcs:[null,null,null],prims:[]};editingArmyId=null;updAll();showPage('page-builder');}
  else{renderAiArmiesPage();showPage('page-ai-armies');}
});
// Armée miroir — l'IA copie exactement l'armée du joueur (mêmes pièces, mêmes positions)
document.getElementById('cb-mirror-ai').addEventListener('click',()=>{
  if(!currentArmyData){showNotif('Aucune armée joueur sélectionnée.','err');return;}
  aiArmyData={
    ...currentArmyData,
    _random:false,
    _mirror:true,
  };
  renderCombatPage(currentArmyData,true);
  showNotif('🪞 L\'IA utilise la même armée que vous !','ok');
});
// cb-play : ouvre le sélecteur d'instructeur puis lance la partie.
// La couleur du joueur est tirée ICI et transmise à startGame(true) pour
// qu'elle ne soit pas re-tirée au hasard une seconde fois.
document.getElementById('cb-play').addEventListener('click',()=>{
  showAILevelModal(()=>{
    renderCombatPage(currentArmyData,aiArmyData&&!aiArmyData._random);
    _playerColor=Math.random()<0.5?'w':'b';
    startGame(true);
  });
});