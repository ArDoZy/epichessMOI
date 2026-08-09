// ================================================================
// DATA-PIECES.JS : Données statiques du jeu (aucune logique de rendu ici)
// ================================================================
// Contient : RANKS (rangs ELO), PIECES (catalogue complet des pièces),
// AI_INSTRUCTORS (l'Instructeur du jeu + les 4 paliers du tutoriel),
// UNLOCK_TABLE / UNLOCK_MILESTONES (progression des déblocages), et quelques
// constantes de classes partagées.
//
// Dépendances : aucune (chargé en tout premier après les libs).
// Utilisé par : à peu près tous les autres modules (builder, rules-engine,
// ai-engine, voie, tournoi, game-flow...).
//
// Si vous ajoutez une nouvelle pièce : l'ajouter dans PIECES, puis dans
// UNLOCK_TABLE si elle doit être débloquée par ELO (ou marquée coffre:true
// pour n'exister que dans les coffres).
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
// LES ADVERSAIRES : douze paliers, de 150 à 2300 ELO
// ----------------------------------------------------------------
// Il n'y avait qu'UN adversaire, l'Instructeur, à 2000 ELO et à pleine
// puissance. Or le tutoriel se termine contre un instructeur qui laisse passer
// un coup sur trois : le joueur sortait donc de l'apprentissage face à un mur.
// Et comme l'entraînement contre l'IA n'était pas classé, un joueur seul ne
// pouvait gagner un seul point d'ELO — c'est-à-dire ne débloquer ni le Garde
// de Pierre (30 ELO), ni la Méduse (210), ni le Typhon (1000), ni un seul
// échiquier. Toute la progression du jeu lui était fermée.
//
// Il y a maintenant une PENDERIE d'adversaires, chacun avec son niveau, son
// style d'armée et sa façon de se tromper. Les affronter est CLASSÉ (voir
// vvNoEloReason dans js/voie.js) : le classement redevient une échelle qu'on
// gravit en jouant, seul, contre des forces connues.
//
// Les champs qui pilotent la force (lus par js/ai-engine.js) :
//
//   timeMs   budget de réflexion par coup. 0 = aucune recherche, la position
//            est jugée à un demi-coup (« je vois la pièce à prendre, pas le
//            mat en deux »).
//   depthCap profondeur maximale, même si le temps le permet. C'est elle qui
//            empêche un adversaire faible de trouver une combinaison longue.
//   slack    tolérance en centipions AUTOUR du meilleur coup : l'adversaire
//            tire au sort parmi tous les coups qui ne perdent pas plus que ça.
//            C'est le cœur du modèle : un joueur faible ne joue pas au hasard,
//            il joue des coups plausibles mais imprécis.
//   blunder  probabilité, à chaque coup, de lâcher franchement la position
//            (un coup pris au hasard dans la moitié basse). Les vrais
//            débutants accrochent des pièces : sans ce terme, un adversaire à
//            slack élevé reste bizarrement solide.
//   style    biais de composition d'armée ET d'évaluation (voir STYLE_EVAL
//            dans js/ai-engine.js et generateAIArmy dans js/armies.js).
//   budget   valeur d'armée visée, sur les 24 points du builder.
//   tier     plafond de rareté du coffre gagné en le battant (index dans
//            CHESTS). Battre un débutant vingt fois ne donne pas un Coffre
//            Roi : c'est ce qui empêche de farmer le bas de l'échelle.
//
// PORTRAITS : chaque adversaire cherche `assets/adversaires/<id>.png`. Le
// fichier est FACULTATIF — sans lui, js/adversaires.js dessine un sceau SVG
// procédural à partir de l'id et de la couleur d'accent. Déposer une image
// suffit à la faire apparaître, il n'y a aucune liste à mettre à jour.
const AI_OPPONENTS=[
  {id:'cendre',name:'Cendre',title:'Balayeuse de l\'atelier',elo:150,tier:0,
   accent:'#8b8578',style:'erratique',budget:12,
   timeMs:0,depthCap:1,slack:900,blunder:0.34,
   desc:'Elle a vu jouer par-dessus l\'épaule du savant, jamais rien de plus.'},
  {id:'suie',name:'Suie',title:'Souffleur de verre',elo:300,tier:0,
   accent:'#6f7a86',style:'gourmand',budget:14,
   timeMs:0,depthCap:1,slack:620,blunder:0.24,
   desc:'Prend tout ce qui passe à portée, sans jamais demander pourquoi.'},
  {id:'bruyere',name:'Bruyère',title:'Herboriste',elo:450,tier:1,
   accent:'#7d9c6a',style:'nuee',budget:16,
   timeMs:250,depthCap:2,slack:440,blunder:0.16,
   desc:'Avance en nombre. Chaque petite chose qu\'elle pousse en cache une autre.'},
  {id:'orpiment',name:'Orpiment',title:'Broyeur de minerai',elo:620,tier:1,
   accent:'#c08a3e',style:'brute',budget:17,
   timeMs:400,depthCap:3,slack:340,blunder:0.11,
   desc:'Ne connaît qu\'une trajectoire : la ligne droite, et ce qu\'elle écrase.'},
  {id:'vitriol',name:'Vitriol',title:'Maître des acides',elo:800,tier:2,
   accent:'#5f93b8',style:'agressif',budget:18,
   timeMs:600,depthCap:4,slack:250,blunder:0.075,
   desc:'Attaque tôt, attaque mal, mais attaque toujours en premier.'},
  {id:'cinabre',name:'Cinabre',title:'Teinturière du mercure',elo:980,tier:2,
   accent:'#c0504a',style:'sorcier',budget:19,
   timeMs:800,depthCap:5,slack:185,blunder:0.05,
   desc:'Ne prend presque rien. Elle paralyse, elle repousse, et elle attend.'},
  {id:'antimoine',name:'Antimoine',title:'Gardien du seuil',elo:1150,tier:3,
   accent:'#8fa8b8',style:'defensif',budget:20,
   timeMs:1000,depthCap:6,slack:135,blunder:0.035,
   desc:'Une muraille qui ne recule pas d\'un pas et ne concède pas une case.'},
  {id:'mercure',name:'Mercure',title:'Messager instable',elo:1350,tier:3,
   accent:'#a9b6bd',style:'mobile',budget:21,
   timeMs:1300,depthCap:8,slack:95,blunder:0.022,
   desc:'Il est déjà ailleurs. Ce que vous préparez arrive toujours un coup trop tard.'},
  {id:'plombagine',name:'Plombagine',title:'Scribe des positions',elo:1550,tier:4,
   accent:'#7a7590',style:'positionnel',budget:22,
   timeMs:1700,depthCap:10,slack:60,blunder:0.012,
   desc:'Ne cherche pas la combinaison. Il installe la position, puis vous étouffe.'},
  {id:'salamandre',name:'La Salamandre',title:'Née du fourneau',elo:1750,tier:4,
   accent:'#d9552f',style:'agressif',budget:23,
   timeMs:2200,depthCap:14,slack:35,blunder:0.006,
   desc:'Elle sacrifie sans hésiter. Le calcul suit toujours, et il est juste.'},
  {id:'instructeur',name:'L\'Instructeur',title:'Second du laboratoire',elo:2000,tier:5,
   accent:'#2fb197',style:'equilibre',budget:24,
   timeMs:3000,depthCap:30,slack:0,blunder:0,
   desc:'Recherche complète, consciente des pouvoirs de chaque créature.'},
  {id:'athanor',name:'L\'Athanor',title:'Le four qui ne s\'éteint pas',elo:2300,tier:5,
   accent:'#c9a84c',style:'equilibre',budget:24,
   timeMs:5000,depthCap:30,slack:0,blunder:0,
   desc:'Le savant l\'a allumé une fois et n\'a jamais su l\'arrêter. Il n\'oublie rien.'},
];
function aiOpponentById(id){return AI_OPPONENTS.find(o=>o.id===id)||AI_OPPONENTS[0];}
function aiOpponentIndex(id){const i=AI_OPPONENTS.findIndex(o=>o.id===id);return i<0?0:i;}
// L'Instructeur reste exporté sous son ancien nom : plusieurs modules
// l'affichent encore comme adversaire par défaut, et le tutoriel comme le
// multijoueur s'y réfèrent.
const INSTRUCTOR=AI_OPPONENTS[aiOpponentIndex('instructeur')];
// ----------------------------------------------------------------
// LES INSTRUCTEURS DU TUTORIEL : quatre paliers volontairement faibles
// ----------------------------------------------------------------
// L'Instructeur à pleine puissance est un mur pour un débutant : le tutoriel
// a besoin d'adversaires qu'on peut battre au premier essai. Ces quatre-là ne
// servent QUE pendant le tutoriel (js/tutorial.js), jamais dans le jeu
// normal, et aucune partie du tutoriel ne compte au classement.
//
// Ils suivent le même modèle de force que les adversaires ci-dessus (slack =
// tolérance autour du meilleur coup, blunder = probabilité de lâcher la
// position), à des réglages volontairement très bas : ce sont les toutes
// premières parties du joueur, personne ne doit rester bloqué sur le tutoriel.
const TUTO_INSTRUCTORS=[
  {id:'tuto-nul',      name:'Instructeur Novice',   elo:0,timeMs:0,depthCap:1,slack:1200,blunder:0.45,desc:'Joue au hasard, ou presque.'},
  {id:'tuto-nul-plus', name:'Instructeur Apprenti', elo:0,timeMs:0,depthCap:1,slack:900, blunder:0.34,desc:'Commence à voir les prises.'},
  {id:'tuto-moyen-nul',name:'Instructeur Assistant',elo:0,timeMs:0,depthCap:1,slack:700, blunder:0.26,desc:'Prend ce qui traîne.'},
  {id:'tuto-moyen',    name:'Instructeur Confirmé', elo:0,timeMs:0,depthCap:1,slack:520, blunder:0.18,desc:'Se laisse encore surprendre.'},
];
// Le Worker IA reçoit ce tableau sérialisé et lit AI_INSTRUCTORS[instructorIdx]
// (selectedAILevel) : les douze adversaires d'abord, les quatre paliers du
// tutoriel ensuite. Ajouter une entrée dans AI_OPPONENTS suffit, il n'y a rien
// à modifier dans js/ai-engine.js.
const AI_INSTRUCTORS=[...AI_OPPONENTS,...TUTO_INSTRUCTORS];
// Index dans AI_INSTRUCTORS du palier de tutoriel n° i (0 à 3).
function tutoInstructorLevel(i){return AI_OPPONENTS.length+Math.max(0,Math.min(TUTO_INSTRUCTORS.length-1,i));}
// Index par défaut : l'Instructeur, qui reste l'adversaire de référence.
const DEFAULT_AI_LEVEL=aiOpponentIndex('instructeur');

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

