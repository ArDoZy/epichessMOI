// ================================================================
// DATA-PIECES.JS — Données statiques du jeu (aucune logique de rendu ici)
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
// contigus) — tout le reste (vvGetRank, badges, filtres IA) s'adapte seul.
// ================================================================

// ----------------------------------------------------------------
// RANGS ELO
// ----------------------------------------------------------------
const RANKS=[
  {id:'poussiere',name:'Poussière',  emoji:'🪨',color:'#7a7590',min:0,   max:199},
  {id:'pierre',   name:'Pierre',     emoji:'🗿',color:'#9a8c7a',min:200, max:499},
  {id:'bronze',   name:'Bronze',     emoji:'🥉',color:'#cd7f32',min:500, max:849},
  {id:'acier',    name:'Acier',      emoji:'⚙️',color:'#8fa8b8',min:850, max:1299},
  {id:'obsidienne',name:'Obsidienne',emoji:'🌑',color:'#5a3f8a',min:1300,max:1799},
  {id:'argent',   name:'Argent',     emoji:'🥈',color:'#c0c0c0',min:1800,max:2399},
  {id:'or',       name:'Or Légendaire',emoji:'👑',color:'#c9a84c',min:2400,max:9999},
];
function vvGetRank(elo){for(let i=RANKS.length-1;i>=0;i--)if(elo>=RANKS[i].min)return RANKS[i];return RANKS[0];}
function vvGetRankFloor(elo){return vvGetRank(elo).min;}
function vvGetRankIdx(elo){for(let i=RANKS.length-1;i>=0;i--)if(elo>=RANKS[i].min)return i;return 0;}

// ----------------------------------------------------------------
// 7 INSTRUCTEURS IA — basés sur budget temps (ms) + bruit
// ----------------------------------------------------------------
const AI_INSTRUCTORS=[
  {id:'poussiere', name:'Instructeur Poussière',  emoji:'🪨',rankId:'poussiere', timeMs:0,    noise:0.95, desc:'Joue presque au hasard.',          elo:400},
  {id:'pierre',    name:'Instructeur Pierre',     emoji:'🗿',rankId:'pierre',    timeMs:50,   noise:0.50, desc:'Réfléchit un tout petit peu.',      elo:600},
  {id:'bronze',    name:'Instructeur Bronze',     emoji:'🥉',rankId:'bronze',    timeMs:200,  noise:0.15, desc:'~200ms de calcul, quelques coups.', elo:800},
  {id:'acier',     name:'Instructeur Acier',      emoji:'⚙️',rankId:'acier',     timeMs:500,  noise:0.05, desc:'~500ms, captures et positionnement.',elo:1000},
  {id:'obsidienne',name:'Instructeur Obsidienne', emoji:'🌑',rankId:'obsidienne',timeMs:1500, noise:0.01, desc:'~1.5s, tactique solide.',            elo:1200},
  {id:'argent',    name:'Instructeur Argent',     emoji:'🥈',rankId:'argent',    timeMs:4000, noise:0,    desc:'~4s, stratégie avancée.',            elo:1600},
  {id:'or',        name:'Instructeur Or',         emoji:'👑',rankId:'or',        timeMs:10000,noise:0,    desc:'~10s, profondeur maximale.',         elo:2000},
];

