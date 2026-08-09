// ================================================================
// SETTINGS-ADMIN.JS : Panneau de réglages (thème, volume) + Mode Administrateur
// ================================================================
// Contient : le bouton et panneau flottant de réglages (#settings-btn /
// #settings-panel) qui contrôle le thème clair/sombre et les volumes
// bruitages/musique, et l'entree du mode Administrateur (bouton #sp-admin) qui
// ouvre des coffres illimités dans la Réserve et met les parties hors
// classement, pour tester/démontrer le jeu sans fausser la progression.
//
// Dépendances : main.js (toggleTheme, ADMIN_MODE, updAll),
// accounts.js (updateCab, CUR_ACC), economy-ui.js (renderReservePage),
// rules-engine.js (_soundEnabled), combat-music.js (window._musicGain).
//
// Si vous ajoutez un nouveau réglage : ajoutez sa ligne .sp-row dans
// index.html (section #settings-panel) et son listener ici.
// ================================================================

// _sfxVol vit dans rules-engine.js (playTone en a besoin) ; ici on ne fait que
// l'écrire. _musicVol est propre à ce fichier, combat-music.js le lit.
let _musicVol=0.5;

// ----------------------------------------------------------------
// PERSISTANCE DES RÉGLAGES
// ----------------------------------------------------------------
// Ces trois réglages ne sont PAS stockés par compte (accGet/accSet) : ils
// s'appliquent avant même qu'un compte soit connecté, et le thème doit être
// posé sur la page de connexion. Une seule clé localStorage globale, donc.
// Sans elle, chaque rechargement remettait le thème en sombre et les volumes
// à leur valeur d'usine, y compris pour quelqu'un qui avait coupé le son.
const PREFS_KEY='mc_prefs_v1';
function loadPrefs(){
  try{return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')||{};}catch(e){return{};}
}
function savePrefs(patch){
  const p=Object.assign(loadPrefs(),patch);
  try{localStorage.setItem(PREFS_KEY,JSON.stringify(p));}catch(e){}
}
function applySfxVol(v){
  _sfxVol=Math.max(0,Math.min(1,v));
  _soundEnabled=_sfxVol>0;
}
function applyMusicVol(v){
  _musicVol=Math.max(0,Math.min(1,v));
  if(window._musicGain)window._musicGain.gain.value=_musicVol;
}

(function(){
  const btn=document.getElementById('settings-btn');
  const panel=document.getElementById('settings-panel');
  btn.addEventListener('click',e=>{e.stopPropagation();panel.classList.toggle('open');});
  document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==btn)panel.classList.remove('open');});
  document.getElementById('sp-theme').addEventListener('click',()=>{toggleTheme();savePrefs({dark:darkMode});});
  const sfx=document.getElementById('sp-sfx-vol');
  const mus=document.getElementById('sp-music-vol');
  sfx.addEventListener('input',function(){applySfxVol(parseFloat(this.value));savePrefs({sfx:_sfxVol});});
  mus.addEventListener('input',function(){applyMusicVol(parseFloat(this.value));savePrefs({music:_musicVol});});

  // Restitution au chargement : le panneau doit montrer ce qui est réellement
  // appliqué, sinon les curseurs mentent dès la seconde visite.
  const prefs=loadPrefs();
  if(typeof prefs.sfx==='number'){applySfxVol(prefs.sfx);sfx.value=_sfxVol;}
  if(typeof prefs.music==='number'){applyMusicVol(prefs.music);mus.value=_musicVol;}
  if(prefs.dark===false&&darkMode)toggleTheme();
  // Le tutoriel commence par tourner le cube : on ferme le panneau et on
  // revient au menu principal, sinon la première étape désigne une flèche
  // cachée derrière une page secondaire.
  document.getElementById('sp-tuto')?.addEventListener('click',()=>{
    panel.classList.remove('open');
    if(typeof goToMainMenu==='function')goToMainMenu();
    // Revoir le tutoriel = le reprendre depuis le début (tutoStart(0)), pas
    // depuis l'étape sauvegardée.
    if(typeof tutoStart==='function')setTimeout(()=>tutoStart(0),350);
  });
})();

// ----------------------------------------------------------------
// MODE ADMINISTRATEUR : une ADRESSE, pas un interrupteur
// ----------------------------------------------------------------
// Le mode admin donnait auparavant TOUTES les pièces d'un coup
// (VV_UNLOCKED = tout le catalogue) : il ne restait plus rien à tester, la
// Voie s'affichait comme terminée, et il fallait un instantané de la
// progression réelle pour ne pas l'abîmer en sortant.
//
// Il ne fait plus qu'une chose : ouvrir l'accès aux six coffres (Pion,
// Cavalier, Fou, Tour, Dame, Roi) en quantité illimitée dans la Réserve. Les
// pièces s'obtiennent donc par le chemin normal du jeu — en ouvrant des
// coffres — et non par décret. Les gains, eux, sont bien réels : ce sont de
// vrais coffres, ouverts par la vraie cérémonie. Second effet : aucune partie
// jouée en mode admin ne compte au classement (voir vvNoEloReason, voie.js).
//
// Il vivait derrière un badge flottant qu'on activait par mégarde et qui ne
// se voyait plus une fois activé. C'est maintenant /test : une adresse à
// part, identique au jeu normal en tout point sauf les coffres illimités, et
// qu'on quitte en revenant sur /. L'entrée est dans les réglages, et la barre
// d'adresse dit en permanence où l'on se trouve.
//
// Le passage recharge volontairement la page : ADMIN_MODE est lu au
// démarrage à partir du chemin (js/main.js), une bascule à chaud laisserait
// l'adresse et l'état se contredire.
(function(){
  const btn=document.getElementById('sp-admin');
  const note=document.getElementById('sp-admin-note');
  if(!btn)return;
  if(ADMIN_MODE){
    btn.textContent='Quitter /test';
    btn.classList.add('btn-gold');
    if(note)note.textContent='Vous êtes sur /test : coffres illimités, parties non classées.';
  }
  btn.addEventListener('click',()=>{
    location.href=ADMIN_MODE?'/':ADMIN_PATH;
  });
})();