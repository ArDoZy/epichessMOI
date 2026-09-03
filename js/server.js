// ================================================================
// SERVER.JS : le serveur fait autorité
// ================================================================
// TOUT CE QU'UN COMPTE POSSÈDE VIT SUR LE SERVEUR. L'ELO, le sommet
// atteint, les créatures débloquées, les pouvoirs, les perles,
// l'inventaire, les armées, les statistiques et l'historique des
// parties étaient dans le localStorage du navigateur : chacun était
// donc propriétaire de son propre classement, et une progression
// disparaissait avec un cache vidé ou un changement de téléphone.
// Ils sont maintenant dans une table Postgres du projet Supabase, et
// le navigateur n'en garde qu'une COPIE DE TRAVAIL, rechargée à chaque
// ouverture depuis le serveur.
//
// CE FICHIER EST LA SEULE PORTE. Aucun autre module ne parle au
// serveur de données : accounts.js lit et écrit la copie de travail
// (accGet/accSet), et c'est ici que les écritures partent, groupées.
//
// -- CE QUE LE CLIENT NE PEUT PAS FAIRE --------------------------
// La table est fermée (RLS sans policy, voir supabase/schema.sql) :
// même avec la clé du jeu en main, on ne peut pas lire ni écrire une
// ligne. On ne peut qu'appeler les fonctions ec_*, qui vérifient tout.
// En particulier, ec_save_state REFUSE les clés de classement : le
// nouvel ELO ne s'obtient qu'en déclarant une partie
// (ecReportMatch → ec_report_match), et c'est le serveur qui le
// calcule. Trafiquer son stockage local ne rapporte donc rien : au
// rechargement suivant, la fiche du serveur écrase tout.
//
// -- L'IDENTITÉ ---------------------------------------------------
// Pas de mot de passe : à la création, le navigateur tire au sort une
// CLÉ D'APPAREIL (32 caractères) qu'il garde et n'envoie qu'au serveur.
// Le couple (id du compte, clé) tient lieu de session. Plusieurs
// comptes peuvent cohabiter sur un appareil : ecSessions() en tient la
// liste. Les pseudos, eux, sont uniques pour TOUT LE MONDE — la
// contrainte est dans la base.
//
// Dépendances : aucune (fetch nu, pas même le SDK Supabase — il ne
// sert qu'au temps réel du multijoueur). Chargé AVANT accounts.js.
// Utilisé par : accounts.js, game-flow.js, leaderboard.js,
// account-ui.js, multiplayer.js.
// ================================================================

// Project URL et clé publique du projet Supabase. La clé « publishable »
// est faite pour vivre dans le code d'un site : elle n'ouvre que ce que
// les règles du serveur autorisent. La clé « secret », elle, ne doit
// JAMAIS apparaître ici.
const SUPABASE_URL='https://qwtlmaacjfxlbvrvooim.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_8PgQoH4YhF6oitNVRh3JBQ_T9fcNwwQ';

// LA FICHE DU COMPTE COURANT, telle que le serveur la donne. C'est LA
// vérité : tout ce que le jeu affiche d'un compte en sort.
//   {id, username, is_admin, elo, elo_peak, ranked_games, ranked_wins,
//    best_streak, cur_streak, piece_stats, history, state}
let ECP=null;

// ----------------------------------------------------------------
// LES SESSIONS DE CET APPAREIL
// ----------------------------------------------------------------
// La SEULE chose qui reste dans le localStorage : de quoi prouver au
// serveur qu'on est bien le propriétaire de tel compte. Aucune donnée
// de jeu n'y figure plus.
const EC_SESSIONS_KEY='ec_sessions_v1';   // [{id, secret, username}]
const EC_CURRENT_KEY='ec_current_v1';     // id du compte courant
const EC_MAX_SESSIONS=8;

