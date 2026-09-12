// ================================================================
// GEN-BOARDS.JS : génère les 5 textures d'échiquier de assets/boards/
// ================================================================
// Usage : node tools/gen-boards.js
//
// Chaque échiquier est un SVG de 800x800 (8 cases de 100) entièrement
// procédural : aucune image bitmap, donc quelques kilo-octets par plateau et
// une netteté parfaite à toutes les tailles.
//
// Principe : deux masques en damier (cases claires / cases sombres) ; sous
// chaque masque on empile une couleur de base, un dégradé de matière et un
// bruit filtré (feTurbulence) dont la fréquence donne son caractère au
// matériau (fibres étirées pour le bois, veines pour la pierre, stries fines
// pour l'acier...). Le grain des cases claires est perpendiculaire à celui
// des cases sombres, comme sur un vrai plateau marqueté.
//
// `marbre` (facultatif, 0,14 par défaut) : l'opacité de la NAPPE DE VEINES qui
// traverse tout le plateau, par-dessus les deux teintes de case. À ne pas
// confondre avec `grain`, qui est le fil de la matière DANS chaque case. Voir
// le pavé sur le grain de marbre dans buildSVG.
//
// Pour ajouter un matériau : ajoutez une entrée dans MATERIALS et relancez le
// script. Pensez à référencer le nouveau plateau dans BOARD_SKINS
// (js/data-pieces.js) pour qu'il soit sélectionnable en jeu.
// ================================================================

const fs=require('fs');
const path=require('path');

const OUT=path.join(__dirname,'..','assets','boards');

// grain : [freqX, freqY] de feTurbulence. Un X faible et un Y fort donnent
// des bandes horizontales (fibres) ; deux valeurs proches donnent un nuage
// (marbrure). octaves : plus il y en a, plus le grain est détaillé.
const MATERIALS={
  bois:{
    light:{base:'#c8a06a',tint1:'#dcb884',tint2:'#a87f4d'},
    dark:{base:'#6d4526',tint1:'#82552f',tint2:'#4d2f18'},
    grain:[0.006,0.16],octaves:5,opacity:0.55,blend:'multiply',
    edge:'rgba(48,28,12,.55)',sheen:0.10,
  },
  pierre:{
    light:{base:'#cfc9bd',tint1:'#e2ddd3',tint2:'#b3aca0'},
    dark:{base:'#4c4a49',tint1:'#5d5b5a',tint2:'#343232'},
    grain:[0.022,0.028],octaves:4,opacity:0.62,blend:'multiply',
    // La pierre EST du marbre : c'est la seule matière où la veine a le droit
    // de se voir franchement.
    marbre:0.24,
    edge:'rgba(20,20,22,.45)',sheen:0.06,
  },
  acier:{
    light:{base:'#b6bcc2',tint1:'#d3d8dc',tint2:'#959ba1'},
    dark:{base:'#6b7278',tint1:'#7c8389',tint2:'#4e5459'},
    grain:[0.9,0.004],octaves:2,opacity:0.34,blend:'overlay',
    edge:'rgba(18,22,26,.5)',sheen:0.20,
  },
  argent:{
    light:{base:'#dee2e6',tint1:'#f5f7f9',tint2:'#c0c6cc'},
    dark:{base:'#7e878f',tint1:'#949da4',tint2:'#5e666d'},
    grain:[1.2,0.003],octaves:2,opacity:0.26,blend:'overlay',
    edge:'rgba(40,48,56,.45)',sheen:0.30,
  },
  or:{
    light:{base:'#e2c069',tint1:'#f6dc92',tint2:'#c39f45'},
    dark:{base:'#9c7020',tint1:'#b78a30',tint2:'#6f4f0f'},
    grain:[0.5,0.006],octaves:3,opacity:0.30,blend:'overlay',
    edge:'rgba(70,48,8,.5)',sheen:0.26,
  },
};

// Le damier : un motif de 200x200 contenant 2 cases blanches. Utilisé comme
// masque (le blanc laisse passer, le noir cache), donc un motif suffit pour
// les 32 cases d'une couleur.
function checkerPattern(id,offsets){
  return '<pattern id="'+id+'" width="200" height="200" patternUnits="userSpaceOnUse">'+
    '<rect width="200" height="200" fill="#000"/>'+
    offsets.map(([x,y])=>'<rect x="'+x+'" y="'+y+'" width="100" height="100" fill="#fff"/>').join('')+
    '</pattern>';
}

function materialLayer(m,side,maskId,grainId,gradId){
  const c=m[side];
  return '<g mask="url(#'+maskId+')">'+
    '<rect width="800" height="800" fill="'+c.base+'"/>'+
    '<rect width="800" height="800" fill="url(#'+gradId+')"/>'+
    '<rect width="800" height="800" filter="url(#'+grainId+')" opacity="'+m.opacity+'" style="mix-blend-mode:'+m.blend+'"/>'+
    '</g>';
}

