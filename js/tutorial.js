// ================================================================
// TUTORIAL.JS : l'Alchimiste fait visiter son laboratoire
// ================================================================
// Le jeu expliquait ses règles dans un parchemin de bienvenue : un mur de
// texte, lu une fois, oublié aussitôt, et qui ne montrait rien. Or ce jeu a
// trois systèmes qu'aucun joueur d'échecs ne peut deviner (la composition
// d'armée, la possession des pièces, les coffres), et une navigation par cube
// qu'il faut avoir vu tourner une fois.
//
// Le tutoriel est donc une visite guidée où l'Alchimiste parle et le joueur
// AGIT. Il se déroule en deux temps :
//
//   1. QUATRE BATAILLES SCRIPTÉES, contre quatre instructeurs volontairement
//      faibles (TUTO_INSTRUCTORS dans data-pieces.js). Les deux camps ont
//      exactement la même armée, posée en dur : personne ne perd parce qu'il
//      a mal composé. Chaque victoire ouvre un coffre qui débloque UNE
//      créature (Peureux, puis Fourmi, puis Éléphant de guerre), suivie de
//      son
//      exercice de déplacement (js/tuto-drill.js). Une défaite ne fait pas
//      avancer : l'Alchimiste propose la revanche, autant de fois qu'il faut.
//      C'est ainsi que le joueur se retrouve, à la fin, avec une armée
//      complète (Roi, Dame, Peureux, Fourmi, Éléphant de guerre) qu'il a
//      gagnée.
//   2. LA VISITE DU LABORATOIRE (étapes marquées `click`) : le joueur tourne
//      réellement le cube, compose réellement une armée, ouvre réellement sa
//      Armurerie.
//
// PRINCIPES DE ROBUSTESSE, parce qu'un tutoriel cassé est pire que pas de
// tutoriel :
//   - une étape dont la cible est absente devient une simple étape « Suivant »
//     au lieu de bloquer ;
//   - une étape en attente de clic finit toujours par proposer de passer ;
//   - le projecteur ne capte aucun clic (pointer-events:none), le joueur peut
//     donc toujours cliquer ailleurs ;
//   - la progression est sauvegardée à chaque étape (`tuto_step`) : recharger
//     la page en pleine visite reprend là où on en était, ce qui compte
//     d'autant plus qu'il n'y a plus de bouton « quitter » et que les
//     premières créatures s'obtiennent ici.
//
// Dépendances : main.js (escH), accounts.js (accGet/accSet), piece-art.js
// (pieceIcon), data-pieces.js (TUTO_INSTRUCTORS, tutoInstructorLevel),
// game-flow.js (startGame en mode tutoCfg), economy-ui.js
// (showChestCeremony), tuto-drill.js (drillStart).
// Lancé par : lore-intro.js (fin des quatre pages du Lore, compte neuf),
// accounts.js (reprise à la connexion) et settings-admin.js (bouton
// « Revoir le tutoriel »).
// ================================================================

// ----------------------------------------------------------------
// L'ALCHIMISTE
// ----------------------------------------------------------------
// Dessiné dans le même système que les pièces (js/piece-art.js) : classes
// .b / .l / .k, deux couleurs, donc il suit le thème clair comme sombre.
const ALCHIMISTE_SVG=
  '<svg class="pc-svg pc-n" viewBox="0 0 100 100" aria-hidden="true">'+
    // Cheveux hirsutes, dessinés AVANT le crâne pour dépasser derrière.
    '<path class="b" d="M22 44 12 26l14 6-4-20 14 12 4-16 10 13 8-13 5 17 13-9-5 18 14-4-12 17z"/>'+
    // Crâne et mâchoire
    '<path class="b" d="M50 22c15 0 25 11 25 26 0 16-11 28-25 28S25 64 25 48c0-15 10-26 25-26z"/>'+
    // Lunettes de protection relevées sur le front
    '<path class="l" d="M28 42h44"/>'+
    '<circle class="b" cx="39" cy="45" r="10"/><circle class="b" cx="61" cy="45" r="10"/>'+
    '<path class="l" d="M49 45h3"/>'+
    '<circle class="k" cx="39" cy="45" r="3.4"/><circle class="k" cx="61" cy="45" r="3.4"/>'+
    // Sourire de quelqu'un qui vient de réussir un mélange qu'il ne maîtrise pas
    '<path class="l" d="M38 62c6 7 18 7 24 0"/>'+
    // Col de blouse
    '<path class="b" d="M28 84c4-8 10-12 22-12s18 4 22 12l3 12H25z"/>'+
  '</svg>';

// ----------------------------------------------------------------
// LES QUATRE BATAILLES DU TUTORIEL
// ----------------------------------------------------------------
// Les deux camps reçoivent la MÊME armée, aux MÊMES colonnes : le joueur ne
// peut pas perdre pour une raison qu'il ne comprend pas encore. Elle grossit
// d'une créature par bataille, dans l'ordre où le joueur les débloque, et
// chaque créature se place vers l'extérieur en partant du Monarque.
//
//   colonnes :  0            1        2       3      4     5       6        7
//               éléphant     fourmi   peureux dame   roi   peureux fourmi   éléphant
//
// L'adversaire monte en force à chaque fois (index dans AI_INSTRUCTORS via
// tutoInstructorLevel) et la couleur du joueur alterne pour qu'il joue une
// fois en second et une fois en premier.
//
// AUCUNE des quatre batailles n'a de pendule (clockMin:0). La dernière en
// avait une : on apprenait à jouer avec un chronomètre au-dessus de l'épaule,
// et une première partie perdue au temps ne se comprend pas. La pendule
// arrive avec les vraies parties, où elle a un sens.
const TUTO_EXTRA_COLS={'peureux':[2,5],'fourmi':[1,6],'dresseur-elephant':[0,7]};
const TUTO_BATTLES=[
  {playerColor:'b',extras:[],                              clockMin:0},
  {playerColor:'w',extras:['peureux'],                          clockMin:0},
  {playerColor:'b',extras:['peureux','fourmi'],                 clockMin:0},
  {playerColor:'w',extras:['peureux','fourmi','dresseur-elephant'],clockMin:0},
];

