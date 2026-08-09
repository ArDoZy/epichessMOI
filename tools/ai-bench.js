#!/usr/bin/env node
// ================================================================
// AI-BENCH.JS : les douze adversaires jouent les uns contre les autres
// ================================================================
// Douze paliers annoncés de 150 à 2300 ELO, c'est une promesse faite au
// joueur : Cendre doit vraiment être battable et l'Athanor vraiment dur. Rien
// dans le code ne le garantit — les réglages (timeMs, depthCap, slack,
// blunder) sont des nombres choisis à la main, et il n'y avait aucun moyen de
// savoir s'ils produisaient une échelle ou douze fois le même joueur.
//
// Ce script fait s'affronter des paires d'adversaires en autopartie et
// affiche le score. Il ne fait PAS partie de `npm test` : une passe complète
// prend plusieurs minutes, alors que le test de fumée doit rester instantané.
//
//   node tools/ai-bench.js                  # échelle rapide, paires voisines
//   node tools/ai-bench.js --games 6        # plus de parties par paire
//   node tools/ai-bench.js --pair cendre,athanor
//
// Les budgets de réflexion sont divisés par SPEEDUP : on mesure l'écart entre
// deux adversaires, pas leur force absolue, et une passe à pleine cadence
// prendrait une heure.
// ================================================================

const http=require('http');
const fs=require('fs');
const path=require('path');

let chromium;
try{({chromium}=require('playwright'));}
catch(e){console.error('Playwright est introuvable : npm i -D playwright');process.exit(2);}

const ROOT=path.resolve(__dirname,'..');
const PORT=8124;
const SPEEDUP=8;
const MAX_PLIES=140;

const args=process.argv.slice(2);
const argOf=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const GAMES=parseInt(argOf('--games','4'),10);
const PAIR=argOf('--pair',null);

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.png':'image/png','.mp3':'audio/mpeg','.json':'application/json','.txt':'text/plain',
  '.webmanifest':'application/manifest+json','.xml':'application/xml'};
function serve(){
  return http.createServer((req,res)=>{
    let p=decodeURIComponent(req.url.split('?')[0]);
    if(p==='/')p='/index.html';
    const f=path.join(ROOT,p);
    if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});
    res.end(fs.readFileSync(f));
  });
}
function findChromium(){
  if(process.env.CHROMIUM_PATH)return process.env.CHROMIUM_PATH;
  const base=process.env.PLAYWRIGHT_BROWSERS_PATH;
  if(!base||!fs.existsSync(base))return null;
  for(const dir of fs.readdirSync(base)){
    if(!/^chromium/.test(dir))continue;
    for(const rel of ['chrome-linux/chrome','chrome-headless-shell-linux64/chrome-headless-shell']){
      const f=path.join(base,dir,rel);
      if(fs.existsSync(f))return f;
    }
  }
  return null;
}

