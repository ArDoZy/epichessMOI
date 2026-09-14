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
// -- 4. LE SCEAU : PROUVER SON CHEVAL SANS LE MONTRER -------------
// Un secret que personne d'autre ne connaît, personne d'autre ne peut le
// vérifier : celui qui reçoit un coup reposant sur l'espion d'en face n'a
// d'autre choix que de CROIRE, et un client bricolé pouvait donc ignorer un
// échec une fois. C'est fermé par un ENGAGEMENT CRYPTOGRAPHIQUE, calculé dans
// le navigateur et qui ne demande rien à personne :
//   · au coup d'envoi, chacun publie l'EMPREINTE SHA-256 de son cheval salé
//     d'un aléa de 256 bits — elle n'apprend rien à qui n'a pas l'aléa ;
//   · le coup qui repose sur le secret emporte sa PREUVE (la pièce et l'aléa) ;
//   · l'autre recalcule l'empreinte et la compare. Un menteur n'a pas de
//     preuve à joindre, et n'en fabriquera pas : son coup est refusé.
// Voir « LE SCEAU » plus bas pour le détail.
//
// SI LE SCEAU N'EST PAS DISPONIBLE — navigateur sans WebCrypto, page servie en
// http:// ailleurs que sur localhost —, LA PARTIE A LIEU QUAND MÊME : on
// retombe sur la parole donnée et le joueur en est AVERTI une fois
// (troMpSealDown). Un renfort qui empêcherait de jouer quand il manque serait
// un mauvais renfort.
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
  sealed:false,       // notre cheval est scellé (empreinte publiée)
  myPiece:null,       // la pièce scellée — NE SORT JAMAIS D'ICI
  myNonce:null,       // son aléa — NE SORT D'ICI QU'AU MOMENT DE PROUVER
  mySeal:null,        // l'empreinte, elle, est publique
  oppSeal:null,       // celle de l'adversaire
  proof:null,         // la preuve à coller au prochain coup
  incoming:null,      // celle qui accompagne le coup qu'on est en train de lire
  arbiter:true,       // le sceau est utilisable des deux côtés
  warned:false,       // on n'avertit qu'une fois de son absence
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
  TMP.sealed=false;TMP.arbiter=true;TMP.warned=false;
  TMP.myPiece=null;TMP.myNonce=null;TMP.mySeal=null;TMP.oppSeal=null;
  TMP.proof=null;TMP.incoming=null;

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
    // L'EMPREINTE DE SON CHEVAL VOYAGE ICI, et elle ne dit rien : c'est un
    // SHA-256 sur un aléa de 256 bits qu'il garde. On la garde telle quelle —
    // c'est elle qu'on comparera quand il prouvera quelque chose.
    if(payload.seal&&!TMP.oppSeal)TMP.oppSeal=String(payload.seal);
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
    // LE JOURNAL GARDE LE COUP ET SA PREUVE ENSEMBLE : un rattrapage après une
    // coupure rejoue des coups qui ont pu en avoir besoin, et une preuve
    // perdue en route ferait refuser un coup parfaitement honnête.
    TMP.log.push({mv:pk,proof:TMP.proof||null});
    // LA PREUVE EST COLLÉE AU COUP QU'ELLE JUSTIFIE, et à lui seul : elle ne
    // peut donc ni arriver avant, ni resservir pour un autre. Une fois partie,
    // le nonce est public — le cheval qu'il ouvre l'est aussi, et c'est la
    // règle même de la variante.
    const proof=TMP.proof;TMP.proof=null;
    TMP.channel&&TMP.channel.send({type:'broadcast',event:'move',
      payload:{id:TMP.myId,n:TMP.log.length-1,mv:pk,proof:proof||null}});
  };
  // « J'ai choisi mon espion » — sans dire lequel —, accompagné de l'EMPREINTE
  // de ce choix, qui ne le dit pas davantage mais l'engage.
  TRO.onReady=()=>{
    TMP.ready=true;
    const mine=troFindSpy(TRO.st.board,TRO.myColor);
    // Le sceau d'abord : c'est lui qui part avec « j'ai choisi ». Sans lui
    // (navigateur sans WebCrypto), on annonce quand même — la partie a lieu,
    // sur parole, et le joueur a été averti.
    if(mine)troMpSeal(mine.p.id).then(ok=>{if(!ok)troMpSendReady();});
    else troMpSendReady();
  };
  TRO.onClaim=pieceId=>troMpClaim(pieceId);
  TRO.onVerify=pieceId=>troMpVerify(pieceId);
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

