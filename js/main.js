// ================================================================
// MAIN.JS : État global partagé, navigation entre pages, utilitaires communs
// ================================================================
// Contient : l'état global de l'armée en cours de composition (`army`),
// l'état des filtres du builder, les listes d'armées sauvegardées, le mode
// builder courant, showPage(), showNotif(), le menu contextuel factorisé
// (showPieceCtxMenu) utilisé par plusieurs pages, le parchemin d'accueil
// (showLoreIntro dans js/lore-intro.js, appelé par accounts.js à la création
// compte), et l'appel d'init final.
//
// Dépendances : data-pieces.js (PIECES, CLASS_COLOR_VARS)
// Chargé après data-pieces.js et accounts.js, avant tous les modules de page.
// La plupart des autres modules lisent/écrivent les variables globales
// définies ici (army, savedArmies, savedAiArmies, editingArmyId, builderMode,
// currentArmyData, aiArmyData, VV_UNLOCKED, etc.)
// ================================================================

// ----------------------------------------------------------------
// ÉTAT GLOBAL PARTAGÉ (lu/écrit par builder.js, armies.js, combat-intro.js,
// game-flow.js, voie.js, settings-admin.js)
// ----------------------------------------------------------------
// army.extras : liste ORDONNÉE des 3 pièces choisies (l'ordre définit la
// disposition en partie, voir builder.js::derivePlacements).
let army={mon:null,gen:null,extras:[]};
let savedArmies=[];
let savedAiArmies=[];
let editingArmyId=null;
let builderMode='player';
let currentArmyData=null;
let aiArmyData=null;
let VV_UNLOCKED=new Set();
// MODE TEST : ce n'est pas un interrupteur posé sur le jeu normal, c'est une
// ADRESSE (voir juste en dessous). On y entre et on en sort par les réglages,
// et l'adresse affichée dit toujours de quel côté on se trouve — impossible
// d'oublier qu'on y est et de s'étonner ensuite que l'ELO ne bouge pas.
// Dedans, tout est débloqué et illimité, et RIEN n'est enregistré : les
// lectures d'inventaire, de perles, d'ELO et de déblocages sont détournées
// (js/economy.js, js/accounts.js) et les écritures ignorées.

// ----------------------------------------------------------------
// ADRESSES DU JEU : /, /combat, et le mode admin en ?test
// ----------------------------------------------------------------
// Le jeu est une page unique, mais deux adresses ont un sens pour le joueur :
//   /        le jeu normal
//   /combat  une partie en cours contre un autre joueur (adresse partageable,
//            et surtout : l'onglet dit ce qu'on est en train de faire)
// et le mode admin s'ajoute à l'une comme à l'autre sous forme de PARAMÈTRE
// (`/?test`, `/combat?test`).
//
// POURQUOI UN PARAMÈTRE ET NON UN CHEMIN /test ?
// Parce que /test répondait 404 en production. Un chemin qui ne correspond à
// aucun fichier n'existe que si l'hébergeur accepte de le réécrire vers
// index.html, ce qui dépend d'une configuration (`rewrites` dans vercel.json)
// que le déploiement peut ne pas appliquer — et quand elle ne l'est pas, le
// bouton des réglages emmène droit sur une page d'erreur. Un paramètre de
// requête, lui, laisse le chemin à `/` : il ne peut PAS produire de 404, quel
// que soit l'hébergeur. L'adresse dit toujours aussi clairement où l'on est.
// L'ancien chemin /test reste reconnu (les rewrites sont toujours là) pour ne
// pas casser un signet.
const ADMIN_QUERY='test';
const COMBAT_PATH='/combat';
function pathHasAdmin(){
  if(typeof location==='undefined')return false;
  if(/^\/test\/?$/.test(location.pathname))return true;
  try{return new URLSearchParams(location.search).has(ADMIN_QUERY);}catch(e){return false;}
}
let ADMIN_MODE=pathHasAdmin();
// Adresse complète (chemin + paramètre admin s'il y a lieu).
function appPath(path){return (path||'/')+(ADMIN_MODE?'?'+ADMIN_QUERY:'');}
function appHomePath(){return appPath('/');}
function setAppPath(url){
  if(typeof history==='undefined'||!history.replaceState)return;
  if(location.pathname+location.search===url)return;
  try{history.replaceState(null,'',url);}catch(e){}
}

