// ================================================================
// MULTIPLAYER.JS : Parties en ligne joueur contre joueur via
// Supabase Realtime (broadcast + presence), sans base de données.
// ================================================================
// PARCOURS UTILISATEUR :
//   Menu → COMBAT → choisir son armée → page d'engagement en ligne →
//   « Chercher un adversaire » (appariement automatique), « Partie privée »
//   (donne un code à transmettre) ou « Rejoindre avec un code »
//   → la partie démarre des deux côtés.
//
// L'hôte joue les Blancs, l'invité les Noirs. Chaque camp joue avec
// l'armée qu'il a composée : les deux armées sont échangées au moment
// de la connexion.
//
// QUITTER L'ONGLET NE CASSE PLUS LA PARTIE. Un broadcast est perdu sans bruit
// si l'autre camp n'écoute pas à cet instant : un onglet en arrière-plan, un
// téléphone verrouillé ou une coupure réseau suffisaient donc à faire
// disparaître définitivement le coup de l'adversaire. Chaque coup est
// désormais numéroté et conservé dans un journal, réclamé et rejoué au retour.
// Voir la section RÉSILIENCE plus bas : c'est là qu'est expliqué le mécanisme
// complet (journal, rattrapage, battement de cœur, reconnexion, délai de
// grâce avant de déclarer un adversaire parti).
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
// Utilisé par : combat-intro.js (boutons #cb-quick / #cb-private / #cb-join,
// qui ouvrent la fenêtre du salon directement sur le bon écran).
// ================================================================

// Project URL du projet Supabase, sans chemin : le SDK ajoute lui-même
// /rest/v1 ou /realtime/v1 selon ce qu'il appelle.
const SUPABASE_URL='https://qwtlmaacjfxlbvrvooim.supabase.co';
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
  lobby:null,        // salon d'attente du matchmaking (null hors recherche)
  lobbyTickId:null,  // battement de ré-évaluation de l'appariement
  searchStartedAt:0, // début de la recherche : pilote la fenêtre d'ELO
  waitStartedAt:0,   // début de l'attente : pilote le chronomètre affiché
  pairPending:null,  // id du joueur à qui l'on vient de proposer une partie
  pairTimerId:null,  // abandon de cette proposition faute de confirmation
  matched:false,     // paire déjà formée : ignore les sync de presence suivants
  armyRetryId:null,  // renvoi périodique de l'armée tant que la partie n'a pas démarré
  oppName:null,      // pseudo de l'adversaire (affiché dans son bandeau)
  oppElo:null,       // son ELO, utilisé pour le calcul de gain/perte
  oppId:null,        // son identifiant de session, pour détecter son départ
  rematchMine:false, // j'ai proposé une revanche
  rematchTheirs:false,
  gameSeq:0,         // numéro de partie dans ce salon (revanches successives)
  // -- RATTRAPAGE APRÈS UNE ABSENCE (voir la section RÉSILIENCE plus bas) --
  log:[],            // journal ordonné des coups de la partie en cours
  hbId:null,         // battement de cœur : annonce la longueur de mon journal
  rejoinId:null,     // reconnexion programmée après une coupure
  rejoinTries:0,     // nombre d'essais de reconnexion consécutifs
  leaving:false,     // fermeture volontaire : ne pas tenter de reconnexion
  oppGoneTimerId:null, // délai de grâce avant de déclarer l'adversaire parti
  oppGone:false,     // adversaire actuellement absent du salon
  lastRxAt:0,        // date du dernier message reçu : preuve que le canal vit
  resumeWatchId:null,// veille de reprise après une absence
};

