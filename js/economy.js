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
// SÉRIE de victoires (1re = Pion ... 6e = Roi, et RIEN au-delà : la série du
// jour est alors terminée) ; une défaite remet la série à zéro et la ferme
// jusqu'au lendemain, où elle repart du Coffre Pion. Les victoires que la
// série ne récompense plus font avancer la COLONNE DES VICTOIRES
// (js/rewards.js), qui n'a pas de limite quotidienne. Et une fois par jour, le
// coffre de réapprovisionnement rend des exemplaires de chaque pièce possédée
// (DAILY_CHEST.perPiece), ce qui rend impossible de rester bloqué sans armée
// jouable.
//
// Dépendances : data-pieces.js (PIECES, CHESTS, DAILY_CHEST, chestForStreak),
// accounts.js (accGet/accSet, VV_UNLOCKED, vvSaveUnlocked).
// Utilisé par : game-flow.js (engagement/règlement),
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
function invSaveAll(o){if(economyAdmin())return;accSet('inventory',o);}
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
  if(economyAdmin())return;   // tout est déjà à ADMIN_STOCK, et rien ne s'écrit
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
  // Bataille du tutoriel : les pièces sont prêtées, promouvoir un pion ne
  // crédite donc rien (sinon on remplirait son Armurerie avant même d'avoir
  // débloqué la pièce).
  if(gs&&gs.tuto)return;
  if(!isOwnablePiece(pieceId))return;
  invAdd(pieceId,1);
  if(gs){gs.promoGains=gs.promoGains||{};gs.promoGains[pieceId]=(gs.promoGains[pieceId]||0)+1;}
  // Quêtes de la rangée de la richesse (js/rewards.js) : « promouvoir un pion
  // en X », et « promouvoir 2 pions » quelle que soit la pièce choisie.
  if(typeof questNote==='function')questNote('promo',pieceId,1);
}

// ----------------------------------------------------------------
// LA SÉRIE REPART À ZÉRO CHAQUE JOUR
// ----------------------------------------------------------------
// « Série DU JOUR » : la fenêtre du menu principal l'annonce, le verrou de
// défaite promet qu'« elle repart demain » — et elle ne repartait pas. Rien
// ne remettait `win_streak` à zéro au changement de date : seul le verrou
// expirait tout seul (streakLockedToday compare à la date du jour). Le
// compteur, lui, traversait les jours et les semaines. Passé six victoires
// cumulées, la fenêtre affichait « Série terminée » pour toujours, les six
// paliers marqués acquis, et il n'y avait plus jamais de palier à décrocher :
// la Voie des coffres était finie et ne redémarrait jamais.
//
// `streak_day` est la date de la série en cours. Dès que la date locale
// change, le compteur repart de zéro (et le verrou avec lui) : on retrouve un
// Coffre Pion à la première victoire, un Coffre Roi à la sixième.
function streakEnsureToday(){
  if(accGet('streak_day',null)===todayKey())return;
  accSet('streak_day',todayKey());
  accSet('win_streak',0);
  accSet('streak_lock_day',null);
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
  //
  // LA RARETÉ SUIT LA SÉRIE, ET RIEN D'AUTRE : 1re victoire → Coffre Pion,
  // 6e et au-delà → Coffre Roi, exactement l'échelle que la fenêtre « Série
  // du jour » affiche du haut vers le bas.
  //
  // Il y avait ici un PLAFOND par le palier de l'adversaire battu (champ
  // `tier` de AI_OPPONENTS) : contre Cendre ou Suie (tier 0), tout coffre
  // gagné redescendait au Coffre Pion, quelle que soit la série. Or ce sont
  // précisément les deux adversaires que la galerie conseille à un compte
  // neuf (advNextFoe, js/adversaires.js) : un débutant pouvait enchaîner six
  // victoires et ne jamais voir autre chose qu'un Coffre Pion, pendant que la
  // fenêtre lui promettait le Coffre Roi. Le filet de sécurité ne rattrapait
  // plus personne, et l'échelle affichée était un mensonge.
  //
  // Ce que le plafond protégeait — « farmer » le plus faible pour empiler les
  // Coffres Roi — est déjà tenu par le VERROU QUOTIDIEN juste dessous : il
  // n'y a qu'une série par jour, donc au mieux un Coffre Roi par jour, et il
  // faut six victoires d'affilée pour l'atteindre. Battre un adversaire très
  // en dessous de soi ne rapporte par ailleurs quasiment aucun ELO
  // (vvCalcNewElo, js/voie.js), donc rien de ce qui se débloque par palier.
  //
  // UNE SEULE SÉRIE PAR JOUR (streakLockedToday, plus bas) : une défaite ne
  // remet plus seulement le compteur à zéro, elle ferme aussi la série pour
  // le reste de la journée — les victoires suivantes ne donnent plus de
  // coffre tant que la date locale n'a pas changé. Sans ce verrou, perdre
  // n'était qu'un contretemps qu'une victoire suivante effaçait aussitôt.
  //
  // ET ELLE S'ARRÊTE À SON SIXIÈME COFFRE. chestForStreak renvoie `null`
  // au-delà (js/data-pieces.js) : la septième victoire du jour ne donne plus
  // de Coffre Roi, ni rien d'autre ici. Ce que les victoires suivantes
  // rapportent est dans la COLONNE DES VICTOIRES (colNoteWin, js/rewards.js),
  // qui avance à chaque victoire sans jamais se refermer.
  streakEnsureToday();
  let streak=accGet('win_streak',0);
  let chest=null;
  if(result==='win'){
    if(!streakLockedToday()){
      streak=streak+1;
      chest=chestForStreak(streak);
      // Le coffre n'est pas crédité ici : c'est settleAndCelebrate()
      // (js/economy-ui.js) qui l'ouvre, une fois la cinématique d'issue passée
      // et avant l'écran de résultat.
    }
  }else if(result==='loss'){
    streak=0;
    accSet('streak_lock_day',todayKey());
  }
  accSet('win_streak',streak);

  // LES DEUX AUTRES VOIES (js/rewards.js). La colonne des victoires avance
  // d'un cran à chaque victoire — série du jour terminée ou non, c'est tout
  // son intérêt — et les quêtes de la rangée comptent la victoire et les
  // créatures effectivement engagées dans l'armée. C'est ici, et nulle part
  // ailleurs, parce que c'est le seul point par lequel passe le règlement
  // d'une partie (le tutoriel et le mode test n'y arrivent jamais).
  if(result==='win'){
    if(typeof colNoteWin==='function')colNoteWin();
    if(typeof questNote==='function'){
      questNote('win',null,1);
      Object.keys(need).forEach(id=>questNote('winwith',id,1));
    }
  }

  return{result,lost,returned,gained:(gs&&gs.promoGains)||{},streak,chest};
}

