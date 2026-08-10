#!/usr/bin/env node
// ================================================================
// GEN-DUEL-BG.JS : fond de l'écran d'attente d'un duel en ligne
// ================================================================
// Écrit assets/backgrounds/duel-wait.svg, la toile affichée pendant qu'on
// cherche un adversaire humain : un échiquier emporté dans un vortex de
// nuages, fêlé de braise, ses pièces arrachées et suspendues autour.
//
// POURQUOI UN GÉNÉRATEUR ET NON UNE IMAGE ?
// Le reste du jeu suit déjà cette règle (assets/boards/*.svg viennent de
// tools/gen-boards.js) : un SVG procédural pèse quelques kilo-octets, reste
// net à toutes les résolutions, et se retouche en changeant un nombre au lieu
// de rouvrir un éditeur d'images. La perspective de l'échiquier est une vraie
// projection (et non une déformation affine), c'est ce qui fait que les cases
// du fond rétrécissent correctement.
//
// Le fond est REMPLAÇABLE sans toucher au code : la CSS empile
// `duel-wait.png` par-dessus ce SVG (voir [MP-WAIT] dans css/style.css).
// Déposer un vrai fichier peint à ce nom suffit à le faire apparaître ; son
// absence n'est pas une erreur, c'est le cas normal.
//
//   node tools/gen-duel-bg.js
// ================================================================

const fs=require('fs');
const path=require('path');

const W=1600,H=900;
const OUT=path.resolve(__dirname,'..','assets','backgrounds','duel-wait.svg');

// Palette : celle du thème sombre du jeu (voir [THEME] dans css/style.css).
const C={
  night:'#070a0d', deep:'#0e1216', cloud:'#1d2a33', mist:'#33505f',
  ember:'#d9552f', emberHot:'#ffb459', gold:'#c19a45', gold2:'#e6c576',
  bone:'#d9d3c4', shadow:'#0b0f13',
};

// ----------------------------------------------------------------
// PROJECTION PERSPECTIVE
// ----------------------------------------------------------------
// Caméra posée à EYE unités au-dessus du plan de l'échiquier, regardant
// l'horizon. Un point du sol (x, z) — z = profondeur, croissante vers le
// fond — se projette d'autant plus près de la ligne d'horizon qu'il est loin.
// Réglés pour que l'échiquier tienne ENTIER dans le bas du cadre : le bord
// proche à ~y=820 et large de 900 px, le bord lointain à ~y=560. Toucher à
// l'un de ces quatre nombres déplace les trois autres, la géométrie est liée.
const FOCAL=485, EYE=3.55, HORIZON=420, CX=W/2;
const proj=(x,z)=>[CX+(x*FOCAL)/z, HORIZON+(EYE*FOCAL)/z];
const fmt=n=>Math.round(n*10)/10;
const pt=(x,z)=>{const[a,b]=proj(x,z);return fmt(a)+','+fmt(b);};

// Suite déterministe : le fond est le même à chaque génération, sinon un
// simple `node tools/gen-duel-bg.js` produirait un diff illisible.
let _seed=20260810;
const rnd=()=>{_seed=(_seed*1103515245+12345)&0x7fffffff;return _seed/0x7fffffff;};
const between=(a,b)=>a+rnd()*(b-a);

// ----------------------------------------------------------------
// L'ÉCHIQUIER
// ----------------------------------------------------------------
// 8×8 cases d'une unité, centrées sur x=0, de z=Z0 (au premier plan) à
// z=Z0+8 (au fond). Chaque case est un quadrilatère projeté : les quatre
// coins passent par proj(), donc les rangées du fond s'écrasent d'elles-mêmes.
const Z0=4.31, HALF=4;
function boardCells(){
  let out='';
  for(let row=0;row<8;row++){
    for(let col=0;col<8;col++){
      if((row+col)%2)continue;                       // une case sur deux
      const x0=-HALF+col, x1=x0+1, z0=Z0+row, z1=z0+1;
      // Les cases du fond s'effacent : la lumière du vortex les mange.
      const op=(0.30-row*0.026).toFixed(3);
      out+='<polygon points="'+pt(x0,z0)+' '+pt(x1,z0)+' '+pt(x1,z1)+' '+pt(x0,z1)+
        '" fill="'+C.bone+'" opacity="'+op+'"/>';
    }
  }
  return out;
}
// Les fêlures : les lignes du damier, mais incandescentes. C'est l'échiquier
// lui-même qui se fend, pas un décor posé dessus.
function boardCracks(){
  let out='';
  for(let i=0;i<=8;i++){
    out+='<line x1="'+pt(-HALF+i,Z0).split(',')[0]+'" y1="'+pt(-HALF+i,Z0).split(',')[1]+
         '" x2="'+pt(-HALF+i,Z0+8).split(',')[0]+'" y2="'+pt(-HALF+i,Z0+8).split(',')[1]+'"/>';
    const [ax,ay]=proj(-HALF,Z0+i), [bx,by]=proj(HALF,Z0+i);
    out+='<line x1="'+fmt(ax)+'" y1="'+fmt(ay)+'" x2="'+fmt(bx)+'" y2="'+fmt(by)+'"/>';
  }
  return out;
}