// Carte de visite envoyée avec l'armée : sans elle l'adversaire n'est qu'un
// « Adversaire » anonyme, et le calcul d'ELO se fait contre une valeur
// arbitraire au lieu de son classement réel.
function mpMyCard(){
  return{
    name:(typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur',
    elo:(typeof vvLoadElo==='function')?vvLoadElo():0,
  };
}

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

// ----------------------------------------------------------------
// DIAGNOSTIC D'UN ÉCHEC DE CONNEXION
// ----------------------------------------------------------------
// Le jeu affichait « Connexion impossible. Vérifiez votre réseau. » quelle
// que soit la cause réelle. Quand le projet Supabase du plan gratuit s'est
// mis en veille après 7 jours d'inactivité, le message accusait donc le
// réseau du joueur, qui n'y pouvait rien et n'avait aucun moyen de le savoir.
//
// Realtime ne dit pas pourquoi il a échoué : on interroge donc l'API REST du
// MÊME projet, dont les réponses, elles, sont parlantes. Cela distingue les
// quatre cas qui n'appellent pas du tout la même action.
function mpDiagnose(){
  // 1. Le navigateur sait déjà qu'il n'a pas de réseau : inutile d'essayer.
  if(typeof navigator!=='undefined'&&navigator.onLine===false){
    return Promise.resolve({
      kind:'offline',
      msg:'Vous êtes hors ligne. Le multijoueur a besoin d\'une connexion internet.',
    });
  }
  // 2. On demande au projet s'il est debout. AbortController plutôt que la
  //    seule promesse de fetch : un projet en cours de réveil peut laisser
  //    la requête pendante longtemps, et le joueur attend devant un écran fixe.
  const ctl=(typeof AbortController!=='undefined')?new AbortController():null;
  const timer=ctl?setTimeout(()=>ctl.abort(),8000):null;
  return fetch(SUPABASE_URL+'/rest/v1/',{
    method:'GET',
    headers:{apikey:SUPABASE_PUBLISHABLE_KEY},
    signal:ctl?ctl.signal:undefined,
  }).then(r=>{
    if(timer)clearTimeout(timer);
    // 404 sur /rest/v1/ est NORMAL ici : le jeu n'expose aucune table. Ce
    // qui compte est que le serveur ait répondu.
    if(r.ok||r.status===404){
      return{
        kind:'realtime',
        msg:'Le serveur répond, mais le temps réel refuse la connexion. Réessayez dans un instant ; si cela persiste, le service Realtime du projet est probablement indisponible.',
      };
    }
    if(r.status===401||r.status===403){
      return{
        kind:'key',
        msg:'Le serveur répond mais refuse la clé du jeu. Elle a probablement été régénérée : il faut mettre à jour SUPABASE_PUBLISHABLE_KEY dans js/multiplayer.js.',
      };
    }
    return{
      kind:'paused',
      msg:'Le projet Supabase ne répond pas normalement (HTTP '+r.status+'). Le plus souvent, il a été mis en veille faute d\'activité : il faut le relancer depuis le tableau de bord Supabase.',
    };
  }).catch(e=>{
    if(timer)clearTimeout(timer);
    if(e&&e.name==='AbortError'){
      return{
        kind:'paused',
        msg:'Le projet Supabase ne répond pas. Il est probablement en veille ou en cours de redémarrage : réessayez dans quelques minutes.',
      };
    }
    // fetch qui rejette = le serveur n'a pas été joint du tout : réseau,
    // DNS, bloqueur de contenu, ou URL de projet invalide.
    return{
      kind:'unreachable',
      msg:'Impossible de joindre le serveur de jeu. Vérifiez votre connexion, ou un éventuel bloqueur de publicités qui filtrerait supabase.co.',
    };
  });
}

// Affiche le vrai motif, et journalise l'erreur brute de Realtime pour qui
// ouvre la console.
function mpReportFailure(status,err){
  console.warn('[MP] echec de connexion :',status,err||'(aucun detail)');
  mpStatus('Connexion en cours de vérification…','wait');
  mpDiagnose().then(d=>{
    console.warn('[MP] diagnostic :',d.kind);
    mpStatus(d.msg,'err');
  });
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
    // Le SDK vient d'un CDN : un bloqueur de contenu ou un réseau d'entreprise
    // peut l'avoir filtré alors que tout le reste du jeu fonctionne.
    mpStatus('La bibliothèque de jeu en ligne n\'a pas pu être chargée. Un bloqueur de publicités ou un réseau filtré empêche l\'accès à cdn.jsdelivr.net.','err');
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
  MP.oppName=null;MP.oppElo=null;MP.oppId=null;
  MP.rematchMine=false;MP.rematchTheirs=false;MP.gameSeq=0;
  MP.log=[];MP.leaving=false;MP.rejoinTries=0;MP.lastRxAt=0;
  _mpGoodbyeSent=false;   // nouvelle partie : l'adieu de la précédente est oublié
  mpClearOppGone();

  mpJoinRoom(false);

  // RENVOI PÉRIODIQUE DE L'ARMÉE. Un seul envoi ne suffit pas : les deux
  // camps ne s'abonnent pas à la même seconde, et un broadcast émis avant que
  // l'autre n'écoute est perdu sans erreur ni accusé de réception. Les deux
  // clients restaient alors face à face, chacun attendant une armée déjà
  // envoyée. On réémet donc jusqu'à ce que la partie démarre.
  mpStartArmyRetry();
}

// Ouvre (ou rouvre) le canal du salon. `isRejoin` distingue la reconnexion
// après une coupure — où la partie est déjà en cours et où il faut réclamer
// les coups manqués — de la connexion initiale.
// Deux canaux abonnés au MÊME sujet sur la même connexion se marchent dessus :
// on attend donc que l'ancien soit vraiment retiré avant d'en ouvrir un neuf.
// removeChannel() fait ce que unsubscribe() seul ne fait pas : il sort aussi le
// canal de la liste que le SDK réabonne tout seul à la reconnexion.
async function mpDropChannel(){
  const old=MP.channel;MP.channel=null;
  if(!old)return;
  try{
    if(MP.client&&typeof MP.client.removeChannel==='function')await MP.client.removeChannel(old);
    else await old.unsubscribe();
  }catch(e){console.warn('[MP] fermeture du canal :',e);}
}

// Notre carte d'identité dans la présence du salon. L'identifiant y est écrit
// EN PLUS de la clé de présence : certains événements ne donnent que les
// métadonnées, et l'anonymat rendait l'adversaire indétectable.
function mpTrackMe(ch){
  return ch.track({id:MP.myId,joinedAt:Date.now()});
}

// L'événement de présence parle-t-il bien de l'adversaire ? `key` est
// l'identifiant du joueur concerné ; les métadonnées servent de second recours.
function mpIsOpp(key,presences){
  if(!MP.oppId)return true;                    // adversaire pas encore identifié
  if(key&&key===MP.oppId)return true;
  return (presences||[]).some(p=>p&&p.id===MP.oppId);
}

let _mpJoining=false;
async function mpJoinRoom(isRejoin){
  const client=mpInitClient();if(!client||!MP.roomCode)return;
  if(_mpJoining)return;            // une (re)connexion est déjà en cours
  _mpJoining=true;
  if(MP.rejoinId){clearTimeout(MP.rejoinId);MP.rejoinId=null;}
  await mpDropChannel();
  if(MP.leaving){_mpJoining=false;return;}

  // Une socket peut se dire ouverte alors qu'elle est morte depuis la mise en
  // veille : on la relance nous-mêmes plutôt que d'attendre que le SDK s'en
  // aperçoive à son prochain battement.
  try{
    const rt=client.realtime;
    if(rt&&typeof rt.isConnected==='function'&&!rt.isConnected()&&typeof rt.connect==='function')rt.connect();
  }catch(e){}

  const ch=client.channel('epichess-room-'+MP.roomCode,{config:{presence:{key:MP.myId}}});
  MP.channel=ch;
  mpBindRoomHandlers(ch);
  _mpJoining=false;

  // Le second argument du rappel porte l'erreur de Realtime : l'ignorer,
  // c'était perdre la seule information disponible sur la panne.
  ch.subscribe(async(status,err)=>{
    if(MP.channel!==ch)return;   // canal remplacé entre-temps : plus rien à en tirer
    if(status==='SUBSCRIBED'){
      MP.rejoinTries=0;
      await mpTrackMe(ch);
      if(MP.started){
        // De retour dans le salon : on réclame tout de suite ce qu'on a pu
        // manquer, plutôt que d'attendre le prochain battement de cœur. La
        // veille (mpStartResumeWatch) réinsiste tant que rien ne répond.
        mpRequestSync();
        mpStartResumeWatch();
        mpStartHeartbeat();
        if(isRejoin)mpGameMessage('Reconnecté à la partie.','');
      }else if(isRejoin){
        mpSendArmy();
      }else if(MP.isHost)mpStatus('En attente de votre adversaire','wait');
      else{
        mpStatus('Connexion au salon','wait');
        // Si personne n'est là après quelques secondes, le code est
        // probablement faux ou la partie n'a pas encore été créée.
        MP.joinTimeoutId=setTimeout(()=>{
          if(!MP.started)mpStatus('Aucune partie trouvée avec ce code. Vérifiez-le, ou demandez à votre ami de créer la partie.','err');
        },8000);
      }
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
      // Une partie en cours ne doit PAS rester sur un canal mort : c'est
      // exactement le cas où les coups de l'adversaire disparaissent.
      if(MP.started){mpScheduleRejoin();return;}
      mpReportFailure(status,err);
    }
  });
}

function mpBindRoomHandlers(channel){
  // Réception de l'armée adverse. On répond avec la nôtre pour couvrir le
  // cas où notre premier envoi est parti avant que l'autre camp n'écoute.
  channel.on('broadcast',{event:'army'},({payload})=>{
    if(payload.senderId===MP.myId||MP.started)return;
    MP.oppArmy=payload.army;
    MP.oppId=payload.senderId;
    MP.oppName=(payload.card&&payload.card.name)||'Adversaire';
    MP.oppElo=(payload.card&&typeof payload.card.elo==='number')?payload.card.elo:null;
    mpSendArmy();
    mpTryStart();
  });

  // Revanche : chacun annonce son souhait, la partie repart quand les deux
  // l'ont fait. Les couleurs s'inversent, sinon le même camp commencerait
  // toutes les parties de la soirée.
  channel.on('broadcast',{event:'rematch'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    MP.rematchTheirs=true;
    mpUpdateRematchUI();
    mpTryRematch();
  });

  // Un coup porte son NUMÉRO D'ORDRE dans la partie : c'est ce qui permet de
  // reconnaître un coup déjà appliqué (doublon) d'un coup qui en suppose un
  // autre qu'on n'a jamais reçu (trou → on réclame le journal).
  channel.on('broadcast',{event:'move'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    if(!mpSeqOk(payload))return;
    mpNoteOppAlive();
    if(typeof payload.idx==='number'){
      if(payload.idx<MP.log.length)return;              // déjà joué chez nous
      if(payload.idx>MP.log.length)return mpRequestSync(); // il nous manque un coup
    }
    mpApplyRemoteMove(payload.from,payload.to,payload.promo);
  });

  channel.on('broadcast',{event:'power'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    if(!mpSeqOk(payload))return;
    mpNoteOppAlive();
    if(typeof payload.idx==='number'){
      if(payload.idx<MP.log.length)return;
      if(payload.idx>MP.log.length)return mpRequestSync();
    }
    mpApplyRemotePower(payload.r,payload.c,payload.pieceId);
  });

  // BATTEMENT DE CŒUR : chaque camp annonce régulièrement combien de coups il
  // a enregistrés. Deux longueurs différentes = un message perdu, et celui qui
  // est en avance renvoie ce qui manque sans qu'on ait à le lui demander.
  channel.on('broadcast',{event:'ping'},({payload})=>{
    if(payload.senderId===MP.myId||!mpSeqOk(payload))return;
    mpNoteOppAlive();
    if(typeof payload.len!=='number')return;
    if(payload.len<MP.log.length)mpSendLog(payload.len);
    else if(payload.len>MP.log.length)mpRequestSync();
    else mpAdoptOppClock(payload.clock);   // positions identiques : sa pendule fait foi
  });

  // Demande explicite de rattrapage (retour d'onglet, reconnexion). La
  // demande est aussi une DÉCLARATION : celui qui revient peut très bien être
  // en avance sur nous — c'est le cas s'il a joué juste avant de perdre la
  // connexion. On lui réclame donc à notre tour ce qui nous manque.
  channel.on('broadcast',{event:'sync-req'},({payload})=>{
    if(payload.senderId===MP.myId||!mpSeqOk(payload))return;
    mpNoteOppAlive();
    const theirLen=(typeof payload.len==='number')?payload.len:0;
    if(theirLen<MP.log.length)mpSendLog(theirLen);
    else if(theirLen>MP.log.length)mpRequestSync();
  });

  // Réponse : les coups manquants, dans l'ordre.
  channel.on('broadcast',{event:'sync-log'},({payload})=>{
    if(payload.senderId===MP.myId||!mpSeqOk(payload))return;
    mpNoteOppAlive();
    mpApplySyncEntries(payload.entries);
  });

  // « Je ferme l'onglet » : c'est un abandon, annoncé sans détour. Sans ce
  // message, le joueur resté en ligne attendait un coup qui ne viendrait
  // jamais, sans savoir que l'autre était parti.
  channel.on('broadcast',{event:'bye'},({payload})=>{
    if(payload.senderId===MP.myId||!GS||!GS.multiplayer||GS.gameOver)return;
    if(!MP.started)return;
    mpClearOppGone();mpStopHeartbeat();mpStopResumeWatch();
    mpGameMessage('Votre adversaire a quitté la partie : vous gagnez.','mate');
    GS.gameOver=true;stopClockTick(GS);
    if(!_endGameTriggered)triggerEndOfGame('win');
  });

  channel.on('broadcast',{event:'resign'},({payload})=>{
    if(payload.senderId===MP.myId||!GS||!GS.multiplayer||GS.gameOver)return;
    mpGameMessage('Votre adversaire a abandonné : vous gagnez !','mate');
    GS.gameOver=true;stopClockTick(GS);
    mpStopHeartbeat();
    if(!_endGameTriggered)triggerEndOfGame('win');
  });

  // Départ de l'adversaire en cours de partie : fermer l'onglet ne doit pas
  // être un moyen d'éviter une défaite. Le joueur resté en ligne gagne — mais
  // seulement APRÈS un délai de grâce (voir MP_GRACE_MS) : une mise en veille
  // du téléphone ou un passage sous tunnel coupe la connexion sans que
  // personne n'ait quitté quoi que ce soit.
  // QUI est parti ? Le SDK met l'identifiant du partant dans le champ `key` du
  // PAYLOAD, pas dans les objets de `leftPresences` : ceux-ci ne contiennent
  // que ce qui a été passé à track() (plus un `presence_ref`). Le test portait
  // sur `leftPresences[].key`, une propriété qui n'existe pas : il était donc
  // toujours faux, et le départ de l'adversaire n'a jamais été détecté — ni
  // pour la victoire, ni pour le message. On lit maintenant `key`, avec les
  // métadonnées en second recours (mpTrackMe y écrit aussi notre identifiant).
  channel.on('presence',{event:'leave'},({key,leftPresences})=>{
    if(!MP.started||!GS||!GS.multiplayer||GS.gameOver)return;
    if(!mpIsOpp(key,leftPresences))return;
    mpOppMissing();
  });

  channel.on('presence',{event:'join'},({key,newPresences})=>{
    if(!MP.started)return;
    if(!mpIsOpp(key,newPresences))return;
    mpOppMaybeBack();
  });

  // Dès qu'un second joueur est présent dans le salon, on s'échange les armées.
  channel.on('presence',{event:'sync'},()=>{
    let count=0;
    try{count=Object.keys(channel.presenceState()).length;}catch(e){count=0;}
    if(MP.started){
      if(count>=2)mpOppMaybeBack();
      return;
    }
    if(count>=2){
      if(MP.joinTimeoutId){clearTimeout(MP.joinTimeoutId);MP.joinTimeoutId=null;}
      mpStatus('Adversaire trouvé, préparation de la partie','wait');
      mpSendArmy();
    }
  });
}

function mpSendArmy(){
  if(!MP.channel)return;
  MP.channel.send({type:'broadcast',event:'army',payload:{senderId:MP.myId,army:MP.myArmy,card:mpMyCard()}});
}

// Réémission de la carte de visite tant que la partie n'a pas démarré. Elle
// n'émet QUE si quelqu'un d'autre est effectivement dans le salon : un hôte
// qui attend un ami avec un code peut patienter des minutes, il ne doit pas
// pour autant arroser le serveur de messages destinés à personne.
function mpStartArmyRetry(){
  mpStopArmyRetry();
  MP.armyRetryId=setInterval(()=>{
    if(MP.started||!MP.channel){mpStopArmyRetry();return;}
    let count=0;
    try{count=Object.keys(MP.channel.presenceState()).length;}catch(e){count=0;}
    if(count>=2)mpSendArmy();
  },1500);
}
function mpStopArmyRetry(){
  if(MP.armyRetryId){clearInterval(MP.armyRetryId);MP.armyRetryId=null;}
}

function mpTryStart(){
  if(MP.started||!MP.oppArmy)return;
  MP.started=true;
  mpStopArmyRetry();
  mpLeaveLobby();
  if(MP.joinTimeoutId){clearTimeout(MP.joinTimeoutId);MP.joinTimeoutId=null;}
  currentArmyData=MP.myArmy;
  aiArmyData=MP.oppArmy;      // "aiArmyData" = armée du camp adverse
  _playerColor=MP.myColor;
  // L'ELO gagné ou perdu se calcule contre le classement réel de
  // l'adversaire, pas contre celui de l'IA.
  if(typeof vvSetOpponentElo==='function')vvSetOpponentElo(MP.oppElo);
  MP.log=[];
  mpClearOppGone();
  mpCloseModal();
  startGame(true,true);
  mpStartHeartbeat();
}

// ================================================================
// RÉSILIENCE : ne jamais perdre le coup de l'adversaire
// ================================================================
// LE BUG QUE CETTE SECTION CORRIGE. Les coups voyageaient en « broadcast »
// pur : un message émis pendant que l'autre camp n'écoute pas est perdu, sans
// erreur ni accusé de réception. Or un onglet mis en arrière-plan, un
// téléphone verrouillé ou un simple passage sous un tunnel ferment la
// connexion temps réel. Au retour, le joueur retrouvait le plateau EXACTEMENT
// comme il l'avait laissé : le coup de l'adversaire n'était jamais rejoué, les
// deux écrans montraient deux parties différentes, et la partie était morte.
//
// TROIS MÉCANISMES, qui se rattrapent l'un l'autre :
//
//   1. UN JOURNAL NUMÉROTÉ (MP.log). Chaque action appliquée au plateau — coup
//      ou pouvoir, le mien comme le sien — y est ajoutée dans l'ordre, des
//      deux côtés. La longueur du journal devient donc l'état de la partie en
//      un seul nombre, et un coup reçu porte son numéro d'ordre.
//   2. UN RATTRAPAGE À LA DEMANDE ('sync-req' → 'sync-log'). Au retour dans
//      l'onglet, à la reconnexion, ou dès qu'un numéro reçu saute un cran, on
//      réclame les coups manquants et on les rejoue dans l'ordre, par le même
//      chemin validé que les coups reçus en direct (rien n'est appliqué sans
//      avoir été recalculé légal par notre propre moteur).
//   3. UN BATTEMENT DE CŒUR ('ping'). Toutes les 5 s chacun annonce la
//      longueur de son journal. Celui qui est en avance renvoie spontanément
//      ce qui manque à l'autre. C'est le filet : il rattrape même les pertes
//      que personne n'a remarquées, y compris un coup ÉMIS dans le vide par un
//      joueur dont la connexion venait de tomber.
//
// S'ajoute la reconnexion automatique du canal, et le délai de grâce sur le
// départ de l'adversaire : sans lui, la coupure d'une mise en veille était
// immédiatement comptée comme un abandon.
const MP_HB_MS=5000;      // période du battement de cœur
const MP_SILENCE_MS=16000;// silence au-delà duquel on soupçonne notre propre liaison
const MP_GRACE_MS=45000;  // absence tolérée avant de déclarer l'adversaire parti

// Les messages d'une partie précédente (revanche) n'ont rien à faire dans
// celle-ci : les numéros d'ordre y repartent de zéro.
function mpSeqOk(payload){
  return !payload||typeof payload.seq!=='number'||payload.seq===MP.gameSeq;
}

function mpLogPush(entry){
  MP.log.push(entry);
}

function mpSend(event,payload){
  if(!MP.channel)return;
  try{MP.channel.send({type:'broadcast',event,payload:Object.assign({senderId:MP.myId,seq:MP.gameSeq},payload)});}
  catch(e){console.warn('[MP] envoi impossible :',event,e);}
}

// Le retour dans l'onglet peut déclencher plusieurs événements à la suite
// (visibilitychange + focus + pageshow) : une seule demande suffit. Une
// demande trop rapprochée n'est pas ABANDONNÉE mais REPORTÉE — la jeter,
// c'était risquer de perdre justement celle qui portait un vrai retard.
let _mpLastSyncReq=0;
let _mpSyncReqPending=null;
const MP_SYNC_MIN_MS=1200;
function mpRequestSync(){
  if(!MP.started||!GS||!GS.multiplayer)return;
  const now=Date.now();
  const wait=MP_SYNC_MIN_MS-(now-_mpLastSyncReq);
  if(wait>0){
    if(_mpSyncReqPending)return;
    _mpSyncReqPending=setTimeout(()=>{_mpSyncReqPending=null;mpRequestSync();},wait);
    return;
  }
  _mpLastSyncReq=now;
  mpSend('sync-req',{len:MP.log.length});
}

// Temps restant de MON camp, joint au battement de cœur : chacun fait
// autorité sur sa propre pendule. Sans cela, un joueur revenu d'une absence
// repart avec la pendule figée là où il l'avait laissée, et les deux écrans
// n'affichent plus le même temps — jusqu'au drapeau tombé d'un seul côté.
function mpMyClock(){
  if(!GS||!GS.clockMs)return null;
  return MP.myColor==='w'?GS.timeWhite:GS.timeBlack;
}
function mpAdoptOppClock(ms){
  if(typeof ms!=='number'||!GS||!GS.clockMs||GS.gameOver)return;
  const key=mpOppColor()==='w'?'timeWhite':'timeBlack';
  if(Math.abs(GS[key]-ms)<1500)return;      // simple gigue réseau : on n'y touche pas
  GS[key]=Math.max(0,ms);
  if(typeof renderClocks==='function')renderClocks(GS);
}

// Renvoie tout ce qui suit le rang `from` dans notre journal.
function mpSendLog(from){
  const start=Math.max(0,from|0);
  if(start>=MP.log.length)return;
  mpSend('sync-log',{from:start,entries:MP.log.slice(start)});
}

// Rejoue les coups manqués, strictement dans l'ordre. Un trou (une entrée dont
// le rang dépasse la longueur de notre journal) interrompt le rattrapage :
// mieux vaut attendre le lot complet que d'appliquer un coup dont la position
// de départ n'existe pas encore chez nous.
function mpApplySyncEntries(entries){
  if(!Array.isArray(entries)||!GS||!GS.multiplayer||GS.gameOver)return;
  const sorted=entries.slice().filter(e=>e&&typeof e.i==='number').sort((a,b)=>a.i-b.i);
  for(const e of sorted){
    if(e.i<MP.log.length)continue;      // déjà appliqué
    if(e.i>MP.log.length)break;         // trou : on s'arrête là
    const ok=(e.kind==='power')
      ? mpApplyRemotePower(e.r,e.c,e.pieceId)
      : mpApplyRemoteMove(e.from,e.to,e.promo);
    if(!ok)break;                        // coup refusé : inutile d'insister
    if(GS.gameOver)break;
  }
}

// ----------------------------------------------------------------
// BATTEMENT DE CŒUR
// ----------------------------------------------------------------
function mpStartHeartbeat(){
  mpStopHeartbeat();
  MP.lastRxAt=Date.now();
  MP.hbId=setInterval(()=>{
    if(!MP.started||!GS||!GS.multiplayer||GS.gameOver){mpStopHeartbeat();return;}
    mpSend('ping',{len:MP.log.length,clock:mpMyClock()});
    // SILENCE ANORMAL. L'adversaire émet lui aussi toutes les 5 s : trois
    // périodes sans le moindre message, alors que la présence ne signale
    // aucun départ, veut dire que c'est NOTRE liaison qui est morte sans le
    // dire. On la rouvre — sans quoi on attend indéfiniment un coup qui a
    // pourtant bien été joué en face.
    if(!MP.oppGone&&Date.now()-MP.lastRxAt>MP_SILENCE_MS)mpJoinRoom(true);
  },MP_HB_MS);
}
function mpStopHeartbeat(){
  if(MP.hbId){clearInterval(MP.hbId);MP.hbId=null;}
}

// ----------------------------------------------------------------
// RECONNEXION DU CANAL
// ----------------------------------------------------------------
// Realtime ne se rouvre pas toujours de lui-même après une coupure longue :
// on relance donc l'abonnement, en espaçant les essais pour ne pas marteler un
// serveur injoignable.
function mpScheduleRejoin(){
  if(MP.leaving||MP.rejoinId)return;
  if(!MP.started||!GS||!GS.multiplayer||GS.gameOver)return;
  const wait=Math.min(15000,2000*Math.pow(2,Math.min(3,MP.rejoinTries)));
  MP.rejoinTries++;
  MP.rejoinId=setTimeout(()=>{
    MP.rejoinId=null;
    if(MP.leaving||!MP.started||!GS||!GS.multiplayer||GS.gameOver)return;
    mpJoinRoom(true);
  },wait);
}

// Le canal est-il réellement ouvert ? (état interne du SDK : 'joined' quand
// l'abonnement est vivant.)
function mpChannelAlive(){
  return !!(MP.channel&&MP.channel.state==='joined');
}

// Retour dans l'onglet, retour du réseau, ou page restaurée depuis le cache de
// navigation : on vérifie le canal et on réclame les coups manqués.
function mpResumeIfNeeded(){
  if(!MP.started||!GS||!GS.multiplayer||GS.gameOver)return;
  if(!mpChannelAlive()){mpJoinRoom(true);return;}
  // Le canal se DIT ouvert : sur mobile, une socket tuée en arrière-plan peut
  // rester marquée « joined » alors que plus rien ne passe. On demande donc le
  // rattrapage, et la veille ci-dessous se charge d'insister.
  mpRequestSync();
  mpStartResumeWatch();
}

// ----------------------------------------------------------------
// VEILLE DE REPRISE : insister jusqu'à ce que l'adversaire réponde
// ----------------------------------------------------------------
// Une seule demande de rattrapage ne suffit pas au retour d'une absence : elle
// part souvent AVANT que la connexion ne soit réellement rétablie, et rien ne
// la rejoue. On redemande donc toutes les 2 secondes tant qu'aucun message
// n'est arrivé, en rouvrant le canal au bout de quelques essais infructueux.
// La veille s'arrête au premier signe de vie de l'adversaire.
function mpStartResumeWatch(){
  mpStopResumeWatch();
  const since=Date.now();
  let tries=0;
  MP.resumeWatchId=setInterval(()=>{
    if(!MP.started||!GS||!GS.multiplayer||GS.gameOver){mpStopResumeWatch();return;}
    if(MP.lastRxAt>=since){mpStopResumeWatch();return;}   // il a répondu : tout va bien
    tries++;
    if(tries>15){mpStopResumeWatch();return;}             // ~30 s : c'est un vrai départ
    if(tries===3||tries===8)mpJoinRoom(true);             // toujours muet : on rouvre le canal
    mpRequestSync();
  },2000);
}
function mpStopResumeWatch(){
  if(MP.resumeWatchId){clearInterval(MP.resumeWatchId);MP.resumeWatchId=null;}
}

if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')mpResumeIfNeeded();
  });
}
if(typeof window!=='undefined'){
  window.addEventListener('online',mpResumeIfNeeded);
  window.addEventListener('focus',mpResumeIfNeeded);
  window.addEventListener('pageshow',mpResumeIfNeeded);

  // FERMETURE DE L'ONGLET : on prévient nous-mêmes, tout de suite. La présence
  // finit par signaler le départ, mais avec le délai du serveur puis celui de
  // grâce ; un adieu explicite dit à l'adversaire dans la seconde ce qui vient
  // de se passer. `persisted` distingue la vraie fermeture d'une mise en
  // arrière-plan sur mobile, où la page peut revenir intacte : dans ce cas on
  // ne dit rien, c'est le rattrapage qui prendra le relais au retour.
  window.addEventListener('pagehide',(e)=>{
    if(e&&e.persisted)return;
    mpSayGoodbye();
  });
  window.addEventListener('beforeunload',()=>mpSayGoodbye());
}

