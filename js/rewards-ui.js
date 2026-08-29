// ================================================================
// REWARDS-UI.JS : la page « Récompenses » (colonne, rangée, quêtes)
// ================================================================
// Une page, deux onglets, et rien d'autre :
//
//   COLONNE DES VICTOIRES  une colonne verticale de trente paliers, qu'on
//                          descend d'un cran par victoire. Le palier dû
//                          s'encaisse à la main : coffre (vraie cérémonie
//                          d'ouverture) ou jokers (fenêtre de conversion).
//   RANGÉE DE LA RICHESSE  une rangée horizontale de vingt-cinq paliers de
//                          perles, payés en tickets, et les trois quêtes du
//                          jour qui donnent ces tickets.
//
// Le sens de lecture n'est pas une coquetterie : une COLONNE se lit de haut en
// bas, une RANGÉE de gauche à droite, et la DIAGONALE (js/voie.js) monte en
// zigzag. Trois voies, trois gestes, on sait où l'on est sans lire le titre.
//
// Dépendances : rewards.js (tout l'état et toutes les règles), economy-ui.js
// (chestVisual, chestOpenNow, pearlAmountHTML), economy.js (invCount),
// piece-art.js (pieceIcon), main.js (showPage, escH, showNotif).
// Utilisé par : le bouton « Récompenses » du menu principal (index.html),
// economy-ui.js (renderMenuChests rafraîchit la pastille et la carte de la
// colonne de droite en mode bureau).
// ================================================================

// ----------------------------------------------------------------
// DEUX MONNAIES DESSINÉES, comme la perle
// ----------------------------------------------------------------
// Ni emoji ni caractère : un emoji « ticket » n'existe pas partout et change
// de forme d'un système à l'autre (voir pearlIcon, js/economy-ui.js).
//
// CHAQUE ICÔNE A SON PROPRE IDENTIFIANT DE DÉGRADÉ. Avec un id figé, toutes
// les références `url(#...)` de la page se résolvent sur la PREMIÈRE
// définition ; si celle-là dort dans un sous-arbre `display:none` — la carte
// de la colonne de droite hors mode bureau, l'onglet masqué d'à côté —, plus
// aucune icône de la page n'est peinte. Un compteur suffit (même correctif que
// pearlIcon).
let _rwGradSeq=0;
function ticketIcon(em){
  const s=(em||1.2)+'em';
  const gid='tikG'+(++_rwGradSeq);
  return '<svg class="ticket-icon" style="width:'+s+';height:'+s+'" viewBox="0 0 24 24" aria-hidden="true">'+
    '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0%" stop-color="#8fd6c2"/><stop offset="55%" stop-color="#4aa88c"/>'+
      '<stop offset="100%" stop-color="#27614f"/></linearGradient></defs>'+
    '<path d="M3 7.6A1.6 1.6 0 0 1 4.6 6h14.8A1.6 1.6 0 0 1 21 7.6v2.05a2.5 2.5 0 0 0 0 4.7v2.05A1.6 1.6 0 0 1 19.4 18H4.6A1.6 1.6 0 0 1 3 16.4v-2.05a2.5 2.5 0 0 0 0-4.7Z" fill="url(#'+gid+')"/>'+
    '<path d="M14.2 7.4v9.2" stroke="#0d221c" stroke-width="1.1" stroke-dasharray="1.6 1.7" opacity=".85"/>'+
  '</svg>';
}
function ticketAmountHTML(n,em){
  return '<span class="ticket-amt">'+ticketIcon(em)+'<span>'+n+'</span></span>';
}
// Le joker : une carte, parce que c'est exactement ce qu'il est — un lot qu'on
// retourne soi-même du côté qu'on veut.
function jokerIcon(em){
  const s=(em||1.2)+'em';
  const gid='jokG'+(++_rwGradSeq);
  return '<svg class="joker-icon" style="width:'+s+';height:'+s+'" viewBox="0 0 24 24" aria-hidden="true">'+
    '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0%" stop-color="#f6e6b0"/><stop offset="48%" stop-color="#c9a84c"/>'+
      '<stop offset="100%" stop-color="#7d55b4"/></linearGradient></defs>'+
    '<rect x="4.5" y="2.5" width="15" height="19" rx="3.2" fill="url(#'+gid+')"/>'+
    '<rect x="6.3" y="4.3" width="11.4" height="15.4" rx="2.2" fill="none" stroke="#2a1f0d" stroke-width=".9" opacity=".5"/>'+
    '<path d="M12 6.9l1.55 3.5 3.8.36-2.86 2.52.85 3.71L12 15.03l-3.34 1.96.85-3.71-2.86-2.52 3.8-.36Z" fill="#241a09"/>'+
  '</svg>';
}
function jokerAmountHTML(n,em){
  return '<span class="joker-amt">'+jokerIcon(em)+'<span>'+n+'</span></span>';
}

