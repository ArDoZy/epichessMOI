// ================================================================
// ECONOMY-UI.JS : l'Armurerie (perles, échiquiers), les coffres du menu
// principal, et les affichages liés à l'économie ailleurs dans le jeu
// ================================================================
// Contient : le rendu de la face « Armurerie » du cube (#page-reserve), la
// texture du plateau (suit automatiquement l'ELO, voir bestUnlockedSkin),
// la cérémonie d'ouverture d'un coffre,
// les coffres illimités du mode test (renderAdminChests), la fenêtre de la
// série du jour (renderStreakModal, ouverte depuis le menu principal), la
// face « Magasin » du cube où les coffres s'achètent
// (renderMagasinPage/buyChestFromShop), le coffre de réapprovisionnement
// quotidien (renderDailyChest) et le rappel de la mise pendant la partie.
//
// Dépendances : economy.js (inventaire, coffres, quotidien, streakLockedToday),
// data-pieces.js (PIECES, CHESTS, BOARD_SKINS), piece-art.js
// (pieceIcon/pieceSVG), accounts.js (accGet/accSet, VV_UNLOCKED), main.js
// (escH, showPage).
// Utilisé par : cube-nav.js (ouverture des faces jouer/armurerie/magasin),
// game-flow.js (mise en partie), game-render.js (texture de plateau).
// ================================================================

// ----------------------------------------------------------------
// ÉCHIQUIER CHOISI
// ----------------------------------------------------------------
// Le plateau est une récompense de progression : on ne peut sélectionner que
// les matières dont le seuil d'ELO est atteint. Par défaut, la meilleure
// débloquée, pour que franchir un rang se voie tout de suite.
// En mode test, vvLoadElo() renvoie 10 000 : tous les échiquiers sont donc
// ouverts, sans qu'aucune règle ait à connaître le mode test (voir
// js/accounts.js).
function boardSkinUnlocked(skin){
  return (typeof vvLoadElo==='function'?vvLoadElo():0)>=skin.eloRequired;
}
function bestUnlockedSkin(){
  const ok=BOARD_SKINS.filter(boardSkinUnlocked);
  return ok.length?ok[ok.length-1]:BOARD_SKINS[0];
}
function getBoardSkin(){
  return bestUnlockedSkin();
}
// La texture est posée DIRECTEMENT sur l'élément, et non passée par une
// variable CSS : une url() relative placée dans une custom property est
// résolue par rapport à la FEUILLE DE STYLE qui la consomme (donc css/…),
// pas par rapport au document. Le plateau cherchait css/assets/boards/*.svg
// et ne trouvait rien.
function applyBoardSkin(){
  const el=document.getElementById('game-board');
  if(!el)return;
  const sk=getBoardSkin();
  el.style.backgroundImage='url("'+sk.file+'")';
  // Les repères de coordonnées, posés dans les cases de bord, prennent la
  // teinte de la case opposée : ils se lisent sur les deux couleurs du damier
  // sans réclamer de fond à eux.
  el.style.setProperty('--sq-light',sk.sqLight||'#e2cba6');
  el.style.setProperty('--sq-dark',sk.sqDark||'#5a4130');
}

