// ================================================================
// ACCOUNTS.JS : les comptes, tenus par le serveur
// ================================================================
// LE COMPTE N'EST PLUS DANS LE NAVIGATEUR, IL EST SUR LE SERVEUR.
// Toute la progression — ELO, sommet atteint, créatures et pouvoirs
// débloqués, perles, inventaire, armées, statistiques, historique des
// parties, avancement du tutoriel — vit dans la base Postgres du projet
// Supabase (voir supabase/schema.sql et js/server.js). Ce fichier n'est
// plus qu'une COPIE DE TRAVAIL en mémoire, chargée au démarrage depuis
// le serveur et repoussée vers lui à chaque changement.
//
// CE QUI NE CHANGE PAS POUR LE RESTE DU JEU : accGet('ma_cle', défaut)
// et accSet('ma_cle', valeur), exactement comme avant. Les trente
// modules qui persistent quelque chose n'ont pas eu à bouger d'une
// ligne — ils écrivaient dans localStorage sans le savoir, ils écrivent
// maintenant sur le serveur sans le savoir davantage.
//
// CE QUI CHANGE VRAIMENT :
//
//   · LES CLÉS DE CLASSEMENT SONT EN LECTURE SEULE. elo, elo_peak,
//     ranked_games, ranked_wins, best_streak, piece_stats et
//     match_history ne s'écrivent PLUS depuis le jeu : accSet les
//     ignore. Elles ne bougent que par ec_report_match, où c'est le
//     SERVEUR qui recalcule l'ELO à partir du résultat déclaré. Un
//     joueur qui trafique son navigateur ne gagne donc pas un point.
//
//   · LES PSEUDOS SONT UNIQUES POUR TOUT LE MONDE, et plus seulement
//     sur l'appareil : la contrainte est dans la base, la vérification
//     du client n'est qu'une politesse pour répondre vite.
//
//   · LE DÉMARRAGE PASSE PAR LE RÉSEAU. accountsBoot est donc
//     asynchrone et montre un voile le temps de la connexion, avec un
//     bouton « Réessayer » si le serveur ne répond pas. Le jeu ne peut
//     pas commencer sans son compte : ce serait jouer sur une
//     progression qu'on ne pourrait pas enregistrer.
//
//   · LES ANCIENS COMPTES LOCAUX SONT EFFACÉS au premier lancement
//     (ecPurgeLegacyAccounts, js/server.js). Ils n'existaient que dans
//     un navigateur et leurs pseudos n'étaient uniques nulle part.
//
// CHANGER DE COMPTE RECHARGE LA PAGE, comme avant et pour la même
// raison : une trentaine de variables globales (savedArmies,
// VV_UNLOCKED, l'inventaire, le tutoriel, les récompenses, le cube…)
// portent l'état du compte courant, et les remettre à zéro une par une,
// c'est se condamner à en oublier une.
//
// Dépendances : server.js (ECP, ecLogin, ecSignup, accès serveur),
// data-pieces.js (UNLOCK_TABLE, UNLOCK_MILESTONES),
// main.js (army, showPage, showNotif).
// Utilisé par : tous les modules qui persistent des données de jeu via
// accGet/accSet, et account-ui.js pour la page Comptes.
// ================================================================

const ACC_MAX=8;                           // comptes cohabitant sur un appareil
const ACC_NAME_MIN=2,ACC_NAME_MAX=20;

// Le pseudo du compte courant. Reste une variable globale et une chaîne :
// une bonne moitié du jeu la lit (bandeaux, multijoueur, page Comptes).
let CUR_ACC=null;

// ----------------------------------------------------------------
// LA COPIE DE TRAVAIL
// ----------------------------------------------------------------
// ECP (js/server.js) est la fiche que le serveur a donnée. `ECP.state`
// porte la progression que le client pilote ; les colonnes nommées
// portent celle dont le serveur est propriétaire.
//
// LES CLÉS DE CLASSEMENT SONT EN LECTURE SEULE, et accSet les ignore
// SILENCIEUSEMENT. Ce n'est pas de la négligence : c'est un garde-fou.
// N'importe quel module peut se retrouver, un jour, à écrire accSet('elo')
// — par habitude, par copier-coller, ou parce qu'un joueur curieux
// l'appelle depuis la console. Le seul chemin vers ces nombres est le
// rapport de fin de partie (ecReportMatch), où le SERVEUR calcule et
// renvoie la fiche complète ; tout le reste doit être sans effet, sinon
// « le serveur fait autorité » n'est plus qu'une intention.
const ACC_SERVER_KEYS={
  elo:1,elo_peak:1,ranked_games:1,ranked_wins:1,
  best_streak:1,piece_stats:1,match_history:1,rank_max:1,
};