function ecSessions(){
  try{
    const raw=JSON.parse(localStorage.getItem(EC_SESSIONS_KEY)||'[]');
    if(Array.isArray(raw))return raw.filter(s=>s&&typeof s.id==='string'&&typeof s.secret==='string');
  }catch(e){}
  return [];
}
function ecSaveSessions(list){
  try{localStorage.setItem(EC_SESSIONS_KEY,JSON.stringify(list.slice(0,EC_MAX_SESSIONS)));}catch(e){}
}
function ecCurrentSession(){
  const list=ecSessions();
  if(!list.length)return null;
  const id=localStorage.getItem(EC_CURRENT_KEY);
  return list.find(s=>s.id===id)||list[0];
}
function ecSetCurrent(id){try{localStorage.setItem(EC_CURRENT_KEY,id);}catch(e){}}
// Inscrit ou met à jour une session, et la place en tête : la liste est
// ordonnée du plus récemment utilisé au plus ancien, comme la page
// Comptes la présente.
function ecRememberSession(sess){
  const list=ecSessions().filter(s=>s.id!==sess.id);
  list.unshift(sess);
  ecSaveSessions(list);
  ecSetCurrent(sess.id);
}
function ecForgetSession(id){
  const list=ecSessions().filter(s=>s.id!==id);
  ecSaveSessions(list);
  if(localStorage.getItem(EC_CURRENT_KEY)===id){
    if(list.length)ecSetCurrent(list[0].id);
    else try{localStorage.removeItem(EC_CURRENT_KEY);}catch(e){}
  }
}

// La clé d'appareil : 32 caractères tirés du générateur cryptographique
// du navigateur. Elle ne sert qu'à prouver « ce compte est le mien » et
// ne voyage que vers le serveur, qui n'en stocke que l'empreinte.
function ecNewSecret(){
  const a=new Uint8Array(16);
  (self.crypto||window.crypto).getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}

// ----------------------------------------------------------------
// PURGE DES ANCIENS COMPTES LOCAUX
// ----------------------------------------------------------------
// Les comptes d'avant (mc_p_<pseudo>_<clé>, ec_accounts_v2,
// ec_username_v1, mc_accs_v3) n'ont plus de sens : ils n'existaient que
// dans un navigateur, leurs pseudos ne sont pas uniques, et leur ELO
// n'a jamais été vérifié par personne. Ils sont EFFACÉS, une fois,
// au premier lancement de cette version — c'est la remise à zéro
// demandée, et elle doit être franche : garder des reliquats donnerait
// deux progressions concurrentes sur le même écran.
const EC_PURGE_KEY='ec_legacy_purged_v1';
function ecPurgeLegacyAccounts(){
  try{
    if(localStorage.getItem(EC_PURGE_KEY))return;
    const doomed=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k)continue;
      if(k.startsWith('mc_p_')||k==='ec_accounts_v2'||k==='ec_username_v1'||
         k==='mc_accs_v3'||k==='ec_fresh_account_v1')doomed.push(k);
    }
    doomed.forEach(k=>localStorage.removeItem(k));
    localStorage.setItem(EC_PURGE_KEY,String(Date.now()));
  }catch(e){}
}

// ----------------------------------------------------------------
// APPELS AU SERVEUR
// ----------------------------------------------------------------
// fetch nu sur /rest/v1/rpc/<fonction> : le SDK Supabase n'est chargé
// que pour le temps réel du multijoueur, et le faire attendre ici
// retarderait le démarrage du jeu de tout le temps du CDN.
const EC_RPC_TIMEOUT=12000;

