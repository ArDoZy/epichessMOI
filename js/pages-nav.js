// ================================================================
// PAGES-NAV.JS : Navigation principale par PAGES QUI GLISSENT
// ================================================================
// Le jeu s'ouvrait sur un cube que l'on faisait tourner : quatre faces en
// boucle, une rotation 3D de 460 ms, et un « haut » réservé à la partie. Le
// cube racontait bien l'idée d'un laboratoire à plusieurs salles, mais il
// coûtait cher à comprendre — on ne sait jamais combien de faces il reste,
// ni de quel côté est la sortie — et cher à afficher (une couche de
// composition plein écran maintenue pour un objet immobile la plupart du
// temps).
//
// À la place : CINQ PAGES ALIGNÉES SUR UNE SEULE RANGÉE, que l'on parcourt de
// gauche à droite, comme dans Clash Royale. De gauche à droite :
//
//     MAGASIN · MES ARMÉES · COMBAT · GUERRE DES CLANS · VARIANTES
//
// COMBAT est au milieu, c'est la page d'accueil : on y revient toujours, et
// les deux moitiés de l'écran s'ouvrent de part et d'autre. La rangée n'est
// PAS un anneau — on ne repasse pas du magasin aux variantes en
// continuant vers la gauche. C'est la contrepartie du modèle : chaque page a
// une position fixe dans l'espace, et le joueur finit par savoir « le magasin
// est tout à gauche » sans y penser.
//
// La PARTIE (#page-game) n'est pas une page de la rangée : c'est un calque
// qui se pose PAR-DESSUS toute la rangée quand une bataille commence
// (body.in-game). Une partie n'est pas une destination que l'on visite, c'est
// un état dont on sort par la fin de la partie.
//
// Ce module ne connaît QUE la page courante, le glissement et le verrouillage
// pendant une partie. Il ignore totalement le fonctionnement du builder, du
// moteur, des comptes et de l'IA. Il déplace à l'exécution le DOM existant
// #page-armies / #page-game / #page-reserve dans les emplacements
// correspondants (IDs + listeners préservés → aucune logique réécrite),
// pilote le glissement quand showPage() cible une page de la rangée, et
// laisse les pages secondaires (builder, voie, adversaires, login) s'afficher
// en overlay plein écran au-dessus de la rangée.
//
// Dépendances : main.js (showPage y délègue), armies.js
// (startArmySelection / clearArmySelection : le bouton COMBAT ouvre "Mes
// armées" en mode sélection au lieu de lancer la partie lui-même) et
// tutorial.js (tutoInterceptCombat : pendant le tutoriel, COMBAT lance la
// bataille scriptée de l'étape en cours).
// ================================================================

