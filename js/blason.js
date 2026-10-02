// ================================================================
// BLASON.JS : les blasons des clans, dessinés en SVG
// ================================================================
// Un clan se reconnaît à son BLASON avant son nom : c'est ce qu'on voit
// dans la liste des clans, au front de la guerre, dans le menu, sur le
// rail d'ordinateur et à côté d'un pseudo. Il n'y a donc pas d'image à
// téléverser — un fichier serait un texte libre de plus, avec tout ce que
// ça demande de modération — mais une grammaire héraldique : six numéros,
// et ce fichier les peint.
//
//   s   la FORME de l'écu      (BLAZON_SHAPES, 5)
//   d   la PARTITION du champ  (BLAZON_DIVISIONS, 8)
//   c1  le premier émail       (BLAZON_TINCTURES, 10)
//   c2  le second émail        (idem)
//   ch  le MEUBLE              (BLAZON_CHARGES, 14 — dont « aucun »)
//   cc  l'émail du meuble      (BLAZON_TINCTURES)
//
// LES TAILLES DE CES CATALOGUES SONT UN CONTRAT AVEC LE SERVEUR. Le serveur
// borne chaque numéro (ec_clan_blazon_clean, supabase/schema.sql, et son
// miroir EC_BLAZON_SPEC dans js/server.js) : ajouter une forme ici sans
// monter la borne là-bas la ferait retomber à zéro à l'enregistrement. On
// AJOUTE en fin de liste, on ne réordonne jamais — un numéro enregistré
// doit dessiner demain ce qu'il dessinait hier.
//
// LE NIVEAU DU CLAN EST LE MÉTAL DU CADRE. Les sept niveaux portent les noms
// des rangs de joueur (Bois → Or Légendaire, voir ec_clan_level) et le
// bord de l'écu prend leur couleur ; à partir de l'Obsidienne, un cimier
// se pose au-dessus, et l'Or Légendaire reçoit ses lauriers. Le même blason
// dit donc QUI, et depuis combien de temps il se bat.
//
// Les meubles d'échecs (tour, cavalier, roi, dame) ne sont PAS redessinés :
// ce sont les silhouettes du plateau (PIECE_ART, js/piece-art.js), posées
// sur l'écu. Un blason d'Epic Chess porte les pièces d'Epic Chess.
//
// Dépendances : piece-art.js (pieceArtFor), facultatif — sans lui les
// quatre meubles d'échecs retombent sur l'étoile.
// Utilisé par : clans.js, leaderboard.js, accounts.js (menu), pages-nav.js.
// ================================================================

const BLAZON_SPEC={s:5,d:8,c1:10,c2:10,ch:14,cc:10};

// LES ÉMAUX. Les cinq noms héraldiques classiques, plus les trois couleurs
// du jeu (vert-de-gris, ardoise, cuivre) : un blason d'Epic Chess doit
// pouvoir porter la palette d'Epic Chess.
const BLAZON_TINCTURES=[
  {id:'or',      name:'Or',            c:'#d9ad3f'},
  {id:'argent',  name:'Argent',        c:'#ece9e1'},
  {id:'gueules', name:'Gueules',       c:'#b52a2f'},
  {id:'azur',    name:'Azur',          c:'#2c5aa8'},
  {id:'sinople', name:'Sinople',       c:'#2f7d4a'},
  {id:'sable',   name:'Sable',         c:'#1c1f23'},
  {id:'pourpre', name:'Pourpre',       c:'#6e3b8f'},
  {id:'vdg',     name:'Vert-de-gris',  c:'#2fb497'},
  {id:'ardoise', name:'Ardoise',       c:'#4d5e6b'},
  {id:'cuivre',  name:'Cuivre',        c:'#b86a30'},
];

// LES FORMES, dans un repère de 100 × 120 : l'écu est plus haut que large.
const BLAZON_SHAPES=[
  {id:'ecu',      name:'Écu',       d:'M10 8H90V54C90 82 72 101 50 113 28 101 10 82 10 54Z'},
  {id:'francais', name:'Français',  d:'M10 8H90V80Q90 100 70 100H58Q52 100 50 113 48 100 42 100H30Q10 100 10 80Z'},
  {id:'rondache', name:'Rondache',  d:'M50 12A48 48 0 1 1 49.99 12Z'},
  {id:'losange',  name:'Losange',   d:'M50 6 94 60 50 114 6 60Z'},
  {id:'gonfanon', name:'Gonfanon',  d:'M10 8H90V90L77 113 64 92 50 113 36 92 23 113 10 90Z'},
];

