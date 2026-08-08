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

// Un seul instructeur : l'index ne varie plus, mais il reste lu à plusieurs
// endroits (AI_INSTRUCTORS[selectedAILevel]), on le garde donc défini.
let selectedAILevel=0;

// Cadence fixe : 10 minutes par joueur.
const selectedTimeControl=10;

// Plus d'écran intermédiaire : cliquer « Combattre » lance le combat.
function showAILevelModal(callback){if(callback)callback();}
