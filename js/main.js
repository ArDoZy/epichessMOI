// ================================================================
// MAIN.JS : État global partagé, navigation entre pages, utilitaires communs
// ================================================================
// Contient : l'état global de l'armée en cours de composition (`army`),
// l'état des filtres du builder, les listes d'armées sauvegardées, le mode
// builder courant, showPage(), showNotif(), le menu contextuel factorisé
// (showPieceCtxMenu) utilisé par plusieurs pages, le parchemin d'accueil
// (showIntroModal, appelé par accounts.js à la création d'un nouveau
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
// Le jeu n'avait pour identité qu'un mot en lettres dorées, « EPIC CHESS »,
// et une fiole en favicon qui ne parlait que d'alchimie. L'emblème dit tout
// le jeu d'un seul dessin : un ballon d'alchimiste couronné (le Monarque
// posé sur le laboratoire) d'où monte une pièce EN TRAIN DE FUSIONNER —
// moitié pion ordinaire, moitié créature, fendue par une fêlure lumineuse.
// Deux pièces d'échecs flottent autour du ballon : sans elles, à petite
// taille, il ne resterait qu'une fiole.
//
// Il est écrit ici une seule fois et injecté sur la page de connexion — et
// nulle part ailleurs : le menu principal porte désormais le pseudo et l'ELO
// du joueur à sa place, l'emblème n'y est plus que dans l'onglet.
// favicon.svg reprend EXACTEMENT les mêmes
// tracés (mis à l'échelle 0.64) pour que l'onglet et l'écran d'accueil
// montrent la même chose. Les couleurs viennent des variables de thème
// (voir [EMBLEM] dans css/style.css), donc il suit le mode clair comme le
// mode sombre.
const EMBLEM_SVG=
  '<svg class="emblem" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+
    // Pièces satellites : un pion (gauche) et un cavalier (droite). Mêmes
    // silhouettes que le fond d'attente (tools/gen-duel-bg.js).
    '<path class="em-mini" transform="translate(3 31) scale(.21)" d="M50 8c-9 0-16 7-16 16 0 5 2 9 6 12-8 6-13 16-15 28h50c-2-12-7-22-15-28 4-3 6-7 6-12 0-9-7-16-16-16zM22 66h56l6 12H16zM12 80h76c5 0 8 4 8 9v11H4V89c0-5 3-9 8-9z"/>'+
    '<path class="em-mini" transform="translate(77 30) scale(.22)" d="M34 100c0-17 2-29 8-40l-11 8c-9 6-19 3-21-6-3-11 3-22 12-31C30 24 39 18 46 11c6-6 9-11 11-19l9 9 8-8c15 12 26 30 30 49 4 19 5 39 5 58z"/>'+
    '<path class="em-crown" d="M34 24 30 7l10 7 10-11 10 11 10-7-4 17z"/>'+
    '<path class="em-glass" d="M42 28v12M58 28v12"/>'+
    '<circle class="em-glass" cx="50" cy="64" r="26"/>'+
    // LA FUSION : les deux moitiés se rejoignent sur l'axe x=50, pieds posés
    // sur le niveau du liquide (y=68), d'où la pièce a l'air d'en sortir.
    '<g transform="translate(50 68) scale(1.2) translate(-50 -68)">'+
      '<path class="em-piece-a" d="M50 46c-4 0-7 2.6-7 6 0 1.8.9 3.4 2.3 4.4-3.5 2.6-6 6.6-7.3 11.6H50z"/>'+
      '<path class="em-piece-b" d="M50 46c4.6 0 7.6 3.2 6.8 7.2 2 1.2 3.6 3 4.6 5.2l3.4-6.4 1.4 8.6c.4 3 .2 5.6-.6 7.4H50z"/>'+
      '<path class="em-seam" d="M50 44l-3.2 11h5.4L49 68"/>'+
    '</g>'+
    // Segment circulaire : le niveau du liquide est la corde à y=68, le reste
    // suit l'arc inférieur du ballon (centre 50,64 · rayon 26).
    '<path class="em-liquid" d="M24.3 68A26 26 0 0 0 75.7 68Z"/>'+
    '<circle class="em-bubble" cx="41" cy="80" r="3"/>'+
    '<circle class="em-bubble" cx="60" cy="76" r="2.2"/>'+
  '</svg>';
function mountEmblems(){
  document.querySelectorAll('.login-emblem').forEach(el=>{
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
// PARCHEMIN D'ACCUEIL : affiché juste après la création d'un NOUVEAU compte
// (voir enterAccount() dans accounts.js, appelé avec isNewAccount=true depuis
// le listener de #btn-reg), pas à l'arrivée sur le site : avant la création
// d'un compte, il n'y a encore ni armée ni ELO à expliquer.
// ----------------------------------------------------------------
function showIntroModal(){
  const modal=document.getElementById('intro-modal');
  if(modal)modal.style.display='flex';
}
document.getElementById('intro-close')?.addEventListener('click',()=>{
  const modal=document.getElementById('intro-modal');
  if(modal)modal.style.display='none';
  // Le savant entre en scène à la fermeture du parchemin : c'est le premier
  // moment où le compte existe vraiment (armée vide, dotation de départ).
  if(typeof tutoMaybeStart==='function')tutoMaybeStart();
});

// ----------------------------------------------------------------
// INIT : appelé en tout dernier (voir bas de index.html)
// ----------------------------------------------------------------
function initApp(){
  mountEmblems();
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