// ================================================================
// AI-LEVEL-MODAL.JS : adversaire courant et cadence des parties
// ================================================================
// Ce fichier a porté successivement un modal de choix parmi sept
// instructeurs, puis plus rien du tout quand il n'est resté qu'un seul
// adversaire. Il y en a de nouveau douze (AI_OPPONENTS dans
// js/data-pieces.js), mais le choix se fait maintenant sur une vraie page
// (js/adversaires.js) : il ne reste ici que L'ÉTAT — quel adversaire est
// engagé — et la cadence, que tout le reste du code lit.
//
// Dépendances : data-pieces.js (AI_OPPONENTS, AI_INSTRUCTORS,
// aiOpponentIndex, DEFAULT_AI_LEVEL).
// Utilisé par : ai-engine.js (selectedAILevel), adversaires.js
// (aiSetOpponent), combat-intro.js / game-flow.js / game-render.js
// (aiCurrentOpponent, pour nommer l'adversaire à l'écran).
// ================================================================

// Index dans AI_INSTRUCTORS de l'adversaire qui joue la partie en cours.
// Les batailles du tutoriel le pointent temporairement sur l'un des quatre
// paliers faibles (voir tutoStartBattle dans js/tutorial.js) puis le rendent.
let selectedAILevel=DEFAULT_AI_LEVEL;

// Adversaire choisi par le joueur dans la galerie. Distinct de
// selectedAILevel : celui-ci survit aux batailles du tutoriel et aux rounds
// scriptées, qui n'ont pas à faire oublier le choix du joueur.
let chosenOpponentId='instructeur';

// L'adversaire actuellement engagé. Retombe toujours sur une entrée valide :
// un id inconnu (sauvegarde d'une version antérieure) ne doit pas casser une
// page entière.
function aiCurrentOpponent(){
  const o=AI_INSTRUCTORS[selectedAILevel];
  return o||AI_OPPONENTS[DEFAULT_AI_LEVEL]||AI_OPPONENTS[0];
}
// L'adversaire CHOISI, indépendamment de ce qui joue à l'instant (tutoriel,
// bataille du tutoriel) : c'est lui qu'affichent la galerie et le menu.
function aiChosenOpponent(){return aiOpponentById(chosenOpponentId);}

function aiSetOpponent(id){
  const o=aiOpponentById(id);
  chosenOpponentId=o.id;
  selectedAILevel=aiOpponentIndex(o.id);
  if(typeof accSet==='function')accSet('opponent_id',o.id);
  return o;
}
// Restaure le choix du joueur à la connexion (appelé par enterAccount).
function aiLoadOpponent(){
  const id=(typeof accGet==='function')?accGet('opponent_id','instructeur'):'instructeur';
  aiSetOpponent(id);
}

// Cadence fixe : 10 minutes par joueur, plus 5 secondes rendues à chaque coup
// joué. La cadence sèche punissait la réflexion en finale, là où ce jeu la
// demande le plus (les pouvoirs se calculent). L'incrément est appliqué par
// recordMove() dans js/rules-engine.js.
const selectedTimeControl=10;
const selectedTimeIncrement=5;

// Plus d'écran intermédiaire : cliquer « Combattre » lance le combat.
function showAILevelModal(callback){if(callback)callback();}