// ----------------------------------------------------------------
// LA SÉRIE DU JOUR : une fenêtre, plus un rail
// ----------------------------------------------------------------
// La série de victoires occupait le bas du MENU PRINCIPAL : six coffres en
// rang, le solde de perles et la mention « Série · N victoires ». Trois
// informations posées en permanence sous le pouce pour un état qu'on ne
// consulte qu'au moment de décider si on relance une partie — et six coffres
// larges de 13 vw chacun, donc illisibles.
//
// Elle a maintenant SA fenêtre, ouverte par le bouton « Série du jour »
// au-dessus de COMBAT. Une colonne, du Coffre Pion (en haut) au Coffre Roi
// (en bas) : chaque palier a la place de dire combien de victoires d'affilée
// il demande, et on arrive directement sur celui qui est en jeu.
//
//   chest-won   palier déjà décroché dans la série du jour
//   chest-next  celui que la PROCHAINE victoire donnerait
//   chest-far   encore à plusieurs victoires de là
//
// La série est QUOTIDIENNE (voir economySettle/streakLockedToday dans
// js/economy.js) : une défaite la ferme jusqu'au lendemain, et il n'y a
// alors plus de palier « next » du tout.
function streakSnapshot(){
  const streak=accGet('win_streak',0);
  const locked=(typeof streakLockedToday==='function')&&streakLockedToday();
  const done=streak>=CHESTS.length;
  // Ni série perdue ni série terminée : le prochain palier est celui d'indice
  // `streak` (0 victoire → Coffre Pion).
  const nextIdx=(locked||done)?-1:Math.min(streak,CHESTS.length-1);
  return{streak,locked,done,nextIdx};
}
function streakRowState(i,snap){
  if(i<snap.streak)return 'chest-won';
  if(i===snap.nextIdx)return 'chest-next';
  return 'chest-far';
}
// Une phrase, sous le titre : où l'on en est, et ce que ça implique.
function streakSubtitle(snap){
  if(snap.locked)return 'Série perdue pour aujourd\'hui. Elle repart demain.';
  if(snap.done)return 'Série terminée, les six coffres sont tombés. Elle repart demain.';
  const next=CHESTS[snap.nextIdx];
  if(!snap.streak)return 'Une victoire, et le '+next.name+' est à vous.';
  return snap.streak+' victoire'+(snap.streak>1?'s':'')+' d\'affilée · la prochaine donne le '+next.name+'.';
}
// L'ORDRE EST CELUI DU DOM : CHESTS va du Pion au Roi, et les lignes se
// posent de haut en bas — donc Pion tout en haut, Roi tout en bas.
function streakRowsHTML(snap){
  return CHESTS.map((ch,i)=>{
    const state=streakRowState(i,snap);
    const wins=i+1;
    const mark=state==='chest-won'?'<span class="streak-mark streak-mark-ok">✓</span>'
      :state==='chest-next'?'<span class="streak-mark streak-mark-next">Prochain</span>':'';
    return '<div class="streak-row '+state+'" data-chest="'+ch.id+'" data-idx="'+i+'" style="--chest-c:'+ch.color+'">'+
      '<div class="streak-row-chest">'+chestVisual(ch,state==='chest-next'?'chest-ready':'')+'</div>'+
      '<div class="streak-row-txt">'+
        '<div class="streak-row-name">'+escH(ch.name)+'</div>'+
        '<div class="streak-row-win">'+(wins===1?'1re victoire':wins+'e victoire d\'affilée')+'</div>'+
      '</div>'+mark+
    '</div>';
  }).join('');
}
function renderStreakModal(){
  const snap=streakSnapshot();
  const sub=document.getElementById('streak-sub');
  if(sub)sub.textContent=streakSubtitle(snap);
  const host=document.getElementById('streak-scroll');
  if(!host)return snap;
  host.innerHTML=streakRowsHTML(snap);
  // On ARRIVE LÀ OÙ ON EN EST quand une série est en cours : le palier que la
  // prochaine victoire donnerait est amené au centre. Série terminée ou
  // perdue, il n'y a pas de « prochain » à montrer — on ouvre donc sur le
  // début de la colonne (le Coffre Pion, tout en haut).
  requestAnimationFrame(()=>{
    if(snap.nextIdx>0){
      const row=host.querySelector('.streak-row[data-idx="'+snap.nextIdx+'"]');
      if(row)row.scrollIntoView({block:'center'});
    }else host.scrollTop=0;
  });
  return snap;
}
function openStreakModal(){
  if(!CUR_ACC)return;
  renderStreakModal();
  document.getElementById('streak-modal')?.classList.add('show');
}
function closeStreakModal(){
  document.getElementById('streak-modal')?.classList.remove('show');
}
document.getElementById('jouer-streak')?.addEventListener('click',openStreakModal);
document.getElementById('streak-close')?.addEventListener('click',closeStreakModal);
// Un clic sur le voile (et non sur le panneau) referme, comme les autres
// fenêtres du jeu.
document.getElementById('streak-modal')?.addEventListener('click',e=>{
  if(e.target.id==='streak-modal')closeStreakModal();
});

// Conservée sous son nom historique : une douzaine d'appels y mènent
// (connexion, fin de partie, arrivée sur la face JOUER). Le menu n'a plus de
// rail de coffres à dessiner — il ne reste que le coffre quotidien à
// déclencher et l'identité à rafraîchir.
function renderMenuChests(){
  renderDailyChest();
  if(typeof renderMenuIdentity==='function')renderMenuIdentity();
}

