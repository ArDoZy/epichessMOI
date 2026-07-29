// ================================================================
// MULTIPLAYER.JS : Parties en ligne joueur contre joueur via
// Supabase Realtime (broadcast + presence), sans base de données.
// ================================================================
// PARCOURS UTILISATEUR :
//   Menu → choisir son armée → page Combat → "⚔ Affronter un joueur"
//   → Créer une partie (donne un code à transmettre) ou Rejoindre
//   avec le code d'un ami → la partie démarre des deux côtés.
//
// L'hôte joue les Blancs, l'invité les Noirs. Chaque camp joue avec
// l'armée qu'il a composée : les deux armées sont échangées au moment
// de la connexion.
//
// AVANT DE POUVOIR JOUER EN LIGNE : renseignez SUPABASE_URL ci-dessous
// (Settings > API de votre projet supabase.com > "Project URL"). Ce n'est
// PAS l'adresse de ce site, mais celle du projet Supabase, de la forme
// https://abcdefghijk.supabase.co
//
// La clé publishable est publique par conception : elle est faite pour
// vivre dans le code d'un site web. La clé "secret", elle, ne doit JAMAIS
// apparaître ici : elle contourne toutes les règles de sécurité.
//
// Dépendances : SDK supabase-js (chargé via CDN dans index.html),
// rules-engine.js (executeGameMove, GS), game-flow.js (startGame,
// _playerColor), main.js (currentArmyData, aiArmyData, showNotif).
// Utilisé par : combat-intro.js (bouton #cb-play-online).
// ================================================================

// À REMPLACER : Supabase > Settings > API > "Project URL"
const SUPABASE_URL='https://VOTRE-PROJET.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_8PgQoH4YhF6oitNVRh3JBQ_T9fcNwwQ';

const MP={
  client:null,
  channel:null,
  myId:Math.random().toString(36).slice(2),
  isHost:false,
  myColor:'w',
  myArmy:null,
  oppArmy:null,
  roomCode:null,
  started:false,
  joinTimeoutId:null,
};

// Vrai seulement si l'URL et la clé ont été renseignées : permet d'afficher
// un message clair plutôt qu'un échec réseau obscur.
function mpIsConfigured(){
  return !SUPABASE_URL.includes('VOTRE-PROJET')&&!SUPABASE_PUBLISHABLE_KEY.includes('VOTRE_CLE');
}

function mpStatus(msg,kind){
  const el=document.getElementById('mp-status');
  if(!el)return;
  el.textContent=msg;
  el.className='mp-status'+(kind?' mp-'+kind:'');
}

