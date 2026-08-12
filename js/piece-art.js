// ================================================================
// PIECE-ART.JS : logos de pièces dessinés en SVG (remplace les émojis)
// ================================================================
// Pourquoi : les émojis changent de dessin d'un système à l'autre (un 🪨 sur
// Windows ne ressemble pas à celui d'un iPhone), ne se colorent pas selon le
// camp, et donnent au jeu un aspect « brouillon de prototype ». Chaque pièce a
// donc ici sa propre silhouette vectorielle, dessinée dans un carré de
// référence de 100x100, avec un socle commun pour que la famille reste
// cohérente.
//
// Deux couleurs seulement, pilotées en CSS par --pc-fill / --pc-line, d'où
// une même silhouette utilisable en pièce blanche (fond clair, trait sombre)
// et en pièce noire (fond sombre, trait clair) sans dupliquer un seul dessin.
//
// Classes utilisées dans les chemins :
//   .b  forme pleine (remplie de --pc-fill, contournée de --pc-line)
//   .l  trait de détail seul (crinière, veines, tentacules...)
//   .k  aplat de contraste (yeux, croix) : dessiné en --pc-line
//
// Dépendances : aucune (chargé juste après data-pieces.js).
// Utilisé par : game-render.js (plateau), builder.js / armies.js /
// combat-intro.js / voie.js (cartes et listes), economy-ui.js (coffres).
//
// Pour ajouter une pièce : ajoutez son entrée dans PIECE_ART (id identique à
// celui de PIECES dans data-pieces.js). Sans entrée, pieceSVG() retombe
// automatiquement sur un jeton neutre, le jeu reste jouable.
// ================================================================

// Socle commun à toutes les pièces : c'est lui qui fait qu'un Typhon et une
// Méduse se lisent comme deux pièces du même jeu et non comme deux icônes
// sans rapport.
const PIECE_BASE='<path class="b" d="M30 80h40l6 11H24z"/><path class="b" d="M19 91h62a3 3 0 0 1 0 7H19a3 3 0 0 1 0-7z"/>';