// ----------------------------------------------------------------
// UTILITAIRES PARTAGÉS
// ----------------------------------------------------------------
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ----------------------------------------------------------------
// EMBLÈME DU JEU
// ----------------------------------------------------------------
// UN SCEAU D'ALCHIMISTE : un médaillon d'or, du bouillon au fond, et le
// MONARQUE qui s'y dresse.
//
// L'emblème précédent empilait trois idées mal cousues : un ballon d'alambic,
// une pièce « en fusion » coupée en deux moitiés qui ne se raccordaient pas
// (un demi-pion doré collé à une demi-créature menthe), et deux petites
// pièces d'échecs flottant de part et d'autre du verre. À 74 px la couture
// ressemblait à un accident, et à 16 px les satellites n'étaient plus que
// deux taches sans forme.
//
// Le dessin ne dit plus qu'UNE chose, et il la dit d'un seul tracé : une
// pièce d'échecs NAÎT de l'alchimie. Une seule silhouette, entière et
// symétrique (couronne, collerette, robe, socle), debout dans la potion, au
// centre d'un sceau d'alchimiste — double anneau, couronne de graduations,
// gemme au sommet, deux clous aux flancs. Rien n'est coupé, rien ne flotte,
// et la silhouette reste lisible jusqu'à la taille d'un favicon.
//
// Il est écrit ici une seule fois et injecté sur la page de connexion — et
// nulle part ailleurs : le menu principal porte désormais le pseudo et l'ELO
// du joueur à sa place, l'emblème n'y est plus que dans l'onglet.
// favicon.svg reprend EXACTEMENT les mêmes tracés pour que l'onglet et
// l'écran d'accueil montrent la même chose. Les couleurs viennent des
// variables de thème (voir [EMBLEM] dans css/style.css), donc il suit le
// mode clair comme le mode sombre.
//
// Repères géométriques (viewBox 100×100), à respecter si l'on y retouche :
//   · sceau centré en (50,52) : anneau extérieur r=38, filet intérieur
//     r=32,5, graduations sur r=35,3 (un cercle pointillé, et non 24 traits
//     séparés : un seul élément à tenir dans les deux fichiers) ;
//   · surface du bouillon à y=66, corde du cercle r=32,5 (demi-largeur
//     √(32,5²−14²) ≈ 29,33, d'où 20,67 → 79,33) ;
//   · monarque de y=22,4 (pointe de la couronne) à y=67,8 (bas du socle) :
//     son socle plonge donc de 1,8 px sous la surface — il SORT du liquide,
//     il ne flotte pas dessus.
const EMBLEM_SVG=
  '<svg class="emblem" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+
    // LE SCEAU : deux anneaux et une couronne de graduations.
    '<circle class="em-ring" cx="50" cy="52" r="38"/>'+
    '<circle class="em-ring-in" cx="50" cy="52" r="32.5"/>'+
    '<circle class="em-ticks" cx="50" cy="52" r="35.3"/>'+
    // LE BOUILLON : segment circulaire sous la corde y=66, plus le trait clair
    // de la surface — sans lui, le liquide n'a pas de niveau, juste une masse.
    '<path class="em-liquid" d="M20.67 66A32.5 32.5 0 0 0 79.33 66Z"/>'+
    '<path class="em-surface" d="M20.67 66h58.66"/>'+
    '<circle class="em-bubble" cx="28.5" cy="72" r="2.3"/>'+
    '<circle class="em-bubble em-bubble2" cx="70" cy="69" r="1.6"/>'+
    // LE MONARQUE, d'une seule pièce : couronne à trois pointes, collerette,
    // robe évasée, plinthe, socle.
    '<g class="em-piece">'+
      '<path d="M39.6 34.2 37.6 24.6l6 4.4L50 22.4l6.4 6.6 6-4.4-2 9.6Z"/>'+
      '<rect x="39.9" y="33.6" width="20.2" height="4.6" rx="2.2"/>'+
      '<path d="M44 38.2c-.4 6.4-2.6 12.6-6.2 18.4h24.4c-3.6-5.8-5.8-12-6.2-18.4Z"/>'+
      '<rect x="35.4" y="56" width="29.2" height="4.6" rx="1.9"/>'+
      '<rect x="32.6" y="61.4" width="34.8" height="6.4" rx="2.6"/>'+
    '</g>'+
    // Gemme au sommet et clous aux flancs : ce sont eux qui font un OBJET
    // forgé plutôt qu'un simple cercle tracé.
    '<path class="em-gem" d="M50 8.6 54.4 14 50 19.4 45.6 14Z"/>'+
    '<circle class="em-stud" cx="12" cy="52" r="2.6"/>'+
    '<circle class="em-stud" cx="88" cy="52" r="2.6"/>'+
  '</svg>';
