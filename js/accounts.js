// ================================================================
// ACCOUNTS.JS : Compte local unique (localStorage)
// ================================================================
// UN SEUL COMPTE, toujours connecté : pas de mot de passe, pas de liste de
// comptes, pas de changement de compte, pas de déconnexion. Le pseudo choisi
// à la première visite (#page-login) est mémorisé (CUR_USERNAME_KEY) et le
// jeu démarre dessus directement à chaque ouverture suivante — c'est initApp()
// (js/main.js) qui décide, au chargement, entre l'écran de choix du pseudo et
// l'entrée directe dans le jeu (voir accountsBoot ci-dessous).
//
// Les données de jeu restent préfixées par le pseudo (accGet/accSet), comme
// avant : ça ne coûte rien avec un seul compte, et ça évite de retoucher les
// dizaines d'appels à accGet/accSet répartis dans le reste du code.
//
// Dépendances : data-pieces.js (UNLOCK_TABLE, UNLOCK_MILESTONES),
// main.js (army, showPage, showNotif, escH).
// Utilisé par : tous les modules qui persistent des données de jeu
// (armies.js, voie.js, game-flow.js...) via accGet/accSet.
//
// Pour ajouter un nouveau champ de sauvegarde par compte : utiliser
// accGet('ma_cle', valeurParDefaut) / accSet('ma_cle', valeur), inutile de
// toucher à ce fichier, le préfixage par compte est automatique.
// ================================================================

const CUR_USERNAME_KEY='ec_username_v1';
function accKey(u,k){return'mc_p_'+u+'_'+k;}
function accGet(k,fb){
  if(!CUR_ACC)return fb;
  const r=localStorage.getItem(accKey(CUR_ACC,k));
  if(r===null)return fb;try{return JSON.parse(r);}catch{return fb;}
}
function accSet(k,v){if(!CUR_ACC)return;localStorage.setItem(accKey(CUR_ACC,k),JSON.stringify(v));}
let CUR_ACC=null;

// ----------------------------------------------------------------
// ANCIEN SYSTÈME MULTI-COMPTES (mc_accs_v3) : migration douce
// ----------------------------------------------------------------
// Une session déjà entamée sous l'ancien système (pseudo + mot de passe,
// éventuellement plusieurs comptes sur la même machine) ne doit pas perdre
// sa progression : on adopte le premier pseudo enregistré comme LE compte,
// silencieusement, une seule fois.
function migrateLegacyAccount(){
  try{
    const legacy=JSON.parse(localStorage.getItem('mc_accs_v3')||'{}');
    const names=Object.keys(legacy);
    if(names.length)return names[0];
  }catch{}
  return null;
}

function loadUsername(){
  const cur=localStorage.getItem(CUR_USERNAME_KEY);
  if(cur)return cur;
  const legacy=migrateLegacyAccount();
  if(legacy){localStorage.setItem(CUR_USERNAME_KEY,legacy);return legacy;}
  return null;
}

// ----------------------------------------------------------------
// ÉCRAN DE PREMIÈRE VISITE : choix du pseudo, une seule fois
// ----------------------------------------------------------------
document.getElementById('reg-u')?.addEventListener('keydown',e=>{
  if(e.key==='Enter')document.getElementById('btn-reg').click();
});
document.getElementById('btn-reg')?.addEventListener('click',()=>{
  const u=document.getElementById('reg-u').value.trim();
  if(u.length<2||u.length>20){showNotif('Pseudo : 2 à 20 caractères.');return;}
  localStorage.setItem(CUR_USERNAME_KEY,u);
  enterAccount(u,true);
});

// Appelée une seule fois au chargement (voir initApp, js/main.js) : entre
// directement dans le jeu si un pseudo est déjà enregistré, sinon affiche
// l'écran de choix du pseudo (#page-login, resté la page active par défaut
// dans le HTML).
function accountsBoot(){
  const u=loadUsername();
  if(u)enterAccount(u,false);
}

function enterAccount(username,isNewAccount){
  CUR_ACC=username;
  loadAccountGlobals();
  // Économie (js/economy.js) : dotation de départ pour les pièces débloquées
  // qui n'ont pas encore de stock, et restitution des pièces d'une partie
  // interrompue (onglet fermé en cours de jeu). Une interruption n'est pas
  // une défaite, les exemplaires engagés doivent revenir.
  if(typeof invEnsureStarter==='function')invEnsureStarter();
  if(typeof economyRecoverOrphanEngagement==='function')economyRecoverOrphanEngagement();
  // Adversaire choisi la dernière fois (js/ai-level-modal.js).
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
  // Parchemin d'accueil : uniquement au tout premier lancement (pas à chaque
  // ouverture du jeu) : voir showIntroModal() dans main.js. Le tutoriel
  // prend le relais à sa fermeture.
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