function ecRpc(fn,args,opts){
  // Bac à sable local : voir « LE MODE ?mock » en bas de ce fichier. Rien
  // ne l'allume tout seul — il faut l'adresse.
  if(EC_MOCK)return ecMockRpc(fn,args);
  const o=opts||{};
  const ctl=(typeof AbortController!=='undefined')?new AbortController():null;
  const timer=ctl?setTimeout(()=>ctl.abort(),o.timeout||EC_RPC_TIMEOUT):null;
  return fetch(SUPABASE_URL+'/rest/v1/rpc/'+fn,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:SUPABASE_PUBLISHABLE_KEY,
      Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,
    },
    body:JSON.stringify(args||{}),
    signal:ctl?ctl.signal:undefined,
    keepalive:!!o.keepalive,
  }).then(async r=>{
    if(timer)clearTimeout(timer);
    let body=null;
    try{body=await r.json();}catch(e){}
    if(!r.ok){
      // PostgREST renvoie le message de l'exception Postgres : ce sont
      // nos propres phrases (« Ce pseudo est déjà pris. »), écrites pour
      // être montrées telles quelles.
      const err=new Error((body&&(body.message||body.error))||('Serveur : HTTP '+r.status));
      err.status=r.status;err.code=body&&body.code;err.rpc=fn;
      throw err;
    }
    return body;
  }).catch(e=>{
    if(timer)clearTimeout(timer);
    if(e&&e.name==='AbortError'){
      const err=new Error('Le serveur ne répond pas. Réessayez dans un instant.');
      err.offline=true;throw err;
    }
    if(e instanceof TypeError){
      const err=new Error('Impossible de joindre le serveur du jeu. Vérifiez votre connexion.');
      err.offline=true;throw err;
    }
    throw e;
  });
}

// Appel authentifié : ajoute l'identifiant et la clé du compte courant.
function ecRpcAuth(fn,args,opts){
  const s=ecCurrentSession();
  if(!s)return Promise.reject(new Error('Aucun compte connecté.'));
  return ecRpc(fn,Object.assign({p_id:s.id,p_secret:s.secret},args||{}),opts);
}

// ----------------------------------------------------------------
// COMPTE : CRÉER, SE CONNECTER, RENOMMER, SUPPRIMER
// ----------------------------------------------------------------
function ecAdoptProfile(p){
  ECP=p;
  if(p&&p.id){
    const s=ecCurrentSession();
    if(s&&s.id===p.id&&s.username!==p.username){
      s.username=p.username;ecRememberSession(s);
    }
  }
  return p;
}

function ecSignup(username){
  const secret=ecNewSecret();
  return ecRpc('ec_signup',{p_username:username,p_secret:secret}).then(p=>{
    ecRememberSession({id:p.id,secret,username:p.username});
    return ecAdoptProfile(p);
  });
}

function ecLogin(){
  const s=ecCurrentSession();
  if(!s)return Promise.reject(new Error('Aucun compte connecté.'));
  return ecRpc('ec_login',{p_id:s.id,p_secret:s.secret}).then(p=>{
    ecRememberSession({id:p.id,secret:s.secret,username:p.username});
    return ecAdoptProfile(p);
  });
}

function ecRename(username){
  return ecRpcAuth('ec_rename',{p_username:username}).then(p=>ecAdoptProfile(p));
}

function ecNameFree(username){
  return ecRpc('ec_name_free',{p_name:username});
}

function ecDeleteAccount(id,secret){
  return ecRpc('ec_delete',{p_id:id,p_secret:secret}).then(r=>{
    ecForgetSession(id);
    return r;
  });
}

// ----------------------------------------------------------------
// ÉCRITURES DE PROGRESSION : GROUPÉES, ET JAMAIS PERDUES
// ----------------------------------------------------------------
// accSet() est appelé des dizaines de fois d'affilée (fin de partie,
// ouverture d'un coffre…). Un aller-retour par appel noierait le
// serveur et rendrait le jeu saccadé. Les modifications sont donc
// accumulées et poussées en un seul appel après une courte accalmie ;
// un échec ne les jette pas, il les remet dans le paquet suivant.
const EC_SAVE_DEBOUNCE=700;
const EC_SAVE_RETRY=[1000,3000,8000,20000];
let _ecPatch={};        // ce qui attend d'être envoyé
let _ecSaveTimer=null;
let _ecSaving=false;
let _ecFails=0;

