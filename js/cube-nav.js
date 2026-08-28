// ================================================================
// CUBE-NAV.JS : Navigation principale par cube (illusion 3D CSS)
// ================================================================
// Remplace UNIQUEMENT la navigation de haut niveau par un cube qui tourne
// par incréments de 90°. Ce module ne connaît QUE la face courante, les
// rotations et le verrouillage pendant une partie. Il ignore totalement le
// fonctionnement du builder, du moteur, des comptes et de l'IA.
//
// Il déplace à l'exécution le DOM existant #page-armies et #page-game dans
// les faces correspondantes (IDs + listeners préservés → aucune logique
// réécrite), pilote la rotation quand showPage() cible une face, et laisse
// les pages secondaires (builder, voie, combat, login) s'afficher en
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
// Dépendances : main.js (showPage y délègue), armies.js
// (startArmySelection / clearArmySelection : le bouton COMBAT ouvre "Mes
// armées" en mode sélection au lieu de lancer la partie lui-même) et
// tutorial.js (tutoInterceptCombat : pendant le tutoriel, COMBAT lance la
// bataille scriptée de l'étape en cours).
// ================================================================

(function(){
  // Emplacements 3D fixes autour de la caméra. Une seule face occupe le
  // « front » (angle 0) à la fois : c'est la seule interactive.
  const SLOT_TF={
    front :'translateZ(50vmax)',
    right :'rotateY(90deg) translateZ(50vmax)',
    back  :'rotateY(180deg) translateZ(50vmax)',
    left  :'rotateY(-90deg) translateZ(50vmax)',
    top   :'rotateX(90deg) translateZ(50vmax)',
    bottom:'rotateX(-90deg) translateZ(50vmax)'
  };
  const REST='translateZ(-50vmax)';
  // Durée de rotation : doit correspondre à la transition CSS de #cube
  // (voir [CUBE] dans style.css). Assez courte pour rester fluide et pour
  // qu'on puisse enchaîner deux rotations sans temps mort perceptible
  // (voir queuedKind plus bas : un second clic pendant l'animation en cours
  // est mémorisé et rejoué instantanément à la fin de celle-ci).
  // Rotation volontairement posée : à 280 ms le cube « claquait » d'une face
  // à l'autre et on perdait le sens du déplacement, qui est justement tout
  // l'intérêt d'une navigation par cube. La transition CSS de #cube (voir
  // [CUBE] dans style.css) doit rester alignée sur cette valeur.
  const ROTATE_MS=460;
  // Disposition canonique (au menu principal). La face de droite est
  // "armees" (Mes armées) : le builder (composition) n'est plus une face du
  // cube, c'est un overlay ouvert depuis "Mes armées" (bouton "Nouvelle armée").
  // La face de gauche s'appelle « magasin » : elle a porté la Voie des
  // Victoires, repartie en page à part entière (bouton « Voie » du menu
  // principal). Elle reste dans le cycle de rotation — quatre côtés — mais
  // n'a pas encore de contenu (boutique à construire). La face du bas
  // (Variantes) a été retirée ; son emplacement 3D reste déclaré parce que
  // les permutations de rotation le référencent, mais aucune face ne l'occupe.
  const CANON={front:'jouer',right:'armees',back:'reserve',left:'magasin',top:'game',bottom:null};
  const SIDE=new Set(['jouer','armees','reserve','magasin']);
  const EMBED={'page-armies':'armees','page-game':'game','page-reserve':'reserve'};


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
  // Face qui SERA devant à la fin de la rotation en cours (null au repos).
  // Le bouton de réglages se règle dessus et non sur la face courante : voir
  // updateMainMenuFlag.
  let pendingFront=null;
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
    refreshFaceContent(slots.front);
  }
  // Chaque face se recalcule à l'arrivée : l'inventaire, les coffres et l'ELO
  // bougent à chaque partie, une face rendue une seule fois au chargement
  // afficherait des données périmées.
  function refreshFaceContent(name){
    if(name==='reserve'&&typeof renderReservePage==='function')renderReservePage();
    else if(name==='armees'&&typeof renderArmiesPage==='function')renderArmiesPage();
    else if(name==='magasin'&&typeof renderMagasinPage==='function')renderMagasinPage();
    else if(name==='jouer'){
      if(typeof renderMenuChests==='function')renderMenuChests();
      if(typeof renderMenuIdentity==='function')renderMenuIdentity();
    }
  }
  // Les flèches restent visibles/cliquables PENDANT une rotation (elles ne
  // dépendent plus de `animating`) : c'est ce qui permet d'enchaîner deux
  // rotations sans temps mort : le clic pendant l'animation en cours est mis
  // en file par animate() et rejoué instantanément à la fin de celle-ci.
  function updateArrows(){
    const active=document.body.classList.contains('cube-active') && !document.body.classList.contains('nav-overlay');
    const onSide=SIDE.has(slots.front);
    const h=active && !locked && onSide;
    const set=(id,show)=>{const e=document.getElementById(id);if(e)e.style.display=show?'':'none';};
    set('cube-arrow-left', h);
    set('cube-arrow-right', h);
    set('cube-facebar', h);
    // `rail-on` REFLÈTE la visibilité de la barre des faces pour la feuille de
    // style. En mode bureau, cette barre est un rail latéral, et la zone utile
    // de chaque face recule d'autant (voir [DESKTOP] dans css/style.css) : ce
    // retrait doit disparaître EXACTEMENT quand le rail disparaît — pendant
    // une partie, par exemple, où le cube est verrouillé. Sans ce drapeau, le
    // plateau aurait joué avec une bande vide de 200 px sur sa gauche, parce
    // que le CSS ne peut pas lire le `style.display` posé juste au-dessus.
    document.body.classList.toggle('rail-on', h);
    updateFacebar();
    updateMainMenuFlag(active);
  }
  // LE BOUTON DE RÉGLAGES N'EST QUE SUR LE MENU PRINCIPAL. Il flottait en haut
  // à droite de tout le jeu, et chaque page lui réservait une bande vide en
  // haut qui repoussait son titre. `body.main-menu` allume le seul écran qui
  // le porte encore : la face JOUER devant, aucune page par-dessus. Tout ce
  // qui en découle est dans la feuille de style (voir [SETTINGS]), y compris
  // la fermeture du panneau quand on s'en va.
  // LE DRAPEAU SUIT LA FACE D'ARRIVÉE, PAS LA FACE COURANTE. Il exigeait
  // `!animating` : pendant les 460 ms d'une rotation, aucune face n'est
  // considérée comme devant, et le bouton de réglages n'apparaissait donc
  // qu'une DEMI-SECONDE APRÈS le menu principal, une fois la rotation
  // terminée — un bouton qui arrive en retard sur son propre écran. Il se
  // règle maintenant sur `pendingFront`, la face que la rotation en cours
  // amène : le bouton part et revient EN MÊME TEMPS que le menu, et il n'est
  // toujours allumé que là où il doit l'être (une rotation vers la face
  // partie l'éteint dès son premier degré).
  function updateMainMenuFlag(active){
    const front=animating&&pendingFront?pendingFront:slots.front;
    const on=!!active && front==='jouer';
    document.body.classList.toggle('main-menu',on);
    if(!on)document.getElementById('settings-panel')?.classList.remove('open');
  }
  // Allume le logo de la face affichée dans le repère du bas, éteint les
  // trois autres.
  function updateFacebar(){
    const bar=document.getElementById('cube-facebar');
    if(!bar)return;
    bar.querySelectorAll('.cube-facebar-btn').forEach(b=>{
      b.classList.toggle('is-active', b.dataset.face===slots.front);
    });
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
    animating=true; pendingFront=PERM[kind](slots).front; updateArrows();
    cube.style.transition='transform '+ROTATE_MS+'ms cubic-bezier(.22,.61,.36,1)';
    void cube.offsetWidth;
    cube.style.transform=REST+' '+CUBE_ANIM[kind];
    let done=false;
    const finish=()=>{
      if(done)return; done=true;
      cube.removeEventListener('transitionend',finish);
      slots=PERM[kind](slots);   // la face amenée au front devient « front »
      animating=false; pendingFront=null;
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
  // mise en file par animate()) plutôt que de l'ignorer, c'est ce qui
  // permet d'enchaîner deux rotations sans attendre.
  function nav(kind){ if(!locked && (animating || SIDE.has(slots.front))) animate(kind); }

  // Amène directement une face au front, avec animation (une ou deux
  // rotations enchaînées selon sa position dans le cycle), utilisé par les
  // logos du repère du bas.
  function goToFace(name){
    if(locked||animating||!SIDE.has(name)||slots.front===name)return;
    const path=[];
    let s=Object.assign({},slots),g=0;
    while(s.front!==name && g++<3){
      let pos; for(const k in s) if(s[k]===name){ pos=k; break; }
      const kind = pos==='left' ? 'left' : 'right'; // 'back' : deux pas à droite
      path.push(kind);
      s=PERM[kind](s);
    }
    let i=0;
    (function step(){ if(i>=path.length)return; animate(path[i++],step); })();
  }
  // Bouton secondaire « Adversaires » : il ouvre la galerie des douze
  // adversaires (js/adversaires.js), qui enchaîne elle-même sur la sélection
  // d'armée. Auparavant il partait directement affronter l'Instructeur, seul
  // adversaire du jeu — il n'y avait rien à choisir.
  function onVsIa(){
    if(locked||animating)return;
    // Pendant le tutoriel, tout départ au combat mène à la bataille scriptée
    // de l'étape en cours : le joueur n'a pas encore d'armée à sélectionner.
    if(typeof tutoInterceptCombat==='function'&&tutoInterceptCombat())return;
    if(typeof showAdversairesPage==='function')showAdversairesPage();
    else if(typeof startArmySelection==='function')startArmySelection('ia');
  }

  function lock(){ locked=true; refresh(); }
  function unlock(){ locked=false; refresh(); }

  function goToMainMenu(){
    // Retour au menu = retour à l'adresse d'origine (/ ou /test) : /combat ne
    // désigne qu'une partie en ligne effectivement en cours.
    if(typeof setAppPath==='function'&&typeof appHomePath==='function')setAppPath(appHomePath());
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.body.classList.remove('nav-overlay');
    document.body.classList.add('cube-active');
    locked=false; pendingFront=null;
    if(typeof clearArmySelection==='function')clearArmySelection();
    slots=Object.assign({},CANON);   // disposition canonique (jouer devant, partie en haut)
    settle(); refresh();
  }
  window.goToMainMenu=goToMainMenu;

  // ---- Intégration avec showPage() -------------------------------
  function cubeOnShowPage(id){
    if(!cube)return;
    if(id==='face-jouer'){ goToMainMenu(); return; }
    const face=EMBED[id];
    if(face==='armees'||face==='reserve'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('cube-active');
      locked=false; setFrontInstant(face);
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
  // Une partie est-elle réellement à l'écran ? `locked` est vrai pendant une
  // partie (le cube refuse alors de tourner), et la face partie est au front.
  // Exposé pour la page Comptes, qui refuse de changer de compte en pleine
  // partie (accountBusy, js/account-ui.js) : l'objet GS, lui, survit à la fin
  // d'une partie et ne dit donc rien sur ce que le joueur est en train de
  // faire.
  window.cubeIsInGame=function(){return locked&&slots.front==='game';};

  // ---- Bouton COMBAT ---------------------------------------------
  // COMBAT = affronter un autre JOUEUR : c'est l'action principale du jeu,
  // elle mérite le gros bouton. Elle amène sur "Mes armées" en mode
  // sélection (voir armies.js), puis sur la page d'engagement en ligne.
  function onCombat(){
    if(locked||animating)return;
    if(typeof tutoInterceptCombat==='function'&&tutoInterceptCombat())return;
    if(typeof startArmySelection==='function')startArmySelection('online');
  }

  // ---- GLISSEMENT DU DOIGT ---------------------------------------
  // Sur téléphone, c'est LE geste de navigation : les deux flèches sont un
  // secours, pas le moyen principal.
  //
  // Le sens est celui d'une pile de cartes qu'on pousse, pas celui d'une
  // manette : le doigt qui va vers la DROITE tire le contenu vers la droite,
  // et découvre donc ce qui était à GAUCHE. Un doigt vers la GAUCHE amène la
  // face de droite. C'est exactement ce que fait un carrousel de photos, et
  // c'est l'inverse de ce que font les flèches (qui, elles, DÉSIGNENT la face
  // à faire venir).
  //
  // Deux garde-fous, sinon le geste se déclenche tout le temps :
  //   · le glissement doit être franchement HORIZONTAL (sinon c'est un
  //     défilement de la page : l'Armurerie et « Mes armées » défilent) ;
  //   · il doit couvrir au moins 12 % de la largeur de l'écran — un seuil en
  //     pourcentage, pas en pixels, pour se comporter pareil sur un petit
  //     téléphone et sur une tablette.
  // Le point de départ, lui, N'EST PLUS filtré par défaut : la majorité de
  // l'écran est couverte de cartes/boutons (coffres, pièces, armées...), un
  // filtre large y rendait le glissement quasi inopérant hors du fond nu.
  // Comme un tap ne parcourt pas 12 % de l'écran, il n'y a pas de conflit
  // avec les clics. Seules restent exclues les zones où un glissement
  // horizontal a déjà un autre sens : le plateau de jeu (déplacer une pièce)
  // et les zones qui défilent horizontalement elles-mêmes.
  const SWIPE_RATIO=0.12;      // fraction de la largeur d'écran à parcourir
  const SWIPE_MAX_MS=700;      // au-delà, c'est un déplacement, pas un geste
  function swipeBlocked(target){
    return !!(target&&target.closest&&target.closest(
      'input,textarea,select,.game-board,.pmv,.psheet,.move-log,[data-noswipe]'));
  }
  function wireSwipe(){
    const stage=document.getElementById('cube-stage');
    if(!stage)return;
    let x0=0,y0=0,t0=0,live=false;
    stage.addEventListener('touchstart',e=>{
      live=false;
      if(e.touches.length!==1)return;
      if(locked||!document.body.classList.contains('cube-active')||
         document.body.classList.contains('nav-overlay'))return;
      if(swipeBlocked(e.target))return;
      const t=e.touches[0];
      x0=t.clientX;y0=t.clientY;t0=Date.now();live=true;
    },{passive:true});
    stage.addEventListener('touchend',e=>{
      if(!live)return;
      live=false;
      const t=e.changedTouches&&e.changedTouches[0];
      if(!t)return;
      if(Date.now()-t0>SWIPE_MAX_MS)return;
      const dx=t.clientX-x0,dy=t.clientY-y0;
      if(Math.abs(dx)<window.innerWidth*SWIPE_RATIO)return;
      if(Math.abs(dx)<Math.abs(dy)*1.4)return;   // geste trop vertical
      nav(dx>0?'left':'right');
    },{passive:true});
    stage.addEventListener('touchcancel',()=>{live=false;},{passive:true});
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
    moveInto('page-reserve','face-viewport-reserve');

    // Flèches : DROITE = voir la face de droite (cube tourne à gauche), etc.
    document.getElementById('cube-arrow-right')?.addEventListener('click',()=>nav('right'));
    document.getElementById('cube-arrow-left') ?.addEventListener('click',()=>nav('left'));
    document.getElementById('cube-jouer-btn')  ?.addEventListener('click',onCombat);
    document.getElementById('b-vs-ia')         ?.addEventListener('click',onVsIa);
    // « Voie » : la Diagonale de la Puissance (ex-« Voie des Victoires »)
    // n'est plus une face du cube, elle s'ouvre en page à part entière depuis
    // le bloc d'identité du menu.
    document.getElementById('jouer-voie')      ?.addEventListener('click',()=>{
      if(typeof renderVoiePage==='function')renderVoiePage();
      showPage('page-voie');
    });
    document.querySelectorAll('#cube-facebar .cube-facebar-btn').forEach(b=>{
      b.addEventListener('click',()=>goToFace(b.dataset.face));
    });

    document.addEventListener('keydown',e=>{
      if(locked||!document.body.classList.contains('cube-active')||document.body.classList.contains('nav-overlay'))return;
      if(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
      if(e.key==='ArrowRight')nav('right');
      else if(e.key==='ArrowLeft')nav('left');
    });

    wireSwipe();

    settle();     // positionne les faces + cube à l'angle 0
    refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
