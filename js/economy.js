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
// FILET DE SÉCURITÉ : une victoire donne un coffre, dont la rareté suit la
// SÉRIE de victoires (1re = Pion ... 6e et plus = Roi) ; une défaite remet la
// série à zéro. Et une fois par jour, le coffre de réapprovisionnement rend
// 4 exemplaires de chaque pièce possédée, ce qui rend impossible de rester
// bloqué sans armée jouable.
//
// Dépendances : data-pieces.js (PIECES, CHESTS, DAILY_CHEST, chestForStreak),
// accounts.js (accGet/accSet, VV_UNLOCKED, vvSaveUnlocked).
// Utilisé par : game-flow.js et tournoi.js (engagement/règlement),
// armies.js et builder.js (armée jouable ou non), economy-ui.js (affichage).
// ================================================================

// Pièces fournies gratuitement à chaque partie : elles ne sont ni possédées,
// ni perdues, ni gagnées.
const FREE_PIECE_IDS=new Set(['std-pawn','std-r','std-n','std-b']);
function isOwnablePiece(id){return !!id&&!FREE_PIECE_IDS.has(id)&&!!PIECES.find(p=>p.id===id);}

// Quantité d'exemplaires qu'une pièce mobilise dans une armée. buildGameBoard
// place la pièce à sa colonne PUIS son miroir (7-col) si qty>=2, d'où 2.
function pieceDeployCount(pieceId){
  const p=PIECES.find(x=>x.id===pieceId);
  if(!p)return 1;
  return (p.qty>=2)?2:1;
}

// ----------------------------------------------------------------
// INVENTAIRE
// ----------------------------------------------------------------
function invAll(){return accGet('inventory',{})||{};}
function invSaveAll(o){accSet('inventory',o);}
function invCount(id){const n=invAll()[id];return typeof n==='number'?n:0;}
function invAdd(id,n){
  if(!isOwnablePiece(id)||!n)return;
  const inv=invAll();
  inv[id]=Math.max(0,(inv[id]||0)+n);
  invSaveAll(inv);
}
function invAddMany(map){
  const inv=invAll();
  Object.entries(map||{}).forEach(([id,n])=>{
    if(!isOwnablePiece(id)||!n)return;
    inv[id]=Math.max(0,(inv[id]||0)+n);
  });
  invSaveAll(inv);
}

// « Possédée » = débloquée sur la Voie ou déjà présente en stock. Une pièce
// débloquée mais tombée à 0 exemplaire reste possédée : c'est elle que le
// coffre quotidien réapprovisionne, sinon la perdre serait définitif.
function invOwnedIds(){
  const ids=new Set();
  (VV_UNLOCKED||new Set()).forEach(id=>{if(isOwnablePiece(id))ids.add(id);});
  Object.entries(invAll()).forEach(([id,n])=>{if(n>0&&isOwnablePiece(id))ids.add(id);});
  return [...ids];
}

// Dotation d'un compte neuf : de quoi jouer une vingtaine de parties sans
// dépendre du hasard des coffres.
const STARTER_STOCK=10;
function invEnsureStarter(){
  const inv=invAll();
  let changed=false;
  (VV_UNLOCKED||new Set()).forEach(id=>{
    if(!isOwnablePiece(id))return;
    if(inv[id]===undefined){inv[id]=STARTER_STOCK;changed=true;}
  });
  if(changed)invSaveAll(inv);
}

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
// Les exemplaires sortent de l'inventaire AU LANCEMENT et pas à la fin :
// recharger la page en cours de partie ne permet donc pas d'annuler une
// défaite imminente. L'engagement en cours est mémorisé pour pouvoir être
// réglé même si la partie est interrompue.
const ENGAGED_KEY='engaged_now';

function economyCommit(armyData){
  const need=armyRequirements(armyData);
  const inv=invAll();
  Object.entries(need).forEach(([id,n])=>{inv[id]=Math.max(0,(inv[id]||0)-n);});
  invSaveAll(inv);
  accSet(ENGAGED_KEY,{need,at:Date.now()});
  return need;
}

// Partie interrompue (fermeture de l'onglet, plantage) : les pièces engagées
// dormaient hors inventaire. On les rend au joueur, une interruption n'est
// pas une défaite.
function economyRecoverOrphanEngagement(){
  const rec=accGet(ENGAGED_KEY,null);
  if(!rec||!rec.need)return null;
  invAddMany(rec.need);
  accSet(ENGAGED_KEY,null);
  return rec.need;
}

// Compte les exemplaires du joueur encore sur le plateau à la fin.
function countSurvivors(gs){
  const out={};
  const col=gs.playerColor||'w';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=gs.board?.[r]?.[c];
    if(!p||p.color!==col)continue;
    if(!isOwnablePiece(p.pieceId))continue;
    out[p.pieceId]=(out[p.pieceId]||0)+1;
  }
  return out;
}

// Promotion : la pièce choisie est CRÉÉE, elle n'a pas été prélevée sur
// l'inventaire. On la crédite tout de suite, et on ne la comptera pas parmi
// les survivants (voir le plafonnement par `need` dans economySettle).
//
// N'est appelée que depuis showPromoModal() (rules-engine.js), c'est-à-dire
// uniquement pour la promotion du JOUEUR LOCAL : celles de l'IA et celles
// d'un adversaire en ligne suivent d'autres branches et ne créditent rien.
function economyOnPromotion(pieceId,gs){
  if(!isOwnablePiece(pieceId))return;
  invAdd(pieceId,1);
  if(gs){gs.promoGains=gs.promoGains||{};gs.promoGains[pieceId]=(gs.promoGains[pieceId]||0)+1;}
}

