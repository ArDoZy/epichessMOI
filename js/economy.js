// ================================================================
// ECONOMY.JS : possession des pièces, mise en jeu, coffres, séries
// ================================================================
// LA RÈGLE, EN UNE PHRASE : on ne joue que les pièces qu'on possède, et les
// jouer c'est les risquer.
//
//   - Composer une armée réserve des exemplaires : 1 Monarque, 1 Général, et
//     2 exemplaires de chaque créature qui se déploie en paire (qty>=2).
//   - Au lancement de la partie, ces exemplaires QUITTENT l'inventaire : ils
//     sont sur le terrain (economyCommit).
//   - Défaite : tout ce qui était engagé est perdu.
//   - Victoire ou nulle : seuls les exemplaires CAPTURÉS sont perdus, les
//     survivants rentrent à l'inventaire.
//   - Une promotion de pion ajoute immédiatement 1 exemplaire de la pièce
//     choisie : c'est une création, elle n'était pas engagée, donc elle n'est
//     jamais reperdue par le décompte des survivants.
//
// Les pions, tours, cavaliers et fous « standard » qui complètent le plateau
// ne se possèdent pas : ils sont fournis à chaque partie. Sans cela, une
// partie perdue coûterait huit pions et le jeu deviendrait injouable.
//
// FILET DE SÉCURITÉ : une victoire fait avancer la COLONNE DES VICTOIRES
// (js/rewards.js), qui donne un coffre ou des jokers à chaque palier et ne se
// referme jamais ; la RÉCOMPENSE JOURNALIÈRE (même fichier) en donne un lot par
// jour, sans rien exiger. Et une fois par jour, le coffre de
// réapprovisionnement rend des exemplaires de chaque pièce possédée dont le
// stock est bas (DAILY_CHEST), ce qui rend impossible de rester bloqué sans
// armée jouable.
//
// LA « SÉRIE DU JOUR » N'EXISTE PLUS. Une victoire donnait un coffre dont la
// rareté suivait la série (1re = Pion … 6e = Roi), et une défaite refermait la
// série jusqu'au lendemain : elle ne donnait rien à qui passe faire une
// partie, et punissait qui en fait dix. `win_streak` survit comme simple
// statistique (« Meilleure série » sur la fiche de compte).
//
// Dépendances : data-pieces.js (PIECES, CHESTS, DAILY_CHEST),
// accounts.js (accGet/accSet, VV_UNLOCKED, vvSaveUnlocked).
// Utilisé par : game-flow.js (engagement/règlement),
// armies.js et builder.js (armée jouable ou non), economy-ui.js (affichage).
// ================================================================

// Pièces fournies gratuitement à chaque partie : elles ne sont ni possédées,
// ni perdues, ni gagnées.
const FREE_PIECE_IDS=new Set(['std-r','std-n','std-b',...TRUE_PAWN_IDS]);
function isOwnablePiece(id){return !!id&&!FREE_PIECE_IDS.has(id)&&!!PIECES.find(p=>p.id===id);}

// Quantité d'exemplaires qu'une pièce mobilise dans une armée. buildGameBoard
// place la pièce à sa colonne PUIS son miroir (7-col) si qty>=2, d'où 2.
function pieceDeployCount(pieceId){
  const p=PIECES.find(x=>x.id===pieceId);
  if(!p)return 1;
  return (p.qty>=2)?2:1;
}

// ----------------------------------------------------------------
// MODE TEST (/?test) : un bac à sable, pas une avance sur la progression
// ----------------------------------------------------------------
// En mode test, le joueur a TOUT : chaque pièce en quantité illimitée, 10 000
// ELO (voir vvLoadElo dans js/accounts.js) et des perles sans fond. Rien n'y
// est écrit sur le compte : ni inventaire, ni perles, ni déblocages, ni ELO.
// C'est la seule façon d'essayer une composition d'armée sans laisser de trace
// sur la partie sérieuse — et c'est aussi pour ça que les parties jouées là
// ne sont pas classées (voir vvNoEloReason, js/voie.js).
function economyAdmin(){return typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE;}
const ADMIN_STOCK=999;
const ADMIN_PEARLS=999999;

