// ================================================================
// CUBE-NAV.JS — Navigation principale par cube (illusion 3D CSS)
// ================================================================
// Remplace UNIQUEMENT la navigation de haut niveau par un cube qui tourne
// par incréments de 90°. Ce module ne connaît QUE :
//   - la face courante (yaw/pitch)
//   - les animations / rotations
//   - le verrouillage pendant une partie
// Il ignore totalement le fonctionnement du builder, du moteur d'échecs,
// des comptes et de l'IA. Il se contente de :
//   - déplacer (à l'exécution) le DOM existant #page-builder et #page-game
//     dans les faces correspondantes (les IDs et listeners survivent au
//     déplacement, donc AUCUNE logique n'est réécrite) ;
//   - piloter la rotation du cube quand showPage() cible une face ;
//   - laisser les pages secondaires (armées, voie, tournoi, combat, login)
//     s'afficher en overlay plein écran au-dessus du cube, exactement comme
//     avant.
//
// Dépendances : main.js (showPage délègue à cubeOnShowPage), et les globals
// de jeu (army, currentArmyData, aiArmyData, _playerColor, startGame,
// generateAIArmy, showAILevelModal, showNotif, buildArmyDataFromBuilder).
// Chargé juste après main.js (voir index.html).
// ================================================================

(function(){
  // Faces latérales dans l'ordre de rotation. « Tourner à gauche » avance
  // d'un cran (jouer→builder→magasin→missions→jouer…), « à droite » recule.
  const SIDE_FACES=['jouer','builder','magasin','missions']; // front, right, back, left
  // Pages réelles embarquées dans une face (déplacées à l'init).
  const EMBED={ 'page-builder':'builder', 'page-game':'game' };
  // Toute page NON listée ici (armies, voie, tournoi, combat, login…) reste un
  // overlay plein écran classique piloté par le système .page/.active.

  let yaw=0;     // deg — accumulateur (négatif = rotations vers la gauche)
  let pitch=0;   // deg — 0 : faces latérales ; -90 : face sup (partie) ; +90 : face inf (variantes)
  let locked=false;
  let cube=null;

  function sideIndex(){ return ((Math.round(-yaw/90)%4)+4)%4; }
  function frontSideName(){ return SIDE_FACES[sideIndex()]; }

  function applyTransform(animate){
    if(!cube)return;
    cube.style.transition = animate===false ? 'none' : '';
    cube.style.transform = 'translateZ(-50vmax) rotateX('+pitch+'deg) rotateY('+yaw+'deg)';
  }

  function refresh(){
    if(!cube)return;
    // Détermine la face réellement au front pour l'interactivité.
    let name;
    if(pitch<0)name='game';
    else if(pitch>0)name='variantes';
    else name=frontSideName();
    cube.querySelectorAll('.cube-face').forEach(f=>{
      f.classList.toggle('is-front', f.dataset.face===name);
    });
    // Bandeau catégories : uniquement sur la face builder au repos.
    const rail=document.getElementById('class-jump-rail');
    if(rail)rail.classList.toggle('show', pitch===0 && name==='builder');
    updateArrows(name);
  }

  function updateArrows(name){
    const active=document.body.classList.contains('cube-active');
    const lat = active && !locked && pitch===0;
    const l=document.getElementById('cube-arrow-left');
    const r=document.getElementById('cube-arrow-right');
    const d=document.getElementById('cube-arrow-down');
    const u=document.getElementById('cube-arrow-up');
    if(l)l.style.display=lat?'':'none';
    if(r)r.style.display=lat?'':'none';
    // Descendre vers « Variantes » : seulement depuis la face JOUER.
    if(d)d.style.display=(lat && name==='jouer')?'':'none';
    // Remonter depuis « Variantes ».
    if(u)u.style.display=(active && !locked && pitch>0)?'':'none';
  }

  // ---- Rotations -------------------------------------------------
  function rotateHorizontal(dir){ // dir<0 : gauche ; dir>0 : droite
    if(locked||pitch!==0)return;
    yaw += (dir<0 ? -90 : 90);
    applyTransform(); refresh();
  }
  function goToSide(name){
    const target=SIDE_FACES.indexOf(name); if(target<0)return;
    pitch=0;
    let diff=(target - sideIndex() + 4)%4; // 0..3
    if(diff===3)diff=-1;                    // chemin le plus court
    yaw += -diff*90;
    applyTransform(); refresh();
  }
  function goVertical(dir){ // dir<0 : vers le haut (partie) ; dir>0 : vers le bas (variantes)
    pitch = dir<0 ? -90 : 90;
    applyTransform(); refresh();
  }

  function lock(){ locked=true; refresh(); }
  function unlock(){ locked=false; refresh(); }

  // Retour au menu principal (face JOUER), déverrouillé. Utilisé après une
  // partie et à la connexion.
  function goToMainMenu(){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.body.classList.remove('nav-overlay');
    document.body.classList.add('cube-active');
    locked=false; pitch=0; goToSide('jouer');
  }
  window.goToMainMenu=goToMainMenu;

  // ---- Intégration avec showPage() -------------------------------
  // Appelée par showPage() (main.js) APRÈS le basculement .page/.active.
  function cubeOnShowPage(id){
    if(!cube){ return; }
    // Écran de connexion : on quitte entièrement le mode cube.
    if(id==='page-login'){ document.body.classList.remove('cube-active','nav-overlay'); locked=false; return; }
    if(id==='face-jouer'){ goToMainMenu(); return; }
    const face=EMBED[id];
    if(face==='builder'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      if(locked)unlock();
      goToSide('builder');
      return;
    }
    if(face==='game'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      goVertical(-1);   // rotation verticale vers la face supérieure
      lock();           // navigation verrouillée pendant la partie
      return;
    }
    // Page secondaire (overlay) : elle se dessine au-dessus du cube. On
    // marque body.nav-overlay (masque flèches + bandeau) et on remet
    // discrètement le cube au repos derrière l'overlay pour un retour propre.
    const el=document.getElementById(id);
    if(el && el.classList.contains('page')){
      document.body.classList.add('nav-overlay');
    }
    if(document.body.classList.contains('cube-active')){
      if(locked)unlock();
      if(pitch!==0){ pitch=0; goToSide('jouer'); }
    }
    updateArrows(frontSideName());
  }
  window.cubeOnShowPage=cubeOnShowPage;

  // ---- Bouton JOUER ----------------------------------------------
  function onJouer(){
    if(locked)return;
    if(!(typeof army!=='undefined' && army && army.mon && army.gen && army.extras && army.extras.length===3)){
      if(typeof showNotif==='function')showNotif('Composez d\'abord une armée complète (tournez vers la droite).');
      goToSide('builder');
      return;
    }
    currentArmyData = buildArmyDataFromBuilder();
    aiArmyData = generateAIArmy();
    // Réutilise EXACTEMENT le système de lancement actuel : modal instructeur
    // puis startGame() (qui appelle showPage('page-game') → rotation verticale).
    showAILevelModal(function(){
      _playerColor = Math.random()<0.5 ? 'w' : 'b';
      startGame(true);
    });
  }

  // ---- Init : déplace les pages réelles dans les faces, câble tout -----
  function init(){
    cube=document.getElementById('cube');
    if(!cube)return;
    // Déplace #page-builder et #page-game dans leurs faces respectives.
    // (Le DOM bouge, mais IDs + listeners restent intacts.)
    const moveInto=(pageId,faceId)=>{
      const page=document.getElementById(pageId);
      const host=document.getElementById(faceId);
      if(page&&host){
        page.classList.remove('page');   // ne plus être piloté par .page/.active
        page.classList.add('cube-embedded');
        host.appendChild(page);
      }
    };
    moveInto('page-builder','face-viewport-builder');
    moveInto('page-game','face-viewport-game');

    document.getElementById('cube-arrow-left') ?.addEventListener('click',()=>rotateHorizontal(-1));
    document.getElementById('cube-arrow-right')?.addEventListener('click',()=>rotateHorizontal(1));
    document.getElementById('cube-arrow-down') ?.addEventListener('click',()=>{ if(!locked&&pitch===0&&frontSideName()==='jouer')goVertical(1); });
    document.getElementById('cube-arrow-up')   ?.addEventListener('click',()=>{ if(!locked&&pitch>0){ pitch=0; goToSide('jouer'); } });
    document.getElementById('cube-jouer-btn')  ?.addEventListener('click',onJouer);

    // Clavier : flèches gauche/droite pour tourner (confort, optionnel).
    document.addEventListener('keydown',e=>{
      if(locked||pitch!==0||!document.body.classList.contains('cube-active'))return;
      if(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
      if(e.key==='ArrowLeft')rotateHorizontal(-1);
      else if(e.key==='ArrowRight')rotateHorizontal(1);
    });

    cube.addEventListener('transitionend',()=>refresh());
    applyTransform(false);
    refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
