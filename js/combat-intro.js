// ================================================================
// COMBAT-INTRO.JS : Page d'engagement avant une partie (#page-combat)
// ================================================================
// Cette page a DEUX modes, et c'est la même page parce que c'est le même
// moment du parcours : « je pars au combat avec cette armée ».
//
//   - mode 'online' : on cherche un adversaire humain. La page montre
//     l'armée engagée face à un adversaire encore inconnu, et porte
//     directement les trois façons de trouver quelqu'un.
//   - mode 'ia'     : on affronte l'Instructeur. La page montre les deux
//     armées en présence et permet de choisir celle de l'IA.
//
// Auparavant la page ne connaissait que le duel contre l'IA, et le jeu en
// ligne s'ouvrait dans une fenêtre posée par-dessus : l'écran annonçait un
// combat contre l'Instructeur pendant qu'on cherchait un joueur humain.
//
// Dépendances : data-pieces.js (PIECES, INSTRUCTOR), armies.js
// (generateAIArmy, renderArmiesPage, renderAiArmiesPage), game-flow.js
// (startGame, _playerColor), multiplayer.js (mpOpenModal, mpShowScreen...),
// economy-ui.js (renderCombatStake), main.js (currentArmyData, aiArmyData).
// ================================================================

// Mode courant de la page. Lu par les boutons pour savoir quoi faire, et par
// game-flow.js quand on revient sur cette page après une partie.
let combatMode='ia';

// ----------------------------------------------------------------
// ENTRÉES DANS LA PAGE
// ----------------------------------------------------------------
// Depuis "Mes armées" en mode sélection (voir armies.js::pickArmyForBattle).
window.launchCombat=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);currentArmyData=a;aiArmyData=generateAIArmy();
  renderCombatPage(a,'ia');showPage('page-combat');launchParticles();
};

window.launchOnline=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);currentArmyData=a;
  // Une armée d'IA reste préparée en coulisse : si le joueur bascule vers
  // l'Instructeur depuis cette page, il ne doit pas y avoir de temps mort.
  aiArmyData=generateAIArmy();
  renderCombatPage(a,'online');showPage('page-combat');launchParticles();
};

// ----------------------------------------------------------------
// RENDU
// ----------------------------------------------------------------
const armyIconRow=pieces=>pieces.map(p=>
  '<span title="'+escH(p.name)+'">'+pieceIcon(p.id,'n')+'</span>').join('');

function resolveArmyPieces(ad){
  const fp=id=>PIECES.find(p=>p.id===id);
  const mon=fp(ad.mon?.id||ad.mon)||ad.mon;
  const gen=fp(ad.gen?.id||ad.gen)||ad.gen;
  const extras=(ad.extras||[]).map(e=>fp(e&&e.id?e.id:e)).filter(Boolean);
  return[mon,gen,...extras].filter(Boolean);
}

const renderCombatPage=(ad,mode)=>{
  combatMode=(mode==='online')?'online':'ia';
  const online=combatMode==='online';
  const all=resolveArmyPieces(ad);

  document.getElementById('ctitle').textContent=online?'COMBAT':'L\'INSTRUCTEUR';
  document.getElementById('csubt').textContent=online
    ? 'Cherchez un adversaire, ou invitez un ami avec un code.'
    : 'Un entraînement contre l\'IA du laboratoire.';

  const mine='<div class="cside"><div class="cside-lbl">Votre armée</div>'+
    '<div class="cside-pieces">'+armyIconRow(all)+'</div>'+
    '<div class="cside-name">'+ad.totalValue+' pts</div></div>';

  let theirs;
  if(online){
    // Adversaire encore inconnu : un point d'interrogation vaut mieux qu'une
    // armée d'IA affichée à tort, qui laisserait croire à un combat contre
    // l'ordinateur.
    theirs='<div class="cside"><div class="cside-lbl">Adversaire</div>'+
      '<div class="cside-unknown">?</div>'+
      '<div class="cside-name">En attente d\'un joueur</div></div>';
  }else{
    const aiAll=resolveArmyPieces(aiArmyData||{});
    theirs='<div class="cside"><div class="cside-lbl">'+escH(INSTRUCTOR.name)+'</div>'+
      '<div class="cside-pieces">'+armyIconRow(aiAll)+'</div>'+
      '<div class="cside-name">'+((aiArmyData&&aiArmyData.totalValue)||0)+' pts</div></div>';
  }

  document.getElementById('cvs-display').innerHTML=mine+'<div class="vs-div">VS</div>'+theirs;
  document.getElementById('cactions-online').style.display=online?'':'none';
  document.getElementById('cactions-ia').style.display=online?'none':'';

  // Rappel de la mise avant de s'engager (js/economy-ui.js).
  if(typeof renderCombatStake==='function')renderCombatStake(ad);
};

