// ================================================================
// REWARDS.JS : la récompense journalière et les deux voies de progression
// ================================================================
// L'échiquier a trois lignes, le jeu a trois voies de progression, et chacune
// porte le nom de la sienne :
//
//   · la DIAGONALE DE LA PUISSANCE (js/voie.js, ex-« Voie des Victoires ») :
//     l'ELO. Elle monte en zigzag, elle débloque les créatures, et elle ne se
//     gagne qu'en battant plus fort que soi.
//   · la COLONNE DES VICTOIRES (ici) : trente paliers, un par victoire,
//     coffres et jokers. Elle ne se perd jamais et ne se remet jamais à zéro.
//   · la RANGÉE DE LA RICHESSE (ici) : vingt-cinq paliers de perles, payés en
//     TICKETS, et les tickets s'obtiennent en accomplissant des quêtes.
//
// À CÔTÉ DES TROIS VOIES, LA RÉCOMPENSE JOURNALIÈRE (plus bas dans ce
// fichier) : un lot par jour, dans un cycle de trente qui recommence
// indéfiniment (DAILY_REWARDS, js/data-pieces.js). Elle ne demande RIEN — ni
// victoire, ni quête : juste de revenir.
//
// POURQUOI LA COLONNE EXISTE. Elle avance d'un cran à CHAQUE victoire, sans
// verrou quotidien et sans qu'une défaite n'y touche, et elle a une fin
// (trente paliers, une seule fois par compte). C'est la voie de celui qui
// gagne, là où la journalière est celle de celui qui revient.
//
// POURQUOI LA RANGÉE EXISTE. Tout ce qui rapporte se gagne au tableau
// d'affichage : gagner, gagner encore, gagner d'affilée. La rangée récompense
// une autre chose — CE QU'ON FAIT sur le plateau : mater avec telle créature,
// donner échec avec telle autre, promouvoir, aligner une pièce qu'on ne joue
// jamais. On y avance en accomplissant des quêtes, quel que soit le résultat
// de la partie.
//
// Dépendances : data-pieces.js (PIECES, CHESTS, chestById), economy.js
// (invAdd, invOwnedIds, pearlAdd, todayKey, economyAdmin), accounts.js
// (accGet/accSet, CUR_ACC), main.js (showNotif).
// Utilisé par : rewards-ui.js (tout l'affichage), economy.js (economySettle
// fait avancer la colonne et les quêtes de victoire), rules-engine.js
// (recordMove : déplacements et prises), game-render.js (updateStatus :
// échec et mat).
//
// TOUT EST ÉCRIT PAR COMPTE via accGet/accSet. Clés utilisées :
//   col_wins       victoires comptées par la colonne (plafonnées à sa longueur)
//   col_claimed    paliers de la colonne déjà encaissés
//   jokers         jokers en attente de conversion
//   tickets        tickets en réserve
//   rich_claimed   paliers de la rangée déjà encaissés
//   quests_day     jour des quêtes en cours (clé locale, voir todayKey)
//   quests         les trois quêtes du jour : {id, pieceId, prog, done}
//   dr_idx         position dans le cycle de la récompense journalière
//   dr_day         jour de la dernière récompense journalière encaissée
// ================================================================

// Le mode test (/?test) LIT la progression réelle mais n'en écrit jamais une
// ligne, exactement comme l'inventaire et les perles (voir js/economy.js).
function rewardsAdmin(){return typeof economyAdmin==='function'&&economyAdmin();}
function rwGet(k,fb){return (typeof accGet==='function')?accGet(k,fb):fb;}
function rwSet(k,v){if(rewardsAdmin())return;if(typeof accSet==='function')accSet(k,v);}
function rwNotif(msg,type){if(typeof showNotif==='function')showNotif(msg,type||'ok');}

