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
//   .k  un aplat de contraste (yeux, naseaux, détails) en --pc-line : sombre
//       sur l'ivoire, or pâle sur l'obsidienne
//   .v  un VIDE : creux sous une capuche, porte, fente de heaume, ombre
//       portée. Toujours SOMBRE, dans les deux camps — un .k y deviendrait
//       un masque d'or sur les pièces noires
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
  // À quarante pixels, elle se lit par ce creux barré du bandeau d'or — pas
  // de couronne dressée, c'est ce qui la sépare du Roi et de la Dame. Le
  // voile s'ouvre sous le menton sur la robe, où pend l'ANKH d'or : le signe
  // de vie de sa Réanimation. Chez les noirs, le creux prend la couleur du
  // trait (or pâle) : un visage de lumière sous le voile obsidienne.
  // Elle porte une TIARE à trois fleurons au-dessus du voile : c'est ce
  // qui la sépare du Grand Maître, l'autre silhouette encapuchonnée, et
  // ce qui dit qu'elle est un Monarque.
  'matriarche':
    '<path class="b" d="M39 44h22c.8 12 4.6 22 12.4 30L76 80H24l2.6-6C34.4 66 38.2 56 39 44z"/>'+
    '<path class="s" d="M55.6 52h3c1 9.4 4.4 16.4 10.6 22H60c-.6-8-2-15.4-4.4-22z"/>'+
    '<path class="g" d="M26.4 74.6h47.2l2.4 5.4H24z"/>'+
    '<path class="b" d="M50 8c-12.4 0-21 9.4-21.4 22-.2 7 1.4 13 4.2 18-3.8 7-7.4 13.6-9.6 19.4-.8 2.2-1 4.2-.4 6 3.4 1.6 7.6 1.4 11.2-.4 1.6-7 4.2-12.6 8-16.6 2.2-2.4 4.8-3.6 8-3.8 3.2.2 5.8 1.4 8 3.8 3.8 4 6.4 9.6 8 16.6 3.6 1.8 7.8 2 11.2.4.6-1.8.4-3.8-.4-6-2.2-5.8-5.8-12.4-9.6-19.4 2.8-5 4.4-11 4.2-18C71 17.4 62.4 8 50 8z"/>'+
    '<path class="s" d="M61 14.4c5 3.8 7.6 9.4 7.8 15.8.2 6.8-1.4 12.6-4.2 18 3.8 7 7.2 13.2 9.4 18.8.4 1.2.6 2.2.6 3.2-1.6.4-3.2.4-4.8 0-1.6-7.8-4.2-14.6-7.8-20.6-1.6-2.6-3.4-4.6-5.4-6 3.4-9.4 5.2-19.4 4.4-29.2z"/>'+
    '<path class="h" d="M41 12.6c-5.6 2.6-9 8.4-9.4 16.4-.2 3.8.2 7.4 1.2 10.6l2.4-1c-.8-3-1-6-.8-9.4.4-7 3-12.4 6.6-16.6zM31.8 51c-3 5.8-5.8 11-7.6 15.6l2.6.8c1.8-4.4 4.4-9.2 7.2-14.4z"/>'+
    '<path class="g" d="M37.6 14.6 39.4 5.6l5.2 4.6L50 1.4l5.4 8.8 5.2-4.6 1.8 9c-3.8-1.8-8-2.6-12.4-2.6s-8.6.8-12.4 2.6z"/>'+
    '<circle class="e" cx="50" cy="3.4" r="2"/>'+
    '<path class="t" d="M36.4 56c-2.6 5-4.4 10-5.4 15M63.6 56c2.6 5 4.4 10 5.4 15"/>'+
    '<path class="v" d="M40 33c0-3 4.4-4.8 10-4.8s10 1.8 10 4.8c0 8.4-4.4 14.6-10 14.6S40 41.4 40 33z"/>'+
    '<path class="g" d="M32.5 27.5c3-2.2 6.4-3.8 10-4.6L45.6 18 50 12.6l4.4 5.4 3.1 4.9c3.6.8 7 2.4 10 4.6l-1.2 5.2c-5-3-10.4-4.6-16.3-4.6s-11.3 1.6-16.3 4.6z"/>'+
    '<circle class="e" cx="50" cy="22.4" r="2.6"/>'+
    '<circle class="e" cx="39.6" cy="27.3" r="1.8"/><circle class="e" cx="60.4" cy="27.3" r="1.8"/>'+
    '<path class="g" d="M47.6 62c-2.4-1.4-3.8-3.8-3.8-6.4 0-3 2.8-5.4 6.2-5.4s6.2 2.4 6.2 5.4c0 2.6-1.4 5-3.8 6.4H57v4h-4.6l1 8.6h-6.8l1-8.6H43v-4z"/>'+
    '<ellipse class="b" cx="50" cy="56" rx="1.6" ry="2.2"/>',

  // L'EMPEREUR : la couronne FERMÉE (le dôme et ses trois arceaux d'or)
  // sous le globe crucifère — ce qui le distingue du Roi à quarante pixels :
  // le Roi a une couronne ouverte et dentelée, l'Empereur une coupole lisse
  // surmontée d'une boule. Le manteau carré aux épaules et le collier d'ordre
  // à médaillon lui donnent la carrure impériale.
  'imperator':
    '<path class="b" d="M38 46h24l1.4 5.4c7.6 1.2 12.4 4.6 13.6 9.6L80 80H20l3-19c1.2-5 6-8.4 13.6-9.6z"/>'+
    '<path class="s" d="M64 57.6c5.4 1.4 8.6 3.8 9.6 7.2L76.6 78H66.4c0-7.4-.8-14-2.4-20.4z"/>'+
    '<path class="h" d="M30.4 58.2c-2.6 1.2-4.2 2.8-4.8 5L23.8 74h3l1.8-10.4c.4-1.8 1.6-3 3.4-3.8z"/>'+
    '<path class="g" d="M20.2 74.6h59.6l.2 5.4H20z"/>'+
    '<path class="g" d="M32.2 52.4c5 4.6 11 7 17.8 7s12.8-2.4 17.8-7l2.4 3.6c-5.6 5.4-12.4 8.2-20.2 8.2s-14.6-2.8-20.2-8.2z"/>'+
    '<circle class="g" cx="50" cy="66.4" r="5.6"/>'+
    '<circle class="e" cx="50" cy="66.4" r="2.6"/>'+
    '<path class="b" d="M30 41c0-14 8.6-23 20-23s20 9 20 23z"/>'+
    '<path class="s" d="M58.4 23.4c5.6 4 8.6 9.8 9 15.6H60c0-6-.4-10.8-1.6-15.6z"/>'+
    '<path class="h" d="M41 22.4c-4.6 3.2-7.4 8-8.2 14.6h2.6c.8-5.2 2.8-9.4 6-12.4z"/>'+
    '<path class="g" d="M47.6 18.4h4.8V41h-4.8zM33 41c0-10 5.4-17.6 15-22.4l1.4 3.6c-7.6 4.4-12 10.6-12 18.8zM67 41c0-10-5.4-17.6-15-22.4l-1.4 3.6c7.6 4.4 12 10.6 12 18.8z"/>'+
    '<path class="g" d="M27 40h46l-1 7.5H28z"/>'+
    '<path class="e" d="M46 43.8a4 2.6 0 1 0 8 0 4 2.6 0 1 0-8 0zM34 43.8a2 2 0 1 0 4 0 2 2 0 1 0-4 0zM62 43.8a2 2 0 1 0 4 0 2 2 0 1 0-4 0z"/>'+
    '<path class="g" d="M47.4.6h5.2v3.2h3.6v4.4h-3.6v2h-5.2v-2h-3.6V3.8h3.6z"/>'+
    '<circle class="g" cx="50" cy="14" r="5.4"/>'+
    '<path class="t" d="M44.8 14h10.4"/>',

  // LA DAME : la couronne en éventail dont les cinq pointes portent chacune
  // une PERLE — perles d'ivoire chez les blancs, perles noires chez les
  // noirs. À quarante pixels, ces cinq points ronds largement ouverts (et
  // l'absence de croix) la séparent du Roi ; la taille fine, prise dans la
  // pointe d'or du corsage, et la jupe évasée font le reste.
  'dame':
    '<path class="b" d="M38.5 51h23c.6 10 4.4 17.4 11 22.4 3 2.3 5 4 6 6.6h-57c1-2.6 3-4.3 6-6.6 6.6-5 10.4-12.4 11-22.4z"/>'+
    '<path class="s" d="M56.4 54h3c.7 9 4.2 15.8 10.2 20.6 2.2 1.7 3.6 3 4.4 4.4H64c-.6-10-3-18.4-7.6-25z"/>'+
    '<path class="h" d="M40.4 58c-1.2 7-4.4 12.2-9.6 15.6H35c3.8-3.6 6-8.2 7-14z"/>'+
    '<path class="t" d="M46.4 58.6c-.6 6.6-2.4 11.6-5.4 16M53.6 58.6c.6 6.6 2.4 11.6 5.4 16"/>'+
    '<path class="g" d="M26 74.6h48c1.6 1.5 3 3.2 4 5.4H22c1-2.2 2.4-3.9 4-5.4z"/>'+
    '<path class="b" d="M37.5 37.5h25c-.5 5.4-1.8 9.6-3.4 14H40.9c-1.6-4.4-2.9-8.6-3.4-14z"/>'+
    '<path class="s" d="M55.4 39.4h4.8c-.5 4-1.4 7.4-2.6 10.4h-4.4c1-3.4 1.8-6.8 2.2-10.4z"/>'+
    '<path class="h" d="M40.4 40c.4 3 1.2 5.8 2.2 8.6h2c-.8-2.6-1.4-5.4-1.8-8.6z"/>'+
    '<path class="g" d="M39.4 49.2h21.2l-1.2 4.4-9.4 4.6-9.4-4.6z"/>'+
    '<path class="g" d="M36.5 33 21 18.5l12.5 6 1.5-13 9 9.5 6-14 6 14 9-9.5 1.5 13 12.5-6L63.5 33z"/>'+
    '<path class="g" d="M34.5 31.5h31l-1.2 6.5H35.7z"/>'+
    '<ellipse class="e" cx="50" cy="34.8" rx="3.6" ry="2.3"/>'+
    '<path class="b" d="M16.6 18.5a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0zM30.6 11.5a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0zM45.2 6.6a4.8 4.8 0 1 0 9.6 0 4.8 4.8 0 1 0-9.6 0zM60.6 11.5a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0zM74.6 18.5a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 1 0-8.8 0z"/>'+
    '<path class="h" d="M19.8 17.3a1.1 1.1 0 1 0 .1 0zM33.8 10.3a1.1 1.1 0 1 0 .1 0zM48.7 5.3a1.2 1.2 0 1 0 .1 0zM63.8 10.3a1.1 1.1 0 1 0 .1 0zM77.8 17.3a1.1 1.1 0 1 0 .1 0z"/>',

  // L'AMAZONE : la chasseresse couronnée, l'arc bandé. Arc en croissant
  // plein, et en OR (et non en simple trait) : à 40 px un trait de 3 px
  // disparaît, alors qu'un croissant garde sa silhouette — c'est lui qui la
  // fait lire. La corde tirée en V et la pointe de flèche qui dépasse de
  // l'arc donnent le geste à grande taille ; la tresse équilibre l'arc.
  'amazone':
    '<path class="b" d="M37.4 20.4c-5.8 3-8.6 8.6-8.4 15.2.2 5.4 2.2 9.6 1.4 15.2-.2 1.6-.8 3.2-1.6 4.6 5.6-1.4 9.2-6 10-12 .6-4.6-.6-9 .2-13.4.4-2.6 1.4-5 2.8-7z"/>'+
    '<path class="g" d="M63 7c25.4 12.4 25.4 57.6 0 70 15.6-14.6 15.6-55.4 0-70z"/>'+
    '<path class="t" d="M32.4 30c-.6 4 0 7.6 1.4 11M34 45c.4 2.4.2 4.6-.6 6.6M63 7 54.6 42.4 63 77"/>'+
    '<path class="b" d="M38.6 36.4h12.8c2.6.4 4.2 1.8 4.6 4 .4 3.6-.6 7.2-2.6 11 5.8 7.2 9.6 15.6 11.2 28.6H25.4c1.6-13 5.4-21.4 11.2-28.6-2-3.8-3-7.4-2.6-11 .4-2.2 2-3.6 4.6-4z"/>'+
    '<path class="s" d="M50.6 57c4.4 6 7.4 13 9 21H52c-.2-7.6-.6-14.6-1.4-21z"/>'+
    '<path class="h" d="M37.4 58.4c-3.4 5-5.6 11-7 17.6h2.8c1.2-6 3.2-11.4 6-16z"/>'+
    '<path class="g" d="M36.2 50.4h17.6l-1 4.8H37.2zM25.8 75h38.4l.6 5H25.2z"/>'+
    '<path class="b" d="M52.8 39.6c8 .2 15.8 1 23.6 2.4l-.4 5.6c-7.4-.6-15-1-22.6-1z"/>'+
    '<path class="g" d="M66 40.6l5.6.6-.4 6-5.6-.4z"/>'+
    '<circle class="b" cx="77.4" cy="44.6" r="3.8"/>'+
    '<path class="l" d="M55.4 42.4H83"/>'+
    '<path class="g" d="M82 38.6l7 3.8-7 3.8z"/>'+
    '<circle class="b" cx="45" cy="26.4" r="9.4"/>'+
    '<path class="s" d="M49.6 20.9A7.2 7.2 0 0 1 42.5 33.2 8.4 8.4 0 0 0 49.6 20.9z"/>'+
    '<path class="g" d="M36.4 21.6 35 11.4l5 4 5-6.8 5 6.8 5-4-1.4 10.2z"/>'+
    '<circle class="e" cx="45" cy="17.6" r="2"/>',

  // NYX : une silhouette voilée sous le croissant de lune, deux yeux qui
  // luisent dans le noir du capuchon — la nuit qu'elle jette autour d'elle.
  // Le croissant d'or est penché, en haut à droite, DÉTACHÉ du capuchon :
  // posé à plat sur la tête, il se lisait comme deux cornes. Les deux
  // étoiles d'or en face l'équilibrent ; les points de lumière semés sur le
  // manteau ne se voient que sur l'obsidienne, en ciel étoilé.
  'nyx':
    '<path class="g" d="M68.1 3.7A12.6 12.6 0 1 0 83.3 18.9 10.8 10.8 0 0 1 68.1 3.7z"/>'+
    '<path class="b" d="M50 14c-4.4 2.6-9 4.8-13 8.6-5.4 5-8.2 11.2-8.2 18.6 0 6.4 1.8 11.4 4.8 15.6-4.6 8-9.8 14.6-15 23.2h63.2c-5.2-8.6-10.4-15.2-15-23.2 3-4.2 4.8-9.2 4.8-15.6 0-7.4-2.8-13.6-8.2-18.6-4-3.8-8.6-6-13-8.6z"/>'+
    '<path class="s" d="M60.6 23.6c5.2 4.6 7.8 10.2 7.8 17.6 0 5.8-1.6 10.6-4.4 15 4.4 7.6 9.4 14.2 13.2 20.8H64c-1.6-10.8-4.4-20-8.4-27.6 3.8-8.4 5.4-17 5-25.8z"/>'+
    '<path class="h" d="M39.4 24.4c-4.6 4-7 9.6-7.2 16-.2 4.2.4 7.8 1.8 11l2.4-1c-1-2.8-1.4-6-1.2-9.6.4-6 2.2-10.8 4.2-16.4z"/>'+
    '<path class="l" d="M36 41c0-9.4 6.2-16 14-16s14 6.6 14 16c0 9.2-5 16.2-14 18.2-9-2-14-9-14-18.2z"/>'+
    '<path class="v" d="M38.8 40c0-7.4 5-12.4 11.2-12.4s11.2 5 11.2 12.4c0 8.2-5 15-11.2 15s-11.2-6.8-11.2-15z"/>'+
    '<ellipse class="e" cx="45.4" cy="41" rx="3.2" ry="2.2"/><ellipse class="e" cx="54.6" cy="41" rx="3.2" ry="2.2"/>'+
    '<path class="l" d="M42.4 61.6c-3 6-5.2 12-6.2 18.4M57.6 61.6c3 6 5.2 12 6.2 18.4"/>'+
    '<path class="h" d="M31.4 68.6a1.2 1.2 0 1 0 .1 0zM67.4 64.6a1 1 0 1 0 .1 0zM50 66.4a1.1 1.1 0 1 0 .1 0zM33.4 47a.9.9 0 1 0 .1 0z"/>'+
    '<path class="g" d="M21.4 75h57.2l2.8 5H18.6z"/>'+
    '<path class="g" d="M21 11.6l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9zM31 2.4l1.1 2.8 2.8 1.1-2.8 1.1L31 10.2l-1.1-2.8-2.8-1.1 2.8-1.1z"/>',

  // ---- Généraux (suite) -----------------------------------------
  // LE CENTAURE. Son identifiant ne dit pas son nom, et c'est voulu — la
  // raison est écrite une fois pour toutes dans data-pieces.js, à côté de la
  // pièce. Ce qui le fait lire, c'est la JONCTION : un buste dressé planté à
  // l'avant d'un corps équin. Les deux masses ne font ici qu'UN SEUL contour
  // (le dos de l'homme coule dans le garrot, son ventre dans le poitrail), et
  // la ceinture d'or gemmée marque la soudure — sinon on ne voit qu'un
  // cavalier posé sur une bête. L'arc d'or bandé devant lui en fait un
  // archer d'un coup d'œil ; la jambe avant levée casse la « table à quatre
  // pieds » qu'on lisait à quarante pixels, et la cuisse arrière est taillée
  // dans le même contour que la croupe, comme une vraie patte de cheval.
  'chevaucheur-rhinoceros':
    '<path class="b" d="M21 50c-8 1-11.5 8-10.5 19 2-2.5 4-4.5 6-5.5-1 5 0 10 3 13.5.5-7 1.5-14 4.5-20z"/>'+
    '<path class="b" d="M38 61c.5 6.5 0 13 .5 19H46c-.5-6.5-1-13 0-18.5zM57 62c.5 6.5.8 12 .5 18H65c.5-6.5.5-12-.5-18.5z"/>'+
    '<path class="s" d="M40.9 67h2l.1 10.5h-2z"/>'+
    '<path class="b" d="M62.5 58.5c4 4 8.5 6.5 12 8 2.8 1.6 3 4.3 1.2 6.4l-5.2 4.6-4.2-2.8 4.2-3.8c-3.6-1.5-8-3.6-11-6.2z"/>'+
    '<path class="b" d="M24 45.5C32 43 41.5 43 50.5 43.5 53 39.5 53 35.5 52 30.5 52 26.5 55 24 59.5 23.5H66.5C71 24 74.5 26.5 74.5 30.5 74 35 72 39.5 71.5 43.5 75 47 76 52.5 74.5 57.5 72 63 67 66 60.5 66.5H48C43 66.5 39.5 66 37.5 65 36 68 34.5 70.5 35 73.5L37 80H29L28 75.5C25 73.5 22.5 70.5 21.5 67 17 64.5 15 59.5 15.5 53.5 16 48.5 19.5 45.5 24 45.5z"/>'+
    '<path class="s" d="M40.5 62C43.5 63 46.5 63.5 50 63.5H60C65.5 63.5 69.5 61 71.5 57.5 71 61.5 66.5 64.3 60 64.5H50C46.5 64.5 43.5 64 40.5 62z"/>'+
    '<path class="h" d="M20.5 52c2.5-2.5 6.5-4 11-4.5-3.5 1.2-7 3-9 5.5zM54.8 30.5c.2-1.6 1.3-2.6 3.3-3-1.1 2.2-1.6 5-1.6 8.5h-1.6z"/>'+
    '<path class="g" d="M57.5 8c-7 0-10 8-7.5 18 2-3 4-5 6.5-6 .5-4 2-8 5-10z"/>'+
    '<path class="b" d="M55.5 15.5c0-4.5 3-7.5 7-7.5s6.5 3 6.5 6.5l1.5 2.8-1.8 1c-.3 3-2.8 5-6.2 5-4 0-7-3-7-7.8z"/>'+
    '<path class="k" d="M64 13.5c1-.8 2.5-.8 3.4 0-1 1-2.4 1-3.4 0z"/>'+
    '<path class="t" d="M57.5 34.5c3.5 1.6 7.5 1.6 11 0"/>'+
    '<path class="g" d="M51 41h21l.5 5.5H50.5z"/>'+
    '<circle class="e" cx="61.8" cy="43.8" r="2.4"/>'+
    '<path class="g" d="M77 7.5c11 9.5 11.5 39 0 49l-3-3c8.5-10 8.5-34 0-43z"/>'+
    '<path class="t" d="M75.5 10v44"/>'+
    '<path class="b" d="M70.5 27.5c4 .2 7.5.8 10.5 1.6a3.2 3.2 0 0 1 0 6.3c-3.5-.4-7-.6-10.5-.9z"/>',

  // LE GRAND MAÎTRE : l'archimage encapuchonné qui tient l'orbe. Le visage
  // est un VIDE (classe .k) et non un contour : c'est ce creux sous la
  // capuche qui fait lire le personnage encapuchonné, et le liseré d'or qui
  // le cerne en fait un mage et non un moine. Pas d'yeux dans le vide : les
  // yeux qui luisent sous un capuchon, c'est Nyx. L'orbe est plus gros
  // qu'une gemme parce qu'il EST la pièce ; les deux mains le portent,
  // sorties de manches à revers d'or. La pointe de la capuche retombe en
  // arrière, en coule, plutôt que de se dresser en cône.
  'grand-maitre':
    '<path class="b" d="M61 4.5C50 3.5 38 10 33.5 21 30.5 28 30 37 31 44 26 47 23 52 22 58 21 66 19.5 73 16.5 80H83.5C80.5 73 79 66 78 58 77 52 74 47 69 44 71 37 70.5 29 68 22.5 66.5 18.5 64.5 15.5 62 13 64 11 64.5 7.5 61 4.5z"/>'+
    '<path class="s" d="M61 15.5c2.5 3 4 6 5 9.5 1.5 6 1.5 13 .5 19.5 5 3 8 7.5 9 14 1 7.5 2.5 14 5 19H66c0-13-3-23-6-32.5 4-10 4.5-20 1-29.5z"/>'+
    '<path class="h" d="M34.2 25c2-5 5.8-9.5 10.8-13-3.5 5-6 9.5-7 14.5z"/>'+
    '<path class="g" d="M50 14c9.5 0 15 8 15 18 0 10.5-6.5 18-15 18s-15-7.5-15-18c0-10 5.5-18 15-18z"/>'+
    '<path class="v" d="M50 19c6 0 9.8 5.5 9.8 13S56 45.2 50 45.2 40.2 40 40.2 32 44 19 50 19z"/>'+
    '<path class="s" d="M42 29c1-5 4-7.5 8-7.5s7 2.5 8 7.5c-2.5-2-5-3-8-3s-5.5 1-8 3z"/>'+
    '<path class="b" d="M31 45c-5 7-4.5 15.5 1 21.5l11.5.5 1-9.5c-6-1.5-10.5-6-13.5-12.5z"/>'+
    '<path class="b" d="M69 45c5 7 4.5 15.5-1 21.5l-11.5.5-1-9.5c6-1.5 10.5-6 13.5-12.5z"/>'+
    '<path class="g" d="M38.5 56.5l7 1.5-1 9.3-7.5-.3zM61.5 56.5l-7 1.5 1 9.3 7.5-.3z"/>'+
    '<path class="b" d="M44 58.5c-1.5 4 .5 7.5 5 7.5h2c4.5 0 6.5-3.5 5-7.5z"/>'+
    '<circle class="e" cx="50" cy="55" r="7"/>'+
    '<circle class="h" cx="47.8" cy="52.8" r="1.6"/>'+
    '<path class="t" d="M40.5 67.5c-2 3-3.5 5.5-4.5 8M59.5 67.5c2 3 3.5 5.5 4.5 8"/>'+
    '<path class="g" d="M19.8 75.5h60.4l2 4.5H17.8z"/>',

  // ---- Primordiales ----------------------------------------------
  // Les trois Primordiales sont AUSSI le cavalier, le fou et la tour des
  // variantes classiques (std-n, std-b, std-r, PIECE_ART_ALIAS) et des
  // blasons de clan : elles doivent se lire d'instinct comme les pièces
  // d'échecs que tout le monde connaît — l'apparat vient en plus, jamais à
  // la place de la silhouette.

  // LE CAVALIER : la tête de cheval de profil, tournée à gauche comme au jeu
  // classique, les deux oreilles dressées et la bouche entrouverte. La
  // crinière d'or dentelée qui déborde de l'encolure le signe à quarante
  // pixels ; la bride d'or (muserolle et montant) se rejoint sur une rosette
  // gemmée à la commissure. L'œil est placé haut, en avant du montant, pour
  // que la bride ne le mange pas.
  'cavalier-primordial':
    '<path class="g" d="M47 8c10-4 22-1 29 7l-2.5 3c6 4 10 11 10.5 18l-4 .5c4.5 5 6 12 5.5 19l-4-1c3 5.5 3.5 12 1.5 18L78 70 62 40z"/>'+
    '<path class="b" d="M46.5 10.5l5-7.5 4 8z"/>'+
    '<path class="b" d="M28.5 80c-.5-9 1.5-16.5 8-22.5-3.5-1-8.5-2.5-13.5-4-4-.7-7-2.5-8-5.5l6.5-1.5-7.7-2c-.8-3.5-.2-6.5 2.2-9 4-5 9-10.5 13.5-16 3-4 6.5-7 10.5-8.5l5-8.5 5.5 7.5c9.5 0 18.5 5 23.5 14 4.5 8 5.5 21 5 33-.3 8-1.5 15-2.5 23z"/>'+
    '<path class="s" d="M66 21c5.5 5.5 9 13 10 23 .7 10 0 20-1.5 30.5h-5.5c1.5-10 2.5-20 1.5-30-1-9-2.5-16-4.5-23.5z"/>'+
    '<path class="h" d="M38 15.5c-4 2.5-8 7-11.5 12 4-3 8-6.5 12-9z"/>'+
    '<path class="s" d="M39 54c4.5-3.5 7-9 7-16 2.5 6.5 2 13.5-3 18.5z"/>'+
    '<path class="k" d="M32.5 23.8c1.6-4 5.6-6.4 9.8-5.4-.8 4.2-5 6.8-9.8 5.4z"/>'+
    '<path class="k" d="M16.5 42c-.3-3.3 1.7-5.6 4.8-5.6-.2 3-2 5.2-4.8 5.6z"/>'+
    '<path class="g" d="M23.5 27.5l5-4.2 3.8 32.2h-5.2z"/>'+
    '<path class="g" d="M49 11l4.5 2.5L31.5 46.5l-3.8-2.8z"/>'+
    '<circle class="e" cx="29.6" cy="45" r="3.4"/>'+
    '<path class="g" d="M29.7 74.5h46.9l-.6 5.5H29z"/>',

  // LE FOU : la mitre fendue. La fente en biais, cernée d'or, est ce qui le
  // sépare du pion à quarante pixels ; elle reste DANS la mitre (une fente
  // qui déborde se lit comme une lance plantée). La gemme en fleuron au
  // sommet, le col d'or, et rien de plus : c'est la silhouette qui compte.
  'fou-primordial':
    '<path class="b" d="M41 59h18c0 8.5 4.5 14.5 12.5 21h-43c8-6.5 12.5-12.5 12.5-21z"/>'+
    '<path class="s" d="M55 62h2c.8 7.5 4.5 12 10 16h-6.5c-3-4.5-5-9.5-5.5-16z"/>'+
    '<path class="h" d="M42.6 65.5c-.8 5-3 9-6.8 12.5h3c3.4-3.4 5-7.2 5.5-12z"/>'+
    '<path class="g" d="M38 55h24l2 5H36z"/>'+
    '<path class="b" d="M50 13c11 8 18 18 18 29 0 9-7 13.5-18 13.5S32 51 32 42c0-11 7-21 18-29z"/>'+
    '<path class="s" d="M58.5 23.5c4.5 5 6.5 11.5 6.5 18.5 0 6.5-4.5 10-11 11 4-4 5.5-8 5.5-14 0-5-.5-10.5-1-15.5z"/>'+
    '<path class="h" d="M45 20c-4 4-8 10-9.5 16 2-4 5-8 9-12z"/>'+
    '<path class="g" d="M64 28.9 44.6 44.6l3.4 5.6 19.6-12.6z"/>'+
    '<path class="k" d="M65.6 31.4 47.2 45.8l1.4 2 19-12.2z"/>'+
    '<path class="g" d="M44 14.5c1-3.5 3.2-5 6-5s5 1.5 6 5z"/>'+
    '<circle class="e" cx="50" cy="7.5" r="4.2"/>',

  // LA TOUR : les créneaux d'abord — c'est la tour de tous les jeux
  // d'échecs. Le bandeau d'or à mâchicoulis sous les merlons, la porte
  // cintrée d'or et sa gemme en clef de voûte, l'ourlet d'or au pied, les
  // joints de pierre en trait fin (pour la fiche seulement). Une herse dans
  // la porte a été essayée : à petite taille elle dessinait un bonhomme.
  'tour-primordiale':
    '<path class="b" d="M32 35h36l1.5 33.5c0 3.5 3 7 7.5 12H23c4.5-5 7.5-8.5 7.5-12z"/>'+
    '<path class="s" d="M58 37.5h8l1.4 31c.3 2 1.3 4 2.6 6H61.5c-1.3-1.8-2.2-3.8-2.5-6z"/>'+
    '<path class="h" d="M35 38h3l-1.2 30h-3z"/>'+
    '<path class="t" d="M33 45h34M32.5 57h35"/>'+
    '<path class="b" d="M23 8h11v7h8V8h16v7h8V8h11v20.5H23z"/>'+
    '<path class="s" d="M68.5 10.5h6v15.5H61v-8.5h7.5z"/>'+
    '<path class="h" d="M25.5 10.5h3v15h-3z"/>'+
    '<path class="v" d="M48.6 12.5h2.8v8h-2.8z"/>'+
    '<path class="g" d="M22 28h56l-7 7.5H29z"/>'+
    '<path class="v" d="M34.5 32h2.6v3.5h-2.6zM43.5 32h2.6v3.5h-2.6zM53.9 32h2.6v3.5h-2.6zM62.9 32h2.6v3.5h-2.6z"/>'+
    '<path class="g" d="M41 75V61a9 9 0 0 1 18 0v14z"/>'+
    '<path class="v" d="M45 75V61.5a5 5 0 0 1 10 0V75z"/>'+
    '<circle class="e" cx="50" cy="47" r="2.6"/>'+
    '<path class="g" d="M25.5 74.5h49l4 5.5h-57z"/>',

  // ---- Brutes --------------------------------------------------
  // LA FOURMI : une fourmi géante de profil, la tête portée en avant et
  // basse, comme une fourmi qui avance (dressée, elle se lisait comme un
  // oiseau) — les trois masses (tête, thorax, gros abdomen) et les pattes
  // coudées, genou haut, la font lire à quarante pixels. Les antennes d'or
  // partent du FRONT et se coudent (c'est la signature de la fourmi), les
  // mandibles d'or se ferment en tenaille sous la tête ; la perle d'or de la
  // taille et l'œil gemme en font une bête d'apparat.
  'fourmi':
    '<path class="l" d="M36 46 31 57 30 69 27.4 79M44 48 56.6 57 60.4 69 64 79"/>'+
    '<path class="b" d="M45.6 50.9L59.4 64.7L70.1 74.2L76.2 81L79.8 78L73.9 70.6L63.4 60.5L50.4 46.3z"/>'+
    '<ellipse class="b" cx="70" cy="52.4" rx="17.4" ry="13.2" transform="rotate(18 70 52.4)"/>'+
    '<path class="s" d="M83 47.4c2.6 7.2-1 14.8-9.2 17.8-5.6 2-11.2 1.6-15.6-.8 7.2.8 14.8-1.6 19.8-6.6 3-3 4.8-6.8 5-10.4z"/>'+
    '<path class="h" d="M58.6 44.8c3.6-3.4 8.2-5 13.2-4.8-4.2 1.4-7.8 3.2-10.4 6.2z"/>'+
    '<path class="l" d="M65 40.8c-2.6 6.2-2.8 13.8.2 21.2M74.8 43.2c-2.6 6-2.6 12.8.2 19.2"/>'+
    '<circle class="g" cx="54.4" cy="48.4" r="4.2"/>'+
    '<ellipse class="b" cx="41" cy="40.6" rx="13" ry="8" transform="rotate(16 41 40.6)"/>'+
    '<path class="b" d="M40.3 49L47.8 58.7L45.9 70L48.3 80L52.9 79L51.3 70L54.2 57.3L45.7 45zM32.5 43.7L23.6 53.6L21.8 67.2L20.3 79.2L24.9 79.8L27 68L29.2 56.4L37.5 48.3z"/>'+
    '<path class="g" d="M23.9 31.2C24.5 30 26.1 26.3 27.5 24.3C29 22.3 31.6 20.9 32.3 19.2C33.1 17.5 32.9 15.8 32.3 14.3C31.6 12.8 29.9 11 28.5 10C27 9 24.2 8.6 23.4 8.3L22.2 11.7C22.9 11.9 25.3 12.5 26.3 13.2C27.4 13.8 28.2 15 28.5 15.7C28.9 16.4 29.2 16.6 28.5 17.6C27.7 18.6 25.5 19.8 24.1 21.7C22.6 23.5 20.4 27.6 19.7 28.8zM19.9 31.9C20.2 30.6 20.8 26.5 21.5 24.1C22.2 21.7 23.8 19.6 24.1 17.7C24.4 15.8 24.3 14.3 23.3 12.9C22.3 11.6 20.2 10.4 18.3 9.6C16.4 8.9 13 8.6 12 8.4L11.2 12C12.2 12.2 15.4 12.6 16.9 13.2C18.3 13.7 19.4 14.4 19.9 15.1C20.4 15.7 20.4 15.8 19.9 17.1C19.5 18.4 18.1 20.4 17.3 22.7C16.5 25 15.6 29.5 15.3 30.9z"/>'+
    '<path class="g" d="M8.4 10.2a3 3 0 1 0 6 0 3 3 0 1 0-6 0zM19.8 10a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 1 0-5.6 0z"/>'+
    '<path class="g" d="M15.2 42.8C14.5 43.8 11.9 46.7 11.1 48.9C10.3 51.2 9.9 54.3 10.4 56.1C10.8 57.9 13.4 59 14 59.6C14.5 60.1 15.4 60.1 16 59.6C16.5 59.1 16.5 58.2 16 57.6C15.7 57.2 14.1 56.2 14 55.1C14 54 14.7 52.5 15.7 51.1C16.7 49.6 19.3 47.2 20 46.4z"/>'+
    '<ellipse class="b" cx="22.4" cy="36" rx="12.6" ry="10.4" transform="rotate(-28 22.4 36)"/>'+
    '<path class="s" d="M33.2 31.4c.8 4.6-.8 9-4.4 12-3.4 2.8-7.8 4-12 3.4 4.8-1.6 8.8-4.4 11.6-8 2.2-2.4 3.8-4.8 4.8-7.4z"/>'+
    '<path class="h" d="M14.4 34.6c1.6-4 4.8-7 9-8.6-2.8 2.4-4.6 5-5.6 8.2z"/>'+
    '<path class="g" d="M12.9 38C12 38.7 8.6 40.5 7.1 42.4C5.6 44.2 4.1 47.1 4 49.1C3.9 51 6.1 53.1 6.5 54C6.8 54.7 7.6 55 8.4 54.7C9.1 54.4 9.4 53.6 9.1 52.8C8.9 52.3 7.7 50.5 8 49.3C8.3 48.2 9.5 47 10.9 46C12.2 45 15.4 43.7 16.3 43.2z"/>'+
    '<ellipse class="e" cx="24.6" cy="34" rx="2.9" ry="3.8" transform="rotate(-28 24.6 34)"/>',

  // LE PREUX CHEVALIER : le grand heaume à fente et le BOUCLIER EN AMANDE
  // frappé de la croix d'or — c'est la croix sur l'écu qui le fait lire à
  // quarante pixels, le heaume dit qu'il y a un homme derrière. L'écu est
  // large et passe DEVANT le corps : on ne voit du chevalier que ce qui
  // dépasse du bouclier.
  'preux-chevalier':
    '<path class="b" d="M20 52c0-8 5.5-13 13-13.5h34c7.5.5 13 5.5 13 13.5l2.5 28h-65z"/>'+
    '<path class="s" d="M63 42h4c5 .5 9 4 9.6 10l2.4 26H67z"/>'+
    '<path class="b" d="M36.5 17.5C36.5 10 42 5.5 50 5.5s13.5 4.5 13.5 12V38c0 2.4-1.6 4-4 4h-19c-2.4 0-4-1.6-4-4z"/>'+
    '<path class="s" d="M55.5 9.4c3.8 1.6 5.4 4.4 5.4 8.2v20.8h-4.6z"/>'+
    '<path class="h" d="M39.4 17.6c0-3.6 1.8-6 5.6-7.6-2.2 2.2-3 4.6-3 7.8v12.4h-2.6z"/>'+
    '<path class="v" d="M39.4 22h8.2v4.2h-8.2zM52.4 22h8.2v4.2h-8.2z"/>'+
    '<path class="g" d="M47.4 6.4h5.2v35.2h-5.2z"/>'+
    '<path class="b" d="M24 38.5c8.6-3 17.4-4.4 26-4.4s17.4 1.4 26 4.4c0 19-8 33-26 43-18-10-26-24-26-43z"/>'+
    '<path class="s" d="M53.6 38.4c6.4.4 12.4 1.6 18.6 3.2-.6 15.4-7.4 27.6-21.6 36.2z"/>'+
    '<path class="h" d="M27.6 41.6c3.6-1 7.2-1.8 10.8-2.4-4 1.6-6.6 3.4-7.6 5.8.2 7 1.6 13.2 4.4 18.8h-3.2c-2.8-5.4-4.2-12.2-4.4-22.2z"/>'+
    '<path class="t" d="M29.2 42.2c6.8-2 13.8-3 20.8-3s14 1 20.8 3c-.6 15.6-7.4 27.2-20.8 35.6-13.4-8.4-20.2-20-20.8-35.6z"/>'+
    '<path class="g" d="M46.6 38.6h6.8v10.2H68v6.8H53.4v17.8c-1.1 1.2-2.2 2.2-3.4 3.2-1.2-1-2.3-2-3.4-3.2V55.6H32v-6.8h14.6z"/>'+
    '<circle class="e" cx="50" cy="52.2" r="3.3"/>',

  // L'ÉLÉPHANT DE GUERRE, de profil, la trompe pendante et la TOUR DE GUERRE
  // crénelée sur le dos : la tour dit à la fois la bête de bataille et son
  // déplacement de tour (il file droit et écrase tout ce qui se trouve sur
  // son passage). À quarante pixels on lit la tête à grande oreille, la
  // trompe et la tour ; la défense d'or, le frontal d'or serti et la sangle
  // d'or en font une monture d'apparat. Il était dessiné de face, oreilles
  // en éventail : de face, la trompe se perdait entre les pattes et la tête
  // se lisait comme une capuche.
  'dresseur-elephant':
    '<path class="b" d="M54 57h9.6l.4 23H53.6zM76.4 55h8.4l.6 25h-9z"/>'+
    '<path class="s" d="M56 59h5.6l.2 19h-5.8zM78.4 57.4h4.4l.4 20.6h-4.8z"/>'+
    '<path class="b" d="M38 41c4-9 14.4-14 26-14 13.4 0 22.4 8.4 22.4 21 0 8.6-3.4 14.4-9.2 17.4L45 66.4c-6-1.4-9-6.4-9-12.6z"/>'+
    '<path class="s" d="M74.4 32.8c5.4 3.6 8.2 8.8 8.2 15.4 0 7-2.8 11.6-7.4 13.8H59c9.2-3.4 14.4-14.8 15.4-29.2z"/>'+
    '<path class="b" d="M41.6 57.6h14l-.6 22.4H41.2zM64.6 57.6h13.6l.6 22.4H64.4z"/>'+
    '<path class="b" d="M54.4 33V15.4h-1.8V7.4h7v4.6h3.4V7.4h7v4.6h3.4V7.4h7v8h-1.8V33z"/>'+
    '<path class="s" d="M70.6 15.6h4.6V31h-4.6z"/>'+
    '<path class="k" d="M61.6 19.6h4.6V27h-4.6z"/>'+
    '<path class="g" d="M50.6 31.4h29.8l-1.4 5.8H52z"/>'+
    '<path class="b" d="M45 39c-3-8.6-11-14-20-13.4C15.8 26.2 10 33 10.6 42c.4 6.4 4 11.6 9.4 14.6L37 61c5.4-3 8.6-8.6 8.4-14.8z"/>'+
    '<path class="b" d="M11.6 41.1C11.1 42.9 9 48.2 8.4 51.7C7.8 55.1 7.6 58.7 8 61.9C8.5 65.1 9.3 68.7 11.1 70.8C13 73 16.9 74.9 19.2 74.9C21.5 74.9 23.9 71.4 24.8 70.7C26.1 69.7 26.3 67.8 25.3 66.6C24.3 65.3 22.4 65.1 21.2 66.1C20.8 66.5 19.5 68.3 18.8 68.3C18.2 68.3 17.6 67.5 17.3 66.4C16.9 65.2 16.6 63.3 16.8 61.3C17 59.3 17.4 56.9 18.4 54.3C19.5 51.8 22.4 47.4 23.2 46.1z"/>'+
    '<path class="g" d="M25.4 52.6c-5.4 2.6-11.4 2.6-17-.2 1.6 5.8 9 9.2 17.4 7z"/>'+
    '<path class="b" d="M33.6 31.4c8.4-4.2 18-1 19.8 9 1.6 9.6-2.4 18.6-10 22.4-3.6 1.8-7.4 0-8.4-4-1.8-8.6-2.8-17.6-1.4-27.4z"/>'+
    '<path class="s" d="M38.4 35.4c5.2-1.8 10 1 11 7 .8 6.4-1.6 12.4-6.4 15.4-1.4.8-3-.2-3.4-1.6-1.4-6.6-2-13.6-1.2-20.8z"/>'+
    '<path class="g" d="M15.6 31.4c4.4-3.4 10-4.6 15.4-3.4l-1.4 10.6c-2 3-5.2 4.8-8.6 5.2-2.6-3.8-4.4-8-5.4-12.4z"/>'+
    '<circle class="e" cx="22.8" cy="35.4" r="3"/>'+
    '<circle class="k" cx="27.2" cy="45.8" r="2.3"/>',

  // LE GARDE DE PIERRE PORTE SON DÉPLACEMENT SUR LE PLASTRON : l'étoile d'or
  // à huit branches, qui est exactement ce qu'il sait faire — les quatre
  // orthogonales et les quatre diagonales, d'une case. On devine donc son coup
  // en regardant sa case. Il avait deux cadets bâtis sur la même silhouette de
  // sentinelle — le Garde d'Eau à la croix, le Garde de Feu au sautoir —
  // retirés du jeu depuis : l'emblème n'a plus de famille à distinguer,
  // seulement une règle à dire. Le golem est taillé à FACETTES (traits droits,
  // épaules en blocs, poings de rocher), la tête basse rentrée entre les
  // épaules sous un sourcil de pierre : c'est la pierre qui le fait lire.
  // L'étoile est une rose des vents à branches larges, pour rester une étoile
  // à quarante pixels et non une tache.
  'garde-pierre':
    '<path class="b" d="M31 60h15l1 20.5H29zM54 60h15l2 20.5H53z"/>'+
    '<path class="s" d="M64.4 62.4h2.4l1.6 15.8h-3.6z"/>'+
    '<path class="b" d="M25 27l8-7h34l8 7-2 20-8 15H35l-8-15z"/>'+
    '<path class="s" d="M62 23.4h4l5.6 5-1.8 17.6-7 13H58c4.6-12 6-23 4-35.6z"/>'+
    '<path class="b" d="M11.5 32l7-9.5h10l5 8.5-2 13 1.6 13-2.6 9.8H19l-5.2-9.2 1.6-12.4z"/>'+
    '<path class="h" d="M16.2 32.8l4.2-5.8H26l-4.4 6-1 9.4h-2.8zM36.8 27l3.4-2.8h4.6l-4 3.8-1.8 14.6h-2.4z"/>'+
    '<path class="b" d="M88.5 32l-7-9.5h-10l-5 8.5 2 13-1.6 13 2.6 9.8H81l5.2-9.2-1.6-12.4z"/>'+
    '<path class="s" d="M82 26.2l3.2 5.8-2.6 11.6 1.4 11.2-3.2 7h-3.8l-1.6-6.6 1.6-12.4-1.6-11.6z"/>'+
    '<path class="t" d="M73 34.6l4 2.6 1.4 4.6M37 54l4-3.4-.8-4.6M69 40.4l-4.4 2.4M38.4 64.4l2.2 3.6-1.8 3.4"/>'+
    '<path class="g" d="M14.2 50.6h18.4l.4 5.2H14.6zM67.4 50.6h18.4l-.4 5.2H67z"/>'+
    '<path class="b" d="M42 9.6l5.6-3h6.8l5.6 3 2.4 8.4-2.2 9.2H41.8L39.6 18z"/>'+
    '<path class="s" d="M55.8 10.4l2.6 1.2 1.6 6.4-1.6 6.6h-2.6c.8-4.8.8-9.4 0-14.2z"/>'+
    '<path class="l" d="M42.4 15.8l6.6 2.6h2l6.6-2.6"/>'+
    '<circle class="e" cx="45.6" cy="21.2" r="2.3"/>'+
    '<circle class="e" cx="54.4" cy="21.2" r="2.3"/>'+
    '<path class="g" d="M50 27.4L52.4 37.5L58.2 35.2L55.9 41L66 43.4L55.9 45.8L58.2 51.6L52.4 49.3L50 59.4L47.6 49.3L41.8 51.6L44.1 45.8L34 43.4L44.1 41L41.8 35.2L47.6 37.5z"/>'+
    '<circle class="e" cx="50" cy="43.4" r="2.9"/>',

  // LE PÉGASE : la tête du Cavalier, un peu plus petite, et une grande aile
  // qui se lève derrière la crinière — c'est un cavalier, en plus loin.
  // L'aile est pleine, à quatre rémiges en festons, et son bras est d'or :
  // c'est elle qui le sépare du Cavalier à quarante pixels. La crinière reste
  // d'ivoire ou d'obsidienne (la crinière d'or est au Cavalier) ; la bride
  // d'or sertie dit la monture d'apparat.
  'pegase':
    '<path class="b" d="M56 54C55 34 63 16 85 1.6c1.4 4.6.6 9.2-2.4 13.2 4.4-.6 8.2.2 11.4 2.2-1.6 4.6-5.4 8-10.8 10.2 3.6.4 6.6 1.8 8.8 4-3.6 4.4-9 6.8-15 7.4 2.8 1.4 4.8 3.4 5.8 6-5.2 2.8-11.2 3.6-17 3z"/>'+
    '<path class="l" d="M81.4 16.4c-6.6 3-12.4 7.8-17 14M83.4 29.8c-6.6 1.2-12.4 4.4-16.6 9.4M77.4 42.2c-4.8 0-9.2 1.4-12.6 4.4"/>'+
    '<path class="g" d="M56.2 48.6C56.4 31 64.6 15.4 84.4 3.4c-1 3.4-3 6-5.6 8.2-8.4 6.8-14.6 16.6-17.8 28.4-.8 3-1.4 5.8-1.8 8.6z"/>'+
    '<path class="b" d="M31 80c-.4-9 1.4-16 6.6-22-3.2-.8-7.6-2.2-11.8-3.6-3.6-.6-6.2-2.2-7-4.8l5.6-1.4-6.8-1.8c-.6-3 0-5.8 2-8 3.6-4.4 7.8-9.2 11.8-14 2.6-3.4 5.8-6 9.2-7.4l4.4-7.4 4.8 6.6c8.4 0 16.2 4.4 20.6 12.2 4 7 4.8 18.4 4.4 28.8-.2 7-1.2 13.2-2.2 20.2z"/>'+
    '<path class="s" d="M59.6 29.2c4.6 5 7.6 11.6 8.4 20.2.6 8.8 0 17.4-1.2 26.4h-4.8c1.2-8.8 2-17.6 1.2-26.2-.8-7.6-2-14-3.6-20.4z"/>'+
    '<path class="h" d="M36.4 23.8c-3.4 2.2-7 6-10 10.4 3.4-2.6 7-5.6 10.4-7.8z"/>'+
    '<path class="s" d="M37.4 56.4c4-3 6.2-7.8 6.2-14 2.2 5.6 1.8 11.8-2.6 16.2z"/>'+
    '<path class="l" d="M50.6 22.4c5 4.8 8.4 12.2 9.6 21.4M48.6 30.4c3.2 4.6 5 10 5.6 16"/>'+
    '<path class="k" d="M19.4 46.6c-.2-2.8 1.4-4.8 4.2-4.8-.2 2.6-1.8 4.4-4.2 4.8z"/>'+
    '<path class="b" d="M46.6 18.6l4-6.8 3.6 7z"/>'+
    '<path class="g" d="M45 20.6l3.4 2-17.2 25.8-3-2.2z"/>'+
    '<path class="g" d="M23.2 31.8l3.8-3.2 3 24.4h-4z"/>'+
    '<path class="k" d="M35.2 25.4c1.2-3.4 4.2-5.2 7.6-4.6-.8 3.4-3.8 5.4-7.6 4.6z"/>'+
    '<circle class="e" cx="29.2" cy="47.4" r="3.1"/>',

  // LE LOUP GÉANT, de profil : le museau long et les oreilles droites le
  // séparent du chat ou du renard, la collerette de poils (les mèches en
  // pointe sur la nuque et le poitrail) du chien. L'œil qui luit sous
  // l'arcade et le collier d'or serti en font une bête de guerre ; à
  // quarante pixels, c'est une tête de cavalier hérissée, cerclée d'or.
  'loup-geant':
    '<path class="b" d="M55 21 63 4.5c4 6 6.5 13 7 22z"/>'+
    '<path class="b" d="M9 38.5C16 34 26 30 34 27.5c2-2.5 4-4.5 6.5-6L47 3.5c5 5.5 8 11.5 10 17.5 5 .5 9 3 11.5 7L74 31c3.5 3 5.5 6.5 6.5 10.5l-4.5 1c3 3.5 5 7.5 5.5 11.5l-4.5.5c2.5 4 3.5 8.5 3.5 13l-3.5-.5c.5 4.5 1 9 1.5 13H28c-1.5-2.5-2.5-5-3-7.5l4.5-.5c-3-1.5-5.5-4-7-7l6.5-.5c-2.5-1.5-4.5-4-5.5-6.5l7.5-.5-.5-5.5c-6 0-12-1-15.5-3l-1-1.5 13-2.5-13.5-1c-3-.5-5.5-2.2-5.5-4.5 0-.8.2-1.5.5-2z"/>'+
    '<path class="s" d="M66 31c4 9 7 21 8 31v15H64c2-15 2-31-2-44z"/>'+
    '<path class="h" d="M14 37.2c6-3.2 13-5.7 19.5-7.7 2-2.5 4-4.5 6-5.7l1 1.7c-2 1.5-3.7 3.5-5.5 5.5-7 2-14 4.5-20 7.6z"/>'+
    '<path class="s" d="M44.5 19 47.5 9c2.5 3.5 4.5 7 5.5 11.5z"/>'+
    '<path class="l" d="M57.5 26.5c.5 4-1 7.5-4 10M57 39c-1.5 4-4.5 7-8.5 9.2M52 50.5c-3 3-7.5 4.6-12.5 5.2"/>'+
    '<path class="k" d="M8.3 37.8c2.2-1.3 5.2-1.2 6.7.6-.4 2.2-2.2 3.4-4.2 3.4-1.6-.2-2.6-1.6-2.5-4z"/>'+
    '<path class="k" d="M34 28.5c4-2.5 9-2.9 13.5-1.2l-.8 1.6c-4.2-1.1-8.4-.5-11.7 1.5z"/>'+
    '<path class="e" d="M35.5 31.8c2.5-2.8 7-3.2 10.5-1.8-2.5 3-6.5 4-10.5 1.8z"/>'+
    '<path class="t" d="M60 46c3 5 4 10 3 15M52 54c2 3 2.5 6 2 8.5"/>'+
    '<path class="g" d="M27 60c13 4 37 3 53-5l1.5 6c-17.5 8.5-41.5 9.5-54 5.5z"/>'+
    '<circle class="e" cx="45" cy="66" r="3.2"/>',


  // LE SINGE : la face ronde et les deux grandes oreilles, et la queue
  // enroulée qui dépasse du socle. Le pelage est assombri en couronne
  // (.s) pour que le masque du visage ressorte, même en ivoire. Le
  // cercle d'or au front et la pêche d'immortalité qu'il serre contre lui
  // en font le Roi-Singe ; à quarante pixels, on lit la tête « à trois
  // ronds » et une touche d'or au ventre.
  'singe':
    '<path class="b" d="M58.8 77C60.1 77.3 63.9 78.6 66.4 78.9C68.8 79.2 71.4 79.3 73.7 78.9C76.1 78.6 78.4 77.9 80.4 76.8C82.3 75.6 84.1 73.8 85.3 71.9C86.5 70 87.1 67.6 87.3 65.4C87.5 63.3 87.2 61 86.5 59.1C85.8 57.2 84.7 55.2 83.2 54C81.7 52.7 79.2 51.9 77.5 51.8C75.8 51.7 74.1 52.5 73 53.3C71.8 54 70.9 55.4 70.6 56.6C70.2 57.8 70.3 59.3 70.8 60.4C71.4 61.5 73.4 62.6 73.9 63.1A1.7 1.7 0 0 1 75.1 59.9C74.9 59.8 74.3 59.3 74.2 59C74 58.6 74.1 58.2 74.3 57.8C74.5 57.4 74.8 56.9 75.3 56.7C75.9 56.4 76.7 56.1 77.5 56.2C78.3 56.3 79.4 56.7 80.1 57.4C80.8 58.1 81.5 59.3 81.9 60.6C82.2 61.8 82.4 63.5 82.2 64.9C82 66.4 81.5 67.9 80.7 69.1C79.9 70.2 78.9 71.1 77.6 71.8C76.3 72.5 74.7 72.9 73 73.1C71.3 73.2 69.3 73.1 67.3 72.8C65.3 72.5 62.2 71.3 61.2 71z"/>'+
    '<path class="b" d="M32 80c-2.5-9-1-18 5-23 4-3 8.5-4.5 13-4.5s9 1.5 13 4.5c6 5 7.5 14 5 23z"/>'+
    '<path class="s" d="M58 57.5c4 2 6.5 5 7.5 9 .8 4 .6 8-.3 11.5H59c1-7 .8-14-1-20.5z"/>'+
    '<path class="b" d="M38 57c-4.5 3.5-6.5 9-5.5 14 .6 3 3 4.5 6 4.5h5l.5-8.5H40c-.8 0-1.3-.6-1.2-1.4.3-3 1.5-5.5 3.5-7.5zM62 57c4.5 3.5 6.5 9 5.5 14-.6 3-3 4.5-6 4.5h-5l-.5-8.5H60c.8 0 1.3-.6 1.2-1.4-.3-3-1.5-5.5-3.5-7.5z"/>'+
    '<path class="g" d="M51 60.5c-2 1.5-5.5 2.5-7.8 4.8-2.6 2.6-3.4 6.2-2 9 1.6 3 5 4.4 8.8 4.4s7.2-1.4 8.8-4.4c1.4-2.8.6-6.4-2-9-2-2-4.5-3-5.8-4.8z"/>'+
    '<path class="t" d="M50.5 63c-3 3-4 7-2.5 12"/>'+
    '<path class="b" d="M37 32a9 9 0 1 1-18 0 9 9 0 1 1 18 0zM81 32a9 9 0 1 1-18 0 9 9 0 1 1 18 0z"/>'+
    '<path class="k" d="M32.5 32.5a4 4 0 1 1-8 0 4 4 0 1 1 8 0zM75.5 32.5a4 4 0 1 1-8 0 4 4 0 1 1 8 0z"/>'+
    '<circle class="b" cx="50" cy="33" r="20"/>'+
    '<circle class="s" cx="50" cy="33" r="17.4"/>'+
    '<path class="h" d="M35.5 25c2.5-5 7-8.5 12.5-9.3-4 2-7.5 5.2-9.6 9.6z"/>'+
    '<path class="b" d="M50 28.5c-4-5-12.5-5-13.5 2.5-.5 4.5 1.5 7.5 2.5 10.5.5 6 5 9 11 9s10.5-3 11-9c1-3 3-6 2.5-10.5-1-7.5-9.5-7.5-13.5-2.5z"/>'+
    '<path class="k" d="M46.6 33.5a2.6 3.2 0 1 1-5.2 0 2.6 3.2 0 1 1 5.2 0zM58.6 33.5a2.6 3.2 0 1 1-5.2 0 2.6 3.2 0 1 1 5.2 0z"/>'+
    '<path class="l" d="M44.5 45.5c3 2.5 8 2.5 11 0M47.6 40.6h.2M52.2 40.6h.2"/>'+
    '<path class="g" d="M30.8 27C35 20 42 16.5 50 16.5S65 20 69.2 27l-1.7 3.6C63.5 24.5 57 21 50 21s-13.5 3.5-17.5 9.6z"/>'+
    '<circle class="e" cx="50" cy="18.8" r="3.2"/>',


  // LE BERSERK : le casque à cornes, la fente des yeux, la barbe tressée.
  // Les yeux luisent dans la fente (la furie), le bandeau et le nasal d'or
  // tiennent le casque, des bagues d'or ferment les tresses ; la hache à
  // lame barbue, dressée à côté de lui, est la seule masse d'or à droite :
  // à quarante pixels, deux cornes, un bandeau d'or et un fer de hache.
  'berserk':
    '<path class="b" d="M33 33C22 31 15 22 15 7c5 6 11 11 20 15zM67 33c11-2 18-11 18-26-5 6-11 11-20 15z"/>'+
    '<path class="g" d="M29 22.5l7 1.5-1.5 9-6.5-1.5zM71 22.5l-7 1.5 1.5 9 6.5-1.5z"/>'+
    '<path class="b" d="M18 80c0-14 6-22 16-25h32c10 3 16 11 16 25z"/>'+
    '<path class="s" d="M64 57.5c8 3 13 10 14.5 20.5H68c0-8-1.5-14.5-4-20.5z"/>'+
    '<path class="b" d="M71.5 28h5v51h-5z"/>'+
    '<path class="g" d="M75.5 30.5c3.5 0 6.5-1.3 9-3.5 3 7 3.6 17.5.8 27-2.2-3.7-5.6-6.3-9.8-7.5z"/>'+
    '<path class="b" d="M30 34c0-13 9-21 20-21s20 8 20 21z"/>'+
    '<path class="h" d="M35 28c1-6 5.5-10.5 11-12-4 3.5-6.5 7.5-7.5 12.5z"/>'+
    '<path class="s" d="M58 16.5c6 3 9.5 8.5 9.8 15.5H61c0-6-1-11-3-15.5z"/>'+
    '<path class="b" d="M33 36h34v7c0 4-3 7-6 8H39c-3-1-6-4-6-8z"/>'+
    '<path class="v" d="M35 37h30v6H35z"/>'+
    '<path class="e" d="M45.4 40a3.4 1.9 0 1 1-6.8 0 3.4 1.9 0 1 1 6.8 0zM61.4 40a3.4 1.9 0 1 1-6.8 0 3.4 1.9 0 1 1 6.8 0z"/>'+
    '<path class="g" d="M28 30.5h44v6.5H28z"/>'+
    '<path class="g" d="M47 36h6v8l-3 3-3-3z"/>'+
    '<path class="b" d="M31 42c0 10 4 16 10 19 3 1.6 6 2.5 9 2.5s6-.9 9-2.5c6-3 10-9 10-19-5 4.5-12 6.5-19 6.5S36 46.5 31 42z"/>'+
    '<path class="b" d="M41 59h7v13l-3.5 5-3.5-5zM52 59h7v13l-3.5 5-3.5-5zM50 47c-5-2.5-12-1.5-16 3 4-1 9-.5 13 1.5L50 50l3 1.5c4-2 9-2.5 13-1.5-4-4.5-11-5.5-16-3z"/>'+
    '<path class="g" d="M40.5 64h8v4h-8zM51.5 64h8v4h-8z"/>'+
    '<circle class="b" cx="74" cy="63" r="5.5"/>',


  // LE BOUCHER : trapu, le tablier, et le couperet levé à côté de lui.
  // Le couperet est INCLINÉ, avec son trou au coin de la lame : tenu droit,
  // un rectangle au bout d'un manche se lit comme un drapeau. Le crâne
  // chauve luisant, les sourcils froncés et la moustache font la trogne ;
  // la ceinture d'or nouée (une gemme pour nœud) ferme le tablier.
  'boucher':
    '<path class="b" d="M19 80c0-12 3-20 9-25 5.5-4 13-6 21-6s15 2 20 5.5c6.5 4.5 10 13 11 25.5z"/>'+
    '<path class="s" d="M63 53.5c7 4 11.5 12 13.5 24.5H66c0-9-1-17-3-24.5z"/>'+
    '<path class="b" d="M37 55h22v8c4.5 3 7.5 9 8.5 17h-39c1-8 4-14 8.5-17z"/>'+
    '<path class="l" d="M37 55l4-6M59 55l-4-6M60.5 50.5c2.5 1.5 5.5 2.6 8.6 3"/>'+
    '<path class="g" d="M32.5 63h31l1.5 4.5H31z"/>'+
    '<circle class="e" cx="48" cy="65.3" r="2.6"/>'+
    '<path class="b" d="M28.5 55c-5 3-8.5 9-9 16-.2 3 .4 6 2.3 9h8.4c-1.5-3-2-6-1.5-9.5.5-3.5 1.6-6.6 3.3-9.2zM59 52.5c3-5 5.5-10.5 7-17l11 2.8c-1.5 7.5-5 14-10 19.5zM73.5 27.2l5.4 1.6-4.4 14.3c-.6 2.1-6 .5-5.3-1.6z"/>'+
    '<path class="g" d="M79.6 31.1L86.7 8.2L71.7 3.6C68.3 10.9 65.9 18.6 64.6 26.5C69.7 28.7 74.5 30.2 79.6 31.1Z"/>'+
    '<path class="h" d="M73.7 6.8C70.8 12.7 69.1 18.5 68 25L70.1 25.6C71.2 19.1 72.9 13.4 75.8 7.5Z"/>'+
    '<circle class="k" cx="80.7" cy="11.2" r="2.3"/>'+
    '<circle class="b" cx="73" cy="38.5" r="6"/>'+
    '<path class="b" d="M36.1 33a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 1 1 7.2 0zM61.1 33a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 1 1 7.2 0z"/>'+
    '<circle class="b" cx="45" cy="31" r="13"/>'+
    '<path class="s" d="M53 21.5c4 3 5.5 7.5 5 12-.6 4.5-3.2 8-7 10 2.5-3 3.8-6.5 3.8-10.5 0-4-.6-8-1.8-11.5z"/>'+
    '<path class="h" d="M36.5 25c1.5-4 5-7 9-7.5-3 1.5-5 4-6 7z"/>'+
    '<path class="k" d="M37.4 27.4l6.6 2.4v1.4l-6.6-2.2zM52.6 27.4l-6.6 2.4v1.4l6.6-2.2z"/>'+
    '<path class="b" transform="translate(45 36) scale(.72) translate(-45 -36)" d="M47.8 34.8a2.8 2.4 0 1 1-5.6 0 2.8 2.4 0 1 1 5.6 0zM45 37c-3-2-9-2.5-13 1 3.5 1.5 8 1.5 11.5 0 .6.6 1 .8 1.5.8s.9-.2 1.5-.8c3.5 1.5 8 1.5 11.5 0-4-3.5-10-3-13-1z"/>',

  // ---- Sorciers ------------------------------------------------
  // LA MÉDUSE : la cloche de la méduse et ses tentacules qui ondulent
  // jusqu'au socle ; l'oeil de gorgone serti d'or au front de la cloche et
  // la frange d'or festonnée la font lire à quarante pixels.
  'meduse':
    '<path class="b" d="M24 50c-6 5-10 10-8 16 2 5 7 7 6 14h7c1-9-4-11-6-15-1.5-3 .5-8 7-14z"/>'+
    '<path class="b" d="M77 50c6 5 9 10 7 16-2 5-7 7-6 14h-7c-1-9 4-11 6-15 1.5-3-.5-8-6-14z"/>'+
    '<path class="b" d="M37 52c-3.5 6-3.5 10 0 14.5 3.2 4.2 3.2 8.5.5 13.5h8c2.8-5.5 2.6-10.5-.8-15-3-4-3-8 .3-13z"/>'+
    '<path class="b" d="M57 52c-3.5 6-3.5 10 0 14.5 3.2 4.2 3.2 8.5.5 13.5h8c2.8-5.5 2.6-10.5-.8-15-3-4-3-8 .3-13z"/>'+
    '<path class="b" d="M15 48c0-23 15-40 35-40s35 17 35 40c0 2-1.5 3.5-3.5 3.5h-63C16.5 51.5 15 50 15 48z"/>'+
    '<path class="s" d="M63 13.5c10 6.5 17 18.5 17.5 31.5H64c1.4-11 1.2-21.5-1-31.5z"/>'+
    '<path class="h" d="M22 40c.5-11 6-20.5 15-26-5.6 6.4-9.4 15-11 26z"/>'+
    '<path class="t" d="M50 12v12M36 16c-4 6-6 14-6.5 25M64 16c4 6 6 14 6.5 25"/>'+
    '<path class="g" d="M13.5 44.5h73v4.5c0 1.6-1 2.6-2.6 2.6l-4.5 4-4.6-4h-6.6l-4.6 4-4.6-4h-6.6L50 55.6l-4.6-4h-6.6l-4.6 4-4.6-4h-6.6l-4.6 4-4.5-4c-1.6 0-2.6-1-2.6-2.6z"/>'+
    '<path class="g" d="M36 28c5-7.5 23-7.5 28 0-5 7.5-23 7.5-28 0z"/>'+
    '<circle class="e" cx="50" cy="28" r="4.3"/>'+
    '<path class="k" d="M49 24.5h2v7h-2z"/>',

  // LE TYPHON : l'entonnoir — des anneaux de vent empilés qui rétrécissent
  // vers le bas et vacillent de gauche à droite — fendu d'un éclair d'or.
  'typhon':
    '<path class="b" d="M13 15c0-7 16-11.5 37-11.5S87 8 87 15s-16 12-37 12-37-5-37-12z"/>'+
    '<path class="s" d="M66 7c11 2 16.5 5 16.5 8s-5.5 7-16.5 9c3-5 3-12 0-17z"/>'+
    '<path class="h" d="M21 13c3-3 12-5 22-5.5-8 1.6-15 3.6-18 6.5z"/>'+
    '<path class="b" d="M19 34c0-5.5 12.5-9.5 28-9.5S75 28.5 75 34s-12.5 9.5-28 9.5S19 39.5 19 34z"/>'+
    '<path class="s" d="M60 27c7 1.5 10.5 4 10.5 7s-3.5 5.5-10.5 7c2-4 2-10 0-14z"/>'+
    '<path class="b" d="M31 49c0-5 9.5-8.5 21-8.5S73 44 73 49s-9.5 8.5-21 8.5S31 54 31 49z"/>'+
    '<path class="s" d="M62 43c5 1.4 7.5 3.6 7.5 6s-2.5 4.6-7.5 6c1.6-3.6 1.6-8.4 0-12z"/>'+
    '<path class="b" d="M31 62.5c0-4.4 7.2-7.5 16-7.5s16 3.1 16 7.5-7.2 7.5-16 7.5-16-3.1-16-7.5z"/>'+
    '<path class="b" d="M40 73c0-3.4 5-6 11-6s11 2.6 11 6-5 5.5-11 5.5-11-2.1-11-5.5z"/>'+
    '<path class="b" d="M45.5 77h9l-2.5 4.5h-4z"/>'+
    '<path class="l" d="M23 17c10 4 44 4 56-1M28 36c8 3 31 3 40-1M38 51c6 2 21 2 29-1M37 64c5 1.6 13 1.6 19-.5"/>'+
    '<path class="g" d="M58 8 44.5 30h8.5l-9.5 16h7.5L39 70l21-28.5h-8.5l9.5-14h-8.5l8.5-14z"/>'+
    '<circle class="e" cx="30" cy="15" r="2.4"/>',

  // LA BANSHEE : le spectre qui hurle — les bras levés au ciel, le linceul
  // déchiré en lambeaux, les orbites creuses et la bouche ouverte du cri.
  'banshee':
    '<path class="b" d="M50 7c-12 0-20 9-20 21 0 3 .5 5.5 1.5 8L12 22c0 11 5 20 15 25.5L24 80l6-8 5 8 5-8 5 8 5-8 5 8 5-8 5 8 6-8 6 8-3-32.5C83 42 88 33 88 22L68.5 36c1-2.5 1.5-5 1.5-8 0-12-8-21-20-21z"/>'+
    '<path class="s" d="M60 11c6 4 9.5 10 9.5 17 0 3-.6 6-1.6 8.5l2.4 37.5-3.3-4.6-4 6c.8-21 1.6-44-3-64.4z"/>'+
    '<path class="h" d="M35.5 24c1-5.5 5-10.5 10.5-13-4 3.4-6.5 7.4-7.4 13.4zM17 30c2 5 5 9 9 12l-.8 3.6C21 42 18.5 37 17 30z"/>'+
    '<path class="g" d="M30.5 21.5c6-3 13-4.5 19.5-4.5s13.5 1.5 19.5 4.5l-1 4.6c-6-2.6-12.5-3.6-18.5-3.6s-12.5 1-18.5 3.6z"/>'+
    '<circle class="e" cx="50" cy="19.6" r="2.7"/>'+
    '<path class="v" d="M37.5 30c2-2 7.5-1.4 8.5 2 1 4.4-2 9-5.4 9-3 0-4.4-6.6-3.1-11zM62.5 30c-2-2-7.5-1.4-8.5 2-1 4.4 2 9 5.4 9 3 0 4.4-6.6 3.1-11z"/>'+
    '<path class="v" d="M50 42c3.4 0 5 4 5 8.5S53.4 59 50 59s-5-4-5-8.5 1.6-8.5 5-8.5z"/>'+
    '<path class="l" d="M36 63c-1 5-1 9 0 13M50 63v14M64 63c1 5 1 9 0 13"/>',

  // LE PRÊTRE : la robe de bure au capuchon profond, et la grande croix
  // d'or gemmée sur la poitrine — sa Foi Inébranlable, ce qui le fait lire
  // à quarante pixels.
  'pretre':
    '<path class="b" d="M50 6c-11 0-19 8-19 19 0 6 2 10 5 13-8 4-13 11-15 20l-3 22h64l-3-22c-2-9-7-16-15-20 3-3 5-7 5-13 0-11-8-19-19-19z"/>'+
    '<path class="s" d="M60 10c5 3.5 7.5 9 7.5 15 0 5-1.5 9-4.5 12.5 7 4 12 11 13.5 19.5l2.6 20.5H66c-1-22-2-45-6-67.5z"/>'+
    '<path class="h" d="M35 22c1-5 4-9 9-11.5-3 3-5 7-5.8 12zM25 60c1-6 4-11 8-14-2.6 4-4.4 8.5-5 14z"/>'+
    '<path class="v" d="M50 15.5c6 2.6 10 8 10 13.5 0 5-4.4 8-10 8s-10-3-10-8c0-5.5 4-10.9 10-13.5z"/>'+
    '<path class="l" d="M34 42c-5 4-8.5 9.5-10 16M66 42c5 4 8.5 9.5 10 16M35 64l-1.5 9M65 64l1.5 9"/>'+
    '<path class="g" d="M20.3 74.5h59.4l1 5.5H19.3z"/>'+
    '<path class="g" d="M45.5 41h9v8h11v9h-11v14h-9V58h-11v-9h11z"/>'+
    '<circle class="e" cx="50" cy="53.5" r="3.4"/>',

  // L'OMBRE : la silhouette garde la matière de son camp ; c'est l'ombre
  // portée, PLEINE (.k), qui se découpe derrière elle en haut à gauche, tête
  // bien détachée de la sienne — à quarante pixels, on voit deux personnages,
  // dont l'un est noir. Le loup (.k) aux yeux gemmés en fait un rôdeur, sans
  // capuche, pour ne jamais la confondre avec le Grand Maître ou l'Illusion.
  'ombre':
    '<path class="v" d="M10 78c1-16 5-27.5 13.5-33 3-1.6 6.5-2.3 10.5-2.3s7.5.7 10.5 2.3C53 50.5 57 62 58 78zM21 21a13 13 0 1 0 26 0a13 13 0 1 0-26 0z"/>'+
    '<path class="b" d="M35 80c1-14 5-24.5 13.5-29.5 3-1.6 6.5-2.3 10.5-2.3s7.5.7 10.5 2.3C78 55.5 82 66 83 80z"/>'+
    '<path class="s" d="M70 53.5c6 5 9.5 13 10.5 24H73c-.5-9-1.5-17-3-24z"/>'+
    '<path class="h" d="M42.5 58c-3 5-4.5 10.5-5 17h3c.6-5.6 2-10.5 4-15z"/>'+
    '<path class="g" d="M36.3 75.5h45.5l.9 4.5H35.4z"/>'+
    '<path class="g" d="M45.5 50.5c3.8 3.8 8.5 5.6 13.5 5.6s9.7-1.8 13.5-5.6l2.4 4c-4.3 3.8-10 6.1-15.9 6.1s-11.6-2.3-15.9-6.1z"/>'+
    '<circle class="e" cx="59" cy="60.3" r="2.8"/>'+
    '<circle class="b" cx="59" cy="30" r="13"/>'+
    '<path class="s" d="M68.5 21.2a13 13 0 0 1-12.6 21.4 11.4 11.4 0 0 0 12.6-21.4z"/>'+
    '<path class="h" d="M51 25.5a9.5 9.5 0 0 1 7-5.5c-3.4 2.3-5 4.6-5.7 7.8z"/>'+
    '<path class="k" d="M46.4 26.5c8.4-1.8 16.8-1.8 25.2 0l-.6 6.5c-8-1.6-16-1.6-24 0z"/>'+
    '<ellipse class="e" cx="53.5" cy="29.6" rx="2.6" ry="1.7"/><ellipse class="e" cx="64.5" cy="29.6" rx="2.6" ry="1.7"/>',

  // L'INFECTÉ : un crâne à l'œil barré, l'autre orbite qui luit, la bouche
  // recousue, le crâne fendu et les épaules piquées de pustules qui crèvent
  // le contour — ce qu'on attrape en le mangeant. Le carcan d'or au cou est
  // son seul apparat.
  'infecte':
    '<path class="b" d="M24 80c0-13 7-22 18-25h16c11 3 18 12 18 25z"/>'+
    '<path class="s" d="M61 58.5c6 3 10 9 11.5 18.5H66c-.8-7-2.5-13-5-18.5z"/>'+
    '<path class="h" d="M33 63c-3 3.5-4.5 8-5 13h3c.5-4.5 2-8 4-11z"/>'+
    '<circle class="b" cx="28" cy="70" r="3.6"/><circle class="b" cx="71" cy="65" r="3"/><circle class="b" cx="41" cy="72" r="2.6"/><circle class="b" cx="60" cy="74" r="2"/>'+
    '<path class="h" d="M26.6 68.4a1.2 1.2 0 1 0 .1 0zM70 63.6a1 1 0 1 0 .1 0zM40 70.8a.9.9 0 1 0 .1 0z"/>'+
    '<path class="g" d="M37 53c4 3 8.5 4 13 4s9-1 13-4l1.5 4.5c-4.5 3-9.5 4.5-14.5 4.5s-10-1.5-14.5-4.5z"/>'+
    '<path class="b" d="M50 8c14 0 24 9.5 24 22.5 0 7-3 12-7 15.5l-1 7.5c-.4 3-3 5-6 5H40c-3 0-5.6-2-6-5l-1-7.5C29 42.5 26 37.5 26 30.5 26 17.5 36 8 50 8z"/>'+
    '<path class="s" d="M64.5 13.5c5 4 7 10 7 17 0 6-2.5 10.5-6 13.5l-1.3 8.5c-.3 1.5-1.5 2.5-3 2.8 1-5 1.5-10 1.5-15 2-8 3-17 1.3-26.8z"/>'+
    '<path class="h" d="M32 24c1.5-5.5 5-9.5 10-12-3.5 3.5-5.5 7.5-6.5 12.5z"/>'+
    '<path class="l" d="M35.5 26.5l9 9M44.5 26.5l-9 9"/>'+
    '<circle class="k" cx="59" cy="31" r="5.5"/>'+
    '<circle class="e" cx="59" cy="31" r="2.6"/>'+
    '<path class="k" d="M48 41l2-4.5 2 4.5z"/>'+
    '<path class="l" d="M39 48.5h22"/>'+
    '<path class="t" d="M43 45v7M47.5 45v7M52.5 45v7M57 45v7M50 8.5l-2.5 5 3 3-2 5"/>',

  // L'ILLUSION : une silhouette encapuchonnée qui tient un miroir d'or et,
  // derrière elle, son DOUBLE en pointillé (voilé d'une ombre pour se lire à
  // quarante pixels) — ce qu'elle laisse sur la case qu'elle quitte. Capuche
  // ronde sans liseré d'or ni orbe : le Grand Maître a les deux.
  'illusion':
    '<path class="s" transform="translate(-17 -5)" d="M55 8c-10.5 0-18 9-18 20.5 0 6 1.6 11 4.2 14.5-5 3-8 7-9 13L28 80h54l-4.2-24c-1-6-4-10-9-13 2.6-3.5 4.2-8.5 4.2-14.5C73 17 65.5 8 55 8z"/>'+
    '<path class="l" stroke-dasharray="5 4" transform="translate(-17 -5)" d="M55 8c-10.5 0-18 9-18 20.5 0 6 1.6 11 4.2 14.5-5 3-8 7-9 13L28 80h54l-4.2-24c-1-6-4-10-9-13 2.6-3.5 4.2-8.5 4.2-14.5C73 17 65.5 8 55 8z"/>'+
    '<path class="b" d="M55 8c-10.5 0-18 9-18 20.5 0 6 1.6 11 4.2 14.5-5 3-8 7-9 13L28 80h54l-4.2-24c-1-6-4-10-9-13 2.6-3.5 4.2-8.5 4.2-14.5C73 17 65.5 8 55 8z"/>'+
    '<path class="s" d="M66 46c4 3 6.5 6.5 7.3 11.5L77 78h-9c-.5-12-1-22-2-32z"/>'+
    '<path class="h" d="M41 22c1.5-5 4.5-8.5 8.5-10.5-2.8 3-4.5 6.5-5.5 11zM35 58l-3 18h3l2.6-17z"/>'+
    '<path class="v" d="M46 30c0-6.5 4-11 9-11s9 4.5 9 11-4 14-9 14-9-7.5-9-14z"/>'+
    '<path class="g" d="M28.8 75.5h52.4l.8 4.5H28z"/>'+
    '<path class="g" d="M52.8 68h4.4v8h-4.4z"/>'+
    '<ellipse class="g" cx="55" cy="58" rx="8.5" ry="10.5"/>'+
    '<ellipse class="e" cx="55" cy="58" rx="5.2" ry="7.2"/>'+
    '<path class="h" d="M51.5 57l4-6 1.2.8-4 6z"/>',

  // LE REFLET : la même silhouette et le même miroir, tout en pointillé —
  // c'est le double de l'Illusion. Le plateau l'affiche en plus à moitié
  // effacé (.pc-reflet, css/style.css).
  'reflet':
    '<path class="b" stroke-dasharray="6 4.5" d="M55 8c-10.5 0-18 9-18 20.5 0 6 1.6 11 4.2 14.5-5 3-8 7-9 13L28 80h54l-4.2-24c-1-6-4-10-9-13 2.6-3.5 4.2-8.5 4.2-14.5C73 17 65.5 8 55 8z"/>'+
    '<path class="v" d="M46 30c0-6.5 4-11 9-11s9 4.5 9 11-4 14-9 14-9-7.5-9-14z"/>'+
    '<ellipse class="g" stroke-dasharray="4 3" cx="55" cy="58" rx="8.5" ry="10.5"/>'+
    '<ellipse class="e" cx="55" cy="58" rx="5.2" ry="7.2"/>',
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
// du pion — ce sont des pions — et se distinguent par la coiffe.

