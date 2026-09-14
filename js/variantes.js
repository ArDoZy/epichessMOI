// ================================================================
// VARIANTES.JS : la page « Variantes » de la rangée de navigation
// ================================================================
// Dernière page de la rangée, à droite de la Guerre des clans (voir
// js/pages-nav.js). Elle répond à la seule question que l'écran de combat ne
// répond pas : « est-ce qu'on joue toujours à la même chose ? »
//
// TROIS VARIANTES, ET LES TROIS SE JOUENT. Board Quake est une partie
// d'échecs ordinaire où, après chaque coup, les quatre rangées centrales
// glissent d'une case vers la droite (voir js/fok-rules.js) ; Mirror Chess en
// est une autre, où chaque pièce est jumelée à sa symétrique et où bouger
// l'une fait bouger l'autre en miroir — sauf au coup d'ouverture de chaque
// camp, qui part seul (voir js/mirror-rules.js) ; le Cheval de Troie en est
// une troisième, où chacun a choisi avant le premier coup un cavalier adverse
// pour être son espion, et où l'autre ne sait pas lequel — y compris en
// ligne, où le choix ne traverse jamais le réseau (voir js/troie-rules.js et
// js/troie-mp.js).
//
// CE QUI N'EST PAS LÀ N'EST PAS ANNONCÉ. La page portait six autres cartes :
// le duel classique — qui n'est pas une variante, c'est LA partie, celle que
// lance le bouton COMBAT — et cinq formules grisées marquées « bientôt ». Une
// promesse affichée n'est pas une fonctionnalité : elle occupe la place de ce
// qui existe, et elle vieillit mal. Une variante s'ajoutera ici le jour où
// elle se jouera, pas avant.
//
// La page se rend comme le magasin : une grille construite UNE FOIS, puis
// laissée tranquille. renderVariantesPage() est appelée à chaque arrivée sur
// la page (refreshPageContent, js/pages-nav.js) et doit donc être idempotente
// — sans quoi la grille se réécrirait sous les yeux du joueur à chaque
// glissement, ce qui est précisément le clignotement qu'on a chassé partout
// ailleurs.
//
// Dépendances : pages-nav.js (appel du rendu), fok-game.js (fokOpenLobby,
// pour Board Quake), mirror-game.js (mirOpenLobby, pour Mirror
// Chess), troie-game.js (troOpenLobby, pour le Cheval de Troie),
// main.js (escH).
// ================================================================

// Les variantes. Elles sont toutes jouables : une carte qui ne mène nulle
// part n'a rien à faire ici (voir l'en-tête). `lobby` nomme la fonction qui
// ouvre le salon de chacune — c'est tout ce qui les distingue à ce niveau.
const VARIANTES=[
  {id:'fok', lobby:'fokOpenLobby',
   nom:'Board Quake',
   tag:'Libre',
   txt:'Les échecs ordinaires, seize pièces sur leurs cases — sauf qu\'après chaque coup, les quatre rangées centrales glissent d\'une case vers la droite. Rien n\'est misé, rien n\'est classé.'},
  {id:'mirror', lobby:'mirOpenLobby',
   nom:'Mirror Chess',
   tag:'Libre',
   txt:'Les échecs ordinaires, mais chaque pièce est jumelée à sa symétrique — le Roi à la Dame, les tours entre elles, les pions deux à deux. Bouger l\'une fait bouger l\'autre, en miroir et du même nombre de cases. Seul le coup d\'ouverture de chaque camp part seul.'},
  {id:'troie', lobby:'troOpenLobby',
   nom:'Cheval de Troie',
   tag:'Libre',
   txt:'Avant le premier coup, chacun choisit un des deux cavaliers adverses pour être son espion — et l\'autre ne sait pas lequel. Il sert en face, sans jamais donner échec, jusqu\'au jour où vous le jouez : il change alors de camp pour de bon.'},
];

function varianteCardHTML(v){
  return '<button type="button" class="var-card is-on" data-variante="'+v.id+'">'+
    '<div class="var-card-hdr">'+
      '<div class="var-card-name">'+escH(v.nom)+'</div>'+
      '<div class="var-card-tag">'+escH(v.tag)+'</div>'+
    '</div>'+
    '<div class="var-card-txt">'+escH(v.txt)+'</div>'+
    '<div class="var-card-go">Jouer</div>'+
  '</button>';
}

let _varBuilt=false;
function renderVariantesPage(){
  const grid=document.getElementById('var-grid');
  if(!grid||_varBuilt&&grid.firstElementChild)return;
  grid.innerHTML=VARIANTES.map(varianteCardHTML).join('');
  // Un seul écouteur, posé sur la grille : les cartes ne sont jamais
  // recréées, mais la délégation évite d'en rebrancher autant qu'il y en aura
  // le jour où il y en aura plus.
  grid.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.var-card.is-on');
    if(!b||!grid.contains(b))return;
    // Aucune variante ne passe par la sélection d'armée : elles se jouent
    // avec les seize pièces d'un jeu d'échecs, et ouvrent donc chacune leur
    // propre salon (js/fok-game.js, js/mirror-game.js).
    const v=VARIANTES.find(x=>x.id===b.dataset.variante);
    if(v&&typeof window[v.lobby]==='function')window[v.lobby]();
  });
  _varBuilt=true;
}