let _tutoUid=0;
function tutoMakePiece(pieceId,color,type,isKing){
  const def=PIECES.find(p=>p.id===pieceId);
  // Les pions standard ne sont pas au catalogue (ils ne se possèdent pas,
  // voir FREE_PIECE_IDS dans economy.js) : leur emoji est écrit ici.
  const emoji=def?def.emoji:(pieceId==='std-pawn'?(color==='w'?'♙':'♟'):'');
  return{type:type||def?.pieceType||'p',color,pieceId,emoji,
    hasMoved:false,isKing:!!isKing,id:'t'+(_tutoUid++)};
}

// Plateau symétrique : ce que reçoit un camp, l'autre le reçoit à
// l'identique. Aucune pièce standard de remplissage en dehors des huit pions
// (« il n'y a pas d'autres pièces »).
function tutoBuildBoard(battleIdx){
  const cfg=TUTO_BATTLES[battleIdx]||TUTO_BATTLES[0];
  const b=Array.from({length:8},()=>Array(8).fill(null));
  [['w',7,6],['b',0,1]].forEach(([color,back,pawnRow])=>{
    b[back][4]=tutoMakePiece('roi',color,'k',true);
    b[back][3]=tutoMakePiece('dame',color,'q',false);
    cfg.extras.forEach(id=>{
      (TUTO_EXTRA_COLS[id]||[]).forEach(col=>{
        if(!b[back][col])b[back][col]=tutoMakePiece(id,color);
      });
    });
    for(let c=0;c<8;c++)b[pawnRow][c]=tutoMakePiece('std-pawn',color,'p');
  });
  return b;
}

// Armée « pour l'affichage » : elle alimente les bandeaux joueurs et les
// choix de promotion. Elle n'est jamais prélevée sur l'Armurerie.
function tutoBattleArmy(battleIdx){
  const cfg=TUTO_BATTLES[battleIdx]||TUTO_BATTLES[0];
  return{mon:{id:'roi'},gen:{id:'dame'},extras:[...cfg.extras],placements:{},totalValue:0,_tuto:true};
}

// Lance (ou relance) la bataille n. La bulle de l'Alchimiste s'efface le temps du
// combat : elle occupe le bas de l'écran, exactement là où se trouve le
// plateau.
function tutoStartBattle(battleIdx){
  const cfg=TUTO_BATTLES[battleIdx];
  if(!cfg||typeof startGame!=='function')return;
  _tutoBattle=battleIdx;
  _tutoAwaitCombat=null;
  tutoClearStep();
  tutoHideBox(true);
  if(typeof selectedAILevel!=='undefined')selectedAILevel=tutoInstructorLevel(battleIdx);
  const inst=TUTO_INSTRUCTORS[Math.min(battleIdx,TUTO_INSTRUCTORS.length-1)];
  startGame(true,false,{
    battle:battleIdx,
    name:inst.name,
    playerColor:cfg.playerColor,
    clockMin:cfg.clockMin,
    army:tutoBattleArmy(battleIdx),
    board:()=>tutoBuildBoard(battleIdx),
  });
}

// Fin d'une bataille du tutoriel : appelée par triggerEndOfGame()
// (js/game-flow.js), qui n'a rien réglé du tout — ni ELO, ni coffre de série,
// ni Armurerie. Tout se décide ici.
function tutoOnBattleEnd(result){
  const battleIdx=_tutoBattle;
  _tutoBattle=null;
  // Rendre la main à l'adversaire CHOISI par le joueur, et non à l'index 0
  // qui désigne maintenant Cendre, la plus faible des douze.
  if(typeof aiSetOpponent==='function')aiSetOpponent(chosenOpponentId);
  else if(typeof selectedAILevel!=='undefined')selectedAILevel=DEFAULT_AI_LEVEL;
  const back=()=>{
    if(typeof goToMainMenu==='function')goToMainMenu();
    if(typeof updAll==='function')updAll();
  };
  if(result!=='win'){
    // Ni défaite ni nulle ne font avancer le tutoriel : on rejoue la même
    // bataille, contre le même instructeur, autant de fois qu'il le faudra.
    setTimeout(()=>{
      back();
      tutoShowMessage(
        'Tu t\'es courageusement battu, mais la bataille a été perdue. '+
        '<strong>Lance un nouvel assaut&nbsp;!</strong>',
        'Revanche',()=>tutoStartBattle(battleIdx));
    },900);
    return;
  }
  setTimeout(()=>{back();tutoNext();},900);
}

