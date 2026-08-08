// ================================================================
// DATA-PIECES.JS : Données statiques du jeu (aucune logique de rendu ici)
// ================================================================
// Contient : RANKS (rangs ELO), PIECES (catalogue complet des pièces),
// AI_INSTRUCTORS (les 7 niveaux d'IA), UNLOCK_TABLE / UNLOCK_MILESTONES
// (progression des déblocages), et quelques constantes de classes partagées.
//
// Dépendances : aucune (chargé en tout premier après les libs).
// Utilisé par : à peu près tous les autres modules (builder, rules-engine,
// ai-engine, voie, tournoi, game-flow...).
//
// Si vous ajoutez une nouvelle pièce : l'ajouter dans PIECES, puis dans
// UNLOCK_TABLE si elle doit être débloquée par ELO (ou coffre/primordiale).
// Si vous ajoutez un rang ELO : l'ajouter dans RANKS (ordre croissant, min/max
// contigus), tout le reste (vvGetRank, badges, filtres IA) s'adapte seul.
// ================================================================

// ----------------------------------------------------------------
// RANGS ELO
// ----------------------------------------------------------------
const RANKS=[
  {id:'poussiere',name:'Poussière',  color:'#7a7590',min:0,   max:199},
  {id:'pierre',   name:'Pierre',     color:'#9a8c7a',min:200, max:499},
  {id:'bronze',   name:'Bronze',     color:'#cd7f32',min:500, max:849},
  {id:'acier',    name:'Acier',      color:'#8fa8b8',min:850, max:1299},
  {id:'obsidienne',name:'Obsidienne',color:'#5a3f8a',min:1300,max:1799},
  {id:'argent',   name:'Argent',     color:'#c0c0c0',min:1800,max:2399},
  {id:'or',       name:'Or Légendaire',color:'#c9a84c',min:2400,max:9999},
];
function vvGetRank(elo){for(let i=RANKS.length-1;i>=0;i--)if(elo>=RANKS[i].min)return RANKS[i];return RANKS[0];}
function vvGetRankFloor(elo){return vvGetRank(elo).min;}
function vvGetRankIdx(elo){for(let i=RANKS.length-1;i>=0;i--)if(elo>=RANKS[i].min)return i;return 0;}

// ----------------------------------------------------------------
// L'INSTRUCTEUR : un seul adversaire IA, à pleine puissance
// ----------------------------------------------------------------
// Le jeu proposait sept instructeurs de force croissante, dont six qui
// jouaient volontairement mal (jusqu'à 95 % de coups au hasard). Un
// adversaire qui se saborde n'apprend rien à personne et brouillait le
// classement ELO. Il n'en reste qu'un, qui joue son meilleur coup, et dont
// l'évaluation tient compte des POUVOIRS des pièces et pas seulement de
// leurs déplacements (voir evalBoard/evalPowers dans js/ai-engine.js).
//
// timeMs est le budget de réflexion par coup. 3 s tient largement la
// profondeur nécessaire sur un 8x8 grâce à la table de transposition, sans
// donner l'impression que le jeu a planté.
const INSTRUCTOR={
  id:'instructeur',
  name:'L\'Instructeur',
  timeMs:3000,
  noise:0,
  elo:2000,
  desc:'Recherche complète, consciente des pouvoirs de chaque créature.',
};
// Conservé sous forme de tableau à un élément : tout le code existant lit
// AI_INSTRUCTORS[selectedAILevel], qui vaut toujours 0 désormais.
const AI_INSTRUCTORS=[INSTRUCTOR];

// ----------------------------------------------------------------
// ÉCHIQUIERS : matières débloquées le long de la Voie
// ----------------------------------------------------------------
// Les fichiers sont générés par tools/gen-boards.js (SVG procédural).
// eloRequired s'aligne sur les seuils de RANKS pour que le déblocage d'un
// plateau coïncide avec un passage de rang.
const BOARD_SKINS=[
  {id:'bois',   name:'Bois',   file:'assets/boards/bois.svg',   eloRequired:0,    desc:'Chêne huilé, le plateau de l\'atelier.'},
  {id:'pierre', name:'Pierre', file:'assets/boards/pierre.svg', eloRequired:200,  desc:'Dalle de marbre gris taillée au ciseau.'},
  {id:'acier',  name:'Acier',  file:'assets/boards/acier.svg',  eloRequired:850,  desc:'Acier brossé, froid sous les doigts.'},
  {id:'argent', name:'Argent', file:'assets/boards/argent.svg', eloRequired:1800, desc:'Argent poli miroir.'},
  {id:'or',     name:'Or',     file:'assets/boards/or.svg',     eloRequired:2400, desc:'Or massif. Il n\'y a rien au-delà.'},
];
function boardSkinById(id){return BOARD_SKINS.find(b=>b.id===id)||BOARD_SKINS[0];}

