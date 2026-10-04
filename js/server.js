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
// LE CODE DE SECOURS : un compte qui survit à son appareil
// ----------------------------------------------------------------
// La clé d'appareil ne quittait jamais le navigateur : un cache vidé, un
// téléphone changé, ou Safari qui efface le stockage d'un site au bout de
// sept jours sans visite, et le compte était perdu pour toujours — ELO, clan,
// créatures. Le code de secours est cette même clé, écrite pour être
// recopiée : l'identifiant du compte et sa clé, rien d'autre. Qui le possède
// possède le compte, et la page Comptes le dit.
const EC_RECOVERY_PREFIX='ECR1';
function ecRecoveryCode(){
  const s=ecCurrentSession();
  return s?EC_RECOVERY_PREFIX+'.'+s.id+'.'+s.secret:'';
}
function ecParseRecoveryCode(code){
  const m=String(code||'').trim().match(/^ECR1\.([0-9a-f-]{36})\.([0-9a-f]{16,128})$/i);
  return m?{id:m[1].toLowerCase(),secret:m[2].toLowerCase()}:null;
}
// Ouvre sur cet appareil le compte que désigne un code de secours. Le serveur
// vérifie la clé ; en cas de succès le compte rejoint la liste de l'appareil
// et devient le compte courant.
function ecRestoreFromCode(code){
  const c=ecParseRecoveryCode(code);
  if(!c)return Promise.reject(new Error('Ce code de secours n\'est pas valide.'));
  return ecRpc('ec_login',{p_id:c.id,p_secret:c.secret}).then(p=>{
    ecRememberSession({id:p.id,secret:c.secret,username:p.username});
    return p;
  }).catch(e=>{
    if(e&&e.code==='28000')throw new Error('Aucun compte ne répond à ce code.');
    throw e;
  });
}
// Change la clé du compte courant : l'ancien code de secours, et tout appareil
// qui le connaissait encore, perdent l'accès. À faire si le code a fuité.
function ecRotateSecret(){
  const s=ecCurrentSession();
  if(!s)return Promise.reject(new Error('Aucun compte connecté.'));
  const fresh=ecNewSecret();
  return ecRpc('ec_rotate_secret',{p_id:s.id,p_secret:s.secret,p_new_secret:fresh}).then(r=>{
    ecRememberSession({id:s.id,secret:fresh,username:s.username});
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
// LA GUERRE DES CLANS (supabase/migrations/001-guerre-des-clans.sql)
// ----------------------------------------------------------------
// Les quatorze portes des clans. Toutes renvoient ce que la page a besoin
// d'afficher ensuite (la plupart : la fiche complète « mon clan »), pour
// qu'un geste ne coûte jamais deux allers-retours.
//
// LA SEMAINE DE GUERRE EST UNE SEMAINE ISO, EN UTC, du lundi 00:00 au
// suivant — comme ec_week_key / ec_week_end côté serveur. Les deux calculs
// doivent tomber sur la même clé à la milliseconde près : ils ont été
// comparés sur trois ans de dates, années à 53 semaines comprises.
function ecWeekKey(t){
  const d=new Date(t||Date.now());
  const day=(d.getUTCDay()+6)%7;                 // lundi = 0
  // Le jeudi de la semaine décide de l'année ISO (c'est la définition).
  const th=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day+3));
  const y=th.getUTCFullYear();
  const jan4=new Date(Date.UTC(y,0,4));
  const w=1+Math.round(((th-jan4)/864e5-3+((jan4.getUTCDay()+6)%7))/7);
  return y+'-S'+String(w).padStart(2,'0');
}
function ecWeekEnd(t){
  const d=new Date(t||Date.now());
  const day=(d.getUTCDay()+6)%7;
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day+7);
}

