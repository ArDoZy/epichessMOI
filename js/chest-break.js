// ================================================================
// CHEST-BREAK.JS : le coffre qu'on BRISE au lieu de l'ouvrir
// ================================================================
// Un coffre à couvercle s'ouvre d'un clic : le joueur regarde. Un coffre qui
// se fissure sous les coups DEMANDE quelque chose — quatre frappes, et à
// chaque frappe la pièce tient un peu moins. C'est la même récompense au
// bout, mais elle a été arrachée.
//
// La séquence n'est pas une vidéo : ce sont huit images fixes empilées, que
// l'on fait apparaître l'une par-dessus l'autre. Tout le mouvement est
// ajouté PAR-DESSUS, en CSS :
//
//   secousse    l'impact déplace et grossit brièvement la scène
//   flash       une gerbe de lumière au point de fracture
//   halo        une copie floutée de l'image, en fusion « screen », qui
//               respire : seules les fissures (les zones claires) brillent,
//               le fond noir n'ajoute rien. Le halo bat de plus en plus vite
//               à mesure que la pièce se fend
//   tremblement à partir de la troisième fissure, la pièce vibre en continu
//               entre deux frappes : elle annonce qu'elle va lâcher
//   éclats      des étincelles projetées depuis le centre
//
// Pourquoi empiler les images plutôt que les remplacer : chaque image
// contient tout ce qu'avait la précédente PLUS des fissures en trop. Comme
// elles sont opaques et cadrées à l'identique, il suffit de faire monter
// l'opacité de la nouvelle par-dessus la pile. Les fissures ont alors l'air
// de POUSSER, là où un remplacement les ferait clignoter — et il n'y a jamais
// de creux sombre au milieu du fondu, contrairement à un vrai fondu croisé.
//
// Le Pion et le Cavalier sont équipés. Les quatre autres gardent le
// couvercle dessiné en CSS (voir .chest dans css/style.css) : la cérémonie
// choisit toute seule, selon que le coffre a une séquence d'images
// utilisable ou non (chestBreakReady).
//
// Dépendances : rules-engine.js (playTone, facultatif — le son se tait tout
// seul s'il n'est pas là). Chargé AVANT economy-ui.js, qui s'en sert.
// ================================================================

// ----------------------------------------------------------------
// LES SÉQUENCES
// ----------------------------------------------------------------
// Une étape = une image + la manière d'y arriver. Ajouter un palier de
// fissures, c'est ajouter une image et une ligne ici, rien d'autre : ni le
// moteur ci-dessous ni la cérémonie ne comptent les étapes à l'avance.
//
//   src     nom du fichier, dans `dir`
//   hint    la phrase sous le titre pendant cette étape
//   fade    durée (ms) de la montée en opacité de l'image
//   shake   amplitude (px) de la secousse d'impact
//   zoom    grossissement au moment de l'impact
//   flash   opacité maximale de la gerbe de lumière (0 = aucune)
//   fdur    durée (ms) de cette gerbe
//   bloom   [repos, sommet] : opacité du halo qui respire
//   bt      période de cette respiration — elle raccourcit, la pièce panique
//   trem    amplitude (px) du tremblement continu entre deux frappes
//   sparks  nombre d'étincelles projetées
//   blast   l'image DÉFERLE : elle grandit et sa luminosité s'emballe
//   white   voile blanc plein écran, en ms : c'est lui qui fait le flash
//   full    la scène quitte sa boîte et prend l'écran. 'bleed' : elle déborde
//           de partout, sans découpe (l'explosion). 'boxed' : elle garde le
//           format de l'image et se centre, découpe comprise (le socle vide)
//   solo    n'affiche QUE cette image : les précédentes sont éteintes
//   snd     fréquences (Hz) empilées pour le bruit de fracture
//   hold    si présent, l'étape suivante s'enchaîne SEULE après ce délai (ms)
//   end     dernière étape : la cérémonie reprend la main (les lots)
//   dir     dossier de CETTE image, quand il n'est pas celui du coffre :
//           c'est ce qui permet aux trois dernières planches d'être
//           communes à tous les coffres (voir plus bas)
//
// Les étapes SANS `hold` attendent une frappe. Ici : 01→04 se frappent
// (quatre coups), puis 05 déclenche l'explosion, qui se déroule toute seule
// jusqu'à la scène vide. Pour rendre l'explosion manuelle elle aussi, il
// suffit de retirer les `hold` des étapes 05, 06 et 07.
//
// ----------------------------------------------------------------
// CINQ PLANCHES PAR PIÈCE, TROIS POUR TOUT LE MONDE
// ----------------------------------------------------------------
// Une pièce n'est reconnaissable que tant qu'elle tient debout : le pion se
// fissure en pion, le cavalier en cavalier. Passé l'éclatement, il ne reste
// que du feu et des éclats de marbre — plus rien qui dise de quelle pièce
// ils viennent. Ces trois planches-là (l'explosion, sa suite plein cadre, le
// socle vide) sont donc dessinées UNE FOIS, dans assets/chests/forall/, et
// partagées par tous les coffres. Équiper une nouvelle pièce ne demande plus
// que cinq images.
//
// Chaque coffre reçoit sa PROPRE copie des trois étapes communes
// (chestBreakTail construit des objets neufs) : le réglage du Fou pourra
// diverger de celui du Pion sans que l'un déforme l'autre, et le banc
// d'essai (tools/chest-break-preview.html) peut réécrire les `src` d'une
// séquence sans toucher aux autres.
const CHEST_BREAK_FORALL='assets/chests/forall/';