function ecQueueState(key,value){
  _ecPatch[key]=value;
  if(_ecSaveTimer)clearTimeout(_ecSaveTimer);
  _ecSaveTimer=setTimeout(ecFlushState,EC_SAVE_DEBOUNCE);
}

function ecPendingWrites(){return Object.keys(_ecPatch).length>0||_ecSaving;}

function ecFlushState(){
  if(_ecSaveTimer){clearTimeout(_ecSaveTimer);_ecSaveTimer=null;}
  if(_ecSaving)return Promise.resolve(false);
  const keys=Object.keys(_ecPatch);
  if(!keys.length)return Promise.resolve(true);
  if(!ecCurrentSession())return Promise.resolve(false);
  const patch=_ecPatch;_ecPatch={};_ecSaving=true;
  return ecRpcAuth('ec_save_state',{p_patch:patch}).then(()=>{
    _ecSaving=false;_ecFails=0;
    ecServerNoteOk();
    return true;
  }).catch(e=>{
    _ecSaving=false;
    // Ce qui vient d'être écrit PENDANT l'envoi a priorité : on remet le
    // paquet échoué DESSOUS, pas dessus.
    _ecPatch=Object.assign({},patch,_ecPatch);
    const wait=EC_SAVE_RETRY[Math.min(_ecFails++,EC_SAVE_RETRY.length-1)];
    ecServerNoteFail(e);
    if(_ecSaveTimer)clearTimeout(_ecSaveTimer);
    _ecSaveTimer=setTimeout(ecFlushState,wait);
    return false;
  });
}

// L'onglet se ferme ou passe en arrière-plan : on envoie tout de suite,
// avec keepalive pour que la requête survive à la fermeture.
function ecFlushNow(){
  if(_ecSaveTimer){clearTimeout(_ecSaveTimer);_ecSaveTimer=null;}
  const keys=Object.keys(_ecPatch);
  if(!keys.length||!ecCurrentSession())return;
  const patch=_ecPatch;_ecPatch={};
  ecRpcAuth('ec_save_state',{p_patch:patch},{keepalive:true,timeout:4000}).catch(()=>{
    _ecPatch=Object.assign({},patch,_ecPatch);
  });
}
if(typeof window!=='undefined'){
  window.addEventListener('pagehide',ecFlushNow);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')ecFlushNow();
  });
}

// ----------------------------------------------------------------
// LA FIN D'UNE PARTIE : LE SERVEUR TRANCHE
// ----------------------------------------------------------------
// Le client décrit ce qui s'est passé, il ne décide pas de ce que ça
// vaut. En retour, le serveur donne la fiche complète et l'écart réel
// d'ELO — le jeu adopte ces nombres, y compris s'ils diffèrent de ceux
// qu'il avait affichés pendant la cinématique.
//
// UN RAPPORT NE SE PERD PAS. S'il échoue (réseau coupé au mauvais
// moment), il est réessayé ; en dernier recours il attend le prochain
// lancement du jeu, dans une file gardée localement.
const EC_PENDING_MATCHES='ec_pending_matches_v1';

function ecPendingMatches(){
  try{const a=JSON.parse(localStorage.getItem(EC_PENDING_MATCHES)||'[]');
      return Array.isArray(a)?a:[];}catch(e){return[];}
}
function ecSavePendingMatches(a){
  try{localStorage.setItem(EC_PENDING_MATCHES,JSON.stringify(a.slice(-20)));}catch(e){}
}
function ecPushPendingMatch(id,payload){
  const a=ecPendingMatches();a.push({id,payload});ecSavePendingMatches(a);
}