// La fiche du joueur porte son clan (`ECP.clan`, voir ec_clan_brief) : le
// menu, le rail et le classement le lisent là, sans appel de plus. Chaque
// geste qui change d'appartenance la remet à jour ici.
function ecClanAdopt(mine){
  if(ECP&&mine&&('clan' in mine)){
    ECP.clan=mine.clan?{id:mine.clan.id,name:mine.clan.name,tag:mine.clan.tag,
      blazon:mine.clan.blazon,level:mine.clan.level,role:mine.me&&mine.me.role}:null;
  }
  return mine;
}
const ecClanCall=(fn,args)=>ecRpcAuth(fn,args||{}).then(ecClanAdopt);

function ecClanMine(){return ecClanCall('ec_clan_mine');}
function ecClanCreate(o){
  return ecClanCall('ec_clan_create',{p_name:o.name,p_tag:o.tag,p_blazon:o.blazon||{},
    p_motto:o.motto|0,p_recruit:o.recruit||'open',p_min_elo:o.min_elo|0});
}
function ecClanEdit(o){
  return ecClanCall('ec_clan_edit',{p_blazon:o.blazon||{},p_motto:o.motto|0,
    p_recruit:o.recruit||'open',p_min_elo:o.min_elo|0});
}
function ecClanJoin(clanId){return ecClanCall('ec_clan_join',{p_clan:clanId});}
function ecClanAnswer(playerId,accept){return ecClanCall('ec_clan_answer',{p_player:playerId,p_accept:!!accept});}
function ecClanLeave(){return ecClanCall('ec_clan_leave');}
function ecClanKick(playerId){return ecClanCall('ec_clan_kick',{p_player:playerId});}
function ecClanRole(playerId,role){return ecClanCall('ec_clan_role',{p_player:playerId,p_role:role});}
function ecClanCry(n){return ecRpcAuth('ec_clan_cry',{p_cry:n|0});}
function ecClanClaim(){return ecRpcAuth('ec_clan_claim',{});}
function ecClanView(clanId){return ecRpc('ec_clan_view',{p_clan:clanId});}
function ecClanList(q){return ecRpc('ec_clan_list',{p_q:q||null,p_limit:30});}
function ecClanWar(){return ecRpc('ec_clan_war',{p_limit:20});}

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
  let d;
  try{d=JSON.parse(localStorage.getItem(EC_MOCK_DB)||'{}');}catch(e){d=null;}
  if(!d||typeof d!=='object'||!d.players)d={players:{}};
  // Les tables des clans, une par table du serveur. Un bac à sable d'avant
  // les clans les reçoit vides au premier chargement.
  ['clans','clanMembers','clanWeeks','clanContrib','clanEvents','clanRequests','clanClaims']
    .forEach(k=>{if(!d[k]||typeof d[k]!=='object')d[k]={};});
  d.clanEventSeq=d.clanEventSeq|0;
  return d;
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
// `db` est facultatif : quand il est fourni, la fiche porte le clan du
// joueur, comme ec_self côté serveur.
function ecMockSelf(p,db){
  const o=JSON.parse(JSON.stringify(p));
  if(db)o.clan=ecMockClanBrief(db,p.id);
  return o;
}
function ecMockPublic(p,db){
  const o=ecMockSelf(p,db);
  delete o.secret;delete o.state;
  o.history=(p.history||[]).slice(-10);
  // TROIS CHOSES SORTENT DE `state`, ET TROIS SEULEMENT — l'armée choisie,
  // les pièces débloquées et les pouvoirs éveillés. Elles présentent le joueur ; le reste (inventaire,
  // perles, tickets, voies, tutoriel) est sa ressource et ne regarde que lui.
  // Transcription exacte de ec_public (supabase/schema.sql) : si vous touchez
  // à l'un, touchez à l'autre.
  o.pub_army=((p.state||{}).armies)||[];
  o.pub_unlocked=((p.state||{}).unlocked_pieces)||[];
  o.pub_powers=((p.state||{}).unlocked_powers)||[];
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

// ----------------------------------------------------------------
// LA GUERRE DES CLANS, EN MÉMOIRE
// ----------------------------------------------------------------
// Transcription de la section « LA GUERRE DES CLANS » de
// supabase/schema.sql, fonction pour fonction (ec_clan_level →
// ecMockClanLevel, etc.). Mêmes constantes, mêmes refus, mêmes phrases :
// le test de fumée joue la guerre ici, et ce qu'il vérifie doit être vrai
// du serveur.
const EC_CLAN_RULES={maxMembers:30,dayCap:120,claimMin:10,foundGames:3};
const EC_CLAN_LEVELS=[0,500,1500,4000,10000,25000,60000];
// La taille de chaque catalogue du blason (js/blason.js, BLAZON_SPEC).
const EC_BLAZON_SPEC={s:5,d:8,c1:10,c2:10,ch:14,cc:10};

function ecMockClanLevel(pts){
  let l=0;EC_CLAN_LEVELS.forEach((t,i)=>{if(pts>=t)l=i;});return l;
}
function ecMockJsRound(x){return Math.floor(x+0.5);}
function ecMockWarPoints(res,elo,opp,mode){
  let pts=res==='win'?10+Math.max(-4,Math.min(10,ecMockJsRound((opp-elo)/50)))
    :res==='draw'?4:1;
  if(mode==='ligne')pts=ecMockJsRound(pts*1.5);
  return pts;
}
function ecMockWarChest(rank){
  if(rank==null)return null;
  return rank===1?'tour':rank<=3?'fou':rank<=10?'cavalier':'pion';
}
function ecMockTagNorm(t){return String(t||'').trim().toUpperCase();}
function ecMockClanNameError(n){
  const t=String(n||'').trim();
  if(t.length<3||t.length>24)return 'Le nom du clan doit faire entre 3 et 24 caractères.';
  for(let i=0;i<t.length;i++){const c=t.charCodeAt(i);if(c<32||c===127)
    return 'Ce nom contient des caractères invisibles.';}
  return null;
}
function ecMockTagError(t){
  return /^[A-Z0-9]{2,4}$/.test(ecMockTagNorm(t))?null:'Le sigle fait 2 à 4 lettres ou chiffres, sans accent.';
}
function ecMockBlazonClean(b){
  const out={};
  Object.keys(EC_BLAZON_SPEC).forEach(k=>{
    const v=parseInt(b&&b[k],10);
    out[k]=(isFinite(v)&&v>=0&&v<EC_BLAZON_SPEC[k])?v:0;
  });
  return out;
}
function ecMockDayKey(){return new Date().toISOString().slice(0,10);}
function ecMockClanLog(db,clanId,kind,data){
  const list=db.clanEvents[clanId]||(db.clanEvents[clanId]=[]);
  list.push({id:++db.clanEventSeq,at:Date.now(),kind,data:data||{}});
  if(list.length>60)list.splice(0,list.length-60);
}
function ecMockWeekRows(db,week){
  return Object.values(db.clanWeeks)
    .filter(w=>w.week_key===week&&w.points>0&&db.clans[w.clan_id])
    .sort((a,b)=>(b.points-a.points)||(b.wins-a.wins)||
      (db.clans[a.clan_id].created_at-db.clans[b.clan_id].created_at))
    .map((w,i)=>Object.assign({r:i+1},w));
}
function ecMockWeekRank(db,clanId,week){
  const row=ecMockWeekRows(db,week).find(w=>w.clan_id===clanId);
  return row?row.r:null;
}
function ecMockClanMembersOf(db,clanId){
  return Object.values(db.clanMembers).filter(m=>m.clan_id===clanId);
}
function ecMockClanBrief(db,pid){
  const m=db.clanMembers[pid];if(!m)return null;
  const c=db.clans[m.clan_id];if(!c)return null;
  return {id:c.id,name:c.name,tag:c.tag,blazon:c.blazon,level:ecMockClanLevel(c.points_total),role:m.role};
}
function ecMockClanTag(db,pid){const b=ecMockClanBrief(db,pid);return b?b.tag:null;}
function ecMockClanCard(db,clanId){
  const c=db.clans[clanId];if(!c)return null;
  const wk=ecWeekKey();
  const mem=ecMockClanMembersOf(db,clanId);
  const w=db.clanWeeks[clanId+'|'+wk];
  return {id:c.id,name:c.name,tag:c.tag,blazon:c.blazon,motto:c.motto,recruit:c.recruit,
    min_elo:c.min_elo,points_total:c.points_total,level:ecMockClanLevel(c.points_total),
    members:mem.length,
    online:mem.filter(m=>db.players[m.player_id]&&ecMockOnline(db.players[m.player_id])).length,
    week_points:w?w.points:0,week_rank:ecMockWeekRank(db,clanId,wk),created_at:c.created_at};
}
function ecMockClanMembers(db,clanId){
  const wk=ecWeekKey();
  const ro=r=>r==='chef'?0:r==='officier'?1:2;
  return ecMockClanMembersOf(db,clanId).map(m=>{
    const p=db.players[m.player_id]||{};
    const k=db.clanContrib[m.player_id+'|'+wk+'|'+clanId];
    return {id:m.player_id,username:p.username,elo:p.elo|0,elo_peak:p.elo_peak|0,role:m.role,
      points_total:m.points_total,week_points:k?k.points:0,joined_at:m.joined_at,
      online:ecMockOnline(p)};
  }).sort((a,b)=>(b.week_points-a.week_points)||(ro(a.role)-ro(b.role))||(b.points_total-a.points_total));
}
function ecMockClanEvents(db,clanId,limit){
  return (db.clanEvents[clanId]||[]).slice(-(limit||30)).reverse()
    .map(e=>({id:e.id,at:e.at,kind:e.kind,data:e.data}));
}
function ecMockWarJson(db,week,limit){
  return ecMockWeekRows(db,week).filter(w=>w.r<=limit).map(w=>Object.assign(
    ecMockClanCard(db,w.clan_id),{rank:w.r,points:w.points,wins:w.wins,games:w.games}));
}
function ecMockClaimState(db,pid){
  const wk=ecWeekKey(Date.now()-7*864e5);
  const done=db.clanClaims[pid+'|'+wk];
  if(done)return {week:wk,available:false,claimed:true,chest:done.chest};
  const mine=Object.values(db.clanContrib).filter(k=>k.player_id===pid&&k.week_key===wk&&db.clans[k.clan_id])
    .sort((a,b)=>b.points-a.points)[0];
  if(!mine||mine.points<EC_CLAN_RULES.claimMin)
    return {week:wk,available:false,claimed:false,points:mine?mine.points:0,needed:EC_CLAN_RULES.claimMin};
  const rank=ecMockWeekRank(db,mine.clan_id,wk);
  const c=db.clans[mine.clan_id];
  return {week:wk,available:true,claimed:false,chest:ecMockWarChest(rank),rank,points:mine.points,
    clan:{name:c.name,tag:c.tag}};
}
function ecMockClanMine(db,pid){
  const wk=ecWeekKey();
  const week={key:wk,ends_at:ecWeekEnd()};
  const m=db.clanMembers[pid];
  if(!m||!db.clans[m.clan_id]){
    return {clan:null,claim:ecMockClaimState(db,pid),week,
      requests_sent:Object.values(db.clanRequests).filter(r=>r.player_id===pid).map(r=>r.clan_id)};
  }
  const k=db.clanContrib[pid+'|'+wk+'|'+m.clan_id];
  const requests=(m.role==='chef'||m.role==='officier')
    ?Object.values(db.clanRequests).filter(r=>r.clan_id===m.clan_id).sort((a,b)=>a.at-b.at)
      .map(r=>{const p=db.players[r.player_id]||{};
        return {id:r.player_id,username:p.username,elo:p.elo|0,elo_peak:p.elo_peak|0,at:r.at};})
    :[];
  return {clan:ecMockClanCard(db,m.clan_id),members:ecMockClanMembers(db,m.clan_id),
    events:ecMockClanEvents(db,m.clan_id,40),requests,
    me:{role:m.role,points_total:m.points_total,week_points:k?k.points:0,
        day_points:m.day_key===ecMockDayKey()?m.day_points:0,day_cap:EC_CLAN_RULES.dayCap},
    week,claim:ecMockClaimState(db,pid)};
}
// La porte de sortie unique : quitter, être exclu, supprimer son compte.
function ecMockClanRemove(db,pid,kind,by){
  const m=db.clanMembers[pid];if(!m)return;
  const who=(db.players[pid]||{}).username;
  delete db.clanMembers[pid];
  const rest=ecMockClanMembersOf(db,m.clan_id);
  if(!rest.length){
    // Dissolution : tout ce qui pend au clan part avec lui (cascade).
    delete db.clans[m.clan_id];delete db.clanEvents[m.clan_id];
    Object.keys(db.clanWeeks).forEach(k=>{if(db.clanWeeks[k].clan_id===m.clan_id)delete db.clanWeeks[k];});
    Object.keys(db.clanContrib).forEach(k=>{if(db.clanContrib[k].clan_id===m.clan_id)delete db.clanContrib[k];});
    Object.keys(db.clanRequests).forEach(k=>{if(db.clanRequests[k].clan_id===m.clan_id)delete db.clanRequests[k];});
    return;
  }
  ecMockClanLog(db,m.clan_id,kind,{who,by:by||null});
  if(m.role==='chef'){
    const heir=rest.sort((a,b)=>((b.role==='officier')-(a.role==='officier'))||
      (b.points_total-a.points_total)||(a.joined_at-b.joined_at))[0];
    heir.role='chef';
    ecMockClanLog(db,m.clan_id,'role',{who:(db.players[heir.player_id]||{}).username,role:'chef',by:null});
  }
}
function ecMockClanOnMatch(db,p,res,elo,opp,mode,oppName){
  const m=db.clanMembers[p.id];if(!m)return null;
  const c=db.clans[m.clan_id];if(!c)return null;
  const wk=ecWeekKey(),today=ecMockDayKey();
  const raw=ecMockWarPoints(res,elo,opp,mode);
  const used=m.day_key===today?m.day_points:0;
  const pts=Math.max(0,Math.min(raw,EC_CLAN_RULES.dayCap-used));
  m.day_key=today;m.day_points=used+pts;m.points_total+=pts;
  const lvlBefore=ecMockClanLevel(c.points_total);
  c.points_total+=pts;
  const wkey=c.id+'|'+wk;
  const w=db.clanWeeks[wkey]||(db.clanWeeks[wkey]={clan_id:c.id,week_key:wk,points:0,wins:0,games:0});
  w.points+=pts;w.wins+=res==='win'?1:0;w.games++;
  const kkey=p.id+'|'+wk+'|'+c.id;
  const k=db.clanContrib[kkey]||(db.clanContrib[kkey]={player_id:p.id,week_key:wk,clan_id:c.id,points:0});
  k.points+=pts;
  if(res==='win'||res==='draw')ecMockClanLog(db,c.id,res,{who:p.username,opp:oppName||null,pts,mode});
  if(ecMockClanLevel(c.points_total)>lvlBefore)ecMockClanLog(db,c.id,'level',{level:ecMockClanLevel(c.points_total)});
  return {points:pts,raw,capped:pts<raw,tag:c.tag,name:c.name,blazon:c.blazon,
    level:ecMockClanLevel(c.points_total),week_points:w.points,week_rank:ecMockWeekRank(db,c.id,wk)};
}

// Les gestes des clans, dans l'ordre de supabase/schema.sql.
function ecMockClanRpc(db,fn,a,p){
  const fail=ecMockFail;
  const mine=()=>{ecMockSave(db);return Promise.resolve(ecMockClanMine(db,p.id));};
  const me=db.clanMembers[p.id];
  switch(fn){
    case 'ec_clan_mine':return mine();
    case 'ec_clan_create':{
      if(me)return fail('Vous êtes déjà dans un clan : quittez-le d\'abord.','22023');
      if(!p.is_admin&&(p.ranked_games|0)<EC_CLAN_RULES.foundGames)
        return fail('Fonder un clan demande '+EC_CLAN_RULES.foundGames+' parties classées.','22023');
      const e=ecMockClanNameError(a.p_name)||ecMockTagError(a.p_tag);
      if(e)return fail(e,'22023');
      const nk=ecMockKey(a.p_name),tag=ecMockTagNorm(a.p_tag);
      const all=Object.values(db.clans);
      if(all.some(c=>c.name_key===nk))return fail('Ce nom de clan est déjà pris.','23505');
      if(all.some(c=>c.tag===tag))return fail('Ce sigle est déjà porté par un autre clan.','23505');
      const id=(self.crypto&&self.crypto.randomUUID)?self.crypto.randomUUID()
        :'clan-'+Math.random().toString(36).slice(2)+'-'+Date.now().toString(36);
      const mo=a.p_motto|0;
      db.clans[id]={id,name:String(a.p_name).trim(),name_key:nk,tag,blazon:ecMockBlazonClean(a.p_blazon),
        motto:(mo<0||mo>15)?0:mo,
        recruit:['open','request','closed'].indexOf(a.p_recruit)>=0?a.p_recruit:'open',
        min_elo:Math.max(0,Math.min(2500,a.p_min_elo|0)),points_total:0,created_by:p.id,created_at:Date.now()};
      db.clanMembers[p.id]={player_id:p.id,clan_id:id,role:'chef',joined_at:Date.now(),
        points_total:0,day_key:null,day_points:0,last_cry_at:0};
      Object.keys(db.clanRequests).forEach(k=>{if(db.clanRequests[k].player_id===p.id)delete db.clanRequests[k];});
      ecMockClanLog(db,id,'found',{who:p.username});
      return mine();
    }
    case 'ec_clan_edit':{
      if(!me||me.role!=='chef')return fail('Seul le chef peut changer le blason et les règles du clan.','42501');
      const c=db.clans[me.clan_id];const mo=a.p_motto|0;
      c.blazon=ecMockBlazonClean(a.p_blazon);c.motto=(mo<0||mo>15)?0:mo;
      c.recruit=['open','request','closed'].indexOf(a.p_recruit)>=0?a.p_recruit:'open';
      c.min_elo=Math.max(0,Math.min(2500,a.p_min_elo|0));
      ecMockClanLog(db,c.id,'edit',{who:p.username});
      return mine();
    }
    case 'ec_clan_join':{
      if(me)return fail('Vous êtes déjà dans un clan : quittez-le d\'abord.','22023');
      const c=db.clans[a.p_clan];
      if(!c)return fail('Ce clan n\'existe plus.','22023');
      if(c.recruit==='closed')return fail('Ce clan ne recrute pas.','22023');
      if(!p.is_admin&&(p.elo_peak|0)<c.min_elo)return fail('Ce clan demande '+c.min_elo+' ELO.','22023');
      if(ecMockClanMembersOf(db,c.id).length>=EC_CLAN_RULES.maxMembers)
        return fail('Ce clan est complet ('+EC_CLAN_RULES.maxMembers+' membres).','22023');
      if(c.recruit==='request'){
        db.clanRequests[c.id+'|'+p.id]={clan_id:c.id,player_id:p.id,at:Date.now()};
        ecMockSave(db);
        return Promise.resolve(Object.assign(ecMockClanMine(db,p.id),{pending:true}));
      }
      db.clanMembers[p.id]={player_id:p.id,clan_id:c.id,role:'membre',joined_at:Date.now(),
        points_total:0,day_key:null,day_points:0,last_cry_at:0};
      Object.keys(db.clanRequests).forEach(k=>{if(db.clanRequests[k].player_id===p.id)delete db.clanRequests[k];});
      ecMockClanLog(db,c.id,'join',{who:p.username});
      return mine();
    }
    case 'ec_clan_answer':{
      if(!me||(me.role!=='chef'&&me.role!=='officier'))
        return fail('Seuls le chef et les officiers répondent aux demandes.','42501');
      const key=me.clan_id+'|'+a.p_player;
      if(!db.clanRequests[key])return fail('Cette demande n\'existe plus.','22023');
      // Un refus du serveur annule toute la transaction, la demande
      // comprise : on vérifie donc AVANT d'effacer quoi que ce soit.
      if(a.p_accept){
        if(db.clanMembers[a.p_player])return fail('Ce joueur a déjà rejoint un autre clan.','22023');
        if(ecMockClanMembersOf(db,me.clan_id).length>=EC_CLAN_RULES.maxMembers)
          return fail('Le clan est complet ('+EC_CLAN_RULES.maxMembers+' membres).','22023');
      }
      delete db.clanRequests[key];
      if(a.p_accept){
        db.clanMembers[a.p_player]={player_id:a.p_player,clan_id:me.clan_id,role:'membre',joined_at:Date.now(),
          points_total:0,day_key:null,day_points:0,last_cry_at:0};
        Object.keys(db.clanRequests).forEach(k=>{if(db.clanRequests[k].player_id===a.p_player)delete db.clanRequests[k];});
        ecMockClanLog(db,me.clan_id,'join',{who:(db.players[a.p_player]||{}).username,by:p.username});
      }
      return mine();
    }
    case 'ec_clan_leave':
      if(!me)return fail('Vous n\'êtes dans aucun clan.','22023');
      ecMockClanRemove(db,p.id,'leave',null);
      return mine();
    case 'ec_clan_kick':{
      const t=db.clanMembers[a.p_player];
      if(!me||!t||t.clan_id!==me.clan_id||t.player_id===me.player_id)
        return fail('Ce joueur n\'est pas dans votre clan.','22023');
      if(!(me.role==='chef'||(me.role==='officier'&&t.role==='membre')))
        return fail('Vous n\'avez pas le rang pour exclure ce joueur.','42501');
      ecMockClanRemove(db,a.p_player,'kick',p.username);
      return mine();
    }
    case 'ec_clan_role':{
      const t=db.clanMembers[a.p_player];
      if(!me||me.role!=='chef')return fail('Seul le chef distribue les rangs.','42501');
      if(!t||t.clan_id!==me.clan_id||t.player_id===me.player_id)
        return fail('Ce joueur n\'est pas dans votre clan.','22023');
      if(['chef','officier','membre'].indexOf(a.p_role)<0)return fail('Rang inconnu.','22023');
      t.role=a.p_role;
      if(a.p_role==='chef')me.role='officier';
      ecMockClanLog(db,me.clan_id,'role',{who:(db.players[t.player_id]||{}).username,role:a.p_role,by:p.username});
      return mine();
    }
    case 'ec_clan_cry':{
      if(!me)return fail('Vous n\'êtes dans aucun clan.','22023');
      const n=a.p_cry;
      if(typeof n!=='number'||n<0||n>23)return fail('Cri inconnu.','22023');
      if(me.last_cry_at&&Date.now()-me.last_cry_at<20000)
        return fail('Laissez retomber l\'écho avant de crier à nouveau.','22023');
      me.last_cry_at=Date.now();
      ecMockClanLog(db,me.clan_id,'cry',{who:p.username,cry:n});
      ecMockSave(db);
      return Promise.resolve({events:ecMockClanEvents(db,me.clan_id,40)});
    }
    case 'ec_clan_claim':{
      const st=ecMockClaimState(db,p.id);
      if(st.claimed)return fail('Ce butin a déjà été réclamé.','23505');
      if(!st.available)return fail('Aucun butin à réclamer cette semaine.','22023');
      db.clanClaims[p.id+'|'+st.week]={player_id:p.id,week_key:st.week,chest:st.chest,rank:st.rank,claimed_at:Date.now()};
      ecMockSave(db);
      return Promise.resolve(Object.assign({},st,{ok:true,claimed:true,available:false}));
    }
  }
  return null;
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
      return Promise.resolve(ecMockSelf(p,db));
    }
    case 'ec_login':
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      ecMockSave(db);return Promise.resolve(ecMockSelf(p,db));
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
      ecMockSave(db);return Promise.resolve(ecMockSelf(p,db));
    }
    case 'ec_delete':
      p=auth();
      if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
      // Un chef qui part ne laisse pas son clan orphelin (ec_delete).
      ecMockClanRemove(db,p.id,'leave',null);
      ['clanContrib','clanRequests','clanClaims'].forEach(t=>Object.keys(db[t]).forEach(k=>{
        if(db[t][k].player_id===p.id)delete db[t][k];}));
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
        army:pay.army||[],replay:pay.replay||null,mode:pay.mode||'ia'}]).slice(-30);
      // La guerre des clans, étanche comme côté serveur : une panne ici ne
      // coûte jamais le rapport de partie.
      let clan=null;
      if(ranked){try{clan=ecMockClanOnMatch(db,p,res,old,oppElo,pay.mode||'ia',pay.opp_name||null);}catch(e){clan=null;}}
      ecMockSave(db);
      return Promise.resolve({profile:ecMockSelf(p,db),delta,old_elo:old,new_elo:p.elo,ranked,clan});
    }
    case 'ec_leaderboard':{
      const all=ecMockRanked(db);
      const off=Math.max(0,a.p_offset|0),lim=Math.max(1,a.p_limit|0||50);
      return Promise.resolve({total:all.length,
        rows:all.slice(off,off+lim).map((x,i)=>({rank:off+i+1,id:x.id,username:x.username,
          elo:x.elo,elo_peak:x.elo_peak,ranked_games:x.ranked_games,
          ranked_wins:x.ranked_wins,clan_tag:ecMockClanTag(db,x.id),online:ecMockOnline(x)}))});
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
                  clan_tag:ecMockClanTag(db,x.id),online:ecMockOnline(x)})));
    }
    case 'ec_profile':{
      const found=a.p_id?db.players[a.p_id]
        :Object.values(db.players).find(x=>x.username_key===ecMockKey(a.p_username));
      if(!found)return Promise.resolve({found:false});
      const all=ecMockRanked(db);
      const idx=all.findIndex(x=>x.id===found.id);
      return Promise.resolve(Object.assign(ecMockPublic(found,db),
        {found:true,rank:idx<0?null:idx+1}));
    }
    // -- Les trois lectures publiques des clans ----------------------
    case 'ec_clan_view':{
      if(!db.clans[a.p_clan])return Promise.resolve({found:false});
      return Promise.resolve({found:true,clan:ecMockClanCard(db,a.p_clan),
        members:ecMockClanMembers(db,a.p_clan),events:ecMockClanEvents(db,a.p_clan,15)});
    }
    case 'ec_clan_list':{
      const q=ecMockKey(a.p_q),t=ecMockTagNorm(a.p_q),wk=ecWeekKey();
      const wp=c=>{const w=db.clanWeeks[c.id+'|'+wk];return w?w.points:0;};
      return Promise.resolve(Object.values(db.clans)
        .filter(c=>q?(c.name_key.indexOf(q)>=0||c.tag===t)
          :(c.recruit!=='closed'&&ecMockClanMembersOf(db,c.id).length<EC_CLAN_RULES.maxMembers))
        .sort((x,y)=>(wp(y)-wp(x))||(y.points_total-x.points_total)||(x.created_at-y.created_at))
        .slice(0,Math.max(1,Math.min(60,a.p_limit||30)))
        .map(c=>ecMockClanCard(db,c.id)));
    }
    case 'ec_clan_war':{
      const wk=ecWeekKey(),last=ecWeekKey(Date.now()-7*864e5);
      return Promise.resolve({week:wk,ends_at:ecWeekEnd(),rows:ecMockWarJson(db,wk,a.p_limit||20),
        clans:Object.keys(db.clans).length,last_week:last,podium:ecMockWarJson(db,last,3)});
    }
  }
  if(fn.indexOf('ec_clan_')===0){
    p=auth();
    if(!p)return ecMockFail('Compte inconnu ou clé invalide.','28000');
    const r=ecMockClanRpc(db,fn,a,p);
    if(r)return r;
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