// ----------------------------------------------------------------
// LE SCEAU : PROUVER SON CHEVAL SANS LE MONTRER, ET SANS SERVEUR
// ----------------------------------------------------------------
// LE PROBLÈME. Deux coups reposent sur le secret et sur lui seul : la
// révélation, et le coup qui n'est légal que parce qu'un cavalier d'en face
// est mon espion. Celui qui les reçoit ne peut pas les vérifier — il ne
// connaît pas mon cheval — et n'a d'autre choix que de CROIRE. Un client
// bricolé pouvait donc ignorer un échec une fois, en désignant un cavalier au
// hasard.
//
// LA SOLUTION TIENT DANS LE NAVIGATEUR, et ne demande rien à personne : un
// ENGAGEMENT CRYPTOGRAPHIQUE, le plus vieux tour de la cryptographie à deux
// joueurs.
//   · AU COUP D'ENVOI, chacun tire un aléa de 256 bits (le « nonce »), calcule
//     l'empreinte SHA-256 de « salon | pièce | nonce » et PUBLIE CETTE
//     EMPREINTE. Elle ne dit rien : sans le nonce, on ne peut pas la comparer
//     aux deux cavaliers possibles, et le nonce ne sort pas de la machine.
//   · QUAND UN COUP A BESOIN DU SECRET, on joint la PREUVE au coup : la pièce
//     et le nonce. L'autre recalcule l'empreinte et la compare à celle qu'il a
//     reçue au départ. Si ça tombe juste, c'est bien le cheval scellé — il n'y
//     a pas moyen de fabriquer un second antécédent pour une autre pièce.
//   · UN MENTEUR N'A PAS DE PREUVE À JOINDRE : son coup est refusé.
//
// POURQUOI PAS LE SERVEUR. Une première version faisait arbitrer Supabase
// (ec_troie_seal / _claim / _verify). Ça marchait, mais il fallait aller
// installer trois fonctions SQL à la main dans le projet avant que la
// protection n'existe — une garantie qui dépend d'une manipulation n'est pas
// une garantie, c'est une intention. Ici, la protection est dans le jeu
// lui-même, elle marche au premier chargement, et elle marche même si le
// serveur du jeu est éteint : les deux navigateurs se suffisent.
//
// CE QUE ÇA NE FAIT PAS. Le sceau prouve QUEL cheval, pas le reste : la
// géométrie, la propriété des pièces et la légalité restent vérifiées par les
// deux moteurs (troRemoteOptions, js/troie-rules.js). Et si le navigateur n'a
// pas WebCrypto — page servie en http:// ailleurs que sur localhost —, on
// retombe sur la parole donnée, et le joueur en est averti une fois.

