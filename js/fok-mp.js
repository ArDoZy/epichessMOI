// ================================================================
// FOK-MP.JS : la « Chute des Royaumes » à deux joueurs
// ================================================================
// Le multijoueur de la variante, sur le même transport que celui du jeu
// principal — les canaux temps réel de Supabase — mais sur ses PROPRES sujets
// (`epichess-fok-*`). Deux raisons de ne pas réutiliser js/multiplayer.js tel
// quel : il négocie des ARMÉES (qui n'existent pas ici), et il pilote l'objet
// GS de la partie classique. Ce fichier ne transporte que des coups.
//
// CE QUI PASSE SUR LE RÉSEAU : quatre nombres et deux drapeaux par coup (voir
// fokPackMove, js/fok-rules.js), et un numéro d'ordre. Rien d'autre. Le coup
// reçu est REVÉRIFIÉ par le moteur local avant d'être joué (fokFindMove) : un
// client modifié ne peut pas faire bouger une pièce comme il veut chez
// l'adversaire, il ne peut que se faire ignorer.
//
// L'HÔTE JOUE LES BLANCS, l'invité les Noirs. Les blancs commencent, puis on
// alterne — c'est la règle de la variante et c'est aussi, ici, la seule chose
// à savoir pour démarrer.
//
// MAIS LE RÔLE EST VÉRIFIÉ, PAS SUPPOSÉ. Chaque camp ANNONCE le sien dans sa
// présentation (`hello`), et les deux comparent. Tant que les deux annonces se
// contredisent — un hôte, un invité —, chacun garde la sienne. Si elles
// disent la MÊME chose (deux hôtes, ou deux invités : un appariement joué deux
// fois, une confirmation perdue, un salon rouvert sur le même code), on ne
// peut plus croire le rôle : on tranche alors sur les identifiants, dont
// l'ordre est le même des deux côtés. C'est ce qui manquait — les deux joueurs
// se retrouvaient de la même couleur, chacun persuadé que l'autre avait
// l'autre, et la partie ne pouvait pas commencer : les deux attendaient le
// coup de l'adversaire, ou les deux jouaient les mêmes pièces.
//
// RATTRAPAGE. Chaque camp garde le journal ordonné des coups. Un coup qui
// arrive avec un numéro qu'on n'attendait pas déclenche une demande de
// synchronisation : l'autre renvoie tout le journal, on rejoue ce qui manque.
// C'est ce qui permet de survivre à un onglet mis en veille ou à une coupure
// de quelques secondes.
//
// Dépendances : multiplayer.js (mpInitClient, SUPABASE_*), fok-game.js
// (FOK, fokStartGame, fokRemoteMove, fokDeclare), main.js (showNotif).
// ================================================================

