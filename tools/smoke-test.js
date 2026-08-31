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

// TOUT `assets/` EST FACULTATIF, sauf `boards/` : portraits d'adversaires,
// fonds d'écran, bannières de titre, mobilier, effets, médaillons de rang,
// planches de destruction des coffres. Le jeu dessine un repli quand un
// fichier manque — un coffre à couvercle pour les planches (voir
// chestBreakReady, js/chest-break.js), un sceau procédural pour un portrait,
// et pour tout le reste le décor en dégradés qui existait avant les images
// (voir la section [ART] de css/style.css et le catalogue
// assets/PROMPTS.md). Leur 404 est donc un comportement voulu et non une
// panne, au même titre que les polices Google ou le CDN Supabase quand le
// réseau est coupé.
// `boards/` n'est PAS dans la liste : ces cinq textures sont versées au
// dépôt et générées par tools/gen-boards.js — un 404 y serait une vraie
// panne.
// ERR_CERT_AUTHORITY_INVALID vient des environnements dont le réseau passe
// par un mandataire à certificat propre : c'est la machine de test qui
// refuse le certificat d'une ressource externe, pas le jeu qui échoue.
const IGNORED_CONSOLE=/ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_CERT_AUTHORITY_INVALID|fonts\.googleapis|fonts\.gstatic|jsdelivr|supabase/;
const OPTIONAL_ASSET=/\/assets\/(adversaires|backgrounds|banners|ui|fx|ranks|chests)\//;

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

  // PREMIÈRE VISITE : AUCUN ÉCRAN AVANT LE JEU. Il y a eu successivement une
  // page de connexion puis un voile de choix du pseudo ; les deux posaient un
  // formulaire entre le visiteur et le jeu. La première ouverture crée
  // maintenant elle-même un compte d'Alchimiste et entre dans le Lore
  // (accountsBoot, js/accounts.js). C'est la première chose que voit un
  // nouveau joueur : si elle casse, plus personne n'atteint le jeu.
  await step('la première visite entre directement dans le jeu',async()=>{
    await page.waitForSelector('#lore-intro',{state:'visible',timeout:8000});
    if(await page.locator('#page-login').count())throw new Error('la page de connexion existe encore');
    if(await page.locator('#pseudo-gate').count())throw new Error('le voile de pseudo existe encore');
    const acc=await page.evaluate(()=>CUR_ACC);
    if(!acc)throw new Error('aucun compte créé à la première ouverture');
    if(!/^(Alchimiste|Apprenti|Adepte|Souffleur|Artisan|Disciple) \d{4}$/.test(acc))
      throw new Error('pseudo d\'ouverture inattendu : '+acc);
    const list=await page.evaluate(()=>accountsList());
    if(list.length!==1||list[0]!==acc)throw new Error('la liste des comptes ne contient pas le compte créé');
  });

  // LE JEU DIT SON NOM SUR L'ÉCRAN QU'ON OUVRE À CHAQUE PARTIE. C'est la
  // panne qu'aucun test ne rattrape : rien n'est cassé, il n'y a simplement
  // plus rien qui dise où l'on est. L'emblème a tenu ce rôle — un sceau de
  // 52 px qu'il fallait déjà connaître pour le reconnaître —, le titre l'a
  // remplacé. On vérifie donc qu'il est là, en toutes lettres, tout en haut,
  // et que le sceau n'y est plus.
  await step('le menu principal porte le titre du jeu, en haut et en grand',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const t=document.querySelector('.menu-title');
      if(!t){out.push('aucun titre sur le menu principal');return out;}
      if(t.textContent.trim()!=='Epic Chess')out.push('titre inattendu : '+t.textContent);
      if(document.querySelector('.jouer-player .game-emblem'))
        out.push('le logo est encore sur le menu principal');
      const st=getComputedStyle(t);
      if(parseFloat(st.fontSize)<26)out.push('le titre ne fait que '+st.fontSize);
      if(!/Cinzel/.test(st.fontFamily))out.push('le titre n\'est pas dans la police de titre : '+st.fontFamily);
      // Tout en haut : au-dessus du pseudo, qui est lui-même au-dessus de
      // COMBAT.
      const pseudo=document.getElementById('jouer-name');
      const combat=document.getElementById('cube-jouer-btn');
      const tb=t.getBoundingClientRect();
      if(pseudo&&tb.bottom>pseudo.getBoundingClientRect().top+1)out.push('le titre n\'est pas au-dessus du pseudo');
      if(combat&&tb.bottom>=combat.getBoundingClientRect().top)out.push('le titre n\'est pas au-dessus de COMBAT');
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

  // À LA RÉOUVERTURE : rien ne clignote et le compte est repris. Aucune page
  // ne doit être marquée `active` dans le HTML servi — c'est ce qui faisait
  // apparaître l'ancienne page de connexion avant même que les scripts
  // tournent.
  await step('à la réouverture, le compte est repris sans écran intermédiaire',async()=>{
    const brut=await (await fetch('http://localhost:'+PORT+'/')).text();
    if(/class="page active"/.test(brut))
      throw new Error('une page est encore marquée active dans le HTML servi');
    const avant=await page.evaluate(()=>CUR_ACC);
    await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    if(await page.evaluate(()=>CUR_ACC)!==avant)throw new Error('le compte enregistré n\'est pas repris');
    if(await page.evaluate(()=>document.querySelectorAll('.page.active').length))
      throw new Error('une page secondaire couvre le menu à la réouverture');
  });

  // ----------------------------------------------------------------
  // LA PAGE COMPTES (js/account-ui.js)
  // ----------------------------------------------------------------
  // C'est le seul chemin vers son identité depuis que le jeu ne demande plus
  // de pseudo au démarrage : renommer, créer, basculer, supprimer.
  await step('la page Comptes s\'ouvre depuis les réglages',async()=>{
    await page.click('#settings-btn');
    await page.click('#sp-account');
    await page.waitForSelector('#page-account.active',{timeout:5000});
    const nom=await page.textContent('.acc-name');
    if(nom.trim()!==await page.evaluate(()=>CUR_ACC))
      throw new Error('le sceau n\'affiche pas le compte courant : '+nom);
    if(await page.locator('.acc-stat').count()!==4)throw new Error('les quatre chiffres du compte ne sont pas tous là');
  });

  await step('le profil montre la forme et la créature fétiche',async()=>{
    // L'ELO était un NOMBRE NU : le jeu enregistrait le résultat de chaque
    // partie et n'en montrait rien. On sème un passé plausible et on vérifie
    // que la page le raconte.
    await page.evaluate(()=>{
      const h=[];
      // L'historique est CHRONOLOGIQUE : la partie la plus ancienne en tête,
      // la plus récente en queue (c'est l'ordre dans lequel vvNoteHistory les
      // empile). La date suit, sinon la frise et les infobulles se
      // contrediraient.
      for(let i=0;i<12;i++)h.push({result:i%3===0?'loss':'win',oldElo:400+i*5,newElo:405+i*5,
        delta:5,date:Date.now()-(11-i)*86400000,ranked:true,army:['garde-eau','fourmi'],mode:'ia'});
      accSet('match_history',h);
      accSet('piece_stats',{'garde-eau':{g:12,w:8},fourmi:{g:3,w:3}});
      accSet('best_streak',7);
      accSet('ranked_games',12);accSet('ranked_wins',8);
      renderAccountPage();
    });
    const bad=await page.evaluate(()=>{
      const out=[];
      const dots=[...document.querySelectorAll('.acc-form-dots span')];
      if(dots.length!==10)out.push('la bande de forme ne montre pas dix parties');
      // LA FRISE VA DE GAUCHE (le plus ancien) À DROITE (le plus récent). Elle
      // se lisait à l'envers : une remontée y ressemblait à une chute. Les
      // douze parties semées plus haut suivent `i%3===0 → défaite` ; les dix
      // dernières sont donc les indices 2 à 11, dans CET ordre.
      if(dots.length===10){
        const attendu=[];
        for(let i=2;i<12;i++)attendu.push(i%3===0?'acc-dot-l':'acc-dot-w');
        const lu=dots.map(d=>d.className);
        if(lu.join(',')!==attendu.join(','))
          out.push('la frise n\'est pas dans l\'ordre du temps :\n  '+lu.join(',')+'\nau lieu de\n  '+attendu.join(','));
      }
      const fav=document.querySelector('.acc-fav-name');
      if(!fav)out.push('aucune créature fétiche');
      // La Fourmi a 3 parties, sous le minimum : c'est la Garde d'Eau, 12
      // parties, qui doit sortir — sinon on afficherait un « 100 % » sur trois
      // parties.
      else if(!/Garde d'Eau/i.test(fav.textContent))out.push('fétiche inattendue : '+fav.textContent);
      const stats=[...document.querySelectorAll('.acc-stat-k')].map(e=>e.textContent);
      if(!stats.some(t=>/Meilleure série/.test(t)))out.push('la meilleure série n\'est pas affichée');
      const vals=[...document.querySelectorAll('.acc-stat-v')].map(e=>e.textContent);
      if(!vals.some(t=>/67|66/.test(t)))out.push('le taux de victoire est faux : '+vals.join(' / '));
      if(!vals.includes('7'))out.push('la meilleure série n\'a pas la bonne valeur : '+vals.join(' / '));
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('une partie nourrit les statistiques de carrière',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const avant=JSON.parse(JSON.stringify(vvLoadPieceStats()));
      vvNotePieceStats(['garde-eau','garde-eau','fourmi'],true);
      const apres=vvLoadPieceStats();
      // Une créature alignée en double ne compte qu'UNE partie : on mesure
      // les parties jouées avec elle, pas les exemplaires posés.
      if(apres['garde-eau'].g!==avant['garde-eau'].g+1)
        out.push('une créature en double compte deux fois : '+avant['garde-eau'].g+' -> '+apres['garde-eau'].g);
      if(apres['garde-eau'].w!==avant['garde-eau'].w+1)out.push('la victoire n\'est pas comptée');
      vvNoteStreak(3);
      if(vvLoadBestStreak()!==7)out.push('une série plus courte a écrasé le record : '+vvLoadBestStreak());
      vvNoteStreak(11);
      if(vvLoadBestStreak()!==11)out.push('un nouveau record n\'est pas retenu');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('le compte se renomme',async()=>{
    await page.click('#acc-rename-open');
    await page.fill('#acc-rename-input','SmokeTest');
    await page.click('#acc-rename-ok');
    await page.waitForTimeout(200);
    if(await page.evaluate(()=>CUR_ACC)!=='SmokeTest')throw new Error('le renommage n\'a pas pris');
    // Le renommage recopie les clés mc_p_<pseudo>_* : la progression doit
    // suivre le nouveau nom, sinon le joueur perd tout en se renommant.
    const armees=await page.evaluate(()=>accGetFor('SmokeTest','armies',null));
    if(!armees||!armees.length)throw new Error('les données n\'ont pas suivi le renommage');
    if(!await page.evaluate(()=>accountsList().includes('SmokeTest')))
      throw new Error('la liste des comptes garde l\'ancien pseudo');
  });

  // SUPPRIMER SE CONFIRME, CHANGER DE COMPTE NON. On ne fait confirmer que ce
  // qui se perd — et la confirmation de suppression ne récite plus l'inventaire
  // du compte (« ses 13 parties classées, ses créatures et ses 903 perles ») :
  // trois chiffres à lire au moment où l'on veut juste savoir si on appuie.
  await step('la suppression d\'un compte se confirme sans réciter son inventaire',async()=>{
    const msg=await page.evaluate(()=>{
      accountAskDelete('SmokeTest');
      return document.getElementById('confirm-msg').textContent;
    });
    if(!/Supprimer définitivement/.test(msg))throw new Error('confirmation inattendue : '+msg);
    if(/perles|parties|créatures/i.test(msg))
      throw new Error('la confirmation récite encore l\'inventaire : '+msg);
    await page.click('#confirm-cancel');
    await page.waitForTimeout(200);
    if(!await page.evaluate(()=>accountsList().includes('SmokeTest')))
      throw new Error('le compte a disparu sur une simple annulation');
  });

  await step('un pseudo déjà pris est refusé',async()=>{
    // Les notifications s'empilent : lire « la première » renverrait celle de
    // l'étape précédente. On attend celle qui porte le message attendu, et
    // c'est son absence au bout de 3 s qui fait échouer l'étape.
    await page.fill('#acc-new-input','SmokeTest');
    await page.click('#acc-new-ok');
    await page.waitForFunction(
      ()=>[...document.querySelectorAll('.notif')].some(n=>/déjà ce pseudo/.test(n.textContent)),
      null,{timeout:3000});
    if(await page.locator('#confirm-modal.show').count())
      throw new Error('un pseudo refusé ouvre quand même la confirmation');
  });

  await step('un second compte se crée et devient le compte courant',async()=>{
    await page.fill('#acc-new-input','SmokeDeux');
    await page.click('#acc-new-ok');
    await page.click('#confirm-ok');
    // accountCreate recharge la page (voir l'en-tête de js/accounts.js). Il
    // FAUT attendre la fin du chargement avant d'interroger la page :
    // pendant la navigation, le contexte d'exécution est un document vierge
    // où aucun script du jeu n'existe encore.
    await page.waitForLoadState('load');
    await page.waitForFunction(()=>typeof CUR_ACC!=='undefined'&&CUR_ACC==='SmokeDeux',null,{timeout:10000});
    const list=await page.evaluate(()=>accountsList());
    if(!list.includes('SmokeTest')||!list.includes('SmokeDeux'))
      throw new Error('les deux comptes ne cohabitent pas : '+list.join(','));
    // Un compte neuf repart de zéro : c'est toute la promesse de la page.
    if(await page.evaluate(()=>vvLoadElo())!==0)throw new Error('le compte neuf ne part pas de 0 ELO');
    // Et il reçoit le Lore, comme un premier lancement.
    await page.waitForSelector('#lore-intro',{state:'visible',timeout:8000});
  });

  await step('on revient sur le premier compte',async()=>{
    for(let i=0;i<4;i++){await page.click('#lore-next');await page.waitForTimeout(520);}
    await page.waitForSelector('#tuto-root.show',{timeout:8000});
    await page.click('#tuto-skip');
    await page.click('#confirm-ok');
    await page.waitForSelector('#tuto-root.show',{state:'hidden',timeout:8000});
    // Le coffre quotidien s'ouvre de lui-même à la sortie du tutoriel : on le
    // laisse se terminer, sinon il couvre la page Comptes.
    if(await page.isVisible('#chest-modal.show')){
      await page.click('#chest-visual');
      for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
        await page.waitForTimeout(650);await page.click('#chest-visual');
      }
    }
    await page.click('#settings-btn');
    await page.click('#sp-account');
    await page.waitForSelector('#page-account.active',{timeout:5000});
    // Changer de compte ne se confirme plus : rien n'est perdu, et la ligne
    // qu'on touche porte déjà le nom, le rang et l'ELO du compte visé.
    await page.click('[data-switch="SmokeTest"]');
    await page.waitForLoadState('load');
    await page.waitForFunction(()=>typeof CUR_ACC!=='undefined'&&CUR_ACC==='SmokeTest',null,{timeout:10000});
    // La bascule doit rendre au compte SA progression, pas celle de l'autre.
    if(await page.evaluate(()=>savedArmies.length)<1)
      throw new Error('le compte repris a perdu son armée');
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
    // LE PLATEAU EST PERSISTANT : la pièce ne rejoue plus une animation
    // ponctuelle, elle GLISSE parce que son transform a changé et que la
    // transition CSS s'en charge (voir js/game-render.js). Ce qu'on vérifie
    // ici, c'est donc l'architecture qui rend le glissement possible :
    // une couche de pièces, un nœud par pièce, positionné en transform.
    const anim=await page.evaluate(()=>{
      const out=[];
      const layer=document.querySelector('#game-board .gc-layer');
      if(!layer)return['aucune couche de pièces'];
      const nodes=[...layer.querySelectorAll('.gc-piece')];
      if(nodes.length<20)out.push('trop peu de pièces sur la couche : '+nodes.length);
      if(nodes.some(n=>!/translate3d/.test(n.style.transform)))
        out.push('une pièce n\'est pas positionnée en transform');
      if(nodes.some(n=>!n.dataset.pid))out.push('une pièce sans identité');
      // Chaque identité est unique : deux pièces qui partagent un id se
      // recycleraient l'une l'autre et le diff deviendrait faux.
      const ids=new Set(nodes.map(n=>n.dataset.pid));
      if(ids.size!==nodes.length)out.push('des identités de pièce en double');
      // Les cases ne portent plus de pièce : le hit-testing doit rester sur
      // une grille immobile.
      if(document.querySelectorAll('#game-board .gc .gc-piece').length)
        out.push('une pièce est encore posée dans une case');
      if(getComputedStyle(layer).pointerEvents!=='none')
        out.push('la couche des pièces intercepte les clics');
      return out;
    });
    if(anim.length)throw new Error(anim.join(' · '));
  });

  await step('le plateau n\'est pas reconstruit à chaque coup',async()=>{
    // C'est TOUTE la raison d'être du chantier : si les cases sont recréées,
    // aucune transition ne peut survivre et le tactile repart en vrille (un
    // événement tactile reste attaché à l'élément d'origine, détruit en
    // cours de geste). On marque une case, on joue, on vérifie qu'elle est
    // toujours là.
    const survecu=await page.evaluate(async()=>{
      const cell=document.querySelector('#game-board .gc');
      if(!cell)return 'aucune case';
      cell.dataset.temoin='1';
      const piece=document.querySelector('#game-board .gc-piece');
      if(piece)piece.dataset.temoin='1';
      const col=GS.playerColor;
      if(GS.turn!==col)await new Promise(r=>{
        const t=setInterval(()=>{if(GS.turn===col||GS.gameOver){clearInterval(t);r();}},200);
        setTimeout(()=>{clearInterval(t);r();},25000);
      });
      for(let r=0;r<8;r++)for(let c=0;c<8;c++){
        const p=GS.board[r][c];
        if(!p||p.color!==col)continue;
        const mv=getLegalMoves(GS.board,r,c,GS);
        if(!mv.length)continue;
        GS.lastMove={from:{r,c},to:mv[0],capture:!!GS.board[mv[0].r][mv[0].c]};
        executeGameMove({r,c},mv[0],GS);
        const out=[];
        if(!document.querySelector('#game-board .gc[data-temoin]'))out.push('les cases ont été recréées');
        if(piece&&piece.parentNode&&!document.querySelector('#game-board .gc-piece[data-temoin]'))
          out.push('les pièces ont été recréées');
        if(document.querySelectorAll('#game-board .gc').length!==64)out.push('le plateau n\'a plus 64 cases');
        return out.join(' · ');
      }
      return 'aucun coup légal';
    });
    if(survecu)throw new Error(survecu);
  });

  // ----------------------------------------------------------------
  // LE PLATEAU AU CLAVIER (js/game-render.js)
  // ----------------------------------------------------------------
  // Un jeu au tour par tour est l'un des rares genres réellement jouables
  // sans souris ; celui-ci ne l'était pas du tout. On vérifie les trois
  // choses qui le rendent praticable : une seule case tabulable, les flèches
  // qui déplacent le curseur, et un plateau annoncé.
  await step('le plateau se parcourt et se joue au clavier',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const cases=[...document.querySelectorAll('#game-board .gc')];
      if(cases.length!==64){out.push('pas 64 cases');return out;}
      const tabulables=cases.filter(c=>c.tabIndex===0);
      if(tabulables.length!==1)
        out.push(tabulables.length+' cases tabulables : il en faut exactement une');
      if(document.getElementById('game-board').getAttribute('role')!=='grid')
        out.push('le plateau n est pas annonce comme une grille');
      if(cases.some(c=>c.getAttribute('role')!=='gridcell'))out.push('une case sans role');
      const occupee=cases.find(c=>GS.board[+c.dataset.r][+c.dataset.c]);
      const lab=occupee&&occupee.getAttribute('aria-label');
      // FILES est en capitales dans ce jeu (voir les repères du plateau) :
      // le libellé parlé suit la même convention que ce qui est écrit.
      if(!lab||!/^[A-Ha-h][1-8], .+/.test(lab))out.push('libelle de case inattendu : '+lab);
      const vide=cases.find(c=>!GS.board[+c.dataset.r][+c.dataset.c]);
      if(vide&&!/case vide/.test(vide.getAttribute('aria-label')||''))
        out.push('une case vide ne le dit pas');
      const bar=document.getElementById('game-status');
      if(bar.getAttribute('aria-live')!=='polite')out.push('la barre de statut n est pas annoncee');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));

    const dep=await page.evaluate(()=>{
      const c=[...document.querySelectorAll('#game-board .gc')].find(x=>x.tabIndex===0);
      c.focus();
      return c.dataset.vi+'/'+c.dataset.vc;
    });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    const arr=await page.evaluate(()=>{
      const c=document.activeElement;
      if(!c||!c.classList.contains('gc'))return 'hors-plateau';
      return c.dataset.vi+'/'+c.dataset.vc;
    });
    if(arr==='hors-plateau')throw new Error('le curseur a quitte le plateau');
    if(arr===dep)throw new Error('les fleches ne deplacent pas le curseur ('+dep+')');
    const seuls=await page.evaluate(()=>
      [...document.querySelectorAll('#game-board .gc')].filter(c=>c.tabIndex===0).length);
    if(seuls!==1)throw new Error(seuls+' cases tabulables apres deplacement');
  });

  // ----------------------------------------------------------------
  // LES EMOTES ET L'ARMÉE ADVERSE (js/multiplayer.js)
  // ----------------------------------------------------------------
  await step('les emotes ont un pictogramme lisible et une bulle',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      if(!Array.isArray(MP_EMOTES)||MP_EMOTES.length<4){out.push('table d emotes absente');return out;}
      MP_EMOTES.forEach(e=>{
        if(!e.id||!e.label)out.push('emote sans identite');
        // Un \uXXXX ne prend que quatre chiffres : un emoji hors du plan de
        // base ecrit ainsi produit deux caracteres parasites au lieu du
        // pictogramme. C'est exactement le piege qu'on verifie ici.
        if([...e.glyph].length!==1)out.push('pictogramme mal echappe pour '+e.id+' : '+e.glyph);
      });
      mpShowEmote(MP_EMOTES[0].id,true);
      if(!document.querySelector('#human-player-bar .mp-emote-bubble.show'))
        out.push('la bulle du joueur ne s affiche pas');
      mpShowEmote(MP_EMOTES[1].id,false);
      if(!document.querySelector('#ai-player-bar .mp-emote-bubble.show'))
        out.push('la bulle de l adversaire ne s affiche pas');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('la sourdine et le debit maximal tiennent',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const bulle=()=>document.querySelector('#ai-player-bar .mp-emote-bubble');
      mpEmoteSetMuted(true);
      bulle().classList.remove('show');
      mpReceiveEmote(MP_EMOTES[0].id);
      if(bulle().classList.contains('show'))out.push('une emote passe malgre la sourdine');
      mpEmoteSetMuted(false);
      if(mpEmoteMuted())out.push('la sourdine ne se releve pas');
      // Deux emotes coup sur coup : la seconde est ignoree. C'est la
      // protection contre un client modifie, qui n a que faire de SA limite.
      bulle().classList.remove('show');
      mpReceiveEmote(MP_EMOTES[0].id);
      if(!bulle().classList.contains('show'))out.push('la premiere emote n est pas passee');
      bulle().classList.remove('show');
      mpReceiveEmote(MP_EMOTES[1].id);
      if(bulle().classList.contains('show'))
        out.push('deux emotes d affilee passent : rien ne limite le debit');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
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

  // LA FENÊTRE DE LA RÉCOMPENSE JOURNALIÈRE remplace celle de la « série du
  // jour », qui elle-même remplaçait le rail de six coffres du bas du menu.
  // C'est elle qu'on ouvre en arrivant, un cycle mal indexé s'y verrait tout
  // de suite.
  await step('la fenêtre journalière montre le cycle des trente lots',async()=>{
    await page.evaluate(()=>{
      accSet('dr_idx',2);accSet('dr_day',null);accSet('pearls',300);
      showPage('face-jouer');renderMenuChests();
    });
    // La COLONNE du menu (`.jouer-col` : titre, identité, COMBAT, Adversaires)
    // ne porte ni rail de coffres ni solde de perles — tout est passé dans les
    // fenêtres.
    // Les assertions visent la colonne et non `.jouer-menu` entier : sur un
    // écran d'ordinateur, `.jouer-menu` contient AUSSI la colonne de droite
    // (#menu-side), qui déplie délibérément le cycle et le prochain palier —
    // et qui peut donc contenir le mot « perles » quand c'est un lot de perles
    // qui vient. C'est l'exception voulue, pas le retour du désordre : ce qui
    // est proscrit, c'est d'encombrer la colonne sous le pouce.
    const menu=await page.evaluate(()=>{
      const col=document.querySelector('.jouer-col');
      return{
        rail:!!document.getElementById('jouer-chests'),
        perles:/perles/i.test(col.textContent),
        titre:(document.querySelector('.menu-title')||{}).textContent||'',
        emblem:!!document.querySelector('.jouer-player .game-emblem'),
        boutons:['jouer-daily','jouer-colonne','jouer-rangee'].filter(id=>!document.getElementById(id)),
      };
    });
    if(menu.rail)throw new Error('le rail de coffres est encore sur le menu principal');
    if(menu.perles)throw new Error('le solde de perles est encore dans la colonne du menu');
    if(menu.titre.trim()!=='Epic Chess')throw new Error('le titre du menu n\'est pas « Epic Chess » : '+menu.titre);
    if(menu.emblem)throw new Error('le logo est encore sur le menu principal');
    if(menu.boutons.length)throw new Error('boutons absents du menu : '+menu.boutons.join(', '));

    // La fenêtre s'ouvre par son point d'entrée public et non par un clic sur
    // le bouton : ce test-ci porte sur le CONTENU de la fenêtre, pas sur le
    // bouton qui l'ouvre (vérifié juste au-dessus).
    await page.evaluate(()=>openDailyModal());
    await page.waitForSelector('#daily-modal.show',{timeout:8000});
    await page.waitForTimeout(400);
    const r=await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('#daily-scroll .streak-row')];
      const host=document.getElementById('daily-scroll');
      const next=document.querySelector('#daily-scroll .streak-row.chest-next');
      const hb=host.getBoundingClientRect(),nb=next?next.getBoundingClientRect():null;
      return{
        n:rows.length,
        etats:rows.slice(0,5).map(x=>x.className.match(/chest-(won|next|far)/)[1]),
        noms:rows.slice(0,3).map(x=>x.querySelector('.streak-row-name').textContent),
        claim:!!document.getElementById('daily-claim'),
        // Le lot du jour est amené dans la fenêtre visible.
        nextVisible:!!nb&&nb.top>=hb.top-2&&nb.bottom<=hb.bottom+2,
      };
    });
    if(r.n!==30)throw new Error(r.n+' lots au lieu de 30');
    // dr_idx=2 : les deux premiers jours sont pris, le troisième est celui du jour.
    if(r.etats.join(',')!=='won,won,next,far,far')throw new Error('états : '+r.etats.join(','));
    if(r.noms.join(' | ')!=='Coffre Pion | 10 perles | Coffre Cavalier')
      throw new Error('début du cycle inattendu : '+r.noms.join(' | '));
    if(!r.claim)throw new Error('le bouton « Récupérer » manque alors que le lot du jour est dû');
    if(!r.nextVisible)throw new Error('la fenêtre ne s\'ouvre pas sur le lot du jour');
    await page.click('#daily-close');
    await page.waitForSelector('#daily-modal.show',{state:'hidden',timeout:8000});
  });

  // Le cycle est SANS FIN : le trente-et-unième jour revient au premier lot,
  // sans remettre quoi que ce soit à zéro. C'est la promesse de la journalière.
  await step('le cycle journalier repart au premier lot après le trentième',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const t=dailyRewardTotal();
      if(t!==30)out.push('le cycle fait '+t+' lots au lieu de 30');
      accSet('dr_idx',t);accSet('dr_day',null);
      if(dailyRewardCursor()!==0)out.push('le cycle ne revient pas à son premier lot : '+dailyRewardCursor());
      if(dailyRewardCycle()!==2)out.push('le numéro de cycle ne s\'incrémente pas : '+dailyRewardCycle());
      if(!dailyRewardAvailable())out.push('le lot du jour n\'est pas disponible');
      const pris=dailyRewardClaim();
      if(!pris||pris.chest!=='pion')out.push('le premier lot du cycle n\'est pas un Coffre Pion');
      if(dailyRewardAvailable())out.push('un deuxième lot est encaissable le même jour');
      if(dailyRewardIdx()!==t+1)out.push('le compteur du cycle n\'a pas avancé');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // LA BARRE DU BAS EST UNE VRAIE BARRE D'ONGLETS. Elle a été une pastille
  // flottante de quatre blasons, centrée à 22 px du bord : quatre cibles de
  // 40 px au milieu d'un ruban, et sous elles une bande que rien n'occupait —
  // sur une application installée, c'est la zone du geste d'accueil. Elle
  // prend maintenant toute la largeur, elle porte le NOM de chaque face, et
  // son fond descend jusqu'au bord de l'écran.
  await step('la barre des faces prend toute la largeur, jusqu\'au bord bas',async()=>{
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{if(typeof goToMainMenu==='function')goToMainMenu();});
    await page.waitForTimeout(700);
    const r=await page.evaluate(()=>{
      const bar=document.getElementById('cube-facebar');
      if(!bar||getComputedStyle(bar).display==='none')return null;
      const b=bar.getBoundingClientRect();
      const btns=[...bar.querySelectorAll('.cube-facebar-btn')];
      const larg=btns.map(x=>Math.round(x.getBoundingClientRect().width));
      return{
        // La largeur de référence est celle de la FENÊTRE (innerWidth) et non
        // celle du bloc conteneur du fixed : la barre doit aller d'un bord de
        // l'écran à l'autre, gouttière de défilement comprise.
        gauche:b.left,droite:innerWidth-b.right,bas:innerHeight-b.bottom,
        hauteur:b.height,
        n:btns.length,
        // Quatre parts égales : quatre destinations de même rang.
        egales:larg.length===4&&Math.max(...larg)-Math.min(...larg)<=1,
        // Chaque onglet porte son nom, pas seulement son blason.
        libelles:btns.map(x=>{
          const l=x.querySelector('.cfb-label');
          return l&&getComputedStyle(l).display!=='none'?l.textContent.trim():'';
        }),
        actif:bar.querySelectorAll('.cube-facebar-btn.is-active').length,
        // Et le pouce trouve chaque onglet sans viser.
        haut:Math.min(...btns.map(x=>Math.round(x.getBoundingClientRect().height))),
      };
    });
    if(!r)throw new Error('la barre des faces est absente du menu principal');
    if(r.gauche>0.5||r.droite>0.5)
      throw new Error('la barre ne prend pas toute la largeur (marges '+r.gauche+' / '+r.droite+')');
    if(r.bas>0.5)throw new Error('la barre ne touche pas le bas de l\'écran ('+r.bas+' px en dessous)');
    if(r.n!==4)throw new Error(r.n+' onglets au lieu de 4');
    if(!r.egales)throw new Error('les quatre onglets n\'ont pas la même largeur');
    if(r.libelles.some(t=>!t))throw new Error('un onglet n\'affiche pas son nom : '+JSON.stringify(r.libelles));
    if(r.actif!==1)throw new Error(r.actif+' onglets marqués actifs au lieu d\'un seul');
    if(r.haut<44)throw new Error('un onglet ne fait que '+r.haut+' px de haut');
  });

  // ET LES DEUX FLÈCHES DE ROTATION S'EN VONT SUR TÉLÉPHONE. Elles étaient le
  // secours du glissement de doigt — qui reste — au-dessus d'une barre qui
  // nomme les quatre faces et y mène directement.
  await step('les flèches de rotation ont quitté le téléphone',async()=>{
    const vues=await page.evaluate(()=>
      ['cube-arrow-left','cube-arrow-right'].filter(id=>{
        const el=document.getElementById(id);
        return el&&getComputedStyle(el).display!=='none';
      }));
    if(vues.length)throw new Error('flèches encore visibles sur téléphone : '+vues.join(', '));
    await page.setViewportSize({width:1400,height:900});
    await page.waitForTimeout(400);
  });

  // LE MODE BUREAU. Le jeu est pensé téléphone d'abord, et toutes ses règles
  // adaptatives étaient des `max-width` : sur un écran d'ordinateur, il ne
  // s'adaptait donc pas du tout — colonne de téléphone au milieu du vide, et
  // une barre des faces flottante qui RECOUVRAIT le contenu (sur « Mes
  // armées », elle masquait deux noms de cartes en plein milieu de l'écran).
  // Ce test tient les trois promesses du mode bureau : le drapeau s'allume,
  // le rail ne recouvre plus rien, et la colonne de droite déplie le cycle
  // journalier.
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
        // La colonne de droite déplie le cycle journalier en entier.
        sideRows:document.querySelectorAll('#ms-daily .streak-row').length,
        sideVisible:!!document.getElementById('menu-side')&&
          getComputedStyle(document.getElementById('menu-side')).display!=='none',
      };
    });
    if(!r.desk)throw new Error('body.desk ne s\'allume pas sur un écran d\'ordinateur');
    if(!r.railOn)throw new Error('body.rail-on manque alors que la barre des faces est affichée');
    if(!r.railGauche||!r.railHaut)throw new Error('la barre des faces n\'est pas devenue un rail latéral');
    if(!r.gouttiere)throw new Error('la zone utile ne recule pas derrière le rail : il recouvre le contenu');
    if(r.libelles!==4)throw new Error(r.libelles+' libellés visibles sur le rail au lieu de 4');
    if(!r.sideVisible)throw new Error('la colonne de droite du menu est absente');
    if(r.sideRows!==30)throw new Error(r.sideRows+' lots dans la colonne de droite au lieu de 30');
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

  // LA SÉRIE DE VICTOIRES N'EST PLUS QU'UNE STATISTIQUE. Elle commandait les
  // coffres (« série du jour »), avec verrou quotidien à la défaite et remise
  // à zéro à minuit ; il ne reste qu'un compteur de victoires d'affilée, celui
  // que la fiche de compte affiche sous « Meilleure série ». Une victoire ne
  // donne plus AUCUN coffre au règlement : elle fait avancer la colonne.
  await step('la série compte les victoires d\'affilée, sans coffre ni verrou',async()=>{
    const r=await page.evaluate(()=>{
      accSet('win_streak',3);
      const perdu=economySettle('loss',{board:[],promoGains:{}});
      const gagne=economySettle('win',{board:[],promoGains:{}});
      const encore=economySettle('win',{board:[],promoGains:{}});
      return{apresDefaite:perdu.streak,apres1:gagne.streak,apres2:encore.streak,
             coffre:gagne.chest||null};
    });
    if(r.apresDefaite!==0)throw new Error('série non remise à zéro par la défaite : '+r.apresDefaite);
    if(r.apres1!==1||r.apres2!==2)throw new Error('la série ne compte pas les victoires : '+r.apres1+', '+r.apres2);
    if(r.coffre)throw new Error('une victoire donne encore un coffre au règlement');
    await page.evaluate(()=>{accSet('win_streak',0);});
  });

  // LES DEUX BOUTONS DU MENU OUVRENT CHACUN SA VOIE, ET « OK » EN SORT. Le
  // reste des étapes pilote les deux voies par leurs fonctions ; celle-ci
  // vérifie le chemin que le joueur emprunte réellement — un bouton par voie,
  // qui ouvre directement dessus, et une sortie.
  await step('les deux boutons du menu ouvrent chacun sa voie, et « OK » en sort',async()=>{
    await page.evaluate(()=>{showPage('face-jouer');});
    await page.waitForTimeout(400);
    await page.click('#jouer-colonne');
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
      throw new Error('« Colonne des victoires » n\'ouvre pas sur la colonne');
    // PLUS D'ONGLETS EN TÊTE : le titre dit la voie, et le menu principal est
    // le seul chemin de l'une à l'autre.
    const tete=await page.evaluate(()=>({
      onglets:document.querySelectorAll('#page-rewards .rw-tab').length,
      titre:(document.getElementById('rw-title')||{}).textContent||'',
    }));
    if(tete.onglets)throw new Error(tete.onglets+' onglets subsistent en tête de la page');
    if(tete.titre.trim()!=='Colonne des Victoires')throw new Error('titre de la page : « '+tete.titre+' »');
    // Aucune ligne de la colonne ne redit le numéro du palier sous le nom du
    // coffre : la pastille de gauche le porte déjà.
    const sousTitres=await page.evaluate(()=>
      [...document.querySelectorAll('#rw-col-strip .rw-step-sub')].map(e=>e.textContent));
    if(sousTitres.some(t=>/Victoire\s*n/i.test(t)))
      throw new Error('« Victoire n° … » est encore sous le nom des coffres');
    await page.click('#rw-ok');
    await page.waitForTimeout(400);
    await page.click('#jouer-rangee');
    await page.waitForSelector('#page-rewards.active',{timeout:8000});
    await page.waitForTimeout(200);
    const apres=await page.evaluate(()=>({
      colonneVisible:getComputedStyle(document.getElementById('rw-pane-colonne')).display!=='none',
      rangeeVisible:getComputedStyle(document.getElementById('rw-pane-rangee')).display!=='none',
      quetes:document.querySelectorAll('#rw-pane-rangee .rw-quest').length,
      // UNE SEULE récompense à l'écran : la rangée ne défile plus de côté,
      // elle se parcourt palier par palier (flèches et balayage).
      cartes:document.querySelectorAll('#rw-row-stage .rw-row-card').length,
      titre:(document.getElementById('rw-title')||{}).textContent||'',
    }));
    if(apres.colonneVisible||!apres.rangeeVisible)throw new Error('« Rangée de la richesse » n\'ouvre pas sur la rangée');
    if(apres.cartes!==1)throw new Error(apres.cartes+' cartes affichées dans la rangée au lieu d\'une seule');
    if(apres.titre.trim()!=='Rangée de la Richesse')throw new Error('titre de la page : « '+apres.titre+' »');
    if(apres.quetes!==3)throw new Error(apres.quetes+' quêtes affichées au lieu de 3');
    await page.click('#rw-ok');
    await page.waitForTimeout(500);
    if(await page.isVisible('#page-rewards.active'))throw new Error('« OK » ne referme pas la page');
  });

  // UNE SEULE IMAGE PAR COFFRE, ET C'EST LA STATUETTE DU MAGASIN. Il y en
  // avait deux : le coffre à couvercle dessiné en CSS dans la récompense
  // journalière, la colonne et le mode test, et la statuette au Magasin — deux
  // objets pour le même Coffre Pion, plus un troisième en l'ouvrant. Les
  // quatre coffres équipés de planches (Pion, Cavalier, Fou, Tour) montrent
  // partout leur statuette ; la Dame et le Roi gardent le couvercle, faute de
  // planches. Le cycle journalier ne contient que les quatre premiers ; la
  // Dame et le Roi se lisent dans la colonne des victoires, où ils sont les
  // paliers 22 et 30.
  await step('les coffres montrent partout la statuette du Magasin',async()=>{
    const r=await page.evaluate(()=>{
      openDailyModal();
      const lire=sel=>{
        const el=document.querySelector(sel);
        if(!el)return 'absent';
        if(el.querySelector('.chest-pawn img'))return 'statuette';
        if(el.querySelector('.chest-lid'))return 'couvercle';
        return 'rien';
      };
      const serie={};
      ['pion','cavalier','fou','tour'].forEach(id=>{
        serie[id]=lire('#daily-scroll .streak-row[data-chest="'+id+'"]');
      });
      closeDailyModal();
      accSet('col_wins',3);accSet('col_claimed',0);
      openRewardsPage('colonne');
      serie.dame=lire('#rw-col-strip .rw-step[data-idx="21"]');         // Coffre Dame
      serie.roi=lire('#rw-col-strip .rw-step[data-idx="29"]');          // Coffre Roi
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
        throw new Error('récompense journalière : le Coffre '+id+' montre « '+r.serie[id]+' » au lieu de sa statuette');
    });
    ['dame','roi'].forEach(id=>{
      if(r.serie[id]!=='couvercle')
        throw new Error('colonne : le Coffre '+id+' n\'a pas de planches, il devrait garder le couvercle ('+r.serie[id]+')');
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

  // ON TOUCHE CE QU'ON PREND. La colonne et la rangée ont porté un bandeau
  // « Récupérer » au-dessus d'elles : une rangée entière d'écran pour une
  // action dont la cible — le palier qui pulse, à deux doigts de là — était
  // déjà sous les yeux. Le bandeau est parti, le palier est cliquable, et il
  // le dit.
  await step('un palier se prend en le touchant, sans bandeau au-dessus',async()=>{
    const r=await page.evaluate(()=>{
      accSet('col_wins',5);accSet('col_claimed',4);accSet('tickets',0);accSet('rich_claimed',1);
      openRewardsPage('colonne');
      const colonne=document.getElementById('rw-pane-colonne');
      const du=colonne.querySelector('.rw-step.rw-claimable');
      const out={
        bandeau:!!document.querySelector('#page-rewards .rw-banner'),
        bouton:!!document.querySelector('#page-rewards .rw-claim'),
        jauge:!!colonne.querySelector('.ms-gauge'),
        du:!!du,
        curseurDu:du?getComputedStyle(du).cursor:'',
        // La colonne s'encaisse DANS L'ORDRE : un seul palier est touchable à
        // la fois, sinon toucher le troisième dû donnerait le premier.
        touchables:colonne.querySelectorAll('.rw-step.rw-claimable').length,
        dus:colonne.querySelectorAll('.rw-step.rw-due').length,
        avant:colClaimed(),
      };
      // Le clic sur le palier dû l'encaisse : ici c'est un coffre, donc la
      // cérémonie s'ouvre — on la referme aussitôt, le test porte sur le geste.
      if(du)du.click();
      out.apres=colClaimed();
      return out;
    });
    if(r.bandeau)throw new Error('le bandeau « Récupérer » est encore au-dessus de la voie');
    if(r.bouton)throw new Error('le bouton « Récupérer » est encore là');
    if(r.jauge)throw new Error('la jauge de progression est encore au-dessus de la colonne');
    if(!r.du)throw new Error('aucun palier à prendre alors qu\'un est dû');
    if(r.curseurDu!=='pointer')throw new Error('le palier à prendre ne se donne pas comme cliquable ('+r.curseurDu+')');
    if(r.touchables!==1)throw new Error(r.touchables+' paliers touchables à la fois au lieu d\'un seul');
    if(r.apres!==r.avant+1)throw new Error('toucher le palier ne l\'encaisse pas ('+r.avant+' → '+r.apres+')');
    // La cérémonie de coffre s'est ouverte par-dessus : on la déroule.
    for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
      await page.click('#chest-modal',{position:{x:8,y:8}});
      await page.waitForTimeout(350);
    }
    if(await page.isVisible('#page-drill.active'))
      await page.evaluate(()=>{if(typeof drillAbort==='function')drillAbort();showPage('page-rewards');});
    // La note sous « Quêtes du jour » n'est pas revenue non plus.
    const note=await page.evaluate(()=>{
      openRewardsPage('rangee');
      return /repartent demain/.test(document.getElementById('rw-pane-rangee').textContent);
    });
    if(note)throw new Error('la note « elles repartent demain » est encore sous les quêtes');
  });

  // LA RANGÉE NE MONTRE QU'UNE RÉCOMPENSE À LA FOIS, et on la parcourt par
  // les flèches ou au doigt. Elle a été une bande de vingt-cinq cases larges
  // d'un quart d'écran : quatre minuscules à la fois, dont aucune ne se
  // lisait, et vingt-et-une hors champ.
  await step('la rangée se parcourt palier par palier',async()=>{
    const r=await page.evaluate(()=>{
      accSet('rich_claimed',3);accSet('tickets',0);
      openRewardsPage('rangee');
      // Le panneau est REDESSINÉ à chaque pas : toute référence gardée d'un
      // clic à l'autre pointerait un nœud détaché. On réinterroge le document.
      const idx=()=>parseInt(document.querySelector('#rw-row-stage .rw-row-card').dataset.idx,10);
      const fleche=d=>[...document.querySelectorAll('#rw-row-stage .rw-row-arrow')]
        .find(b=>b.dataset.go===String(d));
      const out={cartes:document.querySelectorAll('#rw-row-stage .rw-row-card').length,ouverture:idx()};
      fleche(1).click();out.apresSuivant=idx();
      fleche(-1).click();out.apresPrecedent=idx();
      // Au premier palier, la flèche « précédent » se désarme au lieu de
      // boucler : une rangée a un début.
      for(let i=0;i<40;i++)fleche(-1).click();
      out.debut=idx();out.precedentDesarme=!!fleche(-1).disabled;
      // Et au dernier, la flèche « suivant ».
      for(let i=0;i<80;i++)fleche(1).click();
      out.fin=idx();out.suivantDesarme=!!fleche(1).disabled;
      out.total=WEALTH_ROW.length;
      out.quetesEnBas=(()=>{
        const q=document.querySelector('#rw-pane-rangee .rw-quests');
        const s=document.getElementById('rw-row-stage');
        return !!q&&!!s&&q.getBoundingClientRect().top>=s.getBoundingClientRect().bottom-1;
      })();
      return out;
    });
    if(r.cartes!==1)throw new Error(r.cartes+' cartes à l\'écran au lieu d\'une seule');
    if(r.ouverture!==3)throw new Error('la rangée n\'ouvre pas sur le palier en jeu (palier '+(r.ouverture+1)+')');
    if(r.apresSuivant!==4)throw new Error('la flèche « suivant » ne va pas au palier suivant');
    if(r.apresPrecedent!==3)throw new Error('la flèche « précédent » ne revient pas en arrière');
    if(r.debut!==0)throw new Error('on n\'atteint pas le premier palier');
    if(!r.precedentDesarme)throw new Error('la flèche « précédent » reste active sur le premier palier');
    if(r.fin!==r.total-1)throw new Error('on n\'atteint pas le dernier palier');
    if(!r.suivantDesarme)throw new Error('la flèche « suivant » reste active sur le dernier palier');
    if(!r.quetesEnBas)throw new Error('les quêtes du jour ne sont pas sous la rangée');
  });

  // L'ORDRE DES TRENTE LOTS JOURNALIERS est une spécification à part entière :
  // il se vérifie en entier, sinon une inversion passerait inaperçue.
  await step('les trente lots du cycle journalier sont dans l\'ordre annoncé',async()=>{
    const lus=await page.evaluate(()=>DAILY_REWARDS.map(s=>s.chest||(s.pearls?'p'+s.pearls:'j'+s.jokers)));
    const attendu=['pion','p10','cavalier','pion','j5','fou','pion','p10','cavalier','pion',
                   'j5','fou','pion','p10','tour','pion','j5','cavalier','pion','p10',
                   'fou','pion','j5','cavalier','pion','p10','fou','pion','j5','tour'];
    if(lus.length!==30)throw new Error(lus.length+' lots au lieu de 30');
    if(lus.join(',')!==attendu.join(','))
      throw new Error('ordre du cycle journalier :\n  '+lus.join(',')+'\nau lieu de\n  '+attendu.join(','));
  });

  // LA COLONNE DES VICTOIRES est la voie des victoires : elle avance d'un cran
  // à CHAQUE victoire, sans verrou quotidien, et ne se remet jamais à zéro.
  await step('la colonne des victoires avance à chaque victoire',async()=>{
    const r=await page.evaluate(()=>{
      accSet('col_wins',0);accSet('col_claimed',0);accSet('win_streak',0);
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
  // VRAIE cérémonie — la même qu'un coffre journalier ou acheté au Magasin.
  await step('un palier de coffre s\'encaisse et ouvre sa cérémonie',async()=>{
    await page.evaluate(()=>{
      accSet('col_wins',2);accSet('col_claimed',0);accSet('jokers',0);
      // Chaque voie a SA pastille : celle de la colonne ne compte que ses
      // paliers dus. On neutralise quand même la rangée et les jokers, dont
      // la pastille voisine se lit dans le même coup d'œil.
      accSet('tickets',0);accSet('rich_claimed',0);
      openRewardsPage('colonne');
    });
    await page.waitForSelector('#page-rewards.active',{timeout:8000});
    const avant=await page.evaluate(()=>({
      dus:colPending(),
      badge:document.getElementById('jouer-colonne-badge').textContent,
      lignes:document.querySelectorAll('#rw-col-strip .rw-step').length,
      aPrendre:document.querySelectorAll('#rw-col-strip .rw-due').length,
    }));
    if(avant.lignes!==30)throw new Error(avant.lignes+' lignes dans la colonne au lieu de 30');
    if(avant.aPrendre!==2)throw new Error(avant.aPrendre+' paliers « à prendre » au lieu de 2');
    if(avant.badge!=='2')throw new Error('pastille de la colonne : '+avant.badge+' au lieu de 2 (les deux paliers dus)');
    // On touche le premier palier dû : c'est le geste, il n'y a plus de bouton.
    await page.click('#rw-col-strip .rw-step.rw-claimable');
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
      Array(5).fill('2/3'),Array(5).fill('3/4'),Array(5).fill('4/5'),
      Array(5).fill('5/6'),Array(5).fill('6/8'));
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
    if(r.perles!==102)throw new Error('perles après encaissement : '+r.perles+' au lieu de 102');
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
  // Et c'est une PASTILLE CENTRÉE, plus une barre pleine largeur : cette
  // barre-là, haute de 60 px et large de tout l'écran, était plus imposante
  // que le gros bouton COMBAT du menu pour un mot de deux lettres qui ne fait
  // que refermer la page. Elle prend maintenant environ un tiers de la
  // largeur, la Voie passe de chaque côté, et sa taille est relative à
  // l'écran (pourcentage, `em`, `vh`) et non en pixels.
  await step('le bouton OK de la Voie est une pastille centrée en bas de l\'écran',async()=>{
    await page.evaluate(()=>{renderVoiePage();showPage('page-voie');});
    await page.waitForSelector('#page-voie.active',{timeout:8000});
    await page.waitForTimeout(500);
    const r=await page.evaluate(()=>{
      const host=document.getElementById('voie-scroll');
      const btn=document.getElementById('voie-ok');
      const vh=innerHeight;
      const mesure=()=>{const b=btn.getBoundingClientRect();
        return{top:b.top,bottom:b.bottom,w:b.width,h:b.height,centre:b.left+b.width/2};};
      host.scrollTop=0;
      const haut=mesure();
      host.scrollTop=host.scrollHeight;              // tout en bas
      const bas=mesure();
      // La Voie passe-t-elle DE CHAQUE CÔTÉ de la pastille ? Le point au ras
      // du bord gauche, à hauteur du bouton, ne doit PAS être le bouton.
      const b=btn.getBoundingClientRect();
      const cote=document.elementFromPoint(8,b.top+b.height/2);
      return{haut,bas,vh,
        // Largeur de RÉFÉRENCE : celle de la page, et non innerWidth — sur un
        // écran d'ordinateur, la barre de défilement en retire une dizaine de
        // pixels.
        pw:document.getElementById('page-voie').clientWidth,
        scrollable:host.scrollHeight>host.clientHeight+40,
        retourVisible:!!document.getElementById('voie-back'),
        // La pastille reste une PASTILLE : quatre coins ronds. Ils ont été
        // équerrés en bas pour « épouser le bord de l'écran », ce qui en
        // faisait un onglet mal coupé — descendre le bouton ne veut pas dire
        // le déformer.
        coins:getComputedStyle(btn).borderRadius,
        toucheLeBord:cote===btn||btn.contains(cote)};
    });
    if(!r.scrollable)throw new Error('la Voie ne défile pas, le test ne prouve rien');
    if(r.retourVisible)throw new Error('le bouton « Retour » est encore là');
    // Immobile d'un bout à l'autre du défilement.
    if(Math.abs(r.haut.top-r.bas.top)>1)
      throw new Error('le bouton OK bouge avec le défilement ('+r.haut.top+' → '+r.bas.top+')');
    // COLLÉ AU BAS DE L'ÉCRAN : il ne flotte plus au-dessus du bord, il
    // l'épouse. Seule la zone sûre du matériel (var(--safe-b)) peut l'en
    // écarter, et elle vaut 0 sur un écran d'ordinateur.
    const marge=r.vh-r.haut.bottom;
    if(marge>2)
      throw new Error('le bouton OK n\'est pas collé au bas de l\'écran (bas à '+
        Math.round(r.haut.bottom)+' pour une hauteur de '+r.vh+')');
    // MODESTE : il ne prend plus toute la largeur, et il reste centré.
    if(r.haut.w>r.pw*0.45)
      throw new Error('le bouton OK prend encore '+Math.round(r.haut.w/r.pw*100)+' % de la largeur');
    if(Math.abs(r.haut.centre-r.pw/2)>2)
      throw new Error('le bouton OK n\'est pas centré (centre à '+Math.round(r.haut.centre)+
        ' pour une page de '+r.pw+' px)');
    // Mais toujours une vraie cible de pouce.
    if(r.haut.h<34)
      throw new Error('le bouton OK n\'est haut que de '+Math.round(r.haut.h)+' px');
    if(r.toucheLeBord)
      throw new Error('le bouton OK s\'étend encore jusqu\'au bord de l\'écran');
    // Une seule valeur de rayon = quatre coins identiques. Deux valeurs ou
    // plus, et l'un des coins a été équerré.
    if(r.coins.trim().split(/[\s/]+/).filter(Boolean).length!==1)
      throw new Error('le bouton OK n\'est plus une pastille : border-radius « '+r.coins+' »');
    await page.click('#voie-ok');
    await page.waitForTimeout(400);
    if(await page.isVisible('#page-voie.active'))throw new Error('le bouton OK ne referme pas la Voie');
  });

  // LE BOUTON DE RÉGLAGES ARRIVE AVEC LE MENU, PAS UNE DEMI-SECONDE APRÈS.
  // `body.main-menu` — la classe qui l'allume — exigeait qu'aucune rotation
  // ne soit en cours : pendant les 460 ms de bascule vers la face JOUER,
  // aucune face n'était « devant », et le bouton n'apparaissait donc qu'une
  // fois le cube arrêté, sur un menu déjà en place. Il se règle maintenant
  // sur la face d'ARRIVÉE de la rotation.
  await step('le bouton de réglages apparaît en même temps que le menu principal',async()=>{
    await page.evaluate(()=>goToMainMenu());
    await page.waitForTimeout(200);
    await page.click('.cube-facebar-btn[data-face="magasin"]');   // on quitte le menu
    await page.waitForTimeout(900);
    const ailleurs=await page.evaluate(()=>
      getComputedStyle(document.getElementById('settings-btn')).display!=='none');
    await page.click('.cube-facebar-btn[data-face="jouer"]');     // retour : la rotation démarre
    await page.waitForTimeout(80);                                 // bien avant la fin des 460 ms
    const r={ailleurs,
      pendant:await page.evaluate(()=>
        getComputedStyle(document.getElementById('settings-btn')).display!=='none')};
    await page.waitForTimeout(900);
    r.apres=await page.evaluate(()=>
      getComputedStyle(document.getElementById('settings-btn')).display!=='none');
    if(r.ailleurs)throw new Error('le bouton de réglages reste allumé hors du menu principal');
    if(!r.pendant)throw new Error('le bouton de réglages attend la fin de la rotation pour s\'afficher');
    if(!r.apres)throw new Error('le bouton de réglages n\'est pas là sur le menu principal');
  });

  // LE COMPTE EST LA PREMIÈRE LIGNE DU PANNEAU. Il était sous les deux
  // curseurs de volume : chercher son identité demandait de descendre deux
  // réglages qu'on ne venait pas voir. Le panneau se lit maintenant de haut en
  // bas — les portes, puis les réglages.
  await step('les réglages ouvrent sur le Compte, puis les volumes',async()=>{
    await page.click('#settings-btn');
    await page.waitForTimeout(250);
    const r=await page.evaluate(()=>{
      const panel=document.getElementById('settings-panel');
      const ordre=[...panel.children].filter(el=>el.nodeType===1&&getComputedStyle(el).display!=='none')
        .map(el=>el.id||el.querySelector('.sp-label')?.textContent||'?');
      const y=id=>document.getElementById(id).getBoundingClientRect().top;
      return{ordre,compte:y('sp-account'),sfx:y('sp-sfx-vol'),musique:y('sp-music-vol')};
    });
    if(!(r.compte<r.sfx))throw new Error('« Compte » n\'est pas au-dessus de « Bruitages » : '+r.ordre.join(' / '));
    if(!(r.sfx<r.musique))throw new Error('« Musique » passe avant « Bruitages » : '+r.ordre.join(' / '));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  // LE LOGO DE LA FICHE EST CENTRÉ DANS SON CADRE. Le 76 % s'appliquait deux
  // fois — à la boîte de l'icône ET au SVG imbriqué —, et comme la boîte est
  // un inline-block, le dessin se collait à sa gauche : cinq pixels de décalage
  // dans un carré de 58, visibles au premier coup d'œil.
  await step('le logo de la fiche de pièce est centré dans son cadre',async()=>{
    const r=await page.evaluate(()=>{
      openPieceSheet('dame');
      const logo=document.getElementById('psheet-logo');
      const svg=logo.querySelector('svg');
      if(!svg)return null;
      const lb=logo.getBoundingClientRect(),sb=svg.getBoundingClientRect();
      closePieceSheet();
      return{dx:(sb.left+sb.width/2)-(lb.left+lb.width/2),
             dy:(sb.top+sb.height/2)-(lb.top+lb.height/2),cadre:lb.width,dessin:sb.width};
    });
    if(!r)throw new Error('aucun logo dans la fiche de pièce');
    if(Math.abs(r.dx)>1)throw new Error('logo décalé de '+r.dx.toFixed(1)+' px horizontalement');
    if(Math.abs(r.dy)>1)throw new Error('logo décalé de '+r.dy.toFixed(1)+' px verticalement');
    // Et il remplit bien son cadre : un dessin deux fois trop petit serait le
    // symptôme du double pourcentage, même une fois recentré.
    if(r.dessin<r.cadre*0.6)throw new Error('le logo ne fait que '+Math.round(r.dessin/r.cadre*100)+' % du cadre');
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
  // vide, négatif ou débordant passerait pour de la chance.
  //
  // LA FOURCHETTE EST UN TOTAL. Les coffres se décrivaient en lots de N
  // exemplaires, avec un facteur qui doublait la quantité sur un bon tirage :
  // personne ne pouvait dire ce qu'un coffre donnait vraiment, et la réponse
  // était « beaucoup trop » (plus de 70 exemplaires en stock par pièce).
  // `total` est maintenant le nombre d'exemplaires donnés EN TOUT, et c'est
  // lui qu'on vérifie — une seule sortie hors fourchette, et le stock repart.
  await step('un coffre ne donne jamais plus que sa fourchette',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      CHESTS.forEach(ch=>{
        const t=ch.total,pr=chestPearlRange(ch.id);
        for(let i=0;i<200;i++){
          const lots=chestRoll(ch.id);
          const perles=lots.filter(l=>l.pearls>0);
          const total=perles.reduce((a,l)=>a+l.pearls,0);
          const pieces=lots.filter(l=>l.pieceId);
          const inedit=pieces.some(l=>l.isNew);
          const copies=pieces.reduce((a,l)=>a+l.qty,0);
          if(!perles.length)out.push(ch.id+' : aucun lot de perles');
          if(total<pr[0]||total>pr[1])
            out.push(ch.id+' : '+total+' perles hors de ['+pr.join('-')+']');
          if(pieces.some(l=>!(l.qty>0)))out.push(ch.id+' : lot de quantite nulle');
          // Un lot INÉDIT a droit à deux exemplaires au minimum, même dans un
          // Coffre Pion : une créature qui se déploie par paire doit pouvoir
          // être alignée au moins une fois le jour où elle tombe.
          const max=inedit?Math.max(2,t[1]):t[1];
          if(copies>max)out.push(ch.id+' : '+copies+' exemplaires, plafond '+max);
          if(!inedit&&copies&&copies<t[0])
            out.push(ch.id+' : '+copies+' exemplaires, plancher '+t[0]);
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
  // saine le cache complètement. Le facteur « bon lot » ne s'applique plus aux
  // perles (chestRoll les tire une fois, dans leur fourchette) : le maximum
  // est donc le haut de CHEST_PEARLS, tel quel.
  await step('aucun coffre ne peut se payer avec ses propres perles',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      CHESTS.forEach(ch=>{
        const max=chestPearlRange(ch.id)[1],prix=chestPearlPrice(ch.id);
        if(max>=prix)out.push(ch.id+' : jusqu\'a '+max+' perles pour un prix de '+prix);
        // Une marge, et pas seulement l'inegalite stricte : a 99 % du prix, il
        // suffit d'un coffre gagne en jouant pour relancer la boucle.
        if(max>prix*0.6)out.push(ch.id+' : '+max+' perles, soit '+Math.round(100*max/prix)+'% du prix (>60%)');
      });
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // LA NOTATION DU JOURNAL. Il disait les DEUX cases (« ♞e1–f3 »), ce qu'aucune
  // notation d'échecs n'écrit : la case de départ ne sert à rien tant qu'une
  // seule pièce peut atteindre l'arrivée. Elle ne revient donc que pour lever
  // une ambiguïté — colonne, sinon rangée, sinon la case entière —, et un pion
  // qui capture garde toujours sa colonne, comme le veut la règle officielle.
  // Les positions sont posées à la main : c'est la seule façon de provoquer à
  // coup sûr les quatre cas.
  await step('le journal note en algébrique, et ne désambiguïse que s\'il le faut',async()=>{
    const lus=await page.evaluate(()=>{
      const vide=()=>Array.from({length:8},()=>Array(8).fill(null));
      const pose=(b,r,c,pieceId,color,type)=>{
        const cell={type:type||'n',color,pieceId,emoji:'',hasMoved:true,isKing:type==='k',id:pieceId+r+c};
        b[r][c]=cell;return cell;
      };
      const rois=b=>{pose(b,7,4,'roi','w','k');pose(b,0,4,'roi','b','k');};
      const jouer=(b,from,to)=>{
        GS.board=b;GS.movePairs=[];GS.history=[];GS.turn=b[from.r][from.c].color;
        GS.gameOver=false;GS.pendingPromo=null;
        executeGameMove(from,to,GS);
        GS.gameOver=true;
        const el=document.createElement('div');
        el.innerHTML=GS.movePairs.map(p=>p[0]).join('');
        return el.textContent.trim();
      };
      const out={};
      let b=vide();rois(b);pose(b,7,1,'cavalier-primordial','w');
      out.seul=jouer(b,{r:7,c:1},{r:5,c:2});
      b=vide();rois(b);pose(b,7,1,'cavalier-primordial','w');pose(b,7,3,'cavalier-primordial','w');
      out.colonne=jouer(b,{r:7,c:1},{r:5,c:2});
      b=vide();rois(b);
      pose(b,7,1,'cavalier-primordial','w');pose(b,7,3,'cavalier-primordial','w');pose(b,3,1,'cavalier-primordial','w');
      out.case=jouer(b,{r:7,c:1},{r:5,c:2});
      b=vide();rois(b);pose(b,7,0,'tour-primordiale','w','r');pose(b,3,0,'tour-primordiale','w','r');
      out.rangee=jouer(b,{r:7,c:0},{r:5,c:0});
      b=vide();rois(b);pose(b,4,4,'std-pawn','w','p');pose(b,3,3,'tour-primordiale','b','r');
      out.prisePion=jouer(b,{r:4,c:4},{r:3,c:3});
      return out;
    });
    const attendu={seul:'c3',colonne:'bc3',case:'b1c3',rangee:'1a3',prisePion:'e×d5'};
    Object.keys(attendu).forEach(k=>{
      if(lus[k]!==attendu[k])
        throw new Error('notation « '+k+' » : « '+lus[k]+' » au lieu de « '+attendu[k]+' »');
    });
  });

  // LES DEUX ÉTATS DU TOUR SE LISENT AU MÊME ENDROIT. « À votre tour » était
  // masqué sur téléphone : la barre ne montrait jamais qu'une moitié de la
  // question, et le joueur n'avait rien à lire au moment où c'était à lui.
  await step('la barre de statut annonce les deux tours',async()=>{
    const r=await page.evaluate(()=>{
      const bar=document.getElementById('game-status');
      const lire=()=>({txt:bar.textContent,vu:getComputedStyle(bar).display!=='none'});
      GS.gameOver=false;GS.historyView=null;
      GS.playerColor='w';GS.aiColor='b';
      GS.turn='w';updateStatus(GS);const moi=lire();
      GS.turn='b';updateStatus(GS);const lui=lire();
      GS.gameOver=true;
      return{moi,lui};
    });
    if(!/À votre tour/.test(r.moi.txt))throw new Error('tour du joueur : « '+r.moi.txt+' »');
    if(!r.moi.vu)throw new Error('« À votre tour » est masqué');
    if(!/Au tour de votre adversaire/.test(r.lui.txt))throw new Error('tour adverse : « '+r.lui.txt+' »');
    if(!r.lui.vu)throw new Error('« Au tour de votre adversaire » est masqué');
  });

  // LA FOURMI SE PROMEUT, ET ON NE SE PROMEUT PAS EN FOURMI. Son pouvoir était
  // l'inverse exact (« ne peut pas reculer, même si elle atteint l'autre côté
  // de l'échiquier ») : elle traversait tout le plateau pour finir clouée.
  // Les deux moitiés de la règle se tiennent — une créature qui se promeut ne
  // peut pas être le LOT d'une promotion, sinon la promotion serait à refaire
  // au coup suivant, sur la case même où elle vient d'arriver.
  await step('la Fourmi se promeut, et ne peut pas être choisie en promotion',async()=>{
    const r=await page.evaluate(()=>{
      const vide=()=>Array.from({length:8},()=>Array(8).fill(null));
      const pose=(b,r,c,pieceId,color,type)=>{
        b[r][c]={type:type||'p',color,pieceId,emoji:'',hasMoved:true,isKing:type==='k',id:pieceId+r+c};
      };
      const rois=b=>{pose(b,7,4,'roi','w','k');pose(b,0,4,'roi','b','k');};
      const out={data:PIECES.find(p=>p.id==='fourmi').ability};
      // Côté joueur : la fenêtre de promotion s'ouvre, sans la Fourmi dedans.
      let b=vide();rois(b);pose(b,1,3,'fourmi','w','p');
      GS.board=b;GS.movePairs=[];GS.history=[];GS.turn='w';GS.gameOver=false;GS.pendingPromo=null;
      GS.playerColor='w';GS.aiColor='b';
      GS.playerArmy={extras:['fourmi','meduse'],gen:{id:'dame'}};
      executeGameMove({r:1,c:3},{r:0,c:3},GS);
      out.modal=document.getElementById('promo-modal').classList.contains('active');
      out.choix=[...document.querySelectorAll('#promo-modal .promo-piece-lbl')].map(e=>e.textContent);
      document.getElementById('promo-modal').classList.remove('active');
      GS.pendingPromo=null;
      // Côté adversaire : promotion automatique, jamais en Fourmi non plus.
      b=vide();rois(b);pose(b,1,3,'fourmi','w','p');
      GS.board=b;GS.movePairs=[];GS.history=[];GS.turn='w';GS.gameOver=false;
      GS.playerColor='b';GS.aiColor='w';
      GS.aiArmy={extras:['fourmi','meduse'],gen:{id:'dame'}};
      executeGameMove({r:1,c:3},{r:0,c:3},GS);
      out.ia=GS.board[0][3]&&GS.board[0][3].pieceId;
      // Le pion, lui, se promeut comme avant.
      b=vide();rois(b);pose(b,1,2,'std-pawn','w','p');
      GS.board=b;GS.movePairs=[];GS.history=[];GS.turn='w';GS.gameOver=false;
      executeGameMove({r:1,c:2},{r:0,c:2},GS);
      out.pion=GS.board[0][2]&&GS.board[0][2].pieceId;
      GS.gameOver=true;
      return out;
    });
    if(!/promeut/i.test(r.data))throw new Error('le pouvoir de la Fourmi dit encore : '+r.data);
    if(!r.modal)throw new Error('la Fourmi arrivée au bout n\'ouvre pas la promotion');
    if(!r.choix.length)throw new Error('aucun choix de promotion proposé');
    if(r.choix.some(t=>/Fourmi/i.test(t)))throw new Error('la Fourmi est proposée en promotion : '+r.choix.join(','));
    if(r.ia==='fourmi')throw new Error('l\'adversaire se promeut en Fourmi');
    if(r.ia==='std-pawn')throw new Error('la Fourmi de l\'adversaire ne se promeut pas');
    if(r.pion==='std-pawn')throw new Error('le pion ne se promeut plus');
  });

  // Les valeurs de PIECES sont le budget du builder : une valeur qui bouge
  // change toutes les compositions possibles. Celles qu'on fixe à la main se
  // vérifient donc à la main.
  // L'ÉCRAN DE FIN DE PARTIE NE REDIT PLUS L'ELO. Il portait, sous la ligne
  // « 213 → 218 · +5 », une deuxième ligne « Pierre · 218 ELO » : le même
  // nombre, en plus long. Et sous elle, pour les cinq premières parties, une
  // note « Partie de placement 2/5 : elle compte double ».
  await step('l\'écran de fin de partie ne redit pas l\'ELO',async()=>{
    const r=await page.evaluate(()=>({
      rang:!!document.getElementById('result-rank-name'),
      ligneElo:!!document.getElementById('result-elo-after'),
      note:!!document.getElementById('result-elo-note'),
    }));
    if(r.rang)throw new Error('la ligne de rang est encore sur l\'écran de fin de partie');
    if(!r.ligneElo)throw new Error('la ligne d\'ELO a disparu avec elle');
    if(!r.note)throw new Error('la ligne d\'explication a disparu : elle sert encore à l\'ascension');
  });

  await step('l\'Empereur vaut 8 points',async()=>{
    const v=await page.evaluate(()=>PIECES.find(p=>p.id==='empereur').value);
    if(v!==8)throw new Error('Empereur à '+v+' points au lieu de 8');
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

      // LES TROIS GARDES — une case, mais chacune sa grammaire : l'Eau tout
      // droit, le Feu en biais, la Pierre les deux. Ce sont les trois
      // premières créatures du joueur : si l'une d'elles se met à aller
      // ailleurs, c'est tout l'apprentissage du plateau qui ment.
      let b=vide();pose(b,4,4,'garde-eau','w');
      if(!va(b,4,4,3,4)||!va(b,4,4,5,4)||!va(b,4,4,4,3)||!va(b,4,4,4,5))
        out.push('garde d\'eau : elle ne va pas dans les quatre orthogonales');
      if(va(b,4,4,3,3)||va(b,4,4,5,5))out.push('garde d\'eau : elle va en diagonale');
      if(va(b,4,4,2,4))out.push('garde d\'eau : elle avance de deux cases');
      b=vide();pose(b,4,4,'garde-feu','w');
      if(!va(b,4,4,3,3)||!va(b,4,4,3,5)||!va(b,4,4,5,3)||!va(b,4,4,5,5))
        out.push('garde de feu : elle ne va pas dans les quatre diagonales');
      if(va(b,4,4,3,4)||va(b,4,4,4,5))out.push('garde de feu : elle va tout droit');
      if(va(b,4,4,2,2))out.push('garde de feu : elle avance de deux cases');
      b=vide();pose(b,4,4,'garde-pierre','w');
      if(!va(b,4,4,3,4)||!va(b,4,4,3,3))out.push('garde de pierre : elle ne couvre pas les huit directions');
      // Et elles donnent échec là où elles se déplacent, pas ailleurs : une
      // pièce au déplacement particulier qui attaquerait comme son pieceType
      // de base donnerait des échecs imaginaires.
      b=vide();pose(b,4,4,'garde-eau','w');pose(b,3,4,'roi','b');
      if(!isInCheckSimple('b',b))out.push('garde d\'eau : elle ne donne pas echec tout droit');
      b=vide();pose(b,4,4,'garde-eau','w');pose(b,3,3,'roi','b');
      if(isInCheckSimple('b',b))out.push('garde d\'eau : elle donne echec en diagonale');
      b=vide();pose(b,4,4,'garde-feu','w');pose(b,3,3,'roi','b');
      if(!isInCheckSimple('b',b))out.push('garde de feu : elle ne donne pas echec en diagonale');
      b=vide();pose(b,4,4,'garde-feu','w');pose(b,3,4,'roi','b');
      if(isInCheckSimple('b',b))out.push('garde de feu : elle donne echec tout droit');

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
      const permis=['roi','dame','cavalier-primordial','garde-eau','meduse'];
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

  // ----------------------------------------------------------------
  // LA COURBE D'ASCENSION (vvCalcNewElo, js/voie.js)
  // ----------------------------------------------------------------
  // C'est le réglage principal du jeu : monter vite jusqu'à 1000, se battre
  // après. Les trois règles se vérifient sur des cas nommés plutôt que sur
  // des valeurs exactes — les constantes bougeront, la promesse non.
  await step('l\'ascension paie plus qu\'elle ne coûte sous 1000 ELO',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      // Duel équilibré à différents niveaux, hors parties de placement.
      const at=e=>({
        win :vvCalcNewElo(e,e,'win',40).delta,
        loss:vvCalcNewElo(e,e,'loss',40).delta,
      });
      const bas=at(100),milieu=at(700),haut=at(1400);
      if(bas.win<=Math.abs(bas.loss)*2)
        out.push('à 100 ELO la victoire ne domine pas la défaite : +'+bas.win+' / '+bas.loss);
      if(milieu.win<=Math.abs(milieu.loss))
        out.push('à 700 ELO la victoire ne domine plus : +'+milieu.win+' / '+milieu.loss);
      // Au-delà du seuil, l'Elo redevient symétrique.
      if(haut.win!==Math.abs(haut.loss))
        out.push('au-dessus de 1000 ELO l\'Elo n\'est pas symétrique : +'+haut.win+' / '+haut.loss);
      // Le bonus décroît : il doit être strictement plus faible en montant.
      if(!(at(100).win>at(500).win&&at(500).win>at(900).win))
        out.push('le bonus d\'ascension ne décroît pas avec l\'ELO');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('une défaite coûte toujours des points',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      // LA RÈGLE : perdre coûte, à tous les niveaux, quel que soit
      // l'adversaire. Le seul plancher est le zéro absolu — un classement
      // négatif n'a pas de sens. On vérifie en particulier sur les anciens
      // planchers de rang (500, 800, 1200…), où une défaite ne coûtait
      // RIEN : c'était un point de stationnement sans risque.
      RANKS.forEach(r=>{
        if(r.min===0)return;                       // le zéro absolu, seule exception
        [r.min,r.min+1,r.min+50].forEach(e=>{
          [-400,-200,0,200,400].forEach(d=>{
            const c=vvCalcNewElo(e,Math.max(0,e+d),'loss',40);
            if(c.delta>=0)out.push('à '+e+' ELO contre '+(e+d)+', la défaite rapporte '+c.delta);
          });
        });
      });
      // Et au tout bas de l'échelle, on ne passe jamais sous zéro.
      const bas=vvCalcNewElo(0,900,'loss',40);
      if(bas.newElo<0)out.push('l\'ELO devient négatif : '+bas.newElo);
      if(!vvEloExplain(bas,'loss',0))out.push('une défaite sans coût au bas de l\'échelle n\'est pas expliquée');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('l\'écart avec l\'adversaire décide du gain et de la perte',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      // C'est la formule Elo, et la courbe d'ascension ne doit pas la
      // casser : battre plus fort que soi rapporte davantage, battre plus
      // faible rapporte moins ; perdre contre plus fort coûte moins, perdre
      // contre plus faible coûte plus.
      [200,500,800,1200,1800].forEach(e=>{
        const g=d=>vvCalcNewElo(e,e+d,'win',40).delta;
        const p=d=>vvCalcNewElo(e,e+d,'loss',40).delta;
        if(!(g(-300)<g(0)&&g(0)<g(300)))
          out.push('à '+e+' ELO, le gain ne suit pas la force de l\'adversaire : '+g(-300)+'/'+g(0)+'/'+g(300));
        if(!(p(-300)<p(0)&&p(0)<p(300)))
          out.push('à '+e+' ELO, la perte ne suit pas la force de l\'adversaire : '+p(-300)+'/'+p(0)+'/'+p(300));
      });
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('le rang et les déblocages sont acquis pour toujours',async()=>{
    // On SORT du mode test : là-dedans vvLoadElo() vaut 10 000, vvSaveElo()
    // n'écrit rien et tout est déjà débloqué — on ne peut donc rien y
    // vérifier de la progression réelle (voir js/accounts.js).
    await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    if(await page.evaluate(()=>ADMIN_MODE))throw new Error('toujours en mode test');
    const bad=await page.evaluate(()=>{
      const out=[];
      // Le rang ne vit PAS sur le classement du moment mais sur le sommet
      // atteint (elo_peak). C'est ce qui permet à l'ELO de redescendre sans
      // que le joueur perde son rang, ses créatures ou ses échiquiers.
      const eloAvant=vvLoadElo(),peakAvant=vvLoadPeakElo();
      vvSaveElo(1300);                                  // on monte à Obsidienne
      if(vvRank().id!=='obsidienne')out.push('1300 ELO ne donne pas Obsidienne : '+vvRank().id);
      const skinsHaut=BOARD_SKINS.filter(boardSkinUnlocked).length;
      vvSaveElo(250);                                   // puis on retombe très bas
      if(vvLoadPeakElo()!==1300)out.push('le sommet a bougé : '+vvLoadPeakElo());
      if(vvRank().id!=='obsidienne')out.push('le rang a été reperdu en redescendant : '+vvRank().id);
      if(BOARD_SKINS.filter(boardSkinUnlocked).length!==skinsHaut)
        out.push('des échiquiers se sont reverrouillés en redescendant');
      // Et le joueur doit être PRÉVENU, sinon il croit avoir tout perdu.
      const c=vvCalcNewElo(250,250,'loss',40);
      if(!/acquis/.test(vvEloExplain(c,'loss',1300)))
        out.push('descendre sous son rang n\'est pas expliqué au joueur');
      vvSaveElo(eloAvant);
      accSet('elo_peak',peakAvant);
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('les cinq premières parties placent le joueur',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const placement=vvCalcNewElo(0,400,'win',0).k;
      const routine=vvCalcNewElo(0,400,'win',100).k;
      if(!(placement>routine*2))out.push('le K de placement ('+placement+') ne domine pas celui de routine ('+routine+')');
      if(vvCalcNewElo(2100,2100,'win',500).k>=routine)out.push('le K ne se resserre pas en haut du classement');
      // Un compte neuf doit franchir le premier rang en quelques parties.
      let e=0;
      for(let g=0;g<5;g++)e=vvCalcNewElo(e,e,'win',g).newElo;
      if(e<300)out.push('cinq victoires de placement ne mènent qu\'à '+e+' ELO');
      // Et la phrase d'explication doit exister quand il se passe quelque chose
      // — SAUF pour les parties de placement, qui ne s'annoncent plus : elles
      // ajoutaient une règle à retenir aux cinq premières parties, celles où
      // le joueur découvre déjà tout le reste.
      if(/placement/i.test(vvEloExplain(vvCalcNewElo(1200,1200,'win',0),'win',1200)||''))
        out.push('les parties de placement s\'annoncent encore');
      if(!vvEloExplain(vvCalcNewElo(0,400,'win',0),'win',0))out.push('le bonus d\'ascension n\'est pas expliqué');
      if(!vvEloExplain(vvCalcNewElo(200,200,'loss',40),'loss',200))out.push('l\'amorti des pertes n\'est pas expliqué');
      if(vvEloExplain(vvCalcNewElo(1500,1500,'win',200),'win',1500))out.push('une partie ordinaire s\'explique alors qu\'il n\'y a rien à dire');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // ----------------------------------------------------------------
  // LA FENÊTRE D'APPARIEMENT (mpEloWindow, js/multiplayer.js)
  // ----------------------------------------------------------------
  // Personne n'attend sur un écran de recherche : la fenêtre doit être
  // grande ouverte AVANT dix secondes, et ne jamais devenir infinie.
  await step('la fenêtre d\'appariement s\'ouvre en moins de dix secondes',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      if(mpEloWindow(0)<150)out.push('la fenêtre de départ est trop étroite : ±'+mpEloWindow(0));
      if(mpEloWindow(10)<MP_ELO_MAX)out.push('après 10 s la fenêtre n\'est qu\'à ±'+mpEloWindow(10));
      if(mpEloWindow(600)!==MP_ELO_MAX)out.push('la fenêtre dépasse son plafond : ±'+mpEloWindow(600));
      if(!isFinite(mpEloWindow(99999)))out.push('la fenêtre redevient infinie : un débutant peut tomber contre n\'importe qui');
      if(MP_ELO_MAX>600)out.push('le plafond dépasse ±600 ELO : '+MP_ELO_MAX);
      // Elle doit croître, pas sauter d'un coup à son plafond.
      if(!(mpEloWindow(0)<mpEloWindow(2)&&mpEloWindow(2)<=mpEloWindow(4)))
        out.push('la fenêtre ne s\'élargit pas progressivement');
      // ET ELLE NE S'EXPLIQUE PAS AU JOUEUR QUI ATTEND. « On cherche d'abord un
      // adversaire de votre niveau, puis on élargit » était la première chose
      // affichée sous le radar : une règle d'appariement à lire pour patienter.
      // La note dit ce qui se passe, un point.
      const note=document.getElementById('mp-search-note');
      if(!note)out.push('la note de recherche a disparu');
      else{
        if(/élargit|niveau/i.test(note.textContent))
          out.push('la note explique encore la fenêtre d\'appariement : « '+note.textContent.trim()+' »');
        if(!note.textContent.trim())out.push('la note de recherche est vide');
        // Et ce qu'elle dit au premier instant est déjà ce que mpRenderSearch
        // écrira : pas de phrase intermédiaire à voir passer.
        const avant=note.textContent.trim();
        mpRenderSearch(0,0,0);
        if(note.textContent.trim()!==avant)
          out.push('la note change dès le premier battement : « '+avant+' » puis « '+note.textContent.trim()+' »');
      }
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('une armee adverse invalide est refusee',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const mon=PIECES.find(p=>p.class==='Monarque');
      const gen=PIECES.find(p=>p.class==='Général');
      // UNE SEULE PRIMORDIALE PAR ARMÉE : le premier jet prenait les trois
      // premières créatures du catalogue, qui en comptaient deux — le test
      // se plaignait donc d'une règle correctement appliquée.
      const dispo=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&p.class!=='Primordiale');
      const trois=dispo.slice(0,3);
      const cols=[2,1,0];
      const pl={};trois.forEach((p,i)=>{pl[p.id]=cols[i];});
      const bonne={mon,gen,extras:trois.map(p=>p.id),placements:pl};
      const souci=mpArmyProblem(bonne);
      if(souci)out.push('une armee legitime est refusee : '+souci);

      const casse=[
        [null,'aucune armee'],
        [Object.assign({},bonne,{extras:[trois[0].id]}),'moins de trois creatures'],
        [Object.assign({},bonne,{extras:[trois[0].id,trois[0].id,trois[1].id]}),'un doublon'],
        [Object.assign({},bonne,{mon:gen}),'un monarque qui n en est pas un'],
        [Object.assign({},bonne,{extras:['piece-inexistante',trois[1].id,trois[2].id]}),'une piece inexistante'],
        [Object.assign({},bonne,{placements:{}}),'une disposition vide'],
      ];
      const prim=PIECES.filter(p=>p.class==='Primordiale').slice(0,2);
      if(prim.length===2){
        const pl3={};pl3[prim[0].id]=2;pl3[prim[1].id]=1;pl3[trois[0].id]=0;
        casse.push([{mon,gen,extras:[prim[0].id,prim[1].id,trois[0].id],placements:pl3},
                    'deux Primordiales']);
      }
      casse.forEach(pair=>{if(!mpArmyProblem(pair[0]))out.push('accepte '+pair[1]);});

      const chers=dispo.slice().sort((a,b)=>b.value-a.value).slice(0,3);
      const pl2={};chers.forEach((p,i)=>{pl2[p.id]=cols[i];});
      const total=mon.value+gen.value+chers.reduce((t,p)=>t+p.value,0);
      if(total>24&&!mpArmyProblem({mon,gen,extras:chers.map(p=>p.id),placements:pl2}))
        out.push('accepte une armee a '+total+' points');
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // ----------------------------------------------------------------
  // LE MOTEUR DE BRUITAGES ET L'HAPTIQUE (js/sfx.js)
  // ----------------------------------------------------------------
  // On ne peut pas ÉCOUTER un son dans un test. Ce qu'on peut vérifier, et
  // qui casse en silence sinon : que chaque son du jeu a bien une recette,
  // qu'aucune n'est un bip d'une seule couche, que la variation existe, et
  // que jouer un son ne lève pas d'exception.
  await step('chaque son du jeu a une recette en couches',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      if(typeof SFX_RECIPES!=='object'){out.push('SFX_RECIPES absent');return out;}
      // Les sons que le reste du jeu appelle par leur nom. Un playSound()
      // sans recette est silencieux, et rien ne le signale à l'exécution.
      ['move','capture','check','castle','promo','win','loss','draw',
       'tap','deny','chest','loot','rank'].forEach(n=>{
        const r=SFX_RECIPES[n];
        if(!r){out.push('son sans recette : '+n);return;}
        if(!Array.isArray(r.layers)||!r.layers.length){out.push(n+' : aucune couche');return;}
        // Un son d'une seule couche est un bip — c'est exactement ce dont on
        // sortait. Seul 'tap', volontairement minuscule, y a droit.
        if(r.layers.length<2&&n!=='tap'&&n!=='deny')out.push(n+' : une seule couche, c\'est un bip');
        r.layers.forEach((L,i)=>{
          if(L.type!=='tone'&&L.type!=='noise')out.push(n+' couche '+i+' : type inconnu '+L.type);
          if(!(L.decay>0))out.push(n+' couche '+i+' : pas d\'extinction (clic audible)');
        });
      });
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('la force d\'une capture suit la valeur de la pièce prise',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      if(typeof sfxCaptureForce!=='function'){out.push('sfxCaptureForce absent');return out;}
      const pion=sfxCaptureForce('std-pawn');
      const gm=sfxCaptureForce('grand-maitre');
      if(!(gm>pion))out.push('prendre le Grand Maître ne sonne pas plus fort qu\'un pion : '+gm+' vs '+pion);
      if(pion<0.2||gm>1)out.push('force hors bornes : '+pion+' / '+gm);
      // Une pièce inconnue ne doit jamais casser le son.
      const inconnu=sfxCaptureForce('piece-qui-nexiste-pas');
      if(!(inconnu>0&&inconnu<=1))out.push('force invalide pour une pièce inconnue : '+inconnu);
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  await step('jouer un son ne lève jamais d\'exception',async()=>{
    const bad=await page.evaluate(()=>{
      const out=[];
      const noms=Object.keys(SFX_RECIPES).concat(['son-inexistant']);
      noms.forEach(n=>{
        try{sfxFeel(n,{force:0.9});sfxFeel(n,{force:0});}
        catch(e){out.push(n+' : '+e.message);}
      });
      // haptic() doit répondre proprement sur un appareil sans vibreur.
      try{
        if(haptic('impact')!==false&&!hapticSupported())out.push('haptic ment sur un appareil sans vibreur');
        haptic('motif-inexistant');
      }catch(e){out.push('haptic : '+e.message);}
      return out;
    });
    if(bad.length)throw new Error(bad.join(' · '));
  });

  // LA VIBRATION EST TOUJOURS ACTIVE, et n'a plus d'interrupteur : elle est la
  // réponse du jeu au doigt qui touche, pas un effet qu'on subit. On vérifie
  // les deux moitiés de la promesse — plus de bouton, et une vibration qui
  // part vraiment — ainsi que le curseur de musique qui a pris sa place et
  // survit au rechargement.
  await step('la vibration n\'a plus d\'interrupteur et reste active',async()=>{
    await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    await page.click('#settings-btn');
    if(await page.locator('#sp-haptic').count())
      throw new Error('l\'interrupteur de vibration est encore dans les réglages');
    // Sous Chromium de test, navigator.vibrate existe : la vibration doit donc
    // réellement partir, sans qu'on ait rien allumé.
    const part=await page.evaluate(()=>hapticSupported()?haptic('impact')!==false:true);
    if(!part)throw new Error('la vibration ne part pas alors qu\'elle est censée être toujours active');
  });

  // LE CURSEUR DE MUSIQUE est le réglage qui a remplacé l'interrupteur. Il
  // commande le gain de la boucle de combat, SÉPARÉMENT des bruitages —
  // couper la musique en gardant le bruit des pièces est ce qu'on fait dès
  // qu'on écoute autre chose en jouant.
  await step('le curseur de musique règle la musique seule, et s\'en souvient',async()=>{
    const r=await page.evaluate(()=>{
      const mus=document.getElementById('sp-music-vol'),sfx=document.getElementById('sp-sfx-vol');
      if(!mus)return{absent:true};
      applySfxVol(1);
      applyMusicVol(0);
      const musCoupee=_musicVol===0&&_sfxVol===1&&_soundEnabled===true;
      applyMusicVol(0.35);savePrefs({music:_musicVol});
      return{absent:false,musCoupee,sfx:!!sfx,valeur:_musicVol};
    });
    if(r.absent)throw new Error('le curseur « Musique » est absent des réglages');
    if(!r.sfx)throw new Error('le curseur « Bruitages » a disparu');
    if(!r.musCoupee)throw new Error('couper la musique coupe aussi les bruitages');
    await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    const apres=await page.evaluate(()=>({
      vol:_musicVol,curseur:parseFloat(document.getElementById('sp-music-vol').value)}));
    if(Math.abs(apres.vol-0.35)>0.001)throw new Error('le volume de musique n\'a pas survécu au rechargement : '+apres.vol);
    if(Math.abs(apres.curseur-0.35)>0.001)throw new Error('le curseur ne montre pas le volume appliqué : '+apres.curseur);
  });

  // LES EFFETS DE COMBAT (js/combat-fx.js). Trois promesses à tenir, et
  // aucune ne se voit sur une capture d'écran :
  //   · les effets se posent sur le plateau et en repartent — un nœud qui
  //     resterait s'accumulerait à chaque prise jusqu'à couvrir la partie ;
  //   · le curseur « Effets » à zéro n'en pose plus AUCUN, ce qui est la
  //     seule chose qui rende le jeu tenable sur un téléphone lent ;
  //   · les couches n'ouvrent pas de contexte d'empilement (ni `z-index` ni
  //     `opacity`), faute de quoi le `mix-blend-mode` de tout ce qu'elles
  //     contiennent cesse de se fondre au plateau et les planches dessinées
  //     y laissent un rectangle noir. C'est le piège documenté en tête de la
  //     section [COMBAT-FX] du CSS, et il se re-tend au premier « il manque
  //     juste un z-index ici ».
  await step('les effets de combat se posent, se retirent, et se coupent',async()=>{
    await page.goto('http://localhost:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:8000});
    const r=await page.evaluate(async()=>{
      const out=[];
      const board=document.getElementById('game-board');
      if(!board)return['pas de plateau'];
      if(typeof fxPlayMove!=='function')return['js/combat-fx.js n\'est pas chargé'];
      fxSetLevel(1);fxSetFlipped(false);
      fxPlayMove({from:{r:6,c:4},to:{r:4,c:4},pieceId:'std-pawn',captured:'dame'});
      const poses=board.querySelectorAll('.fx-layer > *').length;
      if(!poses)out.push('une prise ne pose aucun effet');
      for(const l of board.querySelectorAll('.fx-layer')){
        const cs=getComputedStyle(l);
        if(cs.zIndex!=='auto')out.push('une couche d\'effets porte un z-index : le fondu au plateau est perdu');
        if(parseFloat(cs.opacity)<1)out.push('une couche d\'effets est translucide : le fondu au plateau est perdu');
      }
      // À zéro, plus rien — y compris sur un plateau qui vient d'en recevoir.
      await new Promise(res=>setTimeout(res,1400));
      const restants=board.querySelectorAll('.fx-layer > *').length;
      if(restants)out.push(restants+' effet(s) sont restés sur le plateau');
      fxSetLevel(0);
      fxPlayMove({from:{r:6,c:4},to:{r:4,c:4},pieceId:'std-pawn',captured:'dame'});
      fxCheck(7,4);fxPromote(0,4,'dame');
      if(board.querySelectorAll('.fx-layer > *').length)
        out.push('le curseur « Effets » à zéro laisse encore passer des effets');
      fxSetLevel(1);
      // LE DÉLAI D'ISSUE EST UN CONTRAT ENTRE DEUX MODULES, et c'est le plus
      // dangereux du lot : settleAndCelebrate (js/economy-ui.js) retarde la
      // cinématique de fin de ce que dit fxOutcomeDelay(). Une réponse non
      // nulle hors d'un mat retarderait donc le verdict d'une nulle, d'un
      // abandon ou d'une pendule à zéro — un écran qui a l'air figé.
      if(typeof fxOutcomeDelay==='function'){
        if(fxOutcomeDelay()!==0)out.push('un délai d\'issue est réclamé alors qu\'aucun mat n\'a été joué');
        fxMate(0,4,true);
        if(fxOutcomeDelay()<=0)out.push('le mat ne laisse pas au plateau le temps de jouer son effet');
        await new Promise(res=>setTimeout(res,400));
        if(fxOutcomeDelay()!==0)out.push('le délai d\'issue survit au mat qui l\'a demandé');
      }
      await new Promise(res=>setTimeout(res,2200));
      if(board.querySelectorAll('.fx-layer > *').length)
        out.push('les effets du mat sont restés sur le plateau');
      return out;
    });
    if(r.length)throw new Error(r.join(' · '));
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
