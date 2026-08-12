// ================================================================
// ECONOMY-UI.JS : l'Armurerie (perles, échiquiers), les coffres du menu
// principal, et les affichages liés à l'économie ailleurs dans le jeu
// ================================================================
// Contient : le rendu de la face « Armurerie » du cube (#page-reserve : les
// perles et le choix de l'échiquier), la cérémonie d'ouverture d'un coffre,
// les coffres illimités du mode test (renderAdminChests), les six coffres du
// menu principal (renderMenuChests, qui portent aussi la série de victoires),
// le coffre de réapprovisionnement quotidien — lui aussi sur le menu
// principal (renderDailyChest) — et le rappel de la mise pendant la partie.
//
// Dépendances : economy.js (inventaire, coffres, quotidien), data-pieces.js
// (PIECES, CHESTS, BOARD_SKINS), piece-art.js (pieceIcon/pieceSVG),
// accounts.js (accGet/accSet, VV_UNLOCKED), main.js (escH, showPage).
// Utilisé par : cube-nav.js (ouverture de la face), game-flow.js (mise en
// partie), game-render.js (texture de plateau).
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
  const id=accGet('board_skin',null);
  const s=id?boardSkinById(id):null;
  if(s&&boardSkinUnlocked(s))return s;
  return bestUnlockedSkin();
}
function setBoardSkin(id){
  const s=boardSkinById(id);
  if(!boardSkinUnlocked(s))return false;
  accSet('board_skin',s.id);
  applyBoardSkin();
  return true;
}
// La texture est posée DIRECTEMENT sur l'élément, et non passée par une
// variable CSS : une url() relative placée dans une custom property est
// résolue par rapport à la FEUILLE DE STYLE qui la consomme (donc css/…),
// pas par rapport au document. Le plateau cherchait css/assets/boards/*.svg
// et ne trouvait rien.
function applyBoardSkin(){
  const el=document.getElementById('game-board');
  if(!el)return;
  el.style.backgroundImage='url("'+getBoardSkin().file+'")';
}