// ----------------------------------------------------------------
// RAPPEL DE LA MISE
// ----------------------------------------------------------------
function stakeListHTML(armyData,color){
  const need=armyRequirements(armyData);
  const entries=Object.entries(need);
  if(!entries.length)return '<span style="color:var(--muted);font-size:12px">Aucune pièce possédée engagée.</span>';
  return entries.map(([id,n])=>
    '<span class="gs-stake-q">'+n+'×</span>'+pieceIcon(id,color||'n',1.4)).join('');
}
// Bandeau de la page Combat, avant de s'engager.
function renderCombatStake(armyData){
  const el=document.getElementById('cstake');
  if(!el)return;
  const stock=armyStock(armyData);
  const warn=stock.ok?'':
    '<div class="cstake-warn">Stock insuffisant : '+stock.missing.map(m=>m.name+' ('+m.have+'/'+m.need+')').join(', ')+'</div>';
  el.innerHTML='<div class="cstake-lbl">Vous engagez</div><div class="cstake-row">'+
    stakeListHTML(armyData,'n')+'</div>'+warn;
}

// ----------------------------------------------------------------
// PAGE ARMURERIE
// ----------------------------------------------------------------
function chestVisual(chest,extraCls){
  return '<div class="chest '+(extraCls||'')+'" style="--chest-c:'+chest.color+'">'+
    '<div class="chest-lid"></div><div class="chest-body"></div><div class="chest-lock"></div></div>';
}

// ----------------------------------------------------------------
// PERLES
// ----------------------------------------------------------------
// Dessinée et non écrite en emoji : l'emoji perle n'existe pas partout et
// change de forme d'un système à l'autre, alors que cette monnaie doit être
// reconnaissable instantanément dans un coffre comme sous un prix.
function pearlIcon(em){
  const s=(em||1.2)+'em';
  return '<svg class="pearl-icon" style="width:'+s+';height:'+s+'" viewBox="0 0 24 24" aria-hidden="true">'+
    '<defs><radialGradient id="pearlG" cx="35%" cy="30%">'+
      '<stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#dfeaf2"/>'+
      '<stop offset="100%" stop-color="#8fa6b8"/></radialGradient></defs>'+
    '<circle cx="12" cy="12" r="9" fill="url(#pearlG)"/>'+
    '<circle cx="9" cy="9" r="2.4" fill="#fff" opacity=".85"/>'+
  '</svg>';
}
function pearlAmountHTML(n,em){
  return '<span class="pearl-amt">'+pearlIcon(em)+'<span>'+n+'</span></span>';
}

// L'Armurerie ne montre plus le solde de perles : on n'y achète rien. Les
// perles servent aux coffres, et leur solde est écrit sous les coffres, au
// Magasin, sur la carte de chaque coffre et dans l'en-tête (voir
// renderMagasinPage), là où on décide de dépenser.
function renderReservePage(){
  if(!CUR_ACC)return;
  renderAdminChests();
}

// Ce que promet une carte de coffre, en une ligne : les deux nombres qui
// décident si on le vise ou non. Le nombre de lots est une FOURCHETTE, le
// tirage variant de ±1 (chestRollCount, js/economy.js).
function chestPromiseHTML(chest){
  const [a,b]=chestRollRange(chest);
  const pct=chest.newChance*100;
  return '<div class="chest-rar">'+a+'–'+b+' lots · '+
    (pct<10?pct.toFixed(1).replace('.',','):Math.round(pct))+'% pièce inédite</div>';
}

// ----------------------------------------------------------------
// OUVERTURE IMMÉDIATE
// ----------------------------------------------------------------
// Un coffre ne se met plus en attente : gagné, acheté ou ouvert en mode
// admin, il passe directement par ici. Le contenu est tiré MAINTENANT, donc
// fermer la fenêtre en cours de route ne permet pas de relancer le tirage
// jusqu'à obtenir mieux.
function chestOpenNow(chestId,onClose){
  const chest=chestById(chestId);
  showChestCeremony(chest,chestRoll(chest.id),true,onClose||function(){});
}

// Retour à l'Armurerie après une ouverture lancée depuis l'Armurerie.
function chestBackToReserve(){
  showPage('page-reserve');
  renderReservePage();
  if(typeof updAll==='function')updAll();
  if(typeof renderArmiesPage==='function')renderArmiesPage();
}

