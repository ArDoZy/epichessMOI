// ================================================================
// CHEST-BREAK.JS : le coffre qu'on BRISE au lieu de l'ouvrir
// ================================================================
// Un coffre à couvercle s'ouvre d'un clic : le joueur regarde. Un coffre qui
// se fissure sous les coups DEMANDE quelque chose — quatre frappes, et à
// chaque frappe la pièce tient un peu moins. C'est la même récompense au
// bout, mais elle a été arrachée.
//
// La séquence n'est pas une vidéo : ce sont sept images fixes empilées, que
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
//   onde        un anneau de choc, à l'explosion seulement
//
// Pourquoi empiler les images plutôt que les remplacer : chaque image
// contient tout ce qu'avait la précédente PLUS des fissures en trop. Comme
// elles sont opaques et cadrées à l'identique, il suffit de faire monter
// l'opacité de la nouvelle par-dessus la pile. Les fissures ont alors l'air
// de POUSSER, là où un remplacement les ferait clignoter — et il n'y a jamais
// de creux sombre au milieu du fondu, contrairement à un vrai fondu croisé.
//
// Le pion est le seul coffre équipé pour l'instant. Les cinq autres gardent
// le couvercle dessiné en CSS (voir .chest dans css/style.css) : la
// cérémonie choisit toute seule, selon que le coffre a une séquence d'images
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
//   ring    onde de choc circulaire
//   blast   gerbe plein écran (l'explosion, pas un simple impact)
//   snd     fréquences (Hz) empilées pour le bruit de fracture
//   hold    si présent, l'étape suivante s'enchaîne SEULE après ce délai (ms)
//   end     dernière étape : la cérémonie reprend la main (les lots)
//
// Les étapes SANS `hold` attendent une frappe. Ici : 01→04 se frappent
// (quatre coups), puis 05 déclenche l'explosion, qui se déroule toute seule
// jusqu'à la scène vide. Pour rendre l'explosion manuelle elle aussi, il
// suffit de retirer les `hold` des étapes 05 et 06.
const CHEST_BREAK={
  pion:{
    dir:'assets/chests/pion/',
    stages:[
      {src:'01-intact.png',   hint:'Frappez le pion pour le briser', fade:260},

      {src:'02-fissure.png',  hint:'Encore',            fade:210, shake:7,  zoom:1.045,
       flash:.42, fdur:280, bloom:[.10,.26], bt:'3.2s', sparks:8,  snd:[210,320]},

      {src:'03-fissures.png', hint:'Encore',            fade:190, shake:10, zoom:1.06,
       flash:.55, fdur:300, bloom:[.16,.40], bt:'2.3s', sparks:14, trem:.4, snd:[250,380]},

      {src:'04-brisures.png', hint:'Il ne tient plus…', fade:170, shake:14, zoom:1.075,
       flash:.68, fdur:320, bloom:[.24,.62], bt:'1.4s', sparks:22, trem:1,  snd:[300,460]},

      // À partir d'ici la pièce ne tient plus : plus une seule frappe à
      // donner, la destruction s'enchaîne d'elle-même jusqu'au socle vide.
      {src:'05-eclats.png',   hint:'',                  fade:130, shake:20, zoom:1.11,
       flash:.80, fdur:340, bloom:[.35,.80], bt:'.9s',  sparks:34, trem:1.8,
       ring:true, hold:420, snd:[150,240,360]},

      {src:'06-explosion.png',hint:'',                  fade:90,  shake:26, zoom:1.20,
       flash:.96, fdur:540, sparks:48, ring:true, blast:true, hold:560,
       snd:[90,140,200,300,440]},

      // Le socle vide reparaît lentement — c'est la respiration après le
      // fracas, et le décor sur lequel les lots vont s'afficher.
      {src:'07-vide.png',     hint:'',                  fade:820, hold:520, end:true},
    ],
  },
};

function chestBreakFor(chestId){
  return (chestId&&CHEST_BREAK[chestId])||null;
}
function pbSrc(cfg,i){
  const s=cfg.stages[i].src;
  // Une source absolue (data:, blob:, http…) court-circuite le dossier : la
  // page de réglage tools/chest-break-preview.html injecte ainsi les images
  // que l'on vient de déposer, sans rien copier dans le dépôt.
  return /^(data:|blob:|https?:|\/)/.test(s)?s:cfg.dir+s;
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
// rempli et les six autres manquent aussi. Inutile d'aller chercher six 404
// de plus — la cérémonie retombera de toute façon sur le couvercle.
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
    '<div class="pb-flash"></div><div class="pb-ring"></div><div class="pb-sparks"></div>';
  host.className='pbreak';
  host.hidden=false;

  const shake=host.querySelector('.pb-shake'),
        trem =host.querySelector('.pb-trem'),
        bloom=host.querySelector('.pb-bloom'),
        flash=host.querySelector('.pb-flash'),
        ring =host.querySelector('.pb-ring'),
        sparkBox=host.querySelector('.pb-sparks'),
        frames=[].slice.call(host.querySelectorAll('.pb-frame'));

  const ctl={i:-1,_busy:true,_timer:null,_dead:false};
  ctl.busy=()=>ctl._busy;

  // Les étincelles sont créées à la volée puis se retirent elles-mêmes : une
  // explosion en projette une cinquantaine, les garder dans le document
  // alourdirait la scène pour rien.
  function sparks(n){
    if(calm||!n)return;
    for(let k=0;k<n;k++){
      const a=Math.random()*Math.PI*2,
            d=40+Math.random()*150,
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

      // L'image monte par-dessus la pile ; celles du dessous restent en
      // place, cachées derrière, et rien ne clignote.
      const f=frames[i];
      f.style.setProperty('--pb-fade',(st.fade||240)+'ms');
      f.classList.add('on');

      // Le halo suit l'image affichée : même cadrage, mais flouté et fondu
      // en « screen », donc seules les fissures brillent.
      bloom.style.backgroundImage='url("'+pbSrc(cfg,i)+'")';
      const b=st.bloom||[0,0];
      host.style.setProperty('--pb-b0',b[0]);
      host.style.setProperty('--pb-b1',b[1]);
      host.style.setProperty('--pb-bt',st.bt||'2.6s');

      // Le tremblement continu s'installe et ne repart plus : une pièce
      // fendue jusqu'au cœur ne redevient pas calme entre deux coups.
      if(st.trem&&!calm){
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
      if(st.ring&&!calm)pbRestart(ring,'go');
      sparks(st.sparks);
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
// où un coffre Pion tombe, les sept images sont dans le cache depuis
// longtemps.
(function(){
  const start=()=>window.requestIdleCallback
    ?requestIdleCallback(chestBreakPreload,{timeout:2000})
    :setTimeout(chestBreakPreload,600);
  if(document.readyState==='complete')start();
  else window.addEventListener('load',start);
})();
