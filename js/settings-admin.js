// ================================================================
// SETTINGS-ADMIN.JS : Panneau de réglages (thème, volume) + Mode Administrateur
// ================================================================
// Contient : le bouton et panneau flottant de réglages (#settings-btn /
// #settings-panel) qui contrôle le thème clair/sombre et les volumes
// bruitages/musique, et le mode Administrateur (bouton #admin-badge) qui
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
// MODE ADMINISTRATEUR : récompenses illimitées, rien d'offert
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
// vrais coffres, ouverts par la vraie cérémonie.
//
// Second effet : aucune partie jouée en mode admin ne compte au classement
// (voir vvNoEloReason dans js/voie.js).
document.getElementById('admin-badge').addEventListener('click',()=>{
  ADMIN_MODE=!ADMIN_MODE;
  const btn=document.getElementById('admin-badge');
  if(ADMIN_MODE){
    btn.classList.add('active-admin');btn.textContent='Admin ON';
    showNotif('Mode Admin : coffres illimités dans la Réserve, aucun ELO en jeu','ok');
  }else{
    btn.classList.remove('active-admin');btn.textContent='Admin';
    showNotif('Mode Admin désactivé','ok');
  }
  updateCab();
  updAll();
  // La Réserve affiche/retire la section des coffres illimités.
  if(typeof renderReservePage==='function'&&CUR_ACC)renderReservePage();
});