// LES PARTITIONS : ce que le second émail recouvre. Tout est dessiné sur le
// repère entier puis découpé par la forme (clipPath) — une partition ne
// connaît donc pas la forme de l'écu, et chaque combinaison tombe juste.
const BLAZON_DIVISIONS=[
  {id:'plein',    name:'Plein',      d:''},
  {id:'parti',    name:'Parti',      d:'M50 0H100V120H50Z'},
  {id:'coupe',    name:'Coupé',      d:'M0 60H100V120H0Z'},
  {id:'tranche',  name:'Tranché',    d:'M0 0 100 120H0Z'},
  {id:'ecartele', name:'Écartelé',   d:'M50 0H100V60H50ZM0 60H50V120H0Z'},
  {id:'chevron',  name:'Chevronné',  d:'M0 120 50 52 100 120Z'},
  {id:'sautoir',  name:'Sautoir',    d:'M0 0H14L100 106V120H86L0 14ZM100 0V14L14 120H0V106L86 0Z'},
  {id:'pale',     name:'Palé',       d:'M20 0H40V120H20ZM60 0H80V120H60Z'},
];

// Une étoile et un soleil se calculent mieux qu'ils ne se recopient.
function blazonStarPath(cx,cy,R,r,n){
  let d='';
  for(let i=0;i<n*2;i++){
    const a=-Math.PI/2+i*Math.PI/n,rr=i%2?r:R;
    d+=(i?'L':'M')+(cx+Math.cos(a)*rr).toFixed(1)+' '+(cy+Math.sin(a)*rr).toFixed(1);
  }
  return d+'Z';
}

// LES MEUBLES, dans un carré de 100 : les mêmes classes que les pièces du
// plateau — .b plein et cerné, .l trait seul, .k aplat de contraste.
const BLAZON_CHARGES=[
  {id:'tour',      name:'Tour',          piece:'tour-primordiale'},
  {id:'cavalier',  name:'Cavalier',      piece:'cavalier-primordial'},
  {id:'roi',       name:'Roi',           piece:'roi'},
  {id:'dame',      name:'Dame',          piece:'dame'},
  {id:'epee',      name:'Épée',          art:
    '<path class="b" d="M50 4 55 15 54 62H46L45 15Z"/>'+
    '<path class="b" d="M28 61H72V70H28Z"/>'+
    '<path class="b" d="M46 70H54V86H46Z"/>'+
    '<circle class="b" cx="50" cy="91" r="6"/>'},
  {id:'etoile',    name:'Étoile',        art:'<path class="b" d="'+blazonStarPath(50,53,44,18,5)+'"/>'},
  {id:'flamme',    name:'Flamme',        art:
    '<path class="b" d="M50 4C60 22 80 34 76 62 73 84 61 96 50 96 39 96 26 84 24 62 23 46 33 38 37 25 41 37 46 42 50 44 49 30 45 19 50 4Z"/>'+
    '<path class="k" d="M50 52C56 62 63 68 60 80 58 88 54 90 50 90 46 90 41 87 40 80 39 72 45 66 50 52Z"/>'},
  {id:'lys',       name:'Fleur de lys',  art:
    '<path class="b" d="M50 5C61 19 63 37 55 57H45C37 37 39 19 50 5Z"/>'+
    '<path class="b" d="M44 58C29 61 15 52 13 37 22 44 31 44 38 39 34 49 38 55 44 58Z"/>'+
    '<path class="b" d="M56 58C71 61 85 52 87 37 78 44 69 44 62 39 66 49 62 55 56 58Z"/>'+
    '<path class="b" d="M28 57H72V66H28Z"/>'+
    '<path class="b" d="M44 66C41 79 35 86 25 91H75C65 86 59 79 56 66Z"/>'},
  {id:'soleil',    name:'Soleil',        art:
    '<path class="b" d="'+blazonStarPath(50,50,46,27,12)+'"/>'+
    '<circle class="b" cx="50" cy="50" r="20"/>'},
  {id:'croissant', name:'Croissant',     art:'<path class="b" d="M62 8A44 44 0 1 0 62 92 36 36 0 1 1 62 8Z"/>'},
  {id:'eclair',    name:'Éclair',        art:'<path class="b" d="M60 3 25 57H47L38 97 76 39H54Z"/>'},
  {id:'crane',     name:'Crâne',         art:
    '<path class="b" d="M50 8C73 8 86 25 86 44 86 58 78 64 73 68V82H27V68C22 64 14 58 14 44 14 25 27 8 50 8Z"/>'+
    '<circle class="k" cx="35" cy="46" r="9"/><circle class="k" cx="65" cy="46" r="9"/>'+
    '<path class="k" d="M50 56 44 67H56Z"/>'+
    '<path class="l" d="M39 72V82M50 72V82M61 72V82"/>'},
  {id:'fiole',     name:'Fiole',         art:
    '<path class="b" d="M41 6H59V13H56V35L81 81C85 90 80 97 71 97H29C20 97 15 90 19 81L44 35V13H41Z"/>'+
    '<path class="k" d="M30 70H70L76 84C78 89 76 91 71 91H29C24 91 22 89 24 84Z"/>'},
  {id:'aucun',     name:'Aucun',         art:''},
];