// ----------------------------------------------------------------
// VERROU DE PORTRAIT (TÉLÉPHONE)
// ----------------------------------------------------------------
// Le jeu se joue en hauteur, et rien qu'en hauteur : couché, un téléphone
// n'offre plus que ~400 px, que le plateau devrait partager avec la barre de
// compte, la barre d'état et le journal des coups.
//
// Trois verrous, du plus fort au plus faible, parce qu'AUCUN ne suffit seul :
//   1. site.webmanifest déclare `"orientation": "portrait"` — c'est le seul
//      qui tienne vraiment, mais il ne vaut que pour une application
//      INSTALLÉE sur l'écran d'accueil ;
//   2. screen.orientation.lock('portrait'), ci-dessous : les navigateurs ne
//      l'accordent qu'en plein écran ou en application installée, et le
//      refusent PARTOUT ailleurs — sur iOS l'API n'existe même pas. D'où le
//      try/catch et le .catch() : un refus est le cas NORMAL, pas une erreur
//      à remonter, et une promesse rejetée non capturée polluerait la console
//      à chaque ouverture ;
//   3. le voile #rotate-gate (index.html + [PORTRAIT-LOCK] dans style.css),
//      purement visuel, qui prend le relais dans un onglet ordinaire.
function lockPortrait(){
  try{
    const so=screen&&screen.orientation;
    if(so&&typeof so.lock==='function'){
      const r=so.lock('portrait');
      if(r&&typeof r.catch==='function')r.catch(()=>{});
    }
  }catch(e){/* verrou refusé : le voile CSS prend le relais */}
}

