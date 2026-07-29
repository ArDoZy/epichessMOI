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
// triggerEndOfGame) et tournoi.js (triggerTournoiEndOfGame).
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