let _mpGoodbyeSent=false;
function mpSayGoodbye(){
  if(_mpGoodbyeSent||!MP.started||!MP.channel)return;
  if(!GS||!GS.multiplayer||GS.gameOver)return;
  _mpGoodbyeSent=true;
  mpSend('bye',{});
}

// ----------------------------------------------------------------
// ABSENCE DE L'ADVERSAIRE : délai de grâce
// ----------------------------------------------------------------
function mpClearOppGone(){
  if(MP.oppGoneTimerId){clearTimeout(MP.oppGoneTimerId);MP.oppGoneTimerId=null;}
  MP.oppGone=false;
}

function mpOppMissing(){
  if(MP.oppGone||!MP.started||!GS||!GS.multiplayer||GS.gameOver)return;
  MP.oppGone=true;
  mpGameMessage('Votre adversaire s\'est déconnecté. Il a '+Math.round(MP_GRACE_MS/1000)+' secondes pour revenir…','check');
  MP.oppGoneTimerId=setTimeout(()=>{
    MP.oppGoneTimerId=null;
    if(!MP.oppGone||!GS||!GS.multiplayer||GS.gameOver)return;
    GS.gameOver=true;stopClockTick(GS);mpStopHeartbeat();
    mpGameMessage('Votre adversaire a quitté la partie : vous gagnez.','mate');
    if(!_endGameTriggered)triggerEndOfGame('win');
  },MP_GRACE_MS);
}