function mpGenCode(){
  // Alphabet sans caractères ambigus (0/O, 1/I) : le code se dicte à l'oral.
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='';
  for(let i=0;i<4;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function mpInitClient(){
  if(MP.client)return MP.client;
  if(typeof supabase==='undefined'){
    mpStatus('Le SDK Supabase n\'a pas pu être chargé (connexion internet ?).','err');
    return null;
  }
  MP.client=supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  return MP.client;
}

// ----------------------------------------------------------------
// CONNEXION AU SALON
// ----------------------------------------------------------------
// L'hôte crée le salon et joue les Blancs, l'invité rejoint et joue
// les Noirs : répartition déterministe, aucune négociation nécessaire.
function mpConnect(code,asHost){
  const client=mpInitClient();if(!client)return;

  MP.roomCode=code;MP.isHost=asHost;MP.myColor=asHost?'w':'b';
  MP.myArmy=currentArmyData;MP.oppArmy=null;MP.started=false;

  MP.channel=client.channel('epichess-room-'+code,{config:{presence:{key:MP.myId}}});

  // Réception de l'armée adverse. On répond avec la nôtre pour couvrir le
  // cas où notre premier envoi est parti avant que l'autre camp n'écoute.
  MP.channel.on('broadcast',{event:'army'},({payload})=>{
    if(payload.senderId===MP.myId||MP.started)return;
    MP.oppArmy=payload.army;
    mpSendArmy();
    mpTryStart();
  });

  MP.channel.on('broadcast',{event:'move'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    mpApplyRemoteMove(payload.from,payload.to,payload.promo);
  });

  MP.channel.on('broadcast',{event:'resign'},({payload})=>{
    if(payload.senderId===MP.myId||!GS||!GS.multiplayer||GS.gameOver)return;
    showNotif('Votre adversaire a abandonné : vous gagnez !','ok');
    GS.gameOver=true;stopClockTick(GS);
    if(!_endGameTriggered)triggerEndOfGame('win');
  });

  // Dès qu'un second joueur est présent dans le salon, on s'échange les armées.
  MP.channel.on('presence',{event:'sync'},()=>{
    if(MP.started)return;
    const count=Object.keys(MP.channel.presenceState()).length;
    if(count>=2){
      if(MP.joinTimeoutId){clearTimeout(MP.joinTimeoutId);MP.joinTimeoutId=null;}
      mpStatus('Adversaire trouvé, préparation de la partie','wait');
      mpSendArmy();
    }
  });

  MP.channel.subscribe(async(status)=>{
    if(status==='SUBSCRIBED'){
      await MP.channel.track({joinedAt:Date.now()});
      if(asHost)mpStatus('En attente de votre adversaire','wait');
      else{
        mpStatus('Connexion au salon','wait');
        // Si personne n'est là après quelques secondes, le code est
        // probablement faux ou la partie n'a pas encore été créée.
        MP.joinTimeoutId=setTimeout(()=>{
          if(!MP.started)mpStatus('Aucune partie trouvée avec ce code. Vérifiez-le, ou demandez à votre ami de créer la partie.','err');
        },8000);
      }
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      mpStatus('Connexion impossible. Vérifiez vos clés Supabase et votre réseau.','err');
    }
  });
}

function mpSendArmy(){
  if(!MP.channel)return;
  MP.channel.send({type:'broadcast',event:'army',payload:{senderId:MP.myId,army:MP.myArmy}});
}

function mpTryStart(){
  if(MP.started||!MP.oppArmy)return;
  MP.started=true;
  if(MP.joinTimeoutId){clearTimeout(MP.joinTimeoutId);MP.joinTimeoutId=null;}
  currentArmyData=MP.myArmy;
  aiArmyData=MP.oppArmy;      // "aiArmyData" = armée du camp adverse
  _playerColor=MP.myColor;
  mpCloseModal();
  startGame(true,true);
}

// ----------------------------------------------------------------
// SYNCHRONISATION DES COUPS
// ----------------------------------------------------------------
// Les coups reçus sont rejoués via executeGameMove : les deux clients
// exécutent donc exactement la même logique de règles sur le même
// plateau initial, et restent alignés.
let _mpApplyingRemote=false;
function mpApplyRemoteMove(from,to,promo){
  if(!GS||!GS.multiplayer)return;
  _mpApplyingRemote=true;
  // Transmet le choix de promotion à executeGameMove, qui l'appliquera au
  // lieu d'ouvrir la modal de choix ou de laisser l'IA décider.
  GS._forcedPromo=promo||null;
  GS.lastMove={from,to,capture:!!GS.board[to.r][to.c]};
  executeGameMove(from,to,GS);
  GS._forcedPromo=null;
  _mpApplyingRemote=false;
}

function mpSendMove(from,to,promo){
  if(!MP.channel)return;
  MP.channel.send({type:'broadcast',event:'move',payload:{senderId:MP.myId,from,to,promo:promo||null}});
}

// executeGameMove est le point de passage unique de tout coup joué :
// on l'enveloppe pour rediffuser nos propres coups au camp adverse.
const _executeGameMoveOriginal=executeGameMove;
executeGameMove=function(from,to,gs){
  const shouldBroadcast=gs&&gs.multiplayer&&!_mpApplyingRemote;
  _executeGameMoveOriginal(from,to,gs);
  // Une promotion laisse le coup en suspens tant que la pièce n'est pas
  // choisie : c'est showPromoModal() qui appellera mpSendMove() ensuite.
  if(shouldBroadcast&&!gs.pendingPromo)mpSendMove(from,to,null);
};

// Prévient l'adversaire quand on quitte la partie (bouton Abandonner).
function mpNotifyResign(){
  if(!MP.channel||!GS||!GS.multiplayer)return;
  MP.channel.send({type:'broadcast',event:'resign',payload:{senderId:MP.myId}});
}

function mpLeave(){
  if(MP.joinTimeoutId){clearTimeout(MP.joinTimeoutId);MP.joinTimeoutId=null;}
  if(MP.channel){MP.channel.unsubscribe();MP.channel=null;}
  MP.started=false;MP.oppArmy=null;MP.roomCode=null;
}

// ----------------------------------------------------------------
// MODAL : écran de choix → écran hôte (code) ou écran invité (saisie)
// ----------------------------------------------------------------
function mpShowScreen(name){
  ['choice','host','join'].forEach(s=>{
    const el=document.getElementById('mp-screen-'+s);
    if(el)el.style.display=(s===name)?'':'none';
  });
}

function mpCloseModal(){
  document.getElementById('mp-modal')?.classList.remove('show');
}

function mpOpenModal(){
  if(!currentArmyData){showNotif('Choisissez d\'abord votre armée.','err');return;}
  mpLeave();
  mpShowScreen('choice');
  mpStatus('');
  if(!mpIsConfigured())mpStatus('Multijoueur pas encore configuré : renseignez l\'URL de votre projet Supabase (Settings > API > Project URL) dans js/multiplayer.js.','err');
  document.getElementById('mp-modal').classList.add('show');
}

document.getElementById('cb-play-online')?.addEventListener('click',mpOpenModal);

document.getElementById('mp-create-btn')?.addEventListener('click',()=>{
  if(!mpIsConfigured())return;
  const code=mpGenCode();
  document.getElementById('mp-code-value').textContent=code;
  mpShowScreen('host');
  mpConnect(code,true);
});

document.getElementById('mp-join-screen-btn')?.addEventListener('click',()=>{
  if(!mpIsConfigured())return;
  mpShowScreen('join');
  mpStatus('');
  document.getElementById('mp-code-input').focus();
});

document.getElementById('mp-join-confirm')?.addEventListener('click',()=>{
  const code=document.getElementById('mp-code-input').value.trim().toUpperCase();
  if(code.length<4){mpStatus('Entrez le code à 4 caractères reçu de votre ami.','err');return;}
  mpConnect(code,false);
});

document.getElementById('mp-code-input')?.addEventListener('keydown',e=>{
  if(e.key==='Enter')document.getElementById('mp-join-confirm').click();
});

document.getElementById('mp-copy-btn')?.addEventListener('click',()=>{
  const code=document.getElementById('mp-code-value').textContent;
  navigator.clipboard?.writeText(code)
    .then(()=>showNotif('Code copié : '+code,'ok'))
    .catch(()=>showNotif('Copie impossible, notez le code : '+code,'err'));
});

document.getElementById('mp-cancel')?.addEventListener('click',()=>{
  mpLeave();
  mpCloseModal();
});
