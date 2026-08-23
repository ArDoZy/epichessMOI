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
// Armurerie, Diagonale de la Puissance, colonne des victoires et rangée de la
// richesse. Il échoue au premier message d'erreur de la console.
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
  '.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.json':'application/json','.txt':'text/plain',
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

// Les portraits d'adversaires (assets/adversaires/<id>.png), le fond du menu
// principal (assets/backgrounds/main-page.png) et les planches de
// destruction des coffres (assets/chests/<id>/) sont FACULTATIFS par
// construction : le jeu dessine un repli quand ils manquent — un coffre à
// couvercle pour les planches (voir chestBreakReady, js/chest-break.js).
// Leur 404 est donc un comportement voulu et non une panne, au même titre
// que les polices Google ou le CDN Supabase quand le réseau est coupé.
const IGNORED_CONSOLE=/ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|fonts\.googleapis|fonts\.gstatic|jsdelivr|supabase/;
const OPTIONAL_ASSET=/adversaires\/[a-z-]+\.png|backgrounds\/main-page\.png|chests\/[a-z]+\//;

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

  // PREMIÈRE VISITE : le voile de choix du pseudo s'affiche. Il n'y a plus de
  // page de connexion — c'était une page marquée `active` dans le HTML, donc
  // visible dès le premier octet, et qui CLIGNOTAIT à chaque ouverture du jeu
  // avant que le compte enregistré soit reconnu. Ce voile est masqué en dur et
  // n'est montré que faute de pseudo (accountsBoot, js/accounts.js) — l'étape
  // « le jeu reprend sans voile » plus bas vérifie l'autre moitié.
  await step('le choix du pseudo s\'affiche à la première visite',async()=>{
    await page.waitForSelector('#pseudo-gate.show',{timeout:8000});
    if(await page.locator('#page-login').count())throw new Error('la page de connexion existe encore');
  });

  await step('l\'emblème est injecté',async()=>{
    if(await page.locator('.login-emblem svg.emblem').count()!==1)throw new Error('emblème absent');
  });

  // L'EMBLÈME EST PARTOUT OÙ LE JEU SE PRÉSENTE. Il n'a longtemps vécu que
  // dans le voile de choix du pseudo — un écran qu'un joueur ayant déjà un
  // compte ne revoit JAMAIS. Le refondre ne se voyait donc nulle part, et
  // c'est exactement le genre de panne qu'aucun test ne rattrape : rien n'est
  // cassé, il n'y a simplement plus personne pour regarder. On vérifie donc
  // que chaque emplacement porte bien le crochet `.game-emblem`, et que
  // mountEmblems les a tous remplis.
  await step('chaque emplacement d\'emblème est rempli',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const slots=[...document.querySelectorAll('.game-emblem')];
      ['login-emblem','menu-emblem'].forEach(cls=>{
        if(!slots.some(el=>el.classList.contains(cls)))out.push('emplacement manquant : .'+cls);
      });
      slots.forEach(el=>{
        if(!el.querySelector('svg.emblem'))out.push('emplacement vide : '+el.className);
      });
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // L'ICÔNE D'ONGLET EST VERSIONNÉE. Les navigateurs la gardent en cache des
  // semaines sans la relire : sans changement d'adresse, une refonte de
  // l'emblème laisse l'ancienne image dans l'onglet de tous les revenants.
  // Le manifeste doit pointer la MÊME adresse, sinon l'écran d'accueil et
  // l'onglet divergent.
  await step('l\'icône d\'onglet est versionnée, et le manifeste suit',async()=>{
    const href=await page.getAttribute('link[rel="icon"]','href');
    if(!/\?v=\d+$/.test(href||''))throw new Error('l\'icône n\'est pas versionnée : '+href);
    const man=await (await fetch('http://localhost:'+PORT+'/site.webmanifest')).json();
    const src=(man.icons||[]).map(i=>i.src);
    if(!src.includes(href))throw new Error('le manifeste pointe '+src.join(',')+' au lieu de '+href);
    if(man.orientation!=='portrait')throw new Error('le manifeste n\'impose plus le portrait');
  });

  await step('un refus de création de compte est expliqué',async()=>{
    await page.fill('#reg-u','a');
    await page.click('#btn-reg');
    const t=await page.locator('.notif').first().textContent({timeout:3000});
    if(!/Pseudo/.test(t))throw new Error('message inattendu : '+t);
  });

  await step('un compte se crée et le voile se referme',async()=>{
    await page.fill('#reg-u','SmokeTest');
    await page.click('#btn-reg');
    await page.waitForSelector('#lore-intro',{state:'visible',timeout:8000});
    if(await page.isVisible('#pseudo-gate'))throw new Error('le voile de pseudo reste affiché après création');
  });

  // LE LORE, EN QUATRE PAGES (js/lore-intro.js). C'est le tout premier écran
  // d'un compte neuf, et il tient le tutoriel derrière lui : s'il ne
  // s'enchaîne pas jusqu'au bout, personne n'atteint jamais le jeu.
  await step('les quatre pages du Lore s\'enchaînent',async()=>{
    for(let i=0;i<4;i++){
      const shown=await page.getAttribute('.lore-page.show','data-lore');
      if(shown!==String(i))throw new Error('page '+i+' attendue, '+shown+' affichée');
      await page.click('#lore-next');
      await page.waitForTimeout(520);
    }
    await page.waitForSelector('#lore-intro',{state:'hidden',timeout:5000});
  });

  await step('le tutoriel démarre et se passe',async()=>{
    await page.waitForSelector('#tuto-root.show',{timeout:8000});
    await page.click('#tuto-skip');
    await page.click('#confirm-ok');
    await page.waitForSelector('#tuto-root.show',{state:'hidden',timeout:8000});
    if(await page.evaluate(()=>savedArmies.length)<1)throw new Error('aucune armée offerte');
  });

  await step('le coffre de réapprovisionnement s\'ouvre de lui-même',async()=>{
    await page.waitForSelector('#chest-modal.show',{timeout:8000});
    const titre=await page.textContent('#chest-title');
    if(!/réapprovisionnement/i.test(titre))throw new Error('coffre inattendu : '+titre);
    // Les lots se révèlent un par un (voir chestRevealNext, js/economy-ui.js) :
    // on clique le coffre pour l'ouvrir, puis on continue de cliquer jusqu'à
    // ce que le dernier lot vu referme la cérémonie.
    await page.click('#chest-visual');
    for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
      await page.waitForTimeout(650);
      await page.click('#chest-visual');
    }
    await page.waitForSelector('#chest-modal.show',{state:'hidden',timeout:8000});
    if(await page.evaluate(()=>dailyChestAvailable()))
      throw new Error('le coffre du jour est encore dû après son ouverture');
  });

  // L'AUTRE MOITIÉ DU CORRECTIF : à la RÉOUVERTURE, le voile ne doit jamais
  // apparaître, pas même le temps d'une image. On le vérifie deux fois : sur
  // le HTML brut servi (l'élément part masqué, donc rien ne peut clignoter
  // avant que les scripts tournent) et sur la page une fois lancée.
  await step('à la réouverture, aucun voile de connexion ne clignote',async()=>{
    const brut=await (await fetch('http://localhost:'+PORT+'/')).text();
    const balise=(brut.match(/<div class="pseudo-gate"[^>]*>/)||[''])[0];
    if(!balise)throw new Error('#pseudo-gate absent du HTML servi');
    if(!/display:\s*none/.test(balise))
      throw new Error('le voile n\'est pas masqué dans le HTML : il clignotera ('+balise+')');
    if(/class="page active"/.test(brut))
      throw new Error('une page est encore marquée active dans le HTML servi');
    await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    if(await page.isVisible('#pseudo-gate'))throw new Error('le voile s\'affiche alors qu\'un pseudo est enregistré');
    if(!await page.evaluate(()=>CUR_ACC==='SmokeTest'))throw new Error('le compte enregistré n\'est pas repris');
  });


  // LE COFFRE DE RÉAPPROVISIONNEMENT S'OUVRE TOUT SEUL. Il n'a plus de carte
  // ni de bouton « Récupérer » sur le menu : dès que son délai est écoulé et
  // que le joueur est disponible — ici, à la sortie du tutoriel — la cérémonie
  // s'ouvre d'elle-même (voir dailyChestMaybeOpen, js/economy-ui.js). Le
  // joueur ouvre le coffre lui-même, comme n'importe quel autre.

  await step('les réglages sont conservés',async()=>{
    await page.click('#settings-btn');
    await page.fill('#sp-sfx-vol','0.4');
    await page.dispatchEvent('#sp-sfx-vol','input');
    const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('mc_prefs_v1')||'{}'));
    if(p.sfx!==0.4)throw new Error('préférence de volume non enregistrée');
    await page.keyboard.press('Escape');
  });

  // LE BOUTON DE RÉGLAGES N'EST QUE SUR LE MENU PRINCIPAL. Partout ailleurs il
  // ne faisait que réserver une bande vide au-dessus du titre de la page.
  await step('le bouton de réglages ne suit pas hors du menu principal',async()=>{
    if(!await page.isVisible('#settings-btn'))
      throw new Error('le bouton de réglages manque sur le menu principal');
    // Une page en overlay (la Voie) : plus de bouton.
    await page.evaluate(()=>{renderVoiePage();showPage('page-voie');});
    await page.waitForSelector('#page-voie.active',{timeout:8000});
    if(await page.isVisible('#settings-btn'))
      throw new Error('le bouton de réglages est encore là sur la Voie');
    await page.click('#voie-ok');
    await page.waitForTimeout(400);
    // Une autre face du cube (l'Armurerie) : plus de bouton non plus.
    await page.evaluate(()=>showPage('page-reserve'));
    await page.waitForTimeout(300);
    if(await page.isVisible('#settings-btn'))
      throw new Error('le bouton de réglages est encore là sur l\'Armurerie');
    await page.evaluate(()=>showPage('face-jouer'));
    await page.waitForTimeout(700);
    if(!await page.isVisible('#settings-btn'))
      throw new Error('le bouton de réglages ne revient pas au menu principal');
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

  // LA FENÊTRE DE SÉRIE remplace le rail de six coffres qui occupait le bas du
  // menu principal : c'est elle qu'on regarde avant de relancer une partie, un
  // état de série mal calculé s'y verrait tout de suite.
  await step('la fenêtre de série montre les paliers du Pion (en haut) au Roi (en bas)',async()=>{
    await page.evaluate(()=>{
      accSet('streak_day',todayKey());accSet('streak_lock_day',null);accSet('win_streak',2);accSet('pearls',300);
      showPage('face-jouer');renderMenuChests();
    });
    // La COLONNE du menu (`.jouer-col` : identité, COMBAT, Adversaires) ne
    // porte plus ni rail de coffres, ni solde de perles, ni mention
    // « Série · N victoires » — tout est passé dans la fenêtre.
    // Les assertions visent la colonne et non `.jouer-menu` entier : sur un
    // écran d'ordinateur, `.jouer-menu` contient AUSSI la colonne de droite
    // (#menu-side), qui déplie délibérément la série et le prochain palier —
    // et qui peut donc contenir le mot « perles » quand c'est un lot de perles
    // qui vient. C'est l'exception voulue, pas le retour du désordre : ce qui
    // est proscrit, c'est d'encombrer la colonne sous le pouce.
    const menu=await page.evaluate(()=>{
      const col=document.querySelector('.jouer-col');
      return{
        rail:!!document.getElementById('jouer-chests'),
        texteSerie:/Série\s*·/.test(col.textContent),
        perles:/perles/i.test(col.textContent),
        bouton:!!document.getElementById('jouer-streak'),
      };
    });
    if(menu.rail)throw new Error('le rail de coffres est encore sur le menu principal');
    if(menu.texteSerie)throw new Error('la mention « Série · N victoires » est encore dans la colonne du menu');
    if(menu.perles)throw new Error('le solde de perles est encore dans la colonne du menu');
    if(!menu.bouton)throw new Error('le bouton « Série du jour » est absent du menu');

    // La fenêtre s'ouvre par son point d'entrée public et non par un clic sur
    // le bouton : celui-ci est masqué en mode bureau (la colonne de droite
    // montre déjà les six paliers en permanence), et ce test-ci porte sur le
    // CONTENU de la fenêtre, pas sur le bouton qui l'ouvre. Le bouton, lui,
    // est vérifié juste au-dessus — il existe et reste le chemin du téléphone.
    await page.evaluate(()=>openStreakModal());
    await page.waitForSelector('#streak-modal.show',{timeout:8000});
    await page.waitForTimeout(400);
    const r=await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('#streak-scroll .streak-row')];
      const host=document.getElementById('streak-scroll');
      const next=document.querySelector('#streak-scroll .streak-row.chest-next');
      const hb=host.getBoundingClientRect(),nb=next?next.getBoundingClientRect():null;
      return{
        n:rows.length,
        ordre:rows.map(x=>x.dataset.chest),
        etats:rows.map(x=>x.className.match(/chest-(won|next|far)/)[1]),
        // Le palier en jeu est amené dans la fenêtre visible.
        nextVisible:!!nb&&nb.top>=hb.top-2&&nb.bottom<=hb.bottom+2,
      };
    });
    if(r.n!==6)throw new Error(r.n+' paliers au lieu de 6');
    // Pion en PREMIER dans le DOM = tout en haut ; Roi en dernier = tout en bas.
    if(r.ordre.join(',')!=='pion,cavalier,fou,tour,dame,roi')throw new Error('ordre : '+r.ordre.join(','));
    if(r.etats.join(',')!=='won,won,next,far,far,far')throw new Error('états : '+r.etats.join(','));
    if(!r.nextVisible)throw new Error('la fenêtre ne s\'ouvre pas sur le palier en cours');
    await page.click('#streak-close');
    await page.waitForSelector('#streak-modal.show',{state:'hidden',timeout:8000});
  });

  // LE MODE BUREAU. Le jeu est pensé téléphone d'abord, et toutes ses règles
  // adaptatives étaient des `max-width` : sur un écran d'ordinateur, il ne
  // s'adaptait donc pas du tout — colonne de téléphone au milieu du vide, et
  // une barre des faces flottante qui RECOUVRAIT le contenu (sur « Mes
  // armées », elle masquait deux noms de cartes en plein milieu de l'écran).
  // Ce test tient les trois promesses du mode bureau : le drapeau s'allume,
  // le rail ne recouvre plus rien, et la colonne de droite déplie la série.
  // La fenêtre du test fait 1400 px avec un pointeur fin : elle est donc en
  // mode bureau, comme un vrai ordinateur.
  await step('le mode bureau pose son rail sans recouvrir le contenu',async()=>{
    await page.evaluate(()=>{showPage('face-jouer');renderMenuChests();});
    await page.waitForTimeout(400);
    const r=await page.evaluate(()=>{
      const desk=document.body.classList.contains('desk');
      const bar=document.getElementById('cube-facebar');
      const bb=bar.getBoundingClientRect();
      const vp=document.querySelector('.cube-face[data-face="jouer"] .face-viewport');
      const vb=vp.getBoundingClientRect();
      return{
        desk,railOn:document.body.classList.contains('rail-on'),
        // Rail VERTICAL collé à gauche, et non plus une pastille flottante en
        // bas au milieu.
        railGauche:bb.left<=1,railHaut:bb.height>vb.height*0.8,
        // La preuve que rien n'est recouvert : la zone utile de la face
        // commence exactement où le rail s'arrête.
        gouttiere:Math.abs(vb.left-bb.right)<=1,
        // Les libellés sortent de l'ombre : à la souris, il y a la place.
        libelles:[...bar.querySelectorAll('.cfb-label')]
          .filter(el=>getComputedStyle(el).display!=='none').length,
        // La colonne de droite déplie les six paliers de la série.
        sideRows:document.querySelectorAll('#ms-streak-rows .streak-row').length,
        sideVisible:!!document.getElementById('menu-side')&&
          getComputedStyle(document.getElementById('menu-side')).display!=='none',
        // Et le bouton qui ouvrait la fenêtre s'efface : la colonne montre déjà
        // ce qu'il allait chercher.
        boutonMasque:getComputedStyle(document.getElementById('jouer-streak')).display==='none',
      };
    });
    if(!r.desk)throw new Error('body.desk ne s\'allume pas sur un écran d\'ordinateur');
    if(!r.railOn)throw new Error('body.rail-on manque alors que la barre des faces est affichée');
    if(!r.railGauche||!r.railHaut)throw new Error('la barre des faces n\'est pas devenue un rail latéral');
    if(!r.gouttiere)throw new Error('la zone utile ne recule pas derrière le rail : il recouvre le contenu');
    if(r.libelles!==4)throw new Error(r.libelles+' libellés visibles sur le rail au lieu de 4');
    if(!r.sideVisible)throw new Error('la colonne de droite du menu est absente');
    if(r.sideRows!==6)throw new Error(r.sideRows+' paliers dans la colonne de droite au lieu de 6');
    if(!r.boutonMasque)throw new Error('le bouton « Série du jour » double encore la colonne de droite');
  });

  // Et le retrait doit DISPARAÎTRE avec le rail : pendant une partie, le cube
  // est verrouillé et la barre des faces s'efface. Sans ce lien, le plateau
  // aurait joué avec une bande vide de 200 px sur sa gauche.
  await step('la gouttière du rail disparaît avec lui',async()=>{
    const r=await page.evaluate(()=>{
      const vp=document.querySelector('.cube-face[data-face="jouer"] .face-viewport');
      document.body.classList.remove('rail-on');       // ce que fait updateArrows() quand la barre s'en va
      const sans=vp.getBoundingClientRect().left;
      document.body.classList.add('rail-on');
      const avec=vp.getBoundingClientRect().left;
      return{sans,avec};
    });
    if(r.sans>1)throw new Error('la zone utile garde son retrait alors que le rail est masqué ('+Math.round(r.sans)+' px)');
    if(r.avec<=1)throw new Error('la zone utile ne recule plus quand le rail revient');
  });

  // LA SÉRIE EST QUOTIDIENNE : une défaite la ferme pour le reste de la
  // journée (streakLockedToday, js/economy.js) — plus aucun coffre gagné, plus
  // aucun palier « prochain », et la fenêtre s'ouvre sur le début.
  await step('une défaite verrouille la série jusqu\'au lendemain',async()=>{
    const r=await page.evaluate(()=>{
      accSet('streak_day',todayKey());accSet('win_streak',3);accSet('streak_lock_day',null);
      const report=economySettle('loss',{board:[],promoGains:{}});
      renderStreakModal();
      return{
        streakAfterLoss:report.streak,
        locked:streakLockedToday(),
        next:document.querySelectorAll('#streak-scroll .streak-row.chest-next').length,
        sub:document.getElementById('streak-sub').textContent,
      };
    });
    if(r.streakAfterLoss!==0)throw new Error('série non remise à zéro : '+r.streakAfterLoss);
    if(!r.locked)throw new Error('la série n\'est pas verrouillée après une défaite');
    if(r.next)throw new Error('un palier est encore marqué « prochain » alors que la série est perdue');
    if(!/perdue/i.test(r.sub))throw new Error('la fenêtre ne dit pas que la série est perdue : '+r.sub);
    // Une victoire le MÊME jour ne doit rendre aucun coffre.
    const r2=await page.evaluate(()=>{
      const report=economySettle('win',{board:[],promoGains:{}});
      return{chest:report.chest,streak:report.streak};
    });
    if(r2.chest)throw new Error('un coffre a été gagné malgré le verrou du jour');
    // Série terminée : les six paliers sont acquis, la fenêtre ouvre en haut.
    const r3=await page.evaluate(()=>{
      accSet('streak_day',todayKey());accSet('streak_lock_day',null);accSet('win_streak',6);
      renderStreakModal();
      return{
        won:document.querySelectorAll('#streak-scroll .streak-row.chest-won').length,
        next:document.querySelectorAll('#streak-scroll .streak-row.chest-next').length,
        haut:document.getElementById('streak-scroll').scrollTop,
      };
    });
    if(r3.won!==6)throw new Error('série terminée : '+r3.won+' paliers acquis au lieu de 6');
    if(r3.next)throw new Error('série terminée : un palier est encore « prochain »');
    if(r3.haut>2)throw new Error('série terminée : la fenêtre ne s\'ouvre pas sur le début');
    // Reset propre pour la suite du parcours (achat de coffre plus bas).
    await page.evaluate(()=>{accSet('streak_lock_day',null);accSet('win_streak',0);});
  });

  // LA SÉRIE REPART DE ZÉRO CHAQUE JOUR. Rien ne remettait `win_streak` à zéro
  // au changement de date : le compteur traversait les jours, et passé six
  // victoires cumulées la fenêtre affichait « Série terminée » à vie, sans
  // plus jamais de palier à décrocher.
  await step('la série repart du Coffre Pion le lendemain',async()=>{
    const r=await page.evaluate(()=>{
      // Une série d'hier, terminée et verrouillée.
      accSet('streak_day','2000-01-01');accSet('win_streak',6);
      accSet('streak_lock_day','2000-01-01');
      const snap=streakSnapshot();
      renderStreakModal();
      return{
        streak:snap.streak,next:snap.nextIdx,locked:snap.locked,
        prochain:document.querySelector('#streak-scroll .streak-row.chest-next')?.dataset.chest||null,
        acquis:document.querySelectorAll('#streak-scroll .streak-row.chest-won').length,
      };
    });
    if(r.streak!==0)throw new Error('la série d\'hier n\'est pas remise à zéro : '+r.streak);
    if(r.locked)throw new Error('le verrou d\'hier est encore posé aujourd\'hui');
    if(r.acquis)throw new Error(r.acquis+' paliers encore marqués acquis au réveil');
    if(r.prochain!=='pion')throw new Error('le prochain palier n\'est pas le Coffre Pion : '+r.prochain);
  });

  // LE COFFRE SUIT LA SÉRIE, ET RIEN D'AUTRE. Un plafond par le palier de
  // l'adversaire ramenait tout coffre au Coffre Pion contre les deux plus
  // faibles — c'est-à-dire contre ceux que la galerie conseille à un compte
  // neuf : six victoires d'affilée, six Coffres Pion.
  await step('six victoires d\'affilée montent du Coffre Pion au Coffre Roi',async()=>{
    const ids=await page.evaluate(()=>{
      aiSetOpponent('cendre');            // le plus faible des douze (tier 0)
      accSet('streak_day',todayKey());accSet('streak_lock_day',null);accSet('win_streak',0);
      const out=[];
      for(let i=0;i<6;i++)out.push(economySettle('win',{board:[],promoGains:{}}).chest?.id||null);
      return out;
    });
    const attendu='pion,cavalier,fou,tour,dame,roi';
    if(ids.join(',')!==attendu)
      throw new Error('coffres de la série contre Cendre : '+ids.join(',')+' au lieu de '+attendu);
    await page.evaluate(()=>{
      aiSetOpponent('instructeur');
      accSet('streak_lock_day',null);accSet('win_streak',0);
    });
  });

  // LE BOUTON DU MENU OUVRE LA PAGE, ET « OK » EN SORT. Le reste des étapes
  // pilote les deux voies par leurs fonctions ; celle-ci vérifie le chemin que
  // le joueur emprunte réellement — un bouton, deux onglets, une sortie.
  await step('le menu ouvre la page des récompenses, et « OK » en sort',async()=>{
    await page.evaluate(()=>{showPage('face-jouer');});
    await page.waitForTimeout(400);
    await page.click('#jouer-rewards');
    await page.waitForSelector('#page-rewards.active',{timeout:8000});
    // On lit l'AFFICHAGE CALCULÉ et pas l'attribut `hidden` : un sélecteur
    // d'identifiant plus fort que `[hidden]` laissait la colonne affichée sous
    // la rangée alors que l'attribut, lui, était bien posé.
    const vu=()=>({
      colonneVisible:getComputedStyle(document.getElementById('rw-pane-colonne')).display!=='none',
      rangeeVisible:getComputedStyle(document.getElementById('rw-pane-rangee')).display!=='none',
    });
    const onglets=await page.evaluate(vu);
    if(!onglets.colonneVisible||onglets.rangeeVisible)
      throw new Error('la page ne s\'ouvre pas sur la colonne');
    await page.click('#page-rewards .rw-tab[data-tab="rangee"]');
    await page.waitForTimeout(200);
    const apres=await page.evaluate(()=>({
      colonneVisible:getComputedStyle(document.getElementById('rw-pane-colonne')).display!=='none',
      rangeeVisible:getComputedStyle(document.getElementById('rw-pane-rangee')).display!=='none',
      quetes:document.querySelectorAll('#rw-pane-rangee .rw-quest').length,
      cases:document.querySelectorAll('#rw-row-strip .rw-cell').length,
    }));
    if(apres.colonneVisible||!apres.rangeeVisible)throw new Error('l\'onglet rangée ne s\'affiche pas');
    if(apres.cases!==25)throw new Error(apres.cases+' cases dans la rangée au lieu de 25');
    if(apres.quetes!==3)throw new Error(apres.quetes+' quêtes affichées au lieu de 3');
    await page.click('#rw-ok');
    await page.waitForTimeout(500);
    if(await page.isVisible('#page-rewards.active'))throw new Error('« OK » ne referme pas la page');
  });

  // UNE SEULE IMAGE PAR COFFRE, ET C'EST LA STATUETTE DU MAGASIN. Il y en
  // avait deux : le coffre à couvercle dessiné en CSS dans la série du jour,
  // la colonne et le mode test, et la statuette au Magasin — deux objets pour
  // le même Coffre Pion, plus un troisième en l'ouvrant. Les quatre coffres
  // équipés de planches (Pion, Cavalier, Fou, Tour) montrent partout leur
  // statuette ; la Dame et le Roi gardent le couvercle, faute de planches.
  await step('les coffres montrent partout la statuette du Magasin',async()=>{
    const r=await page.evaluate(()=>{
      openStreakModal();
      const lire=sel=>{
        const el=document.querySelector(sel);
        if(!el)return 'absent';
        if(el.querySelector('.chest-pawn img'))return 'statuette';
        if(el.querySelector('.chest-lid'))return 'couvercle';
        return 'rien';
      };
      const serie={};
      ['pion','cavalier','fou','tour','dame','roi'].forEach(id=>{
        serie[id]=lire('#streak-scroll .streak-row[data-chest="'+id+'"]');
      });
      closeStreakModal();
      accSet('col_wins',3);accSet('col_claimed',0);
      openRewardsPage('colonne');
      const colonne=lire('#rw-col-strip .rw-step[data-idx="0"]');       // Coffre Pion
      const source=(document.querySelector('#rw-col-strip .chest-pawn img')||{}).getAttribute
        ?document.querySelector('#rw-col-strip .chest-pawn img').getAttribute('src'):'';
      return{serie,colonne,source,
        // Le mélange qui efface le fond noir de la planche ne survit pas à un
        // filtre posé sur le CONTENEUR : il doit rester sur l'image.
        blend:(()=>{
          const img=document.querySelector('#rw-col-strip .chest-pawn img');
          if(!img)return null;
          return{
            melange:getComputedStyle(img).mixBlendMode,
            filtreBoite:getComputedStyle(img.parentElement).filter,
            opaciteBoite:getComputedStyle(img.parentElement).opacity,
          };
        })()};
    });
    ['pion','cavalier','fou','tour'].forEach(id=>{
      if(r.serie[id]!=='statuette')
        throw new Error('série du jour : le Coffre '+id+' montre « '+r.serie[id]+' » au lieu de sa statuette');
    });
    ['dame','roi'].forEach(id=>{
      if(r.serie[id]!=='couvercle')
        throw new Error('série du jour : le Coffre '+id+' n\'a pas de planches, il devrait garder le couvercle ('+r.serie[id]+')');
    });
    if(r.colonne!=='statuette')throw new Error('colonne des victoires : « '+r.colonne+' » au lieu de la statuette');
    if(!/01-intact\.webp$/.test(r.source||''))throw new Error('la colonne ne pointe pas la planche intacte : '+r.source);
    if(!r.blend)throw new Error('aucune statuette rendue dans la colonne');
    if(r.blend.melange!=='screen')throw new Error('le mélange qui efface le fond noir a disparu : '+r.blend.melange);
    if(r.blend.filtreBoite!=='none')
      throw new Error('un filtre est posé sur la boîte de la statuette : il isole le mélange et fait revenir le fond noir ('+r.blend.filtreBoite+')');
    if(r.blend.opaciteBoite!=='1')
      throw new Error('une opacité est posée sur la boîte de la statuette : même effet qu\'un filtre ('+r.blend.opaciteBoite+')');
  });

  // LES DEUX BANDEAUX NE PARLENT PLUS. Ils redisaient le nom de la voie (que
  // l'onglet porte déjà), sa progression en toutes lettres et un compteur —
  // trois façons d'écrire ce que la colonne et la rangée MONTRENT. Et le
  // bouton « Diagonale de la puissance » a quitté le bas de la page : elle
  // s'ouvre depuis la pastille de rang du menu.
  await step('la page des récompenses ne redit plus ce qu\'elle montre',async()=>{
    const r=await page.evaluate(()=>{
      accSet('col_wins',5);accSet('col_claimed',5);accSet('tickets',0);accSet('rich_claimed',1);
      openRewardsPage('colonne');
      const colonne=document.getElementById('rw-pane-colonne');
      const bandeauCol=colonne.querySelector('.rw-banner');
      rewardsSetTab('rangee');
      const rangee=document.getElementById('rw-pane-rangee');
      return{
        texteBandeauCol:bandeauCol?bandeauCol.textContent.trim():'',
        jaugeCol:!!colonne.querySelector('.rw-banner .ms-gauge'),
        // Rien à encaisser dans la rangée : pas de bandeau du tout.
        bandeauRangee:!!rangee.querySelector('.rw-banner'),
        diagonale:!!document.getElementById('rw-goto-voie'),
        pied:document.querySelectorAll('#page-rewards .rw-foot').length,
      };
    });
    if(r.texteBandeauCol)throw new Error('le bandeau de la colonne écrit encore : '+r.texteBandeauCol);
    if(!r.jaugeCol)throw new Error('la jauge de la colonne a disparu avec le texte');
    if(r.bandeauRangee)throw new Error('la rangée garde un bandeau vide alors qu\'il n\'y a rien à encaisser');
    if(r.diagonale)throw new Error('le bouton « Diagonale de la puissance » est encore là');
    if(r.pied)throw new Error('le pied de page vide est encore là');
  });

  // LA SÉRIE DU JOUR A UNE FIN. Elle n'en avait pas : chestForStreak plafonnait
  // au dernier coffre, si bien que la 7e victoire du jour, la 8e et toutes les
  // suivantes redonnaient un COFFRE ROI — le palier le plus rare du jeu devenu
  // le lot ordinaire de la fin de journée, et les cinq premiers paliers réduits
  // à un chemin pour y arriver.
  await step('la série du jour s\'arrête au sixième coffre',async()=>{
    const r=await page.evaluate(()=>{
      accSet('streak_day',todayKey());accSet('streak_lock_day',null);accSet('win_streak',6);
      const apres=[];
      for(let i=0;i<3;i++)apres.push(economySettle('win',{board:[],promoGains:{}}).chest);
      renderStreakModal();
      return{
        apres:apres.map(c=>c?c.id:null),
        septieme:chestForStreak(7),
        sub:document.getElementById('streak-sub').textContent,
        marques:document.querySelectorAll('#streak-scroll .streak-row.chest-won').length,
        prochain:document.querySelectorAll('#streak-scroll .streak-row.chest-next').length,
      };
    });
    if(r.apres.some(c=>c!==null))
      throw new Error('la série continue de donner des coffres après le sixième : '+r.apres.join(','));
    if(r.septieme!==null)throw new Error('chestForStreak(7) rend encore un coffre');
    // Série terminée : la fenêtre ne dit plus RIEN sous son titre. Six coffres
    // cochés et aucun palier « prochain » le montrent déjà ; la phrase qui
    // doublait ce constat a été retirée.
    if(r.sub.trim())throw new Error('la fenêtre écrit encore quelque chose une fois la série terminée : '+r.sub);
    if(r.marques!==6)throw new Error(r.marques+' paliers cochés au lieu de 6 : rien ne dit plus que la série est finie');
    if(r.prochain)throw new Error('un palier est encore marqué « prochain » alors que la série est terminée');
    await page.evaluate(()=>{accSet('streak_lock_day',null);accSet('win_streak',0);});
  });

  // LA COLONNE DES VICTOIRES prend le relais : elle avance d'un cran à CHAQUE
  // victoire, série du jour terminée ou non, et elle ne se remet jamais à zéro.
  await step('la colonne des victoires avance à chaque victoire, même série terminée',async()=>{
    const r=await page.evaluate(()=>{
      accSet('col_wins',0);accSet('col_claimed',0);
      accSet('streak_day',todayKey());accSet('streak_lock_day',null);accSet('win_streak',6);
      for(let i=0;i<4;i++)economySettle('win',{board:[],promoGains:{}});
      const avantDefaite=colWins();
      economySettle('loss',{board:[],promoGains:{}});
      return{avantDefaite,apresDefaite:colWins(),dus:colPending()};
    });
    if(r.avantDefaite!==4)throw new Error('la colonne a avancé de '+r.avantDefaite+' crans au lieu de 4');
    if(r.apresDefaite!==4)throw new Error('une défaite a fait reculer la colonne : '+r.apresDefaite);
    if(r.dus!==4)throw new Error(r.dus+' paliers dus au lieu de 4');
  });

  // L'ORDRE DES TRENTE PALIERS est la spécification du système : il se vérifie
  // en entier, sinon une inversion passerait inaperçue.
  await step('les trente paliers de la colonne sont dans l\'ordre annoncé',async()=>{
    const lus=await page.evaluate(()=>VICTORY_COLUMN.map(s=>s.chest||('j'+s.jokers)));
    const attendu=['pion','pion','j3','cavalier','pion','cavalier','pion','pion','fou','pion',
                   'pion','cavalier','j5','pion','tour','pion','cavalier','pion','pion','j10',
                   'pion','dame','cavalier','pion','fou','pion','j15','pion','tour','roi'];
    if(lus.length!==30)throw new Error(lus.length+' paliers au lieu de 30');
    if(lus.join(',')!==attendu.join(','))
      throw new Error('ordre de la colonne :\n  '+lus.join(',')+'\nau lieu de\n  '+attendu.join(','));
  });

  // On encaisse un palier À LA FOIS, et un coffre encaissé s'ouvre avec la
  // VRAIE cérémonie — la même qu'un coffre de série ou acheté au Magasin.
  await step('un palier de coffre s\'encaisse et ouvre sa cérémonie',async()=>{
    await page.evaluate(()=>{
      accSet('col_wins',2);accSet('col_claimed',0);accSet('jokers',0);
      // Pastille du menu : elle compte TOUT ce qui attend. On met la rangée et
      // les jokers hors jeu pour n'y lire que les deux paliers de la colonne.
      accSet('tickets',0);accSet('rich_claimed',0);
      openRewardsPage('colonne');
    });
    await page.waitForSelector('#page-rewards.active',{timeout:8000});
    const avant=await page.evaluate(()=>({
      dus:colPending(),
      badge:document.getElementById('jouer-rewards-badge').textContent,
      lignes:document.querySelectorAll('#rw-col-strip .rw-step').length,
      aPrendre:document.querySelectorAll('#rw-col-strip .rw-due').length,
    }));
    if(avant.lignes!==30)throw new Error(avant.lignes+' lignes dans la colonne au lieu de 30');
    if(avant.aPrendre!==2)throw new Error(avant.aPrendre+' paliers « à prendre » au lieu de 2');
    if(avant.badge!=='2')throw new Error('pastille du menu : '+avant.badge+' au lieu de 2 (les deux paliers dus)');
    await page.click('#rw-claim-col');
    await page.waitForSelector('#chest-modal.show',{timeout:8000});
    for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
      await page.click('#chest-modal',{position:{x:8,y:8}});
      await page.waitForTimeout(400);
    }
    await page.waitForSelector('#chest-modal.show',{state:'hidden',timeout:9000});
    // L'exercice de déplacement s'ouvre si le coffre contenait une créature
    // inédite : on en sort avant de reprendre.
    if(await page.isVisible('#page-drill.active')){
      await page.evaluate(()=>{if(typeof drillAbort==='function')drillAbort();showPage('page-rewards');});
    }
    const apres=await page.evaluate(()=>({encaisses:colClaimed(),dus:colPending()}));
    if(apres.encaisses!==1)throw new Error(apres.encaisses+' paliers encaissés au lieu de 1');
    if(apres.dus!==1)throw new Error(apres.dus+' paliers encore dus au lieu de 1');
  });

  // LE JOKER SE CHOISIT. Trois jokers convertis en une créature donnent trois
  // exemplaires de CETTE créature — et rien ne se perd si l'on ferme la
  // fenêtre sans choisir.
  await step('un palier de jokers se convertit en exemplaires de son choix',async()=>{
    const r=await page.evaluate(()=>{
      // Le troisième palier de la colonne, c'est 3 jokers.
      accSet('col_wins',3);accSet('col_claimed',2);accSet('jokers',0);
      openRewardsPage('colonne');
      rewardsClaimColumn();
      return{jokers:jokerBalance(),ouverte:document.getElementById('joker-modal').classList.contains('show')};
    });
    if(r.jokers!==3)throw new Error(r.jokers+' jokers en réserve au lieu de 3');
    if(!r.ouverte)throw new Error('la fenêtre de conversion ne s\'est pas ouverte');
    const conv=await page.evaluate(()=>{
      const choix=document.querySelector('.joker-choice');
      const id=choix?choix.dataset.piece:null;
      return{id,avant:id?invCount(id):0,choix:document.querySelectorAll('.joker-choice').length};
    });
    if(!conv.id)throw new Error('aucune créature proposée à la conversion');
    // Aucun Monarque dans la grille : un second roi ne se joue pas.
    const monarque=await page.evaluate(()=>[...document.querySelectorAll('.joker-choice')]
      .some(b=>(PIECES.find(p=>p.id===b.dataset.piece)||{}).class==='Monarque'));
    if(monarque)throw new Error('un Monarque est proposé à la conversion');
    await page.click('.joker-choice[data-piece="'+conv.id+'"]');
    await page.click('#confirm-ok');
    await page.waitForTimeout(300);
    const apres=await page.evaluate(()=>({
      jokers:jokerBalance(),
      stock:invCount(document.body.dataset.jokTest||''),
    }));
    const stock=await page.evaluate(id=>invCount(id),conv.id);
    if(apres.jokers!==0)throw new Error('il reste '+apres.jokers+' jokers après conversion');
    if(stock!==conv.avant+3)throw new Error('stock après conversion : '+stock+' au lieu de '+(conv.avant+3));
  });

  // LA RANGÉE DE LA RICHESSE : vingt-cinq paliers, payés en tickets. Elle ne
  // s'encaisse que si les tickets sont là, et l'encaissement les dépense.
  await step('la rangée de la richesse se paie en tickets',async()=>{
    const table=await page.evaluate(()=>WEALTH_ROW.map(s=>s.pearls+'/'+s.cost));
    const attendu=[].concat(
      Array(5).fill('5/3'),Array(5).fill('10/4'),Array(5).fill('15/5'),
      Array(5).fill('20/6'),Array(5).fill('25/8'));
    if(table.join(',')!==attendu.join(','))
      throw new Error('rangée : '+table.join(',')+'\nau lieu de\n'+attendu.join(','));
    const r=await page.evaluate(()=>{
      accSet('rich_claimed',0);accSet('tickets',2);accSet('pearls',100);
      const refus=richClaimNext();
      accSet('tickets',5);
      const ok=richClaimNext();
      return{refus,ok,tickets:ticketBalance(),perles:pearlBalance(),paliers:richClaimed()};
    });
    if(r.refus)throw new Error('un palier a été encaissé sans les tickets nécessaires');
    if(!r.ok)throw new Error('le palier n\'a pas été encaissé alors que les tickets y sont');
    if(r.tickets!==2)throw new Error('tickets après encaissement : '+r.tickets+' au lieu de 2 (5 - 3)');
    if(r.perles!==105)throw new Error('perles après encaissement : '+r.perles+' au lieu de 105');
    if(r.paliers!==1)throw new Error(r.paliers+' paliers encaissés au lieu de 1');
  });

  // LES QUÊTES : trois par jour, sur des créatures QU'ON POSSÈDE, de natures
  // différentes. Une quête infaisable (une créature qu'on n'a pas) serait un
  // ticket perdu d'avance.
  await step('les trois quêtes du jour sont faisables et distinctes',async()=>{
    const r=await page.evaluate(()=>{
      accSet('quests_day',null);accSet('quests',null);accSet('tickets',0);
      const qs=questsToday();
      const owned=invOwnedIds();
      return{
        n:qs.length,
        natures:new Set(qs.map(q=>q.id)).size,
        pieces:qs.map(q=>q.pieceId).filter(Boolean),
        hors:qs.filter(q=>q.pieceId&&!owned.includes(q.pieceId)).map(q=>q.pieceId),
        monarques:qs.filter(q=>q.pieceId&&(PIECES.find(p=>p.id===q.pieceId)||{}).class==='Monarque').length,
        labels:qs.map(q=>questLabel(q)),
      };
    });
    if(r.n!==3)throw new Error(r.n+' quêtes au lieu de 3');
    if(r.natures!==3)throw new Error('deux quêtes de même nature le même jour');
    if(r.hors.length)throw new Error('quête sur une créature non possédée : '+r.hors.join(','));
    if(r.monarques)throw new Error('quête sur un Monarque : on ne mate pas avec son propre roi');
    if(r.labels.some(l=>!l))throw new Error('quête sans libellé');
  });

  // LES QUÊTES SE REMPLISSENT PAR DE VRAIS FAITS DE JEU, et le ticket tombe
  // dès qu'elles sont remplies : rien à aller chercher.
  await step('une quête accomplie verse ses tickets',async()=>{
    const r=await page.evaluate(()=>{
      accSet('quests_day',todayKey());accSet('tickets',0);
      // Une quête connue, posée à la main : « déplacer 5 fois » la première
      // créature possédée.
      const cible=invOwnedIds().find(id=>(PIECES.find(p=>p.id===id)||{}).class!=='Monarque');
      accSet('quests',[{id:'move',pieceId:cible,prog:0,done:false}]);
      for(let i=0;i<4;i++)questNote('move',cible,1);
      const mi=questsToday()[0];
      questNote('move',cible,1);
      const fin=questsToday()[0];
      return{mi:mi.prog,miDone:mi.done,fin:fin.prog,finDone:fin.done,tickets:ticketBalance()};
    });
    if(r.mi!==4||r.miDone)throw new Error('quête à mi-parcours : '+r.mi+'/5, done='+r.miDone);
    if(!r.finDone)throw new Error('quête non accomplie après le 5e déplacement');
    if(r.tickets!==2)throw new Error('tickets versés : '+r.tickets+' au lieu de 2');
  });

  // LES COUPS DU JOUEUR SEULEMENT. recordMove est traversée par TOUS les
  // coups, y compris ceux de l'adversaire : compter les siens ferait avancer
  // les quêtes du joueur en le regardant perdre.
  await step('seuls les coups du joueur font avancer une quête',async()=>{
    const r=await page.evaluate(()=>{
      const cible=invOwnedIds().find(id=>(PIECES.find(p=>p.id===id)||{}).class!=='Monarque');
      accSet('quests_day',todayKey());accSet('tickets',0);
      accSet('quests',[{id:'move',pieceId:cible,prog:0,done:false}]);
      const gs={playerColor:'w',movePairs:[],board:[],history:[]};
      // Coup du joueur, puis coup de l'adversaire.
      recordMove({color:'w',pieceId:cible},{r:4,c:4},false,gs,{r:6,c:4});
      const apresJoueur=questsToday()[0].prog;
      recordMove({color:'b',pieceId:cible},{r:3,c:4},false,gs,{r:1,c:4});
      const apresAdversaire=questsToday()[0].prog;
      // Bataille du tutoriel : rien ne compte non plus.
      recordMove({color:'w',pieceId:cible},{r:4,c:5},false,{...gs,tuto:{}},{r:6,c:5});
      return{apresJoueur,apresAdversaire,apresTuto:questsToday()[0].prog};
    });
    if(r.apresJoueur!==1)throw new Error('le coup du joueur n\'a pas compté');
    if(r.apresAdversaire!==1)throw new Error('un coup de l\'adversaire a fait avancer la quête');
    if(r.apresTuto!==1)throw new Error('un coup du tutoriel a fait avancer la quête');
  });

  // ÉCHEC ET MAT : la quête crédite la créature qui ATTAQUE le roi, y compris
  // quand l'échec est donné à la découverte par une autre pièce que celle qui
  // vient de bouger.
  await step('l\'échec est crédité à la pièce qui attaque le roi',async()=>{
    const r=await page.evaluate(()=>{
      const vide=()=>Array.from({length:8},()=>Array(8).fill(null));
      const b=vide();
      b[0][4]={color:'b',type:'k',pieceId:'roi'};
      b[7][4]={color:'w',type:'k',pieceId:'roi'};
      b[0][0]={color:'w',type:'r',pieceId:'tour-primordiale'};   // échec sur la rangée
      const gs={board:b,playerColor:'w',aiColor:'b',turn:'b',history:[],movePairs:[],
                anchored:new Set(),medusaParalyzed:new Set()};
      return questCheckers(gs,'b');
    });
    if(!r.includes('tour-primordiale'))
      throw new Error('la pièce qui donne échec n\'est pas reconnue : '+JSON.stringify(r));
  });

  // LE MODE TEST N'ÉCRIT RIEN, ici comme ailleurs : on y regarde sa vraie
  // progression sans jamais la modifier.
  await step('le mode test ne fait avancer aucune des deux voies',async()=>{
    const url=page.url();
    await page.goto('http://localhost:'+PORT+'/test',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(1200);
    const r=await page.evaluate(()=>{
      const avantCol=colWins(),avantTik=ticketBalance();
      colNoteWin();
      questNote('win',null,1);
      ticketAdd(50);
      return{avantCol,apresCol:colWins(),avantTik,apresTik:ticketBalance()};
    });
    if(r.apresCol!==r.avantCol)throw new Error('le mode test a fait avancer la colonne');
    if(r.apresTik!==r.avantTik)throw new Error('le mode test a crédité des tickets');
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(1200);
    for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
      await page.click('#chest-modal',{position:{x:8,y:8}});
      await page.waitForTimeout(250);
    }
  });

  await step('le Magasin vend les six coffres, le Pion sous sa statuette et sans fiche technique',async()=>{
    await page.evaluate(()=>{accSet('pearls',5000);showPage('face-jouer');});
    // Navigue réellement sur la face « magasin » (et non un simple appel de
    // renderMagasinPage() en coulisses) : sans la rotation du cube, la face
    // jouer resterait devant et intercepterait les clics.
    await page.click('.cube-facebar-btn[data-face="magasin"]');
    await page.waitForTimeout(600);
    const r=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('#shop-chest-grid .shop-chest')];
      const pion=document.querySelector('#shop-chest-grid .shop-chest[data-chest="pion"]');
      return{
        n:cards.length,
        // Le Pion et le Cavalier portent leur planche 01-intact, pas le
        // coffre dessiné en CSS.
        pionImg:(pion&&pion.querySelector('.chest-pawn img'))
          ?pion.querySelector('.chest-pawn img').getAttribute('src'):'',
        pionHasLidChest:!!pion&&!!pion.querySelector('.chest-lid'),
        cavImg:(()=>{
          const c=document.querySelector('#shop-chest-grid .shop-chest[data-chest="cavalier"] .chest-pawn img');
          return c?c.getAttribute('src'):'';
        })(),
        // Ni nombre de lots ni probabilité de pièce inédite sur les cartes.
        fiches:document.querySelectorAll('#shop-chest-grid .chest-rar').length,
        prix:document.querySelectorAll('#shop-chest-grid .shop-chest-price').length,
      };
    });
    if(r.n!==6)throw new Error(r.n+' coffres au lieu de 6 dans le Magasin');
    if(!/01-intact\.webp$/.test(r.pionImg||''))throw new Error('le Coffre Pion du Magasin ne montre pas sa statuette : '+r.pionImg);
    if(r.pionHasLidChest)throw new Error('le Coffre Pion du Magasin montre encore le coffre à couvercle dessiné');
    if(!/cavalier\/01-intact\.webp$/.test(r.cavImg||''))throw new Error('le Coffre Cavalier du Magasin ne montre pas sa statuette : '+r.cavImg);
    if(r.fiches)throw new Error(r.fiches+' fiches technique (lots / % inédite) encore affichées dans le Magasin');
    if(r.prix!==6)throw new Error('prix manquants dans le Magasin : '+r.prix+'/6');
    // Achète un Coffre Pion : la SÉQUENCE DE BRIS doit se jouer, exactement
    // comme pour un Coffre Pion gagné en partie (js/chest-break.js).
    await page.click('#shop-chest-grid .shop-chest[data-chest="pion"]');
    await page.click('#confirm-ok');
    await page.waitForSelector('#chest-modal.show',{timeout:8000});
    await page.waitForTimeout(400);
    const state=await page.evaluate(()=>({
      pbBreak:!document.getElementById('chest-break').hidden,
      frames:document.querySelectorAll('#chest-break .pb-frame').length,
    }));
    if(!state.pbBreak||state.frames!==8)
      throw new Error('la séquence de bris du Pion ne se joue pas depuis le Magasin (frames : '+state.frames+')');
    // Frappe jusqu'à l'explosion, puis déroule la révélation des lots.
    for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
      await page.click('#chest-modal');
      await page.waitForTimeout(650);
    }
    await page.waitForSelector('#chest-modal.show',{state:'hidden',timeout:8000});
  });

  // Le bouton OK de la Voie doit rester à l'écran quel que soit le
  // défilement : il ne peut pas être en position:fixed (l'animation d'entrée
  // de .page.active laisse un transform qui en ferait le bloc conteneur), il
  // est donc en position:absolute dans #page-voie, lui-même en fixed.
  // Et c'est une BARRE COLLÉE AU BAS DE L'ÉCRAN, pas une pastille flottante :
  // c'est la seule sortie de l'écran, elle prend toute la largeur, la hauteur
  // d'un vrai bouton de pouce, et son bord inférieur touche celui de l'écran.
  await step('le bouton OK de la Voie est une barre collée au bas de l\'écran',async()=>{
    await page.evaluate(()=>{renderVoiePage();showPage('page-voie');});
    await page.waitForSelector('#page-voie.active',{timeout:8000});
    await page.waitForTimeout(500);
    const r=await page.evaluate(()=>{
      const host=document.getElementById('voie-scroll');
      const btn=document.getElementById('voie-ok');
      const vh=innerHeight;
      const mesure=()=>{const b=btn.getBoundingClientRect();return{top:b.top,bottom:b.bottom,w:b.width,h:b.height};};
      host.scrollTop=0;
      const haut=mesure();
      host.scrollTop=host.scrollHeight;              // tout en bas
      const bas=mesure();
      // La Voie passe-t-elle DERRIÈRE le bouton ? Le point juste à côté de la
      // pastille, à sa hauteur, doit appartenir à la zone défilante — s'il y
      // avait encore un bandeau, il occuperait toute la largeur.
      const b=btn.getBoundingClientRect();
      const cote=document.elementFromPoint(8,b.top+b.height/2);
      return{haut,bas,vh,vw:innerWidth,
        // Largeur de RÉFÉRENCE : celle de la page, et non innerWidth — sur un
        // écran d'ordinateur, la barre de défilement en retire une dizaine de
        // pixels que le bouton n'a aucun moyen de reprendre.
        pw:document.getElementById('page-voie').clientWidth,
        scrollable:host.scrollHeight>host.clientHeight+40,
        retourVisible:!!document.getElementById('voie-back'),
        // Le point au ras du bord gauche, à hauteur du bouton, doit être LE
        // BOUTON : c'est ce qui distingue une barre pleine largeur d'une
        // pastille centrée.
        barrePleineLargeur:cote===btn||btn.contains(cote)};
    });
    if(!r.scrollable)throw new Error('la Voie ne défile pas, le test ne prouve rien');
    if(r.retourVisible)throw new Error('le bouton « Retour » est encore là');
    // Immobile d'un bout à l'autre du défilement, et dans le bas de l'écran.
    if(Math.abs(r.haut.top-r.bas.top)>1)
      throw new Error('le bouton OK bouge avec le défilement ('+r.haut.top+' → '+r.bas.top+')');
    // COLLÉ : le bas du bouton touche le bas de l'écran, à un pixel près.
    if(Math.abs(r.haut.bottom-r.vh)>1)
      throw new Error('le bouton OK n\'est pas collé au bas de l\'écran (bas à '+Math.round(r.haut.bottom)+' pour une hauteur de '+r.vh+')');
    // AGRANDI : toute la largeur, et la hauteur d'un vrai bouton de pouce.
    if(r.haut.w<r.pw-1)
      throw new Error('le bouton OK n\'occupe pas toute la largeur ('+Math.round(r.haut.w)+' px pour '+r.pw+' px de page)');
    if(r.haut.h<52)
      throw new Error('le bouton OK n\'est haut que de '+Math.round(r.haut.h)+' px');
    if(!r.barrePleineLargeur)
      throw new Error('le bouton OK ne s\'étend pas jusqu\'au bord de l\'écran');
    await page.click('#voie-ok');
    await page.waitForTimeout(400);
    if(await page.isVisible('#page-voie.active'))throw new Error('le bouton OK ne referme pas la Voie');
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

  // UN COFFRE NE SE REMBOURSE JAMAIS. Le Coffre Pion l'a fait : 18 perles au
  // plus, ×1,8 sur un bon lot, soit 32 perles pour un prix de 30 — on
  // rachetait le coffre avec son propre contenu, indéfiniment, en encaissant
  // les pièces au passage. C'est la borne HAUTE qu'on vérifie, pas la
  // moyenne : le trou ne s'ouvre que sur le meilleur tirage, et une moyenne
  // saine le cache complètement. Le calcul est celui de chestRoll, pas une
  // constante recopiée — changer le facteur « bon lot » fera bouger ce test
  // avec lui.
  await step('aucun coffre ne peut se payer avec ses propres perles',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      CHESTS.forEach(ch=>{
        const max=Math.round(chestPearlRange(ch.id)[1]*1.8),prix=chestPearlPrice(ch.id);
        if(max>=prix)out.push(ch.id+' : jusqu\'a '+max+' perles pour un prix de '+prix);
        // Une marge, et pas seulement l'inegalite stricte : a 99 % du prix, il
        // suffit d'un coffre gagne en jouant pour relancer la boucle.
        if(max>prix*0.6)out.push(ch.id+' : '+max+' perles, soit '+Math.round(100*max/prix)+'% du prix (>60%)');
      });
      return out;
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

  // UN BOT NE PEUT ALIGNER QUE CE QUE LE JOUEUR POSSÈDE. C'est une règle
  // qu'on ne voit pas casser : une armée d'adversaire est plausible même
  // truffée de créatures inconnues, et il faut lire la fiche de chaque pièce
  // en pleine partie pour s'apercevoir qu'on n'en possède aucune.
  // Le test se donne un compte MINIMAL (deux pièces maîtresses et trois
  // pièces d'appoint, rien d'autre) pour que toute pièce hors de cette liste
  // soit une infraction — sinon le filet de sécurité de generateAIArmy, qui
  // complète le vivier quand le joueur possède moins de trois pièces
  // d'appoint, masquerait la règle au lieu de la prouver.
  await step('un adversaire ne compose son armée qu\'avec des pièces que le joueur possède',async()=>{
    const bad=await page.evaluate(()=>{
      const avant={unlocked:new Set(VV_UNLOCKED),inv:JSON.parse(JSON.stringify(invAll()))};
      const permis=['roi','dame','cavalier-primordial','peureux','meduse'];
      const out=[];
      try{
        VV_UNLOCKED=new Set(permis);
        invSaveAll({});                        // rien en stock : seul le déblocage compte
        const ok=new Set(permis);
        AI_OPPONENTS.forEach(o=>{
          for(let i=0;i<15;i++){
            const a=generateAIArmy(Math.max(0,o.budget-4),{style:o.style,budget:o.budget});
            [a.mon.id,a.gen.id,...a.extras].forEach(id=>{
              if(!ok.has(id))out.push(o.id+' aligne '+id+', que le joueur ne possède pas');
            });
          }
        });
        // Et le filet de sécurité doit bien exister : un compte tout neuf (un
        // Monarque, un Général, aucune pièce d'appoint) doit malgré tout
        // produire une armée complète, sans quoi la partie ne démarrerait pas.
        VV_UNLOCKED=new Set(['roi','dame']);
        const neuf=generateAIArmy(0,{budget:24});
        if(!neuf||!neuf.mon||!neuf.gen||(neuf.extras||[]).length!==3)
          out.push('un compte neuf ne produit plus d\'armée adverse complète');
      }finally{
        VV_UNLOCKED=avant.unlocked;
        invSaveAll(avant.inv);
      }
      return [...new Set(out)];
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // Le mode test est une ADRESSE : s'il cessait d'être reconnu, il
  // s'ouvrirait sur le jeu normal sans que rien ne le dise. Et ce qu'il
  // promet — tout le catalogue, 10 000 ELO, des perles sans fond — se vérifie
  // ici, parce que c'est exactement ce qui ne se voit pas quand ça casse.
  await step('le mode test donne tout et ne classe rien',async()=>{
    // Le pseudo créé plus haut est toujours dans localStorage (un seul
    // compte, toujours connecté — voir js/accounts.js) : cette navigation s'y
    // reconnecte automatiquement, sans repasser par #page-login.
    await page.goto('http://localhost:'+PORT+'/?test',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    if(!await page.evaluate(()=>ADMIN_MODE))throw new Error('/?test n active pas le mode test');
    if(!/Mode test/.test(await page.evaluate(()=>vvNoEloReason({}))||''))throw new Error('les parties y sont encore classees');
    const bad=await page.evaluate(()=>{
      const out=[];
      if(!CUR_ACC){out.push('aucun compte de test');return out;}
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