// ----------------------------------------------------------------
// LES SIX COFFRES DU MENU PRINCIPAL
// ----------------------------------------------------------------
// Ils remplacent à la fois l'ancien badge « prochaine victoire : Coffre Fou »
// et l'ancienne boutique de l'Armurerie, et disent les deux choses d'un seul
// coup d'œil, dans l'ordre Pion → Roi :
//
//   allumé      coffre déjà décroché dans la série en cours
//   éclatant    celui que la PROCHAINE victoire donnerait
//   éteint      encore à plusieurs victoires de là
//
// Deux victoires d'affilée : Pion et Cavalier allumés, Fou éclatant, Tour,
// Dame et Roi en retrait. Il n'y a plus rien à lire, il n'y a qu'à regarder.
//
// Le prix en perles reste sous CHAQUE coffre, éclatant ou éteint : la série
// ne verrouille rien, on achète celui qu'on veut quand on en a les moyens.
function menuChestState(i,streak){
  // Série ≥ 6 : le Coffre Roi est à la fois acquis et reconduit à chaque
  // victoire suivante — il reste donc l'éclatant.
  const next=Math.min(streak,CHESTS.length-1);
  if(i===next)return 'chest-next';
  return i<streak?'chest-won':'chest-far';
}
function menuChestsHTML(){
  const streak=accGet('win_streak',0);
  const bal=pearlBalance();
  const balTxt=(typeof pearlInfinite==='function'&&pearlInfinite())?'∞':bal;
  // Le solde et la série sont deux faits de nature différente : ils étaient
  // juxtaposés sur une même ligne de 11 px, séparés par un espace. Ils
  // deviennent l'EN-TÊTE du rail, chacun sur son ancrage.
  let head='<div class="jc-head"><span class="jc-bank">'+pearlAmountHTML(balTxt,1.1)+' perles</span>'+
    (streak>0?'<span class="jc-streak">Série · '+streak+' victoire'+(streak>1?'s':'')+'</span>':'')+
  '</div>';
  let rail='<div class="jc-rail">'+CHESTS.map((ch,i)=>{
    const price=chestPearlPrice(ch.id);
    const state=menuChestState(i,streak);
    const afford=bal>=price;
    return '<button class="jc-chest '+state+(afford?'':' jc-poor')+'" data-chest="'+ch.id+'"'+
      ' style="--chest-c:'+ch.color+'" title="'+escH(ch.name)+' · '+price+' perles">'+
      chestVisual(ch,state==='chest-next'?'chest-ready':'')+
      '<span class="jc-name">'+escH(ch.name.replace(/^Coffre /,''))+'</span>'+
      '<span class="jc-price">'+pearlAmountHTML(price,1)+'</span>'+
    '</button>';
  }).join('')+'</div>';
  // UN CHEMIN, PAS UN MUR. Les prix hors de portée s'affichaient en rouge
  // d'alerte — or ne pas pouvoir s'offrir un coffre est l'état NORMAL du jeu,
  // pas une erreur, et le premier écran de l'application affichait donc deux
  // alarmes sans qu'il ne se soit rien passé. Les prix sont gris (voir
  // .jc-poor), et l'écart jusqu'au premier coffre atteignable est écrit.
  let foot='';
  const cheapest=CHESTS.map(c=>chestPearlPrice(c.id)).sort((a,b)=>a-b)[0];
  if(balTxt!=='∞'&&bal<cheapest){
    const miss=cheapest-bal;
    foot='<div class="jc-foot">'+miss+' perle'+(miss>1?'s':'')+' de plus pour le premier coffre</div>';
  }
  return head+rail+foot;
}
function renderMenuChests(){
  renderDailyChest();
  const el=document.getElementById('jouer-chests');
  if(el){
    el.innerHTML=CUR_ACC?menuChestsHTML():'';
    el.querySelectorAll('.jc-chest').forEach(b=>{
      b.addEventListener('click',()=>buyChestWithPearls(b.dataset.chest,renderMenuChests));
    });
  }
  // Le menu principal se rafraîchit ici (connexion, fin de partie) : c'est
  // aussi le moment de remettre à jour le pseudo et l'ELO affichés au-dessus,
  // qui viennent peut-être de bouger.
  if(typeof renderMenuIdentity==='function')renderMenuIdentity();
  renderMenuOpponent();
}

