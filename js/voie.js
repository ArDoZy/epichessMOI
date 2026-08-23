// ================================================================
// VOIE.JS : Page "Diagonale de la Puissance" (#page-voie), ELO, rangs, jalons
// ================================================================
// LA « VOIE DES VICTOIRES » S'APPELLE MAINTENANT LA DIAGONALE DE LA
// PUISSANCE. Il y a désormais trois voies de progression, et chacune porte le
// nom d'une ligne de l'échiquier : la DIAGONALE (ici, l'ELO, qui monte en
// zigzag), la COLONNE des victoires et la RANGÉE de la richesse (les deux
// dans js/rewards.js). Les identifiants restent en `voie-` / `page-voie` /
// `vv*` : ce sont les clés sur lesquelles sont accrochés le CSS, le tutoriel,
// les sauvegardes de compte et le test de fumée — les renommer ne changerait
// rien à l'écran (même raisonnement que 'chevaucheur-rhinoceros' dans
// js/data-pieces.js).
//
// Contient : le calcul d'ELO après une partie (vvCalcNewElo, formule Elo
// standard avec K-factor variable), la détection de nouveaux déblocages
// (vvCheckNewUnlocks), l'estimation de l'ELO d'un instructeur IA
// (vvEstimateAiElo), et le rendu de la page Voie (bannière de rang + file des
// jalons de déblocage — et RIEN d'autre : aucune statistique, aucun
// historique, voir renderVoiePage).
//
// Dépendances : data-pieces.js (RANKS, UNLOCK_MILESTONES, PIECES,
// CLASS_COLOR_VARS, vvGetRank, vvGetRankIdx, vvGetRankFloor),
// accounts.js (vvLoadElo, vvSaveUnlocked), main.js
// (VV_UNLOCKED, ADMIN_MODE, showPage), armies.js (renderArmiesPage,
// pour le retour vers "Mes armées").
// Utilisé par : game-flow.js (triggerEndOfGame appelle vvCalcNewElo/
// vvCheckNewUnlocks), menu principal (bouton "Voie").
// ================================================================

