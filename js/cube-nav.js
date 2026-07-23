// ================================================================
// CUBE-NAV.JS — Navigation principale par cube (illusion 3D CSS)
// ================================================================
// Remplace UNIQUEMENT la navigation de haut niveau par un cube qui tourne
// par incréments de 90°. Ce module ne connaît QUE la face courante, les
// rotations et le verrouillage pendant une partie. Il ignore totalement le
// fonctionnement du builder, du moteur, des comptes et de l'IA.
//
// Il déplace à l'exécution le DOM existant #page-builder et #page-game dans
// les faces correspondantes (IDs + listeners préservés → aucune logique
// réécrite), pilote la rotation quand showPage() cible une face, et laisse
// les pages secondaires (armées, voie, tournoi, combat, login) s'afficher en
// overlay plein écran au-dessus du cube.
//
// -- POINT TECHNIQUE IMPORTANT --------------------------------------------
// Le hit-testing des clics est FIABLE uniquement quand la face avant est à
// l'angle 0 (aucune rotation nette). Une face amenée au front par une
// rotation 3D persistante s'affiche au bon endroit mais ne reçoit pas les
// clics. On applique donc la technique du « rebase » : le cube tourne pour
// l'ANIMATION (0,5 s) puis, à la fin, on réinitialise discrètement le cube à
// l'angle 0 et on réaffecte chaque face à son nouvel emplacement. Résultat :
// au repos, la face avant est TOUJOURS à l'angle 0 → clics/drag fiables.
//
// Dépendances : main.js (showPage y délègue), et les globals de jeu
// (army, currentArmyData, aiArmyData, _playerColor, startGame,
// generateAIArmy, showAILevelModal, showNotif, buildArmyDataFromBuilder).
// ================================================================

