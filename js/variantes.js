// ================================================================
// VARIANTES.JS : la page « Variantes » de la rangée de navigation
// ================================================================
// Quatrième page de la rangée, entre COMBAT et la Guerre des clans (voir
// js/pages-nav.js). Elle répond à la seule question que l'écran de combat ne
// répond pas : « est-ce qu'on joue toujours à la même chose ? »
//
// TROIS VARIANTES SONT JOUABLES, ET LA PAGE LE DIT. Le duel classique — cinq
// pièces, 24 points, un échiquier 8×8 — est ce que lance le bouton COMBAT ;
// la Chute des Royaumes est une partie d'échecs ordinaire où, après chaque
// coup, les quatre rangées centrales glissent d'une case vers la droite (voir
// js/fok-rules.js) ; Mirror Chess est une partie d'échecs ordinaire où chaque
// pièce est jumelée à sa symétrique et où bouger l'une fait bouger l'autre en
// miroir — sauf au coup d'ouverture de chaque camp, qui part seul (voir
// js/mirror-rules.js). Les quatre autres formules sont annoncées,
// verrouillées, et n'ouvrent rien :
// une carte grisée qui dit « bientôt » est honnête ; un bouton qui ouvre un
// écran vide ne l'est pas. C'est exactement le reproche qu'on faisait à la
// face « Variantes » de l'ancien cube de navigation, retirée pour cette raison.
//
// La page se rend comme le magasin : une grille construite UNE FOIS, puis
// laissée tranquille. renderVariantesPage() est appelée à chaque arrivée sur
// la page (refreshPageContent, js/pages-nav.js) et doit donc être idempotente
// — sans quoi la grille se réécrirait sous les yeux du joueur à chaque
// glissement, ce qui est précisément le clignotement qu'on a chassé partout
// ailleurs.
//
// Dépendances : pages-nav.js (appel du rendu), armies.js (startArmySelection,
// pour le duel classique), fok-game.js (fokOpenLobby, pour la Chute des
// Royaumes), mirror-game.js (mirOpenLobby, pour Mirror Chess),
// tutorial.js (tutoInterceptCombat), main.js (escH).
// ================================================================

// Les huit formules. `on:true` = jouable aujourd'hui. L'ordre est celui de
// lecture : ce qu'on peut jouer d'abord, les promesses ensuite.
const VARIANTES=[
  {id:'duel', on:true,
   nom:'Duel classique',
   tag:'Classée',
   txt:'Cinq pièces, vingt-quatre points, un échiquier 8×8. La partie que lance COMBAT, et la seule qui compte pour l\'ELO.'},
  {id:'fok', on:true,
   nom:'Chute des Royaumes',
   tag:'Libre',
   txt:'Les échecs ordinaires, seize pièces sur leurs cases — sauf qu\'après chaque coup, les quatre rangées centrales glissent d\'une case vers la droite. Rien n\'est misé, rien n\'est classé.'},
  {id:'mirror', on:true,
   nom:'Mirror Chess',
   tag:'Libre',
   txt:'Les échecs ordinaires, mais chaque pièce est jumelée à sa symétrique — le Roi à la Dame, les tours entre elles, les pions deux à deux. Bouger l\'une fait bouger l\'autre, en miroir et du même nombre de cases. Seul le coup d\'ouverture de chaque camp part seul.'},
  {id:'blitz',
   nom:'Blitz alchimique',
   tag:'Bientôt',
   txt:'Trois minutes chacun, et un pouvoir qui se recharge au lieu de s\'épuiser. Les armées y sont les mêmes ; c\'est la pendule qui choisit.'},
  {id:'brouillard',
   nom:'Brouillard de guerre',
   tag:'Bientôt',
   txt:'Vous ne voyez que ce que vos pièces atteignent. Le reste de l\'échiquier est une rumeur.'},
  {id:'siege',
   nom:'Siège',
   tag:'Bientôt',
   txt:'Un camp attaque, l\'autre tient. Budgets et conditions de victoire différents des deux côtés.'},
  {id:'draft',
   nom:'Repêchage',
   tag:'Bientôt',
   txt:'On compose à tour de rôle dans un catalogue commun : chaque créature prise est une créature refusée à l\'adversaire.'},
  {id:'chaos',
   nom:'Chaos',
   tag:'Bientôt',
   txt:'Deux armées tirées au sort, le même budget, aucune préparation. Ce qu\'on fait quand on ne veut plus réfléchir.'},
];

function varianteCardHTML(v){
  const cls='var-card'+(v.on?' is-on':' is-locked');
  return '<'+(v.on?'button type="button"':'div')+' class="'+cls+'"'+
    (v.on?' data-variante="'+v.id+'"':' aria-disabled="true"')+'>'+
    '<div class="var-card-hdr">'+
      '<div class="var-card-name">'+escH(v.nom)+'</div>'+
      '<div class="var-card-tag">'+escH(v.tag)+'</div>'+
    '</div>'+
    '<div class="var-card-txt">'+escH(v.txt)+'</div>'+
    (v.on?'<div class="var-card-go">Jouer</div>':'<div class="var-card-lock" aria-hidden="true">'+
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.1V7.9a5.4 5.4 0 0 1 10.8 0v2.2h1.3v10.4H5.3V10.1Zm2.6 0h5.6V7.9a2.8 2.8 0 0 0-5.6 0Z" fill-rule="evenodd"/></svg>'+
    '</div>')+
  '</'+(v.on?'button':'div')+'>';
}

let _varBuilt=false;
function renderVariantesPage(){
  const grid=document.getElementById('var-grid');
  if(!grid||_varBuilt&&grid.firstElementChild)return;
  grid.innerHTML=VARIANTES.map(varianteCardHTML).join('');
  // Un seul écouteur, posé sur la grille : les cartes ne sont jamais
  // recréées, mais la délégation évite d'en rebrancher sept si elles le
  // devenaient un jour.
  grid.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.var-card.is-on');
    if(!b||!grid.contains(b))return;
    // Le duel classique EST la partie du bouton COMBAT : il passe par le même
    // chemin, sélection d'armée comprise, plutôt que d'en ouvrir un second.
    // Les deux variantes d'échecs ne passent par aucune sélection d'armée :
    // elles se jouent avec les seize pièces d'un jeu d'échecs, et ouvrent donc
    // chacune leur propre salon (js/fok-game.js, js/mirror-game.js).
    if(b.dataset.variante==='fok'){
      if(typeof fokOpenLobby==='function')fokOpenLobby();
      return;
    }
    if(b.dataset.variante==='mirror'){
      if(typeof mirOpenLobby==='function')mirOpenLobby();
      return;
    }
    if(typeof tutoInterceptCombat==='function'&&tutoInterceptCombat())return;
    if(typeof startArmySelection==='function')startArmySelection('online');
  });
  _varBuilt=true;
}
