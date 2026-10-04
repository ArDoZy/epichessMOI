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
// ai-engine, voie, game-flow...).
//
// Si vous ajoutez une nouvelle pièce : l'ajouter dans PIECES, puis dans
// PIECE_ARENA (l'arène à partir de laquelle elle sort des coffres). Si elle a
// une ligne `ability`, son pouvoir s'éveillera avec des débris magiques, et
// le moteur doit savoir ce qu'elle fait SANS lui (drapeau `np`,
// js/rules-engine.js).
// Si vous ajoutez un rang ELO : l'ajouter dans RANKS (ordre croissant, min/max
// contigus), tout le reste (vvGetRank, badges, filtres IA) s'adapte seul.
// ================================================================

// ----------------------------------------------------------------
// RANGS ELO
// ----------------------------------------------------------------
// LA COULEUR D'UN RANG EST CELLE DE SA MATIÈRE. Le Bois était gris-mauve et
// l'Obsidienne un violet si sombre (#5a3f8a) qu'il disparaissait sur la nuit
// de l'interface : « Bois » s'écrivait en lilas sous un médaillon de bois
// brun. Le bois est brun, l'obsidienne garde son reflet violet, mais assez
// clair pour se lire.
const RANKS=[
  {id:'bois',     name:'Bois',       color:'#b48a5a',min:0,   max:199},
  {id:'pierre',   name:'Pierre',     color:'#9a8c7a',min:200, max:499},
  {id:'bronze',   name:'Bronze',     color:'#cd7f32',min:500, max:799},
  {id:'acier',    name:'Acier',      color:'#8fa8b8',min:800, max:1199},
  {id:'obsidienne',name:'Obsidienne',color:'#9d82d8',min:1200,max:1499},
  {id:'argent',   name:'Argent',     color:'#c0c0c0',min:1500,max:1999},
  {id:'or',       name:'Or Légendaire',color:'#c9a84c',min:2000,max:9999},
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
// pouvait gagner un seul point d'ELO — c'est-à-dire ne débloquer ni le Preux
// Chevalier (50 ELO), ni la Méduse (210), ni le Typhon (1000), ni un seul
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
//   tier     palier de difficulté, de 0 (Cendre) à 5 (L'Athanor). Il a
//            longtemps PLAFONNÉ la rareté du coffre gagné en battant
//            l'adversaire — et comme la galerie conseille les deux plus
//            faibles à un compte neuf, un débutant ne voyait jamais autre
//            chose qu'un Coffre Pion, même après six victoires d'affilée.
//            Ce n'est plus le cas : la série seule décide du coffre (voir
//            economySettle, js/economy.js), et le verrou quotidien suffit à
//            empêcher de farmer le bas de l'échelle. Le champ ne sert plus
//            qu'à situer l'adversaire sur l'échelle des douze.
//
// PORTRAITS : chaque adversaire cherche `assets/adversaires/<id>.png`. Le
// fichier est FACULTATIF — sans lui, js/adversaires.js dessine un sceau SVG
// procédural à partir de l'id et de la couleur d'accent. Déposer une image
// suffit à la faire apparaître, il n'y a aucune liste à mettre à jour.
const AI_OPPONENTS=[
  {id:'cendre',name:'Cendre',title:'Balayeuse de l\'atelier',elo:150,tier:0,
   accent:'#8b8578',style:'erratique',budget:12,
   timeMs:0,depthCap:1,slack:900,blunder:0.34,
   desc:'Elle a vu jouer par-dessus l\'épaule d\'un Alchimiste, jamais rien de plus.'},
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
   desc:'Un Alchimiste l\'a allumé une fois et n\'a jamais su l\'arrêter. Il n\'oublie rien.'},
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
// sqLight / sqDark : les deux teintes de case de CHAQUE plateau. Elles servent
// aux repères de coordonnées, qui vivent maintenant DANS les cases de bord
// (voir renderGame) : un repère posé sur une case claire prend la teinte de la
// case foncée, et réciproquement. Sans ces valeurs il faudrait un fond derrière
// chaque lettre, ce qui salirait la matière du plateau.
// Ce sont les teintes MOYENNES des cases telles que tools/gen-boards.js les
// peint (couleur de base du matériau) : à reprendre si on y touche.
const BOARD_SKINS=[
  {id:'bois',   name:'Bois',   file:'assets/boards/bois.svg',   eloRequired:0,    sqLight:'#d3a565', sqDark:'#683b1b', desc:'Chêne blond et noyer, filet de laiton : le plateau de l\'atelier.'},
  {id:'pierre', name:'Pierre', file:'assets/boards/pierre.svg', eloRequired:200,  sqLight:'#dedbd4', sqDark:'#47494e', desc:'Dalle de marbre veiné taillée au ciseau, sceau runique au cœur.'},
  {id:'acier',  name:'Acier',  file:'assets/boards/acier.svg',  eloRequired:850,  sqLight:'#c3cad1', sqDark:'#465668', desc:'Acier damassé et bleui, incrusté d\'un fil d\'or.'},
  {id:'argent', name:'Argent', file:'assets/boards/argent.svg', eloRequired:1800, sqLight:'#dde2e7', sqDark:'#56606b', desc:'Argent poli et niellé, gravé d\'arabesques.'},
  {id:'or',     name:'Or',     file:'assets/boards/or.svg',     eloRequired:2400, sqLight:'#d8a640', sqDark:'#82470f', desc:'Or poli et or amati, cloutés d\'or. Il n\'y a rien au-delà.'},
];

// ----------------------------------------------------------------
// COFFRES : six raretés nommées d'après les pièces d'échecs
// ----------------------------------------------------------------
// Ils s'obtiennent de trois façons, et de trois seulement : la RÉCOMPENSE
// JOURNALIÈRE (DAILY_REWARDS, plus bas), la COLONNE DES VICTOIRES
// (js/rewards.js) et l'achat en perles au Magasin.
//
// LA PIÈCE INÉDITE EST RARE. Elle sortait d'un coffre sur trente au Pion et
// d'un sur deux au Roi : débloquer tout le catalogue ne demandait qu'une
// poignée de bons coffres, et le Coffre Roi n'avait plus rien à donner. Les
// six probabilités sont 1 %, 2,8 %, 3 %, 5 %, 10 % et 25 % : une pièce
// inédite est un événement, y compris tout en haut.
//
// Ce qui a été retiré d'un côté est rendu de l'autre : la probabilité qu'un
// lot soit un BON lot (tirage nettement plus favorable aux pièces chères) est
// calculée à partir de newChance (chestLuckyChance, js/economy.js). Un coffre
// sans pièce inédite reste donc un bon coffre.
//
// LES QUANTITÉS SONT DES TOTAUX, ET ELLES SONT PETITES.
// Les coffres se décrivaient en `rolls` lots de `qty` exemplaires chacun, avec
// un facteur « bon lot » qui doublait la quantité : personne ne pouvait dire,
// en lisant la table, ce qu'un coffre donnait vraiment. La réponse était
// « beaucoup trop » — plus de 70 exemplaires en moyenne par pièce en stock,
// c'est-à-dire un inventaire où plus rien de ce qu'on ouvre ne change quoi que
// ce soit à ce qu'on peut aligner.
//
// `total` est maintenant le nombre d'exemplaires que le coffre donne EN TOUT,
// tous lots confondus (chestRoll, js/economy.js, tire ce total puis le répartit
// sur ses lots). `pearls` (CHEST_PEARLS plus bas) suit la même échelle et est
// lui aussi un total. On lit donc la table comme le joueur voit le coffre :
//
//   pion 1-3 · cavalier 3-5 · fou 5-8 · tour 8-12 · dame 12-20 · roi 20-30
//
// rolls     : nombre de lots tirés EN MOYENNE (±1, voir chestRollCount). Ce
//             n'est plus qu'un rythme de cérémonie : le total ne dépend pas de
//             lui, il est seulement découpé en autant de parts.
// total     : fourchette du NOMBRE TOTAL d'exemplaires donnés
// newChance : probabilité de contenir une pièce ENCORE JAMAIS DÉBLOQUÉE
// bias      : plus il est élevé, plus les pièces chères sont probables
const CHESTS=[
  {id:'pion',    tier:0,name:'Coffre Pion',    rolls:2,total:[1,3],  newChance:0.06,bias:0.60,color:'#7f8b94',debris:{p:0.30,n:[1,1]}},
  {id:'cavalier',tier:1,name:'Coffre Cavalier',rolls:3,total:[3,5],  newChance:0.10,bias:0.90,color:'#7d9c6a',debris:{p:0.45,n:[1,2]}},
  {id:'fou',     tier:2,name:'Coffre Fou',     rolls:3,total:[5,8],  newChance:0.15,bias:1.25,color:'#5f93b8',debris:{p:0.60,n:[2,3]}},
  {id:'tour',    tier:3,name:'Coffre Tour',    rolls:4,total:[8,12], newChance:0.22,bias:1.80,color:'#9a6fc4',debris:{p:0.75,n:[2,4]}},
  {id:'dame',    tier:4,name:'Coffre Dame',    rolls:5,total:[12,20],newChance:0.32,bias:2.40,color:'#d0742e',debris:{p:1.00,n:[3,5]}},
  {id:'roi',     tier:5,name:'Coffre Roi',     rolls:6,total:[20,30],newChance:0.50,bias:3.30,color:'#d9b64e',debris:{p:1.00,n:[5,8]}},
];
// LE COFFRE EST DEVENU LE SEUL CHEMIN VERS UNE CRÉATURE (voir PIECE_ARENA
// plus bas) : les probabilités de pièce inédite ont donc été relevées — 1 %
// au Pion, c'était le taux d'un bonus quand la Diagonale donnait l'essentiel ;
// c'est un mur quand elle ne donne plus rien. Elles restent sous la barre du
// « toujours » : une créature inédite doit rester un événement.
//
// LA MALCHANCE A UN PLAFOND. Après CHEST_PITY coffres d'affilée sans créature
// inédite — alors qu'il en restait à gagner dans l'arène — le suivant en
// contient une à coup sûr (chestRoll, js/economy.js). Sans lui, un joueur
// malchanceux pouvait ouvrir trente Coffres Pion sans rien voir d'autre que
// ce qu'il avait déjà.
const CHEST_PITY=5;
// `debris` : la chance qu'un coffre contienne des DÉBRIS MAGIQUES, et
// combien. Ils vont toujours à une créature POSSÉDÉE dont le pouvoir dort
// encore (voir POWER_DEBRIS_NEEDED) ; quand il n'y en a plus, il n'en tombe
// plus.
function chestById(id){return CHESTS.find(c=>c.id===id)||CHESTS[0];}
// IL N'Y A PLUS DE SÉRIE DU JOUR, DONC PLUS DE chestForStreak(). Les six
// coffres se gagnaient en enchaînant les victoires dans la journée ; ils
// tombent maintenant par la RÉCOMPENSE JOURNALIÈRE (DAILY_REWARDS, plus bas),
// la COLONNE DES VICTOIRES (js/rewards.js) et le Magasin.

// ----------------------------------------------------------------
// PERLES : la monnaie des coffres
// ----------------------------------------------------------------
// Les coffres ne contiennent pas seulement des pièces : ils contiennent aussi
// des PERLES, et les perles rachètent des coffres. C'est ce qui donne une
// sortie à un coffre médiocre : même sans pièce inédite, on avance vers le
// coffre qu'on vise.
//
// pearls : nombre de perles contenues dans le coffre, EN TOUT. Un seul tirage,
//          sans facteur « bon lot » : la fourchette écrite ici est exactement
//          ce que le joueur peut recevoir.
// price  : prix du coffre, payable en perles au Magasin.
//
// TOUTE L'ÉCHELLE A ÉTÉ DIVISÉE PAR DIX, perles ET prix ensemble. Les perles
// suivent maintenant la même fourchette que les exemplaires (voir `total` dans
// CHESTS) : pion 1-3, cavalier 3-5, fou 5-8, tour 8-12, dame 12-20, roi 20-30.
// Laisser les prix à leur ancienne échelle (30 à 750) aurait fermé le Magasin :
// il aurait fallu une trentaine de Coffres Roi pour en racheter un.
//
// UN COFFRE NE DOIT JAMAIS SE REMBOURSER, même sur son meilleur tirage : le
// haut de chaque fourchette reste sous la MOITIÉ du prix.
//
//   pion 3/8 · cavalier 5/16 · fou 8/26 · tour 12/40 · dame 20/64 · roi 30/100
//
// Toucher à l'une de ces fourchettes, c'est refaire ce calcul.
const CHEST_PEARLS={
  pion:    {pearls:[1,3],  price:8},
  cavalier:{pearls:[3,5],  price:16},
  fou:     {pearls:[5,8],  price:26},
  tour:    {pearls:[8,12], price:40},
  dame:    {pearls:[12,20],price:64},
  roi:     {pearls:[20,30],price:100},
};
function chestPearlRange(id){return (CHEST_PEARLS[id]||CHEST_PEARLS.pion).pearls;}
function chestPearlPrice(id){return (CHEST_PEARLS[id]||CHEST_PEARLS.pion).price;}

// Coffre de réapprovisionnement quotidien : le filet de sécurité du système.
// Sans lui, un joueur qui perd tout son inventaire ne pourrait plus composer
// d'armée du tout.
//
// IL NE REMPLIT QUE CE QUI EST VIDE. Versé tous les jours, sur tout le
// catalogue possédé, sans rien demander, il était en réalité la plus grosse
// source de pièces du jeu — très loin devant les coffres, qui eux se méritent.
// Resserrer les coffres en le laissant tel quel n'aurait rien changé au stock :
// il aurait continué d'empiler deux exemplaires par pièce et par jour,
// indéfiniment. `cap` est le SEUIL au-dessous duquel il verse : une pièce déjà
// pourvue ne reçoit rien, une pièce laminée par une défaite est remise debout
// dès le lendemain. Le filet reste tendu, le robinet est fermé.
const DAILY_CHEST={id:'reappro',name:'Coffre de réapprovisionnement',perPiece:2,cap:10};

// ----------------------------------------------------------------
// LA RÉCOMPENSE JOURNALIÈRE : un lot par jour, un cycle de seize
// ----------------------------------------------------------------
// Elle remplace la SÉRIE DU JOUR, qui demandait d'enchaîner six victoires dans
// la même journée et qu'une seule défaite refermait jusqu'au lendemain : elle
// punissait exactement le joueur qui joue beaucoup, et elle ne donnait rien du
// tout à celui qui passe dire bonjour.
//
// Ici, revenir suffit. Chaque jour ouvre le lot suivant du cycle ; le cycle
// fait SEIZE jours et RECOMMENCE indéfiniment (voir dailyRewardStep,
// js/rewards.js, qui indexe modulo la longueur du tableau). Un jour manqué ne
// coûte rien : on reprend là où on s'était arrêté, le cycle avance d'un cran
// par récupération et non par jour de calendrier.
//
// POURQUOI SEIZE ET NON TRENTE. Un cycle d'un mois faisait de la deuxième
// moitié une promesse que presque personne n'atteignait : le Coffre Tour
// tombait au quinzième jour, et il fallait un mois entier pour revoir le
// premier lot. Sur seize jours, chaque nature de lot revient deux fois — deux
// Coffres Tour, deux Coffres Fou, deux Coffres Cavalier, quatre Coffres Pion,
// trois versements de perles et trois poignées de jokers — et le cycle se
// boucle assez vite pour qu'on en connaisse la forme.
//
// Trois natures de lot, les mêmes que la colonne des victoires :
//   {chest:'<id>'}  un coffre, ouvert avec la cérémonie habituelle
//   {pearls:n}      n perles
//   {jokers:n}      n jokers, convertis en la créature de son choix
const DAILY_REWARDS=[
  {chest:'pion'},    {pearls:10},   {chest:'cavalier'},{chest:'pion'},
  {jokers:5},        {chest:'fou'}, {chest:'tour'},    {pearls:10},
  {chest:'pion'},    {jokers:5},    {chest:'cavalier'},{chest:'pion'},
  {pearls:10},       {chest:'fou'}, {chest:'tour'},    {jokers:5},
];

// ----------------------------------------------------------------
// CATALOGUE COMPLET DES PIÈCES (version light)
// ----------------------------------------------------------------
// IL N'Y A PLUS DE CHAMP `movement`. Une pièce ne décrit plus son déplacement
// en mots (« Exactement 2 cases orthogonales (sans sauter) OU 1 case
// diagonale ») : elle le MONTRE, sur un schéma 9×9 déduit du moteur de règles
// lui-même (js/piece-moves.js). Une phrase pouvait mentir en silence le jour
// où generateMovesRaw changeait ; le schéma, lui, suit.
//
// `ability` ne garde donc que les vrais POUVOIRS — ce qu'une créature fait EN
// PLUS de bouger, et qui ne se dessine pas sur une grille de cases (paralysie
// de la Méduse, Cuirasse du Preux Chevalier, Charge de l'Éléphant de
// guerre…). Les anciennes « capacités » qui ne faisaient que redire le déplacement
// (« Cavalier standard. », « Ne peut pas reculer. ») sont parties avec le
// champ `movement`.
// Les libellés de `ability` sont la RÉFÉRENCE du jeu : ce sont eux qu'affichent
// la carte du builder, la fiche (clic droit) et l'écran de déblocage. Ils
// doivent donc dire le pouvoir tel qu'il est codé, mot pour mot — une pièce
// sans pouvoir porte `null` et n'affiche rien, plutôt qu'une phrase qui
// paraphrase son déplacement.
const PIECES=[
  {id:'roi',name:'Roi',emoji:'👑',class:'Monarque',value:3,qty:1,pieceType:'k',ability:null},
  // LE ROI N'EST PLUS LE SEUL MONARQUE : on peut le REMPLACER. Une armée n'en
  // aligne toujours qu'un (l'emplacement Monarque du builder), si bien que la
  // question « lequel des deux protéger ? » qui a fait retirer l'ancien
  // Empereur ne se pose jamais — il y a un Monarque par camp, quel qu'il soit.
  //
  // La MATRIARCHE ne marche qu'en biais, d'une case (ni roque, ni pas droit),
  // et relève le Général tombé (voir « LA RÉANIMATION DE LA MATRIARCHE »,
  // js/rules-engine.js).
  //
  // L'EMPEREUR marche en Roi et bondit en Cavalier. SON IDENTIFIANT EST
  // 'imperator', et non 'empereur' : celui-là est retiré (RETIRED_PIECE_IDS
  // plus bas) et migré vers le Roi dans les vieux comptes — le réutiliser
  // ferait apparaître l'Empereur dans des armées qui ne l'ont jamais choisi.
  {id:'matriarche',name:'Matriarche',emoji:'👸',class:'Monarque',value:3,qty:1,pieceType:'k',ability:'Réanimation : Si votre Général tombe, elle le relève une fois en créature de valeur 2, posée sur une case libre à côté d\'elle. Cela ne coûte pas votre tour',hasPower:true,powerLabel:'Réanimation'},
  {id:'imperator',name:'Empereur',emoji:'🤴',class:'Monarque',value:7,qty:1,pieceType:'k',ability:null},
  {id:'amazone',name:'Amazone',emoji:'🏹',class:'Général',value:7,qty:1,pieceType:'q',ability:null},
  // DEUX CRÉATURES PORTENT UN IDENTIFIANT QUI NE DIT PLUS LEUR NOM, et c'est
  // la seule ligne du dépôt qui a le droit de citer les anciens : le
  // « Chevaucheur de Rhinocéros » s'appelle maintenant le CENTAURE, et le
  // « Dresseur d'Éléphant » l'ÉLÉPHANT DE GUERRE. Partout ailleurs — écrans,
  // commentaires, outils, feuille de style — seuls les nouveaux noms
  // s'écrivent.
  //
  // LES IDENTIFIANTS, EUX, NE BOUGENT PAS : 'chevaucheur-rhinoceros' et
  // 'dresseur-elephant' sont les clés sous lesquelles les armées, les
  // inventaires et les déblocages sont DÉJÀ enregistrés dans les comptes
  // existants, et les noms des fichiers d'illustration (assets/pieces/*.webp).
  // Les renommer viderait la Guerre des clans de tout le monde, sans même une
  // erreur : les pièces disparaîtraient simplement des armées.
  //
  // La contrainte s'arrête là. Les noms de FONCTIONS internes, eux, ne sont pas
  // des clés de stockage : applyChargeEffect (js/rules-engine.js) a pu prendre
  // le nom de ce qu'elle fait plutôt que celui d'une pièce.
  {id:'chevaucheur-rhinoceros',name:'Centaure',emoji:'🐴',class:'Général',value:8,qty:1,pieceType:'r',ability:null},
  {id:'dame',name:'Dame',emoji:'♛',class:'Général',value:10,qty:1,pieceType:'q',ability:null},
  {id:'grand-maitre',name:'Grand Maître',emoji:'🔮',class:'Général',value:13,qty:1,pieceType:'q',ability:'Domination : Tant qu\'il est vivant, les pions adverses ne peuvent pas avancer de 2 cases'},
  // NYX marche en Roi et bondit en Cavalier. Son pouvoir ne change aucune
  // règle : il change ce que l'adversaire VOIT (nyxFogFor, js/rules-engine.js).
  // Son identifiant est neuf — l'Empereur, qui se déplaçait pareil, est retiré
  // et son identifiant ne doit jamais resservir (RETIRED_PIECE_IDS).
  {id:'nyx',name:'Nyx',emoji:'🌑',class:'Général',value:9,qty:1,pieceType:'q',ability:'Voile de la Nuit : L\'adversaire ne voit pas les cases autour de Nyx, vides ou tenues par son camp ; il n\'y voit que ses propres pièces. Nyx prise, le voile se lève'},
  {id:'cavalier-primordial',name:'Cavalier Primordial',emoji:'♞',class:'Primordiale',value:3,qty:2,pieceType:'n',ability:null},
  {id:'fou-primordial',name:'Fou Primordial',emoji:'♝',class:'Primordiale',value:3,qty:2,pieceType:'b',ability:null},
  {id:'tour-primordiale',name:'Tour Primordiale',emoji:'♜',class:'Primordiale',value:5,qty:2,pieceType:'r',ability:null},
  {id:'fourmi',name:'Fourmi',emoji:'🐜',class:'Brute',value:2,qty:2,pieceType:'p',ability:'Promotion : Se promeut si elle arrive sur la dernière rangée'},
  {id:'preux-chevalier',name:'Preux Chevalier',emoji:'🛡️',class:'Brute',value:3,qty:2,pieceType:'r',ability:'Cuirasse : Les pions adverses ne peuvent pas le capturer'},
  {id:'dresseur-elephant',name:'Éléphant de guerre',emoji:'🐘',class:'Brute',value:3,qty:2,pieceType:'r',ability:'Charge : Détruit toutes les pièces ennemies sur son passage'},
  // LE GARDE DE PIERRE : la première créature du jeu, et la plus simple à
  // comprendre. Une case dans les huit directions — le vocabulaire complet du
  // plateau en un seul déplacement, orthogonal ET diagonal — plus un pouvoir
  // qu'on déclenche soi-même. C'est par lui que commence le tutoriel.
  //
  // IL ÉTAIT LE TROISIÈME DE TROIS GARDES. Le Garde d'Eau (une case tout
  // droit) et le Garde de Feu (une case en biais) le précédaient et ont été
  // RETIRÉS du jeu : trois créatures pour enseigner « orthogonal, diagonal,
  // les deux » faisaient deux créatures de trop, et les deux premières
  // n'avaient aucun pouvoir à montrer. Le tutoriel enseigne désormais le
  // Garde de Pierre, puis la Fourmi, puis l'Éléphant de guerre — un
  // déplacement ET un pouvoir à chaque fois (voir js/tutorial.js).
  {id:'garde-pierre',name:'Garde de Pierre',emoji:'🪨',class:'Brute',value:3,qty:2,pieceType:'p',ability:'Retour à l\'Etat Fondamental : S\'ancre sur place, devenant imprenable mais inamovible',hasPower:true,powerLabel:'Retour à l\'Etat Fondamental'},
  {id:'meduse',name:'Méduse',emoji:'🪼',class:'Sorcier',value:2,qty:2,pieceType:'p',ability:'Pétrification : Paralyse les pièces ennemies diagonalement adjacentes'},
  {id:'typhon',name:'Typhon',emoji:'🌪️',class:'Sorcier',value:6,qty:2,pieceType:'b',ability:'Orage Sanguinaire : Les pièces ennemies adjacentes sont détruites après son déplacement'},
  {id:'banshee',name:'Banshee',emoji:'👻',class:'Sorcier',value:4,qty:2,pieceType:'b',ability:'Hurlement : Les pions ennemis adjacents reculent d\'une case s\'ils le peuvent après son déplacement'},
  {id:'pretre',name:'Prêtre',emoji:'✝️',class:'Sorcier',value:4,qty:2,pieceType:'r',ability:'Foi Inébranlable : Les ennemis ne peuvent pas capturer les pièces alliées (sauf Monarque) dans les cases diagonalement adjacentes'},
  // QUATRE CRÉATURES DE PLUS. Leur déplacement est écrit dans le moteur
  // (generateMovesRaw, js/rules-engine.js) et nulle part ailleurs : le schéma
  // de la fiche le relit de là. Le Pégase est un cavalier au long bond (3 + 1,
  // dans les huit sens), le Loup Géant un sauteur de deux diagonales tout
  // juste, le Singe fait deux pas de biais en un seul coup et l'Illusion
  // laisse derrière elle un reflet (voir REFLET plus bas).
  {id:'pegase',name:'Pégase',emoji:'🪽',class:'Brute',value:5,qty:2,pieceType:'n',ability:null},
  {id:'loup-geant',name:'Loup Géant',emoji:'🐺',class:'Brute',value:2,qty:2,pieceType:'b',ability:null},
  {id:'singe',name:'Singe',emoji:'🐒',class:'Brute',value:4,qty:2,pieceType:'b',ability:'Double Bond : Fait deux pas d\'une case en diagonale dans le même coup, et mange ce qu\'il trouve à chacun des deux'},
  {id:'infecte',name:'Infecté',emoji:'🧟',class:'Sorcier',value:4,qty:2,pieceType:'n',ability:'Contagion : S\'il mange une pièce adverse, il meurt aussi ; la pièce adverse qui le mange meurt aussi. Le Monarque adverse ne peut pas le manger'},
  // L'OMBRE : une ou deux cases en ligne droite, et invisible pour l'adversaire
  // tant qu'elle ne bouge pas (ombreHiddenFor, js/rules-engine.js). Comme le
  // voile de Nyx, c'est ce que l'adversaire VOIT qui change, pas les règles.
  {id:'ombre',name:'Ombre',emoji:'👤',class:'Sorcier',value:3,qty:2,pieceType:'r',ability:'Invisible : L\'adversaire ne la voit pas. Quand elle se déplace, elle reste visible jusqu\'à ce qu\'il ait joué, puis disparaît de nouveau'},
  {id:'illusion',name:'Illusion',emoji:'🪞',class:'Sorcier',value:5,qty:2,pieceType:'q',ability:'Reflet : Laisse un reflet sur la case qu\'elle quitte. Il bloque les pièces ennemies, qui peuvent le prendre ; un seul reflet par Illusion'},
  // LE BERSERK : une case en ligne droite, et il ne s'arrête pas tant qu'il
  // mange. Chaque prise lui rend un pas, qu'il peut dépenser à manger encore :
  // toute une chaîne de pièces tombe dans le même coup (berserkMoves,
  // js/rules-engine.js). Un chemin de prises qui finit sur le Monarque adverse
  // le met donc en échec — et en mat, si rien ne peut rompre la chaîne.
  //
  // LE BOUCHER : une ou deux cases en ligne droite (sans sauter). Une pièce
  // ennemie COLLÉE à lui en ligne droite, il la mange SANS BOUGER ; à deux
  // cases, il se déplace pour la manger, comme n'importe qui.
  {id:'berserk',name:'Berserk',emoji:'🪓',class:'Brute',value:4,qty:2,pieceType:'r',ability:'Furie : Chaque fois qu\'il mange, il avance encore d\'une case en ligne droite, et peut ainsi enchaîner les prises dans le même coup'},
  {id:'boucher',name:'Boucher',emoji:'🔪',class:'Brute',value:4,qty:2,pieceType:'r',ability:'Couperet : Mange sans bouger une pièce ennemie collée à lui en ligne droite ; à deux cases, il se déplace pour la manger'},
];

// ----------------------------------------------------------------
// LES ARMÉES DE PIONS
// ----------------------------------------------------------------
// Les huit pions du second rang ne sont plus forcément des pions d'échecs :
// l'armée choisit sa TROUPE, et les huit pions en sont. Ce n'est pas une
// créature du catalogue — rien ne s'achète, rien ne se débloque, rien ne
// compte dans les 24 points : c'est un réglage de l'armée (`pawns`, à côté de
// `mon`/`gen`/`extras`), lu par buildGameBoard (js/game-flow.js).
//
// Les quatre troupes croisent les deux façons d'aller (tout droit, en biais)
// avec les deux façons de manger :
//   soldats       avancent tout droit, mangent en biais   (le pion d'échecs)
//   mercenaires   avancent en biais,   mangent tout droit
//   légionnaires  avancent tout droit, mangent tout droit
//   barbares      avancent en biais,   mangent en biais
// Toutes vont vers l'avant, toutes font leur bond de deux cases au premier
// pas (dans leur direction de marche), toutes se promeuvent au bout : ce sont
// des PIONS pour toutes les règles (TRUE_PAWN_IDS plus bas) — la Cuirasse du
// Preux Chevalier, le Hurlement de la Banshee et la Domination du Grand
// Maître les concernent toutes les quatre.
//
// UNE ARMÉE SANS `pawns` — toutes celles d'avant, et celles des vieux clients
// en ligne — aligne des SOLDATS : c'est exactement ce qu'elle alignait.
const PAWN_ARMIES=[
  {id:'soldats',     name:'Soldats',     pawnId:'std-pawn',        desc:'Avancent tout droit, mangent en diagonale.'},
  {id:'mercenaires', name:'Mercenaires', pawnId:'pion-mercenaire', desc:'Avancent en diagonale, mangent tout droit.'},
  {id:'legionnaires',name:'Légionnaires',pawnId:'pion-legionnaire',desc:'Avancent et mangent tout droit.'},
  {id:'barbares',    name:'Barbares',    pawnId:'pion-barbare',    desc:'Avancent et mangent en diagonale.'},
];
function pawnArmyById(id){return PAWN_ARMIES.find(a=>a.id===id)||PAWN_ARMIES[0];}
// Le nom d'un pion posé sur le plateau (fiche, infobulle) : il n'a pas
// d'entrée dans PIECES.
function pawnArmyByPawnId(pawnId){return PAWN_ARMIES.find(a=>a.pawnId===pawnId)||null;}

// ----------------------------------------------------------------
// LE REFLET DE L'ILLUSION
// ----------------------------------------------------------------
// Ce n'est PAS une créature : il n'est pas au catalogue, ne s'achète pas, ne
// se compose pas dans une armée. C'est une case occupée que l'Illusion laisse
// derrière elle, posée sur le plateau comme une pièce de son camp pour que
// tout le moteur la voie sans rien lui apprendre :
//   · pour l'ADVERSAIRE, c'est une pièce ennemie : elle arrête ses lignes
//     (tours, fous, dames, chemins sans saut) et se prend comme une autre ;
//   · pour SON CAMP, elle est transparente : on la traverse et on peut se
//     poser dessus, ce qui la dissipe (voir canLand / barsPath,
//     js/rules-engine.js).
// Elle ne bouge pas, ne donne pas échec, ne compte ni dans les prises ni dans
// l'inventaire. `owner` est l'identifiant de l'Illusion qui l'a laissée : un
// seul reflet par Illusion, et il s'éteint avec elle. Son identifiant de
// pièce est 'reflet' ; ne jamais le donner à une créature.

// ----------------------------------------------------------------
// LES PIÈCES RETIRÉES DU JEU
// ----------------------------------------------------------------
// Le GARDE D'EAU, le GARDE DE FEU et l'EMPEREUR ne sont plus au catalogue.
// Les deux Gardes servaient à enseigner « tout droit » et « en biais » et
// n'avaient aucun pouvoir à montrer ; l'Empereur était un second Monarque, ce
// qui obligeait tout le code d'échec et mat à demander LEQUEL des deux avant
// de savoir quoi protéger.
//
// LEURS IDENTIFIANTS, EUX, N'ONT PAS DISPARU DES COMPTES. Ils dorment dans les
// armées enregistrées, dans les inventaires, dans les historiques de parties et
// dans les enregistrements de replay des joueurs qui ont commencé avant ce
// changement. Un compte qui les contient ne doit ni perdre sa page de
// composition, ni lever d'exception : c'est le rôle de accMigrateRetiredPieces
// (js/accounts.js), qui les efface au chargement du compte et remplace
// l'Empereur par le Roi là où il tenait le rôle de monarque.
//
// NE JAMAIS RÉUTILISER CES TROIS IDENTIFIANTS pour une nouvelle créature : un
// compte non migré les porterait encore, et la nouvelle pièce apparaîtrait dans
// des armées qui ne l'ont jamais choisie.
const RETIRED_PIECE_IDS=new Set(['garde-eau','garde-feu','empereur']);
// Ce qui remplace un MONARQUE retiré dans une armée enregistrée : le Roi, que
// tout compte possède dès sa création. Ce n'est plus le seul monarque (la
// Matriarche et le nouvel Empereur, 'imperator', l'ont rejoint), mais c'est le
// seul qui soit sûr : l'armée garde une valeur de budget en baisse (le Roi
// vaut 3 là où l'ancien Empereur valait 8) et reste jouable.
const RETIRED_MONARCH_REPLACEMENT='roi';
function isRetiredPieceId(id){return RETIRED_PIECE_IDS.has(id);}

// LES VRAIS PIONS du jeu : ceux des quatre troupes (PAWN_ARMIES). La Fourmi,
// la Méduse et le Garde de Pierre portent `pieceType:'p'` pour le moteur, mais
// ce ne sont PAS des pions : ni la Cuirasse du Preux Chevalier, ni le
// Hurlement de la Banshee, ni la Domination du Grand Maître ne les concernent.
const TRUE_PAWN_IDS=new Set(PAWN_ARMIES.map(a=>a.pawnId));
function isTruePawn(cell){return !!cell&&TRUE_PAWN_IDS.has(cell.pieceId);}

// CE QUI SE PROMEUT EN ARRIVANT AU BOUT. Le pion, bien sûr — et la FOURMI,
// dont c'est désormais tout le pouvoir. Elle a longtemps porté l'inverse
// (« Obstination : ne peut pas reculer, même si elle atteint l'autre côté de
// l'échiquier ») : une créature qui traversait tout le plateau pour finir
// clouée dans un coin, ce qui se lisait comme une punition d'avoir avancé.
//
// SE PROMOUVOIR EN FOURMI EST DONC EXCLU (voir showPromoModal,
// js/rules-engine.js) : le lot d'une promotion serait une pièce qui n'attend
// que de se promouvoir à son tour, sur la case même où elle vient d'arriver.
// C'est aussi pourquoi cet ensemble n'est PAS `TRUE_PAWN_IDS` : la Fourmi
// reste tout sauf un pion pour le reste des règles.
const PROMOTING_IDS=new Set([...TRUE_PAWN_IDS,'fourmi']);
function pieceCanPromote(pieceId){return PROMOTING_IDS.has(pieceId);}
const CLASS_ORDER={Monarque:1,Général:2,Primordiale:3,Brute:4,Sorcier:5};
// Couleurs partagées par classe de pièce : utilisées par le menu contextuel factorisé
const CLASS_COLOR_VARS={Monarque:'var(--monarque)',Général:'var(--general)',Primordiale:'var(--primordiale)',Brute:'var(--brute)',Sorcier:'var(--sorcier)'};

// ----------------------------------------------------------------
// LES ARÈNES : où chaque créature commence à sortir des coffres
// ----------------------------------------------------------------
// LES PIÈCES NE SE DÉBLOQUENT PLUS SUR LA DIAGONALE. Un palier d'ELO donnait
// une créature toute faite, avec son pouvoir : le jeu avait deux robinets
// pour la même chose, et le coffre — celui qu'on brise à coups de poing —
// n'était que le second. Désormais une créature ne s'obtient QUE dans un
// coffre, et l'ELO ne décide que d'une chose : À PARTIR DE QUELLE ARÈNE
// (le rang atteint, RANKS plus haut) elle peut en sortir.
//
// L'arène se lit sur le SOMMET atteint (elo_peak), comme tout ce qui se
// débloque : une mauvaise série ne referme pas une arène.
//
// L'ordre reprend celui de l'ancienne Diagonale, arène par arène : ce qui
// tombait à 30 ou 75 ELO sort des coffres dès le Bois, ce qui attendait 1700
// ELO attend l'Argent. Les trois Primordiales, déjà réservées aux coffres,
// sont du Bois.
//
// Une créature absente de cette table (une nouvelle, oubliée) sort dès le
// Bois : mieux vaut une pièce trop tôt qu'une pièce introuvable.
const PIECE_ARENA={
  'roi':'bois','dame':'bois',   // donnés à la création du compte
  'cavalier-primordial':'bois','fou-primordial':'bois','tour-primordiale':'bois',
  'garde-pierre':'bois','fourmi':'bois','preux-chevalier':'bois','dresseur-elephant':'bois','chevaucheur-rhinoceros':'bois',
  'meduse':'pierre','amazone':'pierre','matriarche':'pierre','loup-geant':'pierre','infecte':'pierre',
  'berserk':'bronze','singe':'bronze','ombre':'bronze',
  'pretre':'acier','boucher':'acier','typhon':'acier','imperator':'acier','banshee':'acier',
  'pegase':'obsidienne','nyx':'obsidienne',
  'illusion':'argent','grand-maitre':'argent',
};
function pieceArenaIdx(id){
  const a=PIECE_ARENA[id];
  const i=a?RANKS.findIndex(r=>r.id===a):0;
  return i<0?0:i;
}
function pieceArena(id){return RANKS[pieceArenaIdx(id)];}
// Les créatures qu'une arène ajoute aux coffres (affichées sur la Diagonale,
// à l'entrée de chaque rang, et à la fin d'une partie qui y fait entrer).
function arenaPieceIds(rankId){
  // Le Roi et la Dame sont donnés à la création du compte : ils ne
  // « sortent » d'aucun coffre, l'arène ne les annonce pas.
  return PIECES.filter(p=>PIECE_ARENA[p.id]===rankId&&p.id!=='roi'&&p.id!=='dame').map(p=>p.id);
}

// ----------------------------------------------------------------
// LES POUVOIRS : une créature d'abord, son pouvoir ensuite
// ----------------------------------------------------------------
// OBTENIR UNE CRÉATURE NE DONNE PLUS SON POUVOIR. On la joue tout de suite,
// avec son déplacement complet — mais sans ce que dit sa ligne `ability`. Le
// pouvoir s'éveille avec HUIT DÉBRIS MAGIQUES de cette créature précise
// (POWER_DEBRIS_NEEDED), qui sortent des coffres, eux aussi. Une fois éveillé,
// il est acquis pour toujours (`unlocked_powers`, js/economy.js).
//
// Seules les créatures qui ont une ligne `ability` ONT un pouvoir : le Roi,
// la Dame, l'Amazone, les Primordiales… sont entières dès qu'on les obtient,
// et aucun débris ne tombe pour elles.
//
// CE QUE VEUT DIRE « SANS POUVOIR », créature par créature, est écrit dans le
// moteur (js/rules-engine.js), là où chaque pouvoir s'applique : la pièce
// posée sur le plateau porte `np:true`, et chaque pouvoir le consulte. En
// deux mots — la Méduse ne pétrifie plus, le Typhon n'efface plus, la Fourmi
// ne se promeut plus, le Berserk s'arrête à sa première prise, le Boucher doit
// se déplacer pour manger, le Singe ne mange qu'au bout de ses deux pas,
// l'Infecté ne contamine plus (et le Monarque peut le prendre), l'Ombre et
// Nyx se voient, l'Illusion ne laisse pas de reflet, l'Éléphant ne charge plus
// (sa case du milieu doit être libre), le Preux Chevalier n'a plus de
// Cuirasse, la Matriarche ne relève plus son Général.
const POWER_DEBRIS_NEEDED=8;
function pieceHasPower(id){const p=PIECES.find(x=>x.id===id);return !!(p&&p.ability);}
// Les pouvoirs d'une armée, tels qu'elle les emporte en partie : `powers` est
// la liste des créatures dont le pouvoir est éveillé. UNE ARMÉE SANS CETTE
// CLÉ A TOUS SES POUVOIRS — c'est le cas des parties d'avant ce système
// (relectures, adversaires en ligne restés sur un ancien client) et des
// batailles du tutoriel, qui enseignent justement les pouvoirs.
function armyPowerSet(army){return army&&Array.isArray(army.powers)?new Set(army.powers):null;}
function armyPieceNoPower(army,id){
  const s=armyPowerSet(army);
  return !!s&&pieceHasPower(id)&&!s.has(id);
}
// Même question, posée à une partie en cours : une pièce NÉE en cours de
// partie (promotion, Réanimation) prend le pouvoir de son camp.
function gsPieceNoPower(gs,color,id){
  const s=gs&&gs.powers&&gs.powers[color];
  return !!s&&pieceHasPower(id)&&!s.has(id);
}

// ----------------------------------------------------------------
// LA DIAGONALE DE LA PUISSANCE : des coffres, des perles, des arènes
// ----------------------------------------------------------------
// Un compte neuf ne possède que son Monarque et son Général (`starter`) ; le
// Garde de Pierre arrive dans le premier coffre du tutoriel, la Fourmi et
// l'Éléphant de guerre dans les deux suivants (js/tutorial.js).
//
// LES JALONS DE CRÉATURES SONT DEVENUS DES COFFRES. Là où la Diagonale
// donnait une pièce, elle donne maintenant un coffre (`reward:'chest'`), de la
// rareté de l'arène où il tombe : un Coffre Cavalier au Bois, un Fou à la
// Pierre et au Bronze, une Tour à l'Acier et à l'Obsidienne, une Dame à
// l'Argent, le Roi à l'Or. Monter reste donc ce qui fait tomber les
// créatures — mais par le coffre, et parmi celles que l'arène autorise.
// Les anciens lots d'exemplaires (`copies`) sont devenus des coffres pour la
// même raison : ils versaient des exemplaires d'une pièce que le joueur
// n'avait peut-être plus le droit d'obtenir autrement.
//
// Un coffre de la Diagonale NE S'OUVRE PAS en fin de partie, par-dessus le
// verdict : il attend sur la Diagonale, qui le fait pulser, et s'ouvre quand
// on le touche (vvVoieChestsDue, js/voie.js).
//
// CHAQUE JALON PORTE UN `id` UNIQUE ET STABLE : vvCheckRewardMilestones
// (js/voie.js) s'en sert pour ne verser la récompense qu'une fois, même si
// l'ELO redescend puis remonte. Les anciens identifiants (`rw-100`…) sont
// gardés alors que leur lot a changé : un compte qui a déjà franchi le palier
// ne doit pas le recevoir une seconde fois.
const UNLOCK_TABLE=[
  {pieceId:'roi',eloRequired:0,starter:true},{pieceId:'dame',eloRequired:0,starter:true},
  {pieceId:'garde-pierre',eloRequired:0,coffre:true,voieMilestone:true,starter:true},
  {id:'rw-25',  reward:'pearls',amount:6, eloRequired:25},
  {id:'ch-30',  reward:'chest',chest:'pion',    eloRequired:30},
  {id:'ch-50',  reward:'chest',chest:'cavalier',eloRequired:50},
  {id:'ch-75',  reward:'chest',chest:'pion',    eloRequired:75},
  {id:'rw-100', reward:'chest',chest:'cavalier',eloRequired:100},
  {id:'ch-150', reward:'chest',chest:'cavalier',eloRequired:150},
  {id:'rw-180', reward:'pearls',amount:8, eloRequired:180},
  {id:'ch-210', reward:'chest',chest:'fou',     eloRequired:210},
  {id:'ch-260', reward:'chest',chest:'cavalier',eloRequired:260},
  {id:'ch-290', reward:'chest',chest:'pion',    eloRequired:290},
  {id:'rw-320', reward:'chest',chest:'cavalier',eloRequired:320},
  {id:'ch-360', reward:'chest',chest:'fou',     eloRequired:360},
  {id:'rw-400', reward:'pearls',amount:10,eloRequired:400},
  {id:'ch-450', reward:'chest',chest:'cavalier',eloRequired:450},
  {id:'rw-480', reward:'chest',chest:'fou',     eloRequired:480},
  {id:'ch-520', reward:'chest',chest:'fou',     eloRequired:520},
  {id:'rw-550', reward:'chest',chest:'cavalier',eloRequired:550},
  {id:'ch-620', reward:'chest',chest:'fou',     eloRequired:620},
  {id:'rw-700', reward:'pearls',amount:12,eloRequired:700},
  {id:'ch-740', reward:'chest',chest:'fou',     eloRequired:740},
  {id:'ch-800', reward:'chest',chest:'tour',    eloRequired:800},
  {id:'ch-860', reward:'chest',chest:'fou',     eloRequired:860},
  {id:'rw-900', reward:'chest',chest:'fou',     eloRequired:900},
  {id:'ch-1000',reward:'chest',chest:'dame',    eloRequired:1000,bigReward:true},
  {id:'rw-1080',reward:'pearls',amount:14,eloRequired:1080},
  {id:'ch-1100',reward:'chest',chest:'fou',     eloRequired:1100},
  {id:'ch-1150',reward:'chest',chest:'tour',    eloRequired:1150},
  {id:'ch-1250',reward:'chest',chest:'tour',    eloRequired:1250},
  {id:'rw-1300',reward:'chest',chest:'fou',     eloRequired:1300},
  {id:'ch-1350',reward:'chest',chest:'tour',    eloRequired:1350},
  {id:'rw-1450',reward:'pearls',amount:16,eloRequired:1450},
  {id:'ch-1500',reward:'chest',chest:'dame',    eloRequired:1500},
  {id:'rw-1600',reward:'chest',chest:'tour',    eloRequired:1600},
  {id:'ch-1700',reward:'chest',chest:'dame',    eloRequired:1700},
  {id:'rw-1850',reward:'pearls',amount:18,eloRequired:1850},
  {id:'ch-2000',reward:'chest',chest:'roi',     eloRequired:2000,bigReward:true},
];

// L'ANCIENNE TABLE, gardée pour UNE seule chose : la migration des comptes
// d'avant (ec_eco_init, supabase/schema.sql). Un compte qui avait franchi
// 1000 ELO possédait le Typhon sans l'avoir jamais écrit dans ses
// déblocages — c'était recalculé au chargement à partir du sommet. Au passage
// aux coffres, ces créatures sont écrites une bonne fois, avec leur pouvoir :
// personne ne perd ce qu'il avait gagné.
const LEGACY_ELO_UNLOCKS={
  'fourmi':30,'preux-chevalier':50,'dresseur-elephant':75,'chevaucheur-rhinoceros':150,
  'meduse':210,'amazone':260,'matriarche':290,'loup-geant':360,'infecte':450,'berserk':520,
  'singe':620,'ombre':740,'pretre':800,'boucher':860,'typhon':1000,'imperator':1100,
  'banshee':1150,'pegase':1250,'nyx':1350,'illusion':1500,'grand-maitre':1700,
};

const UNLOCK_MILESTONES=(()=>{
  const seen=new Set();
  return UNLOCK_TABLE.filter(u=>{
    if(u.coffre&&!u.voieMilestone)return false;
    if(u.pieceId&&seen.has(u.pieceId))return false;
    if(u.pieceId)seen.add(u.pieceId);return true;
  }).sort((a,b)=>a.eloRequired-b.eloRequired);
})();
