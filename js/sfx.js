// ================================================================
// SFX.JS : le moteur de bruitages et le retour haptique
// ================================================================
// AVANT, CHAQUE SON DU JEU ÉTAIT UN BIP. Un déplacement, c'était une
// sinusoïde à 440 Hz pendant 70 ms ; une capture, deux dents de scie ; une
// promotion, cinq sinusoïdes en arpège. Un oscillateur nu ne ressemble à
// rien de physique : il n'a pas d'attaque, pas de corps, pas de queue, et il
// sonne EXACTEMENT pareil aux dix premières captures qu'à la centième. C'est
// le plus grand écart perceptif entre ce jeu et une production de studio, et
// il s'entend en dix secondes.
//
// -- CE QUE FAIT CE FICHIER ----------------------------------------------
// Un vrai son court se fabrique en EMPILANT DES COUCHES, et c'est ce que
// fait sfxPlay() :
//
//   · une ATTAQUE — le transitoire, presque toujours du bruit filtré : c'est
//     lui qui donne l'impression de matière (bois, pierre, métal) ;
//   · un CORPS — une ou deux voix accordées qui portent la hauteur, avec une
//     enveloppe ADSR réelle plutôt qu'une coupure sèche ;
//   · une QUEUE — la résonance qui s'éteint, celle qu'on n'écoute pas mais
//     dont l'absence s'entend.
//
// Trois principes s'y ajoutent, et ce sont eux qui font la différence :
//
//   1. VARIATION. Chaque déclenchement décale légèrement la hauteur (±3 %
//      par défaut) et le volume. Dix captures d'affilée ne sonnent donc
//      jamais identiques — c'est LE détail qui sépare un jeu qui « bipe »
//      d'un jeu qui « répond ».
//   2. INTENSITÉ. Un même son se joue à plusieurs forces : prendre un pion
//      et prendre le Grand Maître ne peuvent pas produire le même bruit.
//      sfxPlay(nom, {force:0..1}) déplace le volume, la hauteur et la
//      brillance ensemble, comme le ferait un vrai impact.
//   3. DUCKING. Un événement fort baisse la musique de combat pendant
//      200 ms et la ramène : sans ça, la couche musicale mange l'impact.
//
// -- L'HAPTIQUE ----------------------------------------------------------
// Le jeu ne faisait vibrer le téléphone NULLE PART. Sur un jeu pensé
// téléphone d'abord, c'est la moitié de la sensation qui manque : une
// capture qui ne fait rien vibrer ne pèse rien. haptic() ajoute cinq motifs,
// pas un de plus — au-delà, la vibration devient du bruit et le joueur coupe
// tout.
// iOS ignore navigator.vibrate : voir HAPTIC_FALLBACK_CLASS plus bas, un
// tremblement visuel prend le relais pour que l'événement reste ressenti.
//
// -- POURQUOI DE LA SYNTHÈSE ET PAS DES ÉCHANTILLONS ----------------------
// Des samples enregistrés sonneraient mieux, et c'est la suite du chemin.
// Mais ils pèsent, il faut les produire, et le moteur ci-dessous est
// justement ce qui permettra de les brancher sans rien réécrire ailleurs :
// tout le jeu appelle playSound('capture'), et c'est SFX_RECIPES qui décide
// de ce que ça produit. Le jour où un fichier existe, la recette porte un
// `sample` et le reste du jeu ne bouge pas d'une ligne.
//
// Dépendances : rules-engine.js (getAudioCtx, _soundEnabled, _sfxVol — le
// volume vient du curseur des réglages), combat-music.js (window._musicGain,
// pour le ducking).
// Utilisé par : rules-engine.js (playSound y délègue), et donc tout le jeu.
//
// Pour ajouter un son : une entrée dans SFX_RECIPES, rien d'autre.
// ================================================================