// ----------------------------------------------------------------
// MODE BUREAU (body.desk)
// ----------------------------------------------------------------
// Le jeu a été conçu comme une application de téléphone, et c'était le bon
// choix : c'est là qu'on y joue. Mais toutes les règles adaptatives de la
// feuille de style étaient des `max-width` — pas UNE seule règle « à partir de
// tant de pixels ». Sur un écran d'ordinateur, le jeu ne s'adaptait donc pas :
// il restait une colonne de téléphone posée au milieu du vide, avec la barre
// des faces (une barre de POUCE) qui flottait par-dessus le contenu et en
// masquait une partie.
//
// `body.desk` est l'interrupteur unique de tout ce qui change alors. Il n'y a
// pas de « version ordinateur » : c'est le même balisage, les mêmes scripts et
// les mêmes gestionnaires d'évènements, avec une mise en page différente (voir
// [DESKTOP] dans css/style.css). Deux fichiers auraient divergé au troisième
// changement.
//
// Pourquoi une classe et pas seulement un @media : le JS doit prendre les
// MÊMES décisions que le CSS (le rail latéral ne se comporte pas comme la
// barre du bas), et deux seuils écrits à deux endroits finissent toujours par
// se désaccorder. La requête est donc écrite ICI, une fois, et la feuille de
// style ne raisonne que sur la classe.
//
// Les trois conditions décrivent ensemble « un vrai écran d'ordinateur » :
//   · min-width:1024px  → la place d'un rail de 200 px + du contenu ;
//   · hover:hover       → un pointeur qui peut survoler ;
//   · pointer:fine      → une souris, pas un doigt.
// Une tablette tactile de 1200 px reste donc en mise en page tactile, ce qui
// est voulu : on y joue au doigt, avec des cibles de pouce.
// ÉCHAP FERME CE QUI EST OUVERT. Le jeu se pilote au doigt : on ferme en
// appuyant sur une croix, un voile ou un bouton « OK ». Au clavier, Échap est
// le geste attendu, et il n'existait que pour la fiche d'une pièce
// (js/piece-card.js, qui garde son propre écouteur en phase de CAPTURE et
// passe donc avant celui-ci).
//
// LA LISTE EST COURTE, ET C'EST VOLONTAIRE. Échap ne touche qu'à ce qui a
// DÉJÀ un bouton de fermeture explicite, et dont la fermeture ne décide de
// rien : le panneau de réglages, la fenêtre de série, et les pages posées
// par-dessus le cube (Voie, composition d'armée IA, galerie des adversaires),
// que leur propre bouton « OK »/« Retour » ramène au menu.
// Sont délibérément EXCLUS : la cérémonie d'un coffre (fermer applique le
// lot), la fenêtre de fin de partie (elle règle l'ELO et la mise), la
// promotion d'un pion (il FAUT choisir) et la recherche d'adversaire en ligne
// (partir sans annuler laisserait une entrée dans le salon). Une touche ne
// doit pas pouvoir engager ce qu'un clic n'engage pas.
function wireEscape(){
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const ae=document.activeElement;
    if(ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName))return;
    const panel=document.getElementById('settings-panel');
    if(panel&&panel.classList.contains('open')){panel.classList.remove('open');return;}
    const daily=document.getElementById('daily-modal');
    if(daily&&daily.classList.contains('show')){
      if(typeof closeDailyModal==='function')closeDailyModal();
      return;
    }
    // Une page en surimpression : `nav-overlay` est posée par cube-nav.js
    // exactement pour celles-là (la partie, elle, est une FACE du cube et n'en
    // porte pas — Échap n'abandonne donc jamais une partie en cours).
    if(document.body.classList.contains('nav-overlay')&&typeof goToMainMenu==='function'){
      goToMainMenu();
    }
  });
}

const DESK_QUERY='(min-width:1024px) and (hover:hover) and (pointer:fine)';
function applyDeskFlag(mq){
  document.body.classList.toggle('desk',!!(mq&&mq.matches));
}
function watchDeskMode(){
  if(!window.matchMedia)return;                 // navigateur trop ancien : on reste en tactile
  const mq=window.matchMedia(DESK_QUERY);
  applyDeskFlag(mq);
  // La bascule doit être VIVANTE : on redimensionne une fenêtre, on branche un
  // écran, on passe en mode tablette dans les outils de développement.
  if(mq.addEventListener)mq.addEventListener('change',()=>applyDeskFlag(mq));
  else if(mq.addListener)mq.addListener(()=>applyDeskFlag(mq));
}

// UN SEUL POINT DE MONTAGE POUR TOUS LES EMPLACEMENTS. L'emblème n'était
// injecté que dans `.login-emblem`, c'est-à-dire dans le voile de choix du
// pseudo — un écran que `accountsBoot` n'affiche QU'À la première visite. Un
// joueur qui a déjà un compte ne le voyait donc jamais, nulle part : le seul
// endroit où l'identité du jeu lui apparaissait encore était l'icône
// d'onglet, que les navigateurs gardent en cache pendant des semaines.
// Le crochet est la classe `.game-emblem` ; les classes qui l'accompagnent
// (`login-emblem`…) ne règlent que la taille et l'encre. Ajouter un
// emplacement = poser une div `game-emblem`, rien de plus.
// AUCUN ÉCRAN N'EN PORTE ACTUELLEMENT. Le menu principal, qui était le
// dernier, dit maintenant le nom du jeu en toutes lettres (« Epic Chess »,
// .menu-title dans index.html) : un sceau de 52 px ne pouvait pas le faire
// pour qui ne le connaissait pas déjà. Le tracé reste ici, et reste la source
// de favicon.svg, qui le montre dans l'onglet — et mountEmblems reste le
// chemin pour le reposer quelque part le jour où on le voudra.
function mountEmblems(){
  document.querySelectorAll('.game-emblem').forEach(el=>{
    if(!el.firstElementChild)el.innerHTML=EMBLEM_SVG;
  });
}
// ----------------------------------------------------------------
// ICÔNES D'INTERFACE PARTAGÉES
// ----------------------------------------------------------------
// Toutes en SVG, comme les logos de pièces (js/piece-art.js) : un émoji change
// de dessin d'un système à l'autre et ne suit pas la couleur du thème. Elles
// vivent ici et non dans le module qui les a introduites, parce que plusieurs
// pages les utilisent (armées, comptes, builder).
const svgX='<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const PEN_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>';
const TRASH_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M4 6h16"/><path d="M9 6V4h6v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v7M14 10v7"/></svg>';
const fmtDate=ts=>{const d=new Date(ts);return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};