// ----------------------------------------------------------------
// INVENTAIRE
// ----------------------------------------------------------------
function invAll(){
  if(economyAdmin()){
    const o={};PIECES.forEach(p=>{if(isOwnablePiece(p.id))o[p.id]=ADMIN_STOCK;});return o;
  }
  return accGet('inventory',{})||{};
}
// L'INVENTAIRE NE S'ÉCRIT PLUS ICI. Il vit dans la fiche du serveur, qui
// seul l'augmente (coffres, jokers, promotions…) ou le diminue (pièces
// engagées) : voir ec_eco et ec_match_* dans supabase/schema.sql. Le jeu le
// lit, et adopte ce que le serveur lui renvoie (ecAdoptState, js/server.js).
function invCount(id){const n=invAll()[id];return typeof n==='number'?n:0;}

// « Possédée » = débloquée sur la Voie ou déjà présente en stock. Une pièce
// débloquée mais tombée à 0 exemplaire reste possédée : c'est elle que le
// coffre quotidien réapprovisionne, sinon la perdre serait définitif.
function invOwnedIds(){
  const ids=new Set();
  (VV_UNLOCKED||new Set()).forEach(id=>{if(isOwnablePiece(id))ids.add(id);});
  Object.entries(invAll()).forEach(([id,n])=>{if(n>0&&isOwnablePiece(id))ids.add(id);});
  return [...ids];
}

// LA DOTATION DE DÉPART (6 exemplaires de chaque pièce débloquée sans stock)
// est versée par le serveur à la connexion (ec_eco_init) : STARTER_STOCK ne
// sert plus qu'au catalogue qu'il recopie (tools/gen-catalogue.js).
const STARTER_STOCK=6;

// ----------------------------------------------------------------
// ARMÉE JOUABLE OU NON
// ----------------------------------------------------------------
// Renvoie {pieceId: nombre d'exemplaires mobilisés} pour une armée
// sauvegardée (armies.js) comme pour l'armée en cours de composition.
function armyRequirements(armyData){
  const need={};
  if(!armyData)return need;
  const add=(id,n)=>{if(isOwnablePiece(id))need[id]=(need[id]||0)+n;};
  const monId=armyData.mon?.id||armyData.mon;
  const genId=armyData.gen?.id||armyData.gen;
  add(monId,1);add(genId,1);
  (armyData.extras||[]).forEach(e=>{
    const id=e&&e.id?e.id:e;
    add(id,pieceDeployCount(id));
  });
  return need;
}

// {ok, missing:[{id,name,need,have}]} : utilisé pour griser une armée
// injouable plutôt que de laisser le joueur lancer un combat qui échouerait.
function armyStock(armyData){
  const need=armyRequirements(armyData);
  const missing=[];
  Object.entries(need).forEach(([id,n])=>{
    const have=invCount(id);
    if(have<n)missing.push({id,name:(PIECES.find(p=>p.id===id)||{}).name||id,need:n,have});
  });
  return{ok:missing.length===0,missing,need};
}

// ----------------------------------------------------------------
// ENGAGEMENT ET RÈGLEMENT D'UNE PARTIE
// ----------------------------------------------------------------
// LE SERVEUR ENGAGE ET RÈGLE. Les exemplaires quittent l'inventaire à
// l'ouverture du billet (ec_match_begin) et ce qui survit y rentre à son
// règlement (ec_match_apply). Une partie interrompue n'est plus rendue : un
// billet resté ouvert est un abandon, c'est-à-dire une défaite — sinon
// recharger la page aurait suffi à effacer une défaite qui s'annonçait.
//
// Ce qui reste ici ne fait qu'APERCEVOIR le règlement, pour la cinématique
// de fin de partie qui le montre avant que le serveur n'ait répondu : le
// calcul est le même, et ce que le serveur renvoie le remplace ensuite.

// Compte les exemplaires du joueur encore sur le plateau à la fin. C'est ce
// que le rapport de partie déclare (`survivors`) ; le serveur le borne par ce
// qui avait été engagé.
function countSurvivors(gs){
  const out={};
  const col=gs.playerColor||'w';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=gs.board?.[r]?.[c];
    if(!p||p.color!==col)continue;
    if(!isOwnablePiece(p.pieceId))continue;
    // Une créature relevée par la Matriarche n'a jamais été engagée : elle ne
    // rentre pas à l'inventaire à la place d'une vraie survivante.
    if(p.id&&String(p.id).startsWith('rv-'))continue;
    out[p.pieceId]=(out[p.pieceId]||0)+1;
  }
  return out;
}