// ----------------------------------------------------------------
// LE BUS : un seul nœud de sortie pour tous les bruitages
// ----------------------------------------------------------------
// Tout passe par lui, ce qui permettra un jour de compresser ou de limiter
// l'ensemble d'un geste. Il est créé à la demande : un AudioContext créé
// avant le premier geste de l'utilisateur naît suspendu sur la plupart des
// navigateurs.
let _sfxBus=null;
function sfxBus(){
  const ctx=(typeof getAudioCtx==='function')?getAudioCtx():null;
  if(!ctx)return null;
  if(!_sfxBus||_sfxBus.context!==ctx){
    _sfxBus=ctx.createGain();
    _sfxBus.gain.value=1;
    _sfxBus.connect(ctx.destination);
  }
  return _sfxBus;
}

// Bruit blanc, fabriqué une seule fois et réutilisé. C'est la brique de
// toutes les attaques : un impact sans bruit sonne comme un synthétiseur.
let _sfxNoiseBuffer=null;
function sfxNoise(ctx){
  if(_sfxNoiseBuffer&&_sfxNoiseBuffer.sampleRate===ctx.sampleRate)return _sfxNoiseBuffer;
  const len=Math.floor(ctx.sampleRate*0.5);
  const buf=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  _sfxNoiseBuffer=buf;
  return buf;
}

// ----------------------------------------------------------------
// UNE COUCHE
// ----------------------------------------------------------------
// {type:'tone'|'noise', freq, freq2, wave, delay, attack, decay, hold,
//  gain, filter:{type,freq,q}, bend}
//
//   freq/freq2 : hauteur de départ et d'arrivée (glissando si freq2 diffère)
//   attack     : montée, en secondes. À 0 le son claque, ce qui est
//                exactement ce qu'on veut sur un impact et jamais sur une
//                nappe.
//   hold/decay : plateau puis extinction exponentielle.
//   filter     : indispensable sur le bruit — du bruit blanc non filtré est
//                un « pschh » de radio, filtré c'est du bois ou de la pierre.
function sfxLayer(ctx,dest,L,t0,force,pitchMul,volMul){
  const gain=ctx.createGain();
  let node;

  if(L.type==='noise'){
    node=ctx.createBufferSource();
    node.buffer=sfxNoise(ctx);
    // La hauteur d'un bruit se règle par sa vitesse de lecture : c'est ce qui
    // fait qu'un même bruit sert d'impact grave ou de claquement aigu.
    node.playbackRate.value=(L.rate||1)*pitchMul;
  }else{
    node=ctx.createOscillator();
    node.type=L.wave||'sine';
    const f=(L.freq||440)*pitchMul;
    node.frequency.setValueAtTime(f,t0);
    if(L.freq2){
      // Un glissando descendant est ce qui donne à un impact sa sensation de
      // masse ; montant, il donne l'élan (promotion, montée de rang).
      node.frequency.exponentialRampToValueAtTime(
        Math.max(20,L.freq2*pitchMul),t0+(L.bend||L.decay||0.1));
    }
  }

  let tail=node;
  if(L.filter){
    const flt=ctx.createBiquadFilter();
    flt.type=L.filter.type||'lowpass';
    // La brillance suit la force : un impact fort ouvre le filtre. C'est le
    // même geste qu'un vrai objet frappé plus fort.
    flt.frequency.value=L.filter.freq*(0.75+0.5*force);
    if(L.filter.q)flt.Q.value=L.filter.q;
    tail.connect(flt);tail=flt;
  }
  tail.connect(gain);
  gain.connect(dest);

  // ENVELOPPE. setValueAtTime + rampes plutôt qu'un simple stop() : une
  // coupure nette produit un clic audible, et c'est précisément ce qui fait
  // qu'un son synthétisé sonne « pas fini ».
  const peak=Math.max(0.0001,(L.gain||0.3)*volMul);
  const atk=L.attack||0.002, hold=L.hold||0, dec=L.decay||0.12;
  const start=t0+(L.delay||0);
  gain.gain.setValueAtTime(0.0001,start);
  gain.gain.linearRampToValueAtTime(peak,start+atk);
  if(hold)gain.gain.setValueAtTime(peak,start+atk+hold);
  gain.gain.exponentialRampToValueAtTime(0.0001,start+atk+hold+dec);

  node.start(start);
  node.stop(start+atk+hold+dec+0.02);
  return start+atk+hold+dec;
}