// ----------------------------------------------------------------
// LA RÉCOMPENSE JOURNALIÈRE : un lot par jour, un cycle sans fin
// ----------------------------------------------------------------
// Elle remplace la SÉRIE DU JOUR, qui exigeait six victoires d'affilée dans la
// journée et qu'une seule défaite refermait jusqu'au lendemain.
//
// Ici il n'y a rien à réussir : le lot du jour se prend, et le cycle avance
// d'un cran. Le contenu et l'ordre du cycle sont dans DAILY_REWARDS
// (js/data-pieces.js), et il RECOMMENCE indéfiniment — d'où le modulo.
//
// `dr_idx` compte les récompenses ENCAISSÉES, pas les jours écoulés : un
// joueur qui saute trois jours ne saute pas trois lots, il reprend le cycle là
// où il l'avait laissé. `dr_day` est le seul verrou : un lot par jour local
// (todayKey, js/economy.js — la même horloge que les quêtes et le coffre de
// réapprovisionnement, pour que tout le quotidien du jeu bascule ensemble).
function dailyRewardTotal(){return (typeof DAILY_REWARDS!=='undefined')?DAILY_REWARDS.length:0;}
function dailyRewardIdx(){const n=rwGet('dr_idx',0);return Math.max(0,typeof n==='number'?n:0);}
// Le lot d'un rang donné du cycle, quel que soit le nombre de tours déjà faits.
function dailyRewardStep(i){
  const t=dailyRewardTotal();
  if(!t)return null;
  return DAILY_REWARDS[((i%t)+t)%t];
}
// Le rang courant DANS le cycle (0 à 29) : c'est lui que la fenêtre met en
// avant, et c'est le lot que la journée d'aujourd'hui donne.
function dailyRewardCursor(){const t=dailyRewardTotal();return t?dailyRewardIdx()%t:0;}
// Combien de tours complets ont été bouclés : la fenêtre l'affiche (« cycle
// n° 3 »), sinon revenir au Coffre Pion après trente jours se lit comme une
// remise à zéro.
function dailyRewardCycle(){const t=dailyRewardTotal();return t?Math.floor(dailyRewardIdx()/t)+1:1;}
function dailyRewardAvailable(){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return false;
  if(!dailyRewardTotal())return false;
  const day=(typeof todayKey==='function')?todayKey():'';
  return rwGet('dr_day',null)!==day;
}
// Encaisse le lot du jour et renvoie sa description ({idx, chest|pearls|jokers}),
// ou null s'il a déjà été pris aujourd'hui. Comme pour la colonne, le lot n'est
// PAS versé ici : c'est l'interface qui ouvre le coffre, verse les perles ou
// ouvre la fenêtre des jokers, pour que ce qui est montré soit exactement ce
// qui est reçu.
function dailyRewardClaim(){
  if(!dailyRewardAvailable())return null;
  const idx=dailyRewardCursor();
  const step=dailyRewardStep(idx);
  if(!step)return null;
  const day=(typeof todayKey==='function')?todayKey():'';
  rwSet('dr_day',day);
  rwSet('dr_idx',dailyRewardIdx()+1);
  return{idx,...step};
}

