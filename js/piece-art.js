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

// ----------------------------------------------------------------
// LA MATIÈRE (direction « Fantasy », v5)
// ----------------------------------------------------------------
// Les pièces ne sont plus deux aplats. Chaque camp a sa MATIÈRE, peinte par
// des dégradés communs à tout le document (pieceArtDefs, plus bas) :
//   · les blancs sont d'IVOIRE, éclairé en haut à gauche, rehaussé d'OR
//     et serti de SAPHIRS ;
//   · les noirs sont d'OBSIDIENNE violacée, rehaussée du même or, sertie
//     de RUBIS, et cernée d'un trait d'or pâle — sans lui, une pièce noire
//     disparaîtrait sur une case sombre.
// L'or est commun aux deux camps : c'est la couleur du jeu, et c'est la
// matière qui fait d'une silhouette une PIÈCE D'APPARAT. Ce qui sépare les
// camps au premier coup d'œil reste le corps (clair / sombre) ; la gemme
// (bleue / rouge) le confirme à grande taille.
//
// Les classes d'un dessin (toutes dans le repère 100 × 100) :
//   .b  le CORPS : matière du camp, cerné (--pc-line)
//   .g  l'OR : couronnes, colliers, lames, ferrures — cerné comme le corps
//   .e  une GEMME ou un œil qui luit : saphir (blancs) / rubis (noirs)
//   .s  une OMBRE propre, sans trait, posée PAR-DESSUS une forme pleine et
//       contenue dans son contour : c'est elle qui donne le volume
//   .h  un REFLET, sans trait, même règle : le coup de lumière
//   .l  un trait de détail (crinière, plis, veines)
//   .t  un trait FIN, pour le détail qui ne compte qu'à grande taille
//   .k  un aplat de contraste (orbites, fentes, creux d'ombre) en --pc-line
// Une pièce doit se lire à QUARANTE PIXELS : la silhouette d'abord, l'or
// ensuite, le reste est du bonus pour la fiche et les cartes.
//
// Le dégradé du corps est en `userSpaceOnUse` dans le repère 100 × 100 :
// toutes les formes d'une pièce partagent donc la MÊME lumière, au lieu que
// chaque morceau ait son propre petit dégradé (ce qui ferait un patchwork).

// Socle commun à toutes les pièces : un piédestal d'apparat à deux degrés,
// ceint d'un jonc d'or. C'est lui qui fait qu'un Typhon et une Méduse se
// lisent comme deux pièces du même jeu, et non comme deux icônes sans
// rapport. Les dessins se posent sur sa face haute, à y = 80.
const PIECE_BASE=
  '<path class="b" d="M29 80h42l5 8H24z"/>'+
  '<path class="g" d="M22 87.5h56c2 0 3.5 1.5 3.5 3.2H18.5c0-1.7 1.5-3.2 3.5-3.2z"/>'+
  '<path class="b" d="M17 90.5h66a3 3 0 0 1 3 3V95a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3v-1.5a3 3 0 0 1 3-3z"/>'+
  '<path class="s" d="M60 91.5h23a2 2 0 0 1 2 2V95a2 2 0 0 1-2 2H60z"/>'+
  '<path class="h" d="M19 92h22v1.6H19z"/>';