// ----------------------------------------------------------------
// ÉTAPES
// ----------------------------------------------------------------
// Chaque étape :
//   text     réplique de l'Alchimiste (HTML autorisé, écrit ici, jamais saisi)
//   at       sélecteur de l'élément à mettre en lumière (facultatif)
//   click    sélecteur à cliquer pour avancer ; sinon bouton « Suivant »
//   btn      libellé du bouton quand l'étape n'attend pas de clic
//   wait     ms d'attente après le clic, le temps qu'une animation finisse
//   before   fonction exécutée à l'entrée dans l'étape
//   skipIf   fonction : si elle renvoie vrai, l'étape est sautée
//   battle   n° de bataille lancée par le bouton de l'étape
//   combat   n° de bataille lancée par le bouton COMBAT du menu (le clic est
//            intercepté par tutoInterceptCombat, appelé depuis cube-nav.js)
//   combatStep  le bouton COMBAT fait simplement avancer d'une étape (la
//            flèche désigne COMBAT, mais l'Alchimiste a encore quelque chose à
//            dire avant que le combat ne commence)
//   reward   {chest,piece,qty} : cérémonie de coffre qui débloque une créature
//   drill    id de pièce : exercice de déplacement (js/tuto-drill.js)
// Les étapes `reward` et `drill` n'ont pas de bulle : elles s'exécutent et
// enchaînent d'elles-mêmes.
const TUTO_STEPS=[
  {
    text:'Bien le bonjour, jeune apprenti. Je suis un <strong>Alchimiste</strong>, l\'un '+
         'des derniers à tenir encore un laboratoire debout. Je vais t\'apprendre la '+
         'subtile science et l\'art exact de l\'alchimie. Je ne m\'attends pas à ce que tu '+
         'comprennes vraiment la beauté des vapeurs discrètes s\'échappant du chaudron, '+
         'ni l\'explosion accompagnant la fusion.',
  },
  {
    text:'Les plus persévérants pourront même admirer la vie être insufflée dans de '+
         'simples objets. C\'est ainsi que tout a commencé, et c\'est ainsi que tout a '+
         'fini par brûler. Ne sous-estime pas l\'immense pouvoir de ces fragments de bois '+
         'rudement sculptés.',
  },
  // La flèche désigne COMBAT pendant cette réplique : le joueur enchaîne du
  // discours à l'action sans étape intermédiaire.
  {
    text:'Pour un grand stratège, comprendre ses soldats est primordial, mais savoir les '+
         'manœuvrer est tout aussi important.',
    at:'#cube-jouer-btn',combatStep:true,
  },
  {
    text:'Ta première bataille est sur le point de commencer. Croise le fer avec ton '+
         'adversaire et lance la charge vaillamment.',
    battle:0,btn:'Au combat !',
  },
  {reward:{chest:'pion',piece:'peureux'}},
  {drill:'peureux'},
  {
    text:'Merveilleux&nbsp;! Tu es visiblement un élève prometteur. Défie un nouvel '+
         'adversaire, et utilise ton <strong>Peureux</strong> fraîchement débloqué.',
    at:'#cube-jouer-btn',combat:1,
  },
  {reward:{chest:'cavalier',piece:'fourmi'}},
  {drill:'fourmi'},
  {
    text:'Bravo&nbsp;! Avec la <strong>Fourmi</strong> en soutien, ton armée sera bien '+
         'plus puissante. Attaque encore, et prends par surprise ton adversaire.',
    at:'#cube-jouer-btn',combat:2,
  },
  {reward:{chest:'fou',piece:'dresseur-elephant'}},
  {drill:'dresseur-elephant'},
  {
    text:'Ton armée est maintenant complète&nbsp;! Lance un dernier combat contre un '+
         'instructeur, tu affronteras ensuite des joueurs du monde entier. Montre-moi '+
         'ce que ton armée a dans le ventre&nbsp;: <strong>tout ton arsenal en une '+
         'seule bataille</strong>.',
    at:'#cube-jouer-btn',combat:3,
  },
  {
    text:'Tu es venu. Tu as vu. <strong>Tu as vaincu&nbsp;!</strong>',
  },
  // ---- La visite du laboratoire, inchangée ----------------------
  {
    text:'La règle qui change tout&nbsp;: personne ne reçoit la même armée. '+
         'Vous allez composer la vôtre, pièce par pièce. Suivez-moi.',
  },
  {
    text:'Ce laboratoire est un cube. Chaque face est une salle.<br>'+
         '<strong>Cliquez la flèche de droite</strong> pour aller à vos armées.',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'Voici votre armée. Vous n\'en avez aucune, forcément, vous venez d\'arriver&nbsp;: '+
         'composez-la ici même. Cinq pièces, pas une de plus&nbsp;: un '+
         '<strong>Monarque</strong> (perdez-le, vous perdez la partie), un '+
         '<strong>Général</strong>, et trois créatures.<br>'+
         'Le tout dans <strong>24 points</strong>. Une créature puissante vous en laisse '+
         'peu pour les autres&nbsp;: c\'est là qu\'est le vrai jeu.',
    at:'.army-box',
  },
  {
    text:'Chaque créature a son déplacement ET son pouvoir. La carte ne montre que '+
         'l\'essentiel&nbsp;: son logo, son nom, sa valeur et votre stock.<br>'+
         '<strong>Appuyez sur une carte</strong>&nbsp;: deux boutons apparaissent. '+
         '« Utiliser » la pose dans son emplacement en haut, <strong>« Infos »</strong> '+
         'ouvre sa fiche — l\'échiquier de son déplacement et son pouvoir en détail. '+
         'Pour la retirer, appuyez sur la pièce posée&nbsp: elle rejoint le catalogue.',
    at:'#ar-cards-container .cards-grid',
  },
  {
    text:'Ce petit nombre en bas de chaque carte, c\'est le plus important de tout&nbsp;: '+
         'le nombre d\'<strong>exemplaires que vous possédez</strong>. On ne joue que ce '+
         'qu\'on possède. J\'y reviens, c\'est mon invention préférée.',
    at:'.pcard .pcard-stock',
  },
  {
    text:'Je suis pressé et vous aussi. Voici une <strong>armée tirée au hasard</strong>&nbsp;: '+
         'elle s\'enregistre toute seule, vous l\'affinerez plus tard.',
    at:'.army-box',before:()=>{if(typeof pRandomize==='function')pRandomize();},
  },
  {
    text:'Elle est à vous. Maintenant, la partie que les gens comprennent toujours '+
         'trop tard. <strong>Tournez encore à droite.</strong>',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'L\'Armurerie. Tout ce que vous possédez, vous le possédez en '+
         '<strong>exemplaires comptés</strong> — le petit nombre en haut de chaque '+
         'carte, dans la composition d\'armée.<br>'+
         'Engager une créature dans une partie, c\'est la <strong>risquer</strong>. '+
         'Vous perdez&nbsp;? Toute l\'armée engagée y reste. Vous gagnez&nbsp;? '+
         'Vous ne perdez que ce qui a été mangé.',
  },
  {
    text:'Et voici la récompense. Une victoire&nbsp;: un Coffre Pion. Deux d\'affilée&nbsp;: '+
         'un Coffre Cavalier. Puis Fou, Tour, Dame, et <strong>Roi</strong> à partir de six.<br>'+
         'Il s\'ouvre <strong>tout de suite</strong>, sitôt la partie finie. Une seule '+
         'défaite et la série repart de zéro. C\'est cruel, je sais. C\'est le but.',
  },
  {
    text:'Les <strong>perles</strong> tombent de tous les coffres, et rachètent le coffre '+
         'de votre choix. Une mauvaise ouverture vous rapproche quand même du Coffre Roi.',
    at:'#rs-pearls',
  },
  {
    text:'Les plateaux aussi se méritent&nbsp;: bois, puis pierre, acier, argent, et or '+
         'tout en haut. Ils s\'ouvrent en montant dans les rangs, tout seuls.',
  },
  {
    text:'Il reste une salle. <strong>Encore une face à droite.</strong>',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'Celle-ci est vide. J\'y prépare quelque chose, et je ne vous dirai pas quoi.',
  },
  {
    text:'Dernier tour, et nous serons revenus au point de départ.',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'<strong>COMBAT</strong> vous envoie contre un autre joueur, quelque part dans le '+
         'monde. C\'est pour ça que le jeu existe.<br>'+
         'Si vous préférez vous échauffer, les <strong>Adversaires</strong> du laboratoire '+
         'sont en dessous&nbsp;: douze, de la balayeuse au four qui n\'oublie rien.',
    at:'.jouer-actions',
  },
  {
    text:'Votre nom, votre rang et votre classement sont là-haut. La pastille de rang '+
         'ouvre la <strong>Diagonale de la Puissance</strong>&nbsp;: chaque partie classée '+
         'fait bouger ce chiffre, et chaque palier franchi <strong>libère une nouvelle '+
         'créature</strong> de mes bocaux.',
    at:'.jouer-player',
  },
  {
    text:'<strong>Série du jour</strong> ouvre mes six coffres, du Pion au Roi. Chaque '+
         'victoire d\'affilée en décroche un de plus, et le suivant est toujours plus '+
         'rare que le précédent&nbsp;— mais <strong>une seule défaite ferme la série '+
         'jusqu\'au lendemain</strong>. Réfléchissez avant de relancer.<br>'+
         'Les six pris, <strong>la série est finie pour la journée</strong>. Et si vous '+
         'êtes pressé, <strong>n\'importe lequel s\'achète en perles</strong> '+
         'au <strong>Magasin</strong>, la face du cube à votre gauche.',
    at:'#jouer-streak',
  },
  {
    // Les deux voies qui ne se referment jamais (js/rewards.js). Elles
    // arrivent JUSTE APRÈS la série du jour, parce que c'est la question que
    // la série pose : « et quand j'ai pris les six ? »
    text:'Et quand les six sont tombés&nbsp;? <strong>Récompenses</strong>. Deux voies '+
         'y courent&nbsp;: la <strong>colonne des victoires</strong>, trente paliers dont '+
         'vous descendez un cran à chaque victoire, coffres et <strong>jokers</strong> '+
         '(un joker devient la créature que vous désignez)&nbsp;; et la '+
         '<strong>rangée de la richesse</strong>, des perles qui s\'achètent avec les '+
         '<strong>tickets</strong> de mes quêtes du jour. Rien de tout ça ne se perd&nbsp;: '+
         'ni défaite, ni lendemain n\'y touchent.',
    at:'#jouer-rewards',
  },
  {
    // Le coffre de réapprovisionnement n'a plus de carte à montrer du doigt :
    // il s'ouvre TOUT SEUL quand son délai est écoulé (voir
    // dailyChestMaybeOpen, js/economy-ui.js). L'étape reste — c'est une règle
    // du jeu qu'il faut connaître — mais sans cible à surligner.
    // LE NOMBRE EST LU SUR LA CONSTANTE, il n'est pas écrit dans la phrase :
    // il a valu 4, il vaut 2 (DAILY_CHEST.perPiece, js/data-pieces.js, où le
    // rééquilibrage est expliqué), et l'Alchimiste a continué d'en promettre 4
    // pendant tout ce temps. data-pieces.js est chargé bien avant ce fichier,
    // la constante est donc là quand ce tableau est construit.
    text:'Rassurez-vous, je ne suis pas un monstre. Chaque jour, un coffre vous rend '+
         '<strong>'+DAILY_CHEST.perPiece+' exemplaire'+(DAILY_CHEST.perPiece>1?'s':'')+
         ' de chacune</strong> de vos pièces. Vous n\'avez rien à '+
         'faire&nbsp;: il <strong>s\'ouvre tout seul</strong> dès qu\'il est prêt, à votre '+
         'arrivée ou en sortant d\'une partie. Vous ne pourrez jamais vous retrouver '+
         'bloqué sans armée.',
  },
  {
    text:'Une dernière chose, et je vous laisse&nbsp;: en pleine partie, <strong>clic droit '+
         'sur une pièce</strong> (ou un <strong>appui long</strong> au doigt) vous rappelle '+
         'son pouvoir. Personne ne les retient tous. Moi non plus.<br>'+
         'Allez. Cassez quelque chose.',
  },
];