// ----------------------------------------------------------------
// CALCULS ELO
// ----------------------------------------------------------------
// ELO attribué à l'adversaire pour le calcul du gain/perte : celui de
// l'adversaire du laboratoire en cours, ou celui transmis par l'adversaire
// réel en ligne via cette surcharge.
let _opponentEloOverride=null;
function vvSetOpponentElo(v){_opponentEloOverride=(typeof v==='number'&&v>0)?v:null;}
function vvEstimateAiElo(){
  if(typeof _opponentEloOverride==='number')return _opponentEloOverride;
  // Chaque adversaire porte son propre ELO (AI_OPPONENTS dans
  // js/data-pieces.js) : c'est lui, et non une valeur unique, qui décide de ce
  // que vaut la victoire.
  const o=(typeof aiCurrentOpponent==='function')?aiCurrentOpponent():INSTRUCTOR;
  return(o&&o.elo)||800;
}
function vvCalcNewElo(playerElo,aiElo,result){
  const K=32;
  const E=1/(1+Math.pow(10,(aiElo-playerElo)/400));
  const S=result==='win'?1:result==='loss'?0:0.5;
  const rawDelta=K*(S-E);
  let delta;
  if(result==='win')delta=Math.min(32,Math.max(0,Math.round(rawDelta)));
  else if(result==='draw')delta=Math.max(-16,Math.min(16,Math.round(rawDelta)));
  else delta=Math.max(-32,Math.min(0,Math.round(rawDelta)));
  const rawNew=playerElo+delta;
  const floor=vvGetRankFloor(playerElo);
  const newElo=Math.max(floor,rawNew);
  return{newElo,delta:newElo-playerElo};
}
// Une partie est-elle CLASSÉE, c'est-à-dire fait-elle bouger l'ELO ?
// Renvoie null si oui, sinon la raison (affichée dans le modal de résultat).
//
// AVANT, seul le jeu en ligne comptait : affronter l'IA était
// « un entraînement ». C'était défendable avec un adversaire unique à pleine
// puissance, mais cela fermait tout le jeu à qui joue seul. Le classement
// n'avançait pas d'un point, donc aucune pièce à palier d'ELO (Preux
// Chevalier à 50, Méduse à 210, Typhon à 1000, Grand Maître à 1700) et aucun
// échiquier n'était atteignable sans trouver un adversaire humain.
//
// Il y a maintenant douze adversaires d'ELO connu et espacé (AI_OPPONENTS) :
// une victoire contre l'un d'eux mesure exactement ce que mesure une victoire
// contre un humain de même niveau. Ces parties sont donc CLASSÉES, et le
// classement se régule tout seul : battre un adversaire très au-dessous de
// son propre niveau ne rapporte quasiment rien (formule Elo), donc aucun des
// paliers qui débloquent pièces et échiquiers.
//
// Restent non classées : les parties du mode test (une démonstration ne doit
// pas polluer la progression réelle) et les batailles du tutoriel, qui ne
// passent de toute façon pas par ici (voir triggerEndOfGame).
// VV_NO_ELO_TRAINING est conservée pour les sauvegardes et le modal de fin.
const VV_NO_ELO_TRAINING='Entraînement : aucun ELO en jeu.';
function vvNoEloReason(gs){
  if(typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE)return 'Mode test : partie non classée, aucun ELO en jeu.';
  if(gs&&gs.tuto)return VV_NO_ELO_TRAINING;
  return null;
}
function vvCheckNewUnlocks(oldElo,newElo){
  const newUnlocks=[];
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.pieceId)return;if(u.coffre)return;
    if(u.eloRequired>oldElo&&u.eloRequired<=newElo&&!VV_UNLOCKED.has(u.pieceId)){VV_UNLOCKED.add(u.pieceId);newUnlocks.push(u.pieceId);}
  });
  if(newUnlocks.length)vvSaveUnlocked(VV_UNLOCKED);return newUnlocks;
}

// Petits jalons de récompense (perles / exemplaires) semés entre les jalons
// de déblocage, voir UNLOCK_TABLE (js/data-pieces.js). Versés une seule fois
// chacun (accGet/accSet 'voie_rewards_claimed', par id de jalon) : sans ce
// suivi, un ELO qui redescend puis remonte au-dessus d'un palier déjà
// franchi verserait la récompense une seconde fois.
function vvCheckRewardMilestones(oldElo,newElo){
  const claimed=new Set(accGet('voie_rewards_claimed',[]));
  const granted=[];
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.reward||claimed.has(u.id))return;
    if(!(u.eloRequired>oldElo&&u.eloRequired<=newElo))return;
    if(u.reward==='pearls'&&typeof pearlAdd==='function')pearlAdd(u.amount);
    else if(u.reward==='copies'&&typeof invAdd==='function')invAdd(u.copyId,u.qty);
    claimed.add(u.id);granted.push(u);
  });
  if(granted.length)accSet('voie_rewards_claimed',[...claimed]);
  return granted;
}

