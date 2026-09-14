// ================================================================
// MIRROR-MP.JS : « Mirror Chess » à deux joueurs
// ================================================================
// Le multijoueur de la variante, sur le même transport que celui du jeu
// principal — les canaux temps réel de Supabase — mais sur ses PROPRES sujets
// (`epichess-mirror-*`). Deux raisons de ne pas réutiliser js/multiplayer.js
// tel quel : il négocie des ARMÉES (qui n'existent pas ici), et il pilote
// l'objet GS de la partie classique. Ce fichier ne transporte que des coups.
//
// CE QUI PASSE SUR LE RÉSEAU : la pièce JOUÉE, et elle seule — quatre nombres,
// deux drapeaux et le choix de promotion de sa jumelle (voir mirPackMove,
// js/mirror-rules.js). LE COUP JUMEAU N'EST JAMAIS TRANSMIS : chaque camp le
// recalcule avec le même moteur, à partir de la même position. C'est la seule
// façon de garantir qu'un client bricolé ne peut pas décider où part une
// jumelle — il ne peut que se faire ignorer, puisque le coup reçu est
// revérifié en entier avant d'être joué (mirFindMove).
//
// L'HÔTE JOUE LES BLANCS, l'invité les Noirs.
//
// MAIS LE RÔLE EST VÉRIFIÉ, PAS SUPPOSÉ. Chaque camp ANNONCE le sien dans sa
// présentation (`hello`), et les deux comparent. Tant que les deux annonces se
// contredisent — un hôte, un invité —, chacun garde la sienne. Si elles disent
// la MÊME chose (deux hôtes, ou deux invités : un appariement joué deux fois,
// une confirmation perdue, un salon rouvert sur le même code), on ne peut plus
// croire le rôle : on tranche alors sur les identifiants, dont l'ordre est le
// même des deux côtés. Sans cela, les deux joueurs peuvent se retrouver de la
// même couleur, chacun persuadé que l'autre a l'autre, et la partie ne peut
// plus être jouée — les deux attendent le coup de l'adversaire, ou les deux
// jouent les mêmes pièces. Même protocole que Board Quake
// (js/fok-mp.js).
//
// RATTRAPAGE. Chaque camp garde le journal ordonné des coups. Un coup qui
// arrive avec un numéro qu'on n'attendait pas déclenche une demande de
// synchronisation : l'autre renvoie tout le journal, on rejoue ce qui manque.
// C'est ce qui permet de survivre à un onglet mis en veille ou à une coupure
// de quelques secondes.
//
// Dépendances : multiplayer.js (mpInitClient, SUPABASE_*), mirror-game.js
// (MIR, mirStartGame, mirRemoteMove, mirDeclare), main.js (showNotif).
// ================================================================

const MMP={
  channel:null,
  lobby:null,
  lobbyTickId:null,
  code:null,
  isHost:false,
  oppHost:null,       // rôle ANNONCÉ par l'adversaire (voir mirMpColor)
  myId:Math.random().toString(36).slice(2),
  oppId:null,
  oppName:null,
  started:false,
  leaving:false,
  helloId:null,       // renvoi de la présentation tant que la partie n'a pas démarré
  log:[],             // coups de la partie, dans l'ordre
  pairPending:null,
  matched:false,
  searchStartedAt:0,
};

// Le multijoueur de la variante n'existe que si celui du jeu principal est
// configuré : même projet, même bibliothèque.
function mirMpAvailable(){
  return typeof mpInitClient==='function'&&typeof supabase!=='undefined'&&
    typeof mpIsConfigured==='function'&&mpIsConfigured();
}