// LA FIN EST UN SEUL GESTE, et ses temps s'emboîtent au millième :
// 05 ne tient que 190 ms, juste de quoi voir la pièce partir en morceaux ;
// 06 la fait éclater au-dessus de son socle, encore dans la boîte, le temps
// d'un battement ; 07 déferle alors sur tout l'écran en montant en
// luminosité, pendant qu'un voile blanc monte par-dessus — au sommet du
// voile, l'écran est entièrement lumineux et ne montre plus rien ; c'est
// SOUS ce voile, à couvert, que l'explosion s'éteint et que le socle vide
// prend sa place. Le voile redescend, la luminosité revient à la normale, et
// le socle est là. Le flash ne cache pas une transition ratée : il EST la
// transition.
function chestBreakTail(){
  return [
    // L'ÉCLATEMENT. La pièce part en morceaux mais le socle est encore là,
    // et la scène tient encore dans son ovale : c'est le dernier plan où
    // l'on voit d'où vient l'explosion. Il ne dure qu'un battement.
    {src:'06-explosion.webp', hint:'', fade:90, dir:CHEST_BREAK_FORALL,
     shake:22, zoom:1.13, flash:.86, fdur:300, bloom:[.30,.72], bt:'.7s',
     sparks:44, sparkR:1.6, trem:2.2, hold:260, snd:[120,190,280]},

    // L'EXPLOSION. Elle sort de sa boîte : plein écran, en `cover` — une
    // déflagration n'a pas de composition à préserver, on peut la rogner
    // n'importe comment. La secousse est retirée ici, elle ne ferait que
    // découvrir du noir sur les bords ; c'est le grossissement et la
    // luminosité qui portent le coup.
    //
    // ELLE DOIT SE REGARDER. Première version : le voile blanc montait dès
    // la première image, et la planche d'explosion était mangée par le
    // flash avant d'avoir été vue — on payait une image pour ne jamais
    // l'afficher. Elle arrive maintenant plein écran en 200 ms, puis TIENT
    // nue pendant une demi-seconde, à luminosité presque normale : le temps
    // de voir la matière en fusion. Ce n'est qu'ensuite que ça s'emballe.
    {src:'07-explosion-suite.webp', hint:'', fade:70, dir:CHEST_BREAK_FORALL,
     full:'bleed', blast:true, bldur:1150, white:1500, flash:.9, fdur:520,
     sparks:54, sparkR:3.2, hold:1050,
     snd:[90,140,200,300,440]},

    // LE SOCLE VIDE. En `boxed` : ici le cadrage compte, le socle doit
    // rester entier sur un téléphone comme sur un écran large. `solo`
    // éteint les sept images du dessous — sans quoi l'explosion continuerait
    // de brûler derrière, à travers l'ovale de découpe.
    {src:'08-vide.webp', hint:'', fade:380, dir:CHEST_BREAK_FORALL,
     full:'boxed', solo:true, trem:0, hold:620, end:true},
  ];
}