// ----------------------------------------------------------------
// LES RECETTES
// ----------------------------------------------------------------
// Chaque son est une liste de couches, plus deux réglages :
//   vary  : amplitude de la variation aléatoire de hauteur (0.03 = ±3 %)
//   duck  : de combien baisser la musique pendant l'événement (0 = pas du
//           tout). Réservé aux moments forts : tout ducker revient à ne
//           rien ducker.
const SFX_RECIPES={
  // Poser une pièce : un contact mat, court, sans hauteur marquée. C'est le
  // son qu'on entendra dix mille fois — il doit être DISCRET. Un son de
  // déplacement qui se remarque devient insupportable au bout d'une partie.
  move:{vary:0.05,layers:[
    {type:'noise',rate:1.4,gain:0.20,attack:0.001,decay:0.045,filter:{type:'bandpass',freq:1700,q:1.1}},
    {type:'tone',wave:'triangle',freq:210,freq2:150,gain:0.13,attack:0.001,decay:0.07,bend:0.05},
  ]},

  // Prendre une pièce. Trois couches : le choc (bruit large), le corps qui
  // descend (la masse), et une queue basse (la résonance). L'intensité est
  // pilotée par la valeur de la pièce prise — voir sfxCaptureForce().
  capture:{vary:0.045,duck:0.45,layers:[
    {type:'noise',rate:0.9,gain:0.42,attack:0.0005,decay:0.085,filter:{type:'lowpass',freq:3200}},
    {type:'tone',wave:'sawtooth',freq:190,freq2:70,gain:0.30,attack:0.001,decay:0.16,bend:0.09},
    {type:'tone',wave:'sine',freq:88,freq2:52,gain:0.24,attack:0.004,decay:0.26,bend:0.2,delay:0.012},
  ]},

  // Échec au roi : une alerte, deux notes montantes, timbre serré. Elle doit
  // se distinguer d'une capture même sans regarder l'écran.
  check:{vary:0.02,duck:0.35,layers:[
    {type:'tone',wave:'square',freq:740,gain:0.16,attack:0.002,hold:0.03,decay:0.07,filter:{type:'lowpass',freq:2600}},
    {type:'tone',wave:'square',freq:1108,gain:0.15,attack:0.002,hold:0.03,decay:0.10,delay:0.085,filter:{type:'lowpass',freq:3000}},
    {type:'tone',wave:'sine',freq:370,gain:0.12,attack:0.004,decay:0.22},
  ]},

  // Roque : deux contacts rapprochés, puisque deux pièces bougent. Le son
  // RACONTE le coup, c'est sa seule raison d'exister à part.
  castle:{vary:0.04,layers:[
    {type:'noise',rate:1.5,gain:0.18,attack:0.001,decay:0.04,filter:{type:'bandpass',freq:1900,q:1.2}},
    {type:'tone',wave:'triangle',freq:240,freq2:180,gain:0.12,attack:0.001,decay:0.06,bend:0.045},
    {type:'noise',rate:1.3,gain:0.20,attack:0.001,decay:0.05,delay:0.10,filter:{type:'bandpass',freq:1500,q:1.1}},
    {type:'tone',wave:'triangle',freq:180,freq2:135,gain:0.14,attack:0.001,decay:0.08,bend:0.06,delay:0.10},
  ]},

  // Promotion : une créature naît. Montée franche, timbre clair, queue
  // longue — c'est une petite cérémonie, elle a le droit de durer.
  promo:{vary:0.015,duck:0.5,layers:[
    {type:'tone',wave:'triangle',freq:392,freq2:784,gain:0.16,attack:0.006,decay:0.22,bend:0.18},
    {type:'tone',wave:'sine',freq:587,gain:0.14,attack:0.01,hold:0.04,decay:0.3,delay:0.09},
    {type:'tone',wave:'sine',freq:880,gain:0.13,attack:0.01,hold:0.05,decay:0.42,delay:0.18},
    {type:'noise',rate:2.2,gain:0.10,attack:0.02,decay:0.5,delay:0.09,filter:{type:'highpass',freq:2600}},
  ]},

  // Victoire : quatre degrés montants, large, avec une queue qui laisse la
  // place à la suite (le coffre s'ouvre juste après).
  win:{vary:0.01,duck:0.7,layers:[
    {type:'tone',wave:'triangle',freq:523,gain:0.17,attack:0.008,hold:0.05,decay:0.26},
    {type:'tone',wave:'triangle',freq:659,gain:0.17,attack:0.008,hold:0.05,decay:0.26,delay:0.13},
    {type:'tone',wave:'triangle',freq:784,gain:0.17,attack:0.008,hold:0.05,decay:0.3,delay:0.26},
    {type:'tone',wave:'sine',freq:1047,gain:0.19,attack:0.012,hold:0.10,decay:0.6,delay:0.39},
    {type:'tone',wave:'sine',freq:262,gain:0.13,attack:0.02,hold:0.3,decay:0.7},
  ]},

  // Défaite : la même figure à l'envers, plus sombre, plus lente. Elle ne
  // doit PAS être longue : on n'humilie pas le joueur, on tourne la page.
  loss:{vary:0.01,duck:0.7,layers:[
    {type:'tone',wave:'triangle',freq:392,freq2:370,gain:0.16,attack:0.01,hold:0.06,decay:0.28,bend:0.3},
    {type:'tone',wave:'triangle',freq:311,gain:0.16,attack:0.01,hold:0.06,decay:0.3,delay:0.15},
    {type:'tone',wave:'sine',freq:196,freq2:147,gain:0.18,attack:0.015,hold:0.08,decay:0.55,delay:0.3,bend:0.5},
    {type:'noise',rate:0.5,gain:0.07,attack:0.05,decay:0.7,filter:{type:'lowpass',freq:700}},
  ]},

  // Nulle : deux fois la même note. Ni haut ni bas, exactement comme le
  // résultat.
  draw:{vary:0.015,duck:0.4,layers:[
    {type:'tone',wave:'sine',freq:349,gain:0.15,attack:0.008,hold:0.05,decay:0.22},
    {type:'tone',wave:'sine',freq:349,gain:0.15,attack:0.008,hold:0.05,decay:0.3,delay:0.2},
  ]},

  // -- SONS D'INTERFACE ---------------------------------------------------
  // Ils n'existaient pas : toute la navigation, les coffres et les
  // récompenses empruntaient 'promo', si bien qu'encaisser un palier
  // sonnait comme une promotion de pion.

  // Sélection d'une pièce : le plus discret de tous, à la limite du
  // perceptible. C'est une confirmation, pas un événement.
  tap:{vary:0.06,layers:[
    {type:'noise',rate:2.6,gain:0.09,attack:0.0005,decay:0.022,filter:{type:'bandpass',freq:3200,q:1.6}},
  ]},

  // Coup refusé / action impossible.
  deny:{vary:0.02,layers:[
    {type:'tone',wave:'square',freq:196,freq2:150,gain:0.13,attack:0.002,decay:0.11,bend:0.09,filter:{type:'lowpass',freq:1400}},
  ]},

  // Le coffre se fend : bois qui casse, puis souffle. Le lot qui en sort a
  // son propre son ('loot'), sinon l'ouverture et la récompense se
  // confondent en un seul bruit.
  chest:{vary:0.05,duck:0.6,layers:[
    {type:'noise',rate:0.7,gain:0.40,attack:0.0005,decay:0.13,filter:{type:'lowpass',freq:2400}},
    {type:'tone',wave:'sawtooth',freq:140,freq2:60,gain:0.24,attack:0.001,decay:0.2,bend:0.12},
    {type:'noise',rate:1.8,gain:0.16,attack:0.03,decay:0.55,delay:0.06,filter:{type:'highpass',freq:1800}},
  ]},

  // Un lot révélé : clair, court, franc. Il se répète lot après lot, donc il
  // reste léger.
  loot:{vary:0.03,layers:[
    {type:'tone',wave:'triangle',freq:1047,gain:0.13,attack:0.003,decay:0.12},
    {type:'tone',wave:'sine',freq:1568,gain:0.10,attack:0.004,decay:0.2,delay:0.05},
  ]},

  // Montée de rang / palier franchi : la seule fanfare de l'interface.
  rank:{vary:0.01,duck:0.65,layers:[
    {type:'tone',wave:'triangle',freq:523,gain:0.16,attack:0.006,hold:0.04,decay:0.2},
    {type:'tone',wave:'triangle',freq:784,gain:0.16,attack:0.006,hold:0.04,decay:0.22,delay:0.11},
    {type:'tone',wave:'sine',freq:1047,gain:0.18,attack:0.008,hold:0.12,decay:0.55,delay:0.22},
    {type:'noise',rate:2.4,gain:0.11,attack:0.03,decay:0.6,delay:0.22,filter:{type:'highpass',freq:2400}},
  ]},
};

