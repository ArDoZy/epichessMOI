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
// combat contre un adversaire IA pendant qu'on cherchait un joueur humain.
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
// Depuis le menu principal, COMBAT / Adversaires (voir armies.js::startArmySelection).
window.launchCombat=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);
  startAiBattle(a,aiArmyForOpponent());
};

// Armée de l'adversaire courant : son budget et son style (AI_OPPONENTS),
// composée dans les SEULES pièces que le joueur possède déjà (voir
// aiPiecePool / generateAIArmy dans js/armies.js). Un adversaire n'aligne
// donc jamais une créature dont on n'a pas lu le pouvoir, et dont on ne
// pourrait pas aligner l'équivalent en face : ce qu'il joue, on l'a.
function aiArmyForOpponent(){
  const o=(typeof aiChosenOpponent==='function')?aiChosenOpponent():null;
  if(!o)return generateAIArmy();
  return generateAIArmy(Math.max(0,o.budget-4),{style:o.style,budget:o.budget});
}

window.launchOnline=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);
  startOnlineSearch(a);
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

// ----------------------------------------------------------------
// PLUS DE PAGE D'ENGAGEMENT
// ----------------------------------------------------------------
// Un écran entier s'intercalait entre « Combat » et la partie : titre COMBAT,
// duel d'armées, rappel de la mise, et une rangée de boutons dont le principal
// ne faisait que répéter l'intention qu'on venait d'exprimer en appuyant sur
// COMBAT. Les deux parcours vont maintenant droit au but.
//   · en ligne     → la recherche d'adversaire s'ouvre tout de suite ;
//   · laboratoire  → la partie démarre tout de suite.
// Le garde-fou de stock (combatStockOk) reste en travers des deux chemins :
// c'est le seul refus qui doit encore interrompre le geste.

// LANCEMENT D'UNE PARTIE CONTRE LE LABORATOIRE.
// La couleur est tirée ICI et transmise à startGame(true) pour ne pas être
// re-tirée au hasard une seconde fois à l'intérieur.
function startAiBattle(playerArmy,aiArmy){
  currentArmyData=playerArmy;
  aiArmyData=aiArmy||aiArmyForOpponent();
  if(!combatStockOk())return false;
  if(typeof vvSetOpponentElo==='function')vvSetOpponentElo(null);
  _playerColor=Math.random()<0.5?'w':'b';
  startGame(true);
  return true;
}
window.startAiBattle=startAiBattle;

// LANCEMENT D'UNE RECHERCHE EN LIGNE.
function startOnlineSearch(playerArmy){
  currentArmyData=playerArmy;
  if(!combatStockOk())return false;
  if(typeof mpOpenModal!=='function')return false;
  mpOpenModal();
  if(typeof mpShowScreen==='function')mpShowScreen('quick');
  if(typeof mpQuickPlay==='function')mpQuickPlay();
  return true;
}
window.startOnlineSearch=startOnlineSearch;

// ----------------------------------------------------------------
// GARDE-FOU D'ÉCONOMIE
// ----------------------------------------------------------------
// Partagé par les deux modes : lancer une partie avec un stock insuffisant
// produirait un plateau incomplet et une perte incompréhensible.
function combatStockOk(){
  if(typeof armyStock!=='function')return true;
  const stock=armyStock(currentArmyData);
  if(stock.ok)return true;
  showConfirmModal('Stock insuffisant pour cette armée : '+
    stock.missing.map(m=>m.name+' ('+m.have+'/'+m.need+')').join(', ')+
    '. Récupérez le coffre de réapprovisionnement dans la Guerre des clans.',()=>{},
    {okLabel:'Compris',cancelLabel:'Fermer',okClass:'btn-primary'});
  return false;
}