// ----------------------------------------------------------------
// COFFRES
// ----------------------------------------------------------------
// IL N'Y A PLUS DE FILE D'ATTENTE. Un coffre gagné — ou acheté — s'ouvre
// SUR-LE-CHAMP (chestOpenNow, js/economy-ui.js). L'ancienne file mettait un
// aller-retour par l'Armurerie entre la victoire et sa récompense, et laissait
// s'accumuler des piles de « ×14 Coffre Pion » qu'il fallait cliquer une par
// une. Le seul argument en sa faveur — « ouvrir quand on veut » — ne pesait
// pas lourd contre ça.
//
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

// ----------------------------------------------------------------
// PERLES : la monnaie qui sort des coffres et qui rachète des coffres
// ----------------------------------------------------------------
// Un coffre pouvait ne rien apporter d'utile : trois lots d'une pièce déjà
// en surnombre, et la série de victoires n'avait servi à rien. Chaque coffre
// contient désormais aussi des PERLES, et les perles s'échangent contre les
// coffres de son choix (les six coffres du menu principal, voir
// js/economy-ui.js). Une
// mauvaise ouverture fait donc toujours avancer vers le Coffre Roi.
// En mode test, la bourse est sans fond et ne se débite jamais (voir
// economyAdmin plus haut). L'affichage montre « ∞ » plutôt que le nombre.
function pearlInfinite(){return economyAdmin();}
function pearlBalance(){
  if(pearlInfinite())return ADMIN_PEARLS;
  const n=accGet('pearls',0);return typeof n==='number'?Math.max(0,n):0;
}
function pearlAdd(n){
  if(pearlInfinite())return ADMIN_PEARLS;
  if(!n)return pearlBalance();
  const v=Math.max(0,pearlBalance()+n);
  accSet('pearls',v);
  return v;
}
function pearlSpend(n){
  if(pearlInfinite())return true;
  if(n<0)return false;
  if(pearlBalance()<n)return false;
  pearlAdd(-n);
  return true;
}
// Achat d'un coffre : on paie, il s'ouvre. Même cérémonie qu'un
// coffre gagné en jouant (l'ouverture elle-même est dans economy-ui.js, qui
// est le seul à connaître l'interface).
function pearlBuyChest(chestId){
  return pearlSpend(chestPearlPrice(chestById(chestId).id));
}

// ----------------------------------------------------------------
// CE QU'IL Y A DANS UN COFFRE
// ----------------------------------------------------------------
// Deux coffres du même palier ne doivent pas donner deux fois la même chose :
// le NOMBRE de lots varie de ±1 autour de la valeur du coffre, la quantité de
// chaque lot tire dans sa fourchette, et les perles aussi.
function chestRollCount(chest){return Math.max(1,chest.rolls+randInt(-1,1));}
function chestRollRange(chest){return[Math.max(1,chest.rolls-1),chest.rolls+1];}

// Probabilité qu'un lot donné soit un BON lot : double quantité, et tirage
// nettement plus favorable aux pièces chères.
//
// Elle se DÉDUIT de la probabilité de pièce inédite, et c'est tout l'intérêt :
// la pièce inédite et les bons lots sont les deux façons dont un coffre peut
// être bon, et la seconde compense la première. En abaissant newChance à 1 %
// pour le Coffre Pion, on a mécaniquement relevé sa proportion de bons lots ;
// si un jour newChance remonte, elle redescendra toute seule.
// Le terme de palier garde l'échelle croissante : un Coffre Roi reste
// meilleur qu'un Coffre Pion sur les deux tableaux à la fois.
function chestLuckyChance(chest){
  return Math.max(0.1,Math.min(0.75,0.22+chest.tier*0.09-chest.newChance*0.5));
}