// Les dégradés et filtres partagés. Injectés UNE fois dans le document, dans
// un <svg> de taille nulle (et non `display:none` : Firefox ne peint pas un
// dégradé défini sous un élément non rendu). La CSS les appelle par leur id
// (`fill:url(#pcg-w)`), avec une couleur de secours si l'id manquait.
function pieceArtDefs(){
  return '<svg id="pc-defs" aria-hidden="true" focusable="false" '+
    'style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none">'+
    '<defs>'+
      // IVOIRE : la lumière vient d'en haut à gauche.
      '<linearGradient id="pcg-w" gradientUnits="userSpaceOnUse" x1="22" y1="4" x2="78" y2="100">'+
        '<stop offset="0" stop-color="#fffef8"/><stop offset=".42" stop-color="#f3e9d2"/>'+
        '<stop offset=".78" stop-color="#d9c6a0"/><stop offset="1" stop-color="#b59a6c"/>'+
      '</linearGradient>'+
      // OBSIDIENNE : un reflet d'améthyste en haut, la nuit pleine en bas.
      '<linearGradient id="pcg-b" gradientUnits="userSpaceOnUse" x1="22" y1="4" x2="78" y2="100">'+
        '<stop offset="0" stop-color="#6b6188"/><stop offset=".3" stop-color="#383052"/>'+
        '<stop offset=".7" stop-color="#1b1729"/><stop offset="1" stop-color="#0a0810"/>'+
      '</linearGradient>'+
      // L'OR : un or martelé, chaque forme a sa propre lumière (une couronne
      // brille de haut en bas, quelle que soit sa place dans la pièce).
      '<linearGradient id="pcg-gold" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="#fff4c4"/><stop offset=".32" stop-color="#f2c962"/>'+
        '<stop offset=".68" stop-color="#c58d2c"/><stop offset="1" stop-color="#8a5a16"/>'+
      '</linearGradient>'+
      // L'or des noirs : plus chaud et un peu plus sombre, pour qu'il ne
      // crie pas sur l'obsidienne.
      '<linearGradient id="pcg-gold-b" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="#ffe7a8"/><stop offset=".35" stop-color="#e0ad4a"/>'+
        '<stop offset=".7" stop-color="#a8701f"/><stop offset="1" stop-color="#6a420e"/>'+
      '</linearGradient>'+
      // LES GEMMES : un point de lumière décentré, un cœur saturé, un bord
      // presque noir — c'est ce bord qui fait lire une gemme et non un rond.
      '<radialGradient id="pcg-gem-w" cx=".36" cy=".3" r=".75">'+
        '<stop offset="0" stop-color="#f2fcff"/><stop offset=".28" stop-color="#7fd6ff"/>'+
        '<stop offset=".66" stop-color="#2369c9"/><stop offset="1" stop-color="#0d2a66"/>'+
      '</radialGradient>'+
      '<radialGradient id="pcg-gem-b" cx=".36" cy=".3" r=".75">'+
        '<stop offset="0" stop-color="#fff0ea"/><stop offset=".28" stop-color="#ff7a62"/>'+
        '<stop offset=".66" stop-color="#c0162e"/><stop offset="1" stop-color="#4f0612"/>'+
      '</radialGradient>'+
    '</defs></svg>';
}
(function injectPieceArtDefs(){
  if(typeof document==='undefined')return;
  const put=()=>{
    if(document.getElementById('pc-defs')||!document.body)return;
    document.body.insertAdjacentHTML('afterbegin',pieceArtDefs());
  };
  if(document.body)put();else document.addEventListener('DOMContentLoaded',put);
})();