const launchParticles=()=>{
  const cont=document.getElementById('cparts');cont.innerHTML='';
  const cols=['#2fb197','#186557','#c19a45','#e6c576','#d9552f','#2fb197','#8698a1','#c19a45'];
  for(let i=0;i<38;i++){const p=document.createElement('div');p.className='rise-particle';const sz=Math.random()*8+3;const dur=3+Math.random()*6;p.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+Math.random()*100+'%;bottom:0;background:'+cols[i%cols.length]+';animation:rise '+dur+'s '+Math.random()*4+'s linear infinite;opacity:0';cont.appendChild(p);}
};

// ----------------------------------------------------------------
// GARDE-FOU D'ÉCONOMIE
// ----------------------------------------------------------------
// Partagé par les deux modes : lancer une partie avec une réserve
// insuffisante produirait un plateau incomplet et une perte incompréhensible.
function combatStockOk(){
  if(typeof armyStock!=='function')return true;
  const stock=armyStock(currentArmyData);
  if(stock.ok)return true;
  showConfirmModal('Réserve insuffisante pour cette armée : '+
    stock.missing.map(m=>m.name+' ('+m.have+'/'+m.need+')').join(', ')+
    '. Récupérez le coffre de réapprovisionnement dans la Réserve.',()=>{},
    {okLabel:'Compris',cancelLabel:'Fermer',okClass:'btn-primary'});
  return false;
}

// ----------------------------------------------------------------
// BOUTONS : MODE EN LIGNE
// ----------------------------------------------------------------
// Chaque bouton ouvre la fenêtre du salon DÉJÀ sur le bon écran : le joueur
// a déjà exprimé son choix ici, le lui redemander serait un clic pour rien.
function openOnline(screen,after){
  if(!combatStockOk())return;
  if(typeof mpOpenModal!=='function')return;
  mpOpenModal();
  if(typeof mpShowScreen==='function'&&screen)mpShowScreen(screen);
  if(after)after();
}

document.getElementById('cb-quick')?.addEventListener('click',()=>{
  openOnline('quick',()=>{if(typeof mpQuickPlay==='function')mpQuickPlay();});
});
document.getElementById('cb-private')?.addEventListener('click',()=>{
  openOnline('host',()=>{
    if(typeof mpGenCode!=='function'||typeof mpConnect!=='function')return;
    const code=mpGenCode();
    document.getElementById('mp-code-value').textContent=code;
    mpConnect(code,true);
  });
});
document.getElementById('cb-join')?.addEventListener('click',()=>{
  openOnline('join',()=>{document.getElementById('mp-code-input')?.focus();});
});

// ----------------------------------------------------------------
// BOUTONS : MODE INSTRUCTEUR
// ----------------------------------------------------------------
['cb-back','cb-back-ia'].forEach(id=>{
  document.getElementById(id)?.addEventListener('click',()=>{
    if(typeof mpLeave==='function')mpLeave();
    renderArmiesPage();showPage('page-armies');
  });
});

document.getElementById('cb-choose-ai')?.addEventListener('click',()=>{
  if(!savedAiArmies.length){builderMode='ai';updateBuilderBanner();army={mon:null,gen:null,extras:[]};editingArmyId=null;showPage('page-builder');updAll();}
  else{renderAiArmiesPage();showPage('page-ai-armies');}
});

// Armée miroir : l'IA copie exactement l'armée du joueur (mêmes pièces,
// mêmes positions). C'est le test le plus lisible de sa force.
document.getElementById('cb-mirror-ai')?.addEventListener('click',()=>{
  if(!currentArmyData)return;
  aiArmyData={...currentArmyData,_random:false,_mirror:true};
  renderCombatPage(currentArmyData,'ia');
});

// La couleur du joueur est tirée ICI et transmise à startGame(true) pour
// qu'elle ne soit pas re-tirée au hasard une seconde fois.
document.getElementById('cb-play')?.addEventListener('click',()=>{
  if(!combatStockOk())return;
  if(typeof vvSetOpponentElo==='function')vvSetOpponentElo(null);
  _playerColor=Math.random()<0.5?'w':'b';
  startGame(true);
});
