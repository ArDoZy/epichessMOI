// ================================================================
// ACCOUNTS.JS : les comptes locaux (localStorage)
// ================================================================
// PLUSIEURS COMPTES SUR UN APPAREIL, ET AUCUN ÉCRAN AVANT LE JEU.
//
// Le jeu s'ouvrait sur un voile « Choisissez votre pseudo » : un formulaire,
// c'est-à-dire un mur, posé entre quelqu'un qui vient de cliquer sur un lien
// et le jeu qu'il est venu voir. C'est le moment exact où l'on perd un
// visiteur, et il ne rendait aucun service : le pseudo ne sert à rien tant
// qu'on n'a pas joué.
//
// Maintenant, la PREMIÈRE OUVERTURE CRÉE ELLE-MÊME UN COMPTE (un pseudo
// d'Alchimiste tiré au sort, voir accountsGuestName) et entre directement
// dans le jeu — Lore puis tutoriel, exactement comme avant. Le joueur se
// renomme quand il en a envie, depuis la page Comptes.
//
// Cette page Comptes (js/account-ui.js, ouverte par le rouage des réglages)
// est le seul endroit où l'on gère son identité : se renommer, créer un autre
// compte, passer de l'un à l'autre, en supprimer un. Toutes les données de
// jeu sont déjà préfixées par le pseudo (accGet/accSet → mc_p_<pseudo>_<clé>),
// donc plusieurs comptes cohabitent sans qu'une seule ligne du reste du jeu
// ait à le savoir.
//
// CHANGER DE COMPTE RECHARGE LA PAGE. C'est délibéré : une trentaine de
// variables globales (savedArmies, VV_UNLOCKED, l'inventaire, l'état du
// tutoriel, les récompenses, le cube...) portent l'état du compte courant.
// Les remettre à zéro une par une, c'est se condamner à en oublier une le
// jour où l'on en ajoutera une trente-et-unième. Un rechargement est instantané
// (le jeu tient dans le cache du navigateur) et ne peut rien laisser derrière.
//
// Dépendances : data-pieces.js (UNLOCK_TABLE, UNLOCK_MILESTONES),
// main.js (army, showPage, showNotif).
// Utilisé par : tous les modules qui persistent des données de jeu
// (armies.js, voie.js, game-flow.js...) via accGet/accSet, et
// account-ui.js pour la page Comptes.
//
// Pour ajouter un nouveau champ de sauvegarde par compte : utiliser
// accGet('ma_cle', valeurParDefaut) / accSet('ma_cle', valeur), inutile de
// toucher à ce fichier, le préfixage par compte est automatique.
// ================================================================

const CUR_USERNAME_KEY='ec_username_v1';   // pseudo du compte courant
const ACCOUNTS_KEY='ec_accounts_v2';       // liste des comptes de cet appareil
const ACC_PREFIX='mc_p_';
const ACC_MAX=8;                           // au-delà, la page Comptes devient une liste sans fin
const ACC_NAME_MIN=2,ACC_NAME_MAX=20;

function accKey(u,k){return ACC_PREFIX+u+'_'+k;}
function accGet(k,fb){
  if(!CUR_ACC)return fb;
  const r=localStorage.getItem(accKey(CUR_ACC,k));
  if(r===null)return fb;try{return JSON.parse(r);}catch{return fb;}
}
function accSet(k,v){if(!CUR_ACC)return;localStorage.setItem(accKey(CUR_ACC,k),JSON.stringify(v));}
let CUR_ACC=null;

// Lecture d'une clé d'un AUTRE compte que le courant. La page Comptes en a
// besoin pour afficher le rang et l'ELO de chaque compte sans avoir à s'y
// connecter — le seul usage, et il est en lecture seule : rien n'écrit jamais
// dans un compte qui n'est pas le compte courant.
function accGetFor(username,k,fb){
  if(!username)return fb;
  const r=localStorage.getItem(accKey(username,k));
  if(r===null)return fb;try{return JSON.parse(r);}catch{return fb;}
}