// ----------------------------------------------------------------
// LA COLONNE DES VICTOIRES : trente paliers, un par victoire
// ----------------------------------------------------------------
// L'ordre est celui de la colonne, du premier palier au dernier. Deux natures
// de lot seulement :
//   {chest:'<id>'}  un coffre, ouvert avec la cérémonie habituelle
//   {jokers:n}      n jokers, convertis en la créature de son choix
//
// LA FORME DE LA COURBE. Le Coffre Pion revient sans cesse (dix-sept fois sur
// trente) : c'est le fond de la colonne, ce qui fait qu'une victoire donne
// toujours quelque chose. Les coffres rares sont posés en escalier — Cavalier
// tôt, Fou au neuvième, Tour au quinzième, Dame au vingt-deuxième, Roi tout au
// bout — et les quatre poignées de jokers (3, 5, 10, 15) sont les moments où
// le joueur choisit lui-même sa récompense plutôt que de la subir.
const VICTORY_COLUMN=[
  {chest:'pion'},    {chest:'pion'},     {jokers:3},      {chest:'cavalier'}, {chest:'pion'},
  {chest:'cavalier'},{chest:'pion'},     {chest:'pion'},  {chest:'fou'},      {chest:'pion'},
  {chest:'pion'},    {chest:'cavalier'}, {jokers:5},      {chest:'pion'},     {chest:'tour'},
  {chest:'pion'},    {chest:'cavalier'}, {chest:'pion'},  {chest:'pion'},     {jokers:10},
  {chest:'pion'},    {chest:'dame'},     {chest:'cavalier'},{chest:'pion'},   {chest:'fou'},
  {chest:'pion'},    {jokers:15},        {chest:'pion'},  {chest:'tour'},     {chest:'roi'},
];

function colTotal(){return VICTORY_COLUMN.length;}
// Victoires comptées par la colonne. Plafonnées à sa longueur : une fois les
// trente paliers atteints, continuer à gagner n'accumule pas un crédit qui ne
// mènerait nulle part.
function colWins(){const n=rwGet('col_wins',0);return Math.max(0,Math.min(colTotal(),typeof n==='number'?n:0));}
function colClaimed(){const n=rwGet('col_claimed',0);return Math.max(0,Math.min(colTotal(),typeof n==='number'?n:0));}
// Paliers gagnés mais pas encore encaissés : c'est ce que le bouton
// « Récupérer » de la page des récompenses déclenche, un par un.
function colPending(){return Math.max(0,colWins()-colClaimed());}
// L'index (0-based) du palier que la prochaine victoire ouvrirait, ou -1 si la
// colonne est finie.
function colNextIdx(){const w=colWins();return w>=colTotal()?-1:w;}

// Une victoire de plus. Appelée UNE SEULE FOIS par partie gagnée, depuis
// economySettle (js/economy.js) : c'est le seul endroit par lequel passe le
// règlement d'une partie, tutoriel et mode test exclus.
function colNoteWin(){
  if(rewardsAdmin())return 0;
  const w=colWins();
  if(w>=colTotal())return 0;
  rwSet('col_wins',w+1);
  return w+1;
}

// Encaisse le prochain palier dû et renvoie sa description ({chest} ou
// {jokers}), ou null s'il n'y a rien à prendre. Le lot lui-même n'est PAS
// versé ici : c'est l'interface qui ouvre le coffre ou la fenêtre des jokers
// (voir js/rewards-ui.js), pour que ce qui est affiché soit exactement ce qui
// est reçu — même règle que les coffres de série.
function colClaimNext(){
  if(!colPending())return null;
  const idx=colClaimed();
  const step=VICTORY_COLUMN[idx];
  if(!step)return null;
  rwSet('col_claimed',idx+1);
  return{idx,...step};
}

