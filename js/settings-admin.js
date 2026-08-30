// ================================================================
// SETTINGS-ADMIN.JS : Panneau de réglages (volumes)
// ================================================================
// Contient : le bouton et panneau flottant de réglages (#settings-btn /
// #settings-panel) qui contrôle les DEUX volumes (bruitages, musique). Le jeu
// n'a qu'un thème (sombre) : il n'y a donc pas de réglage d'apparence ici, et
// la vibration n'a plus d'interrupteur (elle est toujours active, voir plus
// bas). Le mode test (/?test, voir plus bas dans main.js) reste utilisable par
// son adresse, mais n'a pas d'entrée dans ce panneau.
//
// Dépendances : main.js (ADMIN_MODE),
// rules-engine.js (_soundEnabled), combat-music.js (window._musicGain),
// sfx.js (hapticSetEnabled).
//
// Si vous ajoutez un nouveau réglage : ajoutez sa ligne .sp-row dans
// index.html (section #settings-panel) et son listener ici.
// ================================================================

// DEUX CURSEURS, PARCE QUE CE SONT DEUX SONS. Il n'y en a eu qu'un pendant un
// temps : « Bruitages » commandait aussi la musique, à un facteur fixe près.
// Mais couper la boucle de combat en gardant le bruit des pièces — ce qu'on
// fait dès qu'on écoute autre chose en jouant — était alors impossible, et
// baisser la musique obligeait à rendre le jeu muet.
//
// _sfxVol vit dans rules-engine.js (playTone en a besoin) ; ici on ne fait que
// l'écrire. _musicVol est lu par combat-music.js (ensureMusicGain).
// MUSIC_RATIO n'est plus qu'une VALEUR DE DÉPART : la musique est un fond, il
// serait absurde qu'elle sorte à plein volume au premier lancement.
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
// Les bruitages. `_soundEnabled` (rules-engine.js) suit : à zéro, playTone
// n'ouvre même plus de contexte audio.
function applySfxVol(v){
  _sfxVol=Math.max(0,Math.min(1,v));
  _soundEnabled=_sfxVol>0;
}
// La musique. Le gain est posé sur le nœud s'il existe déjà (une partie est en
// cours) ; sinon ensureMusicGain (js/combat-music.js) lira _musicVol à la
// création, donc le réglage s'applique de toute façon au combat suivant.
function applyMusicVol(v){
  _musicVol=Math.max(0,Math.min(1,v));
  if(window._musicGain)window._musicGain.gain.value=_musicVol;
}

(function(){
  const btn=document.getElementById('settings-btn');
  const panel=document.getElementById('settings-panel');
  btn.addEventListener('click',e=>{e.stopPropagation();panel.classList.toggle('open');});
  document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==btn)panel.classList.remove('open');});
  const sfx=document.getElementById('sp-sfx-vol');
  sfx.addEventListener('input',function(){applySfxVol(parseFloat(this.value));savePrefs({sfx:_sfxVol});});
  const mus=document.getElementById('sp-music-vol');
  mus?.addEventListener('input',function(){applyMusicVol(parseFloat(this.value));savePrefs({music:_musicVol});});

  // -- VIBRATION : TOUJOURS ACTIVE ---------------------------------------
  // Elle a eu son interrupteur, à part du son. Il est parti : la vibration
  // n'est pas un effet qu'on subit, c'est la réponse du jeu au doigt qui
  // touche — cinq motifs de quelques dizaines de millisecondes, pas un de plus
  // (voir haptic, js/sfx.js). Sur un appareil qui ne sait pas vibrer, elle
  // retombe déjà toute seule sur son repli visuel. On l'allume ici, une fois,
  // et la préférence enregistrée par l'ancienne version du panneau est
  // ignorée : personne ne doit se retrouver avec une vibration muette sans
  // savoir où la rallumer.
  if(typeof hapticSetEnabled==='function')hapticSetEnabled(true);

  // Restitution au chargement : le panneau doit montrer ce qui est réellement
  // appliqué, sinon les réglages mentent dès la seconde visite.
  const prefs=loadPrefs();
  if(typeof prefs.sfx==='number'){applySfxVol(prefs.sfx);sfx.value=_sfxVol;}
  applyMusicVol(typeof prefs.music==='number'?prefs.music:MUSIC_RATIO);
  if(mus)mus.value=_musicVol;
})();

// Le mode test (bac à sable : tout le catalogue, 10 000 ELO, perles
// illimitées, rien n'est enregistré — voir js/economy.js et js/accounts.js)
// reste accessible par son adresse, `/?test` (voir ADMIN_QUERY, js/main.js),
// mais n'a plus de bouton dans les réglages : ce n'était utile qu'en
// démonstration, et ça n'a pas sa place dans le jeu normal.