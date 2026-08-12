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
// Armurerie, Voie. Il échoue au premier message d'erreur de la console.
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
    if(p==='/'||p==='/combat'||p==='/test')p='/index.html';   // cf. vercel.json
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

// Les portraits d'adversaires (assets/adversaires/<id>.png) et le fond du
// menu principal (assets/backgrounds/main-page.png) sont FACULTATIFS par
// construction : le jeu dessine un repli quand ils manquent. Leur 404 est
// donc un comportement voulu et non une panne, au même titre que les polices
// Google ou le CDN Supabase quand le réseau est coupé.
const IGNORED_CONSOLE=/ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|fonts\.googleapis|fonts\.gstatic|jsdelivr|supabase/;
const OPTIONAL_ASSET=/adversaires\/[a-z-]+\.png|backgrounds\/main-page\.png/;

(async()=>{
  const server=serve();
  await new Promise(r=>server.listen(PORT,r));
  const browser=await launchChromium();
  const page=await browser.newPage({viewport:{width:1400,height:900}});

  const failures=[];
  page.on('console',m=>{
    if(m.type()!=='error')return;
    const t=m.text();
    // Le texte d'un 404 de ressource ne porte pas l'URL : elle est dans
    // location(), c'est donc là qu'on reconnaît un asset facultatif.
    const url=(m.location()&&m.location().url)||'';
    if(OPTIONAL_ASSET.test(url))return;
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

  // LE COFFRE DE RÉAPPROVISIONNEMENT S'OUVRE TOUT SEUL. Il n'a plus de carte
  // ni de bouton « Récupérer » sur le menu : dès que son délai est écoulé et
  // que le joueur est disponible — ici, à la sortie du tutoriel — la cérémonie
  // s'ouvre d'elle-même (voir dailyChestMaybeOpen, js/economy-ui.js). Le
  // joueur ouvre le coffre lui-même, comme n'importe quel autre.
  await step('le coffre de réapprovisionnement s\'ouvre de lui-même',async()=>{
    await page.waitForSelector('#chest-modal.show',{timeout:8000});
    const titre=await page.textContent('#chest-title');
    if(!/réapprovisionnement/i.test(titre))throw new Error('coffre inattendu : '+titre);
    await page.click('#chest-visual');
    await page.waitForSelector('#chest-close:visible',{timeout:8000});
    await page.click('#chest-close');
    await page.waitForSelector('#chest-modal.show',{state:'hidden',timeout:8000});
    if(await page.evaluate(()=>dailyChestAvailable()))
      throw new Error('le coffre du jour est encore dû après son ouverture');
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

  await step('la galerie des adversaires s\'affiche',async()=>{
    await page.click('#b-vs-ia');
    await page.waitForSelector('#page-adversaires.active',{timeout:8000});
    const n=await page.locator('#adv-grid .adv-card').count();
    if(n!==12)throw new Error('la galerie montre '+n+' adversaires au lieu de 12');
    // Aucun adversaire n'est verrouillé : on doit pouvoir défier le dernier
    // dès le premier jour.
    if(await page.locator('#adv-grid .adv-card[disabled]').count())throw new Error('un adversaire est verrouillé');
  });

  // LA PAGE D'ENGAGEMENT A ÉTÉ SUPPRIMÉE : choisir un adversaire lance
  // directement la partie, sans écran intermédiaire à valider.
  await step('une partie contre un adversaire choisi se lance',async()=>{
    const engagedBefore=await page.evaluate(()=>vvNoEloReason({multiplayer:false}));
    if(engagedBefore)throw new Error('partie non classée : '+engagedBefore);
    await page.click('#adv-grid .adv-card[data-id="vitriol"]');
    await page.waitForTimeout(900);
    const engaged=await page.evaluate(()=>aiCurrentOpponent().id);
    if(engaged!=='vitriol')throw new Error('adversaire engagé : '+engaged);
    await page.waitForSelector('.cine-skip',{timeout:8000});
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

  await step('l\'Armurerie, la Voie et les armées se rendent',async()=>{
    await page.evaluate(()=>{GS.gameOver=true;stopClockTick(GS);renderReservePage();renderVoiePage();renderArmiesPage();});
  });

  // Les six coffres du menu principal portent DEUX informations à la fois
  // (où en est la série, combien coûte chaque coffre) : un état de série mal
  // calculé se verrait sur un écran que tout le monde regarde avant de jouer.
  await step('les six coffres du menu montrent la série en cours',async()=>{
    const r=await page.evaluate(()=>{
      accSet('win_streak',2);accSet('pearls',300);
      showPage('face-jouer');renderMenuChests();
      const cards=[...document.querySelectorAll('#jouer-chests .jc-chest')];
      return{n:cards.length,
        etats:cards.map(c=>c.className.match(/chest-(won|next|far)/)[1]),
        ordre:cards.map(c=>c.dataset.chest),
        prix:!!document.querySelector('#jouer-chests .jc-price')};
    });
    if(r.n!==6)throw new Error(r.n+' coffres au lieu de 6');
    if(r.ordre.join(',')!=='pion,cavalier,fou,tour,dame,roi')throw new Error('ordre : '+r.ordre.join(','));
    if(r.etats.join(',')!=='won,won,next,far,far,far')throw new Error('états : '+r.etats.join(','));
    if(!r.prix)throw new Error('aucun prix en perles affiché');
  });

  // Les schémas de déplacement sont DÉDUITS du moteur (js/piece-moves.js) :
  // une pièce qui n'aurait plus aucune case atteignable serait le signe que
  // generateMovesRaw a changé sous leurs pieds.
  await step('chaque pièce a un schéma de déplacement non vide',async()=>{
    const bad=await page.evaluate(()=>PIECES.filter(p=>
      !pieceMoveMap(p.id).some(row=>row.some(c=>c&&c!=='self'))).map(p=>p.name));
    if(bad.length)throw new Error('sans déplacement : '+bad.join(', '));
    // Le pion standard est le seul à exercer les quatre pictogrammes.
    const pion=await page.evaluate(()=>pieceMoveMap('std-pawn').flat());
    if(!pion.includes('kill')||!pion.includes('peace'))throw new Error('pion : '+[...new Set(pion)].join(','));
  });

  // Le contenu d'un coffre est la mécanique la plus facile à casser sans
  // s'en apercevoir : elle ne se voit qu'après une victoire, et un tirage
  // vide ou négatif passerait pour de la malchance.
  await step('les six coffres tirent un contenu coherent',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      CHESTS.forEach(ch=>{
        const hi=chestRollRange(ch)[1];
        for(let i=0;i<200;i++){
          const lots=chestRoll(ch.id);
          const pieces=lots.filter(l=>l.pieceId);
          if(!lots.some(l=>l.pearls>0))out.push(ch.id+' : aucun lot de perles');
          // Borne HAUTE seulement : chestRoll fusionne les doublons (deux
          // tirages de Méduse ne font qu'une carte), le nombre de lots
          // affichés peut donc descendre bien en dessous du nombre tiré. Le
          // +1 tient compte de la pièce inédite, qui s'ajoute à la fourchette.
          if(pieces.length<1||pieces.length>hi+1)out.push(ch.id+' : '+pieces.length+' lots hors de [1,'+(hi+1)+']');
          if(pieces.some(l=>!(l.qty>0)))out.push(ch.id+' : lot de quantite nulle');
        }
        const lucky=chestLuckyChance(ch);
        if(!(lucky>0&&lucky<1))out.push(ch.id+' : proba de bon lot aberrante ('+lucky+')');
      });
      return [...new Set(out)];
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // LES POUVOIRS, un par un. Ils sont ce que le jeu a de particulier et ce
  // qu'aucun autre test ne touche : une partie jouée par le robot ne croise
  // presque jamais un Prêtre bien placé ou une Banshee au contact. Chaque
  // assertion ci-dessous correspond à une phrase du catalogue (PIECES.ability).
  await step('les pouvoirs font ce que leur fiche annonce',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const vide=()=>Array.from({length:8},()=>Array(8).fill(null));
      const pose=(b,r,c,pieceId,color)=>{
        const def=PIECES.find(p=>p.id===pieceId);
        const type=def?(def.pieceType||'q'):(pieceId==='std-pawn'?'p':'q');
        b[r][c]={type,color,pieceId,emoji:'',hasMoved:true,isKing:type==='k',id:pieceId+r+c};
        return b[r][c];
      };
      const etat=b=>{
        const gs={medusaParalyzed:new Set(),anchored:new Set(),pretreProtected:new Set(),
          grandMaitreAlive:{w:false,b:false},enPassant:null,lastMoveHistory:[]};
        updatePretreProtection(b,gs);updateGrandMaitre(b,gs);
        return gs;
      };
      const va=(b,r,c,tr,tc)=>generateMovesRaw(b,r,c,etat(b)).some(m=>m.r===tr&&m.c===tc);

      // PEUREUX — Retraite Prudente : jamais hors des 4 rangées de son camp.
      let b=vide();pose(b,4,4,'peureux','w');
      if(!va(b,4,4,5,4))out.push('peureux : ne recule pas dans son camp');
      if(va(b,4,4,3,4))out.push('peureux : franchit la moitie du plateau');
      b=vide();pose(b,3,4,'peureux','b');
      if(va(b,3,4,4,4))out.push('peureux noir : franchit la moitie du plateau');

      // CUIRASSE — les pions ne prennent pas le Preux Chevalier, la Fourmi si.
      b=vide();pose(b,4,4,'std-pawn','w');pose(b,3,3,'preux-chevalier','b');
      if(va(b,4,4,3,3))out.push('cuirasse : un pion capture le preux chevalier');
      b=vide();pose(b,4,4,'fourmi','w');pose(b,3,3,'preux-chevalier','b');
      if(!va(b,4,4,3,3))out.push('cuirasse : la fourmi ne peut pas capturer le preux chevalier');

      // DOMINATION — le Grand Maître adverse interdit le bond de 2 cases, y
      // compris quand les deux camps en alignent un.
      b=vide();pose(b,6,4,'std-pawn','w');pose(b,0,0,'grand-maitre','b');
      if(va(b,6,4,4,4))out.push('domination : le pion avance encore de 2 cases');
      pose(b,7,7,'grand-maitre','w');
      if(va(b,6,4,4,4))out.push('domination : deux grands maitres s annulent');
      b=vide();pose(b,6,4,'std-pawn','w');
      if(!va(b,6,4,4,4))out.push('domination : le bond de 2 cases a disparu sans grand maitre');

      // FOI INÉBRANLABLE — le Prêtre couvre ses alliées en diagonale, pas les
      // pièces adverses posées là, et jamais le Monarque.
      b=vide();pose(b,4,4,'pretre','b');pose(b,3,3,'meduse','b');pose(b,3,7,'tour-primordiale','w');
      if(va(b,3,7,3,3))out.push('pretre : une alliee protegee est quand meme capturee');
      b=vide();pose(b,4,4,'pretre','b');pose(b,3,3,'meduse','w');pose(b,3,7,'tour-primordiale','b');
      if(!va(b,3,7,3,3))out.push('pretre : il protege aussi les pieces adverses');
      b=vide();pose(b,4,4,'pretre','b');pose(b,3,3,'roi','b');pose(b,3,7,'tour-primordiale','w');
      if(!va(b,3,7,3,3))out.push('pretre : le monarque devient imprenable');

      // HURLEMENT — après son déplacement, les PIONS ennemis adjacents (les
      // huit cases) reculent. La Fourmi, elle, n'est pas un pion.
      b=vide();const bans=pose(b,4,4,'banshee','w');pose(b,3,4,'std-pawn','b');pose(b,3,5,'fourmi','b');
      applyBansheeEffect(4,4,b,bans);
      if(b[3][4]!==null)out.push('hurlement : le pion adjacent n a pas recule');
      if(!b[4][4]||b[4][4].pieceId!=='banshee')out.push('hurlement : la banshee a bouge');
      if(!b[2][4]||b[2][4].pieceId!=='std-pawn')out.push('hurlement : le pion n est pas arrive derriere');
      if(!b[3][5]||b[3][5].pieceId!=='fourmi')out.push('hurlement : la fourmi a ete traitee comme un pion');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // Le mode test est une ADRESSE : s'il cessait d'être reconnu, il
  // s'ouvrirait sur le jeu normal sans que rien ne le dise. Et ce qu'il
  // promet — tout le catalogue, 10 000 ELO, des perles sans fond — se vérifie
  // ici, parce que c'est exactement ce qui ne se voit pas quand ça casse.
  await step('le mode test donne tout et ne classe rien',async()=>{
    await page.goto('http://localhost:'+PORT+'/?test',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#page-login.active',{timeout:8000});
    if(!await page.evaluate(()=>ADMIN_MODE))throw new Error('/?test n active pas le mode test');
    if(!/Mode test/.test(await page.evaluate(()=>vvNoEloReason({}))||''))throw new Error('les parties y sont encore classees');
    const bad=await page.evaluate(()=>{
      const out=[];
      // Le compte créé plus haut est toujours dans localStorage : on s'y
      // reconnecte pour lire l'économie telle que la voit un joueur.
      CUR_ACC=Object.keys(loadAccs())[0]||null;
      if(!CUR_ACC){out.push('aucun compte de test');return out;}
      loadAccountGlobals();
      if(vvLoadElo()!==10000)out.push('ELO '+vvLoadElo()+' au lieu de 10000');
      const manquantes=PIECES.filter(p=>!VV_UNLOCKED.has(p.id)).map(p=>p.id);
      if(manquantes.length)out.push('pieces verrouillees : '+manquantes.join(','));
      const vides=PIECES.filter(p=>isOwnablePiece(p.id)&&invCount(p.id)<pieceDeployCount(p.id)).map(p=>p.id);
      if(vides.length)out.push('sans stock : '+vides.join(','));
      if(!pearlInfinite())out.push('perles non illimitees');
      if(!pearlSpend(chestPearlPrice('roi')))out.push('achat de coffre refuse');
      // Rien ne doit avoir été écrit sur le compte.
      if(localStorage.getItem(accKey(CUR_ACC,'inventory'))&&
         JSON.parse(localStorage.getItem(accKey(CUR_ACC,'inventory')))[PIECES[0].id]===999)
        out.push('l inventaire du mode test a ete enregistre');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
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