// ----------------------------------------------------------------
// LA LISTE DES COMPTES
// ----------------------------------------------------------------
// Un simple tableau de pseudos, du plus récemment utilisé au plus ancien :
// c'est l'ordre dans lequel la page Comptes les présente, et c'est le seul
// tri qui a du sens quand on jongle entre deux comptes.
function accountsList(){
  try{
    const raw=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||'[]');
    if(Array.isArray(raw))return raw.filter(u=>typeof u==='string'&&u.length);
  }catch{}
  return [];
}
function accountsSaveList(arr){
  try{localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(arr.slice(0,ACC_MAX)));}catch{}
}
function accountsExists(u){return accountsList().some(x=>x.toLowerCase()===String(u||'').toLowerCase());}
function accountsTouch(u){
  const list=accountsList().filter(x=>x!==u);
  list.unshift(u);
  accountsSaveList(list);
}

// Validation d'un pseudo. Renvoie null si tout va bien, sinon la phrase à
// montrer — l'appelant n'a jamais à formuler l'erreur lui-même.
function accountsNameError(raw,{allowCurrent}={}){
  const u=String(raw||'').trim();
  if(u.length<ACC_NAME_MIN||u.length>ACC_NAME_MAX)
    return 'Le pseudo doit faire entre '+ACC_NAME_MIN+' et '+ACC_NAME_MAX+' caractères.';
  // Aucun caractère n'est interdit pour des raisons de stockage : la clé
  // mc_p_<pseudo>_<clé> n'est jamais relue à l'envers, un pseudo à espaces ou
  // à tirets bas ne casse donc rien. Seuls les caractères de contrôle sont
  // écartés : ils ne s'affichent pas, et deux comptes n'en différant que par
  // eux seraient visuellement identiques.
  for(let i=0;i<u.length;i++){
    const c=u.charCodeAt(i);
    if(c<32||c===127)return 'Ce pseudo contient des caractères invisibles.';
  }
  // La comparaison de doublon est insensible à la casse (deux comptes
  // « bob » et « Bob » seraient indiscernables dans la liste), et
  // l'exception pour le compte courant doit l'être aussi : sans cela, se
  // renommer « bob » en « Bob » se heurterait à son propre compte.
  const sameAsCurrent=allowCurrent&&!!CUR_ACC&&u.toLowerCase()===CUR_ACC.toLowerCase();
  if(accountsExists(u)&&!sameAsCurrent)return 'Un compte porte déjà ce pseudo sur cet appareil.';
  return null;
}

// Pseudo d'ouverture, tiré au sort. Il doit se lire comme un nom du monde du
// jeu et non comme « Joueur1 » : le premier écran doit sentir l'alchimie, pas
// le formulaire. Le joueur le remplace quand il veut (page Comptes).
const ACC_GUEST_TITLES=['Alchimiste','Apprenti','Adepte','Souffleur','Artisan','Disciple'];
function accountsGuestName(){
  for(let i=0;i<40;i++){
    const t=ACC_GUEST_TITLES[Math.floor(Math.random()*ACC_GUEST_TITLES.length)];
    const n=String(Math.floor(1000+Math.random()*9000));
    const name=t+' '+n;
    if(!accountsExists(name))return name;
  }
  return 'Alchimiste '+Date.now().toString(36).slice(-5);
}

// ----------------------------------------------------------------
// MIGRATIONS DES ANCIENNES SAUVEGARDES
// ----------------------------------------------------------------
// Deux systèmes ont précédé celui-ci et une progression déjà entamée ne doit
// jamais disparaître :
//   · mc_accs_v3   : pseudo + mot de passe, plusieurs comptes possibles ;
//   · ec_username_v1 seul : le compte unique, sans liste.
// Dans les deux cas on récupère les pseudos et on les inscrit dans la liste.
function accountsMigrate(){
  let list=accountsList();
  if(list.length)return list;
  const found=[];
  const cur=localStorage.getItem(CUR_USERNAME_KEY);
  if(cur)found.push(cur);
  try{
    const legacy=JSON.parse(localStorage.getItem('mc_accs_v3')||'{}');
    Object.keys(legacy).forEach(n=>{if(!found.includes(n))found.push(n);});
  }catch{}
  // On ne tente PAS de deviner d'autres comptes en balayant les clés
  // mc_p_<pseudo>_<clé> : les clés de jeu contiennent elles-mêmes des tirets
  // bas ('unlocked_pieces', 'win_streak', 'match_history'...), il est donc
  // impossible de savoir où finit le pseudo et où commence la clé. Un tel
  // balayage inventerait des comptes fantômes.
  if(found.length){accountsSaveList(found);list=found;}
  return list;
}