// ----------------------------------------------------------------
// MOTEUR
// ----------------------------------------------------------------
let _tutoIdx=-1;
let _tutoCleanup=null;      // retire le guetteur de clic de l'étape en cours
let _tutoTypeTimer=null;
let _tutoReposition=null;
let _tutoEscapeTimer=null;
let _tutoBattle=null;       // n° de la bataille en cours, null hors combat
let _tutoAwaitCombat=null;  // n° de bataille que le bouton COMBAT doit lancer
let _tutoMsgAction=null;    // action du bouton d'un message hors script

function tutoDone(){return !!accGet('tuto_done',false);}
function tutoMarkDone(){accSet('tuto_done',true);accSet('tuto_step',null);}
// Progression sauvegardée à chaque étape : le tutoriel n'a pas de bouton
// « quitter » et c'est lui qui donne les premières créatures, il doit donc
// survivre à un rechargement de page.
function tutoSaveStep(){accSet('tuto_step',_tutoIdx);}
function tutoLoadStep(){const v=accGet('tuto_step',null);return (typeof v==='number'&&v>=0)?v:0;}

// Le tutoriel est en cours (utilisé par cube-nav.js pour savoir s'il doit lui
// laisser la main sur le bouton COMBAT).
function tutoActive(){return document.body.classList.contains('tuto-on');}

