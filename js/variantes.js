// ================================================================
// VARIANTES.JS : la page « Variantes » de la rangée de navigation
// ================================================================
// Dernière page de la rangée, à droite de la Guerre des clans (voir
// js/pages-nav.js). Elle répond à la seule question que l'écran de combat ne
// répond pas : « est-ce qu'on joue toujours à la même chose ? »
//
// UNE VARIANTE, UNE SEULE, ET ELLE EST JOUABLE. La Chute des Royaumes est une
// partie d'échecs ordinaire où, après chaque coup, les quatre rangées
// centrales glissent d'une case vers la droite (voir js/fok-rules.js).
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
// Dépendances : pages-nav.js (appel du rendu), fok-game.js (fokOpenLobby),
// main.js (escH).
// ================================================================

// Les variantes. Elles sont toutes jouables : une carte qui ne mène nulle
// part n'a rien à faire ici (voir l'en-tête).
const VARIANTES=[
  {id:'fok',
   nom:'Chute des Royaumes',
   tag:'Libre',
   txt:'Les échecs ordinaires, seize pièces sur leurs cases — sauf qu\'après chaque coup, les quatre rangées centrales glissent d\'une case vers la droite. Rien n\'est misé, rien n\'est classé.'},
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
  // Un seul écouteur, posé sur la grille : la carte n'est jamais recréée,
  // mais la délégation évite d'en rebrancher autant qu'il y en aura le jour
  // où il y en aura plusieurs.
  grid.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.var-card.is-on');
    if(!b||!grid.contains(b))return;
    // La Chute des Royaumes ne passe par aucune sélection d'armée : elle se
    // joue avec les seize pièces d'un jeu d'échecs, elle ouvre donc son
    // propre salon (js/fok-game.js).
    if(b.dataset.variante==='fok'&&typeof fokOpenLobby==='function')fokOpenLobby();
  });
  _varBuilt=true;
}
