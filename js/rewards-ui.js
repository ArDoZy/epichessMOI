// ================================================================
// REWARDS-UI.JS : la récompense journalière et la page des deux voies
// ================================================================
// La FENÊTRE DE LA RÉCOMPENSE JOURNALIÈRE (#daily-modal) : le cycle de trente
// lots, celui d'aujourd'hui au milieu, un bouton pour le prendre. Elle a
// remplacé la fenêtre de la « série du jour » et en garde toute la
// carrosserie (classes .streak-* de css/style.css) : c'est la même chose, une
// colonne de lots dont un seul est en jeu.
//
// Puis la PAGE des deux voies, deux onglets, et rien d'autre :
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
// Utilisé par : les trois boutons du menu principal (index.html) —
// « Récompense journalière », « Colonne des victoires », « Rangée de la
// richesse » —, et economy-ui.js (renderMenuChests rafraîchit les pastilles
// et les cartes de la colonne de droite en mode bureau).
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
// LA FENÊTRE DE LA RÉCOMPENSE JOURNALIÈRE
// ----------------------------------------------------------------
// Trente lignes, une par jour du cycle, et le lot d'aujourd'hui au milieu. Les
// états sont ceux de toutes les autres voies du jeu (voir [STREAK] dans
// css/style.css), pour qu'il n'y ait pas un deuxième vocabulaire visuel à
// apprendre :
//   chest-won   déjà pris (les jours passés de ce tour de cycle)
//   chest-next  aujourd'hui — c'est lui qui respire
//   chest-far   les jours suivants
function dailyRowState(i,cursor){
  if(i<cursor)return 'chest-won';
  if(i===cursor)return 'chest-next';
  return 'chest-far';
}
// Le visuel d'un lot : le coffre dessiné, la perle ou la carte de joker.
function dailyStepVisual(step,state){
  if(step.chest){
    const ch=chestById(step.chest);
    return '<div class="streak-row-chest" style="--chest-c:'+ch.color+'">'+
      chestVisual(ch,state==='chest-next'?'chest-ready':'')+'</div>';
  }
  if(step.pearls)return '<div class="streak-row-chest">'+pearlIcon(2.4)+'</div>';
  return '<div class="streak-row-chest">'+jokerIcon(2.4)+'</div>';
}
function dailyStepName(step){
  if(step.chest)return chestById(step.chest).name;
  if(step.pearls)return step.pearls+' perle'+(step.pearls>1?'s':'');
  return step.jokers+' joker'+(step.jokers>1?'s':'');
}
// L'ORDRE EST CELUI DU DOM : DAILY_REWARDS va du premier jour du cycle au
// trentième, et les lignes se posent de haut en bas.
function dailyRowsHTML(){
  const cursor=dailyRewardCursor();
  return DAILY_REWARDS.map((step,i)=>{
    const state=dailyRowState(i,cursor);
    const mark=state==='chest-won'?'<span class="streak-mark streak-mark-ok">✓</span>'
      :state==='chest-next'?'<span class="streak-mark streak-mark-next">Aujourd\'hui</span>':'';
    return '<div class="streak-row '+state+'" data-idx="'+i+'"'+
      (step.chest?' data-chest="'+step.chest+'"':'')+'>'+
      dailyStepVisual(step,state)+
      '<div class="streak-row-txt">'+
        '<div class="streak-row-name">'+escH(dailyStepName(step))+'</div>'+
        '<div class="streak-row-win">Jour '+(i+1)+' / '+dailyRewardTotal()+'</div>'+
      '</div>'+mark+
    '</div>';
  }).join('');
}
// Une phrase, sous le titre : où l'on en est, et ce qu'il y a à faire.
// Le curseur pointe TOUJOURS le prochain lot à prendre — c'est celui
// d'aujourd'hui tant qu'il n'est pas encaissé, celui de demain une fois qu'il
// l'est (dailyRewardClaim avance dr_idx). La même valeur dit donc les deux
// choses, il n'y a qu'à changer le verbe.
function dailySubtitle(){
  const step=dailyRewardStep(dailyRewardCursor());
  if(!step)return '';
  return dailyRewardAvailable()
    ?'Votre lot du jour vous attend : '+dailyStepName(step)+'.'
    :'Lot du jour déjà pris. Demain : '+dailyStepName(step)+'.';
}
function renderDailyModal(){
  const sub=document.getElementById('daily-sub');
  if(sub)sub.textContent=dailySubtitle();
  const foot=document.getElementById('daily-foot');
  if(foot){
    // LE BOUTON N'APPARAÎT QUE QUAND IL Y A QUELQUE CHOSE À PRENDRE. Un bouton
    // grisé en permanence n'est pas une information, c'est un rappel qu'on ne
    // peut rien faire — la phrase sous le titre le dit déjà, et mieux.
    foot.innerHTML=dailyRewardAvailable()
      ?'<button class="btn btn-gold rw-claim" id="daily-claim">Récupérer</button>'
      :'<div class="daily-wait">Prochain lot demain · cycle n° '+dailyRewardCycle()+'</div>';
    document.getElementById('daily-claim')?.addEventListener('click',dailyClaim);
  }
  const host=document.getElementById('daily-scroll');
  if(!host)return;
  host.innerHTML=dailyRowsHTML();
  // On ARRIVE LÀ OÙ ON EN EST : le lot du jour est amené au centre.
  requestAnimationFrame(()=>{
    const row=host.querySelector('.streak-row.chest-next');
    if(row)row.scrollIntoView({block:'center'});
    else host.scrollTop=0;
  });
}
function openDailyModal(){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return;
  renderDailyModal();
  document.getElementById('daily-modal')?.classList.add('show');
}
function closeDailyModal(){
  document.getElementById('daily-modal')?.classList.remove('show');
  renderRewardsBadge();
}
// Prendre le lot du jour. Un coffre s'ouvre avec SA cérémonie (la même qu'un
// coffre de la colonne ou acheté au Magasin, bris compris) ; des perles se
// versent sur-le-champ ; des jokers ouvrent la fenêtre de conversion.
function dailyClaim(){
  const step=dailyRewardClaim();
  if(!step){renderDailyModal();return;}
  closeDailyModal();
  if(step.chest){
    if(typeof chestOpenNow==='function')chestOpenNow(step.chest,dailyAfterClaim);
    else dailyAfterClaim();
    return;
  }
  if(step.pearls){
    if(typeof pearlAdd==='function')pearlAdd(step.pearls);
    if(typeof playSound==='function')playSound('rank');
    if(typeof showNotif==='function')showNotif('+'+step.pearls+' perles','ok');
    dailyAfterClaim();
    return;
  }
  jokerAdd(step.jokers);
  openJokerModal();
}
function dailyAfterClaim(){
  if(typeof goToMainMenu==='function')goToMainMenu();
  if(typeof updAll==='function')updAll();
  renderRewardsBadge();
}
// La carte de la colonne de droite (mode bureau) : le même rail que la
// fenêtre, produit par la MÊME fonction. Une seule source, deux affichages.
function renderMenuDailyCard(){
  const card=document.getElementById('ms-daily');
  if(!card||typeof DAILY_REWARDS==='undefined')return;
  card.innerHTML='<div class="ms-title">Récompense journalière</div>'+
    '<div class="ms-sub">'+escH(dailySubtitle())+'</div>'+
    '<div class="ms-rows">'+dailyRowsHTML()+'</div>'+
    '<button class="btn btn-ghost ms-open" id="ms-daily-open">'+
      (dailyRewardAvailable()?'Récupérer':'Voir le cycle')+'</button>';
  document.getElementById('ms-daily-open')?.addEventListener('click',openDailyModal);
}