// LE MERCENAIRE : le chapeau à large bord tombant, ceint d'or et piqué
// d'une plume, enfoncé jusqu'aux yeux ; et la pièce d'or pendue sur la
// poitrine — il se bat pour la solde.
PIECE_ART['pion-mercenaire']=PIECE_ART.__pawn+
  '<path class="g" d="M57.6 16.5c1.4-7.4 6-12.8 13.4-15.4.2 6.4-3.4 12.6-10 16.8z"/>'+
  '<path class="t" d="M60.4 15.4c2-4.8 5-8.6 8.6-11"/>'+
  '<path class="b" d="M38.4 20.5l2-11.4c.6-3.2 4-5.4 9.6-5.4s9 2.2 9.6 5.4l2 11.4z"/>'+
  '<path class="s" d="M55.4 6.6c1.8.6 2.8 1.6 3.1 3.2l1.8 9.4h-3.8z"/>'+
  '<path class="l" d="M45.6 4.6c1.6 1.6 7.2 1.6 8.8 0"/>'+
  '<path class="g" d="M39.3 15.4h21.4l.9 5.1H38.4z"/>'+
  '<path class="b" d="M19 25.5c3-5 14.4-7.6 31-7.6s28 2.6 31 7.6c-1 2-3.4 3-5.8 2.2-6.6-2.4-15.4-3.6-25.2-3.6s-18.6 1.2-25.2 3.6c-2.4.8-4.8-.2-5.8-2.2z"/>'+
  '<path class="h" d="M25.6 23.6c5.4-2.2 12.6-3.2 19.8-3.4-7 .9-13 2.2-17 4z"/>'+
  '<circle class="g" cx="50" cy="58" r="6.4"/>'+
  '<circle class="t" cx="50" cy="58" r="3.4"/>';

