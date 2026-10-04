// ================================================================
// GEN-BOARDS.JS : génère les 5 textures d'échiquier de assets/boards/
// ================================================================
// Usage : node tools/gen-boards.js
//
// Chaque échiquier est un SVG de 800x800 (8 cases de 100) entièrement
// procédural : aucune image bitmap, donc quelques kilo-octets par plateau et
// une netteté parfaite à toutes les tailles.
//
// DIRECTION « FANTASY » (v5). Les cinq plateaux étaient cinq damiers bien
// teintés : une matière par case, un filet d'un pixel, un modelé radial. Ils
// se lisaient comme une TEXTURE posée sous les pièces, jamais comme un OBJET
// d'apparat. Chacun est maintenant construit comme un vrai plateau d'artisan,
// en six couches qui se retrouvent d'un plateau à l'autre :
//
//   1. LA MATIÈRE de chaque case (deux masques en damier, clair / sombre) :
//      un dégradé éclairé du haut à gauche, puis le DESSIN propre au matériau
//      — le fil d'un chêne, les veines d'un marbre, les vagues d'un acier
//      damassé, la gravure d'un argent, le grain d'un or amati. Ce dessin est
//      peint en couleur réelle (un trait de brou, une veine blanche) et non
//      en mode de fusion : il se lit pareil dans tous les navigateurs.
//   2. LES CARREAUX : chaque case reçoit une très légère variation de ton,
//      tirée au sort une fois pour toutes. Soixante-quatre carreaux taillés
//      dans la même planche ne sont jamais rigoureusement identiques — c'est
//      ce qui sépare une marqueterie d'un motif répété.
//   3. UN SCEAU D'ARCANE, très effacé, gravé au centre du plateau (anneau
//      runique, étoile, rose des vents, rosace ou soleil selon la matière).
//      Il est tracé en creux — un trait sombre doublé d'un trait clair
//      décalé d'un pixel — pour se lire sur les deux teintes de case sans
//      jamais devenir une forme qui dispute l'œil aux pièces.
//   4. LE BISEAU de chaque case : un liseré clair en haut à gauche, sombre en
//      bas à droite. C'est lui qui fait d'une case un carreau TAILLÉ et
//      ENCASTRÉ, et non une zone colorée.
//   5. LE FILET DE MARQUETERIE entre les cases (laiton, joint d'ardoise, fil
//      d'or damasquiné, perle d'argent, émail noir), et pour les métaux des
//      CLOUS aux croisements.
//   6. LA LUMIÈRE du plateau entier : un reflet doux venu d'en haut à gauche,
//      des bords qui s'assombrissent DANS LA TEINTE DE LA MATIÈRE (un bord de
//      chêne fonce en brun, pas en gris), et, pour les métaux, les grandes
//      bandes de reflet qui font qu'un métal se lit comme un métal.
//
// LA RÈGLE QUI COMMANDE TOUT : les pièces sont d'ivoire et d'obsidienne
// rehaussées d'or. Les cases claires restent donc nettement sous l'ivoire
// (le trait sombre des blancs les détache), les cases sombres nettement
// au-dessus de l'obsidienne (le liseré d'or pâle des noirs fait le reste),
// et le dessin de la matière reste DOUX : il donne la richesse, jamais une
// forme qu'on pourrait prendre pour une pièce.
//
// Les teintes moyennes des cases sont reportées dans BOARD_SKINS
// (js/data-pieces.js, sqLight / sqDark) : elles colorent les repères de
// coordonnées posés dans les cases de bord.
//
// Pour ajouter un matériau : ajoutez une entrée dans MATERIALS et relancez le
// script. Pensez à référencer le nouveau plateau dans BOARD_SKINS pour qu'il
// soit sélectionnable en jeu.
// ================================================================

const fs=require('fs');
const path=require('path');

const OUT=path.join(__dirname,'..','assets','boards');

// Un nombre arrondi à deux décimales au plus : quelques centaines d'octets
// gagnés sur chaque plateau, sans perte visible.
const n=v=>(+v.toFixed(2)).toString();

