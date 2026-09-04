// ================================================================
// ECONOMY-UI.JS : la Guerre des clans (perles, échiquiers), les coffres du menu
// principal, et les affichages liés à l'économie ailleurs dans le jeu
// ================================================================
// Contient : le rendu de la face « Guerre des clans » du cube (#page-reserve), la
// texture du plateau (suit automatiquement l'ELO, voir bestUnlockedSkin),
// la cérémonie d'ouverture d'un coffre,
// les coffres illimités du mode test (renderAdminChests), la fenêtre de la
// récompense journalière (renderDailyModal, js/rewards-ui.js), la
// face « Magasin » du cube où les coffres s'achètent
// (renderMagasinPage/buyChestFromShop), le coffre de réapprovisionnement
// quotidien (renderDailyChest) et le rappel de la mise pendant la partie.
//
// Dépendances : economy.js (inventaire, coffres, quotidien),
// data-pieces.js (PIECES, CHESTS, BOARD_SKINS), piece-art.js
// (pieceIcon/pieceSVG), accounts.js (accGet/accSet, VV_UNLOCKED), main.js
// (escH, showPage).
// Utilisé par : cube-nav.js (ouverture des faces jouer/Guerre des clans/magasin),
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
// UN ÉCHIQUIER GAGNÉ NE SE REPERD PAS. On lit le SOMMET d'ELO atteint
// (vvLoadPeakElo, js/accounts.js) et non le classement du moment : sinon une
// mauvaise série reprendrait au joueur l'échiquier d'acier qu'il a mis
// trois semaines à ouvrir, ce qui n'a aucun sens et se verrait immédiatement.
function boardSkinUnlocked(skin){
  const peak=(typeof vvLoadPeakElo==='function')?vvLoadPeakElo()
            :(typeof vvLoadElo==='function'?vvLoadElo():0);
  return peak>=skin.eloRequired;
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
// LA COLONNE DE DROITE DU MENU (ORDINATEUR)
// ----------------------------------------------------------------
// Sur un grand écran, le menu principal était une colonne de téléphone posée
// au milieu de 900 px de vide. La colonne de droite (#menu-side, masquée hors
// de body.desk) y déplie trois choses que le petit écran est OBLIGÉ d'enfermer
// derrière un bouton : la récompense journalière, les deux voies de
// récompenses, et le prochain palier de la Voie.
//
// Les deux premières cartes ne sont PAS réécrites pour l'occasion : elles sont
// produites par js/rewards-ui.js, à partir des mêmes fonctions que les
// fenêtres des boutons. Deux affichages, une seule source — sinon les deux
// divergent au premier changement de règle.
function menuNextMilestoneHTML(){
  if(typeof UNLOCK_MILESTONES==='undefined')return '';
  const elo=(typeof vvLoadElo==='function')?vvLoadElo():0;
  // DEUX NOMBRES ICI, ET ILS NE JOUENT PAS LE MÊME RÔLE.
  // Le prochain jalon se cherche au-dessus du SOMMET atteint (`peak`) : un
  // jalon déjà franchi est encaissé pour toujours, le reproposer serait
  // mentir. Mais la DISTANCE et la jauge se mesurent depuis le classement
  // du moment (`elo`) : c'est de là qu'il faut réellement grimper.
  const peak=(typeof vvLoadPeakElo==='function')?vvLoadPeakElo():elo;
  const next=UNLOCK_MILESTONES.find(u=>u.eloRequired>peak);
  if(!next){
    return '<div class="ms-title">Diagonale de la Puissance</div>'+
      '<div class="ms-sub">Tous les paliers sont franchis. Il ne reste que le classement.</div>';
  }
  // Le point de départ de la jauge est le jalon PRÉCÉDENT, pas zéro : sinon
  // une barre presque pleine ne bouge plus visiblement d'un palier à l'autre
  // en haut de l'échelle (1700 → 2000 ELO se lit comme 85 % → 100 %).
  let from=0;
  UNLOCK_MILESTONES.forEach(u=>{if(u.eloRequired<=peak&&u.eloRequired>from)from=u.eloRequired;});
  const span=Math.max(1,next.eloRequired-from);
  const pct=Math.max(0,Math.min(100,Math.round((elo-from)/span*100)));
  // Trois natures de jalon, comme sur la Voie (voir renderVoiePage) : une
  // créature à débloquer, un lot (perles ou exemplaires), ou un simple palier
  // de rang.
  let visuel='',nom='';
  if(next.reward==='pearls'){
    visuel=(typeof pearlAmountHTML==='function')?pearlAmountHTML(next.amount,1.5):next.amount+' perles';
    nom='Perles';
  }else if(next.reward==='copies'){
    const p=PIECES.find(x=>x.id===next.copyId);
    visuel=(typeof pieceIcon==='function')?pieceIcon(next.copyId,'n'):'';
    nom=(p?p.name:'Exemplaires')+' ×'+next.qty;
  }else if(next.pieceId){
    const p=PIECES.find(x=>x.id===next.pieceId);
    visuel=(typeof pieceIcon==='function')?pieceIcon(next.pieceId,'n'):'';
    nom=p?p.name:'';
  }else{
    nom=next.label||'Palier';
  }
  return '<div class="ms-title">Prochain palier</div>'+
    '<div class="ms-next-row">'+
      (visuel?'<span class="ms-next-icon">'+visuel+'</span>':'')+
      '<div class="ms-next-txt">'+
        '<div class="ms-next-name">'+escH(nom)+'</div>'+
        '<div class="ms-next-elo">'+next.eloRequired+' ELO · encore '+Math.max(0,next.eloRequired-elo)+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="ms-gauge"><span style="width:'+pct+'%"></span></div>';
}
function renderMenuSidePanel(){
  const next=document.getElementById('ms-next');
  if(next)next.innerHTML=menuNextMilestoneHTML();
  // La récompense journalière et les deux voies qui ne dépendent pas de l'ELO
  // (js/rewards-ui.js) : leurs cartes de résumé en mode bureau, et les
  // pastilles des boutons du menu, qui elles valent sur tous les écrans.
  if(typeof renderMenuDailyCard==='function')renderMenuDailyCard();
  if(typeof renderMenuRewardsCard==='function')renderMenuRewardsCard();
  if(typeof renderRewardsBadge==='function')renderRewardsBadge();
}

// Conservée sous son nom historique : une douzaine d'appels y mènent
// (connexion, fin de partie, arrivée sur la face JOUER). Le menu n'a plus de
// rail de coffres à dessiner — il ne reste que le coffre quotidien à
// déclencher, l'identité à rafraîchir, et la colonne de droite (ordinateur)
// à remettre à jour. Elle se redessine même quand elle est masquée : c'est
// une poignée de nœuds, et la calculer seulement en mode bureau obligerait
// chaque appelant à savoir sur quel appareil il tourne.
function renderMenuChests(){
  renderDailyChest();
  if(typeof renderMenuIdentity==='function')renderMenuIdentity();
  renderMenuSidePanel();
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
// À QUOI RESSEMBLE UN COFFRE, PARTOUT DANS LE JEU
// ----------------------------------------------------------------
// UNE SEULE IMAGE PAR COFFRE, ET C'EST LA STATUETTE. Il y en avait deux : le
// coffre à couvercle dessiné en CSS (trois div : couvercle, caisse, serrure) à
// peu près partout, et la STATUETTE du Magasin — la première planche de la
// séquence de bris, celle-là même qu'on frappe à l'ouverture. Le joueur voyait
// donc un objet dans la série du jour et un autre au Magasin pour le même
// Coffre Pion, et un troisième encore en l'ouvrant.
//
// C'est la statuette qui gagne, partout : c'est elle qu'on brise, c'est elle
// qui dit de quelle pièce le coffre porte le nom. Le coffre dessiné ne reste
// que là où il n'y a pas le choix — la Dame et le Roi, dont les planches
// n'existent pas encore (voir assets/chests/README.md). Le jour où elles
// arriveront, il n'y aura rien à changer ici : le choix se fait sur
// l'EXISTENCE d'une séquence, pas sur une liste d'identifiants.
//
// Le socle et le fond noir de la planche sont effacés par le CSS
// (mix-blend-mode:screen et un cadrage à 190 %, voir .chest-pawn) : il ne
// reste que la pièce. ATTENTION en touchant aux états (acquis, à prendre,
// encore loin) : un `filter` ou une `opacity` posés sur le CONTENEUR isolent
// le mélange et feraient revenir le fond noir — ces états passent donc par la
// variable `--pawn-fx`, lue par l'image elle-même.
function chestVisual(chest,extraCls){
  const poster=(typeof chestBreakPoster==='function')?chestBreakPoster(chest.id):'';
  if(poster)
    return '<div class="chest chest-pawn '+(extraCls||'')+'" style="--chest-c:'+chest.color+'">'+
      '<img src="'+poster+'" alt="" draggable="false">'+
    '</div>';
  return '<div class="chest '+(extraCls||'')+'" style="--chest-c:'+chest.color+'">'+
    '<div class="chest-lid"></div><div class="chest-body"></div><div class="chest-lock"></div></div>';
}

// ----------------------------------------------------------------
// PERLES
// ----------------------------------------------------------------
// Dessinée et non écrite en emoji : l'emoji perle n'existe pas partout et
// change de forme d'un système à l'autre, alors que cette monnaie doit être
// reconnaissable instantanément dans un coffre comme sous un prix.
//
// LE DÉGRADÉ PORTE UN IDENTIFIANT UNIQUE À CHAQUE PERLE DESSINÉE. Il était
// figé (`pearlG`) : la page en compte des dizaines, toutes les références
// `url(#pearlG)` se résolvaient donc sur la PREMIÈRE du document — et si
// celle-là se trouvait dans un sous-arbre `display:none` (la colonne de droite
// du menu quand on n'est pas en mode bureau, un panneau d'onglet masqué),
// Chrome ne peignait plus AUCUNE perle de la page : il ne restait que le petit
// reflet blanc, qui, lui, n'a pas de dégradé. Un compteur suffit.
let _pearlGradSeq=0;
function pearlIcon(em){
  const s=(em||1.2)+'em';
  const gid='pearlG'+(++_pearlGradSeq);
  return '<svg class="pearl-icon" style="width:'+s+';height:'+s+'" viewBox="0 0 24 24" aria-hidden="true">'+
    '<defs><radialGradient id="'+gid+'" cx="35%" cy="30%">'+
      '<stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#dfeaf2"/>'+
      '<stop offset="100%" stop-color="#8fa6b8"/></radialGradient></defs>'+
    '<circle cx="12" cy="12" r="9" fill="url(#'+gid+')"/>'+
    '<circle cx="9" cy="9" r="2.4" fill="#fff" opacity=".85"/>'+
  '</svg>';
}
function pearlAmountHTML(n,em){
  return '<span class="pearl-amt">'+pearlIcon(em)+'<span>'+n+'</span></span>';
}

// La Guerre des clans ne montre plus le solde de perles : on n'y achète rien. Les
// perles servent aux coffres, et leur solde est écrit sous les coffres, au
// Magasin, sur la carte de chaque coffre et dans l'en-tête (voir
// renderMagasinPage), là où on décide de dépenser.
function renderReservePage(){
  if(!CUR_ACC)return;
  renderAdminChests();
}

// Ce que promet une carte de coffre, en une ligne : les deux nombres qui
// décident si on le vise ou non.
//
// LA PROMESSE EST UN NOMBRE D'EXEMPLAIRES, PAS UN NOMBRE DE LOTS. « 3–5 lots »
// ne disait rien de ce qu'on allait recevoir : un lot pouvait valoir un
// exemplaire comme huit. La fourchette affichée est maintenant celle du TOTAL
// (voir `total` dans CHESTS, js/data-pieces.js), c'est-à-dire exactement ce
// que le coffre donne.
function chestPromiseHTML(chest){
  const t=chest.total||[1,1];
  const pct=chest.newChance*100;
  return '<div class="chest-rar">'+t[0]+'–'+t[1]+' exemplaires · '+
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

// Retour à la Guerre des clans après une ouverture lancée depuis la Guerre des clans.
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
  // IL N'Y A PLUS DE COFFRE À OUVRIR ICI. Une victoire en donnait un, selon la
  // série du jour ; elle fait maintenant avancer la COLONNE DES VICTOIRES
  // (js/rewards.js), dont le palier s'encaisse quand le joueur le décide.
  // Reste donc la cinématique d'issue, puis le verdict.
  // LE PLATEAU FINIT SA PHRASE AVANT QUE LA FENÊTRE NE COUVRE L'ÉCRAN. Le
  // mat allume un effet sur l'échiquier (js/combat-fx.js) — une détonation
  // autour du roi, et sur une victoire une dissolution dorée qui emplit le
  // plateau. La cinématique d'issue étant un voile plein écran, la monter
  // aussitôt revenait à jouer cet effet pour personne. fxOutcomeDelay() dit
  // combien de temps l'attendre, et ne répond QUE si un mat vient d'être
  // joué : une nulle par répétition ou une pendule à zéro passent ici sans
  // avoir rien allumé, et ne doivent donc rien attendre.
  const suite=()=>{
    if(typeof playOutcomeCinematic==='function')playOutcomeCinematic(result,report,onDone);
    else setTimeout(onDone,400);
  };
  const attente=(typeof fxOutcomeDelay==='function')?fxOutcomeDelay():0;
  if(attente>0)setTimeout(suite,attente);
  else suite();
  return report;
}

// ----------------------------------------------------------------
// LE MAGASIN : achat d'un coffre contre des perles
// ----------------------------------------------------------------
// Les six mêmes coffres que ceux de la récompense journalière et de la colonne
// des victoires, au même contenu : l'achat ne fabrique pas une seconde
// économie, il donne simplement un second chemin vers la première. C'est le
// SEUL endroit du jeu où un coffre s'achète.
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
    // Un achat n'est pas une promotion de pion : c'est un coffre qui arrive.
    if(typeof playSound==='function')playSound('loot');
    // Cérémonie d'ouverture normale : un Coffre Pion acheté ici se BRISE
    // exactement comme un Coffre Pion gagné (js/chest-break.js).
    chestOpenNow(chest.id,renderMagasinPage);
  },{okLabel:'Acheter',cancelLabel:'Annuler',okClass:'btn-gold'});
}