// L'adversaire est de retour : on annule le compte à rebours et on se remet
// d'accord sur la position, car chacun a pu jouer pendant la coupure.
function mpOppMaybeBack(){
  if(!MP.oppGone)return;
  mpClearOppGone();
  if(GS&&GS.multiplayer&&!GS.gameOver){
    mpGameMessage('Votre adversaire est revenu.','');
    if(typeof updateStatus==='function')setTimeout(()=>{if(GS&&!GS.gameOver)updateStatus(GS);},2500);
  }
  mpRequestSync();
  mpSendLog(0);
}

// Tout message reçu prouve deux choses : que l'adversaire est là — même si
// « presence » n'a pas encore rattrapé son retour — et que notre canal
// fonctionne réellement (voir mpResumeIfNeeded).
function mpNoteOppAlive(){
  MP.lastRxAt=Date.now();
  if(MP.oppGone)mpOppMaybeBack();
}

// ----------------------------------------------------------------
// REVANCHE
// ----------------------------------------------------------------
function mpProposeRematch(){
  if(!MP.channel||!MP.started)return false;
  MP.rematchMine=true;
  MP.channel.send({type:'broadcast',event:'rematch',payload:{senderId:MP.myId}});
  mpUpdateRematchUI();
  mpTryRematch();
  return true;
}
function mpUpdateRematchUI(){
  const btn=document.getElementById('result-revanche');
  if(!btn||!GS||!GS.multiplayer)return;
  if(MP.rematchMine&&!MP.rematchTheirs)btn.textContent='Revanche demandée…';
  else if(MP.rematchTheirs&&!MP.rematchMine)btn.textContent='Revanche proposée !';
}
function mpTryRematch(){
  if(!MP.rematchMine||!MP.rematchTheirs)return;
  MP.rematchMine=false;MP.rematchTheirs=false;
  MP.gameSeq++;
  // Nouvelle partie : journal remis à zéro des deux côtés, sinon les numéros
  // d'ordre de la partie précédente feraient croire à des coups manquants.
  MP.log=[];
  mpClearOppGone();
  // Les camps s'échangent : l'hôte ne garde pas les Blancs indéfiniment.
  MP.myColor=MP.myColor==='w'?'b':'w';
  MP.isHost=!MP.isHost;
  currentArmyData=MP.myArmy;
  aiArmyData=MP.oppArmy;
  _playerColor=MP.myColor;
  document.getElementById('result-modal')?.classList.remove('active');
  startGame(true,true);
  mpStartHeartbeat();
}