// ----------------------------------------------------------------
// LES MATÉRIAUX
// ----------------------------------------------------------------
// light / dark : la teinte d'une case, et le haut (hi) / bas (lo) de son
//   dégradé de lumière.
// fil : le dessin de la matière dans la case, une liste de couches :
//   · {k:'raies', …} des rayures (motif de `h` unités de haut, traits
//     [y, épaisseur]) DÉFORMÉES par un bruit (feDisplacementMap) : le fil
//     d'un bois, les couches d'un acier damassé. `f` : fréquences du bruit,
//     `d` : amplitude de la déformation.
//   · {k:'veines', …} les lignes de niveau d'un bruit : là où le bruit passe
//     par certaines valeurs (`t`, la table), un trait. Ce sont les veines
//     d'un marbre, les pores d'un bois, le grain d'un métal.
//   · {k:'nuage', …} un bruit doux, sans contour : les taches d'une pierre.
//   · {k:'motif', …} un motif gravé régulier (le guilloché de l'argent).
//   L et D donnent [couleur, opacité] pour chaque teinte de case. Le fil des
//   cases sombres est tourné d'un quart de tour, comme sur un plateau
//   marqueté où chaque carreau est posé contre le fil de ses voisins.
//   `seul:'L'` ou `'D'` réserve une couche à une teinte.
// carreaux : l'amplitude de la variation de ton d'une case à l'autre.
// biseau : largeur et couleurs du liseré de taille de chaque case.
// filet : le filet entre les cases (largeur, bords, métal, éclat).
// clous : facultatif, les clous aux croisements des cases.
// cadre : facultatif, un double filet gravé à l'intérieur de chaque case.
// sceau : le sceau d'arcane central (forme, couleurs, opacité).
// ombre : la teinte des bords assombris ; eclat : le reflet du haut à
//   gauche ; reflets : l'intensité des bandes de reflet (métaux).
// Une table de transfert de `len` zéros portant quelques pics [indice,
// valeur] : plus la table est longue, plus le pic est étroit, donc plus la
// veine est fine.
const Z=(len,pics)=>{const t=new Array(len).fill(0);pics.forEach(([i,v])=>t[i]=v);return t;};

