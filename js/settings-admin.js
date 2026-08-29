// ================================================================
// SETTINGS-ADMIN.JS : Panneau de réglages (volume)
// ================================================================
// Contient : le bouton et panneau flottant de réglages (#settings-btn /
// #settings-panel) qui contrôle LE volume (un seul, voir plus bas). Le jeu
// n'a qu'un thème (sombre) : il n'y a donc plus de réglage d'apparence ici.
// Le mode test (/?test, voir plus bas dans main.js) reste utilisable par son
// adresse, mais n'a plus d'entrée dans ce panneau.
//
// Dépendances : main.js (ADMIN_MODE),
// rules-engine.js (_soundEnabled), combat-music.js (window._musicGain),
// sfx.js (hapticSetEnabled, hapticSupported, haptic).
//
// Si vous ajoutez un nouveau réglage : ajoutez sa ligne .sp-row dans
// index.html (section #settings-panel) et son listener ici.
// ================================================================

// UN SEUL CURSEUR POUR TOUT LE SON. Il y en avait deux, « Bruitages » et
// « Musique » : baisser le son du jeu demandait donc deux gestes, et personne
// n'a jamais voulu de la musique sans les bruitages ni l'inverse. Le curseur
// « Bruitages » commande maintenant les deux, la musique restant en retrait
// d'un facteur fixe — c'est un fond, pas un premier plan.
//
// _sfxVol vit dans rules-engine.js (playTone en a besoin) ; ici on ne fait que
// l'écrire. _musicVol en est déduit, combat-music.js le lit.
const MUSIC_RATIO=0.5;
let _musicVol=MUSIC_RATIO;

// ----------------------------------------------------------------
// PERSISTANCE DES RÉGLAGES
// ----------------------------------------------------------------
// Ce réglage n'est PAS stocké par compte (accGet/accSet) : il s'applique
// avant même qu'un compte soit connecté, sur la page de connexion. Une seule
// clé localStorage globale, donc. Sans elle, chaque rechargement remettait le
// volume à sa valeur d'usine, y compris pour quelqu'un qui avait coupé le son.
const PREFS_KEY='mc_prefs_v1';
function loadPrefs(){
  try{return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')||{};}catch(e){return{};}
}
function savePrefs(patch){
  const p=Object.assign(loadPrefs(),patch);
  try{localStorage.setItem(PREFS_KEY,JSON.stringify(p));}catch(e){}
}
// Un seul point d'entrée : il pose le volume des bruitages ET celui de la
// musique, qui en découle.
function applySfxVol(v){
  _sfxVol=Math.max(0,Math.min(1,v));
  _soundEnabled=_sfxVol>0;
  _musicVol=_sfxVol*MUSIC_RATIO;
  if(window._musicGain)window._musicGain.gain.value=_musicVol;
}

(function(){
  const btn=document.getElementById('settings-btn');
  const panel=document.getElementById('settings-panel');
  btn.addEventListener('click',e=>{e.stopPropagation();panel.classList.toggle('open');});
  document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==btn)panel.classList.remove('open');});
  const sfx=document.getElementById('sp-sfx-vol');
  sfx.addEventListener('input',function(){applySfxVol(parseFloat(this.value));savePrefs({sfx:_sfxVol});});

  // -- VIBRATION ---------------------------------------------------------
  // Réglage SÉPARÉ du son : jouer en silence et garder la vibration est un
  // usage courant (transports), l'inverse aussi (quelqu'un que la vibration
  // agace). Les regrouper obligerait à sacrifier l'un pour l'autre.
  const hap=document.getElementById('sp-haptic');
  const hapRow=document.getElementById('sp-haptic-row');
  // Un appareil qui ne sait pas vibrer ne doit pas montrer l'interrupteur :
  // un réglage qui ne commande rien est pire que pas de réglage.
  if(hapRow&&typeof hapticSupported==='function'&&!hapticSupported())hapRow.style.display='none';
  if(hap){
    hap.addEventListener('click',()=>{
      const on=hap.getAttribute('aria-checked')!=='true';
      hap.setAttribute('aria-checked',on?'true':'false');
      if(typeof hapticSetEnabled==='function')hapticSetEnabled(on);
      savePrefs({haptic:on});
      // On fait sentir le réglage au moment où on l'allume : c'est la seule
      // façon de savoir ce qu'on vient d'activer.
      if(on&&typeof haptic==='function')haptic('place');
    });
  }

  // Restitution au chargement : le panneau doit montrer ce qui est réellement
  // appliqué, sinon les réglages mentent dès la seconde visite.
  const prefs=loadPrefs();
  if(typeof prefs.sfx==='number'){applySfxVol(prefs.sfx);sfx.value=_sfxVol;}
  const hapOn=(typeof prefs.haptic==='boolean')?prefs.haptic:true;
  if(typeof hapticSetEnabled==='function')hapticSetEnabled(hapOn);
  if(hap)hap.setAttribute('aria-checked',hapOn?'true':'false');
})();

// Le mode test (bac à sable : tout le catalogue, 10 000 ELO, perles
// illimitées, rien n'est enregistré — voir js/economy.js et js/accounts.js)
// reste accessible par son adresse, `/?test` (voir ADMIN_QUERY, js/main.js),
// mais n'a plus de bouton dans les réglages : ce n'était utile qu'en
// démonstration, et ça n'a pas sa place dans le jeu normal.