// ----------------------------------------------------------------
// COFFRES : six raretés nommées d'après les pièces d'échecs
// ----------------------------------------------------------------
// Ils s'obtiennent en enchaînant les victoires : 1re victoire = Pion,
// 2e d'affilée = Cavalier, puis Fou, Tour, Dame et Roi. Une défaite remet la
// série à zéro (voir economy.js::economySettle).
//
// rolls   : nombre de lots de pièces tirés
// qty     : fourchette de quantité par lot
// newChance : probabilité de contenir une pièce ENCORE JAMAIS DÉBLOQUÉE
// bias    : plus il est élevé, plus les pièces chères sont probables
const CHESTS=[
  {id:'pion',    tier:0,name:'Coffre Pion',    rolls:2,qty:[1,3], newChance:0.03,bias:0.55,color:'#7f8b94'},
  {id:'cavalier',tier:1,name:'Coffre Cavalier',rolls:3,qty:[2,4], newChance:0.07,bias:0.85,color:'#7d9c6a'},
  {id:'fou',     tier:2,name:'Coffre Fou',     rolls:3,qty:[3,6], newChance:0.13,bias:1.20,color:'#5f93b8'},
  {id:'tour',    tier:3,name:'Coffre Tour',    rolls:4,qty:[4,8], newChance:0.22,bias:1.70,color:'#9a6fc4'},
  {id:'dame',    tier:4,name:'Coffre Dame',    rolls:5,qty:[6,12],newChance:0.34,bias:2.30,color:'#d0742e'},
  {id:'roi',     tier:5,name:'Coffre Roi',     rolls:6,qty:[8,16],newChance:0.52,bias:3.20,color:'#d9b64e'},
];
function chestById(id){return CHESTS.find(c=>c.id===id)||CHESTS[0];}
// Une série de n victoires donne le coffre de rang n-1, plafonné au Roi.
function chestForStreak(streak){return CHESTS[Math.min(Math.max(streak,1)-1,CHESTS.length-1)];}

// Coffre de réapprovisionnement quotidien : +4 exemplaires de CHAQUE pièce
// possédée. C'est le filet de sécurité du système : sans lui, un joueur qui
// perd tout son inventaire ne pourrait plus composer d'armée du tout.
const DAILY_CHEST={id:'reappro',name:'Coffre de réapprovisionnement',perPiece:4};

// ----------------------------------------------------------------
// CATALOGUE COMPLET DES PIÈCES (version light)
// ----------------------------------------------------------------
const PIECES=[
  {id:'roi',name:'Roi',emoji:'👑',class:'Monarque',movement:'1 case dans toutes les directions',value:3,qty:1,pieceType:'k',ability:null},
  {id:'empereur',name:'Empereur',emoji:'⚜️',class:'Monarque',movement:'1 case toutes directions OU cavalier (2+1)',value:7,qty:1,pieceType:'k',ability:'Se déplace comme un roi ou un cavalier.'},
  {id:'amazone',name:'Amazone',emoji:'🏹',class:'Général',movement:'Cavalier + Fou (diagonal illimité)',value:7,qty:1,pieceType:'q',ability:null},
  {id:'chevaucheur-rhinoceros',name:'Chevaucheur de Rhinocéros',emoji:'🦏',class:'Général',movement:'Tour + Cavalier',value:8,qty:1,pieceType:'r',ability:null},
  {id:'dame',name:'Dame',emoji:'♛',class:'Général',movement:'Tour + Fou (dame standard)',value:10,qty:1,pieceType:'q',ability:null},
  {id:'grand-maitre',name:'Grand Maître',emoji:'🔮',class:'Général',movement:'Dame + Cavalier',value:13,qty:1,pieceType:'q',ability:'Domination royale : tant que vivant, les pions ennemis ne peuvent avancer de 2 cases.'},
  {id:'cavalier-primordial',name:'Cavalier Primordial',emoji:'♞',class:'Primordiale',movement:'Cavalier standard (2+1, saute)',value:3,qty:2,pieceType:'n',ability:'Cavalier standard.'},
  {id:'fou-primordial',name:'Fou Primordial',emoji:'♝',class:'Primordiale',movement:'Diagonal illimité',value:3,qty:2,pieceType:'b',ability:'Fou standard.'},
  {id:'tour-primordiale',name:'Tour Primordiale',emoji:'♜',class:'Primordiale',movement:'Orthogonal illimité',value:5,qty:2,pieceType:'r',ability:'Tour standard.'},
  {id:'alpha',name:'Alpha',emoji:'🐺',class:'Brute',movement:'Exactement 2 cases en diagonale (saute)',value:2,qty:2,pieceType:'b',ability:'Saute. Se déplace EXACTEMENT à 2 cases en diagonale (jamais sur une case adjacente).'},
  {id:'fourmi',name:'Fourmi',emoji:'🐜',class:'Brute',movement:'1 case en avant (orthogonal ou diagonal, déplacement et capture)',value:2,qty:2,pieceType:'p',ability:'Ne peut pas reculer.'},
  {id:'preux-chevalier',name:'Preux Chevalier',emoji:'🛡️',class:'Brute',movement:'Exactement 2 cases orthogonales (sans sauter) OU 1 case diagonale',value:3,qty:2,pieceType:'r',ability:'Cuirasse : ne peut être capturé par des pions (ni par la Fourmi).'},
  {id:'dresseur-elephant',name:"Dresseur d'Éléphant",emoji:'🐘',class:'Brute',movement:'1 ou 2 cases orthogonalement (sans sauter)',value:3,qty:2,pieceType:'r',ability:'Charge : en avançant de 2 cases, détruit les pièces ennemies sur son passage.'},
  {id:'garde-pierre',name:'Garde de Pierre',emoji:'🪨',class:'Brute',movement:'1 case dans toutes les directions',value:3,qty:2,pieceType:'p',ability:'Roc de pierre (1×/partie) : s\'ancre sur place, imprenable et inamovible.',hasPower:true,powerLabel:'Ancrer (Roc de Pierre)'},
  {id:'meduse',name:'Méduse',emoji:'🪼',class:'Sorcier',movement:'1 case orthogonale',value:2,qty:2,pieceType:'p',ability:'Paralyse les pièces ennemies diagonalement adjacentes.'},
  {id:'typhon',name:'Typhon',emoji:'🌪️',class:'Sorcier',movement:'1 case en diagonale maximum',value:6,qty:2,pieceType:'b',ability:'Détruit toutes les pièces adjacentes à sa case d\'arrivée. Ne peut pas détruire le roi.'},
  {id:'banshee',name:'Banshee',emoji:'👻',class:'Sorcier',movement:'1 ou 2 cases en diagonale (sans sauter)',value:4,qty:2,pieceType:'b',ability:'Hurle : les pions adverses à 1 case reculent d\'une case si possible.'},
  {id:'pretre',name:'Prêtre',emoji:'✝️',class:'Sorcier',movement:'1 à 2 cases orthogonalement',value:4,qty:2,pieceType:'r',ability:'Empêche les captures dans les cases DIAGONALEMENT adjacentes au Prêtre.'},
];