// Promotion : la pièce choisie est CRÉÉE. Elle est notée sur la partie
// (`promoGains`, `promos`) et déclarée au rapport ; c'est le serveur qui
// crédite l'exemplaire, borné aux pièces de l'armée. N'est appelée que pour
// la promotion du JOUEUR LOCAL (showPromoModal, js/rules-engine.js).
function economyOnPromotion(pieceId,gs){
  if(gs&&gs.tuto)return;
  if(!isOwnablePiece(pieceId))return;
  if(gs){
    gs.promoGains=gs.promoGains||{};gs.promoGains[pieceId]=(gs.promoGains[pieceId]||0)+1;
    (gs.promos=gs.promos||[]).push(pieceId);
  }
  // Quêtes de la rangée de la richesse (js/rewards.js) : « promouvoir un pion
  // en X », et « promouvoir 2 pions » quelle que soit la pièce choisie.
  if(typeof questNote==='function')questNote('promo',pieceId,1);
}

// Ce qui était engagé dans la partie : ce que le serveur a retiré à
// l'ouverture (GS.engaged), à défaut ce que l'armée mobilise.
function economyEngaged(gs){
  if(gs&&gs.engaged&&typeof gs.engaged==='object')return gs.engaged;
  return armyRequirements(typeof currentArmyData!=='undefined'?currentArmyData:null);
}

// APERÇU du règlement (même calcul que ec_match_apply). Renvoie le rapport
// que la cinématique de fin affiche : ce qui est perdu, ce qui rentre, la
// série, les lauriers.
function economySettle(result,gs){
  const need=economyEngaged(gs);
  const survivors=countSurvivors(gs||{});
  const returned={},lost={};
  Object.entries(need).forEach(([id,n])=>{
    const back=(result==='loss')?0:Math.min(survivors[id]||0,n);
    if(back>0)returned[id]=back;
    if(n-back>0)lost[id]=n-back;
  });
  let streak=accGet('win_streak',0);
  if(result==='win')streak=streak+1;
  else if(result==='loss')streak=0;
  const laurels=(result==='win'&&typeof colNoteWin==='function')?colNoteWin(gs):null;
  return{result,lost,returned,gained:(gs&&gs.promoGains)||{},streak,laurels};
}

// ----------------------------------------------------------------
// COFFRES
// ----------------------------------------------------------------
// LE TIRAGE EST AU SERVEUR (ec_chest_open, supabase/schema.sql ; sa
// transcription pour le bac à sable est ecoChestOpen, js/eco-rules.js). Il
// se faisait ici, par Math.random : n'importe quelle console pouvait tirer
// jusqu'à obtenir le Grand Maître. Le jeu demande un coffre (ecEco), reçoit
// ses lots déjà crédités, et n'en joue que la cérémonie.
//
// La probabilité qu'un lot soit un BON lot (tirage nettement plus favorable
// aux pièces chères), déduite de la probabilité de pièce inédite : le
// tableau des taux du Magasin l'affiche.
function chestLuckyChance(chest){
  return Math.max(0.1,Math.min(0.75,0.22+chest.tier*0.09-chest.newChance*0.5));
}

// ----------------------------------------------------------------
// PERLES : la monnaie qui sort des coffres et qui rachète des coffres
// ----------------------------------------------------------------
// En mode test, la bourse est sans fond. L'affichage montre « ∞ ».
function pearlInfinite(){return economyAdmin();}
function pearlBalance(){
  if(pearlInfinite())return ADMIN_PEARLS;
  const n=accGet('pearls',0);return typeof n==='number'?Math.max(0,n):0;
}

// L'ARÈNE DU JOUEUR : le rang de son SOMMET atteint (vvLoadPeakElo), jamais
// celui du classement du jour — une arène ouverte ne se referme pas. En mode
// test tout est ouvert.
function playerArenaIdx(){
  if(economyAdmin())return RANKS.length-1;
  const peak=(typeof vvLoadPeakElo==='function')?vvLoadPeakElo():0;
  return (typeof vvGetRankIdx==='function')?vvGetRankIdx(peak):0;
}
// Les créatures qu'un coffre peut faire DÉCOUVRIR maintenant : pas encore
// obtenues, et dont l'arène est ouverte (PIECE_ARENA, js/data-pieces.js).
function chestLockedPool(){
  const arena=playerArenaIdx();
  return PIECES.map(p=>p.id).filter(id=>isOwnablePiece(id)&&!(VV_UNLOCKED&&VV_UNLOCKED.has(id))
    &&pieceArenaIdx(id)<=arena);
}

