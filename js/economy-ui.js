// ================================================================
// ECONOMY-UI.JS : l'Armurerie (perles, échiquiers), les coffres du menu
// principal, et les affichages liés à l'économie ailleurs dans le jeu
// ================================================================
// Contient : le rendu de la face « Armurerie » du cube (#page-reserve), la
// texture du plateau (suit automatiquement l'ELO, voir bestUnlockedSkin),
// la cérémonie d'ouverture d'un coffre,
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
  // Les prix hors de portée sont GRIS et non rouge d'alerte (voir .jc-poor) :
  // ne pas pouvoir s'offrir un coffre est l'état normal du jeu, pas une
  // erreur. Le refus reste expliqué au clic.
  return head+rail;
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
// menu principal, là où on décide de dépenser (voir .jc-bank).
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
  return v*l.qty*(l.lucky?1.3:1)*(l.isNew?50:1);
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
  const sorted=lots.slice().sort((a,b)=>chestLotValue(a)-chestLotValue(b));
  const st=_chestState={chest,lots:sorted,idx:-1,applyOnClose,onClose,opened:false,seq:null};
  modal.classList.remove('opening');
  modal.style.setProperty('--chest-c',chest.color||'#c19a45');
  const visual=document.getElementById('chest-visual');
  visual.style.setProperty('--chest-c',chest.color||'#c19a45');
  document.getElementById('chest-title').textContent=chest.name;
  document.getElementById('chest-hint').textContent='Cliquez le coffre pour l\'ouvrir';
  document.getElementById('chest-loot').innerHTML='';
  document.getElementById('chest-close').style.display='none';

  // COFFRE QU'ON BRISE (js/chest-break.js). Certains coffres — le Pion pour
  // l'instant — ne s'ouvrent pas d'un clic : le joueur les FRAPPE jusqu'à ce
  // qu'ils éclatent. La séquence remplace alors le couvercle dessiné, et
  // rend la main ici une fois le socle vide, pour la révélation des lots.
  //
  // chestBreakReady dit non tant que les images ne sont pas chargées, et non
  // pour toujours si elles manquent du dépôt : dans les deux cas on retombe
  // sur le couvercle, et la cérémonie se joue comme avant.
  const canBreak=typeof chestBreakReady==='function'&&chestBreakReady(chest.id);
  visual.style.display=canBreak?'none':'';
  if(canBreak){
    st.seq=chestBreakMount(chest.id,()=>{
      if(_chestState!==st)return;
      // Le coffre est détruit : les rayons se mettent à tourner derrière la
      // scène vide, exactement comme après l'ouverture d'un couvercle.
      modal.classList.add('opening');
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