const PIECE_ART={

  // ---- Monarques -------------------------------------------------
  // LE ROI : la couronne d'or à cinq fleurons sertis, la croix gemmée au
  // sommet, le col d'or et l'ourlet brodé de la robe. La croix reste sa
  // signature à quarante pixels : c'est elle qui le sépare de la Dame.
  'roi':
    '<path class="b" d="M31 46h38l-4 12c9 5 14 12 15 22H20c1-10 6-17 15-22z"/>'+
    '<path class="s" d="M57 47h10l-3.5 10.5c8 5 12.5 11.5 13.5 20.5H62c0-12-2-22-5-31z"/>'+
    '<path class="h" d="M35.5 61c-5 4-8 9-9.5 15h3.6c1.2-5.6 3.6-9.6 7.6-12.6zM35 48h3.6l-2.4 7.6h-3.2z"/>'+
    '<path class="g" d="M21.2 75h57.6l1.2 5H20z"/>'+
    '<path class="g" d="M33.6 56h32.8l-1.3 4.8H34.9z"/>'+
    '<path class="g" d="M28 41 25 22l9 7 6-11 5 8 5-11 5 11 5-8 6 11 9-7-3 19z"/>'+
    '<path class="h" d="M30 38.5 28.4 28l4 3.2z"/>'+
    '<path class="g" d="M26.5 39h47v7.5h-47z"/>'+
    '<ellipse class="e" cx="50" cy="42.7" rx="4.2" ry="3.1"/>'+
    '<circle class="e" cx="36.5" cy="42.7" r="2"/><circle class="e" cx="63.5" cy="42.7" r="2"/>'+
    '<circle class="e" cx="25" cy="22" r="2.3"/><circle class="e" cx="75" cy="22" r="2.3"/>'+
    '<circle class="e" cx="40" cy="18" r="2.1"/><circle class="e" cx="60" cy="18" r="2.1"/>'+
    '<path class="g" d="M46.8 1.5h6.4v4.8h4.6v6.2h-4.6V17h-6.4v-4.5h-4.6V6.3h4.6z"/>'+
    '<circle class="e" cx="50" cy="9.4" r="2.2"/>',

  // LA MATRIARCHE : un diadème bas et un voile qui tombe sur les épaules ;
  // le visage est le creux d'ombre sous le voile, comme le Grand Maître.
  'matriarche':
    '<path class="b" d="M34 27l4-12 6 7 6-12 6 12 6-7 4 12z"/>'+
    '<path class="b" d="M30 29h40c3 10 2 19-2 26l3 11c7 5 10 10 10 16H19c0-6 3-11 10-16l3-11c-4-7-5-16-2-26z"/>'+
    '<path class="k" d="M40 35c0-3 4-5 10-5s10 2 10 5c0 9-4 16-10 16s-10-7-10-16z"/>'+
    '<path class="l" d="M31 64h38"/>',

  // L'EMPEREUR : la couronne FERMÉE (le dôme et ses arceaux) sous le globe
  // crucifère — ce qui le distingue du Roi à quarante pixels.
  'imperator':
    '<path class="b" d="M47 3h6v4h4v5h-4v5h-6v-5h-4V7h4z"/>'+
    '<path class="b" d="M22 45c0-15 12-27 28-27s28 12 28 27z"/>'+
    '<path class="l" d="M50 19v26M37 23c-4 6-6 14-6 22M63 23c4 6 6 14 6 22"/>'+
    '<path class="b" d="M23 45h54l-3 8H26z"/>'+
    '<path class="b" d="M28 55h44l-4 12c8 6 12 10 12 15H20c0-5 4-9 12-15z"/>'+
    '<path class="l" d="M31 67h38"/>',

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

  // LE CENTAURE. Son identifiant ne dit pas son nom, et c'est voulu — la
  // raison est écrite une fois pour toutes dans data-pieces.js, à côté de la
  // pièce. Ce qui le fait lire, c'est la JONCTION : un buste
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

  // NYX : une silhouette voilée sous le croissant de lune, deux yeux qui
  // luisent dans le noir du capuchon — la nuit qu'elle jette autour d'elle.
  'nyx':
    '<path class="b" d="M73 5a15 15 0 1 0 14 22 12 12 0 1 1-14-22z"/>'+
    '<path class="k" d="M22 12l1.6 3.4L27 17l-3.4 1.6L22 22l-1.6-3.4L17 17l3.4-1.6zM30 32l1.2 2.3 2.3 1.2-2.3 1.2L30 39l-1.2-2.3-2.3-1.2 2.3-1.2z"/>'+
    '<path class="b" d="M50 18c-13 0-21 10-21 22 0 8 3 14 7 18l-12 24h52L64 58c4-4 7-10 7-18 0-12-8-22-21-22z"/>'+
    '<path class="k" d="M39 40c0-8 5-13 11-13s11 5 11 13-5 15-11 15-11-7-11-15z"/>'+
    '<circle class="b" cx="45.5" cy="40" r="3.2"/>'+
    '<circle class="b" cx="54.5" cy="40" r="3.2"/>'+
    '<path class="l" d="M36 64c5 4 9 10 10 18M64 64c-5 4-9 10-10 18"/>',

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

  // LE GARDE DE PIERRE PORTE SON DÉPLACEMENT SUR LE PLASTRON : l'étoile à huit
  // branches, qui est exactement ce qu'il sait faire — les quatre orthogonales
  // et les quatre diagonales, d'une case. On devine donc son coup en regardant
  // sa case. Il avait deux cadets bâtis sur la même silhouette de sentinelle
  // casquée — le Garde d'Eau à la croix, le Garde de Feu au sautoir — retirés
  // du jeu depuis : l'emblème n'a plus de famille à distinguer, seulement une
  // règle à dire.
  'garde-pierre':
    '<path class="b" d="M23 82l3-35 11-16 13-8 13 8 11 16 3 35z"/>'+
    '<path class="l" d="M37 31l7 21-15 7M63 31l-7 21 15 7M44 52l6 13 6-13"/>'+
    '<circle class="k" cx="41" cy="41" r="3.5"/><circle class="k" cx="59" cy="41" r="3.5"/>',

  // LE PÉGASE : la tête du Cavalier, plus petite, et une aile qui se lève
  // derrière la crinière — c'est un cavalier, en plus loin.
  'pegase':
    '<path class="b" d="M57 55C58 36 69 18 93 7c-1 8-4 13-8 17 5-1 8 0 11 1-4 6-9 10-15 12 4 1 7 3 9 5-6 5-14 8-23 9 3 1 5 2 6 4-5 2-11 2-16 0z"/>'+
    '<path class="l" d="M66 40c7-6 15-12 23-16M68 48c6-3 12-5 18-6"/>'+
    '<path class="b" d="M49.6 23.6l2.4-6.4 4.8 6.4z"/>'+
    '<path class="b" d="M30 82c0-10.4.8-17.6 4-24l-5.6 4c-4.8 3.2-9.6 1.6-10.4-3.2-1.6-5.6 1.6-11.2 6.4-16 4-4 8.8-7.2 12.8-11.2 3.2-3.2 4.8-6.4 5.6-10.4l4.8 4.8 4-4c8 6.4 13.6 16 16 26.4 2.4 10.4 3.2 21.6 3.2 33.6z"/>'+
    '<path class="l" d="M51.6 30.8c4 6.4 7.2 15.2 8 24"/>'+
    '<circle class="k" cx="44" cy="38.4" r="3"/>',

  // LE LOUP GÉANT, de profil : le museau long et les oreilles droites le
  // séparent du chat ou du renard, la collerette de poils du chien.
  'loup-geant':
    '<path class="b" d="M28 82l-5-8 6-1-6-8 7-1-2-6-8-4-10-6-4-5c-2-2-1-6 2-7l20-5 9-9 9-17 6 17 6 1 8-15 4 21c5 6 8 13 8 22l1 14 6 7-5 1 4 7-6 1 3 7z"/>'+
    '<path class="k" d="M31 35l12-5 2 4-11 4z"/>'+
    '<path class="k" d="M6 38c1-3 4-4 7-3l-1 6c-3 0-5-1-6-3z"/>'+
    '<path class="l" d="M12 49c7 3 14 4 20 2M60 47c3 7 4 14 2 21M50 16l3 9"/>',

  // LE SINGE : la face ronde et les deux grandes oreilles, et la queue
  // enroulée qui dépasse du socle.
  'singe':
    '<path class="l" d="M68 76c16 1 21-12 15-19-5-6-13-1-9 5"/>'+
    '<circle class="b" cx="23" cy="36" r="10"/>'+
    '<circle class="b" cx="77" cy="36" r="10"/>'+
    '<circle class="k" cx="23" cy="36" r="4"/>'+
    '<circle class="k" cx="77" cy="36" r="4"/>'+
    '<path class="b" d="M29 82c0-11 9-19 21-19s21 8 21 19z"/>'+
    '<circle class="b" cx="50" cy="38" r="24"/>'+
    '<path class="l" d="M36 38c0-7 6-10 14-5 8-5 14-2 14 5 5 5 5 14-1 19-6 4-20 4-26 0-6-5-6-14-1-19z"/>'+
    '<circle class="k" cx="43" cy="38" r="3.4"/>'+
    '<circle class="k" cx="57" cy="38" r="3.4"/>'+
    '<path class="l" d="M47 47h.5M53 47h.5M44 53c4 3 8 3 12 0"/>',

  // LE BERSERK : le casque à cornes, la fente des yeux, la barbe tressée.
  'berserk':
    '<path class="b" d="M28 27c-9-2-15-10-15-20 8 2 14 8 17 15z"/>'+
    '<path class="b" d="M72 27c9-2 15-10 15-20-8 2-14 8-17 15z"/>'+
    '<path class="b" d="M29 37c0-14 9-22 21-22s21 8 21 22v6H29z"/>'+
    '<path class="b" d="M31 43h38v8c0 7-8 12-19 12s-19-5-19-12z"/>'+
    '<path class="k" d="M37 45h9v4h-9zM54 45h9v4h-9z"/>'+
    '<path class="b" d="M24 82c0-11 10-20 26-20s26 9 26 20z"/>'+
    '<path class="l" d="M43 56l7 6 7-6"/>',

  // LE BOUCHER : trapu, le tablier, et le couperet levé à côté de lui.
  'boucher':
    '<path class="l" d="M60 60l12-25"/>'+
    '<path class="b" d="M64 11h26v21c0 3-2 5-5 5H64z"/>'+
    '<circle class="k" cx="84" cy="18" r="2.8"/>'+
    '<circle class="b" cx="41" cy="25" r="13"/>'+
    '<path class="b" d="M20 82c0-21 9-36 21-36s21 15 21 36z"/>'+
    '<path class="l" d="M31 58h20v24M31 58v24"/>',

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

  // L'OMBRE : la silhouette garde la couleur de son camp ; c'est l'ombre
  // portée, pleine, qui se découpe derrière elle.
  'ombre':
    '<path class="k" d="M44 7c-9 0-15 7-15 15 0 6 3 10 7 13-7 2-12 7-14 14l-5 20c-1 5 2 9 7 9h40c5 0 8-4 7-9l-5-20c-2-7-7-12-14-14 4-3 7-7 7-13 0-8-6-15-15-15z"/>'+
    '<path class="b" d="M56 12c-8.5 0-14 6.5-14 14 0 5.5 2.7 9.4 6.5 12.2-6.5 2-11 6.8-13 13.3l-4.5 19c-1 4.5 1.8 8.5 6.5 8.5h37c4.7 0 7.5-4 6.5-8.5l-4.5-19c-2-6.5-6.5-11.3-13-13.3 3.8-2.8 6.5-6.7 6.5-12.2 0-7.5-5.5-14-14-14z"/>'+
    '<path class="l" d="M49 25h5M58 25h5"/>',

  // L'INFECTÉ : un crâne à l'oeil barré, la bouche recousue, le corps
  // piqué de pustules — ce qu'on attrape en le mangeant.
  'infecte':
    '<path class="b" d="M26 82c0-12 10-19 24-19s24 7 24 19z"/>'+
    '<circle class="l" cx="37" cy="74" r="3"/>'+
    '<circle class="l" cx="60" cy="72" r="2.2"/>'+
    '<circle class="l" cx="50" cy="77" r="1.6"/>'+
    '<path class="b" d="M50 10c14 0 24 10 24 23 0 9-4 15-9 19v10H35V52c-5-4-9-10-9-19 0-13 10-23 24-23z"/>'+
    '<path class="b" d="M70 42c3 4 4 9 2 13-1 3-5 3-5 0 0-3 2-6 1-10z"/>'+
    '<path class="l" d="M35 27l9 9M44 27l-9 9"/>'+
    '<circle class="k" cx="59" cy="32" r="5"/>'+
    '<path class="l" d="M39 50h22M44 46v8M50 46v8M56 46v8"/>',

  // L'ILLUSION : une silhouette encapuchonnée et, derrière elle, son double
  // en pointillé — ce qu'elle laisse sur la case qu'elle quitte.
  'illusion':
    '<path class="l" stroke-dasharray="5 5" d="M40 8c-12 0-20 10-20 22 0 7 2 12 5 16l-8 20c-2 5-3 10-3 14"/>'+
    '<path class="b" d="M58 8c-12 0-20 10-20 22 0 7 2 12 5 16l-8 20c-2 5-3 10-3 14h52c0-4-1-9-3-14l-8-20c3-4 5-9 5-16 0-12-8-22-20-22z"/>'+
    '<path class="k" d="M49 30c0-7 4-12 9-12s9 5 9 12-4 15-9 15-9-8-9-15z"/>'+
    '<path class="l" d="M48 62h20M52 70h12"/>',

  // LE REFLET : la même silhouette, tout en pointillé. Le plateau l'affiche
  // en plus à moitié effacé (.pc-reflet, css/style.css).
  'reflet':
    '<path class="b" stroke-dasharray="6 5" d="M50 8c-12 0-20 10-20 22 0 7 2 12 5 16l-8 20c-2 5-3 10-3 14h52c0-4-1-9-3-14l-8-20c3-4 5-9 5-16 0-12-8-22-20-22z"/>'+
    '<path class="l" d="M38 60h24M42 68h16"/>',
};