const MATERIALS={
  // LE CHÊNE HUILÉ. Un chêne blond tirant sur l'ambre et un noyer brun-rouge,
  // chaque carreau posé contre le fil de ses voisins, séparés par un filet de
  // LAITON. Le fil a deux échelles, comme un vrai bois : de larges bandes
  // douces (le bois d'été, plus dense) et des traits fins par-dessus. Le
  // sceau est une rose des vents pyrogravée.
  bois:{
    light:{base:'#cf9f5f',hi:'#e3b979',lo:'#b38244'},
    dark:{base:'#734320',hi:'#8a572e',lo:'#562f13'},
    fil:[
      {k:'raies',raies:[[0,5],[11,3],[19,7],[31,4]],h:40,
        f:[.003,.022],o:2,d:46,L:['#a8723a',.32],D:['#3a1d08',.36]},
      {k:'raies',raies:[[0,1.1],[3.5,.6],[8,1],[14,.7],[17,1.4],[23,.6],[27,1],[33,.6]],h:37,
        f:[.004,.03],o:2,d:34,L:['#7a4618',.34],D:['#2a1204',.42]},
      {k:'veines',f:[.012,.6],o:2,t:[0,0,0,.6,0,0,.5,0,0],L:['#8a5422',.2],D:['#1c0b02',.26]},
    ],
    carreaux:.055,
    biseau:{w:3.4,hi:'rgba(255,230,180,.36)',lo:'rgba(36,16,4,.5)'},
    filet:{w:2.1,bord:'#2a1505',metal:'#c99a42',eclat:'#f6d88c'},
    sceau:{forme:'rose',fonce:'#2a1204',clair:'#ffe2b0',a:.09},
    ombre:'#1e0d03',eclat:.14,
  },
  // LE MARBRE. Un marbre blanc-gris veiné de gris et d'un fil d'or pâle, une
  // dalle d'anthracite veinée de blanc, des joints d'ardoise. La seule
  // matière où la veine a le droit de se voir franchement — c'est ce qui la
  // nomme ; elle reste FINE pour ne pas salir la case. Le sceau est un
  // anneau de runes taillé au ciseau.
  pierre:{
    light:{base:'#c4bfb3',hi:'#d6d2c8',lo:'#aea89c'},
    dark:{base:'#4a4d54',hi:'#5b5e66',lo:'#393b41'},
    fil:[
      {k:'nuage',f:[.011,.011],o:3,L:['#aaa59b',.18],D:['#25262a',.4]},
      {k:'veines',f:[.0035,.016],o:4,rot:-32,t:Z(24,[[11,.95],[17,.5]]),L:['#6f6a63',.32],D:['#e2ded6',.26]},
      {k:'veines',f:[.014,.024],o:3,rot:-32,t:Z(18,[[9,.7]]),L:['#8a857d',.2],D:['#c3bfb8',.13]},
      {k:'veines',f:[.004,.009],o:3,rot:-32,t:Z(30,[[14,.9]]),L:['#b48a36',.18],D:['#c9a052',.13]},
    ],
    carreaux:.06,
    biseau:{w:3.6,hi:'rgba(255,255,255,.42)',lo:'rgba(10,10,14,.48)'},
    filet:{w:2.2,bord:'#141416',metal:'#3a3b40',eclat:'#86878c'},
    sceau:{forme:'runes',fonce:'#1c1c20',clair:'#ffffff',a:.09},
    ombre:'#0c0c10',eclat:.12,
  },
  // L'ACIER DAMASSÉ. Un acier clair et un acier bleui, parcourus des
  // couches ondulées du damas, séparés par un fil d'OR incrusté (le
  // damasquinage), cloués aux croisements. Les couches sont LARGES : un trait
  // d'une unité tomberait sous le demi-pixel sur un téléphone et ne
  // dessinerait plus qu'un moiré. Le sceau est une étoile à huit branches
  // gravée à l'eau-forte.
  acier:{
    light:{base:'#a9b2bb',hi:'#c3cad1',lo:'#8d97a2'},
    dark:{base:'#465668',hi:'#58697d',lo:'#33414f'},
    fil:[
      {k:'raies',raies:[[0,4.5],[8,2.5],[13,5.5],[22,3]],h:30,
        f:[.0035,.005],o:2,d:130,L:['#6c7782',.15],D:['#9fb0c2',.12]},
      {k:'veines',f:[.9,.006],o:1,t:[0,.5,0,.5,0],L:['#ffffff',.14],D:['#d6e2ee',.07]},
      {k:'lustre',L:['#ffffff',.14],D:['#cfe0f2',.08]},
    ],
    carreaux:.05,
    biseau:{w:3.4,hi:'rgba(255,255,255,.46)',lo:'rgba(8,12,18,.52)'},
    filet:{w:2,bord:'#1a1f26',metal:'#c9a04a',eclat:'#f6dd98'},
    clous:{r:2.8,metal:'#aeb7c0',eclat:'#f4f7fa',bord:'#1d232a'},
    sceau:{forme:'etoile',fonce:'#0e141a',clair:'#ffffff',a:.08},
    ombre:'#070a10',eclat:.16,reflets:.13,teinte:['#f2f8ff','#08121e'],
  },
  // L'ARGENT GRAVÉ. Un argent poli et un argent niellé (assombri au soufre,
  // comme les orfèvres font ressortir une gravure), gravés d'un guilloché,
  // séparés par une perle d'argent clair. Les grandes bandes de reflet d'un
  // métal poli traversent le plateau. Le sceau est une rosace en filigrane.
  // La case claire reste SOUS l'ivoire des pièces : un argent blanc pur les
  // effacerait.
  argent:{
    light:{base:'#bcc3cb',hi:'#d4d9df',lo:'#9fa9b3'},
    dark:{base:'#56606b',hi:'#68737f',lo:'#424a54'},
    fil:[
      {k:'motif',L:['#76818c',.22],D:['#c9d3dc',.12]},
      {k:'veines',f:[1.1,.004],o:1,t:[0,.5,0,.5,0],L:['#ffffff',.18],D:['#e6edf3',.08]},
      {k:'coins',seul:'D',D:['#e9eef2',.24]},
    ],
    carreaux:.05,
    biseau:{w:3.2,hi:'rgba(255,255,255,.6)',lo:'rgba(14,20,28,.5)'},
    filet:{w:2,bord:'#262c33',metal:'#e3e8ec',eclat:'#ffffff'},
    clous:{r:2.6,metal:'#d3d9df',eclat:'#ffffff',bord:'#262c33'},
    sceau:{forme:'rosace',fonce:'#18202a',clair:'#ffffff',a:.07},
    ombre:'#0a0f16',eclat:.2,reflets:.24,teinte:['#ffffff','#0c1520'],
  },
  // L'OR CISELÉ. Deux ors, comme sur une pièce d'orfèvrerie : un or jaune
  // POLI (les cases claires, que les grandes bandes de reflet traversent) et
  // un or rouge AMATI (les cases sombres, piquées au poinçon : leur grain
  // mat fait ressortir le poli des autres). Un double filet ciselé borde
  // chaque case, un filet d'émail noir les sépare, des bossettes d'or les
  // cloutent. Le sceau est un soleil. Le dernier plateau : il doit être le
  // plus riche ET rester aussi calme que les autres sous les pièces.
  or:{
    light:{base:'#c99a36',hi:'#e2b955',lo:'#a77822'},
    dark:{base:'#8a5512',hi:'#a56c1e',lo:'#643a08'},
    fil:[
      {k:'veines',f:[.45,.45],o:1,t:[0,0,0,0,0,0,.9,.9],L:['#7a5410',.14],D:['#3a1c02',.26]},
      {k:'veines',f:[.45,.45],o:1,t:[.9,.9,0,0,0,0,0,0],seul:'D',D:['#e2ac55',.18]},
      {k:'veines',f:[.6,.008],o:1,t:[0,.5,0,.5,0],seul:'L',L:['#fff6d0',.16]},
    ],
    carreaux:.05,
    biseau:{w:3.6,hi:'rgba(255,244,196,.56)',lo:'rgba(46,22,0,.52)'},
    filet:{w:2.3,bord:'#3a2006',metal:'#1c1006',eclat:'#e6bf63'},
    clous:{r:3,metal:'#d8ad4c',eclat:'#ffeab0',bord:'#4a2a05'},
    cadre:{i:8,fonce:'rgba(70,36,0,.24)',clair:'rgba(255,240,190,.22)'},
    sceau:{forme:'soleil',fonce:'#3a1f02',clair:'#fff4d0',a:.08},
    ombre:'#1e0e00',eclat:.2,reflets:.3,teinte:['#fff0b4','#3a1a00'],
  },
};

