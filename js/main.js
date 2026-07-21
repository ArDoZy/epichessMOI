// ================================================================
// MAIN.JS — État global partagé, navigation entre pages, utilitaires communs
// ================================================================
// Contient : l'état global de l'armée en cours de composition (`army`),
// l'état des filtres du builder, les listes d'armées sauvegardées, le mode
// builder courant, showPage(), showNotif(), le menu contextuel factorisé
// (showPieceCtxMenu) utilisé par plusieurs pages, et l'appel d'init final.
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
// disposition en partie — voir builder.js::derivePlacements).
let army={mon:null,gen:null,extras:[]};
let filters={order:'asc',classes:new Set(['Monarque','Général','Primordiale','Brute','Sorcier'])};
let savedArmies=[];
let savedAiArmies=[];
let editingArmyId=null;
let builderMode='player';
let currentArmyData=null;
let aiArmyData=null;
let darkMode=true;
let VV_UNLOCKED=new Set();
// ADMIN — sauvegarde l'état pré-admin pour une restauration correcte
let ADMIN_MODE=false;
let _preAdminUnlocked=null;

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

// Notifications en haut d'écran désactivées à la demande — la fonction est
// conservée (no-op) car de nombreux modules l'appellent encore.
function showNotif(msg,type='err'){}

function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

// ----------------------------------------------------------------
// MENU CONTEXTUEL — fonction factorisée, utilisée par builder.js,
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
  document.getElementById('ctx-title').innerHTML=(pieceDef.emoji||'')+' '+(pieceDef.name||'Pièce');
  document.getElementById('ctx-class-lbl').textContent=pieceDef.class||'';
  document.getElementById('ctx-class-lbl').style.color=CLASS_COLOR_VARS[pieceDef.class]||'var(--muted)';
  document.getElementById('ctx-val').textContent=(pieceDef.value!==undefined&&pieceDef.value!==null)?pieceDef.value:'?';
  document.getElementById('ctx-mvt').textContent=pieceDef.movement||'Standard';
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
// INIT — appelé en tout dernier (voir bas de index.html)
// ----------------------------------------------------------------
function initApp(){
  renderLoginPage();
}