// ----------------------------------------------------------------
// LES JOKERS : une récompense que le joueur choisit lui-même
// ----------------------------------------------------------------
// Un joker vaut UN EXEMPLAIRE de la créature de son choix. Trois jokers
// convertis en Garde de Pierre donnent trois Gardes de Pierre.
//
// ON NE CHOISIT QUE PARMI CE QU'ON POSSÈDE (invOwnedIds) : recevoir des
// exemplaires d'une créature encore verrouillée remplirait un stock injouable,
// et c'est exactement ce que les coffres se refusent déjà à faire (voir
// chestRoll, js/economy.js). Le joker choisit à quoi on RENFORCE son armée, il
// ne débloque pas.
//
// Les jokers non convertis restent en réserve : fermer la fenêtre sans choisir
// ne perd rien, la conversion est reproposée à la prochaine visite.
function jokerBalance(){const n=rwGet('jokers',0);return Math.max(0,typeof n==='number'?n:0);}
function jokerAdd(n){
  if(!n)return jokerBalance();
  const v=Math.max(0,jokerBalance()+n);
  rwSet('jokers',v);
  return v;
}
// Créatures proposées à la conversion : celles qu'on possède, hors Monarque
// (il n'y en a jamais qu'un sur le plateau, un second exemplaire ne se joue
// pas). Triées comme le reste du jeu : par classe puis par valeur.
function jokerChoices(){
  const owned=(typeof invOwnedIds==='function')?invOwnedIds():[];
  return owned.map(id=>PIECES.find(p=>p.id===id)).filter(p=>p&&p.class!=='Monarque')
    .sort((a,b)=>(CLASS_ORDER[a.class]||9)-(CLASS_ORDER[b.class]||9)||a.value-b.value);
}
// Convertit TOUTE la réserve en exemplaires de `pieceId`. Renvoie le nombre
// d'exemplaires versés (0 si le choix est invalide ou la réserve vide).
function jokerConvert(pieceId){
  const n=jokerBalance();
  if(!n)return 0;
  if(!jokerChoices().some(p=>p.id===pieceId))return 0;
  rwSet('jokers',0);
  if(typeof invAdd==='function')invAdd(pieceId,n);
  return n;
}

// ----------------------------------------------------------------
// LA RANGÉE DE LA RICHESSE : vingt-cinq paliers de perles
// ----------------------------------------------------------------
// Cinq tranches de cinq paliers : 2, 3, 4, 5 puis 6 perles. On n'y avance pas
// en gagnant mais en accomplissant des QUÊTES, qui donnent des tickets ; chaque
// palier coûte un nombre de tickets, croissant par tranche.
//
// L'ÉCONOMIE, EN TROIS NOMBRES. La rangée entière rend 100 perles — soit deux
// Coffres Tour et demi, à 40 perles pièce — et coûte 130 tickets. Les trois
// quêtes du jour rapportent entre 2 et 5 tickets chacune, soit une dizaine par
// jour si on les fait toutes : la rangée se termine en deux semaines de jeu
// régulier, et le premier palier tombe dès la première quête accomplie
// (3 tickets). C'est une voie d'appoint, pas une deuxième source de coffres :
// toucher à ces nombres, c'est refaire ce calcul.
//
// LES MONTANTS ONT SUIVI LES PRIX. Ils valaient 5 à 25 perles quand un Coffre
// Tour en coûtait 250 ; l'échelle des perles a été divisée par dix avec celle
// des coffres (voir CHEST_PEARLS, js/data-pieces.js), et laisser la rangée à
// 375 perles en aurait fait, à elle seule, près de quatre Coffres Roi.
const WEALTH_TIERS=[
  {pearls:2,cost:3},
  {pearls:3,cost:4},
  {pearls:4,cost:5},
  {pearls:5,cost:6},
  {pearls:6,cost:8},
];
const WEALTH_ROW=(()=>{
  const rows=[];
  WEALTH_TIERS.forEach(t=>{for(let i=0;i<5;i++)rows.push({pearls:t.pearls,cost:t.cost});});
  return rows;
})();

function richTotal(){return WEALTH_ROW.length;}
function richClaimed(){const n=rwGet('rich_claimed',0);return Math.max(0,Math.min(richTotal(),typeof n==='number'?n:0));}
function richDone(){return richClaimed()>=richTotal();}
function richNextIdx(){return richDone()?-1:richClaimed();}
function richNextStep(){const i=richNextIdx();return i<0?null:WEALTH_ROW[i];}
function ticketBalance(){const n=rwGet('tickets',0);return Math.max(0,typeof n==='number'?n:0);}
function ticketAdd(n){
  if(!n)return ticketBalance();
  const v=Math.max(0,ticketBalance()+n);
  rwSet('tickets',v);
  return v;
}
function richCanClaim(){
  const step=richNextStep();
  return !!step&&ticketBalance()>=step.cost;
}
// Encaisse le palier suivant : les tickets sont dépensés, les perles versées.
// Renvoie {idx, pearls, cost} ou null si les tickets manquent.
function richClaimNext(){
  const step=richNextStep();
  if(!step||ticketBalance()<step.cost)return null;
  const idx=richClaimed();
  ticketAdd(-step.cost);
  rwSet('rich_claimed',idx+1);
  if(typeof pearlAdd==='function')pearlAdd(step.pearls);
  return{idx,pearls:step.pearls,cost:step.cost};
}