// ----------------------------------------------------------------
// LE DAMIER
// ----------------------------------------------------------------
// Un motif de 200x200 contenant 2 cases blanches, utilisé comme masque (le
// blanc laisse passer, le noir cache) : un motif suffit pour les 32 cases
// d'une couleur. `crispEdges` sur ces seuls carrés : le bord d'une case doit
// tomber net, sans liseré d'anticrénelage entre deux cases — mais les veines,
// le sceau et les clous, eux, doivent rester lissés.
function checkerPattern(id,offsets){
  return '<pattern id="'+id+'" width="200" height="200" patternUnits="userSpaceOnUse">'+
    offsets.map(([x,y])=>'<rect x="'+x+'" y="'+y+'" width="100" height="100" fill="#fff" shape-rendering="crispEdges"/>').join('')+
    '</pattern>';
}

// Un tirage pseudo-aléatoire REPRODUCTIBLE (mulberry32) : relancer le script
// redonne exactement les mêmes plateaux, donc un diff vide si rien n'a changé.
function rng(seed){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

// ----------------------------------------------------------------
// LES COUCHES DE MATIÈRE
// ----------------------------------------------------------------
// Chaque couche donne, pour une teinte de case (side = 'L' ou 'D'), un
// fragment de <defs> (filtre, motif) et un fragment dessiné. Le côté sombre
// tourne d'un quart de tour : fréquences inversées, rayures verticales.
function layer(L,side,id,seed){
  const [col,alpha]=L[side];
  const swap=side==='D';
  const fq=f=>swap?f[1]+' '+f[0]:f[0]+' '+f[1];
  let defs='',draw='';

  if(L.k==='raies'){
    // Les rayures sont DESSINÉES (un motif de traits), puis déformées par
    // un bruit : c'est la seule façon d'obtenir des fils PARALLÈLES qui
    // ondulent ensemble, comme un vrai fil de bois ou les couches d'un acier
    // damassé. Un bruit seul donne des taches, jamais un fil.
    const rows=L.raies.map(([y,w])=>'<rect y="'+y+'" width="800" height="'+w+'"/>').join('');
    defs+='<pattern id="p'+id+'" width="800" height="'+L.h+'" patternUnits="userSpaceOnUse"'+
      (swap?' patternTransform="rotate(90)"':'')+'><g fill="'+col+'">'+rows+'</g></pattern>'+
      '<filter id="'+id+'" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'+
        '<feTurbulence type="fractalNoise" baseFrequency="'+fq(L.f)+'" numOctaves="'+L.o+'" seed="'+seed+'"/>'+
        '<feDisplacementMap in="SourceGraphic" scale="'+L.d+'" xChannelSelector="R" yChannelSelector="G"/>'+
      '</filter>';
    // Le rectangle déborde du plateau : la déformation va chercher des
    // pixels jusqu'à d/2 plus loin, et trouverait du vide au bord.
    draw+='<rect x="-80" y="-80" width="960" height="960" fill="url(#p'+id+')" filter="url(#'+id+')" opacity="'+alpha+'"/>';
  }
  else if(L.k==='veines'||L.k==='nuage'){
    // Le bruit devient l'OPACITÉ d'un aplat de couleur : la couleur est
    // exacte (une veine blanche est blanche). La table décide où passe le
    // trait (`veines` : des pics étroits, donc des lignes de niveau) ; un
    // `nuage` garde le bruit en pente douce, sans contour.
    // Chaîne : bruit → son canal rouge devient l'alpha → la table → un aplat
    // de la couleur voulue ne garde que cet alpha (feComposite « in »).
    const fa=L.k==='nuage'
      ?'<feFuncA type="linear" slope="2.4" intercept="-.95"/>'
      :'<feFuncA type="table" tableValues="'+L.t.join(' ')+'"/>';
    defs+='<filter id="'+id+'" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'+
        '<feTurbulence type="fractalNoise" baseFrequency="'+fq(L.f)+'" numOctaves="'+L.o+'" seed="'+seed+'" stitchTiles="stitch"/>'+
        '<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0"/>'+
        '<feComponentTransfer result="m">'+fa+'</feComponentTransfer>'+
        '<feFlood flood-color="'+col+'" flood-opacity="'+alpha+'"/>'+
        '<feComposite in2="m" operator="in"/>'+
      '</filter>';
    // `rot` : le bruit est calculé dans le repère de l'élément, donc un
    // rectangle TOURNÉ donne des veines en biais. Une veine de marbre court
    // en diagonale à travers la dalle ; alignée sur les cases, elle aurait
    // l'air d'un défaut d'impression. Le rectangle tourné déborde pour
    // couvrir tout le plateau.
    draw+=L.rot
      ?'<rect x="-170" y="-170" width="1140" height="1140" transform="rotate('+(swap?L.rot+90:L.rot)+' 400 400)" filter="url(#'+id+')"/>'
      :'<rect width="800" height="800" filter="url(#'+id+')"/>';
  }
  else if(L.k==='coins'){
    // LES ARABESQUES GRAVÉES de l'argent niellé : une volute dans chaque
    // coin de case, loin du centre où se tient la pièce. Sur un argent
    // niellé, la gravure ressort en CLAIR sur le fond noirci — c'est tout le
    // principe du nielle.
    const v='<path d="M7 27C7 15 15 7 27 7M7 27c0 4.5 5.5 5 6 .5M27 7c4.5 0 5 5.5.5 6M13 21c1-4 4-7 8-8"/>';
    defs+='<pattern id="'+id+'" width="100" height="100" patternUnits="userSpaceOnUse">'+
      '<g fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linecap="round">'+
      [0,90,180,270].map(a=>a?'<g transform="rotate('+a+' 50 50)">'+v+'</g>':v).join('')+
      '</g></pattern>';
    draw+='<rect width="800" height="800" fill="url(#'+id+')" opacity="'+alpha+'"/>';
  }
  else if(L.k==='lustre'){
    // LE LUSTRE D'UN CARREAU POLI : chaque case reçoit son propre éclat, un
    // trait de lumière étroit en biais suivi d'un creux sombre. Les bandes
    // de reflet du plateau disent « métal » ; ce lustre-ci dit « chaque
    // carreau a été poli à la main ».
    defs+='<linearGradient id="g'+id+'" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset=".18" stop-color="'+col+'" stop-opacity="0"/>'+
      '<stop offset=".3" stop-color="'+col+'" stop-opacity="'+alpha+'"/>'+
      '<stop offset=".4" stop-color="'+col+'" stop-opacity="0"/>'+
      '<stop offset=".72" stop-color="#000" stop-opacity="0"/>'+
      '<stop offset="1" stop-color="#000" stop-opacity="'+n(alpha*.5)+'"/>'+
      '</linearGradient>'+
      '<pattern id="'+id+'" width="100" height="100" patternUnits="userSpaceOnUse">'+
      '<rect width="100" height="100" fill="url(#g'+id+')"/></pattern>';
    draw+='<rect width="800" height="800" fill="url(#'+id+')"/>';
  }
  else if(L.k==='motif'){
    // LE GUILLOCHÉ : une onde fine, répétée, gravée dans le métal. Un motif
    // fixe et non un bruit — une gravure d'orfèvre est régulière, c'est ce
    // qui la distingue d'une rayure. Le pas (7 unités, 3 px sur un
    // téléphone) reste au-dessus du moiré.
    defs+='<pattern id="'+id+'" width="26" height="7.5" patternUnits="userSpaceOnUse"'+
      (swap?' patternTransform="rotate(90)"':'')+'>'+
      '<path d="M0 3.75Q6.5 0 13 3.75T26 3.75" fill="none" stroke="'+col+'" stroke-width="1.1"/></pattern>';
    draw+='<rect width="800" height="800" fill="url(#'+id+')" opacity="'+alpha+'"/>';
  }
  return {defs,draw};
}

// ----------------------------------------------------------------
// LE SCEAU D'ARCANE
// ----------------------------------------------------------------
// Une seule figure, centrée sur le plateau, tracée UNE fois dans <defs> et
// posée deux fois : en trait clair décalé d'un pixel vers le bas et la
// droite, puis en trait sombre. Deux traits fins en léger décalage, c'est la
// lecture d'une GRAVURE : le creux et son arête éclairée. Ils sont très
// transparents : le sceau se devine quand on regarde le plateau vide, il
// disparaît dès que les pièces y sont.
const RUNES=[
  'M0-6V6M0-6L4-2M0-1L4 3',      // ᚠ
  'M-3-6V6M-3-3L2 0L-3 3',        // ᚦ
  'M0-6V6M-4-3L4 3',              // ᛁ barrée
  'M-3-6V6M3-6V6M-3-2L3 2',       // ᚺ
  'M0-6V6M0-6L4-3M0 0L4-3',       // ᚨ
  'M-4-6L4 6M4-6L-4 6',           // ᚷ
  'M0-6V6M-4-6L0-2L4-6',          // ᛉ
  'M-3-6V6M-3-6L3-3L-3 0L3 6',    // ᚱ
];
function sigil(forme){
  const C=400,R1=236,R2=214;
  let d='<circle cx="400" cy="400" r="'+R1+'"/><circle cx="400" cy="400" r="'+R2+'"/>';
  const pts=(r,k,a0)=>Array.from({length:k},(_,i)=>{
    const a=a0+i*2*Math.PI/k;return [C+r*Math.cos(a),C+r*Math.sin(a)];
  });
  const poly=p=>'M'+p.map(([x,y])=>n(x)+' '+n(y)).join('L')+'Z';
  if(forme==='runes'||forme==='rose'){
    // Vingt-quatre runes dans la couronne, tournées vers le centre.
    for(let i=0;i<24;i++){
      d+='<path transform="rotate('+i*15+' 400 400) translate(400 '+(C-(R1+R2)/2)+')" d="'+RUNES[i%RUNES.length]+'"/>';
    }
  }
  if(forme==='rose'){
    // Rose des vents : huit pointes, longues aux points cardinaux.
    const p=[];
    for(let i=0;i<16;i++){
      const a=-Math.PI/2+i*Math.PI/8;
      const r=i%2===0?(i%4===0?R2-6:R2*.62):R2*.2;
      p.push([C+r*Math.cos(a),C+r*Math.sin(a)]);
    }
    d+='<path d="'+poly(p)+'"/><circle cx="400" cy="400" r="58"/>';
  }
  if(forme==='runes'){
    // L'heptagramme des anciens tailleurs de pierre, inscrit dans l'anneau.
    const p=pts(R2,7,-Math.PI/2);
    d+='<path d="'+poly([0,3,6,2,5,1,4].map(i=>p[i]))+'"/><circle cx="400" cy="400" r="70"/>';
  }
  if(forme==='etoile'){
    // Deux carrés croisés : l'étoile à huit branches.
    d+='<path d="'+poly(pts(R2,4,-Math.PI/2))+poly(pts(R2,4,-Math.PI/4))+'"/>'+
      '<circle cx="400" cy="400" r="'+n(R2*Math.SQRT1_2*.76)+'"/>';
  }
  if(forme==='rosace'){
    // Huit pétales en filigrane : des arcs, pas des pointes.
    for(let i=0;i<8;i++){
      d+='<path transform="rotate('+i*45+' 400 400)" d="M400 400C350 330 360 250 400 '+(C-R2+4)+'C440 250 450 330 400 400Z"/>';
    }
    d+='<circle cx="400" cy="400" r="96"/>';
  }
  if(forme==='soleil'){
    // Trente-deux rayons ondés, alternés longs et courts.
    for(let i=0;i<32;i++){
      const r0=74, r1=i%2?R2*.72:R2-6;
      d+='<path transform="rotate('+n(i*360/32)+' 400 400)" d="M400 '+(C-r0)+'Q406 '+n(C-(r0+r1)/2)+' 400 '+n(C-r1)+'"/>';
    }
    d+='<circle cx="400" cy="400" r="70"/><circle cx="400" cy="400" r="58"/>';
  }
  return '<g id="sg" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</g>';
}

// ----------------------------------------------------------------
// LE PLATEAU
// ----------------------------------------------------------------
function buildSVG(name,m){
  const seed0=name.length*7+3;
  const defs=[],draws={L:[],D:[]};
  m.fil.forEach((L,i)=>{
    ['L','D'].forEach((s,j)=>{
      if(L.seul&&L.seul!==s)return;
      const a=layer(L,s,L.k[0]+s+i,seed0+i*5+j*11);
      defs.push(a.defs);draws[s].push(a.draw);
    });
  });

  // Le dégradé de lumière d'une case : du haut à gauche vers le bas à
  // droite, sur tout le plateau (une seule source de lumière pour tous les
  // carreaux, sinon le damier scintille).
  const grad=(id,c)=>
    '<linearGradient id="'+id+'" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0" stop-color="'+c.hi+'"/><stop offset=".5" stop-color="'+c.base+'"/>'+
      '<stop offset="1" stop-color="'+c.lo+'"/>'+
    '</linearGradient>';

  // LES CARREAUX : un tiers des cases un peu plus claires, un tiers un peu
  // plus sombres, un tiers telles quelles. Deux chemins pour 64 cases.
  const r=rng(seed0*97+13);
  let up='',down='';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const v=r(), sq='M'+x*100+' '+y*100+'h100v100h-100z';
    if(v<.34)down+=sq;else if(v>.66)up+=sq;
  }
  const tiles='<path d="'+up+'" fill="#fff" opacity="'+m.carreaux+'"/>'+
    '<path d="'+down+'" fill="'+m.ombre+'" opacity="'+n(m.carreaux*1.2)+'"/>';

  // LE BISEAU : deux trapèzes par case, dans un motif de 100x100.
  const w=m.biseau.w, W=100-w;
  let bevel='<pattern id="bv" width="100" height="100" patternUnits="userSpaceOnUse">'+
    '<path d="M0 0H100L'+W+' '+w+'H'+w+'V'+W+'L0 100Z" fill="'+m.biseau.hi+'"/>'+
    '<path d="M100 0V100H0L'+w+' '+W+'H'+W+'V'+w+'Z" fill="'+m.biseau.lo+'"/>';
  // LE CADRE CISELÉ (l'or) : un filet en creux à l'intérieur de chaque case,
  // sombre en haut à gauche, clair en bas à droite — l'inverse du biseau,
  // parce qu'un creux reçoit la lumière sur son flanc opposé.
  if(m.cadre){
    const i=m.cadre.i, j=100-i;
    bevel+='<path d="M'+i+' '+j+'V'+i+'H'+j+'" fill="none" stroke="'+m.cadre.fonce+'" stroke-width="1.6"/>'+
      '<path d="M'+i+' '+j+'H'+j+'V'+i+'" fill="none" stroke="'+m.cadre.clair+'" stroke-width="1.6"/>';
  }
  bevel+='</pattern>';

  // LE FILET : sept lignes de chaque sens, tracées une fois et posées trois
  // fois (bord sombre, métal, éclat). Un seul chemin, et non un motif : un
  // trait à cheval sur le bord d'un motif se coupe en deux et laisse
  // paraître une couture à certains zooms.
  let gp='';
  for(let i=1;i<8;i++)gp+='M'+i*100+' 0V800M0 '+i*100+'H800';
  const f=m.filet;
  const grid='<path id="gd" d="'+gp+'"/>';
  const gridDraw=
    '<use href="#gd" stroke="'+f.bord+'" stroke-width="'+n(f.w+1.6)+'"/>'+
    '<use href="#gd" stroke="'+f.metal+'" stroke-width="'+f.w+'"/>'+
    '<use href="#gd" stroke="'+f.eclat+'" stroke-width="'+n(f.w*.32)+'" opacity=".75" transform="translate(-.4 -.4)"/>';

  // LES CLOUS : un motif décalé d'une demi-case, pour que chaque clou tombe
  // au MILIEU d'une tuile de motif (aucune couture possible), posé sur le
  // seul intérieur du plateau (les bords sont au cadre).
  let studs='',studDraw='';
  if(m.clous){
    const c=m.clous;
    studs='<radialGradient id="cg" cx=".35" cy=".32" r=".7"><stop offset="0" stop-color="'+c.eclat+'"/>'+
      '<stop offset=".45" stop-color="'+c.metal+'"/><stop offset="1" stop-color="'+c.bord+'"/></radialGradient>'+
      '<pattern id="cl" x="50" y="50" width="100" height="100" patternUnits="userSpaceOnUse">'+
      '<circle cx="50" cy="50" r="'+n(c.r+1.1)+'" fill="'+c.bord+'" opacity=".7"/>'+
      '<circle cx="50" cy="50" r="'+c.r+'" fill="url(#cg)"/></pattern>';
    studDraw='<rect x="50" y="50" width="700" height="700" fill="url(#cl)"/>';
  }

  const s=m.sceau;
  const sealDraw=
    '<use href="#sg" stroke="'+s.clair+'" opacity="'+n(s.a*.8)+'" transform="translate(1.6 1.6)"/>'+
    '<use href="#sg" stroke="'+s.fonce+'" opacity="'+s.a+'"/>';

  // LA LUMIÈRE : un reflet doux en haut à gauche, des bords plus sombres
  // dans la teinte de la matière.
  let light=
    '<radialGradient id="vig" cx="38%" cy="32%" r="80%">'+
      '<stop offset="0" stop-color="#fff" stop-opacity="'+m.eclat+'"/>'+
      '<stop offset=".55" stop-color="#fff" stop-opacity="0"/>'+
      '<stop offset="1" stop-color="'+m.ombre+'" stop-opacity=".34"/>'+
    '</radialGradient>';
  // LES BANDES DE REFLET. Un métal poli ne se reconnaît pas à sa couleur,
  // mais à ce qu'il REFLÈTE : de grandes bandes claires et sombres, nettes,
  // en biais. Sans elles, un acier est un gris et un or est un jaune.
  if(m.reflets){
    // Les bandes sont TEINTÉES dans la matière (`teinte` : [clair, sombre]).
    // Un reflet blanc et une ombre noire posés sur de l'or le DÉLAVENT et le
    // salissent : l'or reflète un or pâle et s'ombre d'un brun chaud.
    const a=m.reflets, [cl,so]=m.teinte||['#fff','#000'];
    light+='<linearGradient id="rf" x1="0" y1="0" x2="1" y2=".7">'+
      [[0,cl,0],[.16,cl,a],[.26,cl,0],[.4,so,a*.55],[.5,so,0],
       [.6,cl,a*.75],[.66,cl,0],[.82,so,a*.45],[1,cl,0]]
        .map(([o,c,op])=>'<stop offset="'+o+'" stop-color="'+c+'" stop-opacity="'+n(op)+'"/>').join('')+
      '</linearGradient>';
  }

  const side=(s,maskId,gradId)=>
    '<g mask="url(#'+maskId+')">'+
      '<rect width="800" height="800" fill="url(#'+gradId+')"/>'+
      draws[s].join('')+
    '</g>';

  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">\n'+
  '<title>Epic Chess, echiquier '+name+'</title>\n'+
  '<defs>'+
    checkerPattern('pL',[[0,0],[100,100]])+
    checkerPattern('pD',[[100,0],[0,100]])+
    '<mask id="mL"><rect width="800" height="800" fill="url(#pL)"/></mask>'+
    '<mask id="mD"><rect width="800" height="800" fill="url(#pD)"/></mask>'+
    grad('lgL',m.light)+grad('lgD',m.dark)+
    defs.join('')+bevel+grid+studs+sigil(s.forme)+light+
  '</defs>\n'+
  '<rect width="800" height="800" fill="'+m.dark.base+'"/>\n'+
  side('L','mL','lgL')+'\n'+
  side('D','mD','lgD')+'\n'+
  tiles+'\n'+
  (m.reflets?'<rect width="800" height="800" fill="url(#rf)"/>\n':'')+
  sealDraw+'\n'+
  '<rect width="800" height="800" fill="url(#bv)"/>\n'+
  '<g fill="none">'+gridDraw+'</g>\n'+
  studDraw+'\n'+
  '<rect width="800" height="800" fill="url(#vig)"/>\n'+
  '</svg>\n';
}

fs.mkdirSync(OUT,{recursive:true});
Object.entries(MATERIALS).forEach(([name,m])=>{
  const file=path.join(OUT,name+'.svg');
  fs.writeFileSync(file,buildSVG(name,m));
  console.log('ecrit',path.relative(path.join(__dirname,'..'),file),fs.statSync(file).size+' o');
});
