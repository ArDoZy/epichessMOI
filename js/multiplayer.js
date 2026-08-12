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

  MP.channel=client.channel('epichess-room-'+code,{config:{presence:{key:MP.myId}}});

  // Réception de l'armée adverse. On répond avec la nôtre pour couvrir le
  // cas où notre premier envoi est parti avant que l'autre camp n'écoute.
  MP.channel.on('broadcast',{event:'army'},({payload})=>{
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
  MP.channel.on('broadcast',{event:'rematch'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    MP.rematchTheirs=true;
    mpUpdateRematchUI();
    mpTryRematch();
  });

  MP.channel.on('broadcast',{event:'move'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    mpApplyRemoteMove(payload.from,payload.to,payload.promo);
  });

  MP.channel.on('broadcast',{event:'power'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    mpApplyRemotePower(payload.r,payload.c,payload.pieceId);
  });

  MP.channel.on('broadcast',{event:'resign'},({payload})=>{
    if(payload.senderId===MP.myId||!GS||!GS.multiplayer||GS.gameOver)return;
    mpGameMessage('Votre adversaire a abandonné : vous gagnez !','mate');
    GS.gameOver=true;stopClockTick(GS);
    if(!_endGameTriggered)triggerEndOfGame('win');
  });

  // Départ de l'adversaire en cours de partie : fermer l'onglet ne doit pas
  // être un moyen d'éviter une défaite. Le joueur resté en ligne gagne.
  MP.channel.on('presence',{event:'leave'},({leftPresences})=>{
    if(!MP.started||!GS||!GS.multiplayer||GS.gameOver)return;
    const left=(leftPresences||[]).some(p=>p&&(p.key===MP.oppId||p.senderId===MP.oppId));
    if(!left&&MP.oppId)return;
    GS.gameOver=true;stopClockTick(GS);
    const bar=document.getElementById('game-status');
    if(bar){bar.textContent='Votre adversaire a quitté la partie : vous gagnez.';bar.className='status-bar mate';}
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

  // RENVOI PÉRIODIQUE DE L'ARMÉE. Un seul envoi ne suffit pas : les deux
  // camps ne s'abonnent pas à la même seconde, et un broadcast émis avant que
  // l'autre n'écoute est perdu sans erreur ni accusé de réception. Les deux
  // clients restaient alors face à face, chacun attendant une armée déjà
  // envoyée. On réémet donc jusqu'à ce que la partie démarre.
  mpStartArmyRetry();

  // Le second argument du rappel porte l'erreur de Realtime : l'ignorer,
  // c'était perdre la seule information disponible sur la panne.
  MP.channel.subscribe(async(status,err)=>{
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
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
      if(MP.started)return;   // partie déjà lancée : la fermeture est normale
      mpReportFailure(status,err);
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
  mpCloseModal();
  startGame(true,true);
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
  // Les camps s'échangent : l'hôte ne garde pas les Blancs indéfiniment.
  MP.myColor=MP.myColor==='w'?'b':'w';
  MP.isHost=!MP.isHost;
  currentArmyData=MP.myArmy;
  aiArmyData=MP.oppArmy;
  _playerColor=MP.myColor;
  document.getElementById('result-modal')?.classList.remove('active');
  startGame(true,true);
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

let _mpApplyingRemote=false;
function mpApplyRemoteMove(from,to,promo){
  if(!GS||!GS.multiplayer||GS.gameOver)return;
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
}

// Pouvoir du Garde de Pierre : il change le tour sans passer par
// executeGameMove, il a donc son propre message, revalidé de la même façon.
function mpApplyRemotePower(r,c,pieceId){
  if(!GS||!GS.multiplayer||GS.gameOver)return;
  const oppCol=mpOppColor();
  if(GS.turn!==oppCol)return mpRejectMove('pouvoir hors tour');
  if(!inB(r,c))return mpRejectMove('pouvoir hors plateau');
  const cell=GS.board[r][c];
  if(!cell||cell.color!==oppCol)return mpRejectMove('pouvoir sur une pièce qui ne lui appartient pas');
  if(cell.pieceId!==pieceId||pieceId!=='garde-pierre')return mpRejectMove('pouvoir inconnu');
  if(GS.gardePierreUsed[oppCol])return mpRejectMove('pouvoir déjà utilisé');
  applyGardePierre(r,c,oppCol,GS);
}

function mpSendMove(from,to,promo){
  if(!MP.channel)return;
  MP.channel.send({type:'broadcast',event:'move',payload:{senderId:MP.myId,from,to,promo:promo||null}});
}

function mpSendPower(r,c,pieceId){
  if(!MP.channel)return;
  MP.channel.send({type:'broadcast',event:'power',payload:{senderId:MP.myId,r,c,pieceId}});
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
  mpStopArmyRetry();
  if(typeof mpWaitStop==='function')mpWaitStop();
  if(MP.channel){MP.channel.unsubscribe();MP.channel=null;}
  mpLeaveLobby();
  MP.started=false;MP.matched=false;MP.oppArmy=null;MP.roomCode=null;
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
const MP_FALLBACK_S=40;       // on propose un adversaire IA à partir d'ici

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
// ÉCRAN D'ATTENTE : la toile et le chronomètre
// ----------------------------------------------------------------
// Attendre un adversaire est le seul moment du jeu où le joueur ne fait rien
// et ne peut rien faire. La fenêtre de salon s'efface donc derrière une toile
// plein écran (assets/backgrounds/duel-wait.svg, voir [MP-WAIT] dans
// css/style.css) et un CHRONOMÈTRE s'installe en bas au milieu : il est le
// seul élément qui bouge, donc la seule preuve que quelque chose tourne
// encore. Il vaut pour les deux attentes — la recherche automatique et
// l'attente d'un ami sur une partie privée, qui n'avait jusqu'ici aucun
// compteur du tout.
const MP_WAIT_SCREENS=new Set(['quick','host']);
let _mpWaitTimer=null;

function mpFmtClock(sec){
  const m=Math.floor(sec/60),s=Math.floor(sec%60);
  return m+':'+(s<10?'0':'')+s;
}
function mpWaitTick(){
  const el=document.getElementById('mp-wait-time');
  if(!el)return;
  el.textContent=mpFmtClock((Date.now()-(MP.waitStartedAt||Date.now()))/1000);
}
function mpWaitStart(){
  mpWaitStop();
  MP.waitStartedAt=Date.now();
  document.getElementById('mp-modal')?.classList.add('mp-wait');
  mpRenderTip();
  mpWaitTick();
  _mpWaitTimer=setInterval(mpWaitTick,1000);
}
function mpWaitStop(){
  if(_mpWaitTimer){clearInterval(_mpWaitTimer);_mpWaitTimer=null;}
  document.getElementById('mp-modal')?.classList.remove('mp-wait');
}

// ----------------------------------------------------------------
// TIPS D'ATTENTE
// ----------------------------------------------------------------
// Ce qu'on lit pendant qu'un adversaire se cherche. POUR EN AJOUTER UN : une
// ligne de plus dans ce tableau, il n'y a rien d'autre à toucher — un tips est
// tiré au sort à chaque entrée en attente (mpRenderTip).
const MP_TIPS=[
  'Les pièces primordiales furent les premières expériences du savant, c\'est pour cela qu\'elles n\'ont pas de pouvoir.',
];
function mpRenderTip(){
  const el=document.getElementById('mp-tip');
  if(!el||!MP_TIPS.length){if(el)el.innerHTML='';return;}
  const txt=MP_TIPS[Math.floor(Math.random()*MP_TIPS.length)];
  el.innerHTML='<span class="mp-tip-lbl">Le savez-vous&nbsp;?</span>'+
    '<span class="mp-tip-txt">'+(typeof escH==='function'?escH(txt):txt)+'</span>';
}

// Chercher sans rien voir bouger donne l'impression que le jeu est en panne :
// le chronomètre dit d'un coup d'œil que quelque chose tourne encore, la note
// ci-dessous dit où l'on en est de la recherche.
function mpRenderSearch(waitS,peerCount,win){
  const note=document.getElementById('mp-search-note');
  if(note){
    note.textContent=peerCount<2
      ? 'Personne d\'autre en attente pour l\'instant. Vous partirez au combat dès qu\'un joueur lancera une partie rapide.'
      : (win===Infinity
        ? 'Recherche ouverte à tous les niveaux.'
        : 'Adversaire recherché entre '+Math.max(0,mpMyCard().elo-win)+' et '+(mpMyCard().elo+win)+' ELO.');
  }
  const fb=document.getElementById('mp-fallback-btn');
  if(fb)fb.style.display=(waitS>=MP_FALLBACK_S)?'':'none';
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
    try{MP.lobby.track({joinedAt,elo:card.elo,busy:true});}catch(e){}
    mpEnterPair(payload.host);
  });

  // CONFIRMATION reçue par le chercheur : la paire est scellée des deux côtés.
  MP.lobby.on('broadcast',{event:'pair-ok'},({payload})=>{
    if(!payload||MP.matched||MP.started)return;
    if(payload.host!==MP.myId||payload.guest!==MP.pairPending)return;
    mpClearProposal();
    try{MP.lobby.track({joinedAt,elo:card.elo,busy:true});}catch(e){}
    mpEnterPair(MP.myId);
  });

  // Une arrivée ou un départ relance le calcul tout de suite plutôt que
  // d'attendre le prochain battement.
  MP.lobby.on('presence',{event:'sync'},()=>mpLobbyTick());
  MP.lobby.on('presence',{event:'leave'},({leftPresences})=>{
    // Le candidat à qui l'on vient de proposer une partie est parti : inutile
    // d'attendre les 3,5 s de la confirmation, on repart en recherche.
    if(MP.pairPending&&(leftPresences||[]).some(p=>p&&p.key===MP.pairPending))mpClearProposal();
    mpLobbyTick();
  });

  MP.lobby.subscribe(async(status,err)=>{
    if(status==='SUBSCRIBED'){
      await MP.lobby.track({joinedAt,elo:card.elo,busy:false});
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

// « Affronter un adversaire du laboratoire à la place » : proposé après 40 s
// de recherche infructueuse. On sort proprement du salon d'attente et on
// repart sur le parcours hors ligne avec la MÊME armée, déjà sélectionnée.
//
// L'adversaire retenu est celui dont l'ELO est le plus proche du joueur, et
// non l'Instructeur à 2000 : on vient d'échouer à trouver quelqu'un à sa
// mesure, le remplaçant doit précisément l'être. La partie est classée comme
// n'importe quelle autre.
document.getElementById('mp-fallback-btn')?.addEventListener('click',()=>{
  mpLeave();
  mpCloseModal();
  if(!currentArmyData)return;
  // advNextFoe() (js/adversaires.js) : l'adversaire du laboratoire le plus
  // proche de notre niveau, exactement le critère qu'on vient d'échouer à
  // satisfaire côté humain.
  if(typeof aiSetOpponent==='function'&&typeof advNextFoe==='function')aiSetOpponent(advNextFoe().id);
  aiArmyData=(typeof aiArmyForOpponent==='function')?aiArmyForOpponent()
    :((typeof generateAIArmy==='function')?generateAIArmy():null);
  if(typeof vvSetOpponentElo==='function')vvSetOpponentElo(null);
  if(typeof renderCombatPage==='function')renderCombatPage(currentArmyData,'ia');
  if(typeof showPage==='function')showPage('page-combat');
  if(typeof launchParticles==='function')launchParticles();
});

// ----------------------------------------------------------------
// MODAL : écran de choix → écran hôte (code) ou écran invité (saisie)
// ----------------------------------------------------------------
function mpShowScreen(name){
  ['choice','quick','host','join'].forEach(s=>{
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
  mpShowScreen('choice');
  mpStatus('');
  if(!mpIsConfigured())mpStatus('Multijoueur pas encore configuré : renseignez l\'URL de votre projet Supabase (Settings > API > Project URL) dans js/multiplayer.js.','err');
  document.getElementById('mp-modal').classList.add('show');
}

document.getElementById('mp-quick-btn')?.addEventListener('click',()=>{
  if(!mpIsConfigured())return;
  mpShowScreen('quick');
  mpQuickPlay();
});

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
