// ================================================================
// UI-SHOTS.JS : capture systématique de chaque écran, à chaque taille
// ================================================================
// Outil de développement, jamais chargé par le jeu. Il ouvre le jeu dans un
// Chromium, saute le Lore et le tutoriel, puis parcourt tous les écrans à
// plusieurs largeurs et enregistre une image de chacun dans /tmp/ui/.
//
// Il ne juge rien : il DONNE À VOIR. Un débordement, un chevauchement ou un
// texte tronqué se repèrent en un coup d'œil sur une planche de captures, et
// ne se repèrent d'aucune autre façon — aucun test automatique ne dira qu'un
// titre passe sous un bouton.
//
// Il relève quand même, lui, ce qui se mesure : les débordements horizontaux,
// les éléments qui sortent de l'écran et les cibles tactiles trop petites.
// C'est le complément du regard, pas son remplacement.
//
//   node tools/ui-shots.js            → toutes les tailles, tous les écrans
//   node tools/ui-shots.js 390x844    → une seule taille
//
// Dépendance : playwright (déjà nécessaire pour npm test).
// ================================================================

const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');

const ROOT=path.resolve(__dirname,'..');
const OUT='/tmp/ui';
const PORT=8097;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.json':'application/json','.mp3':'audio/mpeg','.png':'image/png','.webp':'image/webp',
  '.jpg':'image/jpeg','.txt':'text/plain','.webmanifest':'application/manifest+json'};

// Les tailles qui comptent : le petit téléphone qui casse tout, le téléphone
// courant, la tablette, et l'ordinateur (body.desk s'y allume).
const SIZES=[
  {name:'350x640', w:350, h:640},   // le plus petit écran encore vendu
  {name:'390x844', w:390, h:844},   // téléphone courant
  {name:'768x1024',w:768, h:1024},  // tablette portrait
  {name:'1440x900',w:1440,h:900},   // ordinateur
];