const FMP={
  channel:null,
  lobby:null,
  lobbyTickId:null,
  code:null,
  isHost:false,
  myId:Math.random().toString(36).slice(2),
  oppId:null,
  oppName:null,
  oppHost:null,       // rôle ANNONCÉ par l'adversaire (voir fokMpColor)
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
function fokMpAvailable(){
  return typeof mpInitClient==='function'&&typeof supabase!=='undefined'&&
    typeof mpIsConfigured==='function'&&mpIsConfigured();
}

function fokMpName(){
  return (typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur';
}

function fokMpCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='';
  for(let i=0;i<4;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// Point d'entrée du salon (js/fok-game.js) : 'quick', 'host' ou 'join'.
function fokMpStart(kind,code){
  if(!fokMpAvailable()){
    if(typeof showNotif==='function')showNotif('Le jeu en ligne n’est pas disponible.','err');
    return;
  }
  fokMpCancel();
  FMP.leaving=false;
  if(kind==='quick'){fokLobbyWait('Recherche d’un adversaire…');fokMpQuick();return;}
  if(kind==='host'){
    const c=fokMpCode();
    fokLobbyWait('Votre code : '+c+'\nTransmettez-le à votre adversaire.');
    fokMpConnect(c,true);
    return;
  }
  if(kind==='join'){
    if(!code||code.length!==4){
      if(typeof showNotif==='function')showNotif('Entrez le code à quatre caractères.','err');
      return;
    }
    fokLobbyWait('Connexion au salon '+code+'…');
    fokMpConnect(code,false);
  }
}

// Quitte tout : salon d'attente, canal de partie, renvois périodiques.
function fokMpCancel(){
  if(FMP.lobbyTickId){clearInterval(FMP.lobbyTickId);FMP.lobbyTickId=null;}
  if(FMP.helloId){clearInterval(FMP.helloId);FMP.helloId=null;}
  FMP.pairPending=null;FMP.matched=false;
  if(FMP.lobby){try{FMP.lobby.unsubscribe();}catch(e){}FMP.lobby=null;}
  if(FMP.channel&&!FMP.started){try{FMP.channel.unsubscribe();}catch(e){}FMP.channel=null;}
}

// ----------------------------------------------------------------
// APPARIEMENT AUTOMATIQUE
// ----------------------------------------------------------------
// Même principe que le salon du jeu principal (mpLobbyTick) : le plus ancien
// présent est celui qui propose, les autres attendent d'être appelés. C'est ce
// qui évite d'avoir à supposer que deux navigateurs sont d'accord sur l'heure.
const FOK_LOBBY='epichess-fok-lobby-v1';
function fokMpQuick(){
  const client=mpInitClient();if(!client)return;
  const joinedAt=Date.now();
  FMP.searchStartedAt=joinedAt;FMP.matched=false;
  const ch=client.channel(FOK_LOBBY,{config:{presence:{key:FMP.myId}}});
  FMP.lobby=ch;

  ch.on('broadcast',{event:'pair'},async ({payload})=>{
    if(!payload||FMP.matched||payload.guest!==FMP.myId)return;
    // LA CONFIRMATION PART AVANT QU'ON QUITTE LE SALON. fokMpEnterPair()
    // enchaîne sur un `unsubscribe()`, et un envoi encore en vol part avec le
    // canal : l'hôte n'apprenait alors jamais que sa proposition avait été
    // acceptée, et repartait chercher quelqu'un d'autre pendant que l'invité
    // l'attendait dans un salon vide.
    try{await ch.send({type:'broadcast',event:'pair-ok',payload:{host:payload.host,guest:FMP.myId}});}
    catch(e){}
    fokMpEnterPair(payload.host);
  });
  ch.on('broadcast',{event:'pair-ok'},({payload})=>{
    if(!payload||FMP.matched)return;
    if(payload.host!==FMP.myId||payload.guest!==FMP.pairPending)return;
    fokMpEnterPair(FMP.myId);
  });
  ch.on('presence',{event:'sync'},()=>fokMpLobbyTick());
  ch.on('presence',{event:'leave'},({key})=>{
    if(FMP.pairPending&&key===FMP.pairPending)FMP.pairPending=null;
    fokMpLobbyTick();
  });

  ch.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      await ch.track({id:FMP.myId,joinedAt});
      if(FMP.lobbyTickId)clearInterval(FMP.lobbyTickId);
      FMP.lobbyTickId=setInterval(fokMpLobbyTick,1000);
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      if(FMP.matched)return;
      fokLobbyWait('Connexion impossible. Vérifiez votre réseau.');
    }
  });
}

function fokMpPeers(){
  if(!FMP.lobby)return[];
  let state={};
  try{state=FMP.lobby.presenceState()||{};}catch(e){return[];}
  return Object.keys(state).map(k=>({id:k,joinedAt:(state[k]&&state[k][0]&&state[k][0].joinedAt)||0}))
    .sort((a,b)=>(a.joinedAt-b.joinedAt)||a.id.localeCompare(b.id));
}

function fokMpLobbyTick(){
  if(!FMP.lobby||FMP.matched){if(FMP.lobbyTickId){clearInterval(FMP.lobbyTickId);FMP.lobbyTickId=null;}return;}
  const waitS=Math.max(0,Math.floor((Date.now()-FMP.searchStartedAt)/1000));
  fokLobbyWait('Recherche d’un adversaire… '+waitS+' s');
  if(FMP.pairPending)return;
  const peers=fokMpPeers();
  if(peers.length<2)return;
  if(peers[0].id!==FMP.myId)return;      // seul le plus ancien propose
  FMP.pairPending=peers[1].id;
  FMP.lobby.send({type:'broadcast',event:'pair',payload:{host:FMP.myId,guest:peers[1].id}});
  setTimeout(()=>{if(!FMP.matched)FMP.pairPending=null;},3500);
}