// LES SEPT NIVEAUX, et le métal du cadre de chacun (cf. ec_clan_level).
const CLAN_LEVELS=[
  {id:'bois',       name:'Bois',          at:0,     metal:'#8a5a35', hi:'#c08a5a'},
  {id:'pierre',     name:'Pierre',        at:500,   metal:'#8e9297', hi:'#c9ccd0'},
  {id:'bronze',     name:'Bronze',        at:1500,  metal:'#b07a3c', hi:'#e3ac69'},
  {id:'acier',      name:'Acier',         at:4000,  metal:'#7f98a8', hi:'#cfe0ea'},
  {id:'obsidienne', name:'Obsidienne',    at:10000, metal:'#4b3570', hi:'#a98ae0'},
  {id:'argent',     name:'Argent',        at:25000, metal:'#b9bec4', hi:'#ffffff'},
  {id:'or',         name:'Or Légendaire', at:60000, metal:'#c9962e', hi:'#ffe9a8'},
];
function clanLevelOf(points){
  let l=0;CLAN_LEVELS.forEach((x,i)=>{if((points||0)>=x.at)l=i;});return l;
}

// Un blason valide à partir de n'importe quoi : c'est la même borne que le
// serveur, appliquée AVANT l'envoi pour que l'aperçu ne mente jamais.
function blazonClean(b){
  const o={};
  Object.keys(BLAZON_SPEC).forEach(k=>{
    const v=parseInt(b&&b[k],10);
    o[k]=(isFinite(v)&&v>=0&&v<BLAZON_SPEC[k])?v:0;
  });
  return o;
}

// LE HASARD BIEN ÉLEVÉ. Deux émaux tirés au sort tombent une fois sur dix
// sur le même, et un meuble d'or sur un champ d'or ne se voit pas : le tirage
// écarte les deux, et respecte la règle de contrariété des émaux à la
// manière des hérauts — couleur sur métal, métal sur couleur (or et argent
// sont les deux métaux).
function blazonRandom(){
  const n=BLAZON_TINCTURES.length,R=k=>Math.floor(Math.random()*k);
  const metal=i=>i===0||i===1;
  const c1=R(n);
  let c2=R(n);while(c2===c1)c2=R(n);
  let cc=R(n);let guard=0;
  while((cc===c1||cc===c2||metal(cc)===metal(c1))&&guard++<40)cc=R(n);
  return {s:R(BLAZON_SPEC.s),d:R(BLAZON_SPEC.d),c1,c2,ch:R(BLAZON_SPEC.ch-1),cc};
}

let _blzSeq=0;