const PIECE_ART={

  // ---- Monarques -------------------------------------------------
  'roi':
    '<path class="b" d="M45 3h10v9h9v9h-9v11H45V21h-9v-9h9z"/>'+
    '<path class="b" d="M26 49 21 23l15 11 14-17 14 17 15-11-5 26z"/>'+
    '<path class="b" d="M27 51h46l-4 15c8 6 12 10 12 16H19c0-6 4-10 12-16z"/>'+
    '<path class="l" d="M31 63h38"/>',

  // L'Empereur ne doit pas se confondre avec le Roi à la taille d'une case :
  // couronne fermée en arc (et non à pointes) surmontée d'un globe crucigère.
  'empereur':
    '<path class="b" d="M46 2h8v6h6v7h-6v7h-8v-7h-6V8h6z"/>'+
    '<circle class="b" cx="50" cy="32" r="12"/>'+
    '<path class="l" d="M38 32h24M50 20v24"/>'+
    '<path class="b" d="M22 57 17 27c8 11 19 17 33 17s25-6 33-17l-5 30z"/>'+
    '<path class="b" d="M23 59h54l-4 12c9 6 13 9 13 13H14c0-4 4-7 13-13z"/>',

  // ---- Généraux --------------------------------------------------
  'dame':
    '<circle class="b" cx="20" cy="27" r="6"/><circle class="b" cx="35" cy="16" r="6"/>'+
    '<circle class="b" cx="50" cy="10" r="7"/>'+
    '<circle class="b" cx="65" cy="16" r="6"/><circle class="b" cx="80" cy="27" r="6"/>'+
    '<path class="b" d="M20 27l7 24h46l7-24-15 11-15-17-15 17z"/>'+
    '<path class="b" d="M26 53h48l-4 14c9 6 13 10 13 16H17c0-6 4-10 13-16z"/>'+
    '<path class="l" d="M30 65h40"/>',

  // Arc en croissant plein (et non en simple trait) : à 40 px un trait de 3 px
  // disparaît, alors qu'un croissant garde sa silhouette.
  'amazone':
    '<path class="b" d="M73 11c16 15 16 51 0 66l-8-5c13-13 13-43 0-56z"/>'+
    '<path class="l" d="M69 15v58"/>'+
    '<path class="b" d="M29 25l-4-15 10 8 9-13 9 13 10-8-4 15z"/>'+
    '<circle class="b" cx="44" cy="37" r="12"/>'+
    '<path class="b" d="M33 46h21c2 10 6 15 10 20 4 6 5 11 5 16H18c0-5 1-10 5-16 4-5 8-10 10-20z"/>',

  // LE CENTAURE (anciennement Chevaucheur de Rhinocéros : l'id n'a pas bougé,
  // voir data-pieces.js). Ce qui le fait lire, c'est la JONCTION : un buste
  // dressé planté à l'avant d'un corps équin. Les deux masses se chevauchent
  // franchement, sinon on ne voit qu'un cavalier posé sur une bête.
  'chevaucheur-rhinoceros':
    '<circle class="b" cx="62" cy="15" r="10"/>'+
    '<path class="b" d="M62 27c9 0 15 6 16 15l2 13-9 2-3-12-1 9H51V42c0-9 4-15 11-15z"/>'+
    '<path class="l" d="M66 33c5 2 9 6 11 11"/>'+
    '<circle class="k" cx="66" cy="13" r="3.2"/>'+
    '<path class="b" d="M24 46h30c10 0 17 8 17 18v9c0 5-3 8-8 8H26c-7 0-12-5-12-12V58c0-7 4-12 10-12z"/>'+
    '<path class="l" d="M14 50c-6 1-10 7-10 15"/>'+
    '<path class="l" d="M30 81V70M46 81V70M62 81V70"/>',

  // Le visage est un VIDE sombre (classe .k) et non un contour : c'est ce
  // creux d'ombre sous la capuche qui fait lire le personnage encapuchonné.
  'grand-maitre':
    '<path class="b" d="M50 7c-15 0-26 11-26 25 0 8 3 15 5 20l-8 16c-3 6-4 11-4 14h66c0-3-1-8-4-14l-8-16c2-5 5-12 5-20 0-14-11-25-26-25z"/>'+
    '<path class="k" d="M38 31c0-8 5-14 12-14s12 6 12 14-5 17-12 17-12-9-12-17z"/>'+
    '<circle class="b" cx="50" cy="70" r="12"/>'+
    '<path class="l" d="M43 66c2-4 6-6 11-5"/>',

  // ---- Primordiales ----------------------------------------------
  'cavalier-primordial':
    '<path class="b" d="M58 9l3-8 6 8z"/>'+
    '<path class="b" d="M36 82c0-13 1-22 5-30l-7 5c-6 4-12 2-13-4-2-7 2-14 8-20 5-5 11-9 16-14 4-4 6-8 7-13l6 6 5-5c10 8 17 20 20 33 3 13 4 27 4 42z"/>'+
    '<path class="l" d="M63 18c5 8 9 19 10 30"/>'+
    '<circle class="k" cx="52" cy="29" r="3.5"/>',

  'fou-primordial':
    '<circle class="b" cx="50" cy="11" r="6"/>'+
    '<path class="b" d="M50 17c11 9 18 21 18 30 0 11-8 19-18 19s-18-8-18-19c0-9 7-21 18-30z"/>'+
    '<path class="l" d="M58 32 44 48"/>'+
    '<path class="b" d="M33 66h34l4 8H29z"/>'+
    '<path class="b" d="M31 76h38c4 4 6 6 6 8H25c0-2 2-4 6-8z"/>',

  'tour-primordiale':
    '<path class="b" d="M25 14h12v9h8v-9h10v9h8v-9h12v21l-8 7v27l9 22H24l9-22V42l-8-7z"/>'+
    '<path class="l" d="M33 42h34M32 69h36"/>',

  // ---- Brutes ----------------------------------------------------
  // LE PEUREUX. Tout est dans la posture : deux mains levées de part et
  // d'autre de la tête, des épaules remontées jusqu'aux oreilles, des yeux
  // beaucoup trop grands et une bouche qui tremble. Aucune arme, aucune
  // pointe : à la taille d'une case, c'est la seule silhouette du jeu qui
  // recule au lieu d'avancer.
  'peureux':
    '<path class="b" d="M25 47c-6-6-10-14-12-22 5-1 10 2 13 7z"/>'+
    '<path class="b" d="M75 47c6-6 10-14 12-22-5-1-10 2-13 7z"/>'+
    '<path class="b" d="M50 18c-16 0-27 12-27 28 0 13 4 24 8 34h38c4-10 8-21 8-34 0-16-11-28-27-28z"/>'+
    '<ellipse class="k" cx="40" cy="45" rx="6" ry="7.5"/>'+
    '<ellipse class="k" cx="60" cy="45" rx="6" ry="7.5"/>'+
    '<path class="l" d="M42 66c2.7-4 5.3 4 8 0s5.3 4 8 0"/>'+
    '<path class="l" d="M13 32c-3-2-5-5-6-9M87 32c3-2 5-5 6-9"/>',

  'fourmi':
    '<path class="l" d="M43 14c-5-8-11-12-17-10M57 14c5-8 11-12 17-10"/>'+
    '<path class="l" d="M40 39 22 31M40 47H20M40 55l-18 9M60 39l18-8M60 47h20M60 55l18 9"/>'+
    '<ellipse class="b" cx="50" cy="69" rx="14" ry="15"/>'+
    '<ellipse class="b" cx="50" cy="45" rx="10" ry="12"/>'+
    '<circle class="b" cx="50" cy="23" r="11"/>'+
    '<circle class="k" cx="45" cy="21" r="3"/><circle class="k" cx="55" cy="21" r="3"/>',

  'preux-chevalier':
    '<path class="b" d="M21 16h58v33c0 21-17 34-29 42-12-8-29-21-29-42z"/>'+
    '<path class="k" d="M45 24h10v16h14v10H55v25H45V50H31V40h14z"/>',

  'dresseur-elephant':
    '<path class="b" d="M31 27C17 24 8 36 12 51c4 13 13 17 19 13z"/>'+
    '<path class="b" d="M69 27c14-3 23 9 19 24-4 13-13 17-19 13z"/>'+
    '<path class="b" d="M50 9c14 0 24 11 24 25v17c0 9-4 15-11 17H37c-7-2-11-8-11-17V34c0-14 10-25 24-25z"/>'+
    '<path class="b" d="M44 60c0 13-1 23 4 29 6 7 15 5 18-2l-9-3c-1 4-5 4-6-1-2-6-1-15-1-23z"/>'+
    '<path class="b" d="M36 63c-3 7-3 13 0 18l5-2c-2-5-2-11 0-15z"/>'+
    '<circle class="k" cx="39" cy="40" r="3.5"/><circle class="k" cx="61" cy="40" r="3.5"/>',

  'garde-pierre':
    '<path class="b" d="M23 82l3-35 11-16 13-8 13 8 11 16 3 35z"/>'+
    '<path class="l" d="M37 31l7 21-15 7M63 31l-7 21 15 7M44 52l6 13 6-13"/>'+
    '<circle class="k" cx="41" cy="41" r="3.5"/><circle class="k" cx="59" cy="41" r="3.5"/>',

  // ---- Sorciers --------------------------------------------------
  'meduse':
    '<path class="l" d="M33 56c-3 11 2 15 0 26M42 59c-3 12 2 16 0 25M50 60c-3 12 2 16 0 25M58 59c-3 12 2 16 0 25M67 56c-3 11 2 15 0 26"/>'+
    '<path class="b" d="M21 52c0-21 13-37 29-37s29 16 29 37c0 5-3 8-8 8H29c-5 0-8-3-8-8z"/>'+
    '<path class="l" d="M34 47c0-13 7-23 16-23s16 10 16 23"/>',

  'typhon':
    '<path class="b" d="M15 14h70l-13 23H28z"/>'+
    '<path class="b" d="M28 41h44l-11 21H39z"/>'+
    '<path class="b" d="M39 66h22l-7 18h-8z"/>'+
    '<path class="l" d="M26 26h48M37 52h26"/>',

  'banshee':
    '<path class="b" d="M24 84V41c0-15 12-27 26-27s26 12 26 27v43l-6.5-9-6.5 9-6.5-9-6.5 9-6.5-9-6.5 9-6.5-9-6.5 9z"/>'+
    '<ellipse class="k" cx="41" cy="41" rx="4.5" ry="6"/><ellipse class="k" cx="59" cy="41" rx="4.5" ry="6"/>'+
    '<path class="l" d="M45 58c3 3 7 3 10 0"/>',

  'pretre':
    '<path class="b" d="M50 7c-10 0-18 8-18 18 0 6 2 11 5 14L24 50c-6 5-9 11-9 16v16h70V66c0-5-3-11-9-16L63 39c3-3 5-8 5-14 0-10-8-18-18-18z"/>'+
    '<path class="k" d="M46 48h8v11h11v8H54v18h-8V67H35v-8h11z"/>',
};