// ----------------------------------------------------------------
// FIN DE PARTIE : règlement, cinématique, coffre, verdict
// ----------------------------------------------------------------
// La fin de partie enchaînait règlement, cinématique et verdict sans jamais
// ouvrir le coffre, qui partait dans une file d'attente. C'est écrit ici une
// fois : le coffre
// gagné s'ouvre entre la cinématique d'issue et l'écran de résultat, à sa
// place, sans empiler deux célébrations.
// Renvoie le rapport de economySettle() (synchrone), l'affichage suivant.
//
// Les deux appelants la protègent d'un `typeof` : si ce module venait à ne pas
// se charger, une partie doit encore pouvoir se terminer et afficher son
// verdict, quitte à sauter le règlement et la cérémonie.
function settleAndCelebrate(result,gs,onDone){
  const report=(typeof economySettle==='function')?economySettle(result,gs):null;
  const finish=()=>{
    if(report&&report.chest)chestOpenNow(report.chest.id,onDone);
    else onDone();
  };
  if(typeof playOutcomeCinematic==='function')playOutcomeCinematic(result,report,finish);
  else setTimeout(finish,400);
  return report;
}

// ----------------------------------------------------------------
// LE MAGASIN : achat d'un coffre contre des perles
// ----------------------------------------------------------------
// Les six mêmes coffres que ceux gagnés en enchaînant les victoires, au même
// contenu : l'achat ne fabrique pas une seconde économie, il donne simplement
// un second chemin vers la première. C'est le SEUL endroit du jeu où un
// coffre s'achète — le rail du menu principal ne fait plus que montrer la
// série (voir renderMenuChests plus haut).
//
// On reste sur le Magasin après l'achat : la cérémonie n'est qu'une fenêtre
// par-dessus, il n'y a donc rien à raviver ailleurs qu'à réafficher la grille
// (le solde de perles et l'affordabilité de chaque coffre ont changé).
function buyChestFromShop(chestId){
  const chest=chestById(chestId);
  const price=chestPearlPrice(chest.id);
  if(pearlBalance()<price){
    if(typeof showNotif==='function')
      showNotif('Il vous manque '+(price-pearlBalance())+' perles pour ce coffre.','err');
    return;
  }
  showConfirmModal('Acheter un '+chest.name+' pour '+price+' perles ?',()=>{
    if(!pearlBuyChest(chest.id))return;
    if(typeof playSound==='function')playSound('promo');
    // Cérémonie d'ouverture normale : un Coffre Pion acheté ici se BRISE
    // exactement comme un Coffre Pion gagné (js/chest-break.js).
    chestOpenNow(chest.id,renderMagasinPage);
  },{okLabel:'Acheter',cancelLabel:'Annuler',okClass:'btn-gold'});
}

// La carte du Magasin, en grand. Un coffre qu'on BRISE ne s'y montre pas sous
// la forme du coffre à couvercle dessiné en CSS : il montre LA STATUETTE de sa
// première planche (assets/chests/<id>/01-intact.webp, l'image qui ouvre la
// séquence de bris — voir js/chest-break.js), dont le socle et le fond noir
// sont effacés par un filtre CSS (mix-blend-mode:screen, voir .chest-pawn)
// pour ne garder que la pièce. La séquence de bris elle-même est INTACTE et se
// joue normalement à l'ouverture, ici comme après une victoire.
//
// Le choix se fait sur l'EXISTENCE d'une séquence, pas sur une liste d'ids :
// équiper le Fou de ses cinq planches suffira à lui donner sa statuette ici
// aussi, sans rien changer dans ce fichier.
function magasinChestVisual(chest){
  const poster=typeof chestBreakPoster==='function'?chestBreakPoster(chest.id):'';
  if(!poster)return chestVisual(chest,'chest-lg');
  return '<div class="chest chest-lg chest-pawn" style="--chest-c:'+chest.color+'">'+
    '<img src="'+poster+'" alt="" draggable="false">'+
  '</div>';
}
// La carte ne dit que ce qu'il faut pour décider : quel coffre, et combien il
// coûte. Le nombre de lots et la probabilité de pièce inédite
// (chestPromiseHTML) restent réservés aux cartes du mode test.
function magasinChestCardHTML(chest){
  const price=chestPearlPrice(chest.id);
  const afford=pearlInfinite()||pearlBalance()>=price;
  return '<button class="shop-chest'+(afford?'':' shop-poor')+'" data-chest="'+chest.id+'" style="--chest-c:'+chest.color+'">'+
    magasinChestVisual(chest)+
    '<div class="shop-chest-name">'+escH(chest.name)+'</div>'+
    '<div class="shop-chest-price">'+pearlAmountHTML(price,1.15)+'</div>'+
  '</button>';
}
// Face « magasin » du cube (voir refreshFaceContent, js/cube-nav.js) : les
// six coffres, en grand, achetables contre des perles — le seul endroit du
// jeu où ils s'achètent (voir la note sur buyChestFromShop plus haut).
function renderMagasinPage(){
  const bank=document.getElementById('shop-bank');
  if(bank){
    const balTxt=pearlInfinite()?'∞':pearlBalance();
    bank.innerHTML=pearlAmountHTML(balTxt,1.3)+'<span>perles</span>';
  }
  const grid=document.getElementById('shop-chest-grid');
  if(!grid)return;
  grid.innerHTML=CHESTS.map(magasinChestCardHTML).join('');
  grid.querySelectorAll('.shop-chest').forEach(b=>{
    b.addEventListener('click',()=>buyChestFromShop(b.dataset.chest));
  });
}