// ----------------------------------------------------------------
// LA VOIE COURANTE : une page par voie, et non deux onglets
// ----------------------------------------------------------------
// La page portait deux onglets en tête, qui faisaient passer de la colonne à
// la rangée. C'était une barre de navigation permanente sur un écran où l'on
// vient faire UNE chose — et le menu principal, qui a un bouton par voie
// depuis, l'ouvrait déjà sur la bonne. Il ne reste qu'un titre, celui de la
// voie qu'on regarde, et « OK » pour revenir au menu : c'est le seul chemin de
// l'une à l'autre.
const RW_TITLES={colonne:'Colonne des Victoires',rangee:'Rangée de la Richesse'};
let _rwVoie='colonne';

function rewardsSetVoie(voie){
  _rwVoie=(voie==='rangee')?'rangee':'colonne';
  const t=document.getElementById('rw-title');
  if(t)t.textContent=RW_TITLES[_rwVoie];
  const col=document.getElementById('rw-pane-colonne');
  const row=document.getElementById('rw-pane-rangee');
  if(col)col.hidden=_rwVoie!=='colonne';
  if(row)row.hidden=_rwVoie!=='rangee';
  // LES DEUX VOIES TIENNENT MAINTENANT DANS L'ÉCRAN. La colonne défile chez
  // elle ; la rangée ne montre qu'une récompense à la fois, au-dessus des
  // quêtes du jour. Ni l'une ni l'autre ne fait défiler la page — d'où
  // `rw-fill` posée dans les deux cas (voir [REWARDS] dans css/style.css).
  document.getElementById('page-rewards')?.classList.add('rw-fill');
  rewardsScrollCurrent();
}