// ----------------------------------------------------------------
// ONGLET COURANT
// ----------------------------------------------------------------
// Il n'est PAS enregistré sur le compte : on ouvre toujours sur la colonne,
// qui est la voie où quelque chose attend le plus souvent. La seule exception
// est l'ouverture explicite sur la rangée (openRewardsPage('rangee')), par
// exemple depuis la carte de la colonne de droite en mode bureau.
let _rwTab='colonne';

function rewardsSetTab(tab){
  _rwTab=(tab==='rangee')?'rangee':'colonne';
  document.querySelectorAll('#page-rewards .rw-tab').forEach(b=>{
    b.classList.toggle('is-on',b.dataset.tab===_rwTab);
    b.setAttribute('aria-selected',b.dataset.tab===_rwTab?'true':'false');
  });
  const col=document.getElementById('rw-pane-colonne');
  const row=document.getElementById('rw-pane-rangee');
  if(col)col.hidden=_rwTab!=='colonne';
  if(row)row.hidden=_rwTab!=='rangee';
  // La colonne tient dans l'écran (sa bande défile chez elle), la rangée
  // dépasse et fait défiler la page : voir `rw-fill` dans [REWARDS].
  document.getElementById('page-rewards')?.classList.toggle('rw-fill',_rwTab==='colonne');
  // Le positionnement se fait ICI et pas au rendu : un panneau `hidden` n'a
  // aucune géométrie, un défilement calculé dessus ne fait rien du tout — la
  // rangée s'ouvrait donc sur sa première case au lieu du palier en cours dès
  // qu'on arrivait dessus par l'onglet.
  rewardsScrollCurrent();
}

// Amène le palier en cours au milieu de SA bande défilante — et de rien
// d'autre. scrollIntoView() entraînerait aussi la page derrière : la colonne
// s'ouvrait en ayant fait défiler le titre et les onglets hors de l'écran.
function rwScrollTo(strip,axis){
  if(!strip)return;
  const target=strip.querySelector('.rw-due')||strip.querySelector('.rw-next');
  if(!target)return;
  if(axis==='x')strip.scrollLeft=Math.max(0,target.offsetLeft-(strip.clientWidth-target.offsetWidth)/2);
  else strip.scrollTop=Math.max(0,target.offsetTop-(strip.clientHeight-target.offsetHeight)/2);
}
function rewardsScrollCurrent(){
  requestAnimationFrame(()=>{
    if(_rwTab==='colonne')rwScrollTo(document.getElementById('rw-col-strip'),'y');
    else rwScrollTo(document.getElementById('rw-row-strip'),'x');
  });
}

