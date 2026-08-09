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
// currentArmyData, aiArmyData, VV_UNLOCKED, darkMode, etc.)
// ================================================================

// ----------------------------------------------------------------
// ÉTAT GLOBAL PARTAGÉ (lu/écrit par builder.js, armies.js, combat-intro.js,
// game-flow.js, voie.js, tournoi.js, settings-admin.js)
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
let darkMode=true;
let VV_UNLOCKED=new Set();
// ADMIN : le mode admin ne touche plus à VV_UNLOCKED (il ne fait qu'ouvrir
// des coffres illimités et sortir les parties du classement), il n'y a donc
// plus d'instantané de progression à restaurer en le désactivant.
//
// Il n'est plus un interrupteur posé sur le jeu normal : c'est une ADRESSE.
// /test EST la version admin, tout le reste y est identique. On y entre et on
// en sort par les réglages, et l'adresse affichée dit toujours dans laquelle
// des deux on se trouve — impossible d'oublier qu'on est en admin et de
// s'étonner ensuite que l'ELO ne bouge pas.
let ADMIN_MODE=(typeof location!=='undefined')&&/^\/test\/?$/.test(location.pathname);

// ----------------------------------------------------------------
// ADRESSES DU JEU : /, /combat, /test
// ----------------------------------------------------------------
// Le jeu est une page unique, mais trois adresses ont un sens pour le joueur :
//   /        le jeu normal
//   /combat  une partie en cours contre un autre joueur (adresse partageable,
//            et surtout : l'onglet dit ce qu'on est en train de faire)
//   /test    le mode admin (coffres illimités, parties non classées)
// vercel.json réécrit ces trois chemins vers index.html : il n'y a jamais de
// rechargement, on ne fait que changer ce qui est affiché dans la barre.
const ADMIN_PATH='/test';
const COMBAT_PATH='/combat';
function appHomePath(){return ADMIN_MODE?ADMIN_PATH:'/';}
function setAppPath(path){
  if(typeof history==='undefined'||!history.replaceState)return;
  if(location.pathname===path)return;
  try{history.replaceState(null,'',path+location.search);}catch(e){}
}

// ----------------------------------------------------------------
// UTILITAIRES PARTAGÉS
// ----------------------------------------------------------------
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ----------------------------------------------------------------
// EMBLÈME DU JEU
// ----------------------------------------------------------------
// Le jeu n'avait pour identité qu'un mot en lettres dorées, « EPIC CHESS »,
// et une fiole en favicon qui ne parlait que d'alchimie. L'emblème dit les
// deux moitiés du jeu d'un seul dessin : un ballon d'alchimiste surmonté
// d'une COURONNE, c'est-à-dire le Monarque posé sur le laboratoire.
//
// Il est écrit ici une seule fois et injecté à deux endroits (page de
// connexion, menu principal) ; favicon.svg en reprend le tracé pour que
// l'onglet et l'écran d'accueil montrent la même chose. Les couleurs
// viennent des variables de thème (voir [EMBLEM] dans css/style.css), donc
// il suit le mode clair comme le mode sombre.
const EMBLEM_SVG=
  '<svg class="emblem" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+
    '<path class="em-crown" d="M34 24 30 7l10 7 10-11 10 11 10-7-4 17z"/>'+
    '<path class="em-glass" d="M42 28v12M58 28v12"/>'+
    '<circle class="em-glass" cx="50" cy="64" r="26"/>'+
    // Segment circulaire : le niveau du liquide est la corde à y=68, le reste
    // suit l'arc inférieur du ballon (centre 50,64 · rayon 26).
    '<path class="em-liquid" d="M24.3 68A26 26 0 0 0 75.7 68Z"/>'+
    '<circle class="em-bubble" cx="43" cy="80" r="3"/>'+
    '<circle class="em-bubble" cx="58" cy="76" r="2.2"/>'+
    '<path class="em-spark" d="M16 30l2.4 5.6L24 38l-5.6 2.4L16 46l-2.4-5.6L8 38l5.6-2.4z"/>'+
    '<path class="em-spark" d="M85 22l1.8 4.2L91 28l-4.2 1.8L85 34l-1.8-4.2L79 28l4.2-1.8z"/>'+
  '</svg>';
function mountEmblems(){
  document.querySelectorAll('.login-emblem,.jouer-emblem').forEach(el=>{
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

function toggleTheme(){
  darkMode=!darkMode;
  document.body.classList.toggle('light',!darkMode);
  const t=document.getElementById('sp-theme');
  if(t)t.classList.toggle('on',darkMode);
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
// Le bandeau est revenu, mais discret : en bas à droite, trois messages au
// plus, effacé au clic, et jamais au milieu de l'écran (l'ancien apparaissait
// en haut, par-dessus la barre de compte).
//
//   type : 'err' (refus, par défaut) | 'ok' (confirmation) | 'info'
const NOTIF_MAX=3;
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
function showNotif(msg,type){
  if(!msg)return;
  const host=notifHost();
  // Deux clics sur un bouton refusé ne doivent pas empiler deux fois le même
  // message : on rallume celui qui est déjà là.
  const twin=[...host.children].find(el=>el.dataset.msg===String(msg));
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
  while(host.children.length>NOTIF_MAX)dismissNotif(host.firstElementChild);
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
// question « Oui / Non » où le refus déclenche lui aussi une action (utilisé
// par la reprise de tournoi : « Non » supprime le tournoi abandonné).
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
  document.getElementById('ctx-mvt').textContent=pieceDef.movement||'Standard';
  const stockRow=document.getElementById('ctx-stock-row');
  if(stockRow){
    const own=pieceDef.id&&typeof invCount==='function'&&typeof isOwnablePiece==='function'&&isOwnablePiece(pieceDef.id);
    stockRow.style.display=own?'':'none';
    if(own)document.getElementById('ctx-stock').textContent=invCount(pieceDef.id)+' en réserve (se déploie par '+pieceDeployCount(pieceDef.id)+')';
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
  const mx=Math.min(e.clientX,window.innerWidth-330),my=Math.min(e.clientY,window.innerHeight-260);
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
  const analyse=document.getElementById('tournoi-analyse-modal');
  if(analyse&&analyse.style.visibility==='visible'){analyse.style.visibility='hidden';return;}
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
  renderLoginPage();
}