// Les cinq planches propres à une pièce. Le rythme est le même d'un coffre à
// l'autre — c'est la même destruction, seule la statuette change — donc une
// seule fabrique, à qui l'on donne le dossier et le nom de la pièce (celui
// qui apparaît dans la première phrase, « Frappez le cavalier… »).
function chestBreakSeq(dir,piece){
  return {
    dir:dir,
    stages:[
      {src:'01-intact.webp',   hint:'Frappez '+piece+' pour le briser', fade:260},

      {src:'02-fissure.webp',  hint:'Encore',            fade:210, shake:7,  zoom:1.045,
       flash:.42, fdur:280, bloom:[.10,.26], bt:'3.2s', sparks:8,  snd:[210,320]},

      {src:'03-fissures.webp', hint:'Encore',            fade:190, shake:10, zoom:1.06,
       flash:.55, fdur:300, bloom:[.16,.40], bt:'2.3s', sparks:14, trem:.4, snd:[250,380]},

      {src:'04-brisures.webp', hint:'Il ne tient plus…', fade:170, shake:14, zoom:1.075,
       flash:.68, fdur:320, bloom:[.24,.62], bt:'1.4s', sparks:22, trem:1,  snd:[300,460]},

      // À partir d'ici la pièce ne tient plus : plus une seule frappe à
      // donner, la destruction s'enchaîne d'elle-même jusqu'au socle vide.
      {src:'05-eclats.webp',   hint:'',                  fade:120, shake:20, zoom:1.11,
       flash:.80, fdur:300, bloom:[.35,.80], bt:'.9s',  sparks:34, trem:1.8,
       hold:190, snd:[150,240,360]},
    ].concat(chestBreakTail()),
    // Format des planches (largeur/hauteur). Il donne à la scène `boxed` les
    // proportions exactes de l'image, pour que l'ovale de découpe tombe
    // pile sur ses bords.
    ratio:2/3,
  };
}

const CHEST_BREAK={
  pion:    chestBreakSeq('assets/chests/pion/',    'le pion'),
  cavalier:chestBreakSeq('assets/chests/cavalier/','le cavalier'),
};

function chestBreakFor(chestId){
  return (chestId&&CHEST_BREAK[chestId])||null;
}
function pbSrc(cfg,i){
  const st=cfg.stages[i],s=st.src;
  // Une source absolue (data:, blob:, http…) court-circuite le dossier : la
  // page de réglage tools/chest-break-preview.html injecte ainsi les images
  // que l'on vient de déposer, sans rien copier dans le dépôt.
  if(/^(data:|blob:|https?:|\/)/.test(s))return s;
  // `dir` d'étape avant `dir` de coffre : les trois dernières planches sont
  // communes à tous les coffres et vivent ailleurs (CHEST_BREAK_FORALL).
  return (st.dir||cfg.dir)+s;
}

// ----------------------------------------------------------------
// CHARGEMENT DES IMAGES
// ----------------------------------------------------------------
// Une planche d'explosion qui arrive en retard, c'est un écran noir au pire
// moment. On charge donc tout dès le démarrage, en tâche de fond, et la
// cérémonie ne propose la séquence que si la PREMIÈRE image est là : les
// suivantes ont tout le temps d'arriver, il y a une frappe humaine entre
// chacune.
const _pbLoad={};
function pbLoad(src){
  let e=_pbLoad[src];
  if(e)return e;
  e=_pbLoad[src]={ok:false,fail:false,waiting:[]};
  const img=new Image();
  img.decoding='async';
  const settle=ok=>{
    e[ok?'ok':'fail']=true;
    e.waiting.splice(0).forEach(fn=>fn(ok));
  };
  img.onload=()=>settle(true);
  img.onerror=()=>settle(false);
  img.src=src;
  e.img=img;
  return e;
}