// ----------------------------------------------------------------
// LA COLONNE DES VICTOIRES
// ----------------------------------------------------------------
// Quatre états, les mêmes que la série du jour (voir [STREAK] dans
// css/style.css), pour qu'on n'ait pas deux vocabulaires visuels à apprendre :
//   rw-got    palier déjà encaissé
//   rw-due    palier gagné, pas encore encaissé — c'est lui qui pulse
//   rw-next   ce que la prochaine victoire ouvrirait
//   rw-far    encore loin
function rwColState(i){
  const claimed=colClaimed(),wins=colWins();
  if(i<claimed)return 'rw-got';
  if(i<wins)return 'rw-due';
  if(i===wins)return 'rw-next';
  return 'rw-far';
}
// Le visuel d'un palier : le coffre dessiné (le même que partout ailleurs) ou
// la carte de joker.
function rwStepVisual(step,state){
  if(step.chest){
    const ch=chestById(step.chest);
    return '<div class="rw-step-vis" style="--chest-c:'+ch.color+'">'+
      chestVisual(ch,state==='rw-due'?'chest-ready':'')+'</div>';
  }
  return '<div class="rw-step-vis rw-step-joker">'+jokerIcon(2.6)+'</div>';
}
function rwStepName(step){
  if(step.chest)return chestById(step.chest).name;
  return step.jokers+' joker'+(step.jokers>1?'s':'');
}
function rwColRowsHTML(){
  return VICTORY_COLUMN.map((step,i)=>{
    const state=rwColState(i);
    const mark=state==='rw-got'?'<span class="streak-mark streak-mark-ok">✓</span>'
      :state==='rw-due'?'<span class="streak-mark streak-mark-next">À prendre</span>'
      :state==='rw-next'?'<span class="streak-mark rw-mark-next">Prochaine victoire</span>':'';
    return '<div class="rw-step '+state+'" data-idx="'+i+'">'+
      '<div class="rw-step-num">'+(i+1)+'</div>'+
      rwStepVisual(step,state)+
      '<div class="rw-step-txt">'+
        '<div class="rw-step-name">'+escH(rwStepName(step))+'</div>'+
        '<div class="rw-step-sub">'+(step.chest?'Victoire n° '+(i+1):'Au choix : '+step.jokers+' exemplaires d\'une créature')+'</div>'+
      '</div>'+mark+
    '</div>';
  }).join('');
}
// LE BANDEAU NE PARLE PLUS — ET IL NE DESSINE PLUS NON PLUS. Il a porté le
// nom de la voie (que l'onglet juste au-dessus dit déjà, en gros et en or),
// une phrase de progression et un compteur « 5 / 30 paliers » ; puis, une
// fois ces trois-là retirés, une jauge de progression au-dessus de la
// colonne. Cette barre disait la même chose une quatrième fois, en plus
// vague : la colonne MONTRE déjà les paliers cochés, celui qui pulse et ceux
// qui attendent, un par un. Ne reste que le bouton, c'est-à-dire l'action —
// et sans rien à récupérer, pas de bandeau du tout : un cadre vide n'est pas
// une information (même règle que la rangée, plus bas).
function renderRewardsColonne(){
  const pane=document.getElementById('rw-pane-colonne');
  if(!pane)return;
  const due=colPending();
  pane.innerHTML=
    (due?'<div class="rw-banner">'+
      '<button class="btn btn-gold rw-claim" id="rw-claim-col">Récupérer'+(due>1?' ('+due+')':'')+'</button>'+
    '</div>':'')+
    '<div class="rw-col-strip" id="rw-col-strip">'+rwColRowsHTML()+'</div>';
  document.getElementById('rw-claim-col')?.addEventListener('click',rewardsClaimColumn);
}

// Encaisser le palier suivant. Un coffre s'ouvre avec SA cérémonie (la même
// qu'un coffre gagné en série ou acheté au Magasin, bris compris) ; des jokers
// ouvrent la fenêtre de conversion.
function rewardsClaimColumn(){
  const step=colClaimNext();
  if(!step){renderRewardsColonne();return;}
  if(step.chest){
    if(typeof chestOpenNow==='function')chestOpenNow(step.chest,rewardsBackToPage);
    else rewardsBackToPage();
    return;
  }
  jokerAdd(step.jokers);
  openJokerModal();
}
// Retour sur la page après une fenêtre passée par-dessus (cérémonie de coffre,
// exercice de déplacement d'une créature inédite). La page est peut-être
// encore active — showPage la remet au premier plan dans tous les cas.
function rewardsBackToPage(){
  if(typeof showPage==='function')showPage('page-rewards');
  renderRewardsPage();
  if(typeof updAll==='function')updAll();
}