const TRUE_PAWN_IDS=new Set(['std-pawn']);
const CLASS_ORDER={Monarque:1,Général:2,Primordiale:3,Brute:4,Sorcier:5};
// Couleurs partagées par classe de pièce : utilisées par le menu contextuel factorisé
const CLASS_COLOR_VARS={Monarque:'var(--monarque)',Général:'var(--general)',Primordiale:'var(--primordiale)',Brute:'var(--brute)',Sorcier:'var(--sorcier)'};

// ----------------------------------------------------------------
// TABLE DE DÉBLOCAGE : pièces débloquées par palier d'ELO
// ----------------------------------------------------------------
const UNLOCK_TABLE=[
  {pieceId:'roi',eloRequired:0},{pieceId:'dame',eloRequired:0},{pieceId:'alpha',eloRequired:0},{pieceId:'fourmi',eloRequired:0},
  {pieceId:'cavalier-primordial',eloRequired:0,primordialeChoix:true},
  {pieceId:'fou-primordial',eloRequired:0,primordialeChoix:true},
  {pieceId:'tour-primordiale',eloRequired:0,primordialeChoix:true},
  {pieceId:'garde-pierre',eloRequired:30},{pieceId:'preux-chevalier',eloRequired:50},
  {pieceId:'dresseur-elephant',eloRequired:90},{pieceId:'chevaucheur-rhinoceros',eloRequired:150},
  {pieceId:'meduse',eloRequired:210},{pieceId:'amazone',eloRequired:260},
  {pieceId:'empereur',eloRequired:480},
  {pieceId:'pretre',eloRequired:800},{pieceId:'typhon',eloRequired:1000,bigReward:true},
  {pieceId:'banshee',eloRequired:1150},
  {pieceId:'grand-maitre',eloRequired:1700},
  {pieceId:null,eloRequired:2400,bigReward:true,label:'Or Légendaire atteint !'},
];

const UNLOCK_MILESTONES=(()=>{
  const seen=new Set();
  return UNLOCK_TABLE.filter(u=>{
    if(u.coffre)return false;
    if(u.pieceId&&seen.has(u.pieceId))return false;
    if(u.pieceId)seen.add(u.pieceId);return true;
  }).sort((a,b)=>a.eloRequired-b.eloRequired);
})();

const PRIMORDIAUX_CHOIX=['cavalier-primordial','fou-primordial','tour-primordiale'];