function ecReportMatch(payload){
  const s=ecCurrentSession();
  if(!s)return Promise.reject(new Error('Aucun compte connecté.'));
  return ecRpc('ec_report_match',{p_id:s.id,p_secret:s.secret,p_payload:payload})
    .then(r=>{
      ecAdoptProfile(r.profile);
      ecServerNoteOk();
      return r;
    })
    .catch(e=>{
      // Réseau : on garde la partie pour plus tard. Refus du serveur
      // (résultat invalide, compte inconnu) : inutile de la rejouer.
      if(e&&e.offline)ecPushPendingMatch(s.id,payload);
      ecServerNoteFail(e);
      throw e;
    });
}

// Rejoue les parties restées en rade, au démarrage. En série et non en
// parallèle : l'ELO de chacune dépend de celui que laisse la précédente.
function ecFlushPendingMatches(){
  const s=ecCurrentSession();
  if(!s)return Promise.resolve();
  const all=ecPendingMatches();
  const mine=all.filter(m=>m.id===s.id);
  if(!mine.length)return Promise.resolve();
  ecSavePendingMatches(all.filter(m=>m.id!==s.id));
  let chain=Promise.resolve();
  mine.forEach(m=>{
    chain=chain.then(()=>ecRpc('ec_report_match',
      {p_id:s.id,p_secret:s.secret,p_payload:m.payload})
      .then(r=>{ecAdoptProfile(r.profile);})
      .catch(e=>{if(e&&e.offline)ecPushPendingMatch(s.id,m.payload);}));
  });
  return chain;
}

// ----------------------------------------------------------------
// PRÉSENCE : QUI EST EN LIGNE
// ----------------------------------------------------------------
// Un battement toutes les 30 s tant que l'onglet est visible. C'est ce
// qui allume la pastille verte à côté d'un pseudo, au classement comme
// dans la recherche. On ne bat pas dans un onglet caché : quelqu'un qui
// a laissé le jeu ouvert derrière son navigateur n'est pas disponible
// pour un défi.
const EC_HEARTBEAT_MS=30000;
let _ecHbId=null;
let EC_ONLINE_COUNT=0;

function ecHeartbeat(){
  if(!ecCurrentSession())return;
  if(typeof document!=='undefined'&&document.visibilityState==='hidden')return;
  ecRpcAuth('ec_touch',{},{timeout:8000}).then(r=>{
    if(r&&typeof r.online==='number')EC_ONLINE_COUNT=r.online;
    ecServerNoteOk();
  }).catch(e=>ecServerNoteFail(e));
}
function ecStartHeartbeat(){
  ecStopHeartbeat();
  ecHeartbeat();
  _ecHbId=setInterval(ecHeartbeat,EC_HEARTBEAT_MS);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')ecHeartbeat();
  });
}
function ecStopHeartbeat(){if(_ecHbId){clearInterval(_ecHbId);_ecHbId=null;}}

// ----------------------------------------------------------------
// LECTURES PUBLIQUES : CLASSEMENT, RECHERCHE, PROFIL
// ----------------------------------------------------------------
function ecLeaderboard(limit,offset){
  return ecRpc('ec_leaderboard',{p_limit:limit||50,p_offset:offset||0});
}
function ecSearchPlayers(q){
  return ecRpc('ec_search',{p_q:q,p_limit:25});
}
function ecProfileOf(opts){
  const o=opts||{};
  return ecRpc('ec_profile',{p_id:o.id||null,p_username:o.username||null});
}

// ----------------------------------------------------------------
// L'ÉTAT DE LA LIAISON, MONTRÉ AU JOUEUR
// ----------------------------------------------------------------
// Quand le serveur détient la progression, une coupure n'est plus un
// détail technique : ce que le joueur gagne pendant ce temps n'est pas
// encore enregistré. Il doit le savoir — sans que le jeu s'arrête pour
// autant, puisque tout est réessayé.
let EC_LINK_OK=true;
function ecServerNoteOk(){
  if(EC_LINK_OK)return;
  EC_LINK_OK=true;
  ecPaintLink();
}
function ecServerNoteFail(e){
  if(!e||!e.offline)return;   // un refus du serveur n'est pas une coupure
  if(!EC_LINK_OK)return;
  EC_LINK_OK=false;
  ecPaintLink();
}
function ecPaintLink(){
  const el=document.getElementById('ec-link-warn');
  if(!el)return;
  el.classList.toggle('show',!EC_LINK_OK);
}