// ----------------------------------------------------------------
// LE MÉDAILLON D'UN RANG
// ----------------------------------------------------------------
// Sept rangs (RANKS, js/data-pieces.js), sept planches facultatives dans
// assets/ranks/<id>.png. Trois pages l'affichent : le bandeau d'ELO de la
// Diagonale, ses bandeaux de rang, et la fenêtre de fin de partie.
//
// Le repli suit celui des portraits d'adversaires (advPortraitPath,
// js/adversaires.js) et pour la même raison : tester l'existence du fichier
// à l'avance demanderait une requête par rang à chaque ouverture de page. On
// pose donc l'<img> et on la RETIRE si elle ne charge pas — c'est la seule
// forme de repli qui ne laisse pas de trou. Une taille fixe dans le CSS,
// elle, réserverait ses 26 px même sans image, et le bandeau de rang
// garderait un vide inexplicable à gauche de son nom.
//
// `cls` donne la taille : 'rm-lg' (52 px, bandeau d'ELO), 'rm-md' (30 px,
// fin de partie), 'rm-sm' (26 px, bandeaux de la route).
function rankMedalHTML(rankId,cls){
  if(!rankId)return '';
  return '<img class="rank-medal '+(cls||'rm-sm')+'" alt="" aria-hidden="true"'+
    ' src="assets/ranks/'+rankId+'.png" onerror="this.remove()">';
}