// Attend qu'une image soit disponible, mais JAMAIS plus de `wait` ms : sur un
// réseau lent, mieux vaut enchaîner sur une image encore absente — l'image du
// dessous, opaque, reste affichée en attendant — que de figer la cérémonie
// sur une frappe qui n'a rien donné.
function pbWhenReady(src,cb,wait){
  const e=pbLoad(src);
  if(e.ok||e.fail)return cb(e.ok);
  let done=false;
  const fire=ok=>{if(done)return;done=true;cb(ok);};
  e.waiting.push(fire);
  setTimeout(()=>fire(e.ok),wait||1400);
}

// La PREMIÈRE image sert de sonde : si elle manque, le dossier n'a pas été
// rempli et les quatre autres manquent aussi. Inutile d'aller chercher quatre
// 404 de plus — la cérémonie retombera de toute façon sur le couvercle.
function chestBreakPreload(){
  Object.keys(CHEST_BREAK).forEach(id=>{
    const cfg=CHEST_BREAK[id];
    pbWhenReady(pbSrc(cfg,0),ok=>{
      if(ok)cfg.stages.forEach((s,i)=>i&&pbLoad(pbSrc(cfg,i)));
    },20000);
  });
}

// La séquence est-elle utilisable MAINTENANT ? Non si le coffre n'en a pas,
// non si les images ne sont pas dans le dépôt (404) : dans les deux cas la
// cérémonie retombe sur le coffre à couvercle, et le jeu reste jouable même
// si le dossier assets/chests/ est vide.
// L'AFFICHE d'un coffre : sa première planche, la statuette intacte. Le
// Magasin s'en sert pour montrer la pièce plutôt que le coffre à couvercle
// dessiné en CSS (magasinChestVisual, js/economy-ui.js). Rend '' pour un
// coffre sans séquence — l'appelant retombe alors sur le couvercle.
function chestBreakPoster(chestId){
  const cfg=chestBreakFor(chestId);
  return cfg?pbSrc(cfg,0):'';
}

function chestBreakReady(chestId){
  const cfg=chestBreakFor(chestId);
  if(!cfg)return false;
  return pbLoad(pbSrc(cfg,0)).ok===true;
}

// Le jeu doit rester agréable quand le système demande moins d'animation :
// on garde les fondus et la lumière, on retire tout ce qui bouge.
function pbCalm(){
  return window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
}