// ----------------------------------------------------------------
// COFFRES ILLIMITÉS DU MODE TEST
// ----------------------------------------------------------------
// Les six coffres (Pion, Cavalier, Fou, Tour, Dame, Roi) sont ouvrables
// autant de fois qu'on veut, avec la vraie cérémonie et le vrai tirage : c'est
// de quoi VOIR ce que donne un coffre sans jouer trente parties. Le contenu
// n'est pas crédité — en mode test l'inventaire est déjà illimité et rien ne
// s'écrit sur le compte (voir js/economy.js).
// La section est masquée (et vide) hors mode test.
function renderAdminChests(){
  const sec=document.getElementById('rs-admin-sec');
  const el=document.getElementById('rs-admin-chests');
  if(!sec||!el)return;
  const on=(typeof ADMIN_MODE!=='undefined')&&ADMIN_MODE;
  sec.style.display=on?'':'none';
  if(!on){el.innerHTML='';return;}
  el.innerHTML='<div class="rs-admin-note">Coffres de test, ouvrables sans limite. Le contenu est tiré au sort comme pour un coffre gagné en jouant, mais rien n\'est crédité : en mode test, tout est déjà illimité.</div>'+
    '<div class="chest-grid">'+CHESTS.map(ch=>
      '<div class="chest-card chest-admin" data-chest="'+ch.id+'" style="--chest-c:'+ch.color+'">'+
        '<span class="chest-count">∞</span>'+
        chestVisual(ch,'chest-ready')+
        '<div class="chest-name">'+ch.name+'</div>'+
        chestPromiseHTML(ch)+
      '</div>').join('')+'</div>';
  el.querySelectorAll('.chest-card').forEach(card=>{
    card.addEventListener('click',()=>{
      if(typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE)chestOpenNow(card.dataset.chest,chestBackToReserve);
    });
  });
}

// Retour au MENU PRINCIPAL après une ouverture lancée depuis le menu (coffre
// quotidien, coffre acheté en perles).
function chestBackToMenu(){
  if(typeof showPage==='function')showPage('face-jouer');
  renderMenuChests();
  if(typeof updAll==='function')updAll();
  if(typeof renderArmiesPage==='function')renderArmiesPage();
}

// ----------------------------------------------------------------
// COFFRE DE RÉAPPROVISIONNEMENT : IL S'OUVRE TOUT SEUL
// ----------------------------------------------------------------
// Il avait une carte sur le menu principal, avec son bouton « Récupérer ».
// Cette carte prenait un tiers de l'écran d'un téléphone pour un geste que
// personne n'a jamais hésité à faire : il n'y a rien à décider, le coffre est
// gratuit, quotidien, et toujours bon à prendre. Un bouton dont la réponse est
// toujours « oui » n'est pas un choix, c'est une corvée.
//
// Le coffre s'ouvre donc DE LUI-MÊME dès que son délai est écoulé — mais
// seulement quand le joueur est disponible pour le regarder :
//   · pas connecté      → à sa prochaine connexion (voir enterAccount)
//   · en pleine partie  → à la fin de la partie, une fois qu'il l'a quittée
//                         (goToMainMenu, js/cube-nav.js)
//   · déjà devant une   → on laisse passer et on retentera au prochain retour
//     fenêtre ouverte      au menu
//
// La cérémonie reste EXACTEMENT la même que pour un coffre gagné : le joueur
// l'ouvre lui-même d'un appui, et voit son contenu se révéler lot par lot.
// C'est l'attente et le bouton qui disparaissent, pas le plaisir.