// ----------------------------------------------------------------
// LES POUVOIRS ET LEURS DÉBRIS MAGIQUES
// ----------------------------------------------------------------
// Une créature s'obtient d'abord, son pouvoir ensuite (voir « LES POUVOIRS »,
// js/data-pieces.js). Deux clés de compte :
//   debris           {pieceId: n} — les débris ramassés, pouvoir par pouvoir
//   unlocked_powers  [pieceId]    — les pouvoirs éveillés, POUR TOUJOURS : rien
//                                   dans le jeu ne retire une entrée de cette
//                                   liste, ni une défaite, ni un stock à zéro.
// L'éveil n'est pas automatique : à huit débris, la fiche de la pièce propose
// « Éveiller le pouvoir » (js/piece-card.js). C'est un geste, pas un compteur
// qui déborde en silence.
function powersUnlockedSet(){
  if(economyAdmin())return new Set(PIECES.filter(p=>p.ability).map(p=>p.id));
  return new Set(accGet('unlocked_powers',[])||[]);
}
function powerUnlocked(id){return !pieceHasPower(id)||powersUnlockedSet().has(id);}
function debrisAll(){return accGet('debris',{})||{};}
function debrisCount(id){
  if(economyAdmin())return POWER_DEBRIS_NEEDED;
  const n=debrisAll()[id];return typeof n==='number'?n:0;
}
function powerCanAwaken(id){
  return pieceHasPower(id)&&!powerUnlocked(id)&&debrisCount(id)>=POWER_DEBRIS_NEEDED
    &&!!(VV_UNLOCKED&&VV_UNLOCKED.has(id));
}
// Éveille le pouvoir : huit débris dépensés, le pouvoir inscrit pour
// toujours. C'est le serveur qui le fait (ec_eco 'awaken') ; la promesse
// rend true une fois le pouvoir éveillé.
function powerAwaken(id){
  if(!powerCanAwaken(id))return Promise.resolve(false);
  return ecEco('awaken',{piece:id}).then(()=>true);
}
// La liste emportée par une armée au lancement d'une partie (voir
// armyPowerSet, js/data-pieces.js).
function playerPowerList(){return [...powersUnlockedSet()];}
// Une armée prête à partir, avec ses pouvoirs. On ne touche pas à l'armée
// enregistrée : c'est une copie, faite au lancement.
function armyWithPowers(army,list){
  if(!army)return army;
  return{...army,powers:(list||playerPowerList()).slice()};
}

// ----------------------------------------------------------------
// COFFRE DE RÉAPPROVISIONNEMENT QUOTIDIEN
// ----------------------------------------------------------------
// LE JOUR DU JEU EST CELUI DE PARIS, pour tout le monde : c'est le serveur
// qui dit quand une journée commence (ec_today), et une horloge locale se
// règle d'un clic. Le coffre quotidien, la récompense journalière et les
// quêtes basculent ensemble à minuit, heure de Paris.
function todayKey(){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  catch(e){return new Date().toISOString().slice(0,10);}
}
function dailyChestAvailable(){return accGet('daily_last',null)!==todayKey();}

// Ce que le coffre de réapprovisionnement verserait MAINTENANT. Il ne remplit
// que ce qui manque : une pièce déjà pourvue (au moins DAILY_CHEST.cap
// exemplaires) ne reçoit rien. Le versement, lui, est fait par le serveur
// (ec_eco 'restock').
function dailyChestPreview(){
  const gains={};
  const cap=DAILY_CHEST.cap||Infinity;
  invOwnedIds().forEach(id=>{
    const n=Math.min(DAILY_CHEST.perPiece,cap-invCount(id));
    if(n>0)gains[id]=n;
  });
  return gains;
}
// Promesse des gains réellement versés par le serveur.
function claimDailyChest(){
  if(!dailyChestAvailable())return Promise.resolve(null);
  return ecEco('restock').then(r=>r.gains||{});
}

// Heures restantes avant le prochain coffre quotidien (affichage Guerre des clans).
function dailyChestCountdown(){
  // Jusqu'à minuit à Paris (voir todayKey).
  const now=new Date();
  let ms;
  try{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
      .formatToParts(now).reduce((o,x)=>{o[x.type]=+x.value;return o;},{});
    ms=((23-(parts.hour%24))*3600+(59-parts.minute)*60+(60-parts.second))*1000;
  }catch(e){
    const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0);ms=next-now;
  }
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);
  return h+' h '+String(m).padStart(2,'0');
}
