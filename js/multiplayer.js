// ================================================================
// MULTIPLAYER.JS : Prototype minimal de synchronisation temps réel
// via Supabase Realtime (broadcast + presence), sans base de données.
// ================================================================
// Étape 1 du plan multijoueur : valider que deux navigateurs peuvent
// se connecter à un même "salon" (room code) et synchroniser leurs
// coups en direct. Pas de matchmaking, pas de persistance, pas de
// revalidation anti-triche : tout ça viendra aux étapes suivantes.
//
// AVANT DE TESTER : remplissez SUPABASE_URL et SUPABASE_ANON_KEY
// ci-dessous avec les valeurs de votre projet (Settings > API sur
// supabase.com). Ces clés publiques ("anon") sont faites pour être
// exposées côté client.
// ================================================================

const SUPABASE_URL='https://VOTRE-PROJET.supabase.co';
const SUPABASE_ANON_KEY='VOTRE_CLE_ANON_PUBLIQUE';

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
};

function mpLog(msg){
  const el=document.getElementById('mp-status');
  if(el)el.textContent=msg;
  console.log('[MP]',msg);
}

function mpInitClient(){
  if(MP.client)return MP.client;
  if(typeof supabase==='undefined'){
    mpLog('Erreur : le SDK Supabase n\'est pas chargé (vérifiez le <script> dans index.html).');
    return null;
  }
  MP.client=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  return MP.client;
}

// ----------------------------------------------------------------
// CONNEXION AU SALON : host = Blancs, invité = Noirs (choix simple
// et déterministe pour ce prototype).
// ----------------------------------------------------------------
function mpConnect(code,asHost){
  if(!currentArmyData){mpLog('Choisissez d\'abord votre armée avant de rejoindre un salon.');return;}
  const client=mpInitClient();if(!client)return;
  MP.roomCode=code;MP.isHost=asHost;MP.myColor=asHost?'w':'b';MP.myArmy=currentArmyData;MP.started=false;

  MP.channel=client.channel('epichess-room-'+code,{config:{presence:{key:MP.myId}}});

  MP.channel.on('broadcast',{event:'army'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    MP.oppArmy=payload.army;
    mpLog('Armée adverse reçue, préparation de la partie...');
    mpTryStart();
  });

  MP.channel.on('broadcast',{event:'move'},({payload})=>{
    if(payload.senderId===MP.myId)return;
    mpApplyRemoteMove(payload.from,payload.to);
  });

  MP.channel.on('presence',{event:'sync'},()=>{
    const state=MP.channel.presenceState();
    const count=Object.keys(state).length;
    if(count>=2){
      mpLog('Adversaire connecté, échange des armées...');
      MP.channel.send({type:'broadcast',event:'army',payload:{senderId:MP.myId,army:MP.myArmy}});
    }
  });

  MP.channel.subscribe(async(status)=>{
    if(status==='SUBSCRIBED'){
      mpLog(asHost?'Salon créé, en attente d\'un adversaire...':'Connexion au salon...');
      await MP.channel.track({joinedAt:Date.now()});
    }
  });
}

function mpTryStart(){
  if(MP.started)return;
  if(!MP.oppArmy)return;
  MP.started=true;
  currentArmyData=MP.myArmy;
  aiArmyData=MP.oppArmy;
  _playerColor=MP.myColor;
  startGame(true,true);
  mpCloseModal();
}

// ----------------------------------------------------------------
// APPLICATION D'UN COUP REÇU : rejoue le même coup côté distant sur
// notre propre plateau. On suppose les deux plateaux synchronisés
// (aucune revalidation stricte à ce stade du prototype).
// ----------------------------------------------------------------
let _mpApplyingRemote=false;
function mpApplyRemoteMove(from,to){
  if(!GS||!GS.multiplayer)return;
  _mpApplyingRemote=true;
  GS.lastMove={from,to,capture:!!GS.board[to.r][to.c]};
  executeGameMove(from,to,GS);
  _mpApplyingRemote=false;
}

// ----------------------------------------------------------------
// ENVOI D'UN COUP : on intercepte executeGameMove (défini dans
// rules-engine.js). Seuls les coups joués localement (pas ceux qu'on
// vient d'appliquer depuis le réseau) sont rediffusés.
// ----------------------------------------------------------------
const _executeGameMoveOriginal=executeGameMove;
executeGameMove=function(from,to,gs){
  const shouldBroadcast=gs&&gs.multiplayer&&!_mpApplyingRemote;
  _executeGameMoveOriginal(from,to,gs);
  if(shouldBroadcast&&MP.channel){
    MP.channel.send({type:'broadcast',event:'move',payload:{senderId:MP.myId,from,to}});
  }
};

// ----------------------------------------------------------------
// UI MINIMALE : bouton flottant + petite modale (créés dynamiquement
// pour ne pas toucher au HTML existant à ce stade du prototype).
// ----------------------------------------------------------------
function mpCloseModal(){
  document.getElementById('mp-modal')?.remove();
}

function mpOpenModal(){
  mpCloseModal();
  const modal=document.createElement('div');
  modal.id='mp-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML=`
    <div style="background:#1a1a1a;color:#eee;padding:24px;border-radius:12px;width:280px;font-family:sans-serif;">
      <h3 style="margin:0 0 12px;">Multijoueur (prototype)</h3>
      <p style="font-size:12px;opacity:.7;margin:0 0 12px;">Choisissez d'abord votre armée, puis créez ou rejoignez un salon avec le même code sur les deux navigateurs.</p>
      <input id="mp-room-input" placeholder="Code du salon" style="width:100%;padding:8px;margin-bottom:10px;box-sizing:border-box;">
      <div style="display:flex;gap:8px;">
        <button id="mp-create-btn" style="flex:1;padding:8px;">Créer</button>
        <button id="mp-join-btn" style="flex:1;padding:8px;">Rejoindre</button>
      </div>
      <p id="mp-status" style="font-size:12px;margin-top:10px;min-height:16px;"></p>
      <button id="mp-close-btn" style="margin-top:6px;width:100%;padding:6px;">Fermer</button>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('mp-create-btn').addEventListener('click',()=>{
    const code=document.getElementById('mp-room-input').value.trim();
    if(!code){mpLog('Entrez un code de salon.');return;}
    mpConnect(code,true);
  });
  document.getElementById('mp-join-btn').addEventListener('click',()=>{
    const code=document.getElementById('mp-room-input').value.trim();
    if(!code){mpLog('Entrez un code de salon.');return;}
    mpConnect(code,false);
  });
  document.getElementById('mp-close-btn').addEventListener('click',mpCloseModal);
}

function mpInjectFloatingButton(){
  const btn=document.createElement('button');
  btn.textContent='🌐 Multijoueur (bêta)';
  btn.style.cssText='position:fixed;bottom:16px;right:16px;z-index:9998;padding:10px 14px;border-radius:8px;background:#2a5;color:#fff;border:none;cursor:pointer;';
  btn.addEventListener('click',mpOpenModal);
  document.body.appendChild(btn);
}
document.addEventListener('DOMContentLoaded',mpInjectFloatingButton);