// ----------------------------------------------------------------
// SYNCHRONISATION DES COUPS ET ANTI-TRICHE
// ----------------------------------------------------------------
// Les coups reçus sont rejoués via executeGameMove : les deux clients
// exécutent donc la même logique de règles sur le même plateau initial, et
// restent alignés.
//
// Mais le réseau n'est jamais une source de vérité : un joueur peut modifier le
// code de sa page et émettre n'importe quel message. Chaque client rejuge
// donc le coup reçu avec son propre moteur de règles, et n'applique QUE des
// coups qu'il a lui-même calculés comme légaux.
// showNotif() est volontairement muette dans ce projet : les messages de
// partie en ligne passent donc par la barre de statut du plateau, qui est le
// seul endroit que le joueur regarde pendant une partie.
function mpGameMessage(text,cls){
  const bar=document.getElementById('game-status');
  if(bar){bar.textContent=text;bar.className='status-bar '+(cls||'');}
}
function mpRejectMove(reason){
  console.warn('[MP] coup rejeté :',reason);
  mpGameMessage('Coup adverse invalide, ignoré ('+reason+').','check');
  return false;
}

function mpOppColor(){return MP.myColor==='w'?'b':'w';}

// Reconstruit localement la liste des promotions autorisées pour le camp
// adverse (son armée + les pièces standard), afin qu'un adversaire ne puisse
// pas se promouvoir en une pièce qu'il ne possède pas.
function mpAllowedPromotions(){
  const army=GS.aiArmy;const allowed=[];
  (army?.extras||[]).forEach(id=>{const p=PIECES.find(x=>x.id===id);if(p)allowed.push({type:p.pieceType||'q',emoji:p.emoji,pieceId:p.id});});
  const gen=army?.gen?.id?PIECES.find(p=>p.id===army.gen.id):null;
  if(gen)allowed.push({type:gen.pieceType||'q',emoji:gen.emoji,pieceId:gen.id});
  [['q','♕','dame-promo'],['r','♖','tour-promo'],['b','♗','fou-promo'],['n','♘','cav-promo']].forEach(([t,e,id])=>allowed.push({type:t,emoji:e,pieceId:id}));
  return allowed;
}

