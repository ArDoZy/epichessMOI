// ================================================================
// ECONOMY-UI.JS : l'Armurerie (inventaire, coffres, échiquiers) et les
// affichages liés à l'économie ailleurs dans le jeu
// ================================================================
// Contient : le rendu de la face « Armurerie » du cube (#page-reserve), la
// cérémonie d'ouverture d'un coffre, les coffres illimités du mode admin
// (renderAdminChests), les six coffres du menu principal (renderMenuChests,
// qui portent aussi la série de victoires), le rappel de la mise pendant la
// partie, et le choix de l'échiquier.
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
// Le mode admin ne débloque plus les échiquiers : il ne donne rien
// directement, il ne fait qu'ouvrir des coffres illimités (voir
// renderAdminChests plus bas).
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
  return '<div class="jc-rail">'+CHESTS.map((ch,i)=>{
    const price=chestPearlPrice(ch.id);
    const state=menuChestState(i,streak);
    const afford=bal>=price;
    return '<button class="jc-chest '+state+(afford?'':' jc-poor')+'" data-chest="'+ch.id+'"'+
      ' style="--chest-c:'+ch.color+'" title="'+escH(ch.name)+' · '+price+' perles">'+
      chestVisual(ch,state==='chest-next'?'chest-ready':'')+
      '<span class="jc-name">'+escH(ch.name.replace(/^Coffre /,''))+'</span>'+
      '<span class="jc-price">'+pearlAmountHTML(price,1)+'</span>'+
    '</button>';
  }).join('')+'</div>'+
  '<div class="jc-foot"><span class="jc-bank">'+pearlAmountHTML(bal,1.1)+' perles</span>'+
    (streak>0?'<span class="jc-streak">'+streak+' victoire'+(streak>1?'s':'')+' d\'affilée</span>':'')+
  '</div>';
}
function renderMenuChests(){
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

function renderReservePage(){
  if(!CUR_ACC)return;
  renderPearls();
  renderDailyChest();
  renderAdminChests();
  renderBoardSkins();
  renderInventory();
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
// game-flow.js et tournoi.js faisaient cet enchaînement chacun de son côté,
// à trois lignes près identiques — et aucun des deux n'ouvrait le coffre, qui
// partait dans une file d'attente. Il est écrit ici une fois : le coffre
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

// Solde de perles, en haut de l'Armurerie.
function renderPearls(){
  const el=document.getElementById('rs-pearls');
  if(!el)return;
  el.innerHTML='<div class="pearl-bank">'+pearlIcon(2.2)+
    '<div class="pearl-bank-info">'+
      '<div class="pearl-bank-n">'+pearlBalance()+'</div>'+
      '<div class="pearl-bank-lbl">perles</div>'+
    '</div></div>';
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
    if(typeof showPage==='function')showPage('face-jouer');
    if(typeof onDone==='function')onDone();
    else renderMenuChests();
    if(typeof updAll==='function')updAll();
    if(typeof renderArmiesPage==='function')renderArmiesPage();
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
// COFFRES ILLIMITÉS DU MODE ADMIN
// ----------------------------------------------------------------
// C'est TOUT ce que fait le mode admin côté récompenses : les six coffres
// (Pion, Cavalier, Fou, Tour, Dame, Roi) deviennent ouvrables autant de fois
// qu'on veut. Il ne donne aucune pièce directement : le contenu est tiré par
// le même chestRoll() et crédité par le même chestApply() qu'un coffre gagné
// en jouant, et une pièce inédite s'y débloque comme partout ailleurs.
// La section est masquée (et vide) hors mode admin.
function renderAdminChests(){
  const sec=document.getElementById('rs-admin-sec');
  const el=document.getElementById('rs-admin-chests');
  if(!sec||!el)return;
  const on=(typeof ADMIN_MODE!=='undefined')&&ADMIN_MODE;
  sec.style.display=on?'':'none';
  if(!on){el.innerHTML='';return;}
  el.innerHTML='<div class="rs-admin-note">Coffres de test, ouvrables sans limite. Aucune pièce n\'est offerte : le contenu est tiré au sort comme pour un coffre gagné en jouant.</div>'+
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

function renderDailyChest(){
  const el=document.getElementById('rs-daily');if(!el)return;
  const ready=dailyChestAvailable();
  const owned=invOwnedIds().length;
  el.innerHTML='<div class="daily-card'+(ready?' daily-ready':'')+'">'+
    chestVisual({color:'#c19a45'},ready?'chest-ready':'')+
    '<div class="daily-info">'+
      '<div class="daily-name">'+DAILY_CHEST.name+'</div>'+
      '<div class="daily-desc">'+(ready
        ? '+'+DAILY_CHEST.perPiece+' exemplaires de chacune de vos '+owned+' pièces. Il revient chaque jour : perdre tout son stock n\'est jamais définitif.'
        : 'Déjà récupéré aujourd\'hui. Prochain coffre dans '+dailyChestCountdown()+'.')+'</div>'+
    '</div>'+
    (ready?'<button class="btn btn-gold" id="rs-daily-btn">Récupérer</button>':'')+
  '</div>';
  const btn=document.getElementById('rs-daily-btn');
  if(btn)btn.addEventListener('click',()=>{
    const gains=claimDailyChest();
    if(!gains)return;
    const lots=Object.entries(gains).map(([pieceId,qty])=>({pieceId,qty,isNew:false}));
    // Réutilise la cérémonie des coffres, mais le gain est DÉJÀ appliqué :
    // applyOnClose reste à false pour ne pas créditer deux fois.
    showChestCeremony({name:DAILY_CHEST.name,color:'#c19a45'},lots,false,chestBackToReserve);
  });
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
// ÉCHIQUIERS ET INVENTAIRE
// ----------------------------------------------------------------
function renderBoardSkins(){
  const el=document.getElementById('rs-skins');if(!el)return;
  const cur=getBoardSkin();
  el.innerHTML=BOARD_SKINS.map(s=>{
    const ok=boardSkinUnlocked(s);
    return '<div class="skin-card'+(s.id===cur.id?' skin-on':'')+(ok?'':' skin-locked')+'" data-id="'+s.id+'">'+
      '<div class="skin-prev" style="background-image:url(\''+s.file+'\')"></div>'+
      '<div class="skin-meta"><div class="skin-name">'+s.name+'</div>'+
      '<div class="skin-req">'+(ok?(s.id===cur.id?'En usage':s.desc):'Débloqué à '+s.eloRequired+' ELO')+'</div></div>'+
    '</div>';
  }).join('');
  el.querySelectorAll('.skin-card:not(.skin-locked)').forEach(card=>{
    card.addEventListener('click',()=>{if(setBoardSkin(card.dataset.id))renderBoardSkins();});
  });
}

function renderInventory(){
  const el=document.getElementById('rs-inv');if(!el)return;
  const ids=invOwnedIds().sort((a,b)=>{
    const pa=PIECES.find(p=>p.id===a),pb=PIECES.find(p=>p.id===b);
    return (CLASS_ORDER[pa?.class]||9)-(CLASS_ORDER[pb?.class]||9)||(pa?.value||0)-(pb?.value||0);
  });
  if(!ids.length){el.innerHTML='<div class="rs-empty">Aucune pièce. Récupérez le coffre de réapprovisionnement.</div>';return;}
  el.innerHTML=ids.map(id=>{
    const p=PIECES.find(x=>x.id===id);const n=invCount(id);
    const need=pieceDeployCount(id);
    return '<div class="inv-cell'+(n<need?' inv-out':'')+'">'+
      pieceIcon(id,'n',2.8)+
      '<div class="inv-name">'+escH(p?p.name:id)+'</div>'+
      '<div class="inv-qty">'+n+'</div>'+
      '<div class="inv-tag">'+(n<need?'Stock épuisé':'se déploie par '+need)+'</div>'+
    '</div>';
  }).join('');
}