// ================================================================
// SERVEUR DE SECOURS, EN MÉMOIRE : LE MODE `?mock`
// ================================================================
// POURQUOI IL EXISTE. Depuis que le serveur détient les comptes, ouvrir
// index.html sans réseau ne mène plus nulle part : le voile de démarrage
// tourne et le jeu ne s'ouvre pas. C'est le bon comportement en
// production — jouer sur une progression qu'on ne peut pas enregistrer
// n'est pas jouer — mais cela rendrait impossible deux choses qui
// comptent : travailler sur le jeu dans le train, et faire tourner le
// test de fumée (tools/smoke-test.js), qui n'a pas de projet Supabase.
//
// `/?mock` remplace donc les onze fonctions du serveur par la même API,
// tenue dans le localStorage de ce navigateur. Les règles sont
// EXACTEMENT celles du serveur — pseudos uniques, ELO recalculé par la
// même formule (vvCalcNewElo, js/voie.js, dont supabase/schema.sql est
// la transcription), clés de classement inaccessibles en écriture —
// parce qu'un bac à sable qui ne suit pas les règles ne teste rien.
//
// IL NE S'ALLUME JAMAIS TOUT SEUL. Ni au premier échec réseau, ni au
// centième : un repli automatique sur une base locale donnerait à
// quelqu'un un compte fantôme, une progression qui ne remonterait
// jamais, et le sentiment que le jeu a « perdu » sa partie. Il faut
// l'adresse, et l'adresse le dit.
const EC_MOCK_FLAG='ec_mock_v1';
const EC_MOCK_DB='ec_mock_db_v1';
function ecMockOn(){
  try{
    if(typeof location!=='undefined'&&new URLSearchParams(location.search).has('mock')){
      // Le drapeau est COLLANT : le jeu réécrit son adresse (setAppPath,
      // js/main.js) et recharge la page quand on change de compte. Sans
      // cela, le mode se perdrait au premier de ces deux gestes.
      localStorage.setItem(EC_MOCK_FLAG,'1');
      return true;
    }
    return localStorage.getItem(EC_MOCK_FLAG)==='1';
  }catch(e){return false;}
}
const EC_MOCK=ecMockOn();

function ecMockLoad(){
  try{const d=JSON.parse(localStorage.getItem(EC_MOCK_DB)||'{}');
      return (d&&typeof d==='object'&&d.players)?d:{players:{}};}
  catch(e){return{players:{}};}
}
function ecMockSave(db){try{localStorage.setItem(EC_MOCK_DB,JSON.stringify(db));}catch(e){}}
function ecMockKey(n){return String(n||'').trim().replace(/\s+/g,' ').toLowerCase();}
function ecMockFail(msg,code){const e=new Error(msg);e.code=code||'P0001';return Promise.reject(e);}
function ecMockNameError(n){
  const t=String(n||'').trim();
  if(t.length<2||t.length>20)return 'Le pseudo doit faire entre 2 et 20 caractères.';
  for(let i=0;i<t.length;i++){const c=t.charCodeAt(i);if(c<32||c===127)
    return 'Ce pseudo contient des caractères invisibles.';}
  return null;
}
function ecMockOnline(p){return (Date.now()-(p.last_seen_at||0))<75000;}
function ecMockSelf(p){return JSON.parse(JSON.stringify(p));}
function ecMockPublic(p){
  const o=ecMockSelf(p);
  delete o.secret;delete o.state;
  o.history=(p.history||[]).slice(-10);
  o.online=ecMockOnline(p);
  return o;
}
function ecMockAuth(db,id,secret){
  const p=db.players[id];
  if(!p||p.secret!==secret)return null;
  p.last_seen_at=Date.now();
  return p;
}
function ecMockRanked(db){
  return Object.values(db.players)
    .filter(p=>!p.is_admin&&(p.ranked_games|0)>0)
    .sort((a,b)=>(b.elo-a.elo)||(b.ranked_games-a.ranked_games)||(a.created_at-b.created_at));
}