// ----------------------------------------------------------------
// LES QUÊTES : trois par jour, tirées sur les créatures qu'on possède
// ----------------------------------------------------------------
// Une quête ne doit JAMAIS être infaisable : la créature qu'elle demande est
// tirée parmi celles que le joueur possède déjà (invOwnedIds), Monarque exclu
// — on ne mate pas avec son propre roi, et on ne promeut pas un pion en roi.
//
// `event` est le fait de jeu qui la fait avancer (voir questNote plus bas) ;
// `piece:false` marque les quêtes qui comptent n'importe quelle créature.
// `target` est ce qu'il faut atteindre, `tickets` ce que ça rapporte.
const QUEST_POOL=[
  {id:'mate',   event:'mate',   piece:true, target:1,tickets:5,
   label:n=>'Donner échec et mat avec '+n},
  {id:'check',  event:'check',  piece:true, target:3,tickets:3,
   label:n=>'Donner 3 fois échec avec '+n},
  {id:'play',   event:'play',   piece:true, target:3,tickets:2,
   label:n=>'Engager '+n+' et la jouer 3 fois dans une même bataille'},
  {id:'move',   event:'move',   piece:true, target:5,tickets:2,
   label:n=>'Déplacer 5 fois '+n},
  {id:'capture',event:'capture',piece:true, target:3,tickets:3,
   label:n=>'Capturer 3 pièces avec '+n},
  {id:'promo',  event:'promo',  piece:true, target:1,tickets:3,
   label:n=>'Promouvoir un pion en '+n},
  {id:'winwith',event:'winwith',piece:true, target:2,tickets:4,
   label:n=>'Gagner 2 batailles en alignant '+n},
  {id:'wins',   event:'win',    piece:false,target:3,tickets:4,
   label:()=>'Gagner 3 batailles'},
  {id:'promos', event:'promo',  piece:false,target:2,tickets:2,
   label:()=>'Promouvoir 2 pions'},
];
const QUESTS_PER_DAY=3;
function questTpl(id){return QUEST_POOL.find(q=>q.id===id)||null;}
function questPieceName(id){const p=PIECES.find(x=>x.id===id);return p?p.name:'';}
function questLabel(q){
  const tpl=questTpl(q.id);
  if(!tpl)return '';
  return tpl.label(questPieceName(q.pieceId));
}
function questTickets(q){const tpl=questTpl(q.id);return tpl?tpl.tickets:0;}
function questTarget(q){const tpl=questTpl(q.id);return tpl?tpl.target:1;}

// Créatures sur lesquelles une quête peut porter. Le Monarque est écarté (voir
// plus haut) ; si le compte ne possède rien d'autre — cas d'un compte tout
// neuf avant le tutoriel —, on n'a plus que les quêtes sans créature.
function questPieceIds(){
  const owned=(typeof invOwnedIds==='function')?invOwnedIds():[];
  return owned.filter(id=>{const p=PIECES.find(x=>x.id===id);return p&&p.class!=='Monarque';});
}
// Mélange de Fisher-Yates : `sort(() => Math.random() - .5)` n'est pas un
// mélange, il laisse les premiers éléments en tête bien plus souvent qu'il ne
// le devrait.
function questShuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