// ----------------------------------------------------------------
// RENDU DE LA PAGE VOIE
// ----------------------------------------------------------------
// La Voie affiche la progression telle qu'elle est. En mode test (/?test),
// elle se lit donc terminée — c'est exact : là-dedans, l'ELO vaut 10 000 et
// tout le catalogue est débloqué (voir js/accounts.js et js/economy.js).
// Rien n'en est écrit sur le compte, on retrouve sa vraie Voie en revenant.
function renderVoiePage(){
  const elo=vvLoadElo();
  const rank=vvGetRank(elo);
  const nextRank=RANKS[vvGetRankIdx(elo)+1]||null;
  const progress=nextRank?Math.min(100,Math.round((elo-rank.min)/(nextRank.min-rank.min)*100)):100;
  // LA VOIE NE COMPTE PLUS RIEN. Elle portait quatre statistiques — parties
  // jouées, victoires, pièces débloquées, et la liste des dernières parties —
  // qui répondaient toutes à une question que personne ne vient poser ici. On
  // vient y voir CE QUI RESTE À DÉBLOQUER : le rang, la distance jusqu'au
  // suivant, et la file des créatures. Rien d'autre.
  const banner=document.getElementById('voie-elo-banner');
  banner.innerHTML='<div class="veb-info"><div class="veb-rank-name" style="color:'+rank.color+'">'+rank.name+'</div><div class="veb-elo">'+elo+' <span>ELO</span></div><div class="veb-progress-wrap"><div class="veb-progress-bar" style="width:'+progress+'%;background:linear-gradient(90deg,'+rank.color+',var(--gold))"></div></div><div class="veb-progress-label">'+(nextRank?'Vers '+nextRank.name+' ('+nextRank.min+' ELO) · '+progress+'%':'Rang maximum atteint !')+'</div></div>';
  const route=document.getElementById('voie-route');let html='';
  let lastRankId=null;
  // Alternance gauche/droite : un compteur À PART, incrémenté uniquement
  // pour les jalons réellement rendus (pas les bandeaux de rang, qui sont un
  // sibling de plus dans .voie-route et décalaient la parité de tout ce qui
  // suit si on la confiait à nth-child en CSS — deux jalons consécutifs
  // pouvaient alors atterrir du même côté juste après un bandeau).
  let side=0;
  const sideCls=()=>(side++%2===0)?'vm-l':'vm-r';
  UNLOCK_MILESTONES.forEach((milestone,idx)=>{
    // Les cinq jalons de départ (Roi, Dame, Fourmi, Peureux, Éléphant de
    // guerre — `starter`) sont à 0 ELO, donc numériquement dans la tranche
    // Bois, mais ils ne portent PAS son bandeau : ils forment le socle tout
    // en bas de la Voie, sous l'arène. Le bandeau Bois s'ouvre normalement au
    // jalon suivant (Preux Chevalier, 50 ELO), premier jalon non-`starter`.
    if(!milestone.starter){
      const mRank=vvGetRank(milestone.eloRequired);
      if(mRank.id!==lastRankId){lastRankId=mRank.id;html+='<div class="vm-rank-section"><div class="vm-rank-bar"><span class="vm-rank-label" style="color:'+mRank.color+'">'+mRank.name+'</span><span class="vm-rank-range">'+mRank.min+'–'+(mRank.max===9999?'∞':mRank.max)+' ELO</span></div></div>';}
    }
    // Jalon de récompense (perles / exemplaires) : ni pièce à débloquer, ni
    // texte de palier — juste un petit lot versé dès que l'ELO l'atteint
    // (vvCheckRewardMilestones, appelé en fin de partie).
    if(milestone.reward){
      const reached3=elo>=milestone.eloRequired;
      const body=milestone.reward==='pearls'
        ?(pearlAmountHTML?pearlAmountHTML(milestone.amount,1.6):milestone.amount+' perles')
        :'<span class="vm-piece-emoji">'+pieceIcon(milestone.copyId,'n')+'</span><div class="vm-piece-name">×'+milestone.qty+'</div>';
      html+='<div class="voie-milestone '+sideCls()+'"><div class="vm-card vm-reward '+(reached3?'reached':'locked-milestone')+'" style="text-align:center">'+body+'</div><div class="vm-center"><div class="vm-dot'+(reached3?' reached':'')+'"></div><div class="vm-elo-badge">'+milestone.eloRequired+' ELO</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
      return;
    }
    if(!milestone.pieceId){const reached2=elo>=milestone.eloRequired;html+='<div class="voie-milestone '+sideCls()+'"><div class="vm-card '+(reached2?'reached':'locked-milestone')+'" style="text-align:center"><div class="vm-piece-name">'+milestone.label+'</div></div><div class="vm-center"><div class="vm-dot'+(reached2?' reached':'')+'"></div><div class="vm-elo-badge">'+milestone.eloRequired+' ELO</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';return;}
    const pd=PIECES.find(p=>p.id===milestone.pieceId);if(!pd)return;
    const reached=elo>=milestone.eloRequired&&VV_UNLOCKED.has(milestone.pieceId);
    const isCurrent=!reached&&elo<milestone.eloRequired&&(idx===0||(UNLOCK_MILESTONES[idx-1]&&elo>=UNLOCK_MILESTONES[idx-1].eloRequired));
    const dotCls=reached?'vm-dot reached':isCurrent?'vm-dot current-milestone':'vm-dot';
    const cardCls=reached?'vm-card reached':isCurrent?'vm-card current-milestone':'vm-card locked-milestone';
    // LE JALON NE DIT PLUS QUE DEUX CHOSES : quelle créature, et à quel ELO.
    // Il portait aussi sa catégorie, sa valeur en points et les 80 premiers
    // caractères de son pouvoir — trois lignes de plus par jalon, sur une
    // page qui en aligne une quinzaine, pour des détails qui ne servent pas
    // ici : on ne compose pas son armée sur la Voie, on regarde ce qui reste
    // à décrocher. Le détail complet est dans la fiche de la pièce (bottom
    // sheet du builder, js/piece-card.js).
    html+='<div class="voie-milestone '+sideCls()+'"><div class="'+cardCls+'"><span class="vm-piece-emoji">'+pieceIcon(pd.id,'n')+'</span><div class="vm-piece-name">'+pd.name+'</div></div><div class="vm-center"><div class="'+dotCls+'"></div><div class="vm-elo-badge">'+(milestone.eloRequired===0?'Départ':milestone.eloRequired+' ELO')+'</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
  });
  route.innerHTML=html;
  voieAutoScroll(route);
}