// ----------------------------------------------------------------
// DÉMARRAGE
// ----------------------------------------------------------------
// Appelée une seule fois au chargement (voir initApp, js/main.js). Elle ne
// pose JAMAIS de question : soit elle reprend le compte courant, soit elle en
// crée un et entre dans le jeu. Il n'y a plus d'écran avant le jeu.
function accountsBoot(){
  const list=accountsMigrate();
  let u=localStorage.getItem(CUR_USERNAME_KEY);
  if(!u||!list.includes(u))u=list[0]||null;

  if(u){
    localStorage.setItem(CUR_USERNAME_KEY,u);
    accountsTouch(u);
    // Un compte créé à l'instant depuis la page Comptes vient de faire
    // recharger la page : plus rien ne le distingue d'un compte ordinaire. Le
    // drapeau posé par accountCreate est la seule façon de savoir qu'il lui
    // faut encore le Lore et le tutoriel.
    enterAccount(u,accountsConsumeFreshFlag(u));
    return;
  }
  // Première ouverture de toute la vie du navigateur : on crée le compte
  // d'ouverture et on entre. isNewAccount=true déclenche le Lore puis le
  // tutoriel, exactement comme le faisait le formulaire de pseudo.
  const guest=accountsGuestName();
  localStorage.setItem(CUR_USERNAME_KEY,guest);
  accountsTouch(guest);
  enterAccount(guest,true);
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
  // Le Lore, en quatre pages : uniquement au tout premier lancement (pas à
  // chaque ouverture du jeu), voir showLoreIntro() dans js/lore-intro.js. Le
  // tutoriel prend le relais à la fin de la quatrième page.
  if(isNewAccount && typeof showLoreIntro==='function')showLoreIntro();
  else if(typeof tutoMaybeStart==='function')tutoMaybeStart();
}

// ----------------------------------------------------------------
// CRÉER / CHANGER / RENOMMER / SUPPRIMER
// ----------------------------------------------------------------
// Ces quatre fonctions sont l'API de la page Comptes (js/account-ui.js).
// Les trois premières rechargent la page (voir l'en-tête du fichier) ; c'est
// à l'appelant d'avoir déjà prévenu le joueur si une partie est en cours.

// Marque un compte comme courant et recharge. Le pseudo doit exister.
function accountSwitch(username){
  if(!username||username===CUR_ACC)return false;
  if(!accountsExists(username))return false;
  localStorage.setItem(CUR_USERNAME_KEY,username);
  accountsTouch(username);
  location.reload();
  return true;
}

// Crée un compte vierge et bascule dessus. Le nouveau compte reçoit le Lore
// et le tutoriel au démarrage suivant, comme un premier lancement : c'est le
// rôle du drapeau ci-dessous, que accountsBoot ne peut pas deviner puisque,
// après rechargement, le compte ressemble à n'importe quel compte neuf.
const ACC_FRESH_KEY='ec_fresh_account_v1';
function accountCreate(rawName){
  const name=String(rawName||'').trim();
  const err=accountsNameError(name);
  if(err)return err;
  if(accountsList().length>=ACC_MAX)
    return 'Cet appareil porte déjà '+ACC_MAX+' comptes. Supprimez-en un d\'abord.';
  localStorage.setItem(CUR_USERNAME_KEY,name);
  localStorage.setItem(ACC_FRESH_KEY,name);
  accountsTouch(name);
  location.reload();
  return null;
}