// LE LÉGIONNAIRE : le casque à couvre-joues sous le grand cimier d'or en
// éventail, et le bouclier long (scutum) à umbo serti, porté en avant.
PIECE_ART['pion-legionnaire']=PIECE_ART.__pawn+
  '<path class="g" d="M32.5 16.5c0-9.4 7.6-15.5 17.5-15.5s17.5 6.1 17.5 15.5c-2 .2-3.8-.4-5.4-1.4-3-1.8-7.4-2.8-12.1-2.8s-9.1 1-12.1 2.8c-1.6 1-3.4 1.6-5.4 1.4z"/>'+
  '<path class="l" d="M38.6 7.6l3.6 5M44 4.2l1.6 7.4M50 3.2v8.4M56 4.2l-1.6 7.4M61.4 7.6l-3.6 5"/>'+
  '<path class="b" d="M36 28c-1-10 4.6-17 14-17s15 7 14 17z"/>'+
  '<path class="s" d="M56.4 13.8c4 2.6 5.6 6.4 5.4 11.2h-4.4c.2-4-.2-7.6-1-11.2z"/>'+
  '<path class="h" d="M40 22.6c.6-3.6 2.4-6.4 5.4-8.2-2 2.4-2.8 4.8-3.2 8.2z"/>'+
  '<path class="b" d="M36.6 26h6v8.6c-2.4-.2-4.6-1.4-5.8-3.6z"/>'+
  '<path class="b" d="M63.4 26h-6v8.6c2.4-.2 4.6-1.4 5.8-3.6z"/>'+
  '<path class="g" d="M35.2 24.4h29.6l.4 3.8H34.8z"/>'+
  '<path class="b" d="M22 50c0-2.6 2-4 4.4-4.2 5-.4 10.2-.4 15.2 0 2.4.2 4.4 1.6 4.4 4.2v24c0 2.6-2 4-4.4 4.2-5 .4-10.2.4-15.2 0-2.4-.2-4.4-1.6-4.4-4.2z"/>'+
  '<path class="s" d="M38.4 49.4c2.2.2 3.6 1 3.6 2.6v20c0 1.6-1.4 2.4-3.6 2.6z"/>'+
  '<path class="h" d="M25.6 51.4c0-1 .8-1.6 1.8-1.6h3.4v22.4h-3.4c-1 0-1.8-.6-1.8-1.6z"/>'+
  '<path class="g" d="M32.2 47h3.6v30h-3.6zM24.4 60.2h19.2v3.6H24.4z"/>'+
  '<circle class="g" cx="34" cy="62" r="5"/>'+
  '<circle class="e" cx="34" cy="62" r="2.6"/>';