// Le joueur est-il en train de faire autre chose ? On ne s'invite pas
// par-dessus une partie, une cinématique, un tutoriel ou un autre coffre.
function dailyChestBusy(){
  // Le plateau est à l'écran : la face « partie » du cube est au front, ou une
  // page en surimpression (composition, engagement, exercice…) est ouverte.
  // On ne se fie pas à GS.gameOver seul : cet objet existe dès le chargement,
  // avec gameOver à false, alors qu'aucune partie n'a commencé.
  if(document.querySelector('.cube-face[data-face="game"].is-front'))return true;
  if(document.querySelector('.page.active'))return true;
  if(_chestState)return true;                                      // coffre déjà ouvert
  if(typeof tutoActive==='function'&&tutoActive())return true;      // le savant parle
  // Tutoriel pas encore terminé : le savant distribue déjà ses propres
  // coffres et enchaîne les exercices, un septième coffre surgissant au
  // milieu de sa visite couperait son fil. Le quotidien attendra la sortie.
  if(typeof tutoDone==='function'&&!tutoDone())return true;
  const shown=id=>{const el=document.getElementById(id);return !!el&&
    (el.classList.contains('show')||el.classList.contains('active')||
     el.style.display==='flex');};
  if(shown('result-modal')||shown('chest-modal')||shown('confirm-modal')||
     shown('mp-modal')||shown('intro-modal')||shown('pseudo-gate')||
     shown('streak-modal'))return true;
  return false;
}

// Appelée à la connexion et à chaque retour au menu principal. Sans effet si
// le coffre a déjà été pris aujourd'hui : c'est dailyChestAvailable() qui
// décide, exactement comme avant.
function dailyChestMaybeOpen(){
  if(!CUR_ACC)return false;
  if(typeof dailyChestAvailable!=='function'||!dailyChestAvailable())return false;
  if(dailyChestBusy())return false;
  const gains=claimDailyChest();
  if(!gains)return false;
  const lots=Object.entries(gains).map(([pieceId,qty])=>({pieceId,qty,isNew:false}));
  // Un joueur sans une seule pièce en stock ne reçoit rien : inutile de lui
  // ouvrir un coffre vide (le cas ne se produit qu'en toute fin de partie de
  // dépouillement, mais il se produit).
  if(!lots.length)return false;
  // Réutilise la cérémonie des coffres, mais le gain est DÉJÀ appliqué :
  // applyOnClose reste à false pour ne pas créditer deux fois.
  showChestCeremony({name:DAILY_CHEST.name,color:'#c19a45'},lots,false,chestBackToMenu);
  return true;
}

// Conservée sous son ancien nom : renderMenuChests() l'appelle, et le menu
// n'a plus de carte quotidienne à dessiner. C'est le moment idéal pour
// vérifier si le coffre du jour est dû.
function renderDailyChest(){
  dailyChestMaybeOpen();
}

// Valeur d'un lot, pour classer la révélation du moins bon au meilleur : une
// pièce inédite est toujours le clou du spectacle (elle domine largement le
// score), sinon on se fie à la valeur de la pièce — le même repère qui
// pilote sa rareté de tirage, voir pieceRarityWeight dans js/economy.js —
// multipliée par sa quantité, et un bon tirage (chestLuckyChance) pèse un
// peu plus. Les perles suivent la même échelle grossière.
function chestLotValue(l){
  if(l.pearls!=null)return l.pearls*(l.lucky?1.3:1)*0.4;
  const p=PIECES.find(x=>x.id===l.pieceId);
  const v=Math.max(1,(p&&p.value)||3);
  return v*l.qty*(l.lucky?1.3:1);
}

// OUVRIR UNE CRÉATURE PASSE TOUJOURS EN DERNIER, quoi que vaille le reste.
// Ce n'est pas une question de barème : c'est le seul lot qui change ce
// qu'on peut aligner, les autres ne font qu'épaissir un stock. Cette place
// était tenue par un facteur 50 dans le barème ci-dessus — et une grosse
// poignée de perles finissait par passer devant, une fois sur mille, en
// reléguant le déblocage à l'avant-dernier rang.
function chestLotRank(a,b){
  return (a.isNew?1:0)-(b.isNew?1:0) || chestLotValue(a)-chestLotValue(b);
}