function ecMockRpc(fn,args){
  const db=ecMockLoad();
  const a=args||{};
  const auth=()=>ecMockAuth(db,a.p_id,a.p_secret);
  let p;
  switch(fn){
    case 'ec_name_free':{
      const e=ecMockNameError(a.p_name);
      if(e)return Promise.resolve({ok:false,error:e});
      const taken=Object.values(db.players).some(x=>x.username_key===ecMockKey(a.p_name));
      return Promise.resolve(taken?{ok:false,error:'Ce pseudo est déjà pris.'}:{ok:true});
    }
    case 'ec_signup':{
      const e=ecMockNameError(a.p_username);
      if(e)return ecMockFail(e,'22023');
      if(Object.values(db.players).some(x=>x.username_key===ecMockKey(a.p_username)))
        return ecMockFail('Ce pseudo est déjà pris.','23505');
      const id=(self.crypto&&self.crypto.randomUUID)?self.crypto.randomUUID()
        :'mock-'+Math.random().toString(36).slice(2)+'-'+Date.now().toString(36);
      p={id,username:String(a.p_username).trim(),username_key:ecMockKey(a.p_username),
         secret:a.p_secret,is_admin:false,elo:0,elo_peak:0,ranked_games:0,ranked_wins:0,
         ranked_draws:0,best_streak:0,cur_streak:0,piece_stats:{},history:[],state:{},
         created_at:Date.now(),last_seen_at:Date.now()};
      db.players[id]=p;ecMockSave(db);
      return Promise.resolve(ecMockSelf(p));
    }
    case 'ec_login':
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      ecMockSave(db);return Promise.resolve(ecMockSelf(p));
    case 'ec_touch':
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      ecMockSave(db);
      return Promise.resolve({ok:true,
        online:Object.values(db.players).filter(x=>!x.is_admin&&ecMockOnline(x)).length});
    case 'ec_rename':{
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      const e=ecMockNameError(a.p_username);
      if(e)return ecMockFail(e,'22023');
      const key=ecMockKey(a.p_username);
      if(Object.values(db.players).some(x=>x.id!==p.id&&x.username_key===key))
        return ecMockFail('Ce pseudo est déjà pris.','23505');
      p.username=String(a.p_username).trim();p.username_key=key;
      ecMockSave(db);return Promise.resolve(ecMockSelf(p));
    }
    case 'ec_delete':
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      delete db.players[p.id];ecMockSave(db);
      return Promise.resolve({ok:true});
    case 'ec_save_state':{
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      const patch=Object.assign({},a.p_patch||{});
      ['elo','elo_peak','ranked_games','ranked_wins','best_streak',
       'piece_stats','match_history','rank_max'].forEach(k=>{delete patch[k];});
      p.state=Object.assign(p.state||{},patch);
      ecMockSave(db);return Promise.resolve({ok:true});
    }
    case 'ec_report_match':{
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      const pay=a.p_payload||{};
      const res=pay.result;
      if(['win','loss','draw'].indexOf(res)<0)return ecMockFail('Résultat inconnu.','22023');
      const ranked=(pay.ranked!==false)&&!p.is_admin;
      const oppElo=Math.max(0,Math.min(4000,pay.opp_elo|0));
      const old=p.elo|0;let delta=0;
      if(ranked){
        // La MÊME formule que le serveur : vvCalcNewElo est l'original dont
        // ec_elo_calc (supabase/schema.sql) est la transcription.
        const c=(typeof vvCalcNewElo==='function')
          ?vvCalcNewElo(old,oppElo,res,p.ranked_games|0):{newElo:old,delta:0};
        p.elo=c.newElo;delta=c.delta;
        p.elo_peak=Math.max(p.elo_peak|0,p.elo);
        p.ranked_games=(p.ranked_games|0)+1;
        if(res==='win')p.ranked_wins=(p.ranked_wins|0)+1;
        if(res==='draw')p.ranked_draws=(p.ranked_draws|0)+1;
        p.cur_streak=(res==='win')?(p.cur_streak|0)+1:0;
        p.best_streak=Math.max(p.best_streak|0,p.cur_streak);
        new Set((pay.army||[]).filter(Boolean)).forEach(id=>{
          const e=p.piece_stats[id]||{g:0,w:0};
          e.g++;if(res==='win')e.w++;
          p.piece_stats[id]=e;
        });
      }
      p.history=(p.history||[]).concat([{result:res,oldElo:old,newElo:p.elo,delta,
        date:Date.now(),aiElo:oppElo,ranked,opp:pay.opp_name||null,
        army:pay.army||[],mode:pay.mode||'ia'}]).slice(-30);
      ecMockSave(db);
      return Promise.resolve({profile:ecMockSelf(p),delta,old_elo:old,new_elo:p.elo,ranked});
    }
    case 'ec_leaderboard':{
      const all=ecMockRanked(db);
      const off=Math.max(0,a.p_offset|0),lim=Math.max(1,a.p_limit|0||50);
      return Promise.resolve({total:all.length,
        rows:all.slice(off,off+lim).map((x,i)=>({rank:off+i+1,id:x.id,username:x.username,
          elo:x.elo,elo_peak:x.elo_peak,ranked_games:x.ranked_games,
          ranked_wins:x.ranked_wins,online:ecMockOnline(x)}))});
    }
    case 'ec_search':{
      const q=ecMockKey(a.p_q);
      if(!q)return Promise.resolve([]);
      return Promise.resolve(Object.values(db.players)
        .filter(x=>!x.is_admin&&x.username_key.indexOf(q)>=0)
        .sort((x,y)=>(ecMockOnline(y)-ecMockOnline(x))||(y.elo-x.elo))
        .slice(0,a.p_limit||20)
        .map(x=>({id:x.id,username:x.username,elo:x.elo,elo_peak:x.elo_peak,
                  ranked_games:x.ranked_games,ranked_wins:x.ranked_wins,
                  online:ecMockOnline(x)})));
    }
    case 'ec_profile':{
      const found=a.p_id?db.players[a.p_id]
        :Object.values(db.players).find(x=>x.username_key===ecMockKey(a.p_username));
      if(!found)return Promise.resolve({found:false});
      const all=ecMockRanked(db);
      const idx=all.findIndex(x=>x.id===found.id);
      return Promise.resolve(Object.assign(ecMockPublic(found),
        {found:true,rank:idx<0?null:idx+1}));
    }
  }
  return ecMockFail('Fonction inconnue : '+fn);
}

// SEMER UNE FICHE, EN MODE `?mock` UNIQUEMENT. Le test de fumée
// (tools/smoke-test.js) doit pouvoir donner à un compte un passé
// plausible — douze parties, un ELO, une créature fétiche — pour
// vérifier que les écrans le racontent. Ce sont des clés de classement :
// accSet les refuse, et c'est bien le but. Cette porte-là n'existe donc
// QUE dans le bac à sable, où il n'y a rien à protéger.
function ecMockSeed(patch){
  if(!EC_MOCK||!ECP)return false;
  const db=ecMockLoad();
  const p=db.players[ECP.id];
  if(!p)return false;
  Object.assign(p,patch||{});
  ecMockSave(db);
  Object.assign(ECP,patch||{});
  return true;
}
