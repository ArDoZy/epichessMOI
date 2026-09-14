// ================================================================
// TROIE-MP.JS : « Le Cheval de Troie » à deux joueurs
// ================================================================
// Le multijoueur de la variante, sur le même transport que les deux autres —
// les canaux temps réel de Supabase — mais sur ses PROPRES sujets
// (`epichess-troie-*`). Même appariement, même poignée de main, même
// rattrapage par journal ordonné : tout ce qui suit est le fichier de Board
// Quake (js/fok-mp.js), à trois choses près, et ces trois choses sont la
// variante elle-même.
//
// -- 1. L'ESPION NE TRAVERSE JAMAIS LE RÉSEAU --------------------
// Aucun message ne dit quel cavalier on a choisi. Chacun choisit chez soi, et
// n'annonce que `ready` : « j'ai choisi ». La partie part quand les deux
// l'ont dit. Le secret n'est donc pas une politesse d'affichage — il n'existe
// tout simplement pas dans l'autre navigateur, et aucun inspecteur ne l'y
// trouvera. C'est la seule façon honnête de jouer cette variante à deux sans
// arbitre, et c'est ce qui la rend jouable en ligne.
//
// -- 2. LE COUP QUI RÉVÈLE PORTE SA MARQUE -----------------------
// `reveal` voyage avec le coup (troPackMove) : sans lui, l'adversaire verrait
// un de SES cavaliers bouger tout seul et refuserait le coup. Il l'apprend à
// cet instant précis — et pas avant —, ce que la règle veut exactement.
// Le coup reste REVÉRIFIÉ par le moteur local (troResolveRemote,
// js/troie-game.js) : un client bricolé ne peut pas révéler deux espions, ni
// faire sauter un cavalier où il veut.
//
// -- 3. CHACUN JUGE SA PROPRE POSITION ---------------------------
// Aux échecs ordinaires, les deux camps voient la même position et tombent
// d'accord tout seuls sur l'échec et le mat. Ici, NON : un cavalier peut être
// l'espion de l'autre, et alors il ne met pas en échec — celui qui l'ignore
// croirait mater. Après chaque coup reçu, le camp au trait calcule SON état
// (échec, mat, pat, nulle) et l'annonce par `state` ; celui qui vient de
// jouer adopte ce verdict au lieu du sien (troApplyVerdict). Le message ne
// dit jamais PAR QUOI on est en échec : il ne fuite rien.
//
// L'HÔTE JOUE LES BLANCS, l'invité les Noirs — mais le rôle est VÉRIFIÉ, pas
// supposé, comme dans les deux autres variantes (voir troMpColor).
//
// Dépendances : multiplayer.js (mpInitClient, SUPABASE_*), troie-game.js
// (TRO, troStartGame, troRemoteMove, troApplyVerdict, troOppReady,
// troDeclare), main.js (showNotif).
// ================================================================

const TMP={
  channel:null,
  lobby:null,
  lobbyTickId:null,
  code:null,
  isHost:false,
  myId:Math.random().toString(36).slice(2),
  oppId:null,
  oppName:null,
  oppHost:null,       // rôle ANNONCÉ par l'adversaire (voir troMpColor)
  started:false,
  leaving:false,
  helloId:null,       // renvoi de la présentation tant que la partie n'a pas démarré
  log:[],             // coups de la partie, dans l'ordre
  ready:false,        // on a choisi son espion
  oppReady:false,     // l'autre aussi
  lastVerdict:null,   // notre dernier état annoncé, renvoyé en cas de rattrapage
  pairPending:null,
  matched:false,
  searchStartedAt:0,
};

// Le multijoueur de la variante n'existe que si celui du jeu principal est
// configuré : même projet, même bibliothèque.
function troMpAvailable(){
  return typeof mpInitClient==='function'&&typeof supabase!=='undefined'&&
    typeof mpIsConfigured==='function'&&mpIsConfigured();
}