// ----------------------------------------------------------------
// AUTOPARTIE, exécutée DANS la page
// ----------------------------------------------------------------
// On rejoue la boucle de partie à la main plutôt que d'utiliser
// executeGameMove : celui-ci touche le DOM, l'audio et la pendule à chaque
// coup. applyMoveQuick applique déjà les pouvoirs destructeurs (Typhon,
// charge du Dresseur, hurlement de la Banshee), c'est-à-dire tout ce qui
// change le plateau.
async function playPair(page,idA,idB,games,speedup,maxPlies){
  return page.evaluate(({idA,idB,games,speedup,maxPlies})=>{
    const scale=o=>({...o,timeMs:Math.max(0,Math.round((o.timeMs||0)/speedup))});
    const mkGs=board=>({board,turn:'b',enPassant:null,halfmoveClock:0,
      medusaParalyzed:new Set(),pretreProtected:new Set(),anchored:new Set(),
      grandMaitreAlive:{w:false,b:false},lastMoveHistory:[]});
    const mirror=gs=>{
      const flip=c=>c==='w'?'b':'w';
      return{...gs,board:gs.board.slice().reverse().map(row=>row.map(p=>p?{...p,color:flip(p.color)}:null)),
        medusaParalyzed:new Set(),pretreProtected:new Set(),anchored:new Set(),lastMoveHistory:[]};
    };
    const out={a:0,b:0,draw:0,unfinished:0,plies:0};
    for(let g=0;g<games;g++){
      // Chacun mène les Noirs une partie sur deux : le trait est un avantage,
      // et une échelle mesurée d'un seul côté ne mesurerait que lui.
      const blackIsA=g%2===0;
      const oppBlack=scale(aiOpponentById(blackIsA?idA:idB));
      const oppWhite=scale(aiOpponentById(blackIsA?idB:idA));
      const armyB=generateAIArmy(Math.max(0,oppBlack.budget-4),{style:oppBlack.style,budget:oppBlack.budget,full:true});
      const armyW=generateAIArmy(Math.max(0,oppWhite.budget-4),{style:oppWhite.style,budget:oppWhite.budget,full:true});
      const gs=mkGs(buildGameBoard(armyW,armyB));
      let winner=null,ply=0;
      for(;ply<maxPlies;ply++){
        const side=ply%2===0?'w':'b';
        gs.turn=side;
        updateMedusaParalysis(gs.board,gs);updatePretreProtection(gs.board,gs);updateGrandMaitre(gs.board,gs);
        const legal=getAllMovesColor(side,gs.board,gs);
        if(!legal.length){
          // Mat ou pat : sans coup légal, l'échec décide.
          winner=isInCheckSimple(side,gs.board)?(side==='w'?'b':'w'):null;
          break;
        }
        const opp=side==='b'?oppBlack:oppWhite;
        const searchGs=side==='b'?gs:mirror(gs);
        const scored=aiSearchRoot(searchGs,opp);
        let mv=aiPickMove(scored,opp);
        if(!mv){winner=side==='w'?'b':'w';break;}
        if(side==='w')mv={from:{r:7-mv.from.r,c:mv.from.c},to:{...mv.to,r:7-mv.to.r,c:mv.to.c,
          ...(mv.to.fromR!==undefined?{fromR:7-mv.to.fromR}:{})}};
        const p=gs.board[mv.from.r][mv.from.c];
        if(!p){winner=side==='w'?'b':'w';break;}
        gs.board=applyMoveQuick(gs.board,mv.from,mv.to,p,gs.anchored);
        gs.lastMoveHistory.push({piece:p.id,fromR:mv.from.r,fromC:mv.from.c,toR:mv.to.r,toC:mv.to.c,color:side});
        if(gs.lastMoveHistory.length>8)gs.lastMoveHistory.shift();
        // Un roi effacé du plateau termine la partie : applyMoveQuick ne
        // connaît pas le mat, seulement les pièces.
        let kw=false,kb=false;
        for(let r=0;r<8;r++)for(let c=0;c<8;c++){
          const q=gs.board[r][c];if(!q||!(q.isKing||q.type==='k'))continue;
          if(q.color==='w')kw=true;else kb=true;
        }
        if(!kw||!kb){winner=kw?'w':'b';break;}
      }
      out.plies+=ply;
      // Une partie coupée au plafond de demi-coups n'est pas une nulle : les
      // deux camps sont simplement encore debout. La compter comme telle
      // ferait croire que deux paliers voisins s'équilibrent alors qu'on n'a
      // rien mesuré du tout.
      if(!winner&&ply>=maxPlies)out.unfinished++;
      else if(!winner)out.draw++;
      else if((winner==='b')===blackIsA)out.a++;
      else out.b++;
    }
    return out;
  },{idA,idB,games,speedup,maxPlies});
}

(async()=>{
  const server=serve();
  await new Promise(r=>server.listen(PORT,r));
  let browser;
  try{browser=await chromium.launch();}
  catch(e){browser=await chromium.launch({executablePath:findChromium()});}
  const page=await browser.newPage();
  page.on('pageerror',e=>console.error('exception :',e.message));
  await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof aiSearchRoot==='function'&&typeof generateAIArmy==='function');
  // generateAIArmy consulte VV_UNLOCKED ; l'option full la contourne, mais le
  // Set doit exister.
  await page.evaluate(()=>{if(!window.VV_UNLOCKED)window.VV_UNLOCKED=new Set();});

  const ids=await page.evaluate(()=>AI_OPPONENTS.map(o=>o.id));
  const elo=await page.evaluate(()=>{const m={};AI_OPPONENTS.forEach(o=>{m[o.id]=o.elo;});return m;});

  const pairs=PAIR?[PAIR.split(',')]
    :ids.slice(0,-1).map((id,i)=>[id,ids[i+1]]).filter((_,i)=>i%2===0)
        .concat([[ids[0],ids[ids.length-1]],[ids[3],ids[9]]]);

  console.log('\nEpic Chess · échelle des adversaires');
  console.log('  '+GAMES+' parties par paire, budgets divisés par '+SPEEDUP+'\n');
  let anomalies=0;
  for(const [a,b] of pairs){
    const t0=Date.now();
    const r=await playPair(page,a,b,GAMES,SPEEDUP,MAX_PLIES);
    const secs=((Date.now()-t0)/1000).toFixed(0);
    // Le plus fort des deux doit gagner davantage. Sur quatre parties entre
    // deux paliers voisins (150 à 250 points d'écart), un renversement reste
    // dans le bruit : c'est l'écart entre paliers ÉLOIGNÉS qui doit être net,
    // et c'est pour cela que la liste des paires en contient deux.
    const strong=elo[a]>=elo[b]?'a':'b';
    const ok=(strong==='a'?r.a>=r.b:r.b>=r.a);
    if(!ok)anomalies++;
    console.log('  '+(ok?'✓':'!')+' '+a+' ('+elo[a]+') vs '+b+' ('+elo[b]+')'+
      '  →  '+r.a+' / '+r.draw+' / '+r.b+
      (r.unfinished?'  ('+r.unfinished+' inachevée'+(r.unfinished>1?'s':'')+')':'')+
      '   ['+Math.round(r.plies/GAMES)+' demi-coups en moyenne, '+secs+' s]');
  }
  console.log('\n'+(anomalies?anomalies+' renversement(s) à surveiller.':'L\'échelle tient dans le bon sens.')+'\n');
  await browser.close();
  server.close();
})();