// La carte du Magasin, en grand. Elle avait sa propre fonction de rendu, la
// seule à connaître la statuette ; c'est maintenant chestVisual() qui la
// donne à tout le jeu (voir sa note plus haut), et le Magasin n'a plus qu'à
// demander la grande taille.
//
// La carte ne dit que ce qu'il faut pour décider : quel coffre, et combien il
// coûte. Le nombre de lots et la probabilité de pièce inédite
// (chestPromiseHTML) restent réservés aux cartes du mode test.
function magasinChestCardHTML(chest){
  const price=chestPearlPrice(chest.id);
  const afford=pearlInfinite()||pearlBalance()>=price;
  return '<button class="shop-chest'+(afford?'':' shop-poor')+'" data-chest="'+chest.id+'" style="--chest-c:'+chest.color+'">'+
    chestVisual(chest,'chest-lg')+
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
  if(typeof tutoActive==='function'&&tutoActive())return true;      // l'Alchimiste parle
  // Tutoriel pas encore terminé : l'Alchimiste distribue déjà ses propres
  // coffres et enchaîne les exercices, un septième coffre surgissant au
  // milieu de sa visite couperait son fil. Le quotidien attendra la sortie.
  if(typeof tutoDone==='function'&&!tutoDone())return true;
  const shown=id=>{const el=document.getElementById(id);return !!el&&
    (el.classList.contains('show')||el.classList.contains('active')||
     el.style.display==='flex');};
  if(shown('result-modal')||shown('chest-modal')||shown('confirm-modal')||
     shown('mp-modal')||shown('lore-intro')||shown('page-account')||
     shown('page-classement')||shown('mp-duel-invite')||shown('ec-boot')||
     shown('daily-modal')||shown('joker-modal'))return true;
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
  // LE COFFRE SE FEND : bois qui casse puis souffle, et le plateau tremble.
  // C'est le moment le plus attendu du jeu, il ne peut pas emprunter le son
  // d'une promotion de pion.
  if(typeof playSound==='function')playSound('chest',{force:0.85,shakeEl:modal});
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
  // Un lot révélé : clair et court. Il se répète lot après lot, il reste
  // donc plus léger que l'ouverture elle-même.
  if(typeof playSound==='function')playSound('loot');
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
  // SUR LE DERNIER LOT, LE BOUTON PARLE TOUT SEUL. La phrase disait
  // « Cliquez pour tout récupérer » juste au-dessus d'un bouton « Récupérer »
  // qui apparaît au même instant et fait exactement cela : deux fois la même
  // consigne, dont l'une n'est même pas cliquable. On garde le bouton, qui
  // est la cible, et on retire la phrase. (Cliquer ailleurs referme toujours
  // la cérémonie — chestCeremonyAdvance —, on ne perd aucun geste.)
  document.getElementById('chest-hint').textContent=
    last?'':'Cliquez pour continuer';
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