// ----------------------------------------------------------------
// LA RANGÉE DE LA RICHESSE
// ----------------------------------------------------------------
function rwRichState(i){
  const claimed=richClaimed();
  if(i<claimed)return 'rw-got';
  if(i===claimed)return richCanClaim()?'rw-due':'rw-next';
  return 'rw-far';
}
function rwRichCellsHTML(){
  return WEALTH_ROW.map((step,i)=>{
    const state=rwRichState(i);
    return '<div class="rw-cell '+state+'" data-idx="'+i+'">'+
      '<div class="rw-cell-num">'+(i+1)+'</div>'+
      '<div class="rw-cell-gain">'+pearlAmountHTML(step.pearls,1.5)+'</div>'+
      '<div class="rw-cell-cost">'+ticketAmountHTML(step.cost,1.3)+'</div>'+
    '</div>';
  }).join('');
}
function rwQuestCardHTML(q){
  const tpl=questTpl(q.id);
  if(!tpl)return '';
  const target=questTarget(q),prog=Math.min(target,q.prog||0);
  const pct=Math.round(prog/target*100);
  const icon=q.pieceId?pieceIcon(q.pieceId,'n'):'';
  return '<div class="rw-quest'+(q.done?' rw-quest-done':'')+'">'+
    '<div class="rw-quest-icon">'+(icon||ticketIcon(1.6))+'</div>'+
    '<div class="rw-quest-body">'+
      '<div class="rw-quest-label">'+escH(questLabel(q))+'</div>'+
      '<div class="ms-gauge"><span style="width:'+pct+'%"></span></div>'+
      '<div class="rw-quest-prog">'+prog+' / '+target+'</div>'+
    '</div>'+
    '<div class="rw-quest-pay">'+(q.done
      ?'<span class="streak-mark streak-mark-ok">✓</span>'
      :ticketAmountHTML(questTickets(q),1.15))+'</div>'+
  '</div>';
}
function renderRewardsRangee(){
  const pane=document.getElementById('rw-pane-rangee');
  if(!pane)return;
  const quests=questsToday();
  const can=richCanClaim();
  const jok=jokerBalance();
  // MÊME RÈGLE QUE LA COLONNE : le bandeau ne redit pas ce que la rangée
  // montre. Le nom de la voie est sur l'onglet, le palier en cours pulse dans
  // la rangée avec son prix en tickets écrit dessus, et le solde se lit sur
  // les quêtes. Il ne reste donc que le bouton — et sans bouton, pas de
  // bandeau du tout : un cadre vide n'est pas une information.
  pane.innerHTML=
    (can?'<div class="rw-banner">'+
      '<button class="btn btn-gold rw-claim" id="rw-claim-rich">Récupérer</button></div>':'')+
    '<div class="rw-row-strip" id="rw-row-strip">'+rwRichCellsHTML()+'</div>'+
    (jok?'<div class="rw-joker-call">'+jokerAmountHTML(jok,1.6)+
      '<span>en attente de conversion</span>'+
      '<button class="btn btn-primary" id="rw-open-joker">Convertir</button></div>':'')+
    '<div class="rw-quests">'+
      // Le titre suffit : la note qui le suivait (« Trois quêtes par jour,
      // tirées sur les créatures que vous possédez. Les tickets sont versés
      // dès la quête accomplie ; elles repartent demain. ») décrivait en
      // trois lignes ce que les trois cartes juste en dessous montrent —
      // elles sont trois, elles portent le logo d'une créature possédée, et
      // chacune affiche les tickets qu'elle verse.
      '<div class="rw-sec-title">Quêtes du jour</div>'+
      (quests.length?quests.map(rwQuestCardHTML).join(''):'<div class="rw-sec-note">Aucune quête : jouez une première bataille.</div>')+
    '</div>';
  document.getElementById('rw-claim-rich')?.addEventListener('click',rewardsClaimRich);
  document.getElementById('rw-open-joker')?.addEventListener('click',openJokerModal);
}
function rewardsClaimRich(){
  const got=richClaimNext();
  if(!got){renderRewardsRangee();return;}
  // Un palier franchi : la fanfare de l'interface, la seule.
  if(typeof playSound==='function')playSound('rank');
  if(typeof showNotif==='function')showNotif('+'+got.pearls+' perles','ok');
  renderRewardsPage();
  if(typeof updAll==='function')updAll();
}

// ----------------------------------------------------------------
// LA FENÊTRE DES JOKERS
// ----------------------------------------------------------------
// « Vous avez N jokers. En quelle créature ? » — une grille des créatures
// possédées, le stock actuel sous chacune, et la conversion se fait d'un
// appui. Fermer sans choisir ne perd rien : les jokers restent en réserve et
// la fenêtre se rouvre depuis la rangée.
function jokerGridHTML(){
  const list=jokerChoices();
  if(!list.length)return '<div class="rw-sec-note">Aucune créature à renforcer pour l\'instant.</div>';
  return '<div class="joker-grid">'+list.map(p=>
    '<button class="joker-choice" data-piece="'+p.id+'">'+
      pieceIcon(p.id,'n')+
      '<div class="joker-choice-name">'+escH(p.name)+'</div>'+
      '<div class="joker-choice-stock">'+((typeof invCount==='function')?invCount(p.id):0)+' en stock</div>'+
    '</button>').join('')+'</div>';
}
function renderJokerModal(){
  const n=jokerBalance();
  const sub=document.getElementById('joker-sub');
  if(sub)sub.innerHTML=n
    ?'Vous avez '+jokerAmountHTML(n,1.15)+'. Choisissez la créature : vous en recevrez '+n+' exemplaire'+(n>1?'s':'')+'.'
    :'Aucun joker en réserve.';
  const host=document.getElementById('joker-grid');
  if(!host)return;
  host.innerHTML=n?jokerGridHTML():'';
  host.querySelectorAll('.joker-choice').forEach(b=>{
    b.addEventListener('click',()=>jokerPick(b.dataset.piece));
  });
}
function openJokerModal(){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return;
  renderJokerModal();
  document.getElementById('joker-modal')?.classList.add('show');
}
function closeJokerModal(){
  document.getElementById('joker-modal')?.classList.remove('show');
  renderRewardsPage();
}
function jokerPick(pieceId){
  const p=PIECES.find(x=>x.id===pieceId);
  if(!p)return;
  const n=jokerBalance();
  showConfirmModal('Convertir '+n+' joker'+(n>1?'s':'')+' en '+n+' '+p.name+' ?',()=>{
    const got=jokerConvert(pieceId);
    if(!got)return;
    // Un joker devient une créature : c'est bien une naissance, 'promo' est
    // ici le bon son et non un emprunt.
    if(typeof playSound==='function')playSound('promo');
    if(typeof showNotif==='function')showNotif('+'+got+' '+p.name,'ok');
    closeJokerModal();
    if(typeof updAll==='function')updAll();
  },{okLabel:'Convertir',cancelLabel:'Annuler',okClass:'btn-gold'});
}