function accServerRead(k,fb){
  if(!ECP)return fb;
  switch(k){
    case 'elo':          return ECP.elo|0;
    case 'elo_peak':     return ECP.elo_peak|0;
    case 'ranked_games': return ECP.ranked_games|0;
    case 'ranked_wins':  return ECP.ranked_wins|0;
    case 'best_streak':  return ECP.best_streak|0;
    case 'piece_stats':  return ECP.piece_stats||{};
    case 'match_history':return ECP.history||[];
    // Le « meilleur rang atteint » ne mérite pas une colonne : il se
    // déduit exactement du sommet d'ELO, qui, lui, est au serveur.
    case 'rank_max':     return (typeof vvGetRankIdx==='function')?vvGetRankIdx(ECP.elo_peak|0):(fb||0);
  }
  return fb;
}

function accGet(k,fb){
  if(ACC_SERVER_KEYS[k])return accServerRead(k,fb);
  if(!ECP||!ECP.state)return fb;
  const v=ECP.state[k];
  return (v===undefined||v===null)?fb:v;
}

function accSet(k,v){
  if(ACC_SERVER_KEYS[k])return;   // propriété du serveur, voir plus haut
  if(!ECP)return;
  if(!ECP.state)ECP.state={};
  ECP.state[k]=v;
  ecQueueState(k,v);              // envoi groupé, réessayé (js/server.js)
}

// ----------------------------------------------------------------
// LES COMPTES DE CET APPAREIL
// ----------------------------------------------------------------
// Ce ne sont plus des dossiers de données mais des SESSIONS : un
// identifiant de compte et sa clé d'appareil (js/server.js). La liste
// va du plus récemment utilisé au plus ancien, seul ordre qui ait du
// sens quand on jongle entre deux comptes.
function accountsList(){return ecSessions().map(s=>s.username).filter(Boolean);}
function accountsExists(u){
  return accountsList().some(x=>String(x).toLowerCase()===String(u||'').toLowerCase());
}
function accountsSessionFor(username){
  const u=String(username||'').toLowerCase();
  return ecSessions().find(s=>String(s.username||'').toLowerCase()===u)||null;
}

// Validation d'un pseudo, côté client : elle sert à répondre TOUT DE
// SUITE aux fautes évidentes (trop court, caractères invisibles). Le
// verdict qui fait foi est celui du serveur, et notamment l'unicité :
// un pseudo libre ici peut avoir été pris à l'autre bout du monde une
// seconde plus tôt. Renvoie null si tout va bien, sinon la phrase à
// montrer.
function accountsNameError(raw,{allowCurrent}={}){
  const u=String(raw||'').trim();
  if(u.length<ACC_NAME_MIN||u.length>ACC_NAME_MAX)
    return 'Le pseudo doit faire entre '+ACC_NAME_MIN+' et '+ACC_NAME_MAX+' caractères.';
  // Seuls les caractères de contrôle sont écartés : ils ne s'affichent
  // pas, et deux pseudos n'en différant que par eux seraient
  // visuellement identiques.
  for(let i=0;i<u.length;i++){
    const c=u.charCodeAt(i);
    if(c<32||c===127)return 'Ce pseudo contient des caractères invisibles.';
  }
  const sameAsCurrent=allowCurrent&&!!CUR_ACC&&u.toLowerCase()===CUR_ACC.toLowerCase();
  if(accountsExists(u)&&!sameAsCurrent)return 'Un compte porte déjà ce pseudo sur cet appareil.';
  return null;
}