// Amène le palier en cours au milieu de SA bande défilante — et de rien
// d'autre. scrollIntoView() entraînerait aussi la page derrière : la colonne
// s'ouvrait en ayant fait défiler le titre hors de l'écran.
function rwScrollTo(strip,axis){
  if(!strip)return;
  const target=strip.querySelector('.rw-due')||strip.querySelector('.rw-next');
  if(!target)return;
  if(axis==='x')strip.scrollLeft=Math.max(0,target.offsetLeft-(strip.clientWidth-target.offsetWidth)/2);
  else strip.scrollTop=Math.max(0,target.offsetTop-(strip.clientHeight-target.offsetHeight)/2);
}
function rewardsScrollCurrent(){
  requestAnimationFrame(()=>{
    if(_rwVoie==='colonne')rwScrollTo(document.getElementById('rw-col-strip'),'y');
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
// UN SEUL PALIER EST TOUCHABLE À LA FOIS, ET C'EST LE PREMIER DÛ. La colonne
// s'encaisse dans l'ordre (colClaimNext), donc toucher le troisième palier dû
// donnerait le premier : le geste ne rendrait pas ce qu'il désigne. Seul le
// palier en tête porte donc « À prendre » et le clic ; ceux qui suivent sont
// gagnés et attendent leur tour, ce qu'ils disent.
function rwColRowsHTML(){
  const first=colClaimed();
  return VICTORY_COLUMN.map((step,i)=>{
    const state=rwColState(i);
    const claimable=(state==='rw-due'&&i===first);
    const mark=state==='rw-got'?'<span class="streak-mark streak-mark-ok">✓</span>'
      :claimable?'<span class="streak-mark streak-mark-next">Touchez pour récupérer</span>'
      :state==='rw-due'?'<span class="streak-mark rw-mark-next">Gagné · à la suite</span>'
      :state==='rw-next'?'<span class="streak-mark rw-mark-next">Prochaine victoire</span>':'';
    return '<div class="rw-step '+state+(claimable?' rw-claimable':'')+'" data-idx="'+i+'">'+
      '<div class="rw-step-num">'+(i+1)+'</div>'+
      rwStepVisual(step,state)+
      // PAS DE SOUS-TITRE SOUS UN COFFRE. Il portait « Victoire n° 7 », juste
      // sous « Coffre Pion » — c'est-à-dire le numéro déjà écrit en gros dans
      // la pastille à gauche de la ligne, dit une deuxième fois en petit. Les
      // jokers, eux, gardent leur ligne : elle dit ce qu'ils VALENT, ce que
      // rien d'autre sur la ligne ne montre.
      '<div class="rw-step-txt">'+
        '<div class="rw-step-name">'+escH(rwStepName(step))+'</div>'+
        (step.chest?'':'<div class="rw-step-sub">Au choix : '+step.jokers+' exemplaires d\'une créature</div>')+
      '</div>'+mark+
    '</div>';
  }).join('');
}
// LE PALIER SE PREND EN LE TOUCHANT. Il y avait au-dessus de la colonne un
// bandeau qui ne portait plus qu'un bouton « Récupérer » : une rangée entière
// d'écran pour une action dont la cible — le palier qui pulse, à deux doigts
// de là — était déjà sous les yeux. On touche donc ce qu'on prend. Sans rien à
// prendre, il n'y a plus rien du tout au-dessus de la colonne : un cadre vide
// n'est pas une information.
function renderRewardsColonne(){
  const pane=document.getElementById('rw-pane-colonne');
  if(!pane)return;
  pane.innerHTML='<div class="rw-col-strip" id="rw-col-strip">'+rwColRowsHTML()+'</div>';
  // UN SEUL ÉCOUTEUR, POSÉ SUR LA BANDE. Trente paliers redessinés à chaque
  // encaissement, c'est trente écouteurs à reposer à chaque fois ; la
  // délégation survit au rendu suivant sans rien à recâbler.
  document.getElementById('rw-col-strip')?.addEventListener('click',e=>{
    if(e.target.closest('.rw-step.rw-claimable'))rewardsClaimColumn();
  });
}

// Encaisser le palier suivant. Un coffre s'ouvre avec SA cérémonie (la même
// qu'un coffre journalier ou acheté au Magasin, bris compris) ; des jokers
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
// LA RANGÉE DE LA RICHESSE : une récompense à la fois, en grand
// ----------------------------------------------------------------
// Elle a été une bande de vingt-cinq cases larges d'un quart d'écran, qui
// défilait de côté sous un bouton « Récupérer ». Quatre cases minuscules à la
// fois, dont aucune ne se lisait, et vingt-et-une hors champ : la rangée
// ressemblait à une liste de courses là où c'est le PALIER EN COURS qui
// compte — ce qu'il donne, ce qu'il coûte, et si on peut le prendre.
//
// Il n'y a donc plus qu'UNE récompense à l'écran, dans une carte qui prend
// toute la place laissée libre au-dessus des quêtes du jour. On passe d'un
// palier à l'autre par les deux flèches, ou en balayant la carte du doigt —
// deux gestes pour la même chose, parce que la flèche s'apprend en la voyant
// et le balayage se garde parce qu'il est plus rapide.
function rwRichState(i){
  const claimed=richClaimed();
  if(i<claimed)return 'rw-got';
  if(i===claimed)return richCanClaim()?'rw-due':'rw-next';
  return 'rw-far';
}
// Le palier REGARDÉ. Il part de celui qu'on peut prendre (ou du prochain) et
// ne bouge ensuite qu'à la demande : rien ne doit ramener le joueur en arrière
// pendant qu'il parcourt la rangée.
let _rwRowIdx=null;
function rwRowTotal(){return (typeof WEALTH_ROW!=='undefined')?WEALTH_ROW.length:0;}
function rwRowIdx(){
  const n=rwRowTotal();
  if(!n)return 0;
  if(_rwRowIdx===null)_rwRowIdx=Math.min(n-1,richClaimed());
  return Math.max(0,Math.min(n-1,_rwRowIdx));
}
function rwRowGo(delta){
  const n=rwRowTotal();
  if(!n)return;
  const next=Math.max(0,Math.min(n-1,rwRowIdx()+delta));
  if(next===rwRowIdx())return;
  _rwRowIdx=next;
  renderRewardsRangee();
}
// La carte, seule à l'écran. Elle porte tout ce qu'il faut pour décider : le
// rang du palier, ce qu'il donne, ce qu'il coûte, et son état.
function rwRowCardHTML(){
  const n=rwRowTotal();
  if(!n)return '<div class="rw-sec-note">La rangée est vide.</div>';
  const i=rwRowIdx(),step=WEALTH_ROW[i],state=rwRichState(i);
  const manque=Math.max(0,step.cost-ticketBalance());
  const mark=state==='rw-got'?'<span class="rw-row-mark rw-row-mark-ok">Récupéré</span>'
    :state==='rw-due'?'<span class="rw-row-mark rw-row-mark-due">Touchez pour récupérer</span>'
    :'<span class="rw-row-mark">'+(manque?'Encore '+manque+' ticket'+(manque>1?'s':''):'À venir')+'</span>';
  return '<div class="rw-row-card '+state+'" data-idx="'+i+'">'+
    '<div class="rw-row-num">Palier '+(i+1)+' / '+n+'</div>'+
    '<div class="rw-row-gain">'+pearlAmountHTML(step.pearls,2.6)+'</div>'+
    '<div class="rw-row-cost">'+ticketAmountHTML(step.cost,1.6)+'</div>'+
    mark+
  '</div>';
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
  const jok=jokerBalance();
  const i=rwRowIdx(),n=rwRowTotal();
  const fleche=(dir,d)=>'<button class="rw-row-arrow" data-go="'+d+'" '+
    (d<0?(i<=0?'disabled ':''):(i>=n-1?'disabled ':''))+
    'aria-label="'+(d<0?'Palier précédent':'Palier suivant')+'">'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+
    (d<0?'<polyline points="15 5, 8 12, 15 19"/>':'<polyline points="9 5, 16 12, 9 19"/>')+'</svg></button>';
  pane.innerHTML=
    '<div class="rw-row-stage" id="rw-row-stage">'+
      fleche('l',-1)+rwRowCardHTML()+fleche('r',1)+
    '</div>'+
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
      '<div class="rw-quests-list">'+
      (quests.length?quests.map(rwQuestCardHTML).join(''):'<div class="rw-sec-note">Aucune quête : jouez une première bataille.</div>')+
      '</div>'+
    '</div>';
  document.getElementById('rw-open-joker')?.addEventListener('click',openJokerModal);
  const stage=document.getElementById('rw-row-stage');
  if(stage){
    stage.querySelectorAll('.rw-row-arrow').forEach(b=>{
      b.addEventListener('click',()=>rwRowGo(parseInt(b.dataset.go,10)));
    });
    stage.querySelector('.rw-row-card.rw-due')?.addEventListener('click',rewardsClaimRich);
    rwWireSwipe(stage);
  }
}
// LE BALAYAGE, SANS BIBLIOTHÈQUE ET SANS AMBIGUÏTÉ. Deux règles suffisent :
// on ne décide qu'au relâchement (un doigt qui hésite ne fait rien tourner),
// et un geste plus vertical qu'horizontal n'est pas un balayage — c'est la
// page qu'on essaie de faire défiler.
const RW_SWIPE_MIN=42;
function rwWireSwipe(el){
  let x0=null,y0=null;
  el.addEventListener('touchstart',e=>{
    if(e.touches.length!==1){x0=null;return;}
    x0=e.touches[0].clientX;y0=e.touches[0].clientY;
  },{passive:true});
  el.addEventListener('touchend',e=>{
    if(x0===null)return;
    const t=e.changedTouches&&e.changedTouches[0];
    if(!t){x0=null;return;}
    const dx=t.clientX-x0,dy=t.clientY-y0;
    x0=null;
    if(Math.abs(dx)<RW_SWIPE_MIN||Math.abs(dx)<=Math.abs(dy))return;
    // On balaie vers la GAUCHE pour aller au palier SUIVANT : le contenu suit
    // le doigt, comme une page qu'on tourne.
    rwRowGo(dx<0?1:-1);
  },{passive:true});
}
function rewardsClaimRich(){
  const got=richClaimNext();
  if(!got){renderRewardsRangee();return;}
  // Un palier franchi : la fanfare de l'interface, la seule. Et on avance sur
  // le palier suivant, qui est ce que le joueur veut voir ensuite.
  if(typeof playSound==='function')playSound('rank');
  if(typeof showNotif==='function')showNotif('+'+got.pearls+' perles','ok');
  _rwRowIdx=Math.min(rwRowTotal()-1,got.idx+1);
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
  rewardsSetVoie(_rwVoie);
  renderRewardsBadge();
}
// La voie s'ouvre depuis le menu principal, qui a un bouton par voie. La page
// n'en montre qu'une, et « OK » ramène au menu : c'est le seul chemin de l'une
// à l'autre, et c'est voulu.
function openRewardsPage(voie){
  if(typeof CUR_ACC!=='undefined'&&!CUR_ACC)return;
  _rwVoie=(voie==='rangee')?'rangee':'colonne';
  // On arrive TOUJOURS sur le palier en jeu, même après un aller-retour : le
  // curseur de la rangée ne survit pas à une fermeture de page.
  _rwRowIdx=null;
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
// LES TROIS PASTILLES DU MENU, une par bouton. Il n'y en avait qu'une, sur le
// bouton « Récompenses », qui totalisait les deux voies : elle disait qu'il y
// avait quelque chose quelque part, sans dire où. Chaque bouton porte
// maintenant la sienne, et chacune ne s'allume que si SA voie a quelque chose
// à donner — une pastille toujours allumée n'est plus un rappel, c'est un
// décor.
function rwSetBadge(id,n){
  const b=document.getElementById(id);
  if(!b)return;
  b.textContent=n>9?'9+':String(n);
  b.style.display=n?'':'none';
}
function renderRewardsBadge(){
  const on=(typeof CUR_ACC==='undefined')||!!CUR_ACC;
  rwSetBadge('jouer-daily-badge',on&&typeof dailyRewardAvailable==='function'&&dailyRewardAvailable()?1:0);
  rwSetBadge('jouer-colonne-badge',on?colPending():0);
  // La rangée : un palier payable, ou des jokers qui attendent leur créature.
  rwSetBadge('jouer-rangee-badge',on?((richCanClaim()?1:0)+(jokerBalance()?1:0)):0);
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
// TROIS BOUTONS, TROIS DESTINATIONS DIRECTES. Le bouton « Récompenses » ouvrait
// la page sur son premier onglet et laissait le joueur choisir laquelle des
// deux voies il venait voir : un sommaire entre lui et ce qu'il cherchait.
document.getElementById('jouer-daily')?.addEventListener('click',openDailyModal);
document.getElementById('jouer-colonne')?.addEventListener('click',()=>openRewardsPage('colonne'));
document.getElementById('jouer-rangee')?.addEventListener('click',()=>openRewardsPage('rangee'));
document.getElementById('daily-close')?.addEventListener('click',closeDailyModal);
document.getElementById('daily-modal')?.addEventListener('click',e=>{
  if(e.target.id==='daily-modal')closeDailyModal();
});
document.getElementById('rw-ok')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('face-jouer');
});
document.getElementById('joker-close')?.addEventListener('click',closeJokerModal);
document.getElementById('joker-modal')?.addEventListener('click',e=>{
  if(e.target.id==='joker-modal')closeJokerModal();
});