// LE BARBARE : le casque à nasal et ses deux grandes cornes d'or qui
// jaillissent vers le ciel — lisibles même en tache —, la pelisse de
// fourrure en col et les sangles croisées sur le torse.
PIECE_ART['pion-barbare']=PIECE_ART.__pawn+
  '<path class="g" d="M40 22C29.5 21 23 13 23.5 1.5c3.6 6.6 10 10.4 18.5 11.6z"/>'+
  '<path class="g" d="M60 22c10.5-1 17-9 16.5-20.5-3.6 6.6-10 10.4-18.5 11.6z"/>'+
  '<path class="b" d="M36.8 25c-.6-9 5.4-15 13.2-15s13.8 6 13.2 15z"/>'+
  '<path class="s" d="M56 12.6c4 2.4 5.6 6 5.4 9.6h-4.2c0-3.4-.4-6.6-1.2-9.6z"/>'+
  '<path class="g" d="M36.2 22.4h27.6l.6 4H35.6z"/>'+
  '<path class="g" d="M48 26h4v6.5l-2 2-2-2z"/>'+
  '<path class="b" d="M33 36.5c5-1.8 11-2.6 17-2.6s12 .8 17 2.6l2.4 4.2c-1.2 2-3.4 2.6-5.4 1.8-1.4 1.8-3.8 2.2-5.6 1.2-1.8 1.6-4.4 1.8-6.2.6-1.8 1.2-4.6 1.2-6.4 0-1.8 1.2-4.4 1-6.2-.6-1.8 1-4.2.6-5.6-1.2-2 .8-4.2.2-5.4-1.8z"/>'+
  '<path class="l" d="M41.6 49l8.4 8.4 8.4-8.4"/>';