function fokMpEnterPair(hostId){
  if(FMP.matched)return;
  FMP.matched=true;
  if(FMP.lobbyTickId){clearInterval(FMP.lobbyTickId);FMP.lobbyTickId=null;}
  if(FMP.lobby){try{FMP.lobby.unsubscribe();}catch(e){}FMP.lobby=null;}
  fokLobbyWait('Adversaire trouvé, préparation de la partie…');
  fokMpConnect('q'+hostId.slice(0,11),FMP.myId===hostId);
}

// ----------------------------------------------------------------
// LE SALON DE PARTIE
// ----------------------------------------------------------------
function fokMpConnect(code,asHost){
  const client=mpInitClient();if(!client)return;
  FMP.code=code;FMP.isHost=asHost;FMP.started=false;FMP.oppId=null;FMP.oppName=null;
  FMP.oppHost=null;
  FMP.log=[];FMP.leaving=false;

  const ch=client.channel('epichess-fok-'+code,{config:{presence:{key:FMP.myId}}});
  FMP.channel=ch;

  // PRÉSENTATION. Un seul envoi ne suffit pas : les deux camps ne s'abonnent
  // pas à la même seconde, et un message émis avant que l'autre n'écoute est
  // perdu sans erreur. On réémet donc jusqu'au démarrage.
  ch.on('broadcast',{event:'hello'},({payload})=>{
    if(!payload||payload.id===FMP.myId)return;
    FMP.oppId=payload.id;FMP.oppName=payload.name||'Adversaire';
    // `host` peut manquer (client plus ancien) : on le prend alors pour
    // l'inverse du nôtre, ce qui revient à l'ancien comportement.
    FMP.oppHost=typeof payload.host==='boolean'?payload.host:!FMP.isHost;
    ch.send({type:'broadcast',event:'hello',payload:fokMpHello()});
    fokMpBegin();
  });

  ch.on('broadcast',{event:'move'},({payload})=>{
    if(!payload||payload.id===FMP.myId||!FMP.started)return;
    fokMpReceiveMove(payload);
  });

  ch.on('broadcast',{event:'sync-req'},({payload})=>{
    if(!payload||payload.id===FMP.myId)return;
    ch.send({type:'broadcast',event:'sync',payload:{id:FMP.myId,log:FMP.log}});
  });

  ch.on('broadcast',{event:'sync'},({payload})=>{
    if(!payload||payload.id===FMP.myId||!FMP.started)return;
    fokMpApplyLog(payload.log||[]);
  });

  ch.on('broadcast',{event:'end'},({payload})=>{
    if(!payload||payload.id===FMP.myId||!FMP.started)return;
    if(typeof fokDeclare==='function')
      fokDeclare(FOK.myColor,payload.kind==='resign'?'abandon de l’adversaire':'départ de l’adversaire');
  });

  ch.on('presence',{event:'leave'},({key})=>{
    if(!FMP.started||!FMP.oppId||key!==FMP.oppId)return;
    // Un départ peut n'être qu'une reconnexion : on laisse un délai de grâce
    // avant de déclarer la partie finie.
    setTimeout(()=>{
      if(!FMP.started||FMP.leaving)return;
      const back=fokMpPresent(FMP.oppId);
      if(!back&&FOK.st&&!FOK.st.gameOver)
        fokDeclare(FOK.myColor,'départ de l’adversaire');
    },20000);
  });

  ch.subscribe(async status=>{
    if(status==='SUBSCRIBED'){
      await ch.track({id:FMP.myId});
      ch.send({type:'broadcast',event:'hello',payload:fokMpHello()});
      if(FMP.helloId)clearInterval(FMP.helloId);
      FMP.helloId=setInterval(()=>{
        if(FMP.started){clearInterval(FMP.helloId);FMP.helloId=null;return;}
        ch.send({type:'broadcast',event:'hello',payload:fokMpHello()});
      },1200);
      if(FMP.started)fokMpRequestSync();
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      if(!FMP.started)fokLobbyWait('Connexion impossible. Vérifiez votre réseau.');
    }
  });
}