// ----------------------------------------------------------------
// CATALOGUE COMPLET DES PIÈCES (version light)
// ----------------------------------------------------------------
const PIECES=[
  {id:'roi',name:'Roi',emoji:'👑',class:'Monarque',movement:'1 case dans toutes les directions',value:3,qty:1,pieceType:'k',ability:null},
  {id:'empereur',name:'Empereur',emoji:'⚜️',class:'Monarque',movement:'1 case toutes directions OU cavalier (2+1)',value:7,qty:1,pieceType:'k',ability:'Se déplace comme un roi ou un cavalier.'},
  {id:'amazone',name:'Amazone',emoji:'🏹',class:'Général',movement:'Cavalier + Fou (diagonal illimité)',value:7,qty:1,pieceType:'q',ability:'Après une capture, peut se repositionner sur une case vide adjacente.'},
  {id:'chevaucheur-rhinoceros',name:'Chevaucheur de Rhinocéros',emoji:'🦏',class:'Général',movement:'Tour + Cavalier',value:8,qty:1,pieceType:'r',ability:null},
  {id:'dame',name:'Dame',emoji:'♛',class:'Général',movement:'Tour + Fou (dame standard)',value:10,qty:1,pieceType:'q',ability:null},
  {id:'grand-maitre',name:'Grand Maître',emoji:'🔮',class:'Général',movement:'Dame + Cavalier',value:13,qty:1,pieceType:'q',ability:'Domination royale : tant que vivant, les pions ennemis ne peuvent avancer de 2 cases.'},
  {id:'cavalier-primordial',name:'Cavalier Primordial',emoji:'♞',class:'Primordiale',movement:'Cavalier standard (2+1, saute)',value:3,qty:2,pieceType:'n',ability:'Cavalier standard.'},
  {id:'fou-primordial',name:'Fou Primordial',emoji:'♝',class:'Primordiale',movement:'Diagonal illimité',value:3,qty:2,pieceType:'b',ability:'Fou standard.'},
  {id:'tour-primordiale',name:'Tour Primordiale',emoji:'♜',class:'Primordiale',movement:'Orthogonal illimité',value:5,qty:2,pieceType:'r',ability:'Tour standard.'},
  {id:'alpha',name:'Alpha',emoji:'🐺',class:'Brute',movement:'Exactement 2 cases en diagonale (saute)',value:2,qty:2,pieceType:'b',ability:'Saute. Se déplace EXACTEMENT à 2 cases en diagonale.'},
  {id:'fourmi',name:'Fourmi',emoji:'🐜',class:'Brute',movement:'1 case en avant (orthogonal ou diagonal, déplacement et capture)',value:2,qty:2,pieceType:'p',ability:'Avance d\'1 case vers l\'avant — orthogonalement ou en diagonale — et peut capturer dans toutes ces directions. Jamais de recul. Comme un pion, ne peut pas capturer un Preux Chevalier (Cuirasse).'},
  {id:'preux-chevalier',name:'Preux Chevalier',emoji:'🛡️',class:'Brute',movement:'Exactement 2 cases orthogonales (sans sauter) OU 1 case diagonale',value:2,qty:2,pieceType:'r',ability:'Cuirasse : ne peut être capturé par des pions (ni par la Fourmi).'},
  {id:'dresseur-elephant',name:"Dresseur d'Éléphant",emoji:'🐘',class:'Brute',movement:'1 ou 2 cases orthogonalement (sans sauter)',value:3,qty:2,pieceType:'r',ability:'Charge : en avançant de 2 cases, détruit les pièces ennemies sur son passage.'},
  {id:'garde-pierre',name:'Garde de Pierre',emoji:'🪨',class:'Brute',movement:'1 case dans toutes les directions',value:3,qty:2,pieceType:'p',ability:'Roc de pierre (1×/partie) : s\'ancre sur place, imprenable et inamovible.',hasPower:true,powerLabel:'Ancrer (Roc de Pierre)'},
  {id:'meduse',name:'Méduse',emoji:'🪼',class:'Sorcier',movement:'1 case orthogonale',value:2,qty:2,pieceType:'p',ability:'Paralyse les pièces ennemies diagonalement adjacentes.'},
  {id:'typhon',name:'Typhon',emoji:'🌪️',class:'Sorcier',movement:'1 case en diagonale maximum',value:5,qty:2,pieceType:'b',ability:'Détruit toutes les pièces adjacentes à sa case d\'arrivée. Ne peut pas détruire le roi.'},
  {id:'banshee',name:'Banshee',emoji:'👻',class:'Sorcier',movement:'2 cases en diagonale (sans sauter)',value:4,qty:2,pieceType:'b',ability:'Hurle : les pions adverses à 1 case reculent d\'une case si possible.'},
  {id:'pretre',name:'Prêtre',emoji:'✝️',class:'Sorcier',movement:'1 à 2 cases orthogonalement',value:4,qty:2,pieceType:'r',ability:'Empêche les captures dans les cases DIAGONALEMENT adjacentes au Prêtre.'},
];

const TRUE_PAWN_IDS=new Set(['std-pawn']);
const CLASS_ORDER={Monarque:1,Général:2,Primordiale:3,Brute:4,Sorcier:5};
// Couleurs partagées par classe de pièce — utilisées par le menu contextuel factorisé
const CLASS_COLOR_VARS={Monarque:'var(--monarque)',Général:'var(--general)',Primordiale:'var(--primordiale)',Brute:'var(--brute)',Sorcier:'var(--sorcier)'};

// ----------------------------------------------------------------
// TABLE DE DÉBLOCAGE — pièces débloquées par palier d'ELO
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
  {pieceId:null,eloRequired:2400,bigReward:true,label:'🎉 Or Légendaire atteint !'},
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