function troMpName(){
  return (typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur';
}

function troMpCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='';
  for(let i=0;i<4;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// Point d'entrée du salon (js/troie-game.js) : 'quick', 'host' ou 'join'.
function troMpStart(kind,code){
  if(!troMpAvailable()){
    if(typeof showNotif==='function')showNotif('Le jeu en ligne n’est pas disponible.','err');
    return;
  }
  troMpCancel();
  TMP.leaving=false;
  if(kind==='quick'){troLobbyWait('Recherche d’un adversaire…');troMpQuick();return;}
  if(kind==='host'){
    const c=troMpCode();
    troLobbyWait('Votre code : '+c+'\nTransmettez-le à votre adversaire.');
    troMpConnect(c,true);
    return;
  }
  if(kind==='join'){
    if(!code||code.length!==4){
      if(typeof showNotif==='function')showNotif('Entrez le code à quatre caractères.','err');
      return;
    }
    troLobbyWait('Connexion au salon '+code+'…');
    troMpConnect(code,false);
  }
}

// Quitte tout : salon d'attente, canal de partie, renvois périodiques.
function troMpCancel(){
  if(TMP.lobbyTickId){clearInterval(TMP.lobbyTickId);TMP.lobbyTickId=null;}
  if(TMP.helloId){clearInterval(TMP.helloId);TMP.helloId=null;}
  TMP.pairPending=null;TMP.matched=false;
  if(TMP.lobby){try{TMP.lobby.unsubscribe();}catch(e){}TMP.lobby=null;}
  if(TMP.channel&&!TMP.started){try{TMP.channel.unsubscribe();}catch(e){}TMP.channel=null;}
}

// ----------------------------------------------------------------
// APPARIEMENT AUTOMATIQUE
// ----------------------------------------------------------------
// Même principe que le salon du jeu principal (mpLobbyTick) : le plus ancien
// présent est celui qui propose, les autres attendent d'être appelés. C'est ce
// qui évite d'avoir à supposer que deux navigateurs sont d'accord sur l'heure.
const TRO_LOBBY='epichess-troie-lobby-v1';
function troMpQuick(){
  const client=mpInitClient();if(!client)return;
  const joinedAt=Date.now();
  TMP.searchStartedAt=joinedAt;TMP.matched=false;
  const ch=client.channel(TRO_LOBBY,{config:{presence:{key:TMP.myId}}});
  TMP.lobby=ch;

  ch.on('broadcast',{event:'pair'},async ({payload})=>{
    if(!payload||TMP.matched||payload.guest!==TMP.myId)return;
    // LA CONFIRMATION PART AVANT QU'ON QUITTE LE SALON. troMpEnterPair()
    // enchaîne sur un `unsubscribe()`, et un envoi encore en vol part avec le
    // canal : l'hôte n'apprenait alors jamais que sa proposition avait été
    // acceptée, et repartait chercher quelqu'un d'autre pendant que l'invité
    // l'attendait dans un salon vide.
    try{await ch.send({type:'broadcast',event:'pair-ok',payload:{host:payload.host,guest:TMP.myId}});}
    catch(e){}
    troMpEnterPair(payload.host);
  });
  ch.on('broadcast',{event:'pair-ok'},({payload})=>{
    if(!payload||TMP.matched)return;
    if(payload.host!==TMP.myId||payload.guest!==TMP.pairPending)return;
    troMpEnterPair(TMP.myId);
  });
  ch.on('presence',{event:'sync'},()=>troMpLobbyTick());
  ch.on('presence',{event:'leave'},({key})=>{
    if(TMP.pairPending&&key===TMP.pairPending)TMP.pairPending=null;
    troMpLobbyTick();
  });

  ch.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      await ch.track({id:TMP.myId,joinedAt});
      if(TMP.lobbyTickId)clearInterval(TMP.lobbyTickId);
      TMP.lobbyTickId=setInterval(troMpLobbyTick,1000);
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      if(TMP.matched)return;
      troLobbyWait('Connexion impossible. Vérifiez votre réseau.');
    }
  });
}