// Tirage des trois quêtes du jour. Deux tirages SANS REMISE :
//   · trois natures différentes (sinon on recevait « déplacer 5 fois X »,
//     « capturer 3 pièces avec X » et « promouvoir en X » le même jour) ;
//   · trois créatures différentes tant qu'on en possède assez — c'est vite
//     arrivé, avec quatre créatures en début de partie, de voir les trois
//     quêtes tomber sur la même, ce qui donne l'impression d'une seule quête
//     découpée en trois. En dessous de trois créatures possédées, on repasse
//     forcément sur les mêmes.
function questRoll(){
  const pieces=questPieceIds();
  const bag=QUEST_POOL.filter(t=>!t.piece||pieces.length);
  const tpls=questShuffle(bag);
  const bagPieces=questShuffle(pieces);
  let pi=0;
  const nextPiece=()=>{
    if(!bagPieces.length)return null;
    if(pi>=bagPieces.length)pi=0;
    return bagPieces[pi++];
  };
  return tpls.slice(0,QUESTS_PER_DAY).map(tpl=>(
    {id:tpl.id,pieceId:tpl.piece?nextPiece():null,prog:0,done:false}
  ));
}

// Les quêtes du jour, régénérées au changement de date locale — même horloge
// que la série du jour et le coffre de réapprovisionnement (todayKey,
// js/economy.js), pour que tout le quotidien du jeu bascule au même moment.
function questsToday(){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return [];
  const day=(typeof todayKey==='function')?todayKey():'';
  if(rwGet('quests_day',null)!==day||!Array.isArray(rwGet('quests',null))){
    const fresh=questRoll();
    rwSet('quests_day',day);
    rwSet('quests',fresh);
    return fresh;
  }
  // Une quête enregistrée sous un identifiant disparu (pool modifié entre deux
  // versions) est ignorée plutôt que d'afficher une ligne vide.
  return rwGet('quests',[]).filter(q=>questTpl(q.id));
}
function questsSave(list){rwSet('quests',list);}
function questsAllDone(){const qs=questsToday();return qs.length>0&&qs.every(q=>q.done);}

// ----------------------------------------------------------------
// CE QUI FAIT AVANCER UNE QUÊTE
// ----------------------------------------------------------------
// Un seul point d'entrée pour tous les faits de jeu. Les appelants sont
// volontairement peu nombreux :
//   recordMove   (js/rules-engine.js) → 'move' et 'capture'
//   updateStatus (js/game-render.js)  → 'check' et 'mate'
//   economyOnPromotion (js/economy.js)→ 'promo'
//   economySettle      (js/economy.js)→ 'win' et 'winwith'
//
// Les tickets sont crédités DÈS que la quête est remplie, sans bouton à
// presser : il n'y a rien à décider, et une quête accomplie qu'il faut aller
// chercher est une corvée (même raisonnement que le coffre quotidien, voir
// dailyChestMaybeOpen dans js/economy-ui.js). Le palier de la rangée, lui, se
// prend à la main : là, il y a un choix — encaisser ou accumuler.
function questNote(event,pieceId,n){
  if(rewardsAdmin())return;
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return;
  const qs=questsToday();
  if(!qs.length)return;
  let changed=false,earned=0;
  qs.forEach(q=>{
    if(q.done)return;
    const tpl=questTpl(q.id);
    if(!tpl||tpl.event!==event)return;
    if(tpl.piece&&q.pieceId!==pieceId)return;
    q.prog=Math.min(tpl.target,(q.prog||0)+(n||1));
    changed=true;
    if(q.prog>=tpl.target){q.done=true;earned+=tpl.tickets;}
  });
  if(!changed)return;
  questsSave(qs);
  if(earned){
    ticketAdd(earned);
    rwNotif('Quête accomplie · +'+earned+' ticket'+(earned>1?'s':''),'ok');
    if(typeof playSound==='function')playSound('loot');
  }
  if(typeof rewardsRefreshUI==='function')rewardsRefreshUI();
}