// Pseudo d'ouverture, tiré au sort. Il doit se lire comme un nom du
// monde du jeu et non comme « Joueur1 » : le premier écran doit sentir
// l'alchimie, pas le formulaire. Le nombre à quatre chiffres n'est plus
// une coquetterie : les pseudos étant désormais uniques pour tout le
// monde, il faut de quoi éviter la collision au premier essai.
const ACC_GUEST_TITLES=['Alchimiste','Apprenti','Adepte','Souffleur','Artisan','Disciple'];
function accountsGuestName(){
  const t=ACC_GUEST_TITLES[Math.floor(Math.random()*ACC_GUEST_TITLES.length)];
  return t+' '+String(Math.floor(1000+Math.random()*9000));
}

// ----------------------------------------------------------------
// LE VOILE DE DÉMARRAGE
// ----------------------------------------------------------------
// Le jeu ne peut pas s'ouvrir avant d'avoir sa fiche : sans elle il
// afficherait un compte vide et écrirait par-dessus la vraie
// progression au premier coup joué. Le voile dit où l'on en est, et
// donne un bouton plutôt qu'un cul-de-sac quand le serveur ne répond
// pas.
function accountsBootVeil(msg,retry){
  const el=document.getElementById('ec-boot');
  if(!el)return;
  el.querySelector('#ec-boot-msg').textContent=msg||'';
  const btn=el.querySelector('#ec-boot-retry');
  btn.style.display=retry?'':'none';
  el.querySelector('#ec-boot-spin').style.display=retry?'none':'';
  el.classList.add('show');
}
function accountsBootDone(){
  document.getElementById('ec-boot')?.classList.remove('show');
}

// ----------------------------------------------------------------
// DÉMARRAGE
// ----------------------------------------------------------------
// Appelée une fois au chargement (initApp, js/main.js). Elle ne pose
// JAMAIS de question : soit elle reprend le compte connu de cet
// appareil, soit elle en crée un et entre dans le jeu. Il n'y a pas
// d'écran de connexion — juste, désormais, le temps d'un aller-retour.
function accountsBoot(){
  ecPurgeLegacyAccounts();
  accountsBootVeil('Connexion au serveur…');
  const fresh=accountsConsumeFreshFlag();
  const sess=ecCurrentSession();
  const step=sess?ecLogin().catch(e=>{
    // Le compte n'existe plus côté serveur (supprimé ailleurs, base
    // remise à zéro) : on oublie cette session et on repart sur un
    // compte neuf plutôt que de bloquer le joueur devant une erreur
    // qu'il ne peut pas résoudre.
    if(e&&!e.offline){ecForgetSession(sess.id);return accountsCreateGuest(true);}
    throw e;
  }):accountsCreateGuest(true);

  step.then(profile=>{
    // Les parties restées en rade (réseau coupé en fin de match) sont
    // rejouées AVANT d'entrer : leur ELO doit être compté, et les
    // déblocages calculés à l'entrée (loadAccountGlobals) se lisent sur le
    // sommet atteint — le lire avant que ces parties soient enregistrées
    // ferait clignoter une créature déjà gagnée.
    return ecFlushPendingMatches().then(()=>{
      accountsBootDone();
      ecStartHeartbeat();
      enterAccount(ECP.username,fresh||profile._isNew===true);
    });
  }).catch(e=>{
    console.warn('[EC] démarrage impossible :',e);
    accountsBootVeil(
      (e&&e.message)||'Le serveur du jeu est injoignable.',true);
  });
}

// Crée le compte d'ouverture. Le pseudo est tiré au sort et peut tomber
// sur un nom déjà pris : on réessaie, c'est le prix de l'unicité
// mondiale des pseudos et le joueur n'en voit rien.
function accountsCreateGuest(markNew){
  let tries=0;
  const attempt=()=>ecSignup(accountsGuestName()).catch(e=>{
    if(e&&e.code==='23505'&&tries++<8)return attempt();
    throw e;
  });
  return attempt().then(p=>{if(markNew)p._isNew=true;return p;});
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('ec-boot-retry')?.addEventListener('click',()=>{
    accountsBootVeil('Nouvelle tentative…');
    setTimeout(accountsBoot,200);
  });
});