// ----------------------------------------------------------------
// NOTIFICATIONS
// ----------------------------------------------------------------
// showNotif() était devenue une fonction vide. Or c'est le SEUL retour du jeu
// sur une trentaine de refus : « Pseudo : 2 à 20 caractères », « Les mots de
// passe ne correspondent pas », « 3 pièces max », « Dépasse 24 points »,
// « Pièce verrouillée », « Composez d'abord une armée »… Tous ces boutons ne
// faisaient donc rien du tout, sans un mot d'explication : le jeu paraissait
// cassé là où il refusait simplement une action.
//
// Le bandeau est revenu, mais discret : en bas à droite, UN SEUL message à la
// fois, effacé au clic, et jamais au milieu de l'écran (l'ancien apparaissait
// en haut, par-dessus la barre de compte).
//
// Pourquoi un seul : un refus en entraîne souvent d'autres (on reclique, on
// essaie à côté), et les bandeaux s'empilaient jusqu'à manger le bas de
// l'écran. Le dernier message est toujours celui qui compte — le précédent
// sort par la droite dès qu'un nouveau arrive.
//
//   type : 'err' (refus, par défaut) | 'ok' (confirmation) | 'info'
const NOTIF_MAX=1;
const NOTIF_MS=3600;
let _notifHost=null;
function notifHost(){
  if(_notifHost&&_notifHost.isConnected)return _notifHost;
  _notifHost=document.createElement('div');
  _notifHost.className='notif-host';
  _notifHost.setAttribute('role','status');
  _notifHost.setAttribute('aria-live','polite');
  document.body.appendChild(_notifHost);
  return _notifHost;
}
// Les messages VIVANTS : un bandeau qui part garde sa place dans le document
// le temps de son animation de sortie (260 ms), mais il ne compte plus — ni
// pour la limite, ni comme jumeau à rallumer.
function notifsLive(host){
  return [...host.children].filter(el=>!el.dataset.closing);
}
function showNotif(msg,type){
  if(!msg)return;
  const host=notifHost();
  // Deux clics sur un bouton refusé ne doivent pas empiler deux fois le même
  // message : on rallume celui qui est déjà là.
  const twin=notifsLive(host).find(el=>el.dataset.msg===String(msg));
  if(twin){
    twin.classList.remove('notif-pop');void twin.offsetWidth;twin.classList.add('notif-pop');
    clearTimeout(+twin.dataset.timer);
    twin.dataset.timer=setTimeout(()=>dismissNotif(twin),NOTIF_MS);
    return;
  }
  const el=document.createElement('div');
  el.className='notif notif-'+(type==='ok'?'ok':type==='info'?'info':'err');
  el.dataset.msg=String(msg);
  el.textContent=msg;
  el.addEventListener('click',()=>dismissNotif(el));
  host.appendChild(el);
  // ON PARCOURT UNE LISTE FIGÉE, jamais le document. La version précédente
  // bouclait sur `host.children.length > NOTIF_MAX` en congédiant
  // `firstElementChild` : comme dismissNotif ne retire le nœud qu'au bout de
  // son animation, l'enfant restait en place, la condition restait vraie, et
  // le second appel ressortait aussitôt (déjà `closing`) sans rien changer —
  // boucle infinie, onglet figé dès le message de trop. Ici on retire les
  // plus anciens d'une liste qui, elle, se vide à chaque tour.
  const live=notifsLive(host);
  while(live.length>NOTIF_MAX)dismissNotif(live.shift());
  el.dataset.timer=setTimeout(()=>dismissNotif(el),NOTIF_MS);
}
function dismissNotif(el){
  if(!el||el.dataset.closing)return;
  el.dataset.closing='1';
  clearTimeout(+el.dataset.timer);
  el.classList.add('notif-out');
  setTimeout(()=>el.remove(),260);
}

// showPage reste le point de contrôle UNIQUE de la navigation (tous les
// modules l'appellent). Il bascule les overlays .page/.active comme avant,
// puis délègue au cube (cube-nav.js) qui gère les faces embarquées
// (armées/partie). Les ids non-.page (ex. 'face-jouer', 'page-game' devenu
// une face) sont tolérés.
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById(id);
  if(el&&el.classList.contains('page'))el.classList.add('active');
  window.scrollTo(0,0);
  if(typeof cubeOnShowPage==='function')cubeOnShowPage(id);
}

// ----------------------------------------------------------------
// CONFIRM MODAL : remplace window.confirm() par une boîte de dialogue
// intégrée au thème. Un seul jeu de listeners (posés une fois) réutilisé à
// chaque appel via une fermeture (onYes courante).
// ----------------------------------------------------------------
// opts (facultatif) : {okLabel, cancelLabel, okClass, onNo}, permet une vraie
// question « Oui / Non » où le refus déclenche lui aussi une action.
let _confirmOnYes=null,_confirmOnNo=null;
function showConfirmModal(msg,onYes,opts){
  opts=opts||{};
  _confirmOnYes=onYes;_confirmOnNo=opts.onNo||null;
  document.getElementById('confirm-msg').textContent=msg;
  const ok=document.getElementById('confirm-ok'),cancel=document.getElementById('confirm-cancel');
  ok.textContent=opts.okLabel||'Confirmer';
  cancel.textContent=opts.cancelLabel||'Annuler';
  ok.className='btn '+(opts.okClass||'btn-danger');
  document.getElementById('confirm-modal').classList.add('show');
}
document.getElementById('confirm-ok').addEventListener('click',()=>{
  document.getElementById('confirm-modal').classList.remove('show');
  const fn=_confirmOnYes;_confirmOnYes=null;_confirmOnNo=null;
  if(fn)fn();
});
document.getElementById('confirm-cancel').addEventListener('click',()=>{
  document.getElementById('confirm-modal').classList.remove('show');
  const fn=_confirmOnNo;_confirmOnYes=null;_confirmOnNo=null;
  if(fn)fn();
});

