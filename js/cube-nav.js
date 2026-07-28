// ================================================================
// CUBE-NAV.JS — Navigation principale par cube (illusion 3D CSS)
// ================================================================
// Remplace UNIQUEMENT la navigation de haut niveau par un cube qui tourne
// par incréments de 90°. Ce module ne connaît QUE la face courante, les
// rotations et le verrouillage pendant une partie. Il ignore totalement le
// fonctionnement du builder, du moteur, des comptes et de l'IA.
//
// Il déplace à l'exécution le DOM existant #page-armies et #page-game dans
// les faces correspondantes (IDs + listeners préservés → aucune logique
// réécrite), pilote la rotation quand showPage() cible une face, et laisse
// les pages secondaires (builder, voie, tournoi, combat, login) s'afficher en
// overlay plein écran au-dessus du cube. Le builder (composition d'armée)
// n'est PAS une face du cube : on y accède depuis "Mes armées" (bouton
// "Nouvelle armée" / "Modifier"), comme n'importe quelle page secondaire.
//
// -- POINT TECHNIQUE IMPORTANT --------------------------------------------
// Le hit-testing des clics est FIABLE uniquement quand la face avant est à
// l'angle 0 (aucune rotation nette). Une face amenée au front par une
// rotation 3D persistante s'affiche au bon endroit mais ne reçoit pas les
// clics. On applique donc la technique du « rebase » : le cube tourne pour
// l'ANIMATION (volontairement lente, voir ROTATE_MS) puis, à la fin, on
// réinitialise discrètement le cube à l'angle 0 et on réaffecte chaque face
// à son nouvel emplacement. Résultat : au repos, la face avant est TOUJOURS
// à l'angle 0 → clics/drag fiables.
//
// Dépendances : main.js (showPage y délègue) et armies.js
// (startArmySelection / clearArmySelection : le bouton COMBAT ouvre "Mes
// armées" en mode sélection au lieu de lancer la partie lui-même).
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
  // (voir [CUBE] dans style.css). Assez courte pour rester fluide et pour
  // qu'on puisse enchaîner deux rotations sans temps mort perceptible
  // (voir queuedKind plus bas : un second clic pendant l'animation en cours
  // est mémorisé et rejoué instantanément à la fin de celle-ci).
  const ROTATE_MS=280;
  // Disposition canonique (au menu principal). La face de droite est
  // "armees" (Mes armées) — le builder (composition) n'est plus une face du
  // cube, c'est un overlay ouvert depuis "Mes armées" (bouton "Nouvelle armée").
  const CANON={front:'jouer',right:'armees',back:'magasin',left:'missions',top:'game',bottom:'variantes'};
  const SIDE=new Set(['jouer','armees','magasin','missions']);
  const EMBED={'page-armies':'armees','page-game':'game'};

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
  // Rotation demandée pendant qu'une autre est déjà en cours : rejouée
  // immédiatement à la fin de l'animation courante (permet d'enchaîner deux
  // rotations sans avoir à attendre puis re-cliquer).
  let queuedKind=null;

  const faceEl=name=>cube.querySelector('.cube-face[data-face="'+name+'"]');
  const slotOf=name=>{ for(const s in slots) if(slots[s]===name) return s; };

  function assignTransforms(){ for(const s in slots){ const el=faceEl(slots[s]); if(el)el.style.transform=SLOT_TF[s]; } }

  function refresh(){
    if(!cube)return;
    cube.querySelectorAll('.cube-face').forEach(f=>f.classList.toggle('is-front', f.dataset.face===slots.front));
    updateArrows();
  }
  // Les flèches restent visibles/cliquables PENDANT une rotation (elles ne
  // dépendent plus de `animating`) : c'est ce qui permet d'enchaîner deux
  // rotations sans temps mort — le clic pendant l'animation en cours est mis
  // en file par animate() et rejoué instantanément à la fin de celle-ci.
  function updateArrows(){
    const active=document.body.classList.contains('cube-active') && !document.body.classList.contains('nav-overlay');
    const onSide=SIDE.has(slots.front);
    const h=active && !locked && onSide;
    const set=(id,show)=>{const e=document.getElementById(id);if(e)e.style.display=show?'':'none';};
    set('cube-arrow-left', h);
    set('cube-arrow-right', h);
    set('cube-arrow-down', h && slots.front==='jouer');           // descendre vers Variantes
    set('cube-arrow-up',   active && !locked && slots.front==='variantes'); // remonter
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

  // Rotation ANIMÉE d'un cran puis rebase. Si une rotation est déjà en
  // cours, la nouvelle demande est simplement mémorisée (queuedKind) plutôt
  // qu'ignorée : elle est rejouée dès que l'animation en cours se termine,
  // sans que l'utilisateur ait besoin de recliquer.
  function animate(kind,after){
    if(!cube)return;
    if(animating){ queuedKind=kind; return; }
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
      if(queuedKind && !locked){
        const k=queuedKind; queuedKind=null; animate(k);
      }else queuedKind=null;
    };
    cube.addEventListener('transitionend',finish);
    setTimeout(finish,ROTATE_MS+40); // filet de sécurité si transitionend ne se déclenche pas
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
  // Pendant une animation en cours, on laisse passer la demande (elle sera
  // mise en file par animate()) plutôt que de l'ignorer — c'est ce qui
  // permet d'enchaîner deux rotations sans attendre.
  function nav(kind){ if(!locked && (animating || SIDE.has(slots.front))) animate(kind); }

  function lock(){ locked=true; refresh(); }
  function unlock(){ locked=false; refresh(); }

  function goToMainMenu(){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.body.classList.remove('nav-overlay');
    document.body.classList.add('cube-active');
    locked=false;
    if(typeof clearArmySelection==='function')clearArmySelection();
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
    if(face==='armees'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      locked=false; setFrontInstant('armees');
      return;
    }
    if(face==='game'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      // Rotation VERTICALE vers la face partie si elle est en haut (cas
      // normal : lancement depuis JOUER / armées). Sinon bascule directe.
      if(slotOf('game')==='top' && SIDE.has(slots.front)) animate('up', lock);
      else { setFrontInstant('game'); lock(); }
      return;
    }
    // Page secondaire (overlay) : elle couvre le cube. On masque le chrome du
    // cube et on remet la face JOUER au repos derrière l'overlay. Le builder
    // (composition d'armée) est désormais l'une de ces pages secondaires
    // (ouvert depuis "Mes armées" → "Nouvelle armée"/"Modifier").
    const el=document.getElementById(id);
    if(el && el.classList.contains('page')) document.body.classList.add('nav-overlay');
    if(document.body.classList.contains('cube-active')){
      locked=false;
      if(slots.front!=='jouer') setFrontInstant('jouer');
    }
    updateArrows();
  }
  window.cubeOnShowPage=cubeOnShowPage;

  // ---- Bouton COMBAT ---------------------------------------------
  // Ne lance plus la partie directement : amène sur "Mes armées" en mode
  // sélection (voir armies.js). Le clic sur une carte enchaîne ensuite le
  // flux habituel — page de prévisualisation, instructeur, armées en
  // présence, puis la partie.
  function onCombat(){
    if(locked||animating)return;
    if(typeof startArmySelection==='function')startArmySelection('combat');
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
    moveInto('page-armies','face-viewport-armees');
    moveInto('page-game','face-viewport-game');

    // Flèches : DROITE = voir la face de droite (cube tourne à gauche), etc.
    document.getElementById('cube-arrow-right')?.addEventListener('click',()=>nav('right'));
    document.getElementById('cube-arrow-left') ?.addEventListener('click',()=>nav('left'));
    document.getElementById('cube-arrow-down') ?.addEventListener('click',()=>{ if(!locked&&(animating||slots.front==='jouer'))animate('down'); });
    document.getElementById('cube-arrow-up')   ?.addEventListener('click',()=>{ if(!locked&&(animating||slots.front==='variantes'))animate('up'); });
    document.getElementById('cube-jouer-btn')  ?.addEventListener('click',onCombat);

    document.addEventListener('keydown',e=>{
      if(locked||!document.body.classList.contains('cube-active')||document.body.classList.contains('nav-overlay'))return;
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
