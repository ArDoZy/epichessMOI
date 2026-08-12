// ================================================================
// ACCOUNTS.JS : Comptes locaux (localStorage), connexion, barre de compte
// ================================================================
// Contient : le système de comptes multi-utilisateurs stocké en localStorage
// (un compte = un pseudo + hash de mot de passe + toutes ses données de jeu
// préfixées par son pseudo), la page de connexion (#page-login), le modal
// mot de passe, la barre de compte en haut (#cab), et les helpers accGet/accSet
// utilisés PARTOUT dans le reste du code pour lire/écrire les données du
// compte actuellement connecté (CUR_ACC).
//
// Dépendances : data-pieces.js (RANKS, vvGetRank, vvGetRankIdx, UNLOCK_TABLE,
// UNLOCK_MILESTONES), main.js (army, showPage, showNotif, escH).
// Utilisé par : tous les modules qui persistent des données de jeu
// (armies.js, voie.js, game-flow.js...) via accGet/accSet.
//
// Pour ajouter un nouveau champ de sauvegarde par compte : utiliser
// accGet('ma_cle', valeurParDefaut) / accSet('ma_cle', valeur), inutile de
// toucher à ce fichier, le préfixage par compte est automatique.
// ================================================================

const ACCS_KEY='mc_accs_v3';
function _h(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return(h>>>0).toString(16)+'_mc';}
function loadAccs(){return JSON.parse(localStorage.getItem(ACCS_KEY)||'{}');}
function saveAccs(o){localStorage.setItem(ACCS_KEY,JSON.stringify(o));}
function accKey(u,k){return'mc_p_'+u+'_'+k;}
function accGet(k,fb){
  if(!CUR_ACC)return fb;
  const r=localStorage.getItem(accKey(CUR_ACC,k));
  if(r===null)return fb;try{return JSON.parse(r);}catch{return fb;}
}
function accSet(k,v){if(!CUR_ACC)return;localStorage.setItem(accKey(CUR_ACC,k),JSON.stringify(v));}
let CUR_ACC=null;

