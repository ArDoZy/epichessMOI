// ================================================================
// COMBAT-INTRO.JS — Page d'introduction du combat (#page-combat)
// ================================================================
// Contient : le rendu de l'écran "VS" avant une partie (aperçu des deux
// armées, sélection de l'armée IA aléatoire/personnalisée/miroir),
// l'animation de particules décoratives, et le modal de déguisement du Clown
// (choix de l'apparence affichée à l'adversaire).
//
// Dépendances : data-pieces.js (PIECES), ai-level-modal.js (showAILevelModal,
// selectedAILevel, AI_INSTRUCTORS), armies.js (generateAIArmy,
// renderArmiesPage, renderAiArmiesPage), game-flow.js (startGame),
// main.js (currentArmyData, aiArmyData, clownDisguise, showPage, showNotif).
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
  document.getElementById('ai-army-preview').innerHTML=aiAll.map(p=>p.emoji).join('');
  document.getElementById('ai-army-names').textContent=aiAll.map(p=>p.name).join(' · ');
  document.getElementById('ai-army-label').textContent=aiIsCustom&&!aiArmyData._random?'Armée IA personnalisée':'Armée IA aléatoire';
};

const launchParticles=()=>{
  const cont=document.getElementById('cparts');cont.innerHTML='';
  const cols=['#7c3aed','#c9a84c','#3b82f6','#ec4899','#10b981','#f97316','#a855f7','#fbbf24'];
  for(let i=0;i<38;i++){const p=document.createElement('div');p.className='rise-particle';const sz=Math.random()*8+3;const dur=3+Math.random()*6;p.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+Math.random()*100+'%;bottom:0;background:'+cols[i%cols.length]+';animation:rise '+dur+'s '+Math.random()*4+'s linear infinite;opacity:0';cont.appendChild(p);}
};

document.getElementById('cb-back').addEventListener('click',()=>{renderArmiesPage();showPage('page-armies');});
document.getElementById('cb-armies').addEventListener('click',()=>{renderArmiesPage();showPage('page-armies');});
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
// FIX : la couleur du joueur est désormais tirée ICI (avant le choix de déguisement
// du Clown), et transmise à startGame(true) pour qu'elle ne soit pas re-tirée au
// hasard une seconde fois — ce qui pouvait auparavant faire perdre ou mal assigner
// le déguisement choisi par le joueur.
document.getElementById('cb-play').addEventListener('click',()=>{
  showAILevelModal(()=>{
    renderCombatPage(currentArmyData,aiArmyData&&!aiArmyData._random);
    _playerColor=Math.random()<0.5?'w':'b';
    const hasClown=(currentArmyData?.extras||[]).some(id=>id==='clown');
    if(hasClown)showClownModal(_playerColor,()=>startGame(true));
    else{clownDisguise[_playerColor]=null;startGame(true);}
  });
});

// ----------------------------------------------------------------
// MODAL DE DÉGUISEMENT DU CLOWN
// ----------------------------------------------------------------
function showClownModal(color,callback){
  const modal=document.getElementById('clown-modal');const opts=document.getElementById('clown-options');
  modal.classList.add('active');
  const choices=PIECES.filter(p=>p.id!=='clown'&&p.class!=='Monarque'&&p.class!=='Général');
  opts.innerHTML=choices.map(p=>'<div class="clown-opt" data-id="'+p.id+'"><div>'+p.emoji+'</div><span>'+p.name+'</span></div>').join('');
  opts.querySelectorAll('.clown-opt').forEach(el=>{
    el.addEventListener('click',()=>{const chosen=PIECES.find(p=>p.id===el.dataset.id);clownDisguise[color]=chosen;modal.classList.remove('active');showNotif('Clowns déguisés en '+chosen.emoji+' '+chosen.name+' !','ok');if(callback)callback();});
  });
}