// Renvoie l'option locale correspondante (jamais l'objet reçu) pour empêcher
// l'injection d'un type, d'un emoji ou d'un pieceId arbitraire.
function mpSanitizePromo(promo){
  if(!promo||!promo.pieceId)return null;
  return mpAllowedPromotions().find(o=>o.pieceId===promo.pieceId)||null;
}

// Renvoie true si le coup a bien été appliqué : le rattrapage
// (mpApplySyncEntries) s'arrête au premier refus plutôt que de rejouer la
// suite sur une position qui n'est plus la bonne.
let _mpApplyingRemote=false;
function mpApplyRemoteMove(from,to,promo){
  if(!GS||!GS.multiplayer||GS.gameOver)return false;
  const oppCol=mpOppColor();

  if(GS.turn!==oppCol)return mpRejectMove('ce n\'est pas son tour');
  if(!from||!to||!inB(from.r,from.c)||!inB(to.r,to.c))return mpRejectMove('coordonnées hors plateau');

  const piece=GS.board[from.r][from.c];
  if(!piece)return mpRejectMove('aucune pièce au départ');
  if(piece.color!==oppCol)return mpRejectMove('pièce qui ne lui appartient pas');

  // On cherche le coup parmi CEUX QUE NOUS AVONS CALCULÉS, et on applique
  // notre propre objet : les effets spéciaux (destroysPath, castle, ep...)
  // viennent donc de notre moteur, pas du message reçu.
  const legal=getLegalMoves(GS.board,from.r,from.c,GS);
  const move=legal.find(m=>m.r===to.r&&m.c===to.c&&!m.stayPut)||legal.find(m=>m.r===to.r&&m.c===to.c);
  if(!move)return mpRejectMove('coup illégal');

  // Une promotion doit être accompagnée d'un choix valide, sinon la modal de
  // promotion s'ouvrirait chez le mauvais joueur.
  const isPromo=TRUE_PAWN_IDS.has(piece.pieceId)&&(move.r===0||move.r===7);
  let safePromo=null;
  if(isPromo){
    safePromo=mpSanitizePromo(promo);
    if(!safePromo)return mpRejectMove('promotion manquante ou non autorisée');
  }

  _mpApplyingRemote=true;
  GS._forcedPromo=safePromo;
  GS.lastMove={from:{r:from.r,c:from.c},to:move,capture:!!GS.board[move.r][move.c]};
  executeGameMove({r:from.r,c:from.c},move,GS);
  GS._forcedPromo=null;
  _mpApplyingRemote=false;
  // Le coup adverse entre au journal EXACTEMENT comme chez lui : les deux
  // journaux gardent la même longueur, qui sert de repère au rattrapage.
  mpLogPush({i:MP.log.length,kind:'move',from:{r:from.r,c:from.c},to:{r:to.r,c:to.c},promo:safePromo});
  return true;
}

// Pouvoir du Garde de Pierre : il change le tour sans passer par
// executeGameMove, il a donc son propre message, revalidé de la même façon.
function mpApplyRemotePower(r,c,pieceId){
  if(!GS||!GS.multiplayer||GS.gameOver)return false;
  const oppCol=mpOppColor();
  if(GS.turn!==oppCol)return mpRejectMove('pouvoir hors tour');
  if(!inB(r,c))return mpRejectMove('pouvoir hors plateau');
  const cell=GS.board[r][c];
  if(!cell||cell.color!==oppCol)return mpRejectMove('pouvoir sur une pièce qui ne lui appartient pas');
  if(cell.pieceId!==pieceId||pieceId!=='garde-pierre')return mpRejectMove('pouvoir inconnu');
  if(GS.gardePierreUsed[oppCol])return mpRejectMove('pouvoir déjà utilisé');
  applyGardePierre(r,c,oppCol,GS);
  mpLogPush({i:MP.log.length,kind:'power',r,c,pieceId});
  return true;
}

// Nos propres actions sont journalisées AVANT d'être émises : même si le
// message se perd (connexion tombée à cet instant précis), le journal, lui,
// contient le coup et le battement de cœur le fera parvenir à l'adversaire.
function mpSendMove(from,to,promo){
  if(!GS||!GS.multiplayer)return;
  const idx=MP.log.length;
  mpLogPush({i:idx,kind:'move',from:{r:from.r,c:from.c},to:{r:to.r,c:to.c},promo:promo||null});
  mpSend('move',{idx,from:{r:from.r,c:from.c},to:{r:to.r,c:to.c},promo:promo||null});
}

function mpSendPower(r,c,pieceId){
  if(!GS||!GS.multiplayer)return;
  const idx=MP.log.length;
  mpLogPush({i:idx,kind:'power',r,c,pieceId});
  mpSend('power',{idx,r,c,pieceId});
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
  mpSend('resign',{});
}