// ----------------------------------------------------------------
// MENU CONTEXTUEL : fonction factorisée, utilisée par builder.js,
// et game-render.js (clic droit sur une pièce).
// ctxActivePower est déclaré dans game-render.js (section pouvoirs en partie) ;
// cette fonction n'est appelée qu'au clic droit, donc après le chargement
// complet des scripts.
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// APPUI LONG = CLIC DROIT (écrans tactiles)
// ----------------------------------------------------------------
// La fiche d'une pièce (déplacement, pouvoir, stock) ne s'ouvrait qu'au clic
// droit. Sur téléphone et tablette, il n'y a pas de clic droit : tout un pan
// du jeu — la seule façon de savoir ce que fait une créature en pleine partie,
// que le tutoriel prend d'ailleurs la peine d'enseigner — était donc
// inaccessible. Un appui de 520 ms fait la même chose.
//
// `longPressJustFired()` sert de garde aux gestionnaires de tap déjà en place
// (case du plateau, carte du builder) : sans lui, le doigt qui se relève
// après l'appui long déclenche en plus la sélection de la pièce, et la fiche
// se referme aussitôt qu'ouverte.
const LONG_PRESS_MS=520;
let _longPressAt=0;
function longPressJustFired(){return Date.now()-_longPressAt<600;}
function bindLongPress(el,handler){
  let timer=null,sx=0,sy=0;
  const clear=()=>{if(timer){clearTimeout(timer);timer=null;}};
  el.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const t=e.touches[0];sx=t.clientX;sy=t.clientY;
    clear();
    timer=setTimeout(()=>{
      timer=null;_longPressAt=Date.now();
      handler({preventDefault(){},stopPropagation(){},clientX:sx,clientY:sy});
    },LONG_PRESS_MS);
  },{passive:true});
  // Un doigt qui glisse veut déplacer une pièce, pas lire une fiche.
  el.addEventListener('touchmove',e=>{
    const t=e.touches[0];if(!t)return;
    if(Math.abs(t.clientX-sx)>10||Math.abs(t.clientY-sy)>10)clear();
  },{passive:true});
  el.addEventListener('touchend',clear);
  el.addEventListener('touchcancel',clear);
}

function showPieceCtxMenu(e,pieceDef,opts){
  e.preventDefault();
  if(e.stopPropagation)e.stopPropagation();
  if(!pieceDef)return;
  const menu=document.getElementById('ctx-menu');
  const pid=pieceDef.id||'';
  document.getElementById('ctx-title').innerHTML=(pid?pieceIcon(pid,'n',1.6):'')+'<span>'+escH(pieceDef.name||'Pièce')+'</span>';
  document.getElementById('ctx-class-lbl').textContent=pieceDef.class||'';
  document.getElementById('ctx-class-lbl').style.color=CLASS_COLOR_VARS[pieceDef.class]||'var(--muted)';
  document.getElementById('ctx-val').textContent=(pieceDef.value!==undefined&&pieceDef.value!==null)?pieceDef.value:'?';
  // Le déplacement est MONTRÉ, jamais raconté : la pièce au centre d'un
  // échiquier 9×9, un pictogramme par case atteignable, et la légende de
  // ceux qui servent (voir js/piece-moves.js). Le pouvoir, lui, reste écrit
  // plus bas : il ne se dessine pas sur une grille.
  const mvt=document.getElementById('ctx-mvt');
  const canDraw=typeof pieceMoveDiagramHTML==='function'&&
    typeof pieceHasMoveDiagram==='function'&&pieceHasMoveDiagram(pid);
  mvt.innerHTML=canDraw?pieceMoveDiagramHTML(pid,{legend:true}):'';
  mvt.style.display=canDraw?'':'none';
  const stockRow=document.getElementById('ctx-stock-row');
  if(stockRow){
    const own=pieceDef.id&&typeof invCount==='function'&&typeof isOwnablePiece==='function'&&isOwnablePiece(pieceDef.id);
    stockRow.style.display=own?'':'none';
    if(own){
      const n=invCount(pieceDef.id);
      document.getElementById('ctx-stock').textContent=n+' exemplaire'+(n>1?'s':'');
    }
  }
  const abRow=document.getElementById('ctx-ability-row');
  if(pieceDef.ability){abRow.style.display='';document.getElementById('ctx-ability').textContent=pieceDef.ability;}
  else abRow.style.display='none';
  const pBtn=document.getElementById('ctx-power-btn');
  if(opts&&opts.powerActive){
    pBtn.style.display='';pBtn.textContent=opts.powerLabel||'Activer pouvoir';pBtn.disabled=!!opts.powerDisabled;
    if(typeof ctxActivePower!=='undefined')ctxActivePower=opts.powerCtx||null;
  }else{
    pBtn.style.display='none';
  }
  // Le coin haut-gauche va au point cliqué, reculé juste ce qu'il faut pour
  // que la fiche tienne à l'écran. Le Math.max garde le bord gauche visible :
  // sous 338 px de large, le seul Math.min donnait une abscisse NÉGATIVE et
  // la fiche sortait par la gauche.
  const mx=Math.max(8,Math.min(e.clientX,window.innerWidth-330)),
        my=Math.max(8,Math.min(e.clientY,window.innerHeight-260));
  menu.style.left=mx+'px';menu.style.top=my+'px';menu.classList.add('show');
}