// ----------------------------------------------------------------
// LA PAGE
// ----------------------------------------------------------------
function renderRewardsPage(){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return;
  renderRewardsColonne();
  renderRewardsRangee();
  rewardsSetTab(_rwTab);
  renderRewardsBadge();
}
function openRewardsPage(tab){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return;
  _rwTab=(tab==='rangee')?'rangee':'colonne';
  renderRewardsPage();
  showPage('page-rewards');
}
// Appelée par rewards.js dès qu'une quête avance : la page ne se redessine que
// si elle est réellement à l'écran, la pastille du menu toujours.
function rewardsRefreshUI(){
  const page=document.getElementById('page-rewards');
  if(page&&page.classList.contains('active'))renderRewardsPage();
  else renderRewardsBadge();
}
// La pastille du bouton « Récompenses » : allumée seulement quand quelque
// chose attend vraiment.
function renderRewardsBadge(){
  const b=document.getElementById('jouer-rewards-badge');
  if(!b)return;
  const n=(typeof rewardsPending==='function')?rewardsPending():0;
  b.textContent=n>9?'9+':String(n);
  b.style.display=n?'':'none';
}

// La carte de la colonne de droite (mode bureau) : elle résume les deux voies
// en quatre lignes et ouvre la page. Même principe que le rail de la série du
// jour — le téléphone cache, l'ordinateur montre.
function menuRewardsCardHTML(){
  if(typeof VICTORY_COLUMN==='undefined')return '';
  const due=colPending();
  const next=colNextIdx()>=0?VICTORY_COLUMN[colNextIdx()]:null;
  const step=richNextStep();
  return '<div class="ms-title">Récompenses</div>'+
    '<div class="ms-next-row">'+
      '<span class="ms-next-icon">'+(next
        ?(next.chest?chestVisual(chestById(next.chest),''):jokerIcon(2))
        :'<span class="streak-mark streak-mark-ok">✓</span>')+'</span>'+
      '<div class="ms-next-txt">'+
        '<div class="ms-next-name">'+(next?escH(rwStepName(next)):'Colonne terminée')+'</div>'+
        '<div class="ms-next-elo">Colonne · '+colClaimed()+'/'+colTotal()+
          (due?' · '+due+' à prendre':'')+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="ms-next-row" style="margin-top:12px">'+
      '<span class="ms-next-icon">'+ticketIcon(1.9)+'</span>'+
      '<div class="ms-next-txt">'+
        '<div class="ms-next-name">'+ticketBalance()+' ticket'+(ticketBalance()>1?'s':'')+'</div>'+
        '<div class="ms-next-elo">Rangée · '+richClaimed()+'/'+richTotal()+
          (step?' · prochain à '+step.cost:'')+'</div>'+
      '</div>'+
    '</div>'+
    '<button class="btn btn-ghost ms-open" id="ms-rewards-open">Ouvrir</button>';
}
function renderMenuRewardsCard(){
  const card=document.getElementById('ms-rewards');
  if(!card)return;
  card.innerHTML=menuRewardsCardHTML();
  document.getElementById('ms-rewards-open')?.addEventListener('click',()=>openRewardsPage());
}

// ----------------------------------------------------------------
// CÂBLAGE
// ----------------------------------------------------------------
document.getElementById('jouer-rewards')?.addEventListener('click',()=>openRewardsPage());
document.getElementById('rw-ok')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('face-jouer');
});
document.querySelectorAll('#page-rewards .rw-tab').forEach(b=>{
  b.addEventListener('click',()=>rewardsSetTab(b.dataset.tab));
});
document.getElementById('joker-close')?.addEventListener('click',closeJokerModal);
document.getElementById('joker-modal')?.addEventListener('click',e=>{
  if(e.target.id==='joker-modal')closeJokerModal();
});