(function(){
  // L'ORDRE EST LA CARTE DU JEU. Cette liste est la seule source de vérité :
  // la position des pages dans la rangée, l'ordre des onglets du bas et le
  // sens des flèches en découlent. Les changer ici les change partout — à
  // condition de garder le même ordre dans les onglets d'index.html, qui sont
  // écrits à la main pour leurs blasons.
  const PAGES=['magasin','armees','jouer','reserve','variantes'];
  const HOME=PAGES.indexOf('jouer');
  // Durée du glissement. Elle DOIT rester alignée sur la transition CSS de
  // #nav-track (voir [NAV] dans style.css) : c'est elle qui décide quand la
  // page d'arrivée redevient cliquable.
  const SLIDE_MS=320;
  // Les pages réelles déplacées dans la rangée au démarrage, et le nom de
  // l'emplacement qui les accueille.
  const EMBED={'page-armies':'armees','page-game':'game','page-reserve':'reserve'};

  let idx=HOME;           // page affichée (index dans PAGES)
  let track=null, stage=null;
  let locked=false;       // pendant une partie : la rangée ne bouge plus
  let inGame=false;       // le calque de la partie est posé par-dessus
  let animating=false;
  let slideTimer=0;
  // Page qui SERA à l'écran à la fin du glissement en cours. Le bouton de
  // réglages se règle dessus et non sur la page courante : voir
  // updateMainMenuFlag.
  let pending=null;

  const pageEl=name=>track&&track.querySelector('.nav-page[data-page="'+name+'"]');
  const current=()=>PAGES[idx];

  // ---- Rendu du contenu d'une page -------------------------------
  // Chaque page se recalcule à l'arrivée : l'inventaire, les coffres et l'ELO
  // bougent à chaque partie, une page rendue une seule fois au chargement
  // afficherait des données périmées.
  //
  // ELLE EST APPELÉE DEUX FOIS PAR NAVIGATION, ET C'EST VOULU : une fois au
  // départ du glissement, sur la page qui arrive (voir slideTo), et une fois
  // à l'arrivée. La première est celle qui compte : la page qui entre par le
  // bord de l'écran est déjà à jour QUAND ELLE DEVIENT VISIBLE, au lieu
  // d'être remplie une demi-seconde plus tard, sous les yeux du joueur. La
  // seconde rattrape ce qui aurait changé pendant le glissement.
  //
  // Cela n'a de sens que parce que ces rendus sont IDEMPOTENTS :
  // renderArmiesPage ne touche au DOM que si quelque chose a réellement changé
  // (voir pRenderCards, js/armies.js), et renderReservePage de même. Le second
  // appel ne coûte donc rien quand il n'a rien à faire. Rendre une page non
  // idempotente ferait revenir exactement le clignotement qu'on vient
  // d'enlever.
  function refreshPageContent(name){
    if(name==='reserve'&&typeof renderReservePage==='function')renderReservePage();
    else if(name==='armees'&&typeof renderArmiesPage==='function')renderArmiesPage();
    else if(name==='magasin'&&typeof renderMagasinPage==='function')renderMagasinPage();
    else if(name==='variantes'&&typeof renderVariantesPage==='function')renderVariantesPage();
    else if(name==='jouer'){
      if(typeof renderMenuChests==='function')renderMenuChests();
      if(typeof renderMenuIdentity==='function')renderMenuIdentity();
    }
  }

  // ---- État visuel ------------------------------------------------
  // UNE SEULE PAGE REÇOIT LES CLICS. Les quatre autres sont hors de l'écran,
  // mais elles restent dans le document : sans ce filtre, un bouton posé juste
  // au-delà du bord pourrait être atteint au clavier (Tab) ou par un clic sur
  // la frange visible pendant le glissement.
  function markFront(){
    if(!track)return;
    const front=inGame?'game':current();
    document.querySelectorAll('#nav-stage .nav-page').forEach(p=>{
      p.classList.toggle('is-front', p.dataset.page===front);
      // `inert` retire du parcours clavier ET du hit-testing tout un
      // sous-arbre : c'est ce que `pointer-events:none` ne sait pas faire.
      if('inert' in p) p.inert = p.dataset.page!==front;
    });
  }

  function isBrowsing(){
    return document.body.classList.contains('nav-active')
        && !document.body.classList.contains('nav-overlay');
  }

  // Les flèches restent cliquables PENDANT un glissement : c'est ce qui permet
  // d'enchaîner deux pages sans temps mort. Elles disparaissent en revanche au
  // bout de la rangée — il n'y a rien au-delà du magasin ni au-delà des
  // variantes, et une flèche qui ne mène nulle part est un mensonge.
  function updateChrome(){
    const active=isBrowsing() && !locked && !inGame;
    const dest=animating&&pending!=null?pending:idx;
    const set=(id,show)=>{const e=document.getElementById(id);if(e)e.style.display=show?'':'none';};
    set('nav-arrow-left',  active && dest>0);
    set('nav-arrow-right', active && dest<PAGES.length-1);
    set('nav-tabbar', active);
    // `rail-on` REFLÈTE la visibilité de la barre d'onglets pour la feuille de
    // style. En mode bureau, cette barre est un rail latéral, et la zone utile
    // de chaque page recule d'autant (voir [DESKTOP] dans css/style.css) : ce
    // retrait doit disparaître EXACTEMENT quand le rail disparaît — pendant
    // une partie, par exemple. Sans ce drapeau, le plateau aurait joué avec
    // une bande vide de 200 px sur sa gauche, parce que le CSS ne peut pas
    // lire le `style.display` posé juste au-dessus.
    document.body.classList.toggle('rail-on', active);
    updateTabs();
    updateMainMenuFlag(active);
  }

  // Allume l'onglet de la page affichée, éteint les autres.
  function updateTabs(){
    const bar=document.getElementById('nav-tabbar');
    if(!bar)return;
    const dest=animating&&pending!=null?PAGES[pending]:current();
    bar.querySelectorAll('.nav-tab').forEach(b=>{
      b.classList.toggle('is-active', b.dataset.page===dest);
    });
  }

  // LE BOUTON DE RÉGLAGES N'EST QUE SUR LE MENU PRINCIPAL. Il flottait en haut
  // à droite de tout le jeu, et chaque page lui réservait une bande vide en
  // haut qui repoussait son titre. `body.main-menu` allume le seul écran qui
  // le porte encore : la page COMBAT affichée, aucune page par-dessus.
  // LE DRAPEAU SUIT LA PAGE D'ARRIVÉE, PAS LA PAGE COURANTE : le bouton part
  // et revient EN MÊME TEMPS que le menu, au lieu d'arriver un tiers de
  // seconde après lui.
  function updateMainMenuFlag(active){
    const dest=animating&&pending!=null?PAGES[pending]:current();
    const on=!!active && dest==='jouer' && !inGame;
    document.body.classList.toggle('main-menu',on);
    if(!on)document.getElementById('settings-panel')?.classList.remove('open');
  }

  function refresh(){ markFront(); updateChrome(); refreshPageContent(current()); }

  // ---- Déplacement de la rangée -----------------------------------
  // La rangée entière se décale de -N largeurs d'écran : la page N se
  // retrouve pile dans le cadre. Une seule propriété animée (`transform`),
  // donc un travail entièrement pris en charge par le compositeur.
  function applyOffset(){ track.style.setProperty('--page', idx); }

  // LE REDIMENSIONNEMENT NE DOIT PAS S'ANIMER. Le décalage de la rangée est un
  // pourcentage de la largeur de l'écran : quand celle-ci change — on tourne le
  // téléphone, on redimensionne la fenêtre, la barre d'adresse se replie —, la
  // valeur résolue du `transform` change toute seule, et la transition qui
  // l'accompagne se met à l'ANIMER. La rangée dérive alors pendant un tiers de
  // seconde vers sa nouvelle place, et pire : tant que cette animation tourne,
  // les rectangles mesurés (getBoundingClientRect) sont ceux de la position
  // intermédiaire — la page affichée n'est plus là où le code croit qu'elle
  // est. On coupe donc la transition le temps d'une image à chaque
  // redimensionnement.
  function freezeForResize(){
    if(!track)return;
    track.classList.add('no-anim');
    void track.offsetWidth;
    requestAnimationFrame(()=>track.classList.remove('no-anim'));
  }

  // Pose sans animation (démarrage, retour au menu, changement de page
  // programmatique sous un overlay).
  function jumpTo(i){
    if(!track)return;
    clearTimeout(slideTimer);
    animating=false; pending=null;
    idx=Math.max(0,Math.min(PAGES.length-1,i));
    // Le contenu AVANT la pose : les deux tiennent dans la même tâche, donc
    // dans la même peinture — mais dans cet ordre, même un rendu lent ne peut
    // pas se voir arriver.
    refreshPageContent(current());
    track.classList.add('no-anim');
    applyOffset();
    // Ceinture et bretelles : le cadre ne doit jamais avoir défilé (voir
    // `overflow:clip` sur #nav-stage). Un navigateur qui ne connaît pas `clip`
    // retombe sur `hidden`, où un focus égaré dans une page hors cadre peut
    // encore décaler l'ensemble — ce zéro-là le remet en place.
    if(stage){stage.scrollLeft=0;stage.scrollTop=0;}
    void track.offsetWidth;           // reflow : fige l'état avant de réactiver la transition
    track.classList.remove('no-anim');
    refresh();
  }

  // Glissement ANIMÉ vers une page. Un second appel pendant l'animation n'est
  // pas ignoré : il repart de la position visée, ce qui permet d'enchaîner
  // deux pages d'affilée sans attendre.
  function slideTo(i,after){
    if(!track)return;
    i=Math.max(0,Math.min(PAGES.length-1,i));
    if(i===idx&&!animating){ if(after)after(); return; }
    pending=i;
    // `will-change` N'EST POSÉ QUE PENDANT LE GLISSEMENT (voir
    // #nav-track.is-sliding, css/style.css). En permanence, il réserve une
    // couche de composition de cinq écrans de large pour une rangée qui ne
    // bouge pas les quatre cinquièmes du temps : c'est de la mémoire vidéo
    // prise à un appareil qui n'en a pas.
    track.classList.add('is-sliding');
    animating=true;
    // LA PAGE QUI ARRIVE EST REMPLIE AVANT DE SE MONTRER. Elle est visible dès
    // le premier pixel du glissement : la remplir seulement à l'arrivée
    // revenait à la laisser entrer avec le contenu de la visite précédente,
    // puis à la réécrire une fois posée — le « rechargement » qu'on voyait.
    refreshPageContent(PAGES[i]);
    idx=i;
    applyOffset();
    updateChrome();                   // onglets et flèches suivent l'arrivée, pas le départ
    clearTimeout(slideTimer);
    slideTimer=setTimeout(()=>{
      animating=false; pending=null;
      track.classList.remove('is-sliding');
      refresh();
      if(after)after();
    },SLIDE_MS+20);
  }

  // ---- Navigation demandée par l'utilisateur ----------------------
  function nav(dir){
    if(locked||inGame||!isBrowsing())return;
    slideTo((animating&&pending!=null?pending:idx)+(dir==='right'?1:-1));
  }
  function goToPage(name){
    const i=PAGES.indexOf(name);
    if(i<0||locked||inGame)return;
    slideTo(i);
  }
  window.goToPage=goToPage;

  // ---- Le calque de la partie -------------------------------------
  // Une bataille n'est pas une destination : elle recouvre la rangée entière,
  // et rien ne peut en sortir tant qu'elle dure (les onglets et les flèches
  // s'effacent, le glissement et les touches fléchées ne répondent plus).
  function enterGame(){
    inGame=true; locked=true;
    document.body.classList.add('in-game');
    refreshPageContent('game');
    markFront(); updateChrome();
  }
  function leaveGame(){
    if(!inGame&&!locked)return;
    inGame=false; locked=false;
    document.body.classList.remove('in-game');
    markFront(); updateChrome();
  }

  // ---- Boutons du menu --------------------------------------------
  // COMBAT = affronter un autre JOUEUR : c'est l'action principale du jeu,
  // elle mérite le gros bouton. Elle amène sur "Mes armées" en mode
  // sélection (voir armies.js), puis sur la page d'engagement en ligne.
  function onCombat(){
    if(locked||inGame)return;
    if(typeof tutoInterceptCombat==='function'&&tutoInterceptCombat())return;
    if(typeof startArmySelection==='function')startArmySelection('online');
  }
  // Bouton secondaire « Adversaires » : il ouvre la galerie des douze
  // adversaires (js/adversaires.js), qui enchaîne elle-même sur la sélection
  // d'armée.
  function onVsIa(){
    if(locked||inGame)return;
    // Pendant le tutoriel, tout départ au combat mène à la bataille scriptée
    // de l'étape en cours : le joueur n'a pas encore d'armée à sélectionner.
    if(typeof tutoInterceptCombat==='function'&&tutoInterceptCombat())return;
    if(typeof showAdversairesPage==='function')showAdversairesPage();
    else if(typeof startArmySelection==='function')startArmySelection('ia');
  }

  // ---- Retour au menu ---------------------------------------------
  function goToMainMenu(){
    // Retour au menu = retour à l'adresse d'origine (/ ou /test) : /combat ne
    // désigne qu'une partie en ligne effectivement en cours.
    if(typeof setAppPath==='function'&&typeof appHomePath==='function')setAppPath(appHomePath());
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.body.classList.remove('nav-overlay');
    document.body.classList.add('nav-active');
    leaveGame();
    if(typeof clearArmySelection==='function')clearArmySelection();
    jumpTo(HOME);
  }
  window.goToMainMenu=goToMainMenu;

  // ---- Intégration avec showPage() --------------------------------
  function navOnShowPage(id){
    if(!track)return;
    if(id==='page-jouer'||id==='face-jouer'){ goToMainMenu(); return; }
    const slot=EMBED[id];
    if(slot==='armees'||slot==='reserve'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('nav-active');
      leaveGame();
      jumpTo(PAGES.indexOf(slot));
      return;
    }
    if(slot==='game'){
      document.body.classList.remove('nav-overlay');
      document.body.classList.add('nav-active');
      enterGame();
      return;
    }
    // Page secondaire (overlay) : elle couvre la rangée. On masque le chrome
    // de navigation et on repose la rangée sur COMBAT derrière l'overlay. Le
    // builder (composition d'armée de l'IA), la Voie, la galerie des
    // adversaires et le classement sont de ces pages-là.
    const el=document.getElementById(id);
    if(el && el.classList.contains('page')) document.body.classList.add('nav-overlay');
    if(document.body.classList.contains('nav-active')){
      leaveGame();
      if(current()!=='jouer') jumpTo(HOME);
    }
    updateChrome();
  }
  window.navOnShowPage=navOnShowPage;

  // Une partie est-elle réellement à l'écran ? Exposé pour la page Comptes,
  // qui refuse de changer de compte en pleine partie (accountBusy,
  // js/account-ui.js) : l'objet GS, lui, survit à la fin d'une partie et ne
  // dit donc rien sur ce que le joueur est en train de faire.
  window.navIsInGame=function(){return inGame;};

  // ---- GLISSEMENT DU DOIGT ----------------------------------------
  // Sur téléphone, c'est LE geste de navigation : les deux flèches sont un
  // secours, pas le moyen principal.
  //
  // Le sens est celui d'une pile de cartes qu'on pousse : le doigt qui va vers
  // la DROITE tire la rangée vers la droite, et découvre donc la page de
  // GAUCHE. C'est exactement ce que fait un carrousel de photos, et c'est
  // l'inverse de ce que font les flèches (qui, elles, DÉSIGNENT la page à
  // faire venir).
  //
  // Deux garde-fous, sinon le geste se déclenche tout le temps :
  //   · le glissement doit être franchement HORIZONTAL (sinon c'est un
  //     défilement de la page : la Guerre des clans et « Mes armées » défilent) ;
  //   · il doit couvrir au moins 12 % de la largeur de l'écran — un seuil en
  //     pourcentage, pas en pixels, pour se comporter pareil sur un petit
  //     téléphone et sur une tablette.
  // Le point de départ, lui, n'est PAS filtré par défaut : la majorité de
  // l'écran est couverte de cartes/boutons (coffres, pièces, armées...), un
  // filtre large y rendait le glissement quasi inopérant hors du fond nu.
  // Comme un tap ne parcourt pas 12 % de l'écran, il n'y a pas de conflit avec
  // les clics. Seules restent exclues les zones où un glissement horizontal a
  // déjà un autre sens : le plateau de jeu (déplacer une pièce) et les zones
  // qui défilent horizontalement elles-mêmes.
  const SWIPE_RATIO=0.12;      // fraction de la largeur d'écran à parcourir
  const SWIPE_MAX_MS=700;      // au-delà, c'est un déplacement, pas un geste
  function swipeBlocked(target){
    return !!(target&&target.closest&&target.closest(
      'input,textarea,select,.game-board,.pmv,.psheet,.game-panel,[data-noswipe]'));
  }
  function wireSwipe(){
    if(!stage)return;
    let x0=0,y0=0,t0=0,live=false;
    stage.addEventListener('touchstart',e=>{
      live=false;
      if(e.touches.length!==1)return;
      if(locked||inGame||!isBrowsing())return;
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

  // ---- Init --------------------------------------------------------
  function init(){
    stage=document.getElementById('nav-stage');
    track=document.getElementById('nav-track');
    if(!track)return;
    // Déplace les vraies pages dans leurs emplacements (DOM déplacé,
    // IDs/listeners intacts).
    const moveInto=(pageId,hostId)=>{
      const page=document.getElementById(pageId), host=document.getElementById(hostId);
      if(page&&host){ page.classList.remove('page'); page.classList.add('nav-embedded'); host.appendChild(page); }
    };
    moveInto('page-armies','page-viewport-armees');
    moveInto('page-game','page-viewport-game');
    moveInto('page-reserve','page-viewport-reserve');

    // Position de chaque page dans la rangée : la seule chose que le CSS ne
    // peut pas déduire tout seul, et qui doit rester d'accord avec PAGES.
    PAGES.forEach((name,i)=>{ const el=pageEl(name); if(el)el.style.setProperty('--i',i); });

    document.getElementById('nav-arrow-right')?.addEventListener('click',()=>nav('right'));
    document.getElementById('nav-arrow-left') ?.addEventListener('click',()=>nav('left'));
    document.getElementById('combat-btn')     ?.addEventListener('click',onCombat);
    document.getElementById('b-vs-ia')        ?.addEventListener('click',onVsIa);
    // LA DIAGONALE DE LA PUISSANCE s'ouvre en page à part entière depuis le
    // SOCLE DE L'ARÈNE, au milieu du menu.
    document.getElementById('jouer-arena')    ?.addEventListener('click',()=>{
      if(typeof renderVoiePage==='function')renderVoiePage();
      showPage('page-voie');
    });
    document.querySelectorAll('#nav-tabbar .nav-tab').forEach(b=>{
      b.addEventListener('click',()=>goToPage(b.dataset.page));
    });

    document.addEventListener('keydown',e=>{
      if(locked||inGame||!isBrowsing())return;
      if(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
      if(e.key==='ArrowRight')nav('right');
      else if(e.key==='ArrowLeft')nav('left');
    });

    wireSwipe();
    window.addEventListener('resize',freezeForResize);
    window.addEventListener('orientationchange',freezeForResize);

    jumpTo(HOME);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