// ----------------------------------------------------------------
// ÉCHAP : ferme la couche ouverte la plus haute
// ----------------------------------------------------------------
// Chaque fenêtre avait son propre bouton de fermeture et aucune ne répondait
// à Échap, sauf les cinématiques. On se retrouvait à chercher la croix des
// yeux — et sur le menu contextuel d'une pièce, en pleine partie, c'est du
// temps de pendule.
//
// L'ordre compte : on ferme ce qui est POSÉ AU-DESSUS en premier. Le modal de
// promotion est volontairement absent de la liste : la partie ne peut pas
// reprendre tant que la pièce n'est pas choisie, l'échapper laisserait le
// plateau bloqué.
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const ctx=document.getElementById('ctx-menu');
  if(ctx&&ctx.classList.contains('show')){ctx.classList.remove('show');return;}
  const panel=document.getElementById('settings-panel');
  if(panel&&panel.classList.contains('open')){panel.classList.remove('open');return;}
  const mp=document.getElementById('mp-modal');
  if(mp&&mp.classList.contains('show')){
    if(typeof mpLeave==='function')mpLeave();
    mp.classList.remove('show');return;
  }
  const confirm=document.getElementById('confirm-modal');
  if(confirm&&confirm.classList.contains('show')){document.getElementById('confirm-cancel').click();return;}
});

// ----------------------------------------------------------------
// PREMIER ÉCRAN D'UN COMPTE NEUF
// ----------------------------------------------------------------
// C'était ici : un parchemin qui listait les règles du jeu, affiché juste
// après la création d'un compte, et dont la fermeture lançait le tutoriel.
// Il faisait doublon avec ce même tutoriel, qui MONTRE ces règles au lieu de
// les écrire. À sa place, les quatre pages du Lore (js/lore-intro.js,
// showLoreIntro), appelées au même endroit par accounts.js::enterAccount et
// qui passent la main au tutoriel de la même façon.

// ----------------------------------------------------------------
// INIT : appelé en tout dernier (voir bas de index.html)
// ----------------------------------------------------------------
function initApp(){
  mountEmblems();
  lockPortrait();
  watchDeskMode();
  wireEscape();
  // accountsBoot() peut entrer directement dans le jeu (compte déjà connu,
  // voir js/accounts.js) et donc faire tourner le cube dès le démarrage —
  // il lui faut #cube déjà repéré par cube-nav.js (son propre init(), posé
  // sur DOMContentLoaded). initApp() tourne PENDANT le chargement du
  // document (juste après le dernier <script>, avant DOMContentLoaded) :
  // on attend donc le même évènement, en s'inscrivant APRÈS cube-nav.js
  // (chargé plus tôt dans index.html) pour que son listener s'exécute
  // d'abord.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',accountsBoot);
  else accountsBoot();
}