function renderLoginPage(){
  const accs=loadAccs();const names=Object.keys(accs);
  const list=document.getElementById('acc-list');
  const lbl=document.getElementById('accs-lbl');
  if(!names.length){
    list.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px;font-style:italic">Aucun compte. Créez-en un ci-dessous.</div>';
    lbl.style.display='none';
  }else{
    lbl.style.display='';
    // Pas de statistiques ici (ELO, rang, série de victoires) : la page de
    // connexion ne sert qu'à choisir un compte, pas à en exposer la
    // progression avant même de s'y être connecté.
    list.innerHTML=names.map(n=>{
      const elo=JSON.parse(localStorage.getItem(accKey(n,'elo'))||'0');
      // Même dégradé que l'avatar de la barre de compte (updateCab) : une
      // seule table de couleurs de rang, pas deux qui divergent.
      const c1=RANK_AV_COLORS[vvGetRankIdx(elo)]||RANK_AV_COLORS[0];
      return `<div class="acc-item" data-n="${escH(n)}">
        <div class="acc-av" style="background:linear-gradient(135deg,${c1},#333)">${n.charAt(0).toUpperCase()}</div>
        <div class="acc-info"><div class="acc-name">${escH(n)}</div></div>
        <button class="acc-del" title="Supprimer ce compte" onclick="deleteAcc('${escH(n)}',event)">${TRASH_ICON}</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.acc-item').forEach(el=>{
      el.addEventListener('click',e=>{if(e.target.closest('.acc-del'))return;promptLogin(el.dataset.n);});
    });
  }
  document.getElementById('reg-u').value='';
  document.getElementById('reg-p').value='';
  document.getElementById('reg-p2').value='';
  // Les champs sont vidés : leur œil n'a plus rien à montrer, et un champ
  // laissé en clair par la session précédente doit repasser en masqué.
  document.querySelectorAll('#page-login .pw-field').forEach(f=>{
    f.classList.remove('pw-eye-on');
    const inp=f.querySelector('.linput');if(inp)inp.type='password';
    const eye=f.querySelector('.pw-eye');
    if(eye){eye.classList.remove('pw-eye-off');eye.setAttribute('aria-pressed','false');eye.setAttribute('aria-label','Afficher le mot de passe');}
  });
}

// ----------------------------------------------------------------
// ŒIL DE RÉVÉLATION DES MOTS DE PASSE
// ----------------------------------------------------------------
// Un seul comportement pour les trois champs (création + connexion) :
//   - l'œil n'apparaît que sur le champ où l'on écrit (focus ou contenu
//     non vide) : trois yeux visibles en permanence seraient trois icônes
//     de plus à ignorer sur la carte de connexion ;
//   - un clic montre le mot de passe et barre l'œil, un second le remasque ;
//   - quitter le champ le remasque toujours : un mot de passe ne doit pas
//     rester lisible à l'écran une fois qu'on est passé à autre chose.
// Le bouton porte data-for="<id du champ>" (voir index.html).
function bindPasswordEye(btn){
  const inp=document.getElementById(btn.dataset.for);
  if(!inp)return;
  const field=btn.closest('.pw-field')||inp.parentElement;
  const setVisible=on=>{
    inp.type=on?'text':'password';
    btn.classList.toggle('pw-eye-off',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
    btn.setAttribute('aria-label',on?'Masquer le mot de passe':'Afficher le mot de passe');
  };
  const refresh=()=>{
    const show=document.activeElement===inp||inp.value.length>0;
    field.classList.toggle('pw-eye-on',show);
  };
  inp.addEventListener('input',refresh);
  inp.addEventListener('focus',refresh);
  inp.addEventListener('blur',()=>{
    // Le mousedown du bouton est traité avant ce blur : sans ce délai, le
    // clic sur l'œil masquerait le bouton avant d'avoir produit son effet.
    setTimeout(()=>{setVisible(false);refresh();},120);
  });
  // mousedown plutôt que click : on garde le focus dans le champ, la frappe
  // reprend là où elle s'était arrêtée.
  btn.addEventListener('mousedown',e=>{
    e.preventDefault();
    setVisible(!btn.classList.contains('pw-eye-off'));
    inp.focus();
  });
  setVisible(false);refresh();
}
document.querySelectorAll('.pw-eye').forEach(bindPasswordEye);

function promptLogin(username){
  document.getElementById('pw-acc').textContent=username;
  document.getElementById('pw-inp').value='';
  // Le champ repart toujours masqué, même si la tentative précédente l'avait
  // révélé.
  document.getElementById('pw-inp').type='password';
  const pwEye=document.querySelector('.pw-eye[data-for="pw-inp"]');
  if(pwEye)pwEye.classList.remove('pw-eye-off');
  document.getElementById('pw-err').textContent='';
  document.getElementById('pw-modal').classList.add('show');
  setTimeout(()=>document.getElementById('pw-inp').focus(),80);
  const doLogin=()=>{
    const pw=document.getElementById('pw-inp').value;
    const accs=loadAccs();const acc=accs[username];
    if(!acc){document.getElementById('pw-err').textContent='Compte introuvable.';return;}
    if(_h(pw+username)!==acc.h){document.getElementById('pw-err').textContent='Mot de passe incorrect.';return;}
    document.getElementById('pw-modal').classList.remove('show');
    enterAccount(username);
  };
  document.getElementById('pw-ok').onclick=doLogin;
  document.getElementById('pw-inp').onkeydown=e=>{if(e.key==='Enter')doLogin();};
}
document.getElementById('pw-cancel').onclick=()=>document.getElementById('pw-modal').classList.remove('show');

window.deleteAcc=(username,ev)=>{
  ev.stopPropagation();
  showConfirmModal('Supprimer le compte "'+username+'" et toutes ses données ?',()=>{
    const accs=loadAccs();delete accs[username];saveAccs(accs);
    const dead=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('mc_p_'+username+'_'))dead.push(k);}
    dead.forEach(k=>localStorage.removeItem(k));
    if(CUR_ACC===username){CUR_ACC=null;document.body.classList.remove('has-acc');}
    renderLoginPage();
  });
};

function enterAccount(username,isNewAccount){
  CUR_ACC=username;
  loadAccountGlobals();
  // Économie (js/economy.js) : dotation de départ pour les pièces débloquées
  // qui n'ont pas encore de stock, et restitution des pièces d'une partie
  // interrompue (onglet fermé en cours de jeu). Une interruption n'est pas
  // une défaite, les exemplaires engagés doivent revenir.
  if(typeof invEnsureStarter==='function')invEnsureStarter();
  if(typeof economyRecoverOrphanEngagement==='function')economyRecoverOrphanEngagement();
  // Adversaire choisi la dernière fois (js/ai-level-modal.js) : deux comptes
  // sur la même machine n'ont pas le même, et un rechargement de page ne doit
  // pas renvoyer tout le monde devant l'Instructeur.
  if(typeof aiLoadOpponent==='function')aiLoadOpponent();
  updateCab();
  document.body.classList.add('has-acc');
  army={mon:null,gen:null,extras:[]};
  editingArmyId=null;builderMode='player';
  if(typeof pLoaded!=='undefined')pLoaded=false;
  // Après connexion : on prépare le builder (bannière + rendu) puis on
  // affiche le MENU PRINCIPAL du cube (face JOUER), pas directement le
  // builder, la face builder est atteinte en tournant le cube.
  updateBuilderBanner();updAll();
  if(typeof renderMenuChests==='function')renderMenuChests();
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-builder');
  // Parchemin d'accueil : uniquement à la création d'un nouveau compte (pas
  // à chaque connexion d'un compte existant) : voir showIntroModal() dans
  // main.js. Le tutoriel prend le relais à sa fermeture.
  if(isNewAccount && typeof showIntroModal==='function')showIntroModal();
  else if(typeof tutoMaybeStart==='function')tutoMaybeStart();
}

function loadAccountGlobals(){
  savedArmies=accGet('armies',[]);
  // UNE SEULE ARMÉE : un compte créé avant la fusion de "Mes armées" et de
  // la composition (voir js/armies.js) peut avoir plusieurs armées
  // enregistrées. On ne garde que la première et on écrit tout de suite la
  // troncature, pour ne pas la refaire à chaque connexion.
  if(savedArmies.length>1){savedArmies=[savedArmies[0]];saveArmies();}
  savedAiArmies=accGet('ai_armies',[]);
  // Dotation de départ : le Monarque et le Général, rien de plus. Les
  // créatures s'obtiennent dans les coffres (les trois premières pendant le
  // tutoriel), les paliers d'ELO ouvrant le reste.
  // Mode test (/?test) : tout le catalogue est débloqué, et RIEN n'est écrit
  // (vvSaveUnlocked ne fait rien là-dedans) — la progression réelle du compte
  // reste intacte quand on en ressort.
  if(typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE){
    VV_UNLOCKED=new Set(PIECES.map(p=>p.id));
    return;
  }
  const defs=UNLOCK_TABLE.filter(u=>u.eloRequired===0&&!u.coffre&&u.pieceId).map(u=>u.pieceId);
  const stored=accGet('unlocked_pieces',null);
  VV_UNLOCKED=new Set(stored||defs);
  const elo=vvLoadElo();
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.pieceId||u.coffre)return;
    if(u.eloRequired<=elo)VV_UNLOCKED.add(u.pieceId);
  });
}

function saveArmies(){accSet('armies',savedArmies);}
function saveAiArmies(){accSet('ai_armies',savedAiArmies);}

// Couleur d'avatar/bandeau par rang, alignée sur RANKS (data-pieces.js).
const RANK_AV_COLORS=['#7a7590','#9a8c7a','#cd7f32','#8fa8b8','#5a3f8a','#c0c0c0','#c9a84c'];

// Le bandeau du haut a disparu : il n'y portait qu'un rond avec l'initiale du
// pseudo, pour rogner le haut de toutes les pages. Le pseudo et l'ELO sont sur
// le menu principal, en toutes lettres. La fonction subsiste sous son nom
// (une douzaine d'appels y mènent) et ne rafraîchit plus que ce menu.
function updateCab(){
  if(!CUR_ACC)return;
  renderMenuIdentity();
}

// ----------------------------------------------------------------
// IDENTITÉ SUR LE MENU PRINCIPAL
// ----------------------------------------------------------------
// Pseudo en haut au milieu, rang et ELO juste dessous, et le bouton qui ouvre
// la Voie des Victoires à côté du chiffre — c'est là qu'on va quand on se
// demande ce que cet ELO débloque. Appelée à la connexion, à chaque
// changement d'ELO (vvSaveElo) et à l'arrivée sur la face JOUER.
function renderMenuIdentity(){
  const nameEl=document.getElementById('jouer-name');
  const rankEl=document.getElementById('jouer-rank');
  const eloEl=document.getElementById('jouer-elo');
  if(!nameEl||!rankEl||!eloEl)return;
  if(!CUR_ACC){nameEl.textContent='';rankEl.textContent='';eloEl.textContent='';return;}
  const elo=vvLoadElo(),rank=vvGetRank(elo);
  nameEl.textContent=CUR_ACC;
  rankEl.textContent=rank.name;
  rankEl.style.color=rank.color;
  // L'ELO réel reste affiché en mode admin : il ne bouge plus d'un point
  // là-dedans, il n'y a donc rien à masquer. Le suffixe rappelle simplement
  // que les parties en cours ne sont pas classées.
  eloEl.textContent=elo+' ELO'+(ADMIN_MODE?' · ADMIN':'');
  eloEl.classList.toggle('admin-elo',!!ADMIN_MODE);
}

function switchAccount(){
  CUR_ACC=null;
  document.body.classList.remove('has-acc');
  army={mon:null,gen:null,extras:[]};
  savedArmies=[];savedAiArmies=[];VV_UNLOCKED=new Set();
  if(typeof pLoaded!=='undefined')pLoaded=false;
  renderLoginPage();showPage('page-login');
}

// ----------------------------------------------------------------
// PROGRESSION ELO / DÉBLOCAGES / HISTORIQUE : wrappers accGet/accSet
// (utilisés par voie.js, game-flow.js)
// ----------------------------------------------------------------
// MODE TEST (/?test) : l'ELO affiché est 10 000 — tout est donc débloqué, y
// compris les échiquiers — et rien ne s'écrit sur le compte. On y entre et on
// en sort sans laisser de trace (voir js/economy.js pour l'inventaire et les
// perles, et loadAccountGlobals ci-dessus pour les pièces).
const ADMIN_ELO=10000;
function vvAdmin(){return typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE;}
function vvLoadElo(){return vvAdmin()?ADMIN_ELO:accGet('elo',0);}
function vvSaveElo(v){if(vvAdmin())return;accSet('elo',v);updateCab();}
function vvLoadRankMax(){return accGet('rank_max',0);}
function vvSaveRankMax(v){if(vvAdmin())return;accSet('rank_max',v);}
function vvSaveUnlocked(s){if(vvAdmin())return;accSet('unlocked_pieces',[...s]);}
function vvLoadHistory(){return accGet('match_history',[]);}
function vvSaveHistory(arr){accSet('match_history',arr.slice(-30));}

// ----------------------------------------------------------------
// REGISTRATION LISTENER
// ----------------------------------------------------------------
document.getElementById('btn-reg').addEventListener('click',()=>{
  const u=document.getElementById('reg-u').value.trim();
  const p=document.getElementById('reg-p').value;
  const p2=document.getElementById('reg-p2').value;
  if(u.length<2||u.length>20){showNotif('Pseudo : 2 à 20 caractères.');return;}
  if(p.length<4){showNotif('Mot de passe : 4 caractères minimum.');return;}
  if(p!==p2){showNotif('Les mots de passe ne correspondent pas.');return;}
  const accs=loadAccs();
  if(accs[u]){showNotif('Ce pseudo est déjà utilisé.');return;}
  accs[u]={h:_h(p+u),createdAt:Date.now()};saveAccs(accs);
  showNotif('Compte créé !','ok');
  setTimeout(()=>enterAccount(u,true),500);
});
['reg-u','reg-p','reg-p2'].forEach(id=>{document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-reg').click();});});