// Relance une animation CSS déjà jouée : retirer la classe ne suffit pas, le
// navigateur regroupe les deux changements dans la même image. Lire une
// propriété de disposition force la césure entre les deux.
function pbRestart(el,cls){
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ----------------------------------------------------------------
// LE SON DE LA FRACTURE
// ----------------------------------------------------------------
// playTone (js/rules-engine.js) ne sait produire qu'une note tenue : une
// seule ne fait pas un craquement. On en empile donc trois à quelques
// millisecondes d'intervalle, en dents de scie et en descente rapide — c'est
// la brièveté et l'empilement qui font entendre de la pierre qui cède.
function pbSound(freqs){
  if(typeof playTone!=='function'||!freqs)return;
  freqs.forEach((f,i)=>setTimeout(()=>{
    playTone(f,'sawtooth',0.05+i*0.015,0.30,true);
    playTone(f*1.98,'square',0.03,0.10,true);
  },i*26));
}

// ----------------------------------------------------------------
// LE MOTEUR
// ----------------------------------------------------------------
// chestBreakMount installe la scène et rend une télécommande :
//   next()   passe à l'étape suivante (une frappe)
//   busy()   une étape est en cours : la frappe suivante est ignorée, sinon
//            un joueur qui martèle traverserait toute la séquence sans rien
//            voir
//   destroy() vide la scène à la fermeture de la cérémonie
// onDone est appelé une fois le socle vide : la cérémonie reprend alors la
// main et révèle les lots.
function chestBreakMount(chestId,onDone){
  const cfg=chestBreakFor(chestId);
  const host=document.getElementById('chest-break');
  if(!cfg||!host)return null;

  const calm=pbCalm();
  host.innerHTML=
    '<div class="pb-shake"><div class="pb-trem"><div class="pb-scene">'+
      cfg.stages.map((s,i)=>'<img class="pb-frame" alt="" draggable="false" src="'+pbSrc(cfg,i)+'">').join('')+
      '<div class="pb-bloom"></div>'+
    '</div></div></div>'+
    '<div class="pb-flash"></div><div class="pb-sparks"></div>'+
    '<div class="pb-white"></div>';
  host.className='pbreak';
  host.hidden=false;

  const shake=host.querySelector('.pb-shake'),
        trem =host.querySelector('.pb-trem'),
        scene=host.querySelector('.pb-scene'),
        bloom=host.querySelector('.pb-bloom'),
        flash=host.querySelector('.pb-flash'),
        white=host.querySelector('.pb-white'),
        sparkBox=host.querySelector('.pb-sparks'),
        frames=[].slice.call(host.querySelectorAll('.pb-frame'));

  const ctl={i:-1,_busy:true,_timer:null,_dead:false};
  ctl.busy=()=>ctl._busy;

  // Mode `boxed` : la scène reprend le format de l'image, aussi grande que
  // l'écran le permet, et se centre. CSS seul n'y arrive pas — `aspect-ratio`
  // avec une hauteur imposée ET une largeur plafonnée casse le rapport dans
  // un sens ou dans l'autre selon l'écran. Deux lignes de calcul le font
  // exactement, et le rendez-vous avec l'ovale de découpe est garanti.
  function fitBox(){
    if(!host.classList.contains('pb-boxed'))return;
    const ar=cfg.ratio||2/3,vw=innerWidth,vh=innerHeight;
    let w=vh*ar,h=vh;
    if(w>vw){w=vw;h=vw/ar;}
    scene.style.width=w+'px';
    scene.style.height=h+'px';
  }
  window.addEventListener('resize',fitBox);

  // Les étincelles sont créées à la volée puis se retirent elles-mêmes : une
  // explosion en projette une cinquantaine, les garder dans le document
  // alourdirait la scène pour rien.
  function sparks(n,radius){
    if(calm||!n)return;
    for(let k=0;k<n;k++){
      const a=Math.random()*Math.PI*2,
            d=(40+Math.random()*150)*(radius||1),
            sp=document.createElement('span');
      sp.className='pb-spark';
      sp.style.setProperty('--dx',(Math.cos(a)*d).toFixed(1)+'px');
      sp.style.setProperty('--dy',(Math.sin(a)*d).toFixed(1)+'px');
      sp.style.setProperty('--s',(2+Math.random()*4).toFixed(1)+'px');
      sp.style.setProperty('--d',(420+Math.random()*520).toFixed(0)+'ms');
      sp.addEventListener('animationend',()=>sp.remove());
      sparkBox.appendChild(sp);
    }
  }

  function go(i){
    if(ctl._dead)return;
    const st=cfg.stages[i];
    if(!st)return;
    ctl.i=i;ctl._busy=true;

    pbWhenReady(pbSrc(cfg,i),()=>{
      if(ctl._dead)return;

      // LA SCÈNE QUITTE SA BOÎTE. À l'explosion, l'ovale et les 320 px de
      // large sautent : l'image passe en position fixe sur tout l'écran. Le
      // titre et la phrase s'effacent d'eux-mêmes (règle de voisinage
      // `.pbreak.pb-full ~ …` dans css/style.css), donc le passage hors flux
      // ne fait sauter aucun texte.
      if(st.full){
        host.classList.add('pb-full');
        host.classList.toggle('pb-bleed',st.full==='bleed');
        host.classList.toggle('pb-boxed',st.full==='boxed');
        fitBox();
      }

      // L'image monte par-dessus la pile ; celles du dessous restent en
      // place, cachées derrière, et rien ne clignote. Sauf `solo` : la
      // dernière image est seule en scène, on éteint tout le reste.
      const f=frames[i];
      f.style.setProperty('--pb-fade',(st.fade||240)+'ms');
      if(st.solo)frames.forEach(o=>{if(o!==f)o.classList.remove('on');});
      f.classList.add('on');

      // L'EMBALLEMENT. `blast` fait grandir l'image et monte sa luminosité
      // jusqu'à la brûlure ; le voile blanc monte par-dessus et finit le
      // travail. Retirer la classe à l'étape suivante rend sa luminosité
      // normale à la scène — sous le voile, donc invisiblement.
      scene.classList.toggle('blast',!!st.blast);
      if(st.blast){
        host.style.setProperty('--pb-bldur',(st.bldur||440)+'ms');
        pbRestart(scene,'blast');
      }
      if(st.white){
        host.style.setProperty('--pb-wdur',st.white+'ms');
        pbRestart(white,'go');
      }

      // Le halo suit l'image affichée : même cadrage, mais flouté et fondu
      // en « screen », donc seules les fissures brillent.
      bloom.style.backgroundImage='url("'+pbSrc(cfg,i)+'")';
      const b=st.bloom||[0,0];
      host.style.setProperty('--pb-b0',b[0]);
      host.style.setProperty('--pb-b1',b[1]);
      host.style.setProperty('--pb-bt',st.bt||'2.6s');

      // Le tremblement continu s'installe et ne repart plus tant que la
      // pièce est là : fendue jusqu'au cœur, elle ne redevient pas calme
      // entre deux coups. `trem:0` l'arrête — le socle vide, lui, ne vibre
      // pas : il n'y a plus rien dessus pour trembler.
      if(st.trem===0)trem.classList.remove('live');
      else if(st.trem&&!calm){
        trem.style.setProperty('--pb-trem',st.trem+'px');
        trem.classList.add('live');
      }

      if(!calm&&st.shake){
        host.style.setProperty('--pb-amp',st.shake+'px');
        host.style.setProperty('--pb-zoom',st.zoom||1.05);
        pbRestart(shake,'go');
      }
      if(st.flash){
        host.style.setProperty('--pb-fmax',calm?Math.min(st.flash,.45):st.flash);
        host.style.setProperty('--pb-fdur',(st.fdur||300)+'ms');
        flash.classList.toggle('big',!!st.blast);
        pbRestart(flash,'go');
      }
      sparks(st.sparks,st.sparkR);
      pbSound(st.snd);

      const hint=document.getElementById('chest-hint');
      if(hint&&st.hint!==undefined)hint.textContent=st.hint;

      // Une étape à `hold` enchaîne seule sur la suivante ; sans `hold`, la
      // main revient au joueur dès que l'impact est retombé.
      if(st.end){
        host.classList.add('pb-done');
        ctl._timer=setTimeout(()=>{ctl._busy=false;if(onDone)onDone();},st.hold||400);
      }else if(st.hold!==undefined){
        ctl._timer=setTimeout(()=>go(i+1),st.hold);
      }else{
        ctl._timer=setTimeout(()=>{ctl._busy=false;},Math.max(160,(st.fdur||0)*.55));
      }
    });
  }

  ctl.next=function(){
    if(ctl._busy||ctl._dead)return;
    if(ctl.i+1<cfg.stages.length)go(ctl.i+1);
  };
  ctl.destroy=function(){
    ctl._dead=true;
    clearTimeout(ctl._timer);
    window.removeEventListener('resize',fitBox);
    host.hidden=true;
    host.innerHTML='';
    host.className='pbreak';
  };

  // La première image s'installe sans impact : c'est l'état de départ, la
  // pièce intacte, pas encore un coup reçu.
  go(0);
  ctl._timer=setTimeout(()=>{ctl._busy=false;},120);
  return ctl;
}

// Le chargement démarre avec le jeu, à l'écart du premier rendu : au moment
// où un coffre équipé tombe, ses huit planches sont dans le cache depuis
// longtemps — et les trois planches communes n'ont été téléchargées qu'une
// fois pour tous les coffres, pbLoad les mettant en cache par URL.
(function(){
  const start=()=>window.requestIdleCallback
    ?requestIdleCallback(chestBreakPreload,{timeout:2000})
    :setTimeout(chestBreakPreload,600);
  if(document.readyState==='complete')start();
  else window.addEventListener('load',start);
})();
