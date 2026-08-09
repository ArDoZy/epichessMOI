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

let _sfxVol=1,_musicVol=0.5;
(function(){
  const btn=document.getElementById('settings-btn');
  const panel=document.getElementById('settings-panel');
  btn.addEventListener('click',e=>{e.stopPropagation();panel.classList.toggle('open');});
  document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==btn)panel.classList.remove('open');});
  document.getElementById('sp-theme').addEventListener('click',toggleTheme);
  document.getElementById('sp-sfx-vol').addEventListener('input',function(){
    _sfxVol=parseFloat(this.value);
    _soundEnabled=_sfxVol>0;
  });
  document.getElementById('sp-music-vol').addEventListener('input',function(){
    _musicVol=parseFloat(this.value);
    if(window._musicGain)window._musicGain.gain.value=_musicVol;
  });
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