// Règlement complet. Renvoie un rapport affiché par la cinématique de fin
// (economy-ui.js) : ce qui a été perdu, ce qui rentre, la série et le coffre.
function economySettle(result,gs){
  const rec=accGet(ENGAGED_KEY,null);
  const need=(rec&&rec.need)||{};
  accSet(ENGAGED_KEY,null);

  const survivors=countSurvivors(gs||{});
  const returned={},lost={};
  Object.entries(need).forEach(([id,n])=>{
    // Plafonné à `n` : un pion promu en Dame ne fait pas rentrer une Dame de
    // plus que ce qui avait été engagé, il a déjà été crédité à la promotion.
    const back=(result==='loss')?0:Math.min(survivors[id]||0,n);
    if(back>0)returned[id]=back;
    if(n-back>0)lost[id]=n-back;
  });
  invAddMany(returned);

  // Série de victoires et coffre associé.
  let streak=accGet('win_streak',0);
  let chest=null;
  if(result==='win'){
    streak=streak+1;
    chest=chestForStreak(streak);
    chestGrant(chest.id);
  }else if(result==='loss'){
    streak=0;
  }
  accSet('win_streak',streak);

  return{result,lost,returned,gained:(gs&&gs.promoGains)||{},streak,chest};
}

// ----------------------------------------------------------------
// COFFRES
// ----------------------------------------------------------------
// Les coffres gagnés sont mis en attente : le joueur les ouvre quand il veut
// depuis la Réserve, ce qui permet une vraie petite cérémonie d'ouverture
// plutôt qu'une ligne de texte au milieu du modal de fin de partie.
function chestsPending(){return accGet('chests_pending',[])||[];}
function chestGrant(chestId){
  const list=chestsPending();
  list.push({id:chestId,at:Date.now()});
  accSet('chests_pending',list.slice(-60));
}
function chestConsume(index){
  const list=chestsPending();
  if(index<0||index>=list.length)return null;
  const [c]=list.splice(index,1);
  accSet('chests_pending',list);
  return c;
}

// Poids de tirage : l'inverse de la valeur de la pièce, tempéré par le biais
// du coffre. Un Coffre Pion (bias 0.55) tire presque toujours des pièces à
// 2-3 points ; un Coffre Roi (bias 3.2) sort régulièrement du Grand Maître.
function pieceRarityWeight(id,bias){
  const p=PIECES.find(x=>x.id===id);
  const v=Math.max(1,(p&&p.value)||3);
  return Math.pow(1/v,1.7/Math.max(0.2,bias));
}
function weightedPick(ids,bias){
  if(!ids.length)return null;
  const w=ids.map(id=>pieceRarityWeight(id,bias));
  const total=w.reduce((a,b)=>a+b,0);
  let r=Math.random()*total;
  for(let i=0;i<ids.length;i++){r-=w[i];if(r<=0)return ids[i];}
  return ids[ids.length-1];
}
function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}

// Tire le contenu d'un coffre SANS l'appliquer : l'animation d'ouverture
// révèle les lots un par un, l'inventaire n'est crédité qu'ensuite
// (chestApply), pour que ce qui est affiché soit exactement ce qui est reçu.
function chestRoll(chestId){
  const chest=chestById(chestId);
  const owned=invOwnedIds();
  const locked=PIECES.map(p=>p.id).filter(id=>isOwnablePiece(id)&&!(VV_UNLOCKED&&VV_UNLOCKED.has(id)));
  const lots=[];

  if(locked.length&&Math.random()<chest.newChance){
    const pick=weightedPick(locked,chest.bias);
    if(pick)lots.push({pieceId:pick,qty:Math.max(2,Math.round(chest.qty[0])),isNew:true});
  }
  const pool=owned.length?owned:PIECES.filter(p=>p.value<=3).map(p=>p.id);
  for(let i=0;i<chest.rolls;i++){
    const pick=weightedPick(pool,chest.bias);
    if(!pick)continue;
    lots.push({pieceId:pick,qty:randInt(chest.qty[0],chest.qty[1]),isNew:false});
  }
  // Fusion des doublons : deux lots de Méduse s'affichent en un seul.
  const merged=[];
  lots.forEach(l=>{
    const ex=merged.find(m=>m.pieceId===l.pieceId);
    if(ex){ex.qty+=l.qty;ex.isNew=ex.isNew||l.isNew;}else merged.push({...l});
  });
  return merged;
}

function chestApply(lots){
  const add={};
  (lots||[]).forEach(l=>{
    add[l.pieceId]=(add[l.pieceId]||0)+l.qty;
    if(l.isNew&&VV_UNLOCKED&&!VV_UNLOCKED.has(l.pieceId)){
      VV_UNLOCKED.add(l.pieceId);
      if(typeof vvSaveUnlocked==='function')vvSaveUnlocked(VV_UNLOCKED);
    }
  });
  invAddMany(add);
}

// ----------------------------------------------------------------
// COFFRE DE RÉAPPROVISIONNEMENT QUOTIDIEN
// ----------------------------------------------------------------
// Clé de jour en heure locale : le joueur voit son coffre revenir à minuit
// chez lui, pas à une heure arbitraire.
function todayKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dailyChestAvailable(){return accGet('daily_last',null)!==todayKey();}
function dailyChestPreview(){
  const gains={};
  invOwnedIds().forEach(id=>{gains[id]=DAILY_CHEST.perPiece;});
  return gains;
}
function claimDailyChest(){
  if(!dailyChestAvailable())return null;
  const gains=dailyChestPreview();
  invAddMany(gains);
  accSet('daily_last',todayKey());
  return gains;
}

// Heures restantes avant le prochain coffre quotidien (affichage Réserve).
function dailyChestCountdown(){
  const now=new Date();
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0);
  const ms=next-now;
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);
  return h+' h '+String(m).padStart(2,'0');
}
