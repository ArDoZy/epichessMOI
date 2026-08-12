// ================================================================
// VOIE.JS : Page "Voie des Victoires" (#page-voie), ELO, rangs, jalons
// ================================================================
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
// classement se régule tout seul — battre un adversaire très au-dessous de
// son propre niveau ne rapporte quasiment rien (formule Elo), et la rareté du
// coffre gagné est plafonnée par le palier de l'adversaire (economySettle).
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
  UNLOCK_MILESTONES.forEach((milestone,idx)=>{
    const mRank=vvGetRank(milestone.eloRequired);
    if(mRank.id!==lastRankId){lastRankId=mRank.id;html+='<div class="vm-rank-section"><div class="vm-rank-bar"><span class="vm-rank-label" style="color:'+mRank.color+'">'+mRank.name+'</span><span class="vm-rank-range">'+mRank.min+'–'+(mRank.max===9999?'∞':mRank.max)+' ELO</span></div></div>';}
    if(!milestone.pieceId){const reached2=elo>=milestone.eloRequired;html+='<div class="voie-milestone"><div class="vm-card '+(reached2?'reached':'locked-milestone')+'" style="text-align:center"><div class="vm-piece-name">'+milestone.label+'</div></div><div class="vm-center"><div class="vm-dot'+(reached2?' reached':'')+'"></div><div class="vm-elo-badge">'+milestone.eloRequired+' ELO</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';return;}
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
    html+='<div class="voie-milestone"><div class="'+cardCls+'"><span class="vm-piece-emoji">'+pieceIcon(pd.id,'n')+'</span><div class="vm-piece-name">'+pd.name+'</div></div><div class="vm-center"><div class="'+dotCls+'"></div><div class="vm-elo-badge">'+(milestone.eloRequired===0?'Départ':milestone.eloRequired+' ELO')+'</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
  });
  route.innerHTML=html;
}

// La Voie a été une face du cube ; c'est de nouveau une page à part entière,
// ouverte par le bouton « Voie » posé à côté de l'ELO sur le menu principal
// (js/cube-nav.js). D'où le retour explicite ci-dessous : une page en
// surimpression n'a pas de flèche de cube pour en sortir.
document.getElementById('voie-back')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-armies');
});

// ----------------------------------------------------------------
// REMONTÉE DE LA VOIE
// ----------------------------------------------------------------
// C'est le conteneur de la page qui défile (.page.active est en
// position:fixed avec son propre overflow), pas le document. Remonter window
// ne faisait donc rien.
//
// Le bouton téléportait en haut de page, ce qui faisait perdre le fil : on ne
// voyait pas les rangs défiler et on ne savait plus où on avait atterri. Il
// remonte maintenant en ACCÉLÉRANT (courbe en ease-in), comme une bille qui
// dévale la pente à l'envers : le regard suit le mouvement et comprend la
// distance parcourue.
function voieScrollHost(){
  return document.getElementById('page-voie')||document.scrollingElement;
}

let _voieScrollRaf=null;
function voieSmoothTop(){
  const host=voieScrollHost();
  if(!host)return;
  if(_voieScrollRaf)cancelAnimationFrame(_voieScrollRaf);
  const start=host.scrollTop;
  if(start<=0)return;
  // Durée proportionnelle à la distance, mais bornée : une Voie très longue
  // ne doit pas imposer une remontée interminable.
  const duration=Math.min(1100,Math.max(420,start*0.55));
  const t0=performance.now();
  // ease-in cubique : lent au départ, de plus en plus rapide.
  const ease=t=>t*t*t;
  const step=now=>{
    const t=Math.min(1,(now-t0)/duration);
    host.scrollTop=start*(1-ease(t));
    if(t<1)_voieScrollRaf=requestAnimationFrame(step);
    else{host.scrollTop=0;_voieScrollRaf=null;}
  };
  _voieScrollRaf=requestAnimationFrame(step);
}
document.getElementById('voie-scroll-top').addEventListener('click',voieSmoothTop);

// Le bouton ne sert à rien quand on est déjà en haut : il n'apparaît qu'une
// fois la page réellement descendue.
(function(){
  const btn=document.getElementById('voie-scroll-top');
  if(!btn)return;
  const host=voieScrollHost();
  if(!host||!host.addEventListener)return;
  const sync=()=>{btn.style.visibility=host.scrollTop>320?'':'hidden';};
  host.addEventListener('scroll',sync,{passive:true});
  sync();
})();