(function(){
  // Emplacements 3D fixes autour de la caméra. Une seule face occupe le
  // « front » (angle 0) à la fois — c'est la seule interactive.
  const SLOT_TF={
    front :'translateZ(50vmax)',
    right :'rotateY(90deg) translateZ(50vmax)',
    back  :'rotateY(180deg) translateZ(50vmax)',
    left  :'rotateY(-90deg) translateZ(50vmax)',
    top   :'rotateX(90deg) translateZ(50vmax)',
    bottom:'rotateX(-90deg) translateZ(50vmax)'
  };
  const REST='translateZ(-50vmax)';
  // Durée de rotation — doit correspondre à la transition CSS de #cube
  // (voir [CUBE] dans style.css). Snap court et net, sans temps mort.
  const ROTATE_MS=220;
  // Disposition canonique (au menu principal).
  const CANON={front:'jouer',right:'builder',back:'magasin',left:'missions',top:'game',bottom:'variantes'};
  const SIDE=new Set(['jouer','builder','magasin','missions']);
  const EMBED={'page-builder':'builder','page-game':'game'};

  // Permutations des emplacements selon la rotation demandée. « right »
  // amène au front la face qui était à DROITE (le cube tourne visuellement
  // vers la gauche), etc.
  const PERM={
    right:o=>({front:o.right, right:o.back, back:o.left, left:o.front, top:o.top, bottom:o.bottom}),
    left :o=>({front:o.left, left:o.back, back:o.right, right:o.front, top:o.top, bottom:o.bottom}),
    up   :o=>({front:o.top, top:o.back, back:o.bottom, bottom:o.front, left:o.left, right:o.right}),
    down :o=>({front:o.bottom, bottom:o.back, back:o.top, top:o.front, left:o.left, right:o.right})
  };
  // Rotation appliquée au cube PENDANT l'animation (avant rebase).
  const CUBE_ANIM={right:'rotateY(-90deg)', left:'rotateY(90deg)', up:'rotateX(-90deg)', down:'rotateX(90deg)'};

  let slots=Object.assign({},CANON);
  let animating=false, locked=false, cube=null;

  const faceEl=name=>cube.querySelector('.cube-face[data-face="'+name+'"]');
  const slotOf=name=>{ for(const s in slots) if(slots[s]===name) return s; };

  function assignTransforms(){ for(const s in slots){ const el=faceEl(slots[s]); if(el)el.style.transform=SLOT_TF[s]; } }

  function refresh(){
    if(!cube)return;
    cube.querySelectorAll('.cube-face').forEach(f=>f.classList.toggle('is-front', f.dataset.face===slots.front));
    const rail=document.getElementById('class-jump-rail');
    if(rail)rail.classList.toggle('show', slots.front==='builder' && !document.body.classList.contains('nav-overlay'));
    updateArrows();
  }
  function updateArrows(){
    const active=document.body.classList.contains('cube-active') && !document.body.classList.contains('nav-overlay');
    const onSide=SIDE.has(slots.front);
    const h=active && !locked && !animating && onSide;
    const set=(id,show)=>{const e=document.getElementById(id);if(e)e.style.display=show?'':'none';};
    set('cube-arrow-left', h);
    set('cube-arrow-right', h);
    set('cube-arrow-down', h && slots.front==='jouer');           // descendre vers Variantes
    set('cube-arrow-up',   active && !locked && !animating && slots.front==='variantes'); // remonter
  }

  // Réinitialise le cube à l'angle 0 avec les emplacements courants (sans
  // animation) → face avant nette et cliquable.
  function settle(){
    assignTransforms();
    cube.style.transition='none';
    cube.style.transform=REST;
    void cube.offsetWidth;      // reflow : fige l'état avant de réactiver la transition
    cube.style.transition='';
  }

  // Rotation ANIMÉE d'un cran puis rebase.
  function animate(kind,after){
    if(animating||!cube)return;
    animating=true; updateArrows();
    cube.style.transition='transform '+ROTATE_MS+'ms cubic-bezier(.22,.61,.36,1)';
    void cube.offsetWidth;
    cube.style.transform=REST+' '+CUBE_ANIM[kind];
    let done=false;
    const finish=()=>{
      if(done)return; done=true;
      cube.removeEventListener('transitionend',finish);
      slots=PERM[kind](slots);   // la face amenée au front devient « front »
      animating=false;
      settle();                  // cube revient à l'angle 0, faces réaffectées (aucun saut visuel)
      refresh();
      if(after)after();
    };
    cube.addEventListener('transitionend',finish);
    setTimeout(finish,ROTATE_MS+120); // filet de sécurité si transitionend ne se déclenche pas
  }

  // Amène une face au front SANS animation (utilisé quand le cube est masqué
  // par un overlay, ou pour un changement de page programmatique).
  function setFrontInstant(name){
    if(!cube)return;
    let g=0;
    while(slots.front!==name && g++<6){
      const s=slotOf(name);
      const kind = s==='right'?'right' : s==='left'?'left' : s==='top'?'up' : s==='bottom'?'down' : 'right';
      slots=PERM[kind](slots);
    }
    settle(); refresh();
  }

  // ---- Rotations déclenchées par l'utilisateur -------------------
  function nav(kind){ if(!locked && !animating && SIDE.has(slots.front)) animate(kind); }

  function lock(){ locked=true; refresh(); }
  function unlock(){ locked=false; refresh(); }

  function goToMainMenu(){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.body.classList.remove('nav-overlay');
    document.body.classList.add('cube-active');
    locked=false;
    slots=Object.assign({},CANON);   // disposition canonique (jouer devant, partie en haut)
    settle(); refresh();
  }
  window.goToMainMenu=goToMainMenu;

  // ---- Intégration avec showPage() -------------------------------
  function cubeOnShowPage(id){
    if(!cube)return;
    if(id==='page-login'){ document.body.classList.remove('cube-active','nav-overlay'); locked=false; return; }
    if(id==='face-jouer'){ goToMainMenu(); return; }
    const face=EMBED[id];
    if(face==='builder'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      locked=false; setFrontInstant('builder');
      return;
    }
    if(face==='game'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      // Rotation VERTICALE vers la face partie si elle est en haut (cas
      // normal : lancement depuis JOUER / builder). Sinon bascule directe.
      if(slotOf('game')==='top' && SIDE.has(slots.front)) animate('up', lock);
      else { setFrontInstant('game'); lock(); }
      return;
    }
    // Page secondaire (overlay) : elle couvre le cube. On masque le chrome du
    // cube et on remet la face JOUER au repos derrière l'overlay.
    const el=document.getElementById(id);
    if(el && el.classList.contains('page')) document.body.classList.add('nav-overlay');
    if(document.body.classList.contains('cube-active')){
      locked=false;
      if(slots.front!=='jouer') setFrontInstant('jouer');
    }
    updateArrows();
  }
  window.cubeOnShowPage=cubeOnShowPage;

  // ---- Bouton JOUER ----------------------------------------------
  function onJouer(){
    if(locked||animating)return;
    if(!(typeof army!=='undefined' && army && army.mon && army.gen && army.extras && army.extras.length===3)){
      if(typeof showNotif==='function')showNotif('Composez d\'abord une armée complète (flèche droite → composition).');
      setFrontInstant('builder');
      return;
    }
    currentArmyData = buildArmyDataFromBuilder();
    aiArmyData = generateAIArmy();
    // Réutilise EXACTEMENT le lancement actuel : modal instructeur puis
    // startGame() (qui appelle showPage('page-game') → rotation verticale).
    showAILevelModal(function(){
      _playerColor = Math.random()<0.5 ? 'w' : 'b';
      startGame(true);
    });
  }

  // ---- Init ------------------------------------------------------
  function init(){
    cube=document.getElementById('cube');
    if(!cube)return;
    // Déplace les vraies pages dans leurs faces (DOM déplacé, IDs/listeners intacts).
    const moveInto=(pageId,hostId)=>{
      const page=document.getElementById(pageId), host=document.getElementById(hostId);
      if(page&&host){ page.classList.remove('page'); page.classList.add('cube-embedded'); host.appendChild(page); }
    };
    moveInto('page-builder','face-viewport-builder');
    moveInto('page-game','face-viewport-game');

    // Flèches : DROITE = voir la face de droite (cube tourne à gauche), etc.
    document.getElementById('cube-arrow-right')?.addEventListener('click',()=>nav('right'));
    document.getElementById('cube-arrow-left') ?.addEventListener('click',()=>nav('left'));
    document.getElementById('cube-arrow-down') ?.addEventListener('click',()=>{ if(!locked&&!animating&&slots.front==='jouer')animate('down'); });
    document.getElementById('cube-arrow-up')   ?.addEventListener('click',()=>{ if(!locked&&!animating&&slots.front==='variantes')animate('up'); });
    document.getElementById('cube-jouer-btn')  ?.addEventListener('click',onJouer);

    document.addEventListener('keydown',e=>{
      if(locked||animating||!document.body.classList.contains('cube-active')||document.body.classList.contains('nav-overlay'))return;
      if(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
      if(e.key==='ArrowRight')nav('right');
      else if(e.key==='ArrowLeft')nav('left');
    });

    settle();     // positionne les faces + cube à l'angle 0
    refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