// LE DESSIN. opts : {level (0–6), size (px, facultatif), cls, plain}
//   plain : sans cadre ni cimier — pour les vignettes de 16 à 24 px, où un
//           bord de métal ne serait plus qu'une ligne qui mange le champ.
function blazonSVG(raw,opts){
  const o=opts||{};
  const b=blazonClean(raw);
  const id='blz'+(++_blzSeq);
  const shape=BLAZON_SHAPES[b.s],div=BLAZON_DIVISIONS[b.d];
  const t1=BLAZON_TINCTURES[b.c1].c,t2=BLAZON_TINCTURES[b.c2].c,tc=BLAZON_TINCTURES[b.cc].c;
  const lvl=Math.max(0,Math.min(6,o.level|0));
  const L=CLAN_LEVELS[lvl];
  const ch=BLAZON_CHARGES[b.ch];
  let charge=ch.art||'';
  if(ch.piece)charge=(typeof pieceArtFor==='function')?pieceArtFor(ch.piece):BLAZON_CHARGES[5].art;
  // Le cerne du meuble : sombre sur un émail clair, clair sur un émail
  // sombre — la règle des pièces noires du plateau, pour la même raison.
  const lum=hex=>{const v=parseInt(hex.slice(1),16);return ((v>>16)*299+((v>>8)&255)*587+(v&255)*114)/1000;};
  const line=lum(tc)>110?'#1b1512':'#ece6d9';
  const sz=o.size?' width="'+o.size+'" height="'+Math.round(o.size*1.2)+'"':'';
  const crest=!o.plain&&lvl>=4;
  const laurels=!o.plain&&lvl>=6;
  // Un cimier dépasse de l'écu, des lauriers de ses flancs : la boîte
  // s'agrandit d'autant, et l'écu garde sa taille d'un niveau à l'autre.
  const vb=laurels?'-12 -14 124 134':crest?'0 -14 100 134':'0 0 100 120';
  let h='<svg class="blz'+(o.cls?' '+o.cls:'')+'" viewBox="'+vb+'"'+sz+' aria-hidden="true" focusable="false">'+
    '<defs>'+
      '<clipPath id="'+id+'c"><path d="'+shape.d+'"/></clipPath>'+
      // L'émail est une matière, pas un aplat : un jour venu d'en haut à
      // gauche, une ombre portée par le bas de l'écu.
      '<radialGradient id="'+id+'g" cx="32%" cy="22%" r="85%">'+
        '<stop offset="0" stop-color="#fff" stop-opacity=".34"/>'+
        '<stop offset=".45" stop-color="#fff" stop-opacity="0"/>'+
        '<stop offset="1" stop-color="#000" stop-opacity=".42"/>'+
      '</radialGradient>'+
      '<linearGradient id="'+id+'m" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="'+L.hi+'"/><stop offset=".5" stop-color="'+L.metal+'"/>'+
        '<stop offset="1" stop-color="'+L.hi+'"/>'+
      '</linearGradient>'+
    '</defs>';
  if(crest)h+=blazonCrest(lvl,id);
  h+='<g clip-path="url(#'+id+'c)">'+
      '<rect x="0" y="0" width="100" height="120" fill="'+t1+'"/>'+
      (div.d?'<path d="'+div.d+'" fill="'+t2+'"/>':'')+
      (charge?'<g class="blz-charge" transform="translate(22 27) scale(.56)" style="--pc-fill:'+tc+';--pc-line:'+line+'">'+charge+'</g>':'')+
      '<rect x="0" y="0" width="100" height="120" fill="url(#'+id+'g)"/>'+
    '</g>';
  if(!o.plain){
    // Le CADRE : un bord de métal épais, et un filet sombre à l'intérieur qui
    // le décolle du champ.
    h+='<path d="'+shape.d+'" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="9" stroke-linejoin="round"/>'+
       '<path d="'+shape.d+'" fill="none" stroke="url(#'+id+'m)" stroke-width="6" stroke-linejoin="round"/>'+
       '<path d="'+shape.d+'" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1" stroke-linejoin="round"/>';
  }else{
    h+='<path d="'+shape.d+'" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="4" stroke-linejoin="round"/>';
  }
  if(laurels)h+=blazonLaurels(id);
  return h+'</svg>';
}

// LE CIMIER (Obsidienne et au-delà) : une couronne de métal posée au-dessus
// de l'écu. Elle a la couleur du niveau, comme le cadre.
function blazonCrest(lvl,id){
  return '<path d="M30 6 34 -10 42 -2 50 -13 58 -2 66 -10 70 6Z" fill="url(#'+id+'m)" stroke="rgba(0,0,0,.55)" stroke-width="2" stroke-linejoin="round"/>'+
    '<circle cx="50" cy="-13" r="3" fill="'+CLAN_LEVELS[lvl].hi+'"/>'+
    '<circle cx="34" cy="-10" r="2.2" fill="'+CLAN_LEVELS[lvl].hi+'"/>'+
    '<circle cx="66" cy="-10" r="2.2" fill="'+CLAN_LEVELS[lvl].hi+'"/>';
}

// LES LAURIERS DE L'OR LÉGENDAIRE : deux branches qui embrassent la pointe.
function blazonLaurels(id){
  let leaves='';
  for(let i=0;i<5;i++){
    const y=106-i*15,x=10+i*1.5;
    leaves+='<ellipse cx="'+(x-6)+'" cy="'+y+'" rx="7" ry="3.2" transform="rotate('+(-50+i*8)+' '+(x-6)+' '+y+')"/>';
    leaves+='<ellipse cx="'+(106-x)+'" cy="'+y+'" rx="7" ry="3.2" transform="rotate('+(50-i*8)+' '+(106-x)+' '+y+')"/>';
  }
  return '<g fill="url(#'+id+'m)" stroke="rgba(0,0,0,.5)" stroke-width="1">'+leaves+'</g>';
}
