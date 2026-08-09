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
const svgX='<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const fmtDate=ts=>{const d=new Date(ts);return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};

function toggleTheme(){
  darkMode=!darkMode;
  document.body.classList.toggle('light',!darkMode);
  const t=document.getElementById('sp-theme');
  if(t)t.classList.toggle('on',darkMode);
}

// Notifications en haut d'écran désactivées à la demande, la fonction est
// conservée (no-op) car de nombreux modules l'appellent encore.
function showNotif(msg,type='err'){}

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
  renderLoginPage();
}