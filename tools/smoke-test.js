#!/usr/bin/env node
// ================================================================
// SMOKE-TEST.JS : le parcours complet du jeu, joué par un navigateur
// ================================================================
// Le jeu n'a ni build ni dépendance : il n'avait donc aucun moyen de
// vérifier qu'il démarre encore. Or tout est chargé par une chaîne de
// <script> dans un espace de noms global partagé : une faute de frappe dans
// n'importe quel fichier casse tous les suivants, et rien ne le dit avant
// d'ouvrir la page à la main.
//
// Ce script ouvre le vrai jeu dans un vrai navigateur et refait le parcours :
// création de compte, tutoriel, composition, partie contre l'Instructeur,
// Réserve, Voie. Il échoue au premier message d'erreur de la console.
//
// Il ne fait PAS partie du jeu : rien dans index.html ne le charge, et le jeu
// continue de s'ouvrir en double-cliquant sur index.html.
//
//   npm test            (installe Playwright à la volée via npx si besoin)
//   node tools/smoke-test.js
//
// Les erreurs de chargement des polices Google et du CDN Supabase sont
// ignorées : elles dépendent du réseau, pas du code.
// ================================================================

const http=require('http');
const fs=require('fs');
const path=require('path');

let chromium;
try{({chromium}=require('playwright'));}
catch(e){
  console.error('Playwright est introuvable. Installez-le d\'abord :\n  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT=path.resolve(__dirname,'..');
const PORT=8123;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.png':'image/png','.mp3':'audio/mpeg','.json':'application/json','.txt':'text/plain',
  '.webmanifest':'application/manifest+json','.xml':'application/xml'};

// Serveur statique minimal, qui rejoue les réécritures de vercel.json
// (cleanUrls + /combat + /test) pour tester les mêmes adresses qu'en ligne.
function serve(){
  return http.createServer((req,res)=>{
    let p=decodeURIComponent(req.url.split('?')[0]);
    if(p==='/'||p==='/combat'||p==='/test')p='/index.html';
    else if(p==='/info')p='/info.html';
    const f=path.join(ROOT,p);
    if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});
    res.end(fs.readFileSync(f));
  });
}

// Playwright refuse de démarrer si la version de navigateur installée ne
// correspond pas EXACTEMENT à celle qu'attend le paquet. Sur une machine où
// Chromium est déjà là (image de CI, environnement d'exécution géré), c'est
// un refus pour rien : on retombe donc sur le premier binaire trouvé, ou sur
// celui indiqué par CHROMIUM_PATH.
function findChromium(){
  if(process.env.CHROMIUM_PATH)return process.env.CHROMIUM_PATH;
  const base=process.env.PLAYWRIGHT_BROWSERS_PATH;
  if(!base||!fs.existsSync(base))return null;
  const candidates=[];
  for(const dir of fs.readdirSync(base)){
    if(!/^chromium/.test(dir))continue;
    for(const rel of ['chrome-linux/chrome','chrome-headless-shell-linux64/chrome-headless-shell','chrome-mac/Chromium.app/Contents/MacOS/Chromium']){
      const f=path.join(base,dir,rel);
      if(fs.existsSync(f))candidates.push(f);
    }
  }
  return candidates[0]||null;
}
async function launchChromium(){
  try{return await chromium.launch();}
  catch(e){
    const exe=findChromium();
    if(!exe)throw e;
    console.log('  (Chromium de Playwright indisponible, utilisation de '+exe+')');
    return chromium.launch({executablePath:exe});
  }
}

const IGNORED_CONSOLE=/ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|fonts\.googleapis|fonts\.gstatic|jsdelivr|supabase/;