// Tire le contenu d'un coffre SANS l'appliquer : l'animation d'ouverture
// révèle les lots un par un, l'inventaire n'est crédité qu'ensuite
// (chestApply), pour que ce qui est affiché soit exactement ce qui est reçu.
// Le lot de perles suit le même chemin que les pièces : il est tiré ici,
// affiché par la cérémonie, et crédité par chestApply().
function chestRoll(chestId){
  const chest=chestById(chestId);
  const owned=invOwnedIds();
  const locked=PIECES.map(p=>p.id).filter(id=>isOwnablePiece(id)&&!(VV_UNLOCKED&&VV_UNLOCKED.has(id)));
  const lucky=chestLuckyChance(chest);
  const lots=[];

  const pr=chestPearlRange(chest.id);
  const pearlLucky=Math.random()<lucky;
  lots.push({pearls:Math.round(randInt(pr[0],pr[1])*(pearlLucky?1.8:1)),lucky:pearlLucky});

  // La pièce inédite est rare (1 % à 25 %) : quand elle tombe, elle tombe en
  // nombre, sinon on débloquerait une créature sans pouvoir l'aligner.
  //
  // Elle est GARANTIE quand on ne possède encore rien. Un coffre ne distribue
  // que des exemplaires de pièces déjà possédées (voir plus bas) : sans cette
  // garantie, il ne resterait que les perles à mettre dedans. Débloquer est
  // justement ce qu'il faut faire quand il n'y a rien à renforcer.
  if(locked.length&&(!owned.length||Math.random()<chest.newChance)){
    const pick=weightedPick(locked,chest.bias);
    if(pick)lots.push({pieceId:pick,qty:Math.max(4,chest.qty[1]),isNew:true});
  }

  // ON NE REÇOIT PAS D'EXEMPLAIRES D'UNE PIÈCE QU'ON N'A PAS. Un lot
  // d'exemplaires RENFORCE ce qu'on possède déjà ; ouvrir une créature est un
  // événement d'une autre nature, réservé au lot inédit ci-dessus. Il y avait
  // ici un repli qui, faute de pièces possédées, puisait dans le catalogue
  // entier : il distribuait des exemplaires de créatures encore verrouillées,
  // qui s'empilaient dans un stock sans jamais devenir jouables.
  const rolls=owned.length?chestRollCount(chest):0;
  for(let i=0;i<rolls;i++){
    const good=Math.random()<lucky;
    const pick=weightedPick(owned,chest.bias*(good?2.2:1));
    if(!pick)continue;
    const qty=randInt(chest.qty[0],chest.qty[1]);
    lots.push({pieceId:pick,qty:good?qty*2:qty,isNew:false,lucky:good});
  }
  // Fusion des doublons : deux lots de Méduse s'affichent en un seul. Le lot
  // de perles n'a pas de pieceId, il traverse sans être fusionné.
  const merged=[];
  lots.forEach(l=>{
    if(!l.pieceId){merged.push({...l});return;}
    const ex=merged.find(m=>m.pieceId===l.pieceId);
    if(ex){ex.qty+=l.qty;ex.isNew=ex.isNew||l.isNew;ex.lucky=ex.lucky||l.lucky;}else merged.push({...l});
  });
  return merged;
}

function chestApply(lots){
  const add={};
  let pearls=0;
  (lots||[]).forEach(l=>{
    if(l.pearls){pearls+=l.pearls;return;}
    if(!l.pieceId)return;
    add[l.pieceId]=(add[l.pieceId]||0)+l.qty;
    if(l.isNew&&VV_UNLOCKED&&!VV_UNLOCKED.has(l.pieceId)){
      VV_UNLOCKED.add(l.pieceId);
      if(typeof vvSaveUnlocked==='function')vvSaveUnlocked(VV_UNLOCKED);
    }
  });
  invAddMany(add);
  if(pearls)pearlAdd(pearls);
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

// La série de victoires à coffres est elle aussi quotidienne (voir
// economySettle plus haut) : une défaite pose `streak_lock_day` à la date du
// jour, et tant que la date locale n'a pas changé, plus aucune victoire ne
// donne de coffre. Le lendemain, todayKey() change tout seul et le verrou
// tombe — mais le COMPTEUR, lui, doit être remis à zéro explicitement, sans
// quoi la série repart au palier où elle s'était arrêtée la veille (voir
// streakEnsureToday, plus haut).
function streakLockedToday(){return accGet('streak_lock_day',null)===todayKey();}
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

// Heures restantes avant le prochain coffre quotidien (affichage Armurerie).
function dailyChestCountdown(){
  const now=new Date();
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0);
  const ms=next-now;
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);
  return h+' h '+String(m).padStart(2,'0');
}