function enterAccount(username,isNewAccount){
  CUR_ACC=username;
  // UN COMPTE ADMIN EST UN BAC À SABLE. Il joue avec tout débloqué et
  // n'est jamais classé (voir ec_report_match et ec_leaderboard) : le
  // mode test du jeu est exactement cet état, on l'allume donc.
  if(ECP&&ECP.is_admin&&typeof ADMIN_MODE!=='undefined')ADMIN_MODE=true;
  loadAccountGlobals();
  // Économie (js/economy.js) : dotation de départ pour les pièces
  // débloquées qui n'ont pas encore de stock, et restitution des pièces
  // d'une partie interrompue (onglet fermé en cours de jeu). Une
  // interruption n'est pas une défaite.
  if(typeof invEnsureStarter==='function')invEnsureStarter();
  if(typeof economyRecoverOrphanEngagement==='function')economyRecoverOrphanEngagement();
  if(typeof aiLoadOpponent==='function')aiLoadOpponent();
  updateCab();
  document.body.classList.add('has-acc');
  army={mon:null,gen:null,extras:[]};
  editingArmyId=null;builderMode='player';
  if(typeof pLoaded!=='undefined')pLoaded=false;
  updateBuilderBanner();updAll();
  if(typeof renderMenuChests==='function')renderMenuChests();
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-builder');
  // Le salon de présence : c'est lui qui dit aux autres joueurs qu'on
  // est là, et qui apporte les défis (js/multiplayer.js).
  if(typeof mpPresenceJoin==='function')mpPresenceJoin();
  if(isNewAccount && typeof showLoreIntro==='function')showLoreIntro();
  else if(typeof tutoMaybeStart==='function')tutoMaybeStart();
}

// ----------------------------------------------------------------
// CRÉER / CHANGER / RENOMMER / SUPPRIMER
// ----------------------------------------------------------------
// L'API de la page Comptes (js/account-ui.js). Elles passent toutes par
// le serveur et renvoient donc des PROMESSES : une promesse résolue
// veut dire que le serveur a accepté, et rien d'autre ne le veut dire.

// Marque un compte de cet appareil comme courant et recharge.
function accountSwitch(username){
  const s=accountsSessionFor(username);
  if(!s||s.username===CUR_ACC)return false;
  ecFlushNow();                 // ce qui n'est pas encore parti part maintenant
  ecSetCurrent(s.id);
  location.reload();
  return true;
}

// Crée un compte sur le SERVEUR et bascule dessus. Le nouveau compte
// reçoit le Lore et le tutoriel au démarrage suivant, comme un premier
// lancement : c'est le rôle du drapeau ci-dessous, que accountsBoot ne
// peut pas deviner puisqu'après rechargement le compte ressemble à
// n'importe quel compte neuf.
const ACC_FRESH_KEY='ec_fresh_account_v1';
function accountCreate(rawName){
  const name=String(rawName||'').trim();
  const err=accountsNameError(name);
  if(err)return Promise.reject(new Error(err));
  if(ecSessions().length>=ACC_MAX)
    return Promise.reject(new Error(
      'Cet appareil porte déjà '+ACC_MAX+' comptes. Supprimez-en un d\'abord.'));
  ecFlushNow();
  return ecSignup(name).then(()=>{
    try{localStorage.setItem(ACC_FRESH_KEY,'1');}catch(e){}
    location.reload();
  });
}

// Renomme le compte COURANT. Aucune donnée ne bouge : le pseudo n'est
// plus la clé de stockage, seulement une colonne. C'est le serveur qui
// refuse un nom déjà pris — par n'importe qui, sur n'importe quel
// appareil.
function accountRename(rawName){
  const name=String(rawName||'').trim();
  if(!CUR_ACC)return Promise.reject(new Error('Aucun compte connecté.'));
  if(name===CUR_ACC)return Promise.resolve();
  const err=accountsNameError(name,{allowCurrent:true});
  if(err)return Promise.reject(new Error(err));
  return ecRename(name).then(p=>{
    CUR_ACC=p.username;
    updateCab();
    if(typeof mpPresenceRefresh==='function')mpPresenceRefresh();
  });
}