// Renomme le compte COURANT : toutes ses clés mc_p_<ancien>_* sont recopiées
// sous mc_p_<nouveau>_* puis les anciennes effacées. Pas de rechargement —
// rien de l'état en mémoire ne change, seul le préfixe de stockage bouge.
function accountRename(rawName){
  const name=String(rawName||'').trim();
  if(!CUR_ACC)return 'Aucun compte connecté.';
  if(name===CUR_ACC)return null;
  const err=accountsNameError(name,{allowCurrent:true});
  if(err)return err;
  const oldPrefix=ACC_PREFIX+CUR_ACC+'_';
  const moves=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith(oldPrefix))moves.push(k);
    }
    // On copie TOUT avant d'effacer quoi que ce soit : si le stockage sature
    // en cours de route, l'ancien compte est encore intact.
    moves.forEach(k=>{
      const v=localStorage.getItem(k);
      if(v!==null)localStorage.setItem(ACC_PREFIX+name+'_'+k.slice(oldPrefix.length),v);
    });
    moves.forEach(k=>localStorage.removeItem(k));
  }catch(e){return 'Le stockage du navigateur est plein : renommage impossible.';}
  const list=accountsList().map(u=>u===CUR_ACC?name:u);
  accountsSaveList(list);
  localStorage.setItem(CUR_USERNAME_KEY,name);
  CUR_ACC=name;
  updateCab();
  return null;
}

// QUITTER LE COMPTE COURANT — le « se déconnecter » de ce jeu.
//
// Il n'y a pas de connexion, donc pas de déconnexion au sens habituel : rien
// à oublier, aucun mot de passe, aucune session. Ce que veut vraiment
// quelqu'un qui cherche ce bouton, c'est ARRÊTER DE JOUER SOUS CE NOM — pour
// prêter l'appareil, ou pour recommencer autrement.
//
// On ne peut donc PAS le ramener sur un écran de connexion : il n'y en a pas,
// et en fabriquer un rouvrirait le mur que le jeu vient de supprimer. On le
// pose à la place sur une autre identité, immédiatement jouable :
//   · le compte utilisé juste avant, s'il en existe un ;
//   · sinon un nouveau compte d'Alchimiste, créé pour l'occasion.
// Dans les deux cas le compte quitté reste intact dans la liste : « quitter »
// n'est jamais « supprimer », et on y revient d'un geste depuis la page
// Comptes. Supprimer, lui, a son propre bouton et sa propre confirmation.
function accountLogout(){
  const others=accountsList().filter(u=>u!==CUR_ACC);
  if(others.length)return accountSwitch(others[0]);
  return accountCreate(accountsGuestName());
}

// Ce que fera accountLogout(), pour que la page Comptes puisse le DIRE avant
// de le faire. Un bouton qui n'annonce pas où il emmène n'est pas un bouton
// sur lequel on clique.
function accountLogoutTarget(){
  const others=accountsList().filter(u=>u!==CUR_ACC);
  return others.length?others[0]:null;
}

// Supprime un compte et TOUTES ses données, définitivement. Supprimer le
// compte courant bascule sur le suivant de la liste — et s'il n'en reste
// aucun, accountsBoot en recréera un au rechargement, donc le joueur retombe
// dans le jeu et jamais sur un écran vide.
function accountDelete(username){
  if(!username)return false;
  const prefix=ACC_PREFIX+username+'_';
  try{
    const doomed=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith(prefix))doomed.push(k);
    }
    doomed.forEach(k=>localStorage.removeItem(k));
  }catch{}
  const list=accountsList().filter(u=>u!==username);
  accountsSaveList(list);
  if(username===CUR_ACC){
    if(list.length)localStorage.setItem(CUR_USERNAME_KEY,list[0]);
    else localStorage.removeItem(CUR_USERNAME_KEY);
    location.reload();
    return true;
  }
  return true;
}

// Un compte tout juste créé depuis la page Comptes doit recevoir le Lore et
// le tutoriel, comme un premier lancement. accountCreate pose le drapeau
// avant de recharger, loadAccountGlobals le consomme ici.
function accountsConsumeFreshFlag(username){
  try{
    if(localStorage.getItem(ACC_FRESH_KEY)!==username)return false;
    localStorage.removeItem(ACC_FRESH_KEY);
    return true;
  }catch{return false;}
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
  if(typeof accountUIRefresh==='function')accountUIRefresh();
}

// ----------------------------------------------------------------
// IDENTITÉ SUR LE MENU PRINCIPAL
// ----------------------------------------------------------------
// Pseudo en haut au milieu, rang et ELO juste dessous, et le bouton qui ouvre
// la Diagonale de la Puissance à côté du chiffre — c'est là qu'on va quand on se
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