function tutoEls(){
  return{
    root:document.getElementById('tuto-root'),
    spot:document.getElementById('tuto-spot'),
    box:document.getElementById('tuto-box'),
    text:document.getElementById('tuto-text'),
    next:document.getElementById('tuto-next'),
    hint:document.getElementById('tuto-hint'),
  };
}

// startAt : index de départ (reprise). tutoStart() sans argument recommence
// depuis le début, c'est ce que fait « Revoir le tutoriel » dans les réglages.
function tutoStart(startAt){
  const{root}=tutoEls();
  if(!root)return;
  root.classList.add('show');
  tutoHideBox(false);
  document.body.classList.add('tuto-on');
  _tutoIdx=(typeof startAt==='number'?startAt:0)-1;
  tutoNext();
}

// Fin du tutoriel : il n'y a plus de bouton « quitter », on n'arrive donc ici
// qu'après la dernière étape.
function tutoFinish(){
  tutoClearStep();
  const{root,spot}=tutoEls();
  if(root)root.classList.remove('show');
  if(spot)spot.classList.remove('on');
  document.body.classList.remove('tuto-on');
  tutoMarkDone();
  _tutoIdx=-1;
  _tutoBattle=null;_tutoAwaitCombat=null;
}

// La bulle disparaît pendant un combat ou un exercice (elle occupe le bas de
// l'écran, là où se trouve le plateau) ; le voile et le projecteur avec elle.
function tutoHideBox(hidden){
  const{box,spot}=tutoEls();
  if(box)box.style.display=hidden?'none':'';
  if(hidden&&spot)spot.classList.remove('on');
}

// Message hors script (fin de bataille perdue) : même bulle, un seul bouton
// dont l'action est fournie par l'appelant.
function tutoShowMessage(html,btnLabel,action){
  const{root,box,text,next,hint}=tutoEls();
  if(!root||!box)return;
  root.classList.add('show');
  document.body.classList.add('tuto-on');
  tutoClearStep();
  tutoHideBox(false);
  tutoSpotlight(null);
  tutoPlaceBox(null);
  tutoType(text,html);
  hint.style.display='none';
  next.style.display='';
  next.textContent=btnLabel||'Suivant';
  // Un message hors script (revanche après une bataille perdue) ne fait pas
  // avancer le tutoriel : le compteur n'a rien à afficher.
  const prog=document.getElementById('tuto-progress');
  if(prog)prog.textContent='';
  _tutoMsgAction=action||null;
}

function tutoClearStep(){
  if(_tutoCleanup){_tutoCleanup();_tutoCleanup=null;}
  if(_tutoTypeTimer){clearInterval(_tutoTypeTimer);_tutoTypeTimer=null;}
  if(_tutoEscapeTimer){clearTimeout(_tutoEscapeTimer);_tutoEscapeTimer=null;}
  if(_tutoReposition){
    window.removeEventListener('resize',_tutoReposition);
    window.removeEventListener('scroll',_tutoReposition,true);
    _tutoReposition=null;
  }
}