// La Voie a été une face du cube ; c'est de nouveau une page à part entière,
// ouverte par le bouton « Voie » posé à côté de l'ELO sur le menu principal
// (js/cube-nav.js). D'où le bouton de sortie explicite ci-dessous : une page
// en surimpression n'a pas de flèche de cube pour en sortir.
//
// UN SEUL BOUTON « OK », épinglé en bas de l'écran (voir .voie-ok-bar dans
// css/style.css), plutôt qu'un « ← Retour » dans l'en-tête : la Voie peut
// être longue (une quinzaine de jalons), il fallait la remonter en entier
// pour sortir. Le bouton reste sous le pouce, où qu'on ait défilé.
document.getElementById('voie-ok')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-armies');
});

// ----------------------------------------------------------------
// POSITION D'ARRIVÉE SUR LA VOIE
// ----------------------------------------------------------------
// C'est le conteneur de la page qui défile (.page.active est en
// position:fixed avec son propre overflow), pas le document.
//
// La Voie se lit maintenant du bas (le départ) vers le haut (voir
// [VOIE]/.voie-route dans css/style.css, column-reverse) : la page elle-même
// ne défile PAS à l'envers, seuls les jalons qu'elle contient sont empilés en
// sens inverse — au repos (scrollTop 0), on voit donc le HAUT du chemin
// (Or Légendaire), et « le début » (Roi, tout en bas) est en scrollTop
// MAXIMUM, après le dernier jalon.
//
// La toute première fois qu'un compte ouvre la Voie, elle glisse du haut
// vers le bas pour montrer d'un geste toute l'étendue du chemin possible.
// Les fois suivantes, inutile de refaire ce voyage à chaque fois : la page
// s'ouvre directement sur le jalon EN COURS — sans quoi revoir sa
// progression coûtait, à chaque passage, un défilement jusqu'en bas.
// Ce n'est plus #page-voie qui défile : la page est une colonne flex (pour
// garder le bouton OK au bas de l'écran, voir [VOIE] dans css/style.css) et
// c'est .voie-scroll, son premier élément, qui porte le défilement.
function voieScrollHost(){
  return document.getElementById('voie-scroll')||document.scrollingElement;
}