function troMpPeers(){
  if(!TMP.lobby)return[];
  let state={};
  try{state=TMP.lobby.presenceState()||{};}catch(e){return[];}
  return Object.keys(state).map(k=>({id:k,joinedAt:(state[k]&&state[k][0]&&state[k][0].joinedAt)||0}))
    .sort((a,b)=>(a.joinedAt-b.joinedAt)||a.id.localeCompare(b.id));
}

function troMpLobbyTick(){
  if(!TMP.lobby||TMP.matched){if(TMP.lobbyTickId){clearInterval(TMP.lobbyTickId);TMP.lobbyTickId=null;}return;}
  const waitS=Math.max(0,Math.floor((Date.now()-TMP.searchStartedAt)/1000));
  troLobbyWait('Recherche d’un adversaire… '+waitS+' s');
  if(TMP.pairPending)return;
  const peers=troMpPeers();
  if(peers.length<2)return;
  if(peers[0].id!==TMP.myId)return;      // seul le plus ancien propose
  TMP.pairPending=peers[1].id;
  TMP.lobby.send({type:'broadcast',event:'pair',payload:{host:TMP.myId,guest:peers[1].id}});
  setTimeout(()=>{if(!TMP.matched)TMP.pairPending=null;},3500);
}

function troMpEnterPair(hostId){
  if(TMP.matched)return;
  TMP.matched=true;
  if(TMP.lobbyTickId){clearInterval(TMP.lobbyTickId);TMP.lobbyTickId=null;}
  if(TMP.lobby){try{TMP.lobby.unsubscribe();}catch(e){}TMP.lobby=null;}
  troLobbyWait('Adversaire trouvé, préparation de la partie…');
  troMpConnect('q'+hostId.slice(0,11),TMP.myId===hostId);
}