function mirMpName(){
  return (typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur';
}

function mirMpCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='';
  for(let i=0;i<4;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// Point d'entrée du salon (js/fok-game.js) : 'quick', 'host' ou 'join'.
function mirMpStart(kind,code){
  if(!mirMpAvailable()){
    if(typeof showNotif==='function')showNotif('Le jeu en ligne n’est pas disponible.','err');
    return;
  }
  mirMpCancel();
  MMP.leaving=false;
  if(kind==='quick'){mirLobbyWait('Recherche d’un adversaire…');mirMpQuick();return;}
  if(kind==='host'){
    const c=mirMpCode();
    mirLobbyWait('Votre code : '+c+'\nTransmettez-le à votre adversaire.');
    mirMpConnect(c,true);
    return;
  }
  if(kind==='join'){
    if(!code||code.length!==4){
      if(typeof showNotif==='function')showNotif('Entrez le code à quatre caractères.','err');
      return;
    }
    mirLobbyWait('Connexion au salon '+code+'…');
    mirMpConnect(code,false);
  }
}

// Quitte tout : salon d'attente, canal de partie, renvois périodiques.
function mirMpCancel(){
  if(MMP.lobbyTickId){clearInterval(MMP.lobbyTickId);MMP.lobbyTickId=null;}
  if(MMP.helloId){clearInterval(MMP.helloId);MMP.helloId=null;}
  MMP.pairPending=null;MMP.matched=false;
  if(MMP.lobby){try{MMP.lobby.unsubscribe();}catch(e){}MMP.lobby=null;}
  if(MMP.channel&&!MMP.started){try{MMP.channel.unsubscribe();}catch(e){}MMP.channel=null;}
}

// ----------------------------------------------------------------
// APPARIEMENT AUTOMATIQUE
// ----------------------------------------------------------------
// Même principe que le salon du jeu principal (mpLobbyTick) : le plus ancien
// présent est celui qui propose, les autres attendent d'être appelés. C'est ce
// qui évite d'avoir à supposer que deux navigateurs sont d'accord sur l'heure.
const MIR_LOBBY='epichess-mirror-lobby-v1';
function mirMpQuick(){
  const client=mpInitClient();if(!client)return;
  const joinedAt=Date.now();
  MMP.searchStartedAt=joinedAt;MMP.matched=false;
  const ch=client.channel(MIR_LOBBY,{config:{presence:{key:MMP.myId}}});
  MMP.lobby=ch;

  ch.on('broadcast',{event:'pair'},async ({payload})=>{
    if(!payload||MMP.matched||payload.guest!==MMP.myId)return;
    // LA CONFIRMATION PART AVANT QU'ON QUITTE LE SALON. mirMpEnterPair()
    // enchaîne sur un `unsubscribe()`, et un envoi encore en vol part avec le
    // canal : l'hôte n'apprenait alors jamais que sa proposition avait été
    // acceptée, et repartait chercher quelqu'un d'autre pendant que l'invité
    // l'attendait dans un salon vide.
    try{await ch.send({type:'broadcast',event:'pair-ok',payload:{host:payload.host,guest:MMP.myId}});}
    catch(e){}
    mirMpEnterPair(payload.host);
  });
  ch.on('broadcast',{event:'pair-ok'},({payload})=>{
    if(!payload||MMP.matched)return;
    if(payload.host!==MMP.myId||payload.guest!==MMP.pairPending)return;
    mirMpEnterPair(MMP.myId);
  });
  ch.on('presence',{event:'sync'},()=>mirMpLobbyTick());
  ch.on('presence',{event:'leave'},({key})=>{
    if(MMP.pairPending&&key===MMP.pairPending)MMP.pairPending=null;
    mirMpLobbyTick();
  });

  ch.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      await ch.track({id:MMP.myId,joinedAt});
      if(MMP.lobbyTickId)clearInterval(MMP.lobbyTickId);
      MMP.lobbyTickId=setInterval(mirMpLobbyTick,1000);
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      if(MMP.matched)return;
      mirLobbyWait('Connexion impossible. Vérifiez votre réseau.');
    }
  });
}

function mirMpPeers(){
  if(!MMP.lobby)return[];
  let state={};
  try{state=MMP.lobby.presenceState()||{};}catch(e){return[];}
  return Object.keys(state).map(k=>({id:k,joinedAt:(state[k]&&state[k][0]&&state[k][0].joinedAt)||0}))
    .sort((a,b)=>(a.joinedAt-b.joinedAt)||a.id.localeCompare(b.id));
}

function mirMpLobbyTick(){
  if(!MMP.lobby||MMP.matched){if(MMP.lobbyTickId){clearInterval(MMP.lobbyTickId);MMP.lobbyTickId=null;}return;}
  const waitS=Math.max(0,Math.floor((Date.now()-MMP.searchStartedAt)/1000));
  mirLobbyWait('Recherche d’un adversaire… '+waitS+' s');
  if(MMP.pairPending)return;
  const peers=mirMpPeers();
  if(peers.length<2)return;
  if(peers[0].id!==MMP.myId)return;      // seul le plus ancien propose
  MMP.pairPending=peers[1].id;
  MMP.lobby.send({type:'broadcast',event:'pair',payload:{host:MMP.myId,guest:peers[1].id}});
  setTimeout(()=>{if(!MMP.matched)MMP.pairPending=null;},3500);
}