// Pièces standard qui remplissent le fond de plateau : elles réutilisent le
// dessin des Primordiales correspondantes, ce sont les mêmes pièces.
const PIECE_ART_ALIAS={
  'std-pawn':'__pawn','std-r':'tour-primordiale','std-n':'cavalier-primordial','std-b':'fou-primordial',
  'dame-promo':'dame','tour-promo':'tour-primordiale','fou-promo':'fou-primordial','cav-promo':'cavalier-primordial',
};

// LE PION : la silhouette d'échecs que tout le monde connaît — c'est ce qui
// le fait lire avant tout le reste —, la tête polie et le col d'or.
PIECE_ART.__pawn=
  '<path class="b" d="M38 41.5h24c0 15 4 27 11 38.5H27c7-11.5 11-23.5 11-38.5z"/>'+
  '<path class="s" d="M54.5 43h6.3c.6 14 4.2 25.4 10.4 36H60.8c-1-13.2-3-25-6.3-36z"/>'+
  '<path class="h" d="M39.6 49c-.5 9.5-3 18.6-7.4 27h3.2c3.6-8.2 5.6-16.6 6.1-27z"/>'+
  '<path class="g" d="M37.5 35.5h25l2.6 6H34.9z"/>'+
  '<circle class="b" cx="50" cy="23.5" r="12.5"/>'+
  '<path class="s" d="M58.6 15a12.5 12.5 0 0 1-12 20.7 11 11 0 0 0 12-20.7z"/>'+
  '<path class="h" d="M42.4 18.6a9 9 0 0 1 6.6-5.2c-3.2 2.2-4.8 4.4-5.4 7.4z"/>';