function tutoNext(){
  tutoClearStep();
  _tutoMsgAction=null;
  _tutoAwaitCombat=null;
  _tutoIdx++;
  // Étapes sautées : leur condition n'est plus remplie (par exemple la
  // créature offerte par un coffre est déjà débloquée, cas d'un tutoriel
  // revu depuis les réglages).
  while(TUTO_STEPS[_tutoIdx]&&tutoStepSkipped(TUTO_STEPS[_tutoIdx]))_tutoIdx++;
  const step=TUTO_STEPS[_tutoIdx];
  if(!step){tutoFinish();return;}
  tutoSaveStep();
  if(step.before)try{step.before();}catch(e){}
  // Étapes sans bulle : elles s'exécutent et enchaînent d'elles-mêmes.
  if(step.reward){tutoRunReward(step.reward);return;}
  if(step.drill){tutoRunDrill(step.drill);return;}
  // Le DOM de l'étape précédente peut encore être en train de se mettre en
  // place (rotation du cube, rendu d'une page) : on laisse passer une frame.
  tutoHideBox(false);
  requestAnimationFrame(()=>tutoRender(step));
}

function tutoStepSkipped(step){
  if(step.skipIf&&step.skipIf())return true;
  // Un coffre du tutoriel ne redonne pas une créature déjà débloquée.
  if(step.reward&&typeof VV_UNLOCKED!=='undefined'&&VV_UNLOCKED.has(step.reward.piece))return true;
  return false;
}

// ----------------------------------------------------------------
// ÉTAPES SANS BULLE : coffre scripté, puis exercice de déplacement
// ----------------------------------------------------------------
// Le coffre du tutoriel n'est PAS tiré au sort : l'Alchimiste sait ce qu'il y a
// dedans. Il passe malgré tout par la cérémonie habituelle (economy-ui.js) et
// par chestApply(), donc la créature est réellement débloquée et les
// exemplaires réellement crédités.
function tutoRunReward(reward){
  tutoHideBox(true);
  const chest=(typeof chestById==='function')?chestById(reward.chest):null;
  const lots=[{pieceId:reward.piece,qty:reward.qty||10,isNew:true}];
  const after=()=>{
    if(typeof updAll==='function')updAll();
    if(typeof renderReservePage==='function'&&CUR_ACC)renderReservePage();
    tutoNext();
  };
  if(chest&&typeof showChestCeremony==='function')showChestCeremony(chest,lots,true,after);
  else{if(typeof chestApply==='function')chestApply(lots);after();}
}

function tutoRunDrill(pieceId){
  tutoHideBox(true);
  const after=()=>{
    if(typeof goToMainMenu==='function')goToMainMenu();
    tutoNext();
  };
  if(typeof drillStart==='function')drillStart(pieceId,after);
  else after();
}

// ----------------------------------------------------------------
// PASSER LE TUTORIEL
// ----------------------------------------------------------------
// Le tutoriel n'avait aucune sortie : il fallait gagner quatre batailles et
// faire trois exercices avant de pouvoir jouer, y compris pour quelqu'un qui
// connaît déjà le jeu (un ami à qui on le montre, un compte recréé).
//
// Le bouton donne EXACTEMENT ce que le tutoriel aurait donné, ni plus ni
// moins : les trois créatures (Peureux, Fourmi, Éléphant de guerre) avec leurs
// exemplaires, plus une première armée composée au hasard — sans quoi on
// sortirait du tutoriel dans une armurerie vide, incapable de lancer un
// combat, c'est-à-dire exactement là où le tutoriel sert à ne pas être.
const TUTO_SKIP_PIECES=['peureux','fourmi','dresseur-elephant'];
const TUTO_SKIP_QTY=10;

// Armée aléatoire légale : mêmes règles que le builder (1 Monarque, 1
// Général, 3 créatures, 24 points, 1 Primordiale au plus), mais restreinte
// aux pièces que le joueur POSSÈDE RÉELLEMENT en assez d'exemplaires.
//
// On n'utilise surtout pas generateAIArmy() : l'IA n'est pas soumise à
// l'économie et pioche dans tout le catalogue. L'armée offerte serait alors
// composée de créatures que le joueur ne possède pas, donc injouable — et il
// sortirait du tutoriel sur un refus de l'Armurerie.
function tutoBuildRandomArmy(){
  const has=p=>(typeof VV_UNLOCKED==='undefined'||VV_UNLOCKED.has(p.id))&&
    (typeof invCount!=='function'||invCount(p.id)>=pieceDeployCount(p.id));
  const mons=PIECES.filter(p=>p.class==='Monarque'&&has(p));
  const gens=PIECES.filter(p=>p.class==='Général'&&has(p));
  const others=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&has(p));
  if(!mons.length||!gens.length||others.length<3)return null;
  const rnd=a=>a[Math.floor(Math.random()*a.length)];
  for(let tries=0;tries<600;tries++){
    const mon=rnd(mons),gen=rnd(gens);
    if(mon.value+gen.value>22)continue;
    const budget=24-mon.value-gen.value;
    const pool=[...others].sort(()=>Math.random()-0.5);
    const chosen=[];let val=0,prim=0;
    for(const p of pool){
      if(chosen.length>=3)break;
      if(chosen.some(x=>x.id===p.id))continue;
      if(p.class==='Primordiale'&&prim>=1)continue;
      if(val+p.value>budget)continue;
      chosen.push(p);val+=p.value;if(p.class==='Primordiale')prim++;
    }
    if(chosen.length!==3)continue;
    // derivePlacements (js/builder.js) : l'ordre des trois pièces définit
    // leur disposition sur la rangée, exactement comme une armée composée
    // à la main.
    const placements=(typeof derivePlacements==='function')
      ?derivePlacements(chosen)
      :chosen.reduce((o,p,i)=>{o[p.id]=[2,1,0][i];return o;},{});
    return{
      id:Date.now().toString(),
      createdAt:Date.now(),updatedAt:Date.now(),
      name:'Première armée',
      mon:{id:mon.id},gen:{id:gen.id},
      extras:chosen.map(p=>p.id),placements,
      totalValue:mon.value+gen.value+val,
    };
  }
  return null;
}