// Pièces standard qui remplissent le fond de plateau : elles réutilisent le
// dessin des Primordiales correspondantes, ce sont les mêmes pièces.
const PIECE_ART_ALIAS={
  'std-pawn':'__pawn','std-r':'tour-primordiale','std-n':'cavalier-primordial','std-b':'fou-primordial',
  'dame-promo':'dame','tour-promo':'tour-primordiale','fou-promo':'fou-primordial','cav-promo':'cavalier-primordial',
};

PIECE_ART.__pawn=
  '<circle class="b" cx="50" cy="25" r="13"/>'+
  '<path class="b" d="M40 36h20l2 7H38z"/>'+
  '<path class="b" d="M38 43h24c0 16 4 27 10 37H28c6-10 10-21 10-37z"/>';

// Jeton neutre : garantit qu'une pièce ajoutée sans dessin reste visible et
// jouable au lieu de laisser une case vide.
PIECE_ART.__fallback=
  '<circle class="b" cx="50" cy="44" r="30"/>'+
  '<path class="l" d="M50 30v20M50 58v2"/>';

function pieceArtFor(pieceId){
  const id=PIECE_ART_ALIAS[pieceId]||pieceId;
  return PIECE_ART[id]||PIECE_ART.__fallback;
}

// ----------------------------------------------------------------
// RENDU
// ----------------------------------------------------------------
// color : 'w' | 'b' | 'n' (neutre : teinte d'accent, pour les listes et les
// cartes où la pièce n'appartient encore à aucun camp).
// Le SVG est inséré tel quel dans le HTML des pages : pas de <img>, donc la
// pièce hérite des variables CSS du thème et se recolore avec lui.
function pieceSVG(pieceId,color,cls){
  const c=color==='b'?'pc-b':color==='w'?'pc-w':'pc-n';
  return '<svg class="pc-svg '+c+(cls?' '+cls:'')+'" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+
    PIECE_BASE+pieceArtFor(pieceId)+'</svg>';
}

// Version « en ligne » pour les listes, l'historique des coups et les
// bandeaux.
//
// sizeEm est FACULTATIF, et c'est important : quand il est fourni, la taille
// part en style INLINE, qui l'emporte sur toute règle CSS. Un conteneur qui
// met `font-size:0` (pour supprimer les blancs entre icônes) réduisait donc
// l'icône à 0 px sans qu'aucune feuille de style puisse la rattraper.
// Omettre sizeEm laisse la taille à la CSS (.pc-icon, et les règles de la
// section [ICON-SIZES]), ce qui est la bonne option partout où le contexte
// impose déjà une dimension.
function pieceIcon(pieceId,color,sizeEm){
  const size=sizeEm?' style="width:'+sizeEm+'em;height:'+sizeEm+'em"':'';
  return '<span class="pc-icon"'+size+'>'+pieceSVG(pieceId,color||'n')+'</span>';
}

// Récupère l'id d'affichage d'une case du plateau (les pièces posées portent
// pieceId, les données de catalogue portent id).
function cellArtId(cell){return cell?(cell.pieceId||cell.id||''):'';}