// « Engager telle créature et la jouer 3 fois DANS UNE MÊME BATAILLE » : le
// compte est tenu sur la partie en cours (gs._questPlay), donc il repart de
// zéro à chaque nouvelle partie sans que personne ait à le réinitialiser — GS
// est reconstruit à chaque lancement (startGame, js/game-flow.js).
function questNotePlay(gs,pieceId){
  if(!gs||rewardsAdmin())return;
  gs._questPlay=gs._questPlay||{};
  gs._questPlay[pieceId]=(gs._questPlay[pieceId]||0)+1;
  const qs=questsToday();
  const q=qs.find(x=>!x.done&&x.id==='play'&&x.pieceId===pieceId);
  if(!q)return;
  const tpl=questTpl('play');
  const seen=Math.min(tpl.target,gs._questPlay[pieceId]);
  if(seen<=(q.prog||0))return;
  q.prog=seen;
  if(q.prog>=tpl.target){
    q.done=true;
    questsSave(qs);
    ticketAdd(tpl.tickets);
    rwNotif('Quête accomplie · +'+tpl.tickets+' tickets','ok');
    if(typeof playSound==='function')playSound('loot');
  }else questsSave(qs);
  if(typeof rewardsRefreshUI==='function')rewardsRefreshUI();
}

// Un coup joué par le JOUEUR (jamais par l'adversaire : le filtre est chez
// l'appelant, qui seul sait de quelle couleur est le joueur).
function questNoteMove(gs,pieceId,isCapture){
  questNote('move',pieceId,1);
  questNotePlay(gs,pieceId);
  if(isCapture)questNote('capture',pieceId,1);
}

// Échec / mat : la créature créditée est celle qui ATTAQUE le roi adverse, et
// pas seulement celle qui vient de bouger — un échec à la découverte est donné
// par la pièce démasquée. On cherche donc, parmi les pièces du joueur, celles
// qui atteignent la case du roi adverse ; la pièce qui vient de jouer est
// examinée en premier pour rester la réponse dans le cas ordinaire.
function questCheckers(gs,defColor){
  const b=gs&&gs.board;
  if(!b||!b.length)return [];
  let kr=-1,kc=-1;
  for(let r=0;r<8&&kr<0;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(p&&p.color===defColor&&(p.type==='k'||p.isKing)){kr=r;kc=c;break;}
  }
  if(kr<0)return [];
  const atk=defColor==='w'?'b':'w';
  const out=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p||p.color!==atk)continue;
    let moves=[];
    try{moves=generateMovesRaw(b,r,c,gs)||[];}catch(e){moves=[];}
    if(moves.some(m=>m.r===kr&&m.c===kc)&&out.indexOf(p.pieceId)<0)out.push(p.pieceId);
  }
  return out;
}
function questNoteCheck(gs,defColor,isMate){
  if(rewardsAdmin())return;
  const ids=questCheckers(gs,defColor);
  if(!ids.length)return;
  ids.forEach(id=>{
    questNote('check',id,1);
    if(isMate)questNote('mate',id,1);
  });
}

// ----------------------------------------------------------------
// CE QUE LE MENU DOIT MONTRER
// ----------------------------------------------------------------
// IL N'Y A PLUS DE TOTAL, PARCE QU'IL N'Y A PLUS UN SEUL BOUTON. Le menu
// portait « Récompenses » et une pastille qui additionnait les deux voies :
// elle disait qu'il y avait quelque chose quelque part, sans dire où. Chaque
// voie a maintenant son bouton et sa pastille (renderRewardsBadge,
// js/rewards-ui.js), chacune alimentée par l'état de SA voie — la journalière
// par dailyRewardAvailable(), la colonne par colPending(), la rangée par
// richCanClaim() et jokerBalance().
// Une pastille qui ne s'allume que quand il y a vraiment quelque chose à
// prendre est un rappel ; une pastille toujours allumée est un décor.