// ----------------------------------------------------------------
// LES PIÈCES
// ----------------------------------------------------------------
// Silhouettes pleines dans un carré de 100, posées sur leur base (y=100) et
// centrées en x=50 : elles se placent ensuite par une simple homothétie.
const SILHOUETTES={
  pion:'M50 8c-9 0-16 7-16 16 0 5 2 9 6 12-8 6-13 16-15 28h50c-2-12-7-22-15-28 4-3 6-7 6-12 0-9-7-16-16-16z'+
       'M22 66h56l6 12H16zM12 80h76c5 0 8 4 8 9v11H4V89c0-5 3-9 8-9z',
  tour:'M20 6h14v11h9V6h14v11h9V6h14v26l-9 8v32l11 26H18l11-26V40l-9-8z'+
       'M10 82h80c4 0 6 3 6 8v10H4V90c0-5 2-8 6-8z',
  roi:'M44 0h12v11h11v12H56v14H44V23H33V11h11z'+
      'M22 56 15 24l19 14 16-20 16 20 19-14-7 32z'+
      'M24 60h52l-5 18c10 7 15 12 15 22H14c0-10 5-15 15-22z'+
      'M10 100h80z',
  fou:'M50 2c8 0 14 6 14 13 0 4-2 8-5 10 12 11 20 24 20 34 0 13-13 23-29 23S21 72 21 59c0-10 8-23 20-34-3-2-5-6-5-10C36 8 42 2 50 2z'+
      'M26 82h48l6 10H20zM14 96h72v6H14z',
  cavalier:'M62 4l5-12 9 12zM34 100c0-17 2-29 8-40l-11 8c-9 6-19 3-21-6-3-11 3-22 12-31C30 24 39 18 46 11c6-6 9-11 11-19l9 9 8-8c15 12 26 30 30 49 4 19 5 39 5 58z',
};
// Chaque pièce : [type, x, y, taille, rotation, opacité]. Placées à la main —
// elles doivent tourner AUTOUR du vortex et laisser le centre respirer, ce
// qu'un tirage au sort ne garantit pas.
const FLOATING=[
  ['tour',      180, 620, 215, -13, .95],   // premier plan gauche
  ['roi',       338, 268, 104,  24, .82],
  ['pion',      520, 168,  64, -28, .62],
  ['fou',       690, 258,  56,  15, .55],
  ['cavalier',  835, 120,  50, -20, .45],
  ['pion',      980, 214,  46,  32, .45],
  ['tour',     1120, 130,  58, -36, .5 ],
  ['fou',      1300, 250,  78,  20, .6 ],
  ['cavalier', 1418, 430, 104, -14, .72],
  ['roi',      1470, 690, 168,  18, .9 ],   // premier plan droit
  ['pion',      112, 300,  76,  27, .6 ],
  ['cavalier',  270, 128,  44, -24, .4 ],
];
function floatingPieces(){
  return FLOATING.map(([id,x,y,s,rot,op])=>{
    const k=s/100;
    return '<g transform="translate('+x+' '+y+') rotate('+rot+') scale('+fmt(k)+') translate(-50 -100)" '+
      'opacity="'+op+'" filter="url(#soft)">'+
      '<path d="'+SILHOUETTES[id]+'" fill="url(#stone)"/>'+
      '<path d="'+SILHOUETTES[id]+'" fill="none" stroke="'+C.emberHot+'" stroke-width="'+fmt(1.4/k)+'" opacity=".35"/>'+
    '</g>';
  }).join('');
}

// ----------------------------------------------------------------
// LE VORTEX
// ----------------------------------------------------------------
// Des ellipses concentriques, de plus en plus inclinées : l'œil les lit comme
// une spirale qui s'enfonce, ce qu'une vraie spirale rendrait plus salement.
function vortex(){
  let out='';
  for(let i=0;i<14;i++){
    const k=i/13;
    const rx=fmt(180+k*980), ry=fmt(120+k*620);
    const rot=fmt(-18+k*46);
    out+='<ellipse cx="1120" cy="300" rx="'+rx+'" ry="'+ry+'" transform="rotate('+rot+' 1120 300)" '+
      'fill="none" stroke="'+(i%3===0?C.ember:C.mist)+'" stroke-width="'+fmt(0.8+k*2.4)+'" '+
      'opacity="'+(0.05+(1-k)*0.16).toFixed(3)+'"/>';
  }
  return out;
}
// Éclats de braise : la poussière du vortex. Tirés au sort, mais avec une
// graine fixe (voir rnd) — le fond ne bouge pas d'une génération à l'autre.
function sparks(){
  let out='';
  for(let i=0;i<150;i++){
    const a=between(0,Math.PI*2), r=between(120,1000);
    const x=fmt(1120+r*Math.cos(a)*1.05), y=fmt(300+r*Math.sin(a)*0.62);
    if(x<-40||x>W+40||y<-40||y>H+40)continue;
    out+='<circle cx="'+x+'" cy="'+y+'" r="'+fmt(between(0.8,3.2))+'" fill="'+
      (rnd()<0.6?C.emberHot:C.gold2)+'" opacity="'+between(0.15,0.85).toFixed(2)+'"/>';
  }
  return out;
}