// Supprime un compte et TOUTES ses données, définitivement, sur le
// serveur. Supprimer le compte courant bascule sur le suivant de la
// liste — et s'il n'en reste aucun, accountsBoot en recréera un au
// rechargement : le joueur retombe dans le jeu, jamais sur un écran
// vide.
function accountDelete(username){
  const s=accountsSessionFor(username);
  if(!s)return Promise.reject(new Error('Compte inconnu sur cet appareil.'));
  const wasCurrent=(s.username===CUR_ACC);
  return ecDeleteAccount(s.id,s.secret).then(()=>{
    if(wasCurrent)location.reload();
  });
}

// Un compte tout juste créé depuis la page Comptes doit recevoir le
// Lore et le tutoriel, comme un premier lancement.
function accountsConsumeFreshFlag(){
  try{
    if(localStorage.getItem(ACC_FRESH_KEY)!=='1')return false;
    localStorage.removeItem(ACC_FRESH_KEY);
    return true;
  }catch(e){return false;}
}

function loadAccountGlobals(){
  savedArmies=accGet('armies',[]);
  // UNE SEULE ARMÉE : un compte créé avant la fusion de « Mes armées »
  // et de la composition (voir js/armies.js) peut en avoir plusieurs.
  if(savedArmies.length>1){savedArmies=[savedArmies[0]];saveArmies();}
  savedAiArmies=accGet('ai_armies',[]);
  // Dotation de départ : le Monarque et le Général, rien de plus. Les
  // créatures s'obtiennent dans les coffres (les trois premières
  // pendant le tutoriel), les paliers d'ELO ouvrant le reste.
  if(typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE){
    VV_UNLOCKED=new Set(PIECES.map(p=>p.id));
    return;
  }
  const defs=UNLOCK_TABLE.filter(u=>u.eloRequired===0&&!u.coffre&&u.pieceId).map(u=>u.pieceId);
  const stored=accGet('unlocked_pieces',null);
  VV_UNLOCKED=new Set(stored||defs);
  // Les déblocages suivent le SOMMET atteint, jamais le classement du
  // moment : une mauvaise série ne doit pas retirer une créature
  // gagnée. Et le sommet vient du serveur, donc ce calcul n'est plus
  // une décision du navigateur mais une lecture.
  const peak=vvLoadPeakElo();
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.pieceId||u.coffre)return;
    if(u.eloRequired<=peak)VV_UNLOCKED.add(u.pieceId);
  });
}

function saveArmies(){accSet('armies',savedArmies);}
function saveAiArmies(){accSet('ai_armies',savedAiArmies);}

// Le bandeau du haut a disparu : le pseudo et l'ELO sont sur le menu
// principal, en toutes lettres. La fonction subsiste sous son nom (une
// douzaine d'appels y mènent) et ne rafraîchit plus que ce menu.
function updateCab(){
  if(!CUR_ACC)return;
  renderMenuIdentity();
  if(typeof accountUIRefresh==='function')accountUIRefresh();
  // L'ELO vient de changer : les autres joueurs doivent voir le bon
  // nombre à côté de mon pseudo dans le salon de présence.
  if(typeof mpPresenceRefresh==='function')mpPresenceRefresh();
}

// ----------------------------------------------------------------
// IDENTITÉ SUR LE MENU PRINCIPAL
// ----------------------------------------------------------------
// Pseudo en haut au milieu, rang et ELO juste dessous, et le bouton qui
// ouvre la Diagonale de la Puissance à côté du chiffre.
function renderMenuIdentity(){
  const nameEl=document.getElementById('jouer-name');
  const rankEl=document.getElementById('jouer-rank');
  const eloEl=document.getElementById('jouer-elo');
  if(!nameEl||!rankEl||!eloEl)return;
  if(!CUR_ACC){nameEl.textContent='';rankEl.textContent='';eloEl.textContent='';return;}
  // Le RANG vient du sommet atteint (il est acquis), le NOMBRE est le
  // classement du moment (il bouge). Les deux se lisent côte à côte.
  const elo=vvLoadElo(),rank=vvRank();
  nameEl.textContent=CUR_ACC;
  rankEl.textContent=rank.name;
  rankEl.style.color=rank.color;
  eloEl.textContent=elo+' ELO'+(ADMIN_MODE?' · ADMIN':'');
  eloEl.classList.toggle('admin-elo',!!ADMIN_MODE);
}

