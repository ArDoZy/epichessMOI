// ================================================================
// GEN-SOCIAL.JS : régénère og-image.png et apple-touch-icon.png
// ================================================================
// Usage : node tools/gen-social.js [chemin/vers/chrome]
//
// Outil de développement ponctuel, PAS une dépendance du jeu : il n'est
// lancé qu'à la main quand la direction artistique change. Le jeu lui-même
// reste sans build step ni dépendance npm.
//
// Il rend deux pages HTML dans un navigateur headless et en capture le
// résultat :
//   - og-image.png        1200x630, aperçu de partage (Discord, X, WhatsApp)
//   - apple-touch-icon.png 180x180, écran d'accueil iOS
//
// PIÈGE connu (déjà documenté dans le README) : une fenêtre de moins de
// ~500 px de large est silencieusement élargie par Chromium, et la capture
// ressort tronquée. L'icône est donc rendue en 720 px avec un facteur
// d'échelle de 0,25 pour obtenir 180 px nets.
//
// Il faut un Chromium/Chrome local et le paquet `playwright` accessible :
//   npx --yes playwright@latest install chromium
//   node tools/gen-social.js
// ================================================================

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');

// Palette : doit rester alignée sur :root dans css/style.css.
const C={
  bg:'#0e1216',bg2:'#141c21',surface:'#171f25',border:'#3f4f5a',
  text:'#e7ecea',muted:'#8698a1',accent:'#186557',accent2:'#2fb197',
  gold:'#c19a45',gold2:'#e6c576',
};

const FONTS="'Cinzel Decorative','Cinzel','Times New Roman',serif";

// Quelques logos de pièces repris de js/piece-art.js. On les relit dans le
// fichier source plutôt que de les recopier : une pièce redessinée se
// répercute ainsi automatiquement sur l'image de partage.
function loadPieceArt(){
  const src=fs.readFileSync(path.join(ROOT,'js','piece-art.js'),'utf8');
  const sandbox={};
  // Le fichier est du JS global sans dépendance : on l'évalue tel quel.
  new Function('exports','module',src+'\n;module.exports={PIECE_ART,PIECE_BASE,pieceArtFor};')
    .call(sandbox,sandbox,sandbox);
  return sandbox.exports||sandbox;
}

function pieceMarkup(art,id,fill,line,size){
  return '<svg viewBox="0 0 100 100" width="'+size+'" height="'+size+'" '+
    'style="--f:'+fill+';--l:'+line+'">'+art.PIECE_BASE+art.pieceArtFor(id)+'</svg>';
}

function ogHTML(art){
  const light=[C.text,'#141a1c'],dark=['#23262b','#e9e3d6'];
  const row=[
    ['roi',light],['dame',light],['typhon',dark],['meduse',dark],
    ['alpha',light],['banshee',dark],['grand-maitre',light],
  ];
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;background:${C.bg};
    font-family:${FONTS};color:${C.text};position:relative}
  .glow{position:absolute;inset:0;
    background:radial-gradient(ellipse at 50% 18%,rgba(47,177,151,.16),transparent 60%),
               radial-gradient(ellipse at 50% 112%,rgba(0,0,0,.6),transparent 55%),
               linear-gradient(165deg,#161f24,#0b0f12)}
  .wrap{position:relative;height:100%;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:34px;padding:56px}
  h1{font-size:104px;font-weight:900;letter-spacing:6px;line-height:1;
    background:linear-gradient(180deg,${C.gold2},${C.gold} 55%,#7d6320);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  p{font-family:'Georgia',serif;font-size:27px;color:${C.muted};font-style:italic;
    text-align:center;max-width:900px;line-height:1.45}
  .pieces{display:flex;gap:26px;align-items:flex-end}
  .pieces svg .b{fill:var(--f);stroke:var(--l);stroke-width:3.4;stroke-linejoin:round;stroke-linecap:round}
  .pieces svg .l{fill:none;stroke:var(--l);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
  .pieces svg .k{fill:var(--l)}
  .pieces svg{filter:drop-shadow(0 8px 10px rgba(0,0,0,.55))}
  .tag{display:flex;gap:12px}
  .tag span{font-size:19px;letter-spacing:2.6px;text-transform:uppercase;
    color:${C.accent2};border:1px solid ${C.border};border-radius:11px;padding:9px 20px}
  .rule{width:190px;height:2px;background:linear-gradient(90deg,transparent,${C.gold},transparent)}
  </style>
  <div class="glow"></div>
  <div class="wrap">
    <div class="pieces">${row.map(([id,[f,l]])=>pieceMarkup(art,id,f,l,104)).join('')}</div>
    <div class="rule"></div>
    <h1>EPIC CHESS</h1>
    <p>Composez votre armée de créatures alchimiques.<br>Chaque pièce jouée est une pièce risquée.</p>
    <div class="tag"><span>Variante d'échecs</span><span>Jouer en ligne</span><span>Gratuit</span></div>
  </div>`;
}

function iconHTML(){
  // Reprend le dessin de favicon.svg, mis à l'échelle d'une tuile iOS.
  const svg=fs.readFileSync(path.join(ROOT,'favicon.svg'),'utf8')
    .replace('<svg ','<svg width="720" height="720" ');
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  body{width:720px;height:720px;overflow:hidden;background:${C.bg}}
  svg{display:block}
  </style>${svg}`;
}

(async()=>{
  let chromium;
  try{chromium=require('playwright').chromium;}
  catch(e){
    console.error("playwright est introuvable. Installez-le puis relancez :\n  npm i -D playwright && npx playwright install chromium");
    process.exit(1);
  }
  const exe=process.argv[2]||undefined;
  const browser=await chromium.launch(exe?{executablePath:exe}:{});
  const art=loadPieceArt();

  const shots=[
    {html:ogHTML(art),w:1200,h:630,scale:1,out:'og-image.png'},
    {html:iconHTML(),w:720,h:720,scale:0.25,out:'apple-touch-icon.png'},
  ];
  for(const s of shots){
    const page=await browser.newPage({viewport:{width:s.w,height:s.h},deviceScaleFactor:s.scale});
    await page.setContent(s.html,{waitUntil:'load'});
    await page.waitForTimeout(250);
    const file=path.join(ROOT,s.out);
    await page.screenshot({path:file});
    console.log('ecrit',s.out,fs.statSync(file).size+' o');
    await page.close();
  }
  await browser.close();
})();