(async()=>{
  const server=serve();
  await new Promise(r=>server.listen(PORT,r));
  const browser=await launchChromium();
  const page=await browser.newPage({viewport:{width:1400,height:900}});

  const failures=[];
  page.on('console',m=>{
    if(m.type()!=='error')return;
    const t=m.text();
    if(!IGNORED_CONSOLE.test(t))failures.push('console : '+t);
  });
  page.on('pageerror',e=>failures.push('exception : '+e.message));

  const step=async(label,fn)=>{
    try{await fn();console.log('  ✓ '+label);}
    catch(e){console.log('  ✗ '+label+' — '+e.message);failures.push(label+' — '+e.message);}
  };

  console.log('\nEpic Chess · test de fumée\n');
  await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});

  await step('la page de connexion s\'affiche',async()=>{
    await page.waitForSelector('#page-login.active',{timeout:8000});
  });

  await step('l\'emblème est injecté',async()=>{
    if(await page.locator('.login-emblem svg.emblem').count()!==1)throw new Error('emblème absent');
  });

  await step('un refus de création de compte est expliqué',async()=>{
    await page.fill('#reg-u','a');
    await page.click('#btn-reg');
    const t=await page.locator('.notif').first().textContent({timeout:3000});
    if(!/Pseudo/.test(t))throw new Error('message inattendu : '+t);
  });

  await step('un compte se crée',async()=>{
    await page.fill('#reg-u','SmokeTest');
    await page.fill('#reg-p','abcd');
    await page.fill('#reg-p2','abcd');
    await page.click('#btn-reg');
    await page.waitForSelector('#intro-modal',{state:'visible',timeout:8000});
    await page.click('#intro-close');
  });

  await step('le tutoriel démarre et se passe',async()=>{
    await page.waitForSelector('#tuto-root.show',{timeout:8000});
    await page.click('#tuto-skip');
    await page.click('#confirm-ok');
    await page.waitForSelector('#tuto-root.show',{state:'hidden',timeout:8000});
    if(await page.evaluate(()=>savedArmies.length)<1)throw new Error('aucune armée offerte');
  });

  await step('les réglages sont conservés',async()=>{
    await page.click('#settings-btn');
    await page.click('#sp-theme');
    if(!await page.evaluate(()=>document.body.classList.contains('light')))throw new Error('thème clair non appliqué');
    const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('mc_prefs_v1')||'{}'));
    if(p.dark!==false)throw new Error('préférence non enregistrée');
    await page.click('#sp-theme');
    await page.keyboard.press('Escape');
  });

  await step('une partie contre l\'Instructeur se lance',async()=>{
    await page.click('#b-vs-ia');
    await page.waitForSelector('#page-combat.active',{timeout:8000});
    await page.click('#cb-play');
    await page.waitForTimeout(700);
    await page.click('.cine-skip');
    await page.waitForSelector('#page-game .gc',{timeout:8000});
    if(await page.locator('#game-board .gc').count()!==64)throw new Error('le plateau n\'a pas 64 cases');
  });

  await step('un coup du joueur est joué, et animé',async()=>{
    const ok=await page.evaluate(async()=>{
      const col=GS.playerColor;
      if(GS.turn!==col)await new Promise(r=>{
        const t=setInterval(()=>{if(GS.turn===col){clearInterval(t);r();}},250);
        setTimeout(()=>{clearInterval(t);r();},25000);
      });
      for(let r=0;r<8;r++)for(let c=0;c<8;c++){
        const p=GS.board[r][c];
        if(!p||p.color!==col)continue;
        const mv=getLegalMoves(GS.board,r,c,GS);
        if(!mv.length)continue;
        GS.lastMove={from:{r,c},to:mv[0],capture:!!GS.board[mv[0].r][mv[0].c]};
        executeGameMove({r,c},mv[0],GS);
        return true;
      }
      return false;
    });
    if(!ok)throw new Error('aucun coup légal');
    if(await page.locator('#game-board .gc-piece.gc-move-in').count()<1)throw new Error('pièce non animée');
  });

  await step('l\'Instructeur répond',async()=>{
    await page.waitForFunction(()=>GS.turn===GS.playerColor||GS.gameOver,null,{timeout:30000});
    if(await page.evaluate(()=>GS.movePairs.length)<1)throw new Error('journal des coups vide');
  });

  await step('la pendule tourne pendant la relecture d\'historique',async()=>{
    const before=await page.evaluate(()=>GS.timeWhite+GS.timeBlack);
    await page.click('#hist-prev');
    await page.waitForTimeout(1200);
    const after=await page.evaluate(()=>GS.timeWhite+GS.timeBlack);
    if(after>=before)throw new Error('la pendule est restée figée');
    await page.click('#hist-last');
  });

  await step('les tables position-carrés sont dans le bon sens',async()=>{
    const r=await page.evaluate(()=>({
      pionBlancPresquePromu:getPST({type:'p',color:'w',pieceId:'std-pawn'},1,4),
      pionNoirPresquePromu:getPST({type:'p',color:'b',pieceId:'std-pawn'},6,4),
      roiBlancChezLui:getPST({type:'k',color:'w',pieceId:'roi',isKing:true},7,6),
      roiBlancAuCentre:getPST({type:'k',color:'w',pieceId:'roi',isKing:true},4,4),
    }));
    if(r.pionBlancPresquePromu!==50||r.pionNoirPresquePromu!==50)throw new Error('pion : '+JSON.stringify(r));
    if(!(r.roiBlancChezLui>0&&r.roiBlancAuCentre<0))throw new Error('roi : '+JSON.stringify(r));
  });

  await step('le Typhon efface bien ses voisines dans la simulation de coup',async()=>{
    const n=await page.evaluate(()=>{
      const b=Array.from({length:8},()=>Array(8).fill(null));
      const mk=(t,col,id,x)=>Object.assign({type:t,color:col,pieceId:id,hasMoved:true},x||{});
      b[0][4]=mk('k','b','roi',{isKing:true});
      b[7][4]=mk('k','w','roi',{isKing:true});
      b[3][3]=mk('b','b','typhon');
      b[4][4]=mk('r','w','tour-primordiale');
      b[5][4]=mk('n','w','cavalier-primordial');
      b[5][3]=mk('b','w','fou-primordial');
      b[4][3]=mk('q','w','dame');
      const a=applyMoveQuick(b,{r:3,c:3},{r:4,c:4,typhon:true},b[3][3],new Set());
      return [a[5][4],a[5][3],a[4][3]].filter(x=>!x).length + (a[7][4]?0:-99);
    });
    if(n!==3)throw new Error('pièces effacées : '+n);
  });

  await step('la Réserve, la Voie et l\'armurerie se rendent',async()=>{
    await page.evaluate(()=>{GS.gameOver=true;stopClockTick(GS);renderReservePage();renderVoiePage();renderArmiesPage();});
  });

  await browser.close();
  server.close();

  if(failures.length){
    console.log('\n'+failures.length+' problème(s) :');
    failures.forEach(f=>console.log('  · '+f));
    process.exit(1);
  }
  console.log('\nTout est vert.\n');
})().catch(e=>{console.error(e);process.exit(1);});