function mirMpEnterPair(hostId){
  if(MMP.matched)return;
  MMP.matched=true;
  if(MMP.lobbyTickId){clearInterval(MMP.lobbyTickId);MMP.lobbyTickId=null;}
  if(MMP.lobby){try{MMP.lobby.unsubscribe();}catch(e){}MMP.lobby=null;}
  mirLobbyWait('Adversaire trouvé, préparation de la partie…');
  mirMpConnect('q'+hostId.slice(0,11),MMP.myId===hostId);
}

// ----------------------------------------------------------------
// LE SALON DE PARTIE
// ----------------------------------------------------------------
function mirMpConnect(code,asHost){
  const client=mpInitClient();if(!client)return;
  MMP.code=code;MMP.isHost=asHost;MMP.started=false;MMP.oppId=null;MMP.oppName=null;
  MMP.oppHost=null;
  MMP.log=[];MMP.leaving=false;

  const ch=client.channel('epichess-mirror-'+code,{config:{presence:{key:MMP.myId}}});
  MMP.channel=ch;

  // PRÉSENTATION. Un seul envoi ne suffit pas : les deux camps ne s'abonnent
  // pas à la même seconde, et un message émis avant que l'autre n'écoute est
  // perdu sans erreur. On réémet donc jusqu'au démarrage.
  ch.on('broadcast',{event:'hello'},({payload})=>{
    if(!payload||payload.id===MMP.myId)return;
    MMP.oppId=payload.id;MMP.oppName=payload.name||'Adversaire';
    // `host` peut manquer (client plus ancien) : on le prend alors pour
    // l'inverse du nôtre, ce qui revient à l'ancien comportement.
    MMP.oppHost=typeof payload.host==='boolean'?payload.host:!MMP.isHost;
    ch.send({type:'broadcast',event:'hello',payload:mirMpHello()});
    mirMpBegin();
  });

  ch.on('broadcast',{event:'move'},({payload})=>{
    if(!payload||payload.id===MMP.myId||!MMP.started)return;
    mirMpReceiveMove(payload);
  });

  ch.on('broadcast',{event:'sync-req'},({payload})=>{
    if(!payload||payload.id===MMP.myId)return;
    ch.send({type:'broadcast',event:'sync',payload:{id:MMP.myId,log:MMP.log}});
  });

  ch.on('broadcast',{event:'sync'},({payload})=>{
    if(!payload||payload.id===MMP.myId||!MMP.started)return;
    mirMpApplyLog(payload.log||[]);
  });

  ch.on('broadcast',{event:'end'},({payload})=>{
    if(!payload||payload.id===MMP.myId||!MMP.started)return;
    if(typeof mirDeclare==='function')
      mirDeclare(MIR.myColor,payload.kind==='resign'?'abandon de l’adversaire':'départ de l’adversaire');
  });

  ch.on('presence',{event:'leave'},({key})=>{
    if(!MMP.started||!MMP.oppId||key!==MMP.oppId)return;
    // Un départ peut n'être qu'une reconnexion : on laisse un délai de grâce
    // avant de déclarer la partie finie.
    setTimeout(()=>{
      if(!MMP.started||MMP.leaving)return;
      const back=mirMpPresent(MMP.oppId);
      if(!back&&MIR.st&&!MIR.st.gameOver)
        mirDeclare(MIR.myColor,'départ de l’adversaire');
    },20000);
  });

  ch.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      await ch.track({id:MMP.myId});
      ch.send({type:'broadcast',event:'hello',payload:mirMpHello()});
      if(MMP.helloId)clearInterval(MMP.helloId);
      MMP.helloId=setInterval(()=>{
        if(MMP.started){clearInterval(MMP.helloId);MMP.helloId=null;return;}
        ch.send({type:'broadcast',event:'hello',payload:mirMpHello()});
      },1200);
      if(MMP.started)mirMpRequestSync();
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      if(!MMP.started)mirLobbyWait('Connexion impossible. Vérifiez votre réseau.');
    }
  });
}