// ----------------------------------------------------------------
// PERLES : la monnaie des coffres
// ----------------------------------------------------------------
// Les coffres ne contiennent plus seulement des pièces : ils contiennent
// aussi des PERLES, et les perles rachètent des coffres. C'est ce qui donne
// une sortie à une série de coffres médiocres : même sans pièce inédite, on
// avance vers le coffre qu'on vise.
//
// pearls : fourchette de perles contenues dans le coffre.
// price  : coût du coffre à la boutique de la Réserve.
const CHEST_PEARLS={
  pion:    {pearls:[5,15],   price:30},
  cavalier:{pearls:[12,30],  price:120},
  fou:     {pearls:[20,45],  price:150},
  tour:    {pearls:[35,80],  price:250},
  dame:    {pearls:[60,140], price:500},
  roi:     {pearls:[100,220],price:750},
};
function chestPearlRange(id){return (CHEST_PEARLS[id]||CHEST_PEARLS.pion).pearls;}
function chestPearlPrice(id){return (CHEST_PEARLS[id]||CHEST_PEARLS.pion).price;}

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
// Un compte neuf ne possède que son Monarque et son Général : tout le reste
// s'obtient en jouant. L'Alpha, la Fourmi et le Garde de Pierre arrivent dans
// les coffres du tutoriel (js/tutorial.js) ; les trois Primordiales ne
// s'obtiennent QUE dans les coffres (il n'y a plus de « choix de la
// Primordiale » à la création du compte : on ne choisit pas ce qu'on ne
// connaît pas encore).
// `coffre:true` = la pièce n'est ni donnée au départ, ni débloquée par un
// palier d'ELO : elle n'existe que comme contenu de coffre, et n'apparaît
// donc pas comme jalon sur la Voie.
const UNLOCK_TABLE=[
  {pieceId:'roi',eloRequired:0},{pieceId:'dame',eloRequired:0},
  {pieceId:'alpha',eloRequired:0,coffre:true},{pieceId:'fourmi',eloRequired:0,coffre:true},
  {pieceId:'cavalier-primordial',eloRequired:0,coffre:true},
  {pieceId:'fou-primordial',eloRequired:0,coffre:true},
  {pieceId:'tour-primordiale',eloRequired:0,coffre:true},
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