// L'empreinte, ou null si ce navigateur n'a pas de quoi la calculer.
function troMpDigest(text){
  const c=(typeof crypto!=='undefined')?crypto:null;
  if(!c||!c.subtle||!c.subtle.digest||typeof TextEncoder==='undefined')
    return Promise.resolve(null);
  return c.subtle.digest('SHA-256',new TextEncoder().encode(text))
    .then(buf=>Array.from(new Uint8Array(buf))
      .map(b=>b.toString(16).padStart(2,'0')).join(''))
    .catch(()=>null);
}
// Le nonce : 256 bits de hasard, qui ne quittent la machine qu'au moment de
// prouver. C'est lui qui rend l'empreinte muette — sans lui, deux cavaliers
// possibles, deux empreintes à essayer, et le secret ne tiendrait pas dix
// millisecondes.
function troMpNonce(){
  const c=(typeof crypto!=='undefined')?crypto:null;
  if(c&&c.getRandomValues){
    const a=new Uint8Array(32);c.getRandomValues(a);
    return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  let out='';
  for(let i=0;i<8;i++)out+=Math.random().toString(36).slice(2,10);
  return out;
}
// Le salon entre dans l'empreinte : un sceau d'une partie ne peut pas servir
// dans une autre.
function troMpSealText(piece,nonce){
  return 'epichess-troie|'+(TMP.code||'?')+'|'+piece+'|'+nonce;
}

// Le sceau n'a pas pu être posé (pas de WebCrypto), ou l'adversaire n'en a pas
// envoyé : on le dit UNE FOIS, en clair, et on continue à jouer. Taire une
// garantie qui n'est plus là serait pire que de ne pas l'avoir.
function troMpSealDown(){
  if(!TMP.arbiter)return;
  TMP.arbiter=false;
  if(!TMP.warned){
    TMP.warned=true;
    if(typeof showNotif==='function')
      showNotif('Sceau indisponible : la partie continue sur parole.','warn');
  }
}

// SCELLER, au moment du choix. Ce qui part sur le réseau est l'empreinte, et
// elle seule : la pièce et le nonce restent ici.
function troMpSeal(pieceId){
  TMP.myPiece=pieceId;
  TMP.myNonce=troMpNonce();
  return troMpDigest(troMpSealText(pieceId,TMP.myNonce)).then(h=>{
    if(!h){troMpSealDown();return false;}
    TMP.mySeal=h;TMP.sealed=true;
    troMpSendReady();          // le sceau voyage avec « j'ai choisi »
    return true;
  });
}

// RÉCLAMER son cheval : on prépare la preuve, qui partira COLLÉE au coup.
// Rien ne transite ici — c'est le coup lui-même qui la porte, donc elle ne
// peut pas arriver avant lui ni servir deux fois.
function troMpClaim(pieceId){
  if(!TMP.mySeal||pieceId!==TMP.myPiece)return Promise.resolve(false);
  TMP.proof={piece:pieceId,nonce:TMP.myNonce};
  return Promise.resolve(true);
}

// VÉRIFIER l'hypothèse qu'un coup reçu nous impose, contre la preuve qui
// l'accompagne. Rend `null` — et non `false` — quand il n'y a rien à vérifier
// avec quoi : l'écran doit pouvoir distinguer « il a menti » de « je n'ai pas
// les moyens de savoir ».
function troMpVerify(pieceId){
  const pr=TMP.incoming;
  if(!TMP.oppSeal||!pr||!pr.piece||!pr.nonce)return Promise.resolve(null);
  if(pr.piece!==pieceId)return Promise.resolve(false);
  return troMpDigest(troMpSealText(pr.piece,pr.nonce)).then(h=>{
    if(!h)return null;
    return h===TMP.oppSeal;
  });
}

// La présence du choix se réémet tant que l'autre n'a pas répondu : les deux
// camps ne choisissent pas à la même seconde, et un message émis avant que
// l'autre n'écoute est perdu sans erreur.
let _troReadyId=null;
function troMpSendReady(){
  if(!TMP.channel)return;
  const dis=()=>TMP.channel.send({type:'broadcast',event:'ready',
    payload:{id:TMP.myId,seal:TMP.mySeal||null}});
  dis();
  if(_troReadyId)clearInterval(_troReadyId);
  _troReadyId=setInterval(()=>{
    if(!TMP.started||TMP.oppReady||!TMP.channel){clearInterval(_troReadyId);_troReadyId=null;return;}
    dis();
  },1500);
}

function troMpReceiveMove(payload){
  const n=payload.n;
  if(typeof n!=='number'||!payload.mv)return;
  if(n<TMP.log.length)return;                  // déjà connu : rien à faire
  if(n>TMP.log.length){troMpRequestSync();return;} // il nous manque des coups
  // LA PREUVE QUI ACCOMPAGNE CE COUP-CI, le temps de le lire. troMpVerify la
  // compare à l'empreinte reçue au coup d'envoi ; elle est jetée ensuite, pour
  // qu'aucun coup suivant n'en hérite.
  TMP.incoming=payload.proof||null;
  Promise.resolve(troRemoteMove(payload.mv)).then(ok=>{
    TMP.incoming=null;
    if(ok)TMP.log.push({mv:payload.mv,proof:payload.proof||null});
    else troMpRequestSync();
  });
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
// Rejoue les coups manquants, UN PAR UN et dans l'ordre : chacun peut demander
// l'arbitre, donc chacun peut attendre. Un `for` synchrone les aurait tous
// lancés en même temps sur une position qui n'existe pas encore.
function troMpApplyLog(log){
  if(!Array.isArray(log)||log.length<=TMP.log.length)return;
  const suivant=i=>{
    if(i>=log.length)return;
    if(TRO.st.turn===TRO.myColor)return;       // ce coup-là est à nous : on s'arrête
    // Le rattrapage rejoue des coups qui ont pu avoir besoin d'une preuve :
    // elle voyage donc dans le journal, à côté du coup.
    const e=log[i],pk=(e&&e.mv)?e.mv:e;
    TMP.incoming=(e&&e.proof)||null;
    Promise.resolve(troRemoteMove(pk)).then(ok=>{
      TMP.incoming=null;
      if(!ok)return;
      TMP.log.push(e);
      suivant(i+1);
    });
  };
  suivant(TMP.log.length);
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