// ----------------------------------------------------------------
// DUCKING DE LA MUSIQUE
// ----------------------------------------------------------------
// La musique de combat baisse pendant l'impact et remonte juste après. Sans
// ça, le morceau occupe la même bande que les bruitages et mange l'attaque :
// on entend le son, on ne le REÇOIT pas.
function sfxDuck(amount,ms){
  const g=window._musicGain;
  if(!g||!amount)return;
  const ctx=(typeof getAudioCtx==='function')?getAudioCtx():null;
  if(!ctx)return;
  const base=(typeof _musicVol==='number')?_musicVol:g.gain.value;
  const now=ctx.currentTime;
  try{
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value,now);
    g.gain.linearRampToValueAtTime(Math.max(0.0001,base*(1-amount)),now+0.03);
    g.gain.linearRampToValueAtTime(base,now+0.03+(ms||200)/1000);
  }catch(e){}
}

// ----------------------------------------------------------------
// JOUER UN SON
// ----------------------------------------------------------------
// opts : {force} 0..1, l'intensité de l'événement. 0.5 est le neutre.
// Elle déplace ensemble le volume, la hauteur et l'ouverture du filtre —
// c'est ce que fait un objet réel frappé plus ou moins fort, et c'est pour
// ça qu'un simple changement de volume ne suffit jamais à faire « plus
// fort ».
function sfxPlay(name,opts){
  if(typeof _soundEnabled!=='undefined'&&!_soundEnabled)return;
  const recipe=SFX_RECIPES[name];
  if(!recipe)return;
  const ctx=(typeof getAudioCtx==='function')?getAudioCtx():null;
  const bus=sfxBus();
  if(!ctx||!bus)return;

  const force=Math.max(0,Math.min(1,(opts&&typeof opts.force==='number')?opts.force:0.5));
  const master=(typeof _sfxVol==='number')?_sfxVol:1;
  // La variation : quelques pour cent de hauteur et de volume, tirés à
  // chaque déclenchement. C'est peu, et c'est tout ce qui sépare un jeu qui
  // bipe d'un jeu qui répond.
  const vary=recipe.vary||0.03;
  const pitchMul=(1+(Math.random()*2-1)*vary)*(0.94+0.14*force);
  const volMul=master*(0.72+0.56*force)*(1+(Math.random()*2-1)*0.06);

  const t0=ctx.currentTime;
  recipe.layers.forEach(L=>{try{sfxLayer(ctx,bus,L,t0,force,pitchMul,volMul);}catch(e){}});
  if(recipe.duck)sfxDuck(recipe.duck*(0.6+0.4*force),220);
}