// ----------------------------------------------------------------
// CÉRÉMONIE D'OUVERTURE
// ----------------------------------------------------------------
// applyOnClose : true pour un vrai coffre (le contenu est crédité au moment
// où le joueur empoche), false quand le gain a déjà été appliqué ailleurs.
let _chestState=null;
function showChestCeremony(chest,lots,applyOnClose,onClose){
  const modal=document.getElementById('chest-modal');if(!modal)return;
  // Triés du moins bon au meilleur : la révélation se joue lot par lot, la
  // meilleure surprise doit donc arriver en dernier, pas au hasard de l'ordre
  // de tirage.
  const sorted=lots.slice().sort(chestLotRank);
  const st=_chestState={chest,lots:sorted,idx:-1,applyOnClose,onClose,opened:false,seq:null};
  modal.classList.remove('opening');
  modal.style.setProperty('--chest-c',chest.color||'#c19a45');
  const visual=document.getElementById('chest-visual');
  visual.style.setProperty('--chest-c',chest.color||'#c19a45');
  document.getElementById('chest-title').textContent=chest.name;
  document.getElementById('chest-hint').textContent='Cliquez le coffre pour l\'ouvrir';
  document.getElementById('chest-loot').innerHTML='';
  document.getElementById('chest-close').style.display='none';

  // COFFRE QU'ON BRISE (js/chest-break.js). Certains coffres — le Pion et le
  // Cavalier — ne s'ouvrent pas d'un clic : le joueur les FRAPPE jusqu'à ce
  // qu'ils éclatent. La séquence remplace alors le couvercle dessiné, et
  // rend la main ici une fois le socle vide, pour la révélation des lots.
  //
  // chestBreakReady dit non tant que les images ne sont pas chargées, et non
  // pour toujours si elles manquent du dépôt : dans les deux cas on retombe
  // sur le couvercle, et la cérémonie se joue comme avant.
  const canBreak=typeof chestBreakReady==='function'&&chestBreakReady(chest.id);
  visual.style.display=canBreak?'none':'';
  // Un coffre qu'on brise se joue sur FOND NOIR PLEIN, et non par-dessus
  // l'écran de fin de partie qu'on devinerait derrière : les planches ont
  // un fond noir, la scène doit continuer jusqu'aux bords de l'écran.
  modal.classList.toggle('pb-cinema',canBreak);
  // La page derrière est verrouillée pendant la cinématique : on ne fait pas
  // défiler un décor sous une scène plein écran. Et `scrollbar-gutter:stable`
  // (html, css/style.css) réserve en permanence la largeur d'une barre de
  // défilement — une bande de onze pixels sur le bord droit, à travers
  // laquelle on voyait la page, juste à côté d'une image censée aller
  // jusqu'au bord. Le temps de la scène, on la rend.
  document.documentElement.style.scrollbarGutter=canBreak?'auto':'';
  document.body.style.overflow=canBreak?'hidden':'';
  if(canBreak){
    st.seq=chestBreakMount(chest.id,()=>{
      if(_chestState!==st)return;
      // Le coffre est détruit. `pb-loot` recentre la scène autour de la carte
      // de lot : elle doit apparaître à l'endroit EXACT où la pièce vient
      // d'exploser, pas plus bas parce qu'un titre la pousse.
      modal.classList.add('opening','pb-loot');
      st.opened=true;
      chestRevealNext();
    });
  }
  modal.classList.add('show');
}

function chestCeremonyOpen(){
  if(!_chestState||_chestState.opened)return;
  _chestState.opened=true;
  const modal=document.getElementById('chest-modal');
  modal.classList.add('opening');
  document.getElementById('chest-hint').textContent='';
  if(typeof playSound==='function')playSound('promo');
  // Le couvercle s'anime (lidOpen, css/style.css) avant que quoi que ce soit
  // ne se révèle : la première récompense n'apparaît qu'une fois le coffre
  // visuellement ouvert.
  setTimeout(chestRevealNext,550);
}