function mpLeave(){
  MP.leaving=true;
  if(MP.joinTimeoutId){clearTimeout(MP.joinTimeoutId);MP.joinTimeoutId=null;}
  if(MP.rejoinId){clearTimeout(MP.rejoinId);MP.rejoinId=null;}
  MP.rejoinTries=0;
  mpStopHeartbeat();
  mpStopResumeWatch();
  mpClearOppGone();
  mpStopArmyRetry();
  if(typeof mpWaitStop==='function')mpWaitStop();
  mpDropChannel();
  mpLeaveLobby();
  MP.started=false;MP.matched=false;MP.oppArmy=null;MP.roomCode=null;MP.log=[];
  MP.searchStartedAt=0;MP.waitStartedAt=0;
  MP.oppName=null;MP.oppElo=null;MP.oppId=null;
  MP.rematchMine=false;MP.rematchTheirs=false;
  // On repasse sur l'ELO de l'IA pour les prochaines parties hors ligne.
  if(typeof vvSetOpponentElo==='function')vvSetOpponentElo(null);
}

// ================================================================
// MATCHMAKING AUTOMATIQUE : appariement par niveau
// ================================================================
// Aucune table n'est nécessaire : les joueurs en attente se déclarent par
// "presence" dans un salon d'attente unique, en publiant leur heure d'arrivée
// et leur ELO.
//
// -- CE QUE FAISAIT L'ANCIEN ALGORITHME -----------------------------------
// Il appariait les DEUX PLUS ANCIENS, point final. Un joueur à 120 ELO
// tombait donc régulièrement contre un joueur à 2000, ce qui, dans un jeu où
// perdre coûte l'armée engagée, est la pire rencontre possible pour les deux.
// Il supposait aussi que les deux camps aboutiraient au même calcul en même
// temps : les horloges de deux navigateurs ne sont pas synchronisées, et deux
// clients pouvaient se croire tous les deux « le plus ancien ».
//
// -- CE QU'IL FAIT MAINTENANT ---------------------------------------------
//   1. FENÊTRE DE NIVEAU QUI S'ÉLARGIT. On cherche d'abord un adversaire à
//      ±120 ELO ; toutes les 8 secondes la fenêtre s'élargit de 120, et au
//      bout de 48 secondes on accepte n'importe qui. Personne n'attend
//      indéfiniment, et personne n'est jeté d'emblée contre trois rangs
//      au-dessus.
//   2. UN SEUL DÉCIDEUR. Le joueur qui attend depuis le plus longtemps est le
//      « chercheur » : lui seul choisit, parmi les candidats dans sa fenêtre,
//      le plus proche en ELO, et il l'annonce. Les autres ne calculent rien,
//      ils répondent. Plus aucun accord d'horloge n'est nécessaire.
//   3. POIGNÉE DE MAIN EN DEUX TEMPS. Le chercheur propose ('pair'), le
//      partenaire confirme ('pair-ok'), et seulement alors les deux entrent
//      dans le salon de partie. Sans confirmation au bout de 3,5 s, la
//      proposition est abandonnée et la recherche reprend : deux chercheurs
//      simultanés (cas d'une désynchronisation d'horloges) ne peuvent plus
//      laisser quelqu'un seul dans un salon.
//   4. RÉ-ÉVALUATION PÉRIODIQUE. « Presence » n'émet un événement que lorsque
//      quelqu'un entre ou sort ; la fenêtre, elle, s'élargit avec le temps.
//      Un battement régulier relance donc le calcul, et met à jour l'écran de
//      recherche (temps écoulé, joueurs en attente, fenêtre courante).
//
// On ne quitte le salon d'attente qu'une fois la partie réellement démarrée
// (mpTryStart) : un départ immédiat, regroupé par le serveur avec l'arrivée,
// faisait disparaître la paire aux yeux de l'autre camp.
const MP_LOBBY='epichess-lobby-v2';
const MP_TICK_MS=1000;        // battement de ré-évaluation et d'affichage
const MP_ACK_MS=3500;         // délai avant d'abandonner une proposition
const MP_ELO_BASE=120;        // fenêtre de départ, en points d'ELO
const MP_ELO_STEP=120;        // élargissement…
const MP_ELO_EVERY=8;         // …toutes les 8 secondes
const MP_ELO_OPEN=48;         // au-delà : plus aucune fenêtre

// Fenêtre d'ELO acceptée après `waitS` secondes d'attente. Infinity = tout le
// monde convient.
function mpEloWindow(waitS){
  if(waitS>=MP_ELO_OPEN)return Infinity;
  return MP_ELO_BASE+Math.floor(waitS/MP_ELO_EVERY)*MP_ELO_STEP;
}

// Liste des joueurs présents dans le salon d'attente, la nôtre comprise.
function mpLobbyPeers(){
  if(!MP.lobby)return[];
  let state={};
  try{state=MP.lobby.presenceState()||{};}catch(e){return[];}
  return Object.keys(state).map(k=>{
    const meta=(state[k]&&state[k][0])||{};
    return{
      id:k,
      joinedAt:meta.joinedAt||0,
      elo:(typeof meta.elo==='number')?meta.elo:0,
      busy:!!meta.busy,
    };
  }).sort((a,b)=>(a.joinedAt-b.joinedAt)||a.id.localeCompare(b.id));
}

function mpLeaveLobby(){
  mpStopLobbyTick();
  mpClearProposal();
  if(MP.lobby){MP.lobby.unsubscribe();MP.lobby=null;}
}

function mpStopLobbyTick(){
  if(MP.lobbyTickId){clearInterval(MP.lobbyTickId);MP.lobbyTickId=null;}
}
function mpClearProposal(){
  if(MP.pairTimerId){clearTimeout(MP.pairTimerId);MP.pairTimerId=null;}
  MP.pairPending=null;
}

// Entrée effective dans le salon de partie, une fois la poignée de main faite.
function mpEnterPair(hostId){
  if(MP.matched||MP.started)return;
  MP.matched=true;
  mpStopLobbyTick();
  mpStatus('Adversaire trouvé, préparation de la partie','wait');
  // Le nom du salon dérive de l'id de l'hôte : les deux camps le calculent
  // à l'identique.
  mpConnect('q-'+hostId.slice(0,12),MP.myId===hostId);
}

// ----------------------------------------------------------------
// ÉCRAN D'ATTENTE : la toile
// ----------------------------------------------------------------
// Attendre un adversaire est le seul moment du jeu où le joueur ne fait rien
// et ne peut rien faire. La fenêtre de salon s'efface donc derrière une toile
// plein écran (assets/backgrounds/duel-wait.svg, voir [MP-WAIT] dans
// css/style.css). Vaut pour les deux attentes — la recherche automatique et
// l'attente d'un ami sur une partie privée.
const MP_WAIT_SCREENS=new Set(['quick']);

function mpWaitStart(){
  mpWaitStop();
  MP.waitStartedAt=Date.now();
  document.getElementById('mp-modal')?.classList.add('mp-wait');
  mpRenderTip();
}
function mpWaitStop(){
  document.getElementById('mp-modal')?.classList.remove('mp-wait');
}