function serve(){
  return http.createServer((req,res)=>{
    let u=decodeURIComponent(req.url.split('?')[0]);
    if(u==='/')u='/index.html';
    if(u==='/info')u='/info.html';
    const f=path.join(ROOT,u);
    if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
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

// ----------------------------------------------------------------
// CE QUI SE MESURE
// ----------------------------------------------------------------
// Trois défauts qu'on peut constater sans les yeux, et qui sont exactement
// ceux qu'on rate à l'œil parce qu'ils ne se voient qu'à une taille sur
// quatre.
const AUDIT=`(()=>{
  const out=[];
  const vw=innerWidth, vh=innerHeight;

  // -- CE QUI COMPTE COMME « À L'ÉCRAN » ---------------------------------
  // Un simple getBoundingClientRect() ne suffit PAS ici : le menu principal
  // est un cube en 3D, et les trois faces qu'on ne voit pas restent dans le
  // document, projetées de travers. Leurs boutons y mesurent 25×178 ou 43×8,
  // et on passerait sa vie à corriger des tailles qui n'existent pas.
  //
  // On pose donc la seule question qui vaille : SI L'ON POSAIT LE DOIGT AU
  // MILIEU DE CET ÉLÉMENT, EST-CE LUI QU'ON TOUCHERAIT ? C'est aussi ce qui
  // détecte les superpositions — un bouton recouvert par autre chose répond
  // « non », et c'est précisément le défaut qu'on cherche.
  //
  // Il faut d'abord écarter tout ce qui n'est pas RÉELLEMENT affiché. Une
  // demi-douzaine de modales dorment dans le document (résultat de partie,
  // confirmation, salon en ligne) : elles gardent une boîte mesurable, et
  // leurs boutons rempliraient le rapport de défauts imaginaires.
  const affiche=el=>{
    for(let n=el;n&&n!==document.documentElement;n=n.parentElement){
      const s=getComputedStyle(n);
      if(s.display==='none'||s.visibility==='hidden')return false;
      if(parseFloat(s.opacity)===0)return false;
      if(s.pointerEvents==='none')return false;
      // Une page inactive et une face de cube qui n'est pas devant sont
      // là sans être là.
      if(n.classList.contains('page')&&!n.classList.contains('active'))return false;
      if(n.classList.contains('cube-face')&&!n.classList.contains('is-front'))return false;
    }
    return true;
  };

  const touchable=el=>{
    if(!affiche(el))return null;
    const r=el.getBoundingClientRect();
    if(r.width<=0||r.height<=0)return null;
    const x=r.left+r.width/2, y=r.top+r.height/2;
    if(x<0||y<0||x>vw||y>vh)return null;          // hors de l'écran
    const hit=document.elementFromPoint(x,y);
    if(!hit)return null;
    return {r,hit,mine:el===hit||el.contains(hit)||hit.contains(el)};
  };

  // 1. DÉBORDEMENT HORIZONTAL DE LA PAGE. Une page de jeu ne défile jamais
  //    latéralement : si elle le fait, un élément est trop large.
  if(document.documentElement.scrollWidth>vw+1)
    out.push('la page déborde horizontalement de '+(document.documentElement.scrollWidth-vw)+' px');

  const nom=el=>el.id||(typeof el.className==='string'?el.className.split(' ').slice(0,2).join('.'):el.tagName);

  document.querySelectorAll('button,input,select,[role="switch"],a[href],.btn').forEach(el=>{
    const t=touchable(el);
    if(!t)return;

    // 2. SUPERPOSITION. Le milieu de l'élément est occupé par autre chose :
    //    le clic n'arrivera jamais jusqu'à lui.
    //    UNE FENÊTRE OUVERTE NE COMPTE PAS : recouvrir la page, c'est le
    //    travail d'une modale. On ne signale que ce qui se recouvre DANS UNE
    //    MÊME COUCHE — c'est là, et là seulement, que c'est un défaut.
    if(!t.mine){
      const COUCHE='[class*="modal"],[id*="modal"],#settings-panel,#tuto-root,#lore-intro,#ctx-menu';
      const couvrante=t.hit.closest(COUCHE);
      const sienne=el.closest(COUCHE);
      if(couvrante&&couvrante!==sienne)return;   // une fenêtre par-dessus la page : normal
      out.push('recouvert par ['+nom(t.hit)+'] : '+nom(el));
      return;                                    // sa taille ne veut plus rien dire
    }

    // 3. CIBLE TACTILE TROP PETITE. 44 px est la recommandation ; 36 est le
    //    seuil au-dessous duquel un doigt rate visiblement sa cible.
    if(vw<900&&(t.r.height<36||t.r.width<32))
      out.push('cible tactile '+Math.round(t.r.width)+'×'+Math.round(t.r.height)+' : '+nom(el));
  });

  // 4. TEXTE TRONQUÉ. Un titre ou un libellé plus large que sa boîte est
  //    coupé ou masqué : le joueur lit « Diagonale de la Puiss… ».
  document.querySelectorAll('h1,h2,h3,.btn,button,[class*="title"],[class*="name"],[class*="label"]').forEach(el=>{
    const t=touchable(el);
    if(!t||!t.mine)return;
    const s=getComputedStyle(el);
    if(s.overflow==='visible'&&s.textOverflow!=='ellipsis')return;   // rien ne le coupe
    if(el.scrollWidth>el.clientWidth+2&&el.clientWidth>0)
      out.push('texte tronqué ('+el.scrollWidth+' > '+el.clientWidth+') : '+nom(el)+' — « '+(el.textContent||'').trim().slice(0,40)+' »');
  });

  return out;
})()`;

// ----------------------------------------------------------------
// LES ÉCRANS
// ----------------------------------------------------------------
// Chacun : un nom de fichier, et ce qu'il faut faire pour y arriver.
const SCREENS=[
  {name:'01-menu',      go:async p=>{await p.evaluate(()=>goToMainMenu());await p.waitForTimeout(700);}},
  {name:'02-reglages',  go:async p=>{await p.evaluate(()=>goToMainMenu());await p.waitForTimeout(600);
                                     await p.click('#settings-btn');await p.waitForTimeout(300);}},
  {name:'03-comptes',   go:async p=>{await p.evaluate(()=>openAccountPage());await p.waitForTimeout(500);}},
  {name:'04-comptes-2', go:async p=>{await p.evaluate(()=>{
                                       // Deux comptes voisins, pour voir la liste peuplée.
                                       const l=accountsList();
                                       if(!l.includes('Vitriol de Test')){l.push('Vitriol de Test');accountsSaveList(l);
                                         localStorage.setItem('mc_p_Vitriol de Test_elo','940');
                                         localStorage.setItem('mc_p_Vitriol de Test_ranked_games','62');}
                                       openAccountPage();});await p.waitForTimeout(500);}},
  {name:'05-armees',    go:async p=>{await p.evaluate(()=>showPage('page-armies'));await p.waitForTimeout(700);}},
  {name:'06-armurerie', go:async p=>{await p.evaluate(()=>showPage('page-reserve'));await p.waitForTimeout(700);}},
  {name:'07-magasin',   go:async p=>{await p.evaluate(()=>{goToMainMenu();if(typeof goToFace==='function')goToFace('magasin');
                                       else if(typeof renderMagasinPage==='function')renderMagasinPage();});
                                     await p.waitForTimeout(900);}},
  {name:'08-voie',      go:async p=>{await p.evaluate(()=>{renderVoiePage();showPage('page-voie');});await p.waitForTimeout(600);}},
  {name:'09-recompenses',go:async p=>{await p.evaluate(()=>{if(typeof renderRewardsPage==='function')renderRewardsPage();
                                       showPage('page-rewards');});await p.waitForTimeout(600);}},
  {name:'10-adversaires',go:async p=>{await p.evaluate(()=>{if(typeof renderAdversairesPage==='function')renderAdversairesPage();
                                       showPage('page-adversaires');});await p.waitForTimeout(600);}},
  {name:'11-builder',   go:async p=>{await p.evaluate(()=>{if(typeof openBuilderForPlayer==='function')openBuilderForPlayer();
                                       else showPage('page-builder');});await p.waitForTimeout(700);}},
  {name:'12-partie',    go:async p=>{await p.evaluate(()=>{
                                       const mon=PIECES.find(x=>x.class==='Monarque');
                                       const gen=PIECES.find(x=>x.class==='Général');
                                       const ex=PIECES.filter(x=>x.class!=='Monarque'&&x.class!=='Général').slice(0,3);
                                       const placements={};ex.forEach((p,i)=>placements[p.id]=[0,1,2][i]);
                                       currentArmyData={mon,gen,extras:ex.map(p=>p.id),placements};
                                       aiArmyData=generateAIArmy(20,{});
                                       showPage('page-game');startGame(false,false,null);});
                                     await p.waitForTimeout(3000);}},
  {name:'13-serie',     go:async p=>{await p.evaluate(()=>{goToMainMenu();});await p.waitForTimeout(600);
                                     await p.click('#jouer-streak').catch(()=>{});await p.waitForTimeout(500);}},
];

(async()=>{
  const only=process.argv[2];
  const sizes=only?SIZES.filter(s=>s.name===only):SIZES;
  if(!sizes.length){console.error('taille inconnue : '+only);process.exit(1);}
  fs.mkdirSync(OUT,{recursive:true});

  const server=serve();
  await new Promise(r=>server.listen(PORT,r));
  const exe=findChromium();
  const browser=await chromium.launch(exe?{executablePath:exe}:{});
  const problemes=[];

  for(const size of sizes){
    const ctx=await browser.newContext({viewport:{width:size.w,height:size.h},deviceScaleFactor:2});
    const page=await ctx.newPage();
    page.on('pageerror',e=>problemes.push(size.name+' · ERREUR JS · '+e.message));
    // Le mode test débloque tout : on veut voir les écrans PLEINS (tous les
    // coffres, toutes les créatures), c'est là que les débordements arrivent.
    await page.goto('http://localhost:'+PORT+'/?test',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#cube-jouer-btn',{state:'visible',timeout:15000});

    // Sauter le Lore, le tutoriel et le coffre du jour : ils couvrent tout.
    for(let i=0;i<6&&await page.isVisible('#lore-intro');i++){
      await page.click('#lore-next');await page.waitForTimeout(520);
    }
    // On coupe le tutoriel PAR LE CODE plutôt qu'en cliquant « Passer » : le
    // bouton ouvre une confirmation, et l'enchaînement des deux clics rate
    // une fois sur deux selon la taille de l'écran. Or un tutoriel resté
    // ouvert recouvre tous les écrans et rend la planche de captures
    // inutilisable.
    await page.evaluate(()=>{
      if(typeof tutoMarkDone==='function')tutoMarkDone();
      const r=document.getElementById('tuto-root');
      if(r){r.classList.remove('show');r.style.display='none';}
      document.body.classList.remove('tuto-open');
    });
    await page.waitForTimeout(400);
    if(await page.isVisible('#chest-modal.show')){
      await page.click('#chest-visual');
      for(let i=0;i<40&&await page.isVisible('#chest-modal.show');i++){
        await page.waitForTimeout(600);await page.click('#chest-visual');
      }
    }

    for(const sc of SCREENS){
      try{
        await sc.go(page);
        await page.screenshot({path:path.join(OUT,size.name+'_'+sc.name+'.png')});
        const found=await page.evaluate(AUDIT);
        found.forEach(f=>problemes.push(size.name+' · '+sc.name+' · '+f));
      }catch(e){
        problemes.push(size.name+' · '+sc.name+' · impossible d\'y arriver : '+e.message);
      }
    }
    await ctx.close();
  }

  await browser.close();server.close();

  // Un même défaut se répète sur les quatre tailles : on les regroupe pour
  // que la liste reste lisible.
  const compte=new Map();
  problemes.forEach(p=>{
    const [taille,...reste]=p.split(' · ');
    const cle=reste.join(' · ');
    if(!compte.has(cle))compte.set(cle,[]);
    compte.get(cle).push(taille);
  });
  console.log('\nCaptures dans '+OUT+'\n');
  if(!compte.size){console.log('Aucun défaut mesurable.\n');return;}
  console.log(compte.size+' défaut(s) mesurable(s) :\n');
  [...compte.entries()].forEach(([cle,tailles])=>{
    console.log('  · ['+[...new Set(tailles)].join(', ')+'] '+cle);
  });
  console.log('');
})().catch(e=>{console.error(e);process.exit(1);});