// ----------------------------------------------------------------
// LE SALON DE PARTIE
// ----------------------------------------------------------------
function troMpConnect(code,asHost){
  const client=mpInitClient();if(!client)return;
  TMP.code=code;TMP.isHost=asHost;TMP.started=false;TMP.oppId=null;TMP.oppName=null;
  TMP.oppHost=null;
  TMP.log=[];TMP.leaving=false;
  TMP.ready=false;TMP.oppReady=false;TMP.lastVerdict=null;

  const ch=client.channel('epichess-troie-'+code,{config:{presence:{key:TMP.myId}}});
  TMP.channel=ch;

  // PRÉSENTATION. Un seul envoi ne suffit pas : les deux camps ne s'abonnent
  // pas à la même seconde, et un message émis avant que l'autre n'écoute est
  // perdu sans erreur. On réémet donc jusqu'au démarrage.
  ch.on('broadcast',{event:'hello'},({payload})=>{
    if(!payload||payload.id===TMP.myId)return;
    TMP.oppId=payload.id;TMP.oppName=payload.name||'Adversaire';
    // `host` peut manquer (client plus ancien) : on le prend alors pour
    // l'inverse du nôtre, ce qui revient à l'ancien comportement.
    TMP.oppHost=typeof payload.host==='boolean'?payload.host:!TMP.isHost;
    ch.send({type:'broadcast',event:'hello',payload:troMpHello()});
    troMpBegin();
  });

  ch.on('broadcast',{event:'move'},({payload})=>{
    if(!payload||payload.id===TMP.myId||!TMP.started)return;
    troMpReceiveMove(payload);
  });

  // « J'AI CHOISI », ET RIEN D'AUTRE. Le message ne porte pas de case, pas de
  // cavalier, pas d'indice : seulement le fait que ce camp-là est prêt. Il est
  // réémis tant que l'autre n'a pas répondu, comme la présentation — un
  // message perdu ici bloquerait la partie avant son premier coup.
  ch.on('broadcast',{event:'ready'},({payload})=>{
    if(!payload||payload.id===TMP.myId)return;
    if(!TMP.oppReady){
      TMP.oppReady=true;
      if(typeof troOppReady==='function')troOppReady();
    }
    if(TMP.ready)troMpSendReady();     // il a peut-être manqué le nôtre
  });

  // LE VERDICT DE L'ADVERSAIRE SUR NOTRE COUP (voir l'en-tête, point 3).
  ch.on('broadcast',{event:'state'},({payload})=>{
    if(!payload||payload.id===TMP.myId||!TMP.started)return;
    if(typeof troApplyVerdict==='function')troApplyVerdict(payload.v||{});
  });

  ch.on('broadcast',{event:'sync-req'},({payload})=>{
    if(!payload||payload.id===TMP.myId)return;
    // Le rattrapage renvoie aussi notre dernier verdict et notre état de
    // choix : un `state` perdu laisserait sinon l'autre camp à attendre un
    // coup dans une partie déjà finie.
    ch.send({type:'broadcast',event:'sync',
      payload:{id:TMP.myId,log:TMP.log,v:TMP.lastVerdict,ready:TMP.ready}});
  });

  ch.on('broadcast',{event:'sync'},({payload})=>{
    if(!payload||payload.id===TMP.myId||!TMP.started)return;
    if(payload.ready&&!TMP.oppReady){
      TMP.oppReady=true;
      if(typeof troOppReady==='function')troOppReady();
    }
    troMpApplyLog(payload.log||[]);
    if(payload.v&&typeof troApplyVerdict==='function')troApplyVerdict(payload.v);
  });

  ch.on('broadcast',{event:'end'},({payload})=>{
    if(!payload||payload.id===TMP.myId||!TMP.started)return;
    if(typeof troDeclare==='function')
      troDeclare(TRO.myColor,payload.kind==='resign'?'abandon de l’adversaire':'départ de l’adversaire');
  });

  ch.on('presence',{event:'leave'},({key})=>{
    if(!TMP.started||!TMP.oppId||key!==TMP.oppId)return;
    // Un départ peut n'être qu'une reconnexion : on laisse un délai de grâce
    // avant de déclarer la partie finie.
    setTimeout(()=>{
      if(!TMP.started||TMP.leaving)return;
      const back=troMpPresent(TMP.oppId);
      if(!back&&TRO.st&&!TRO.st.gameOver)
        troDeclare(TRO.myColor,'départ de l’adversaire');
    },20000);
  });

  ch.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      await ch.track({id:TMP.myId});
      ch.send({type:'broadcast',event:'hello',payload:troMpHello()});
      if(TMP.helloId)clearInterval(TMP.helloId);
      TMP.helloId=setInterval(()=>{
        if(TMP.started){clearInterval(TMP.helloId);TMP.helloId=null;return;}
        ch.send({type:'broadcast',event:'hello',payload:troMpHello()});
      },1200);
      if(TMP.started)troMpRequestSync();
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      if(!TMP.started)troLobbyWait('Connexion impossible. Vérifiez votre réseau.');
    }
  });
}

function troMpPresent(id){
  try{
    const st=TMP.channel&&TMP.channel.presenceState();
    return !!(st&&st[id]);
  }catch(e){return true;}
}

// La présentation : qui je suis, et QUEL RÔLE JE CROIS AVOIR.
function troMpHello(){
  return {id:TMP.myId,name:troMpName(),host:!!TMP.isHost};
}

// LA COULEUR, DÉCIDÉE PAREIL DES DEUX CÔTÉS.
// Cas normal : les deux rôles se contredisent, l'hôte prend les Blancs.
// Cas dégradé : les deux camps se croient hôtes (ou tous deux invités). Le
// rôle ne dit plus rien, on tranche sur les identifiants — une comparaison
// SYMÉTRIQUE : celui dont l'identifiant vient en premier prend les Blancs, et
// comme les deux camps comparent les deux mêmes chaînes, ils tombent
// forcément sur des couleurs opposées.
function troMpColor(){
  if(TMP.oppId&&TMP.oppHost===!!TMP.isHost)
    return TMP.myId<TMP.oppId?'w':'b';
  return TMP.isHost?'w':'b';
}