// L'intensité d'une capture, tirée de la valeur de la pièce prise. Prendre
// un pion et prendre le Grand Maître (13 points) ne peuvent pas produire le
// même bruit : c'est le premier endroit où le jeu doit se faire sentir.
function sfxCaptureForce(pieceId){
  if(typeof PIECES==='undefined'||!pieceId)return 0.45;
  const p=PIECES.find(x=>x.id===pieceId);
  const v=p&&typeof p.value==='number'?p.value:1;
  // 1 point → 0,30 ; 13 points (Grand Maître) → 1,00.
  return Math.max(0.28,Math.min(1,0.28+(v-1)/12*0.72));
}

// ----------------------------------------------------------------
// HAPTIQUE
// ----------------------------------------------------------------
// CINQ MOTIFS, PAS UN DE PLUS. Une vibration par action devient du bruit, et
// le joueur coupe tout — ce qui fait perdre les cinq qui comptaient.
const HAPTIC_PATTERNS={
  tap   :[8],              // sélection : à peine perceptible
  place :[14],             // coup joué
  impact:[26],             // capture
  alert :[18,60,18],       // échec
  fanfare:[16,50,16,50,60],// mat, coffre, montée de rang
};

// Réglage séparé du son : quelqu'un qui joue en silence dans un train veut
// souvent GARDER la vibration, et l'inverse est vrai aussi.
let _hapticEnabled=true;
function hapticSetEnabled(on){_hapticEnabled=!!on;}
function hapticSupported(){return typeof navigator!=='undefined'&&typeof navigator.vibrate==='function';}