// CONTRE QUI PART-ON ? Le gros bouton COMBAT ne le disait pas : il fallait
// ouvrir la galerie des adversaires pour le savoir, puis revenir. La ligne
// vit sous le bouton, en retrait, et comble un vide qui n'était pas du calme
// mais de l'information manquante.
function renderMenuOpponent(){
  const el=document.getElementById('jouer-vs');
  if(!el)return;
  const o=(typeof aiChosenOpponent==='function')?aiChosenOpponent():null;
  el.textContent=o?o.name+' · '+o.elo+' ELO':'';
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
// Panneau latéral pendant la partie.
function renderGameStake(gs){
  const el=document.getElementById('game-stake');
  if(!el)return;
  if(!gs||!gs.playerArmy){el.innerHTML='';return;}
  el.innerHTML='<div class="gsb-title" style="margin-bottom:4px">Engagé dans cette partie</div>'+
    '<div class="gs-stake-row">'+stakeListHTML(gs.playerArmy,gs.playerColor||'w')+'</div>'+
    // Deux lignes séparées : en une seule phrase, les deux issues se lisaient
    // comme une seule règle et personne ne voyait où l'une finissait.
    '<div class="gs-streak">Défaite : toutes les pièces sont perdues.</div>'+
    '<div class="gs-streak">Victoire : seules les pièces capturées sont perdues.</div>';
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
// menu principal, là où on décide de dépenser (voir .jc-bank).
function renderReservePage(){
  if(!CUR_ACC)return;
  renderAdminChests();
  renderBoardSkins();
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
// ACHAT D'UN COFFRE CONTRE DES PERLES
// ----------------------------------------------------------------
// Les six mêmes coffres que ceux gagnés en enchaînant les victoires, au même
// contenu : l'achat ne fabrique pas une seconde économie, il donne simplement
// un second chemin vers la première. Un coffre acheté s'ouvre immédiatement.
// Il s'achète depuis le menu principal (renderMenuChests), quelle que soit la
// série en cours : la série éclaire les coffres, elle n'en interdit aucun.
//
// onDone : ce qu'il faut redessiner une fois le coffre empoché. Par défaut on
// revient au menu, c'est-à-dire là d'où l'achat est parti.
function buyChestWithPearls(chestId,onDone){
  const chest=chestById(chestId);
  const price=chestPearlPrice(chest.id);
  const back=()=>{
    // 'face-jouer' = le menu principal (cube-nav.js) : l'exercice de
    // déplacement d'une créature inédite a pu nous emmener ailleurs.
    if(typeof onDone==='function'){
      if(typeof showPage==='function')showPage('face-jouer');
      onDone();
      if(typeof updAll==='function')updAll();
      if(typeof renderArmiesPage==='function')renderArmiesPage();
    }else chestBackToMenu();
  };
  if(pearlBalance()<price){
    if(typeof showNotif==='function')
      showNotif('Il vous manque '+(price-pearlBalance())+' perles pour ce coffre.','err');
    return;
  }
  showConfirmModal('Acheter un '+chest.name+' pour '+price+' perles ?',()=>{
    if(!pearlBuyChest(chest.id))return;
    if(typeof playSound==='function')playSound('promo');
    chestOpenNow(chest.id,back);
  },{okLabel:'Acheter',cancelLabel:'Annuler',okClass:'btn-gold'});
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
  if(document.querySelector('.page.active:not(#page-login)'))return true;
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
     shown('mp-modal')||shown('intro-modal'))return true;
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

// ----------------------------------------------------------------
// CÉRÉMONIE D'OUVERTURE
// ----------------------------------------------------------------
// applyOnClose : true pour un vrai coffre (le contenu est crédité au moment
// où le joueur empoche), false quand le gain a déjà été appliqué ailleurs.
let _chestState=null;
function showChestCeremony(chest,lots,applyOnClose,onClose){
  const modal=document.getElementById('chest-modal');if(!modal)return;
  _chestState={chest,lots,applyOnClose,onClose,opened:false};
  modal.classList.remove('opening');
  modal.style.setProperty('--chest-c',chest.color||'#c19a45');
  document.getElementById('chest-visual').style.setProperty('--chest-c',chest.color||'#c19a45');
  document.getElementById('chest-title').textContent=chest.name;
  document.getElementById('chest-hint').textContent='Cliquez le coffre pour l\'ouvrir';
  document.getElementById('chest-loot').innerHTML='';
  document.getElementById('chest-close').style.display='none';
  modal.classList.add('show');
}

function chestCeremonyOpen(){
  if(!_chestState||_chestState.opened)return;
  _chestState.opened=true;
  const modal=document.getElementById('chest-modal');
  modal.classList.add('opening');
  document.getElementById('chest-hint').textContent='';
  if(typeof playSound==='function')playSound('promo');
  const loot=document.getElementById('chest-loot');
  // Les lots apparaissent un par un : c'est ce décalage qui fait la
  // révélation, tout afficher d'un coup rendrait l'animation inutile.
  loot.innerHTML=_chestState.lots.map((l,i)=>{
    const delay='style="animation-delay:'+(0.55+i*0.22)+'s"';
    // Lot de perles : même carte que les pièces, pour qu'il se lise comme une
    // récompense et non comme une note de bas de page.
    // Un BON lot (double quantité, tirage favorable — voir chestLuckyChance
    // dans js/economy.js) se signale : sans marque, on ne distingue pas un
    // coup de chance d'un tirage moyen, et la moitié du plaisir passe à côté.
    const tag=l.isNew?'<div class="loot-new-tag">Inédite</div>'
      :(l.lucky?'<div class="loot-new-tag loot-lucky-tag">Bon lot</div>':'');
    if(l.pearls){
      return '<div class="loot loot-pearl'+(l.lucky?' loot-lucky':'')+'" '+delay+'>'+
        pearlIcon(3)+
        '<div class="loot-name">Perles</div>'+
        '<div class="loot-qty">+'+l.pearls+'</div>'+tag+
      '</div>';
    }
    const p=PIECES.find(x=>x.id===l.pieceId);
    return '<div class="loot'+(l.isNew?' loot-new':l.lucky?' loot-lucky':'')+'" '+delay+'>'+
      pieceIcon(l.pieceId,'n',3)+
      '<div class="loot-name">'+escH(p?p.name:l.pieceId)+'</div>'+
      '<div class="loot-qty">+'+l.qty+'</div>'+tag+
    '</div>';
  }).join('');
  const delay=700+_chestState.lots.length*220;
  setTimeout(()=>{
    const btn=document.getElementById('chest-close');
    if(btn&&_chestState)btn.style.display='';
  },delay);
}

function chestCeremonyClose(){
  const st=_chestState;if(!st)return;
  _chestState=null;
  if(st.applyOnClose)chestApply(st.lots);
  document.getElementById('chest-modal').classList.remove('show','opening');
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

document.getElementById('chest-visual')?.addEventListener('click',chestCeremonyOpen);
document.getElementById('chest-close')?.addEventListener('click',chestCeremonyClose);
document.getElementById('chest-modal')?.addEventListener('click',e=>{
  // Un clic hors du coffre l'ouvre aussi, puis referme une fois révélé :
  // personne ne doit rester coincé devant un coffre fermé.
  if(e.target.id!=='chest-modal')return;
  if(_chestState&&!_chestState.opened)chestCeremonyOpen();
  else if(_chestState&&document.getElementById('chest-close').style.display!=='none')chestCeremonyClose();
});

// ----------------------------------------------------------------
// ÉCHIQUIERS
// ----------------------------------------------------------------
function renderBoardSkins(){
  const el=document.getElementById('rs-skins');if(!el)return;
  const cur=getBoardSkin();
  el.innerHTML=BOARD_SKINS.map(s=>{
    const ok=boardSkinUnlocked(s);
    // MONTRER LA MARCHANDISE. Le filtre s'appliquait à la CARTE entière
    // (opacity:.45 + grayscale) : quatre échiquiers verrouillés devenaient
    // quatre damiers gris indiscernables, et « Débloqué à 850 ELO » tombait
    // sous 2:1 de contraste. Une boutique dont on ne peut pas voir la
    // marchandise ne vend rien. Le filtre passe sur l'APERÇU seul, la texture
    // reste identifiable, et le pied de carte retrouve sa pleine opacité.
    //
    // UN MUR DEVIENT UNE ÉCHELLE. « Débloqué à 850 ELO » est un refus ;
    // « 23 / 850 » avec sa piste est une progression.
    const myElo=(typeof vvLoadElo==='function')?vvLoadElo():0;
    let state,bar='';
    if(!ok){
      state='<span class="skin-goal">'+myElo+' / '+s.eloRequired+' ELO</span>';
      const pct=Math.max(2,Math.min(100,myElo/s.eloRequired*100));
      bar='<div class="skin-track"><span style="width:'+pct+'%"></span></div>';
    }else state='<span class="skin-desc">'+escH(s.desc)+'</span>';
    return '<div class="skin-card'+(s.id===cur.id?' skin-on':'')+(ok?'':' skin-locked')+'" data-id="'+s.id+'"'+
      (ok?'':' title="Débloqué à '+s.eloRequired+' ELO"')+'>'+
      '<div class="skin-prev" style="background-image:url(\''+s.file+'\')">'+
        (ok?'':'<span class="skin-lock"><span class="lock-icon"></span></span>')+
        (s.id===cur.id?'<span class="skin-chip">Actif</span>':'')+
      '</div>'+
      '<div class="skin-meta"><div class="skin-name">'+escH(s.name)+'</div>'+
      '<div class="skin-req">'+state+'</div>'+bar+'</div>'+
    '</div>';
  }).join('');
  el.querySelectorAll('.skin-card:not(.skin-locked)').forEach(card=>{
    card.addEventListener('click',()=>{if(setBoardSkin(card.dataset.id))renderBoardSkins();});
  });
}

