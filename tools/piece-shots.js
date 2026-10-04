// ================================================================
// PIECE-SHOTS.JS : capture de la planche d'essai des pièces
// ================================================================
// Outil de développement, jamais chargé par le jeu. Il sert la racine du
// dépôt, ouvre tools/pieces-preview.html dans un Chromium et enregistre
// une capture pleine page.
//
//   node tools/piece-shots.js                          → /tmp/pieces.png
//   node tools/piece-shots.js sortie.png               → ce fichier
//   node tools/piece-shots.js sortie.png "only=roi,dame&big=1"
//
// Le port est choisi par le système (port 0) : plusieurs captures peuvent
// tourner en même temps sans se marcher dessus.
//
// Dépendance : playwright (déjà nécessaire pour npm test).
// ================================================================

const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.resolve(process.argv[2]||'/tmp/pieces.png');
const QUERY=process.argv[3]||'';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

function serve(){
  return http.createServer((req,res)=>{
    const u=decodeURIComponent(req.url.split('?')[0]);
    // Un script d'essai peut vivre hors du dépôt (le carnet de l'agent) :
    // une adresse /@abs/chemin/absolu le sert tel quel.
    const f=u.startsWith('/@abs/')?u.slice(5):path.join(ROOT,u);
    if(!u.startsWith('/@abs/')&&!f.startsWith(ROOT)){res.writeHead(404);return res.end();}
    if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
    fs.createReadStream(f).pipe(res);
  });
}

function findChromium(){
  const base='/opt/pw-browsers';
  if(!fs.existsSync(base))return null;
  for(const d of fs.readdirSync(base)){
    for(const rel of ['chrome-linux/chrome','chrome-linux/headless_shell',
                      'chrome-headless-shell-linux64/chrome-headless-shell']){
      const f=path.join(base,d,rel);
      if(fs.existsSync(f))return f;
    }
  }
  return null;
}

(async()=>{
  const srv=serve();
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const port=srv.address().port;
  const exe=findChromium();
  const browser=await chromium.launch(exe?{executablePath:exe}:{});
  const page=await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+port+'/tools/pieces-preview.html'+(QUERY?'?'+QUERY:''));
  await page.waitForSelector('body[data-ready="1"]',{timeout:15000});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({path:OUT,fullPage:true});
  await browser.close();
  srv.close();
  if(errors.length)console.log('Erreurs de la page :\n  '+errors.join('\n  '));
  console.log('Capture : '+OUT);
})().catch(e=>{console.error(e);process.exit(1);});