function voieAutoScroll(){
  const host=voieScrollHost();
  if(!host)return;
  const firstVisit=!accGet('voie_seen',false);
  // renderVoiePage() est appelée AVANT showPage('page-voie') (voir
  // js/cube-nav.js) : la page est encore masquée ici, sans la moindre
  // géométrie (scrollHeight à 0, scrollIntoView sans effet). On attend la
  // frame suivante — après quoi showPage() a déjà posé la classe .active,
  // synchrone, dans le même tick — pour que le positionnement porte sur une
  // page réellement affichée.
  requestAnimationFrame(()=>{
    if(firstVisit){
      accSet('voie_seen',true);
      voieRevealSlide(host);
    }else{
      // Pas de défilement animé ici : on veut arriver directement, pas
      // regarder un trajet qu'on a déjà vu au premier passage.
      const cur=host.querySelector('.current-milestone');
      if(cur)(cur.closest('.voie-milestone')||cur).scrollIntoView({block:'center'});
    }
  });
}

// Glissement du haut vers le bas, au tout premier passage : ease-out, comme
// une bille qui se pose (vite au départ, elle ralentit en approchant le bas,
// c'est-à-dire le départ du chemin).
let _voieRevealRaf=null;
function voieRevealSlide(host){
  if(_voieRevealRaf)cancelAnimationFrame(_voieRevealRaf);
  const start=host.scrollTop;
  const target=host.scrollHeight-host.clientHeight;
  const dist=target-start;
  if(dist<=0)return; // tout tient déjà à l'écran
  const duration=Math.min(1800,Math.max(600,dist*0.9));
  const t0=performance.now();
  const ease=t=>1-Math.pow(1-t,3);
  const step=now=>{
    const t=Math.min(1,(now-t0)/duration);
    host.scrollTop=start+dist*ease(t);
    if(t<1)_voieRevealRaf=requestAnimationFrame(step);
    else{host.scrollTop=target;_voieRevealRaf=null;}
  };
  _voieRevealRaf=requestAnimationFrame(step);
}

// Bouton « Retour au début » : le début du chemin (Roi, Bois) est maintenant
// en BAS de la page (scrollTop maximum), pas en haut — la Voie s'y rend donc
// en DESCENDANT (ease-in, comme une bille qui dévale une pente).
let _voieScrollRaf=null;
function voieSmoothToStart(){
  const host=voieScrollHost();
  if(!host)return;
  if(_voieScrollRaf)cancelAnimationFrame(_voieScrollRaf);
  const start=host.scrollTop;
  const target=host.scrollHeight-host.clientHeight;
  const dist=target-start;
  if(dist<=0)return;
  const duration=Math.min(1100,Math.max(420,dist*0.55));
  const t0=performance.now();
  // ease-in cubique : lent au départ, de plus en plus rapide.
  const ease=t=>t*t*t;
  const step=now=>{
    const t=Math.min(1,(now-t0)/duration);
    host.scrollTop=start+dist*ease(t);
    if(t<1)_voieScrollRaf=requestAnimationFrame(step);
    else{host.scrollTop=target;_voieScrollRaf=null;}
  };
  _voieScrollRaf=requestAnimationFrame(step);
}
document.getElementById('voie-scroll-top').addEventListener('click',voieSmoothToStart);

// Le bouton ne sert à rien quand on est déjà en bas (au début) : il
// n'apparaît qu'une fois la page réellement remontée vers les hauts rangs.
(function(){
  const btn=document.getElementById('voie-scroll-top');
  if(!btn)return;
  const host=voieScrollHost();
  if(!host||!host.addEventListener)return;
  const sync=()=>{
    const dist=(host.scrollHeight-host.clientHeight)-host.scrollTop;
    btn.style.visibility=dist>320?'':'hidden';
  };
  host.addEventListener('scroll',sync,{passive:true});
  sync();
})();