function mirMpPresent(id){
  try{
    const st=MMP.channel&&MMP.channel.presenceState();
    return !!(st&&st[id]);
  }catch(e){return true;}
}

// La présentation : qui je suis, et QUEL RÔLE JE CROIS AVOIR.
function mirMpHello(){
  return {id:MMP.myId,name:mirMpName(),host:!!MMP.isHost};
}

// LA COULEUR, DÉCIDÉE PAREIL DES DEUX CÔTÉS.
// Cas normal : les deux rôles se contredisent, l'hôte prend les Blancs.
// Cas dégradé : les deux camps se croient hôtes (ou tous deux invités). Le
// rôle ne dit plus rien, on tranche sur les identifiants — une comparaison
// SYMÉTRIQUE : celui dont l'identifiant vient en premier prend les Blancs, et
// comme les deux camps comparent les deux mêmes chaînes, ils tombent
// forcément sur des couleurs opposées.
function mirMpColor(){
  if(MMP.oppId&&MMP.oppHost===!!MMP.isHost)
    return MMP.myId<MMP.oppId?'w':'b';
  return MMP.isHost?'w':'b';
}

// Les deux camps se connaissent : la partie commence.
function mirMpBegin(){
  if(MMP.started)return;
  MMP.started=true;
  if(MMP.helloId){clearInterval(MMP.helloId);MMP.helloId=null;}
  document.getElementById('mir-lobby')?.classList.remove('show');
  const mine=mirMpColor();
  mirStartGame({
    mode:'online',
    myColor:mine,
    oppName:MMP.oppName||'Adversaire',
    oppSub:mine==='w'?'Noirs':'Blancs',
  });
  // C'est ici que l'écran de jeu apprend à parler au réseau : il n'a aucune
  // autre attache avec ce fichier.
  MIR.onLocalMove=pk=>{
    MMP.log.push(pk);
    MMP.channel&&MMP.channel.send({type:'broadcast',event:'move',
      payload:{id:MMP.myId,n:MMP.log.length-1,mv:pk}});
  };
  MIR.onEnd=kind=>{
    if(MMP.channel&&MMP.started)
      MMP.channel.send({type:'broadcast',event:'end',payload:{id:MMP.myId,kind:kind}});
    if(kind==='leave')mirMpLeave();
  };
}

function mirMpReceiveMove(payload){
  const n=payload.n;
  if(typeof n!=='number'||!payload.mv)return;
  if(n<MMP.log.length)return;                  // déjà connu : rien à faire
  if(n>MMP.log.length){mirMpRequestSync();return;} // il nous manque des coups
  if(mirRemoteMove(payload.mv))MMP.log.push(payload.mv);
  else mirMpRequestSync();
}

let _mirSyncAt=0;
function mirMpRequestSync(){
  const now=Date.now();
  if(now-_mirSyncAt<1500)return;
  _mirSyncAt=now;
  MMP.channel&&MMP.channel.send({type:'broadcast',event:'sync-req',payload:{id:MMP.myId}});
}

// Rejoue les coups manquants du journal reçu. On ne fait confiance à rien : ce
// sont les mêmes vérifications que pour un coup ordinaire.
function mirMpApplyLog(log){
  if(!Array.isArray(log)||log.length<=MMP.log.length)return;
  for(let i=MMP.log.length;i<log.length;i++){
    const pk=log[i];
    if(MIR.st.turn===MIR.myColor)return;       // ce coup-là est à nous : on s'arrête
    if(!mirRemoteMove(pk))return;
    MMP.log.push(pk);
  }
}

function mirMpLeave(){
  MMP.leaving=true;MMP.started=false;
  if(MMP.helloId){clearInterval(MMP.helloId);MMP.helloId=null;}
  if(MMP.channel){try{MMP.channel.unsubscribe();}catch(e){}MMP.channel=null;}
}

// Une partie en ligne fermée d'un coup d'onglet doit tout de même prévenir
// l'adversaire, sinon il attend un coup qui ne viendra jamais.
window.addEventListener('beforeunload',()=>{
  if(MMP.started&&MMP.channel)
    try{MMP.channel.send({type:'broadcast',event:'end',payload:{id:MMP.myId,kind:'leave'}});}catch(e){}
});
