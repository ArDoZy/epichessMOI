// ================================================================
// COMBAT-MUSIC.JS : Musique de combat en boucle sans coupure audible
// ================================================================
// Utilise l'API Web Audio (AudioBufferSourceNode.loopStart/loopEnd) plutôt
// qu'une <audio> HTML : les points de boucle sont respectés à l'échantillon
// près, donc aucune coupure/craquement au raccord, contrairement à
// audio.currentTime = x qui resynchronise avec un délai perceptible.
//
// Comportement demandé :
//   - 0s → 22s joué une seule fois (intro),
//   - puis boucle 12s → 22s tant que le combat dure,
//   - la fin réelle du fichier (après 22s) n'est jouée que lorsque la
//     partie se termine (startCombatMusic/endCombatMusic).
//
// Dépendances : rules-engine.js (getAudioCtx), settings-admin.js (_musicVol,
// window._musicGain). Appelé par game-flow.js (showArmyIntro/closeOverlay,
// triggerEndOfGame).
// ================================================================

const COMBAT_MUSIC_URL='audio/combat-music.mp3';
const COMBAT_MUSIC_LOOP_START=12;
const COMBAT_MUSIC_LOOP_END=22;

let _combatMusicBufferPromise=null;
let _combatMusicSource=null;

function loadCombatMusicBuffer(){
  if(_combatMusicBufferPromise)return _combatMusicBufferPromise;
  _combatMusicBufferPromise=fetch(COMBAT_MUSIC_URL)
    .then(r=>r.arrayBuffer())
    .then(data=>new Promise((resolve,reject)=>{
      const ctx=getAudioCtx();if(!ctx){reject(new Error('no audio context'));return;}
      ctx.decodeAudioData(data,resolve,reject);
    }))
    .catch(e=>{_combatMusicBufferPromise=null;throw e;});
  return _combatMusicBufferPromise;
}

function ensureMusicGain(ctx){
  if(!window._musicGain){
    window._musicGain=ctx.createGain();
    window._musicGain.gain.value=(typeof _musicVol==='number')?_musicVol:0.5;
    window._musicGain.connect(ctx.destination);
  }
  return window._musicGain;
}

// Coupe immédiatement toute musique de combat en cours (sans jouer la fin).
function stopCombatMusicImmediate(){
  if(_combatMusicSource){
    _combatMusicSource.onended=null;
    try{_combatMusicSource.stop();}catch(e){}
    _combatMusicSource.disconnect();
    _combatMusicSource=null;
  }
}

// Démarre (ou relance) la musique de combat : intro 0→22s puis boucle 12→22s.
function startCombatMusic(){
  const ctx=getAudioCtx();if(!ctx)return;
  stopCombatMusicImmediate();
  loadCombatMusicBuffer().then(buffer=>{
    // Un combat plus récent a pu démarrer/se terminer pendant le décodage.
    if(_combatMusicSource)return;
    const src=ctx.createBufferSource();
    src.buffer=buffer;
    src.loop=true;
    src.loopStart=COMBAT_MUSIC_LOOP_START;
    src.loopEnd=COMBAT_MUSIC_LOOP_END;
    src.connect(ensureMusicGain(ctx));
    src.onended=()=>{if(_combatMusicSource===src)_combatMusicSource=null;};
    src.start(0);
    _combatMusicSource=src;
  }).catch(()=>{});
}

// Fin de partie : laisse la boucle en cours se terminer, puis enchaîne sur
// la véritable fin du morceau (après 22s) au lieu de revenir à 12s.
function endCombatMusic(){
  if(_combatMusicSource)_combatMusicSource.loop=false;
}

// ----------------------------------------------------------------
// LA MUSIQUE SE TAIT AVEC LA PAGE
// ----------------------------------------------------------------
// Une boucle Web Audio ne s'arrête PAS quand on change d'onglet ou qu'on
// verrouille le téléphone : le contexte audio continue de décoder et de mixer,
// et la musique de combat continue de jouer par-dessus ce que le joueur écoute
// vraiment. C'est le seul son du jeu qui dure — les effets, eux, sont des
// impulsions d'une demi-seconde — donc le seul qui ait besoin de cette règle.
//
// On suspend le CONTEXTE et non la source : suspendre le contexte fige
// l'horloge audio, donc la boucle reprend exactement où elle en était ; arrêter
// la source la détruirait et il faudrait la reconstruire, avec le décodage que
// cela suppose. Et on ne reprend QUE si quelque chose jouait — sinon on
// rallumerait un contexte que le navigateur venait de mettre en veille tout
// seul, ce qu'aucune page ne doit faire sans geste de l'utilisateur.
document.addEventListener('visibilitychange',()=>{
  const ctx=(typeof getAudioCtx==='function')?getAudioCtx():null;
  if(!ctx)return;
  if(document.hidden){
    if(_combatMusicSource&&ctx.state==='running')ctx.suspend().catch(()=>{});
  }else if(_combatMusicSource&&ctx.state==='suspended'){
    ctx.resume().catch(()=>{});
  }
});
