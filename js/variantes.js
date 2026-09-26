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

// L'EMBLÈME DE CHAQUE VARIANTE : la règle, dessinée. Trois paragraphes de
// texte se ressemblaient à s'y méprendre ; un dessin de 48 px dit la
// différence avant la lecture — les rangées qui glissent, l'axe du miroir, le
// cavalier masqué. SVG et `currentColor`, comme toutes les icônes du jeu (pas
// d'émoji, voir les conventions du README). Les parties marquées `var-mv`
// bougent en boucle ([VARIANTES] de css/style.css) ; la règle globale de
// `prefers-reduced-motion` les fige.
const VAR_EMBLEMS={
  fok:'<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6">'+
      '<rect x="8" y="6" width="32" height="8" rx="1.5"/>'+
      '<g class="var-mv var-mv-slide"><rect x="8" y="16" width="32" height="7" rx="1.5"/><rect x="8" y="25" width="32" height="7" rx="1.5"/>'+
      '<path d="M16 16v7M24 16v7M32 16v7M16 25v7M24 25v7M32 25v7" stroke-width="1"/></g>'+
      '<rect x="8" y="34" width="32" height="8" rx="1.5"/>'+
      '<path d="M41 27.5h4m-2-2 2 2-2 2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>',
  mirror:'<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M24 5v38" stroke-dasharray="2 3"/>'+
      '<g class="var-mv var-mv-l"><path d="M9 34h9M10.5 34l1.5-9h3l1.5 9M11 25l-1.5-5 3 2 1.5-3 1.5 3 3-2-1.5 5"/></g>'+
      '<g class="var-mv var-mv-r"><path d="M30 34h9M31.5 34l1.5-9h3l1.5 9M32 25l-1.5-5 3 2 1.5-3 1.5 3 3-2-1.5 5"/></g>'+
      '<path d="M14 14q10-8 20 0" stroke-width="1.2"/><path d="M31.5 12.5 34 14l-2.8.8M16.5 12.5 14 14l2.8.8" stroke-width="1.2"/></g></svg>',
  troie:'<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M15 41h20M17 41l2-6h14l1 6M19 35c-1-6 1-9 5-12l-6 1-3-3 8-10 3-3 1 4c6 3 9 9 7 17"/>'+
      '<g class="var-mv var-mv-eye"><path d="M20 19.5q5-4 10 0q-5 4-10 0Z" fill="currentColor" fill-opacity=".18"/><circle cx="25" cy="19.5" r="1.4" fill="currentColor"/></g></g></svg>',
};
function varianteCardHTML(v){
  return '<button type="button" class="var-card is-on" data-variante="'+v.id+'">'+
    '<div class="var-card-hdr">'+
      (VAR_EMBLEMS[v.id]?'<span class="var-card-emblem">'+VAR_EMBLEMS[v.id]+'</span>':'')+
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