// ----------------------------------------------------------------
// PROGRESSION ELO / DÉBLOCAGES / HISTORIQUE
// ----------------------------------------------------------------
// Ces fonctions ne sont plus que des LECTURES de la fiche du serveur.
// Les « save » qui subsistent (vvSaveElo, vvSaveHistory…) ne servent
// qu'à rafraîchir l'affichage : la valeur, elle, est arrivée du serveur
// avec la réponse au rapport de partie.
//
// MODE TEST (/?test) et COMPTES ADMIN : l'ELO affiché est 10 000 — tout
// est donc débloqué, y compris les échiquiers — et rien n'est
// enregistré. On y entre et on en sort sans laisser de trace.
const ADMIN_ELO=10000;
function vvAdmin(){return typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE;}
function vvLoadElo(){return vvAdmin()?ADMIN_ELO:accGet('elo',0);}

// DEUX NOMBRES, DEUX RÔLES : LE CLASSEMENT ET LE RANG.
//
// `elo` est le CLASSEMENT VIVANT : il monte et il descend, et une
// défaite coûte toujours au moins un point (voir ec_elo_calc dans
// supabase/schema.sql, transcription de vvCalcNewElo).
//
// `elo_peak` est le PLUS HAUT ELO JAMAIS ATTEINT, et il ne descend
// jamais. C'est LUI qui décide du rang affiché et de tout ce qui se
// débloque : créatures, échiquiers, jalons de la Diagonale. Un joueur
// qui a touché Bronze reste Bronze pour toujours, et ne reperd jamais
// une créature — même si son classement retombe à 400.
//
// Les deux sont tenus par le serveur : c'est lui qui relève le sommet
// au moment où il calcule le nouvel ELO (greatest(elo_peak, new_elo)),
// et le navigateur ne peut ni l'avancer ni le reculer.
function vvLoadPeakElo(){
  if(vvAdmin())return ADMIN_ELO;
  return Math.max(accGet('elo_peak',0),accGet('elo',0));
}
// LE RANG ACQUIS : la seule fonction à utiliser pour AFFICHER un rang
// ou pour décider d'un déblocage. vvGetRank(vvLoadElo()) donnerait le
// rang du classement du moment, qui peut être plus bas — et retirerait
// alors au joueur un rang qu'il a gagné.
function vvRank(){return vvGetRank(vvLoadPeakElo());}
function vvRankIdx(){return vvGetRankIdx(vvLoadPeakElo());}
function vvLoadRankMax(){return accGet('rank_max',0);}
function vvLoadHistory(){return accGet('match_history',[]);}

// LES ÉCRITURES DE CLASSEMENT N'EXISTENT PLUS. vvSaveElo, vvSaveHistory,
// vvSaveRankMax, vvNotePieceStats et vvNoteStreak ont été supprimées
// plutôt que vidées : une fonction qui ne fait rien se rappelle par
// erreur, et le jour où quelqu'un la rappelle, il croit avoir enregistré
// quelque chose. Le seul chemin vers ces nombres est le rapport de fin de
// partie (ecReportMatch, js/server.js), et il rapatrie la fiche complète.
//
// Ce qui reste écrit par le jeu, en revanche, l'est toujours : les
// créatures débloquées suivent l'ouverture des coffres autant que les
// paliers d'ELO, et le serveur ne connaît pas les coffres.
function vvSaveUnlocked(s){if(vvAdmin())return;accSet('unlocked_pieces',[...s]);}

// ----------------------------------------------------------------
// CE QU'UN COMPTE A VÉCU
// ----------------------------------------------------------------
// Taux de victoire, meilleure série, créature fétiche : ce sont des
// agrégats de CARRIÈRE, et le serveur les tient au moment où il
// enregistre chaque partie (ec_report_match). On ne les déduit surtout
// PAS de match_history, qui ne garde que les 30 dernières parties : une
// statistique de carrière lue sur un mois de jeu serait fausse et
// changerait de valeur toute seule au fil des parties.
//
//   piece_stats  {pieceId: {g, w}}  parties et victoires, par créature
//   best_streak                     la plus longue série de victoires
function vvLoadPieceStats(){const o=accGet('piece_stats',{});return (o&&typeof o==='object')?o:{};}
function vvLoadBestStreak(){return accGet('best_streak',0);}
