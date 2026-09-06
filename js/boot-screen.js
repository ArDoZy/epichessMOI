// ================================================================
// BOOT-SCREEN.JS : la barre de progression de l'écran de démarrage
// ================================================================
// L'écran de démarrage (#ec-boot, index.html) attend une seule chose : la
// fiche du compte, que le serveur rend en un aller-retour. Cet aller-retour
// dure entre un dixième de seconde et cinq secondes, et RIEN ne permet de
// savoir à l'avance lequel des deux — il n'y a donc pas de vraie progression
// à afficher, seulement un début et une fin.
//
// C'EST POURTANT UNE BARRE QUI EST AFFICHÉE, ET NON UN TOURNIQUET. Un
// tourniquet tourne à la même vitesse qu'on attende un dixième de seconde ou
// dix : il dit « ça travaille », jamais « ça avance ». Une barre qui monte
// dit les deux, et c'est ce qui fait qu'on supporte d'attendre — le procédé
// est celui de tous les écrans de chargement de jeu, y compris ceux qui, comme
// ici, n'ont rien de mesurable à mesurer.
//
// LA COURBE EST HONNÊTE À DÉFAUT D'ÊTRE EXACTE : elle monte vite au début,
// ralentit à mesure qu'elle approche de 90 %, et ne les dépasse JAMAIS toute
// seule. Les 10 derniers pour cent sont réservés à l'événement réel — la
// fiche arrivée — et se franchissent d'un coup. Une barre qui atteindrait
// 100 % avant que le jeu soit prêt mentirait, et une barre qui mentirait une
// fois ne serait plus lue.
//
// Dépendances : aucune. Utilisé par : js/accounts.js (accountsBootVeil /
// accountsBootDone).
// ================================================================

// Les conseils qui défilent pendant l'attente. Ils sont tirés de ce que le
// jeu a de particulier — un joueur d'échecs ordinaire ne les devinerait pas —
// et changent toutes les cinq secondes. Sur un démarrage d'une seconde, on
// n'en lit qu'un : c'est déjà un de plus que rien.
const BOOT_TIPS=[
  'Une victoire rapporte de cinq à dix lauriers : plus la partie est courte, plus la Colonne des Victoires descend vite.',
  'Chaque créature garde le déplacement d\'une pièce d\'échecs — et y ajoute un pouvoir. Le reste des règles ne bouge pas.',
  'Votre armée est MISÉE : les créatures perdues sur l\'échiquier quittent vraiment votre réserve.',
  'La Diagonale de la Puissance se grimpe en ELO. Chaque rang ouvre de nouvelles créatures.',
  'Le Roi et la Dame ne se remplacent pas : toute armée part avec un Monarque et un Général.',
  'Trois jokers valent trois exemplaires de la créature de votre choix — parmi celles que vous possédez déjà.',
  'Un coffre ne donne jamais une créature que vous ne pouvez pas encore jouer.',
];

let _bootT=null,_bootPct=0,_bootTipT=null,_bootTipI=0;

function bootEl(id){return document.getElementById(id);}

// La progression affichée. On ne descend jamais : une barre qui reculerait
// ferait croire à un échec là où il n'y a qu'une nouvelle tentative.
function bootSetPct(p){
  _bootPct=Math.max(_bootPct,Math.min(100,p));
  const fill=bootEl('ec-boot-fill'),pct=bootEl('ec-boot-pct');
  if(fill)fill.style.width=_bootPct+'%';
  if(pct)pct.textContent=Math.round(_bootPct)+' %';
}

// LA MONTÉE. Chaque pas rapproche de 90 % d'un cinquième de ce qui reste :
// la barre avance donc toujours, de moins en moins, et n'atteint la butée
// qu'asymptotiquement. C'est exactement ce qu'on veut d'une attente dont on
// ignore la durée.
function bootCreep(){
  clearInterval(_bootT);
  _bootT=setInterval(()=>{
    if(_bootPct>=90)return;
    bootSetPct(_bootPct+(90-_bootPct)*.18+1);
  },260);
}

function bootTipCycle(){
  const el=bootEl('ec-boot-tip');
  if(!el)return;
  _bootTipI=Math.floor(Math.random()*BOOT_TIPS.length);
  el.textContent=BOOT_TIPS[_bootTipI];
  clearInterval(_bootTipT);
  // Le conseil s'efface avant de changer : un texte qui se remplace d'un
  // coup se lit comme un défaut d'affichage, pas comme un nouveau conseil.
  _bootTipT=setInterval(()=>{
    el.classList.add('is-out');
    setTimeout(()=>{
      _bootTipI=(_bootTipI+1)%BOOT_TIPS.length;
      el.textContent=BOOT_TIPS[_bootTipI];
      el.classList.remove('is-out');
    },450);
  },5200);
}

// Appelée à chaque affichage du voile (accountsBootVeil). `retry` signale que
// le serveur ne répond pas : la barre n'a alors plus rien à annoncer et
// s'efface au profit du bouton (voir .ec-load.is-stuck dans css/style.css).
function bootScreenStart(retry){
  const veil=bootEl('ec-boot');
  if(!veil)return;
  veil.classList.toggle('is-stuck',!!retry);
  if(retry){clearInterval(_bootT);return;}
  if(!_bootTipT)bootTipCycle();
  bootCreep();
  bootSetPct(Math.max(_bootPct,6));
}

// La fiche est arrivée : les dix derniers pour cent d'un coup, puis le voile
// se retire une fois la barre pleine — sinon on verrait le jeu apparaître
// derrière une barre restée aux trois quarts.
function bootScreenFinish(hide){
  clearInterval(_bootT);clearInterval(_bootTipT);_bootTipT=null;
  bootSetPct(100);
  setTimeout(hide,260);
}