// ----------------------------------------------------------------
// TIPS D'ATTENTE
// ----------------------------------------------------------------
// Ce qu'on lit pendant qu'un adversaire se cherche. POUR EN AJOUTER UN : une
// ligne de plus dans ce tableau, il n'y a rien d'autre à toucher — un tips est
// tiré au sort à chaque entrée en attente (mpRenderTip).
const MP_TIPS=[
  'Les pièces primordiales furent les premières expériences des Alchimistes, c\'est pour cela qu\'elles n\'ont pas de pouvoir.',
];
function mpRenderTip(){
  const el=document.getElementById('mp-tip');
  if(!el||!MP_TIPS.length){if(el)el.innerHTML='';return;}
  const txt=MP_TIPS[Math.floor(Math.random()*MP_TIPS.length)];
  el.innerHTML='<span class="mp-tip-lbl">Le saviez-vous&nbsp;?</span>'+
    '<span class="mp-tip-txt">'+(typeof escH==='function'?escH(txt):txt)+'</span>';
}

// Chercher sans rien voir bouger donne l'impression que le jeu est en panne :
// le chronomètre dit d'un coup d'œil que quelque chose tourne encore, la note
// ci-dessous dit où l'on en est de la recherche.
function mpRenderSearch(waitS,peerCount,win){
  // La note ne dit plus QUE la fenêtre de niveau qui s'ouvre. Elle annonçait
  // aussi « Personne d'autre en attente pour l'instant » : apprendre qu'on est
  // seul en ligne pendant qu'on attend n'aide en rien et décourage d'attendre.
  const note=document.getElementById('mp-search-note');
  if(note)note.textContent='Recherche d\'adversaire en cours';
}

// ----------------------------------------------------------------
// BATTEMENT : ré-évaluation de l'appariement + rafraîchissement de l'écran
// ----------------------------------------------------------------
function mpLobbyTick(){
  if(!MP.lobby||MP.matched||MP.started){mpStopLobbyTick();return;}
  const now=Date.now();
  const waitS=Math.max(0,Math.floor((now-(MP.searchStartedAt||now))/1000));
  const peers=mpLobbyPeers();
  const free=peers.filter(p=>!p.busy);
  const win=mpEloWindow(waitS);
  mpRenderSearch(waitS,free.length,win);

  if(MP.pairPending)return;          // une proposition est déjà en vol
  if(free.length<2)return;
  // Seul le plus ancien décide. Les autres attendent d'être appelés : c'est
  // ce qui évite d'avoir à supposer que deux navigateurs sont d'accord sur
  // l'heure qu'il est.
  if(free[0].id!==MP.myId)return;

  const me=free[0];
  const candidates=free.slice(1)
    .map(p=>({p,gap:Math.abs((p.elo||0)-(me.elo||0))}))
    .filter(x=>x.gap<=win)
    .sort((a,b)=>a.gap-b.gap||a.p.joinedAt-b.p.joinedAt);
  if(!candidates.length)return;

  const guest=candidates[0].p;
  MP.pairPending=guest.id;
  MP.lobby.send({type:'broadcast',event:'pair',payload:{host:MP.myId,guest:guest.id}});
  // Sans confirmation, on remet le candidat dans la file et on recommence.
  MP.pairTimerId=setTimeout(()=>{
    MP.pairTimerId=null;
    if(!MP.matched&&!MP.started)MP.pairPending=null;
  },MP_ACK_MS);
}

function mpQuickPlay(){
  const client=mpInitClient();if(!client)return;
  mpLeaveLobby();
  MP.myArmy=currentArmyData;MP.matched=false;MP.started=false;
  const card=mpMyCard();
  const joinedAt=Date.now();
  MP.searchStartedAt=joinedAt;
  MP.lobby=client.channel(MP_LOBBY,{config:{presence:{key:MP.myId}}});

  // PROPOSITION reçue d'un chercheur : on confirme puis on entre. La
  // confirmation est ce qui permet au chercheur de savoir que sa proposition
  // a trouvé preneur, et donc de ne pas se retrouver seul dans un salon.
  MP.lobby.on('broadcast',{event:'pair'},({payload})=>{
    if(!payload||MP.matched||MP.started)return;
    if(payload.guest!==MP.myId)return;
    MP.lobby.send({type:'broadcast',event:'pair-ok',payload:{host:payload.host,guest:MP.myId}});
    try{MP.lobby.track({id:MP.myId,joinedAt,elo:card.elo,busy:true});}catch(e){}
    mpEnterPair(payload.host);
  });

  // CONFIRMATION reçue par le chercheur : la paire est scellée des deux côtés.
  MP.lobby.on('broadcast',{event:'pair-ok'},({payload})=>{
    if(!payload||MP.matched||MP.started)return;
    if(payload.host!==MP.myId||payload.guest!==MP.pairPending)return;
    mpClearProposal();
    try{MP.lobby.track({id:MP.myId,joinedAt,elo:card.elo,busy:true});}catch(e){}
    mpEnterPair(MP.myId);
  });

  // Une arrivée ou un départ relance le calcul tout de suite plutôt que
  // d'attendre le prochain battement.
  MP.lobby.on('presence',{event:'sync'},()=>mpLobbyTick());
  MP.lobby.on('presence',{event:'leave'},({key,leftPresences})=>{
    // Le candidat à qui l'on vient de proposer une partie est parti : inutile
    // d'attendre les 3,5 s de la confirmation, on repart en recherche. Ici
    // aussi, l'identité du partant est dans `key`, pas dans les métadonnées.
    const gone=key===MP.pairPending||(leftPresences||[]).some(p=>p&&p.id===MP.pairPending);
    if(MP.pairPending&&gone)mpClearProposal();
    mpLobbyTick();
  });

  MP.lobby.subscribe(async(status,err)=>{
    if(status==='SUBSCRIBED'){
      await MP.lobby.track({id:MP.myId,joinedAt,elo:card.elo,busy:false});
      mpStatus('');
      mpRenderSearch(0,1,mpEloWindow(0));
      mpStopLobbyTick();
      MP.lobbyTickId=setInterval(mpLobbyTick,MP_TICK_MS);
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
      if(MP.matched||MP.started)return;   // paire formée : le salon se ferme normalement
      mpStopLobbyTick();
      mpReportFailure(status,err);
    }
  });
}

// ----------------------------------------------------------------
// MODAL : écran de choix → écran hôte (code) ou écran invité (saisie)
// ----------------------------------------------------------------
function mpShowScreen(name){
  ['quick'].forEach(s=>{
    const el=document.getElementById('mp-screen-'+s);
    if(el)el.style.display=(s===name)?'':'none';
  });
  if(MP_WAIT_SCREENS.has(name))mpWaitStart();else mpWaitStop();
}

function mpCloseModal(){
  mpWaitStop();
  document.getElementById('mp-modal')?.classList.remove('show');
}

function mpOpenModal(){
  if(!currentArmyData){showNotif('Choisissez d\'abord votre armée.','err');return;}
  mpLeave();
  mpShowScreen('quick');
  mpStatus('');
  if(!mpIsConfigured())mpStatus('Multijoueur pas encore configuré : renseignez l\'URL de votre projet Supabase (Settings > API > Project URL) dans js/multiplayer.js.','err');
  document.getElementById('mp-modal').classList.add('show');
}

// LES PARTIES PRIVÉES PAR CODE ONT ÉTÉ RETIRÉES. Elles demandaient de
// transmettre six caractères à quelqu'un par un autre canal — un détour hors
// du jeu — et faisaient vivre trois écrans de salon pour un usage marginal.
// Il ne reste que l'appariement automatique, lancé directement par COMBAT.

document.getElementById('mp-cancel')?.addEventListener('click',()=>{
  mpLeave();
  mpCloseModal();
});