function tutoSkip(){
  // Les créatures passent par chestApply : c'est le même chemin que les
  // coffres du tutoriel, donc le déblocage et les exemplaires sont crédités
  // exactement pareil. Une créature déjà débloquée n'est pas re-marquée.
  const lots=TUTO_SKIP_PIECES
    .filter(id=>typeof VV_UNLOCKED==='undefined'||!VV_UNLOCKED.has(id))
    .map(id=>({pieceId:id,qty:TUTO_SKIP_QTY,isNew:true}));
  if(lots.length&&typeof chestApply==='function')chestApply(lots);

  // Une seule armée suffit : si le joueur en a déjà une (tutoriel repris
  // après coup), on ne lui en ajoute pas une seconde dont il n'a rien à faire.
  if(typeof savedArmies!=='undefined'&&!savedArmies.length){
    const ad=tutoBuildRandomArmy();
    if(ad){savedArmies.push(ad);if(typeof saveArmies==='function')saveArmies();}
  }

  tutoFinish();
  if(typeof goToMainMenu==='function')goToMainMenu();
  if(typeof updAll==='function')updAll();
  if(typeof renderArmiesPage==='function')renderArmiesPage();
  if(typeof renderReservePage==='function'&&CUR_ACC)renderReservePage();
  if(typeof renderMenuChests==='function')renderMenuChests();
}

// ----------------------------------------------------------------
// BOUTON COMBAT PENDANT LE TUTORIEL
// ----------------------------------------------------------------
// Appelé par cube-nav.js AVANT son propre traitement : pendant le tutoriel, le
// bouton COMBAT ne mène pas à la sélection d'armée (le joueur n'en a pas
// encore), il lance la bataille scriptée de l'étape en cours. Rend true quand
// il a pris la main.
function tutoInterceptCombat(){
  if(!tutoActive())return false;
  const step=TUTO_STEPS[_tutoIdx];
  if(step&&step.combatStep){tutoNext();return true;}
  if(_tutoAwaitCombat===null)return false;
  tutoStartBattle(_tutoAwaitCombat);
  return true;
}

// ----------------------------------------------------------------
// COMPTEUR D'ÉTAPES
// ----------------------------------------------------------------
// On ne comptait rien : l'Alchimiste enchaînait une vingtaine de répliques, des
// batailles et des exercices, sans jamais dire où l'on en était. C'est la
// première raison de vouloir passer un tutoriel — l'impression qu'il ne
// finira pas. Seules les étapes PARLÉES sont numérotées : les coffres et les
// exercices n'ont pas de bulle, les compter afficherait un compteur qui saute.
const TUTO_SPOKEN_IDX=TUTO_STEPS.map((s,i)=>s.text?i:-1).filter(i=>i>=0);
function tutoRenderProgress(){
  const el=document.getElementById('tuto-progress');
  if(!el)return;
  const pos=TUTO_SPOKEN_IDX.indexOf(_tutoIdx);
  el.textContent=pos>=0?(pos+1)+' / '+TUTO_SPOKEN_IDX.length:'';
}

function tutoRender(step){
  const{box,text,next,hint}=tutoEls();
  if(!box)return;
  tutoRenderProgress();

  const target=step.at?document.querySelector(step.at):null;
  tutoSpotlight(target);
  tutoPlaceBox(target);

  // Une étape qui attend un clic sur une cible absente deviendrait un
  // cul-de-sac : elle retombe sur un simple « Suivant ».
  const clickTarget=step.click?document.querySelector(step.click):null;
  // Étape `combat` : c'est le bouton COMBAT du menu qui fait avancer, mais le
  // clic n'est pas guetté ici — il passe par tutoInterceptCombat(), appelé
  // depuis cube-nav.js, sinon la navigation normale partirait en parallèle.
  const waitsCombat=(typeof step.combat==='number')||!!step.combatStep;
  const waitsClick=!!clickTarget||waitsCombat;
  if(typeof step.combat==='number')_tutoAwaitCombat=step.combat;

  tutoType(text,step.text);

  next.style.display=waitsClick?'none':'';
  hint.textContent=waitsClick
    ?(waitsCombat?'À vous de jouer : lancez le COMBAT.':'À vous de jouer : cliquez l\'élément mis en lumière.')
    :'';
  hint.style.display=waitsClick?'':'none';

  if(clickTarget){
    const onClick=()=>{
      clickTarget.removeEventListener('click',onClick,true);
      setTimeout(tutoNext,step.wait||300);
    };
    clickTarget.addEventListener('click',onClick,true);
    _tutoCleanup=()=>clickTarget.removeEventListener('click',onClick,true);
  }
  if(waitsClick){
    // Filet : après 12 s sans clic, on propose explicitement de continuer,
    // pour ne jamais enfermer quelqu'un qui n'a pas compris quoi cliquer. Une
    // étape `combat` fait exception : « continuer » sauterait la bataille, et
    // avec elle la créature qu'elle rapporte.
    if(!waitsCombat)_tutoEscapeTimer=setTimeout(()=>{
      next.textContent='Continuer sans cliquer';
      next.style.display='';
    },12000);
  }else if(typeof step.battle==='number'){
    // Le bouton de la bulle lance lui-même la bataille.
    next.textContent=step.btn||'Au combat !';
    next.style.display='';
  }else{
    next.textContent=step.btn||'Suivant';
  }
}