// LES QUATRE TROUPES (PAWN_ARMIES, js/data-pieces.js) gardent la silhouette
// du pion — ce sont des pions — et se distinguent par la coiffe : le
// chapeau à large bord du mercenaire, le casque à cimier et le bouclier du
// légionnaire, les cornes du barbare.
PIECE_ART['pion-mercenaire']=PIECE_ART.__pawn+
  '<path class="b" d="M26 19h48l-5 5H31z"/>'+
  '<path class="b" d="M37 19c0-8 6-13 13-13s13 5 13 13z"/>'+
  '<circle class="k" cx="50" cy="61" r="4"/>';
PIECE_ART['pion-legionnaire']=PIECE_ART.__pawn+
  '<path class="b" d="M36 18c2-9 8-14 14-14s12 5 14 14c-4-3-9-4-14-4s-10 1-14 4z"/>'+
  '<path class="b" d="M40 50h20v18c0 5-5 9-10 11-5-2-10-6-10-11z"/>'+
  '<path class="l" d="M50 53v22"/>';
PIECE_ART['pion-barbare']=
  '<path class="b" d="M39 20c-7-1-12-7-12-14 6 1 11 5 13 10z"/>'+
  '<path class="b" d="M61 20c7-1 12-7 12-14-6 1-11 5-13 10z"/>'+
  PIECE_ART.__pawn+
  '<path class="l" d="M42 50l8 8 8-8"/>';

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