// Affiche le lot suivant, un seul à la fois — clic après clic, du moins bon
// au meilleur. Une fois le dernier lot vu, le clic suivant ferme la
// cérémonie (chestCeremonyClose) : une seule et même action (cliquer) pilote
// tout l'enchaînement, jusqu'au retour à l'écran principal.
function chestRevealNext(){
  const st=_chestState;if(!st||!st.opened)return;
  st.idx++;
  if(st.idx>=st.lots.length){chestCeremonyClose();return;}
  const l=st.lots[st.idx],last=st.idx===st.lots.length-1;
  if(typeof playSound==='function')playSound('promo');
  // Un BON lot (double quantité, tirage favorable — voir chestLuckyChance
  // dans js/economy.js) se signale : sans marque, on ne distingue pas un
  // coup de chance d'un tirage moyen, et la moitié du plaisir passe à côté.
  const tag=l.isNew?'<div class="loot-new-tag">Inédite</div>'
    :(l.lucky?'<div class="loot-new-tag loot-lucky-tag">Bon lot</div>':'');
  let card;
  if(l.pearls!=null){
    // Lot de perles : même carte que les pièces, pour qu'il se lise comme une
    // récompense et non comme une note de bas de page.
    card='<div class="loot loot-reveal loot-pearl'+(l.lucky?' loot-lucky':'')+'">'+
      pearlIcon(4.5)+
      '<div class="loot-name">Perles</div>'+
      '<div class="loot-qty">+'+l.pearls+'</div>'+tag+
    '</div>';
  }else{
    const p=PIECES.find(x=>x.id===l.pieceId);
    card='<div class="loot loot-reveal'+(l.isNew?' loot-new':l.lucky?' loot-lucky':'')+'">'+
      pieceIcon(l.pieceId,'n',4.5)+
      '<div class="loot-name">'+escH(p?p.name:l.pieceId)+'</div>'+
      '<div class="loot-qty">+'+l.qty+'</div>'+tag+
    '</div>';
  }
  document.getElementById('chest-loot').innerHTML=
    '<div class="chest-loot-count">'+(st.idx+1)+' / '+st.lots.length+'</div>'+card;
  document.getElementById('chest-hint').textContent=
    last?'Cliquez pour tout récupérer':'Cliquez pour continuer';
  document.getElementById('chest-close').style.display=last?'':'none';
}

function chestCeremonyClose(){
  const st=_chestState;if(!st)return;
  _chestState=null;
  if(st.seq)st.seq.destroy();
  if(st.applyOnClose)chestApply(st.lots);
  document.getElementById('chest-modal').classList.remove('show','opening','pb-cinema','pb-loot');
  document.body.style.overflow='';
  document.documentElement.style.scrollbarGutter='';
  // Une créature inédite sort du coffre : on ouvre son exercice de
  // déplacement (js/tuto-drill.js) avant de rendre la main. Une pièce dont on
  // ignore le déplacement n'est pas vraiment débloquée.
  // Exception : pendant le tutoriel, c'est le script qui enchaîne coffre et
  // exercice (voir tutoRunReward), on ne le double pas ici.
  const fresh=(st.lots||[]).filter(l=>l.isNew).map(l=>l.pieceId);
  const inTuto=(typeof tutoActive==='function')&&tutoActive();
  if(fresh.length&&!inTuto&&typeof drillStart==='function'){
    // Les exercices s'enchaînent, PUIS on rend la main à l'appelant. C'est
    // lui qui sait où l'on doit atterrir : le menu si le coffre venait d'un achat,
    // le menu, l'écran de résultat si le coffre venait d'une victoire.
    const runNext=()=>{
      const id=fresh.shift();
      if(!id){if(st.onClose)st.onClose();return;}
      drillStart(id,runNext);
    };
    runNext();
    return;
  }
  if(st.onClose)st.onClose();
}

// Un même geste — cliquer — pilote toute la cérémonie : ouvre le coffre,
// révèle le lot suivant, puis referme une fois le dernier vu. Le coffre, la
// carte de lot affichée et le bouton "Récupérer" (visible seulement sur le
// dernier lot) déclenchent tous la même suite ; le fond sombre autour de la
// scène fait pareil, pour que personne ne reste coincé devant un coffre
// fermé ou un lot affiché.
function chestCeremonyAdvance(){
  const st=_chestState;if(!st)return;
  // PHASE DE DESTRUCTION (coffre qu'on brise) : chaque frappe fait avancer
  // d'une étape. Une frappe donnée pendant que l'impact précédent retombe
  // est ignorée — sans quoi un joueur qui martèle traverserait la séquence
  // entière sans rien voir, et l'explosion n'aurait été qu'un scintillement.
  if(st.seq&&!st.opened){if(!st.seq.busy())st.seq.next();return;}
  if(!st.opened)chestCeremonyOpen();
  else chestRevealNext();
}
document.getElementById('chest-visual')?.addEventListener('click',chestCeremonyAdvance);
document.getElementById('chest-break')?.addEventListener('click',chestCeremonyAdvance);
document.getElementById('chest-loot')?.addEventListener('click',()=>{
  if(_chestState&&_chestState.opened)chestRevealNext();
});
document.getElementById('chest-close')?.addEventListener('click',chestRevealNext);
document.getElementById('chest-modal')?.addEventListener('click',e=>{
  if(e.target.id!=='chest-modal')return;
  chestCeremonyAdvance();
});


