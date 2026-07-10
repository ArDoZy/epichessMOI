// ================================================================
// SETTINGS-ADMIN.JS — Panneau de réglages (thème, volume) + Mode Administrateur
// ================================================================
// Contient : le bouton et panneau flottant de réglages (#settings-btn /
// #settings-panel) qui contrôle le thème clair/sombre et les volumes
// bruitages/musique, et le mode Administrateur (bouton #admin-badge) qui
// débloque temporairement toutes les pièces en mémoire (sans jamais toucher
// à la progression réelle sauvegardée) pour tester/démontrer le jeu.
//
// Dépendances : main.js (toggleTheme, ADMIN_MODE, VV_UNLOCKED, updAll),
// accounts.js (updateCab, vvLoadPrimordialeChoisie, vvSaveUnlocked),
// data-pieces.js (PIECES, UNLOCK_TABLE, UNLOCK_MILESTONES),
// rules-engine.js (_soundEnabled, window._musicGain si utilisé).
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
})();

// ----------------------------------------------------------------
// MODE ADMINISTRATEUR — débloque tout en mémoire, ne sauvegarde jamais
// les pièces admin dans localStorage (restauration exacte à la désactivation)
// ----------------------------------------------------------------
document.getElementById('admin-badge').addEventListener('click',()=>{
  ADMIN_MODE=!ADMIN_MODE;
  const btn=document.getElementById('admin-badge');
  if(ADMIN_MODE){
    // Snapshot EXACT avant admin — NE PAS sauvegarder en localStorage
    _preAdminUnlocked=new Set(VV_UNLOCKED);
    // Débloquer tout en mémoire seulement
    VV_UNLOCKED=new Set(PIECES.map(p=>p.id));
    btn.classList.add('active-admin');btn.textContent='⚙ Admin ON';
    showNotif('🔓 Mode Admin — ELO figé, tout débloqué (non sauvegardé)','ok');
  }else{
    // RESTAURER snapshot exact — ne jamais sauvegarder les pièces admin
    if(_preAdminUnlocked){
      VV_UNLOCKED=new Set(_preAdminUnlocked);
      _preAdminUnlocked=null;
    }else{
      const defs=UNLOCK_TABLE.filter(u=>u.eloRequired===0&&!u.primordialeChoix&&!u.coffre&&u.pieceId).map(u=>u.pieceId);
      const chosen=vvLoadPrimordialeChoisie();if(chosen)defs.push(chosen);
      VV_UNLOCKED=new Set(defs);
      const elo=vvLoadElo();
      UNLOCK_MILESTONES.forEach(u=>{if(!u.pieceId||u.primordialeChoix||u.coffre)return;if(u.eloRequired<=elo)VV_UNLOCKED.add(u.pieceId);});
      if(chosen)VV_UNLOCKED.add(chosen);
    }
    // Sauvegarder uniquement les pièces légitimement débloquées
    vvSaveUnlocked(VV_UNLOCKED);
    btn.classList.remove('active-admin');btn.textContent='⚙ Admin';
    showNotif('🔒 Mode Admin désactivé — progression restaurée','ok');
  }
  updateCab();
  updAll();
});