function fokMpPresent(id){
  try{
    const st=FMP.channel&&FMP.channel.presenceState();
    return !!(st&&st[id]);
  }catch(e){return true;}
}

// La présentation : qui je suis, et QUEL RÔLE JE CROIS AVOIR.
function fokMpHello(){
  return {id:FMP.myId,name:fokMpName(),host:!!FMP.isHost};
}

// LA COULEUR, DÉCIDÉE PAREIL DES DEUX CÔTÉS.
// Cas normal : les deux rôles se contredisent, l'hôte prend les Blancs.
// Cas dégradé : les deux camps se croient hôtes (ou tous deux invités). Le
// rôle ne dit plus rien, on tranche sur les identifiants — une comparaison
// SYMÉTRIQUE : celui dont l'identifiant vient en premier prend les Blancs, et
// comme les deux camps comparent les deux mêmes chaînes, ils tombent
// forcément sur des couleurs opposées.
function fokMpColor(){
  if(FMP.oppId&&FMP.oppHost===!!FMP.isHost)
    return FMP.myId<FMP.oppId?'w':'b';
  return FMP.isHost?'w':'b';
}

// Les deux camps se connaissent : la partie commence.
function fokMpBegin(){
  if(FMP.started)return;
  FMP.started=true;
  if(FMP.helloId){clearInterval(FMP.helloId);FMP.helloId=null;}
  document.getElementById('fok-lobby')?.classList.remove('show');
  const mine=fokMpColor();
  fokStartGame({
    mode:'online',
    myColor:mine,
    oppName:FMP.oppName||'Adversaire',
    oppSub:mine==='w'?'Noirs':'Blancs',
  });
  // C'est ici que l'écran de jeu apprend à parler au réseau : il n'a aucune
  // autre attache avec ce fichier.
  FOK.onLocalMove=pk=>{
    FMP.log.push(pk);
    FMP.channel&&FMP.channel.send({type:'broadcast',event:'move',
      payload:{id:FMP.myId,n:FMP.log.length-1,mv:pk}});
  };
  FOK.onEnd=kind=>{
    if(FMP.channel&&FMP.started)
      FMP.channel.send({type:'broadcast',event:'end',payload:{id:FMP.myId,kind:kind}});
    if(kind==='leave')fokMpLeave();
  };
}

function fokMpReceiveMove(payload){
  const n=payload.n;
  if(typeof n!=='number'||!payload.mv)return;
  if(n<FMP.log.length)return;                  // déjà connu : rien à faire
  if(n>FMP.log.length){fokMpRequestSync();return;} // il nous manque des coups
  if(fokRemoteMove(payload.mv))FMP.log.push(payload.mv);
  else fokMpRequestSync();
}

let _fokSyncAt=0;
function fokMpRequestSync(){
  const now=Date.now();
  if(now-_fokSyncAt<1500)return;
  _fokSyncAt=now;
  FMP.channel&&FMP.channel.send({type:'broadcast',event:'sync-req',payload:{id:FMP.myId}});
}

// Rejoue les coups manquants du journal reçu. On ne fait confiance à rien : ce
// sont les mêmes vérifications que pour un coup ordinaire.
function fokMpApplyLog(log){
  if(!Array.isArray(log)||log.length<=FMP.log.length)return;
  for(let i=FMP.log.length;i<log.length;i++){
    const pk=log[i];
    if(FOK.st.turn===FOK.myColor)return;       // ce coup-là est à nous : on s'arrête
    if(!fokRemoteMove(pk))return;
    FMP.log.push(pk);
  }
}

function fokMpLeave(){
  FMP.leaving=true;FMP.started=false;
  if(FMP.helloId){clearInterval(FMP.helloId);FMP.helloId=null;}
  if(FMP.channel){try{FMP.channel.unsubscribe();}catch(e){}FMP.channel=null;}
}

// Une partie en ligne fermée d'un coup d'onglet doit tout de même prévenir
// l'adversaire, sinon il attend un coup qui ne viendra jamais.
window.addEventListener('beforeunload',()=>{
  if(FMP.started&&FMP.channel)
    try{FMP.channel.send({type:'broadcast',event:'end',payload:{id:FMP.myId,kind:'leave'}});}catch(e){}
});