function buildSVG(name,m){
  const [fx,fy]=m.grain;
  // Grain des cases claires : orienté dans un sens. Grain des cases sombres :
  // fréquences inversées, donc perpendiculaire, comme un placage tourné d'un
  // quart de tour d'une case à l'autre.
  const turb=(id,bx,by)=>
    '<filter id="'+id+'" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'+
      '<feTurbulence type="fractalNoise" baseFrequency="'+bx+' '+by+'" numOctaves="'+m.octaves+'" seed="'+(name.length*7+3)+'" stitchTiles="stitch"/>'+
      '<feColorMatrix type="saturate" values="0"/>'+
      '<feComponentTransfer><feFuncA type="linear" slope="1"/></feComponentTransfer>'+
    '</filter>';

  // ----------------------------------------------------------------
  // LE GRAIN DE MARBRE, PAR-DESSUS TOUT LE PLATEAU
  // ----------------------------------------------------------------
  // Chaque case avait déjà SON grain de matière : fibres étirées pour le bois,
  // stries fines pour l'acier, et perpendiculaire d'une case à l'autre comme
  // sur un vrai plateau marqueté. C'est juste, et ça s'arrête au bord de la
  // case : le plateau se lisait comme soixante-quatre carreaux posés côte à
  // côte, jamais comme UNE dalle taillée dans un bloc.
  //
  // Ce second bruit-ci est l'inverse du premier à tous points de vue, et c'est
  // ce qui les rend complémentaires : il est BASSE FRÉQUENCE (0,004 : des
  // nappes larges de deux cases, pas un grain), il est ISOTROPE (la même
  // fréquence en X et en Y, donc aucune direction — une veine de marbre ne
  // suit pas le fil), et surtout il n'est PAS MASQUÉ par le damier : il court
  // d'un bord à l'autre, par-dessus les deux teintes de case. C'est
  // exactement ce qui manquait : une veine qui traverse la frontière entre
  // deux cases dit que les deux sont taillées dans la même pierre.
  //
  // `numOctaves=2` et non 5 : on veut des nappes, pas du détail. Chaque octave
  // supplémentaire est une passe de bruit de plus à calculer, et ce filtre
  // couvre les 640 000 pixels du plateau — sur un téléphone lent, c'est le
  // genre de générosité qui se paie au premier rendu.
  //
  // Il est posé en `overlay` à faible opacité : ce mode éclaircit ce qui est
  // clair et assombrit ce qui est sombre, donc il module la matière déjà là au
  // lieu de la recouvrir d'un voile gris. À 0,14, on ne le VOIT pas ; on voit
  // que le plateau n'est plus plat.
  const marbre=
    '<filter id="mb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'+
      '<feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="2" seed="'+(name.length*13+11)+'" stitchTiles="stitch"/>'+
      '<feColorMatrix type="saturate" values="0"/>'+
    '</filter>';

  const grad=(id,c)=>
    '<linearGradient id="'+id+'" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0" stop-color="'+c.tint1+'" stop-opacity=".85"/>'+
      '<stop offset="1" stop-color="'+c.tint2+'" stop-opacity=".85"/>'+
    '</linearGradient>';

  // Filet entre les cases : 64 traits seraient inutiles, un motif de grille
  // dessine la même chose en 4 lignes.
  const grid='<pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">'+
    '<path d="M100 0V100M0 100H100" fill="none" stroke="'+m.edge+'" stroke-width="1.4"/></pattern>';

  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" shape-rendering="crispEdges">\n'+
  '<title>Epic Chess, echiquier '+name+'</title>\n'+
  '<defs>'+
    checkerPattern('pL',[[0,0],[100,100]])+
    checkerPattern('pD',[[100,0],[0,100]])+
    '<mask id="mL"><rect width="800" height="800" fill="url(#pL)"/></mask>'+
    '<mask id="mD"><rect width="800" height="800" fill="url(#pD)"/></mask>'+
    turb('gH',fx,fy)+turb('gV',fy,fx)+marbre+
    grad('lgL',m.light)+grad('lgD',m.dark)+
    grid+
    // Lueur douce au centre + assombrissement des bords : sans ce modelé le
    // plateau paraît parfaitement plat et un peu mort.
    '<radialGradient id="vig" cx="50%" cy="42%" r="72%">'+
      '<stop offset="0" stop-color="#fff" stop-opacity="'+m.sheen+'"/>'+
      '<stop offset=".62" stop-color="#fff" stop-opacity="0"/>'+
      '<stop offset="1" stop-color="#000" stop-opacity=".26"/>'+
    '</radialGradient>'+
  '</defs>\n'+
  materialLayer(m,'light','mL','gH','lgL')+'\n'+
  materialLayer(m,'dark','mD','gV','lgD')+'\n'+
  // Le marbre passe AVANT le filet des cases et avant le modelé : il fait
  // partie de la matière, il ne se pose pas sur le mobilier.
  '<rect width="800" height="800" filter="url(#mb)" opacity="'+(m.marbre===undefined?0.14:m.marbre)+'" style="mix-blend-mode:overlay"/>\n'+
  '<rect width="800" height="800" fill="url(#grid)"/>\n'+
  '<rect width="800" height="800" fill="url(#vig)"/>\n'+
  '</svg>\n';
}

fs.mkdirSync(OUT,{recursive:true});
Object.entries(MATERIALS).forEach(([name,m])=>{
  const file=path.join(OUT,name+'.svg');
  fs.writeFileSync(file,buildSVG(name,m));
  console.log('ecrit',path.relative(path.join(__dirname,'..'),file),fs.statSync(file).size+' o');
});