// Les deux camps se connaissent : la partie commence.
function troMpBegin(){
  if(TMP.started)return;
  TMP.started=true;
  if(TMP.helloId){clearInterval(TMP.helloId);TMP.helloId=null;}
  document.getElementById('tro-lobby')?.classList.remove('show');
  const mine=troMpColor();
  troStartGame({
    mode:'online',
    myColor:mine,
    oppName:TMP.oppName||'Adversaire',
    oppSub:mine==='w'?'Noirs':'Blancs',
  });
  // C'est ici que l'écran de jeu apprend à parler au réseau : il n'a aucune
  // autre attache avec ce fichier.
  TRO.onLocalMove=pk=>{
    TMP.log.push(pk);
    TMP.channel&&TMP.channel.send({type:'broadcast',event:'move',
      payload:{id:TMP.myId,n:TMP.log.length-1,mv:pk}});
  };
  // « J'ai choisi mon espion » — sans dire lequel.
  TRO.onReady=()=>{TMP.ready=true;troMpSendReady();};
  // Notre état, que l'autre ne peut pas calculer.
  TRO.onVerdict=v=>{
    TMP.lastVerdict=v;
    TMP.channel&&TMP.channel.send({type:'broadcast',event:'state',
      payload:{id:TMP.myId,v:v}});
  };
  if(TMP.oppReady&&typeof troOppReady==='function')troOppReady();
  TRO.onEnd=kind=>{
    if(TMP.channel&&TMP.started)
      TMP.channel.send({type:'broadcast',event:'end',payload:{id:TMP.myId,kind:kind}});
    if(kind==='leave')troMpLeave();
  };
}

// La présence du choix se réémet tant que l'autre n'a pas répondu : les deux
// camps ne choisissent pas à la même seconde, et un message émis avant que
// l'autre n'écoute est perdu sans erreur.
let _troReadyId=null;
function troMpSendReady(){
  if(!TMP.channel)return;
  TMP.channel.send({type:'broadcast',event:'ready',payload:{id:TMP.myId}});
  if(_troReadyId)clearInterval(_troReadyId);
  _troReadyId=setInterval(()=>{
    if(!TMP.started||TMP.oppReady||!TMP.channel){clearInterval(_troReadyId);_troReadyId=null;return;}
    TMP.channel.send({type:'broadcast',event:'ready',payload:{id:TMP.myId}});
  },1500);
}

function troMpReceiveMove(payload){
  const n=payload.n;
  if(typeof n!=='number'||!payload.mv)return;
  if(n<TMP.log.length)return;                  // déjà connu : rien à faire
  if(n>TMP.log.length){troMpRequestSync();return;} // il nous manque des coups
  if(troRemoteMove(payload.mv))TMP.log.push(payload.mv);
  else troMpRequestSync();
}

let _troSyncAt=0;
function troMpRequestSync(){
  const now=Date.now();
  if(now-_troSyncAt<1500)return;
  _troSyncAt=now;
  TMP.channel&&TMP.channel.send({type:'broadcast',event:'sync-req',payload:{id:TMP.myId}});
}

// Rejoue les coups manquants du journal reçu. On ne fait confiance à rien : ce
// sont les mêmes vérifications que pour un coup ordinaire.
function troMpApplyLog(log){
  if(!Array.isArray(log)||log.length<=TMP.log.length)return;
  for(let i=TMP.log.length;i<log.length;i++){
    const pk=log[i];
    if(TRO.st.turn===TRO.myColor)return;       // ce coup-là est à nous : on s'arrête
    if(!troRemoteMove(pk))return;
    TMP.log.push(pk);
  }
}

function troMpLeave(){
  TMP.leaving=true;TMP.started=false;
  if(_troReadyId){clearInterval(_troReadyId);_troReadyId=null;}
  if(TMP.helloId){clearInterval(TMP.helloId);TMP.helloId=null;}
  if(TMP.channel){try{TMP.channel.unsubscribe();}catch(e){}TMP.channel=null;}
}

// Une partie en ligne fermée d'un coup d'onglet doit tout de même prévenir
// l'adversaire, sinon il attend un coup qui ne viendra jamais.
window.addEventListener('beforeunload',()=>{
  if(TMP.started&&TMP.channel)
    try{TMP.channel.send({type:'broadcast',event:'end',payload:{id:TMP.myId,kind:'leave'}});}catch(e){}
});
