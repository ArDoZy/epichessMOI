// ================================================================
// ACCOUNTS.JS — Comptes locaux (localStorage), connexion, barre de compte
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
// (armies.js, voie.js, tournoi.js, game-flow.js...) via accGet/accSet.
//
// Pour ajouter un nouveau champ de sauvegarde par compte : utiliser
// accGet('ma_cle', valeurParDefaut) / accSet('ma_cle', valeur) — inutile de
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
    list.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px;font-style:italic">Aucun compte — créez-en un ci-dessous.</div>';
    lbl.style.display='none';
  }else{
    lbl.style.display='';
    const gradColors=[['#7a7590','#555'],['#9a8c7a','#665'],['#cd7f32','#8b5e20'],['#8fa8b8','#607080'],['#5a3f8a','#3a1f60'],['#c0c0c0','#888'],['#c9a84c','#8a6020']];
    list.innerHTML=names.map(n=>{
      const elo=JSON.parse(localStorage.getItem(accKey(n,'elo'))||'0');
      const rank=vvGetRank(elo);const ri=vvGetRankIdx(elo);
      const [c1,c2]=gradColors[ri]||gradColors[0];
      return `<div class="acc-item" data-n="${escH(n)}">
        <div class="acc-av" style="background:linear-gradient(135deg,${c1},${c2})">${n.charAt(0).toUpperCase()}</div>
        <div class="acc-info"><div class="acc-name">${escH(n)}</div><div class="acc-meta">${rank.emoji} ${rank.name} · ${elo} ELO</div></div>
        <button class="acc-del" onclick="deleteAcc('${escH(n)}',event)">🗑</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.acc-item').forEach(el=>{
      el.addEventListener('click',e=>{if(e.target.closest('.acc-del'))return;promptLogin(el.dataset.n);});
    });
  }
  document.getElementById('reg-u').value='';
  document.getElementById('reg-p').value='';
  document.getElementById('reg-p2').value='';
}

function promptLogin(username){
  document.getElementById('pw-acc').textContent=username;
  document.getElementById('pw-inp').value='';
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
  if(!confirm('Supprimer le compte "'+username+'" et toutes ses données ?'))return;
  const accs=loadAccs();delete accs[username];saveAccs(accs);
  const dead=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('mc_p_'+username+'_'))dead.push(k);}
  dead.forEach(k=>localStorage.removeItem(k));
  if(CUR_ACC===username){CUR_ACC=null;document.body.classList.remove('has-acc');document.getElementById('cab').style.display='none';}
  renderLoginPage();
};

function enterAccount(username){
  CUR_ACC=username;
  loadAccountGlobals();
  updateCab();
  document.body.classList.add('has-acc');
  document.getElementById('cab').style.display='flex';
  army={mon:null,gen:null,extras:[]};
  editingArmyId=null;builderMode='player';
  updateBuilderBanner();updAll();
  showPage('page-builder');
  if(!accGet('primordiale_choisie',null))setTimeout(showPrimordialeChoiceModal,300);
}

function loadAccountGlobals(){
  savedArmies=accGet('armies',[]);
  savedAiArmies=accGet('ai_armies',[]);
  const defs=UNLOCK_TABLE.filter(u=>u.eloRequired===0&&!u.primordialeChoix&&!u.coffre&&u.pieceId).map(u=>u.pieceId);
  const chosen=accGet('primordiale_choisie',null);
  if(chosen)defs.push(chosen);
  const stored=accGet('unlocked_pieces',null);
  VV_UNLOCKED=new Set(stored||defs);
  const elo=accGet('elo',0);
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.pieceId||u.primordialeChoix||u.coffre)return;
    if(u.eloRequired<=elo)VV_UNLOCKED.add(u.pieceId);
  });
  if(chosen)VV_UNLOCKED.add(chosen);
}

function saveArmies(){accSet('armies',savedArmies);}
function saveAiArmies(){accSet('ai_armies',savedAiArmies);}

function updateCab(){
  if(!CUR_ACC)return;
  const elo=accGet('elo',0);const rank=vvGetRank(elo);const ri=vvGetRankIdx(elo);
  const cols=['#7a7590','#9a8c7a','#cd7f32','#8fa8b8','#5a3f8a','#c0c0c0','#c9a84c'];
  document.getElementById('cab-av').textContent=CUR_ACC.charAt(0).toUpperCase();
  document.getElementById('cab-av').style.background='linear-gradient(135deg,'+(cols[ri]||'#7c3aed')+',#333)';
  document.getElementById('cab-name').textContent=CUR_ACC;
  // ELO masqué en mode admin
  const eloEl=document.getElementById('cab-elo');
  if(ADMIN_MODE){
    eloEl.textContent='⚙ MODE ADMIN';
    eloEl.classList.add('admin-elo');
  }else{
    eloEl.textContent=rank.emoji+' '+elo+' ELO';
    eloEl.classList.remove('admin-elo');
  }
}

function switchAccount(){
  CUR_ACC=null;
  document.body.classList.remove('has-acc');
  document.getElementById('cab').style.display='none';
  army={mon:null,gen:null,extras:[]};
  savedArmies=[];savedAiArmies=[];VV_UNLOCKED=new Set();
  renderLoginPage();showPage('page-login');
}

// ----------------------------------------------------------------
// PROGRESSION ELO / DÉBLOCAGES / HISTORIQUE — wrappers accGet/accSet
// (utilisés par voie.js, tournoi.js, game-flow.js)
// ----------------------------------------------------------------
function vvLoadElo(){return accGet('elo',0);}
function vvSaveElo(v){accSet('elo',v);updateCab();}
function vvLoadRankMax(){return accGet('rank_max',0);}
function vvSaveRankMax(v){accSet('rank_max',v);}
function vvSaveUnlocked(s){accSet('unlocked_pieces',[...s]);}
function vvLoadHistory(){return accGet('match_history',[]);}
function vvSaveHistory(arr){accSet('match_history',arr.slice(-30));}
function vvLoadPrimordialeChoisie(){return accGet('primordiale_choisie',null);}
function vvSavePrimordialeChoisie(id){accSet('primordiale_choisie',id);}

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
  showNotif('✅ Compte créé !','ok');
  setTimeout(()=>enterAccount(u),500);
});
['reg-u','reg-p','reg-p2'].forEach(id=>{document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-reg').click();});});