function haptic(kind){
  if(!_hapticEnabled)return false;
  // Le mouvement réduit couvre aussi le vestibulaire : quelqu'un qui a
  // demandé moins de mouvement n'a pas demandé qu'on lui secoue l'appareil.
  try{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
  }catch(e){}
  const pat=HAPTIC_PATTERNS[kind];
  if(!pat||!hapticSupported())return false;
  try{return navigator.vibrate(pat);}catch(e){return false;}
}

// REPLI VISUEL. iOS Safari n'expose pas navigator.vibrate — sur la moitié du
// parc mobile, l'haptique n'existe donc tout simplement pas. Un tremblement
// bref de l'élément concerné rend l'événement perceptible autrement, et il
// est utile partout, y compris là où la vibration marche.
const HAPTIC_FALLBACK_CLASS='sfx-shake';
function sfxShake(el,strong){
  if(!el||!el.classList)return;
  try{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  }catch(e){}
  el.classList.remove(HAPTIC_FALLBACK_CLASS,'sfx-shake-hard');
  // Forcer un reflow relance l'animation quand deux captures s'enchaînent.
  void el.offsetWidth;
  el.classList.add(strong?'sfx-shake-hard':HAPTIC_FALLBACK_CLASS);
  setTimeout(()=>el.classList.remove(HAPTIC_FALLBACK_CLASS,'sfx-shake-hard'),strong?260:180);
}

// ----------------------------------------------------------------
// LE GESTE COMPLET : son + vibration + secousse, en un appel
// ----------------------------------------------------------------
// Les trois vont toujours ensemble ; les appeler séparément partout, c'est
// se garantir qu'un jour l'un des trois manquera quelque part.
const SFX_FEEL={
  move   :{haptic:'place'},
  capture:{haptic:'impact',shake:true},
  check  :{haptic:'alert', shake:true},
  castle :{haptic:'place'},
  promo  :{haptic:'fanfare'},
  win    :{haptic:'fanfare'},
  loss   :{haptic:'alert'},
  chest  :{haptic:'fanfare',shake:true},
  rank   :{haptic:'fanfare'},
  tap    :{haptic:'tap'},
  loot   :{haptic:'tap'},
};
function sfxFeel(name,opts){
  sfxPlay(name,opts);
  const f=SFX_FEEL[name];
  if(!f)return;
  if(f.haptic)haptic(f.haptic);
  if(f.shake){
    const el=(opts&&opts.shakeEl)||document.getElementById('game-board');
    const force=(opts&&typeof opts.force==='number')?opts.force:0.5;
    if(el)sfxShake(el,force>0.6);
  }
}