// JETON NEUTRE : une médaille d'or posée sur son pied, frappée d'une rune
// en point d'interrogation — une pièce ajoutée sans dessin reste visible,
// jouable, et a l'air de faire partie du jeu.
PIECE_ART.__fallback=
  '<path class="g" d="M41 72h18l4 8.5H37z"/>'+
  '<circle class="g" cx="50" cy="44" r="30"/>'+
  '<circle class="b" cx="50" cy="44" r="23"/>'+
  '<circle class="t" cx="50" cy="44" r="26.6"/>'+
  '<path class="s" d="M62 27a21 21 0 0 1-21.5 35.5A20 20 0 0 0 62 27z"/>'+
  '<path class="h" d="M33 41a18 18 0 0 1 11-14c-5.4 3.8-8 8-9 14z"/>'+
  '<path class="l" d="M42.5 37c0-5 3.4-8 7.6-8s7.6 3 7.6 7.2c0 5.6-7.6 6.2-7.6 12.4"/>'+
  '<circle class="k" cx="50.1" cy="56.5" r="2.8"/>'+
  '<circle class="e" cx="50" cy="17" r="3"/>'+
  '<circle class="e" cx="23" cy="44" r="2.2"/><circle class="e" cx="77" cy="44" r="2.2"/>';

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