const svg=
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
     preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Un échiquier emporté dans un vortex de nuages, ses pièces suspendues autour">
<!-- ENGENDRÉ PAR tools/gen-duel-bg.js — NE PAS ÉDITER À LA MAIN.
     Relancer : node tools/gen-duel-bg.js -->
<defs>
  <radialGradient id="sky" cx="61%" cy="33%" r="78%">
    <stop offset="0%" stop-color="#243543"/>
    <stop offset="42%" stop-color="${C.cloud}" stop-opacity=".85"/>
    <stop offset="100%" stop-color="${C.night}"/>
  </radialGradient>
  <radialGradient id="eye" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#fff6df" stop-opacity=".95"/>
    <stop offset="34%" stop-color="${C.emberHot}" stop-opacity=".45"/>
    <stop offset="100%" stop-color="${C.ember}" stop-opacity="0"/>
  </radialGradient>
  <!-- Vignette SOMBRE (et non chaude) : elle doit enfoncer les bords, pas
       poser un halo orange sur le cadre. -->
  <radialGradient id="rim" cx="52%" cy="46%" r="72%">
    <stop offset="42%" stop-color="${C.night}" stop-opacity="0"/>
    <stop offset="78%" stop-color="${C.night}" stop-opacity=".55"/>
    <stop offset="100%" stop-color="#000" stop-opacity=".92"/>
  </radialGradient>
  <!-- Halo chaud, lui, cantonné autour de l'œil du vortex. -->
  <radialGradient id="warm" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${C.ember}" stop-opacity=".34"/>
    <stop offset="100%" stop-color="${C.ember}" stop-opacity="0"/>
  </radialGradient>
  <!-- Les pièces sont éclairées PAR LE VORTEX, c'est-à-dire par en haut à
       droite : le dégradé va donc du clair (arête tournée vers la lumière) au
       noir. Sans cette arête claire, une silhouette sombre sur un ciel sombre
       n'existe tout simplement pas. -->
  <linearGradient id="stone" x1="1" y1="0" x2="0.15" y2="1">
    <stop offset="0%" stop-color="#5d666e"/>
    <stop offset="30%" stop-color="#2c343b"/>
    <stop offset="100%" stop-color="${C.shadow}"/>
  </linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.night}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${C.night}" stop-opacity=".92"/>
  </linearGradient>
  <!-- Nuages : du bruit fractal teinté, seul moyen d'obtenir une matière
       nuageuse sans embarquer une image matricielle. -->
  <filter id="clouds" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0016 0.0034" numOctaves="6" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" result="t"
      values="0 0 0 0 0.22  0 0 0 0 0.31  0 0 0 0 0.38  1.6 0.8 0 0 -0.62"/>
    <feGaussianBlur in="t" stdDeviation="2"/>
  </filter>
  <!-- Seconde passe, plus fine et plus chaude : c'est le contraste entre les
       deux qui donne du relief aux nuages. Une seule couche restait plate. -->
  <filter id="clouds2" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.0072" numOctaves="4" seed="19" result="n"/>
    <feColorMatrix in="n" type="matrix" result="t"
      values="0 0 0 0 0.52  0 0 0 0 0.33  0 0 0 0 0.18  1.4 0.5 0 0 -0.78"/>
    <feGaussianBlur in="t" stdDeviation="4"/>
  </filter>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="7" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="soft" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity=".55"/>
  </filter>
</defs>

<rect width="${W}" height="${H}" fill="${C.night}"/>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" filter="url(#clouds)" opacity=".9"/>
<rect width="${W}" height="${H}" filter="url(#clouds2)" opacity=".5"/>
<ellipse cx="1120" cy="300" rx="720" ry="470" fill="url(#warm)"/>

<!-- Le vortex, et l'œil de lumière au bout -->
<g>${vortex()}</g>
<ellipse cx="1150" cy="272" rx="300" ry="195" fill="url(#eye)"/>

<!-- L'échiquier, incliné : il tombe dans le vortex, il n'est pas posé -->
<g transform="rotate(-6 800 700)">
  <g opacity=".95">${boardCells()}</g>
  <g stroke="${C.emberHot}" stroke-width="1.3" opacity=".42" filter="url(#glow)">${boardCracks()}</g>
</g>
<rect y="${H-150}" width="${W}" height="150" fill="url(#floor)"/>

<g>${sparks()}</g>
${floatingPieces()}

<!-- Vignette : elle ramène l'œil au centre, là où le chronomètre s'affiche -->
<rect width="${W}" height="${H}" fill="url(#rim)"/>
</svg>
`;

fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,svg);
console.log('écrit : '+path.relative(process.cwd(),OUT)+' ('+(svg.length/1024).toFixed(1)+' Ko)');