// L'Alchimiste affiche sa réplique directement, plutôt que de la taper lettre
// par lettre : sur une vingtaine d'étapes, l'animation ralentissait la
// lecture plus qu'elle ne la rythmait. `dataset.typing`/`_tutoFinish`
// restent posés (à leur état « terminé ») pour les quelques endroits qui les
// lisent encore (voir tutoClearStep, et le clic sur la bulle plus bas).
function tutoType(el,html){
  if(!el)return;
  el.innerHTML=html;
  el.dataset.typing='0';
  el._tutoFinish=null;
}

// ----------------------------------------------------------------
// PROJECTEUR
// ----------------------------------------------------------------
// Un trou dans un voile sombre, obtenu par une ombre portée démesurée. Le
// bloc ne capte aucun clic : la cible réelle reste cliquable, et le joueur
// peut toujours cliquer ailleurs.
function tutoSpotlight(target){
  const{spot}=tutoEls();
  if(!spot)return;
  if(!target){spot.classList.remove('on');return;}
  const place=()=>{
    const r=target.getBoundingClientRect();
    if(!r.width&&!r.height){spot.classList.remove('on');return;}
    const pad=10;
    spot.style.left=(r.left-pad)+'px';
    spot.style.top=(r.top-pad)+'px';
    spot.style.width=(r.width+pad*2)+'px';
    spot.style.height=(r.height+pad*2)+'px';
    spot.classList.add('on');
  };
  place();
  // Les faces du cube défilent : le projecteur doit suivre sa cible.
  _tutoReposition=place;
  window.addEventListener('resize',place);
  window.addEventListener('scroll',place,true);
}

// La bulle se met du côté opposé à la cible, pour ne jamais la recouvrir.
function tutoPlaceBox(target){
  const{box}=tutoEls();
  if(!box)return;
  let bottom=true;
  if(target){
    const r=target.getBoundingClientRect();
    bottom=(r.top+r.height/2)<window.innerHeight/2;
  }
  box.classList.toggle('tuto-box-bottom',bottom);
  box.classList.toggle('tuto-box-top',!bottom);
}

// ----------------------------------------------------------------
// BRANCHEMENT
// ----------------------------------------------------------------
// Proposé automatiquement à un compte neuf, une seule fois. Les comptes
// existants le retrouvent dans les réglages : leur imposer une visite guidée
// après coup serait une punition.
function tutoMaybeStart(){
  if(tutoDone())return;
  // Reprise : un tutoriel interrompu par un rechargement repart de son
  // étape, pas du début (voir tutoSaveStep).
  const at=tutoLoadStep();
  setTimeout(()=>tutoStart(at),450);
}

// Un seul bouton dans la bulle, mais trois rôles selon le moment : rejouer
// une bataille perdue, lancer la bataille de l'étape, ou simplement avancer.
function tutoOnNextClick(){
  if(_tutoMsgAction){
    const fn=_tutoMsgAction;_tutoMsgAction=null;
    fn();return;
  }
  const step=TUTO_STEPS[_tutoIdx];
  if(step&&typeof step.battle==='number'){tutoStartBattle(step.battle);return;}
  tutoNext();
}

document.addEventListener('DOMContentLoaded',()=>{
  const{next,box,root}=tutoEls();
  if(next)next.addEventListener('click',tutoOnNextClick);
  // « Passer le tutoriel » : toujours à portée, à côté des répliques du
  // l'Alchimiste, à toutes les étapes. On confirme quand même — on saute des
  // batailles et trois exercices, ce n'est pas un clic anodin.
  document.getElementById('tuto-skip')?.addEventListener('click',()=>{
    if(typeof showConfirmModal==='function'){
      showConfirmModal(
        'Passer le tutoriel ? Vous recevrez directement le Peureux, la Fourmi et '+
        'l\'Éléphant de guerre, ainsi qu\'une première armée composée au hasard.',
        tutoSkip,{okLabel:'Passer',cancelLabel:'Continuer le tutoriel',okClass:'btn-primary'});
    }else tutoSkip();
  });
  // Cliquer la bulle pendant la frappe affiche la réplique d'un coup.
  if(box)box.addEventListener('click',e=>{
    if(e.target.closest('button'))return;
    const t=document.getElementById('tuto-text');
    if(t&&t.dataset.typing==='1'&&t._tutoFinish)t._tutoFinish();
  });
  if(root){
    const portrait=document.getElementById('tuto-portrait');
    if(portrait)portrait.innerHTML=ALCHIMISTE_SVG;
  }
});
