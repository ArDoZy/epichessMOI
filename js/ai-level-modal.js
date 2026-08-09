// ================================================================
// AI-LEVEL-MODAL.JS : réglages de la partie contre l'IA
// ================================================================
// Ce fichier contenait le modal de choix parmi sept instructeurs. Il n'y a
// plus qu'un adversaire IA (voir INSTRUCTOR dans data-pieces.js), il ne reste
// donc ici que les deux constantes que le reste du code lit encore, et le
// point d'entrée showAILevelModal() conservé pour ne pas éparpiller la
// logique de lancement de combat : il enchaîne désormais directement.
//
// Dépendances : data-pieces.js (AI_INSTRUCTORS).
// Utilisé par : combat-intro.js (lancement), ai-engine.js et game-flow.js
// (selectedAILevel), game-flow.js/tournoi.js (selectedTimeControl).
// ================================================================

// Un seul instructeur dans le jeu normal : l'index vaut donc toujours 0, sauf
// pendant les batailles du tutoriel, qui le pointent sur l'un des quatre
// paliers faibles (voir TUTO_INSTRUCTORS dans data-pieces.js et
// tutoStartBattle() dans tutorial.js) puis le remettent à 0.
let selectedAILevel=0;

// Cadence fixe : 10 minutes par joueur, plus 5 secondes rendues à chaque coup
// joué. La cadence sèche punissait la réflexion en finale, là où ce jeu la
// demande le plus (les pouvoirs se calculent). L'incrément est appliqué par
// recordMove() dans js/rules-engine.js.
const selectedTimeControl=10;
const selectedTimeIncrement=5;

// Plus d'écran intermédiaire : cliquer « Combattre » lance le combat.
function showAILevelModal(callback){if(callback)callback();}
