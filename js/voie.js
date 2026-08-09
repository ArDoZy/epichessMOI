// ================================================================
// VOIE.JS : Page "Voie des Victoires" (#page-voie), ELO, rangs, jalons
// ================================================================
// Contient : le calcul d'ELO après une partie (vvCalcNewElo, formule Elo
// standard avec K-factor variable), la détection de nouveaux déblocages
// (vvCheckNewUnlocks), l'estimation de l'ELO d'un instructeur IA
// (vvEstimateAiElo), et le rendu complet de la page Voie (bannière de rang,
// timeline des jalons de déblocage, historique des dernières parties).
//
// Dépendances : data-pieces.js (RANKS, UNLOCK_MILESTONES, PIECES,
// CLASS_COLOR_VARS, vvGetRank, vvGetRankIdx, vvGetRankFloor),
// accounts.js (vvLoadElo, vvSaveUnlocked, vvLoadHistory), main.js
// (VV_UNLOCKED, ADMIN_MODE, showPage), armies.js (renderArmiesPage,
// pour le retour vers "Mes armées").
// Utilisé par : game-flow.js (triggerEndOfGame appelle vvCalcNewElo/
// vvCheckNewUnlocks), tournoi.js (idem pour chaque round), page "Mes
// armées" (bouton "Voie").
// ================================================================

// ----------------------------------------------------------------
// CALCULS ELO
// ----------------------------------------------------------------
// ELO attribué à l'adversaire pour le calcul du gain/perte. Il n'y a plus
// qu'un instructeur, donc une seule valeur par défaut ; le tournoi et le jeu
// en ligne la remplacent par celle de l'adversaire réel via cette surcharge.
let _opponentEloOverride=null;
function vvSetOpponentElo(v){_opponentEloOverride=(typeof v==='number'&&v>0)?v:null;}
function vvEstimateAiElo(){
  if(typeof _opponentEloOverride==='number')return _opponentEloOverride;
  return INSTRUCTOR?INSTRUCTOR.elo:800;
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
//   - Mode admin : rien de ce qui s'y passe ne compte au classement, sinon
//     une démonstration polluerait la progression réelle du compte.
//   - Affronter l'Instructeur : c'est un entraînement. L'IA joue toujours à
//     pleine puissance et joue autant de fois qu'on veut : un ELO gagné là
//     ne mesure rien. Seuls les combats contre de vrais joueurs (et les
//     rounds de tournoi, qui ont leurs propres paliers) sont classés.
// VV_NO_ELO_TRAINING est une valeur reconnaissable, et pas seulement une
// phrase : le modal de fin de partie s'en sert pour masquer la mention sans
// masquer celle du mode admin (voir showResultModal dans js/game-flow.js).
const VV_NO_ELO_TRAINING='Entraînement contre l\'Instructeur : aucun ELO en jeu.';
function vvNoEloReason(gs){
  if(typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE)return 'Mode admin : partie non classée, aucun ELO en jeu.';
  const inTournoi=(typeof tournamentState!=='undefined')&&tournamentState&&tournamentState.active;
  if(!inTournoi&&!(gs&&gs.multiplayer))return VV_NO_ELO_TRAINING;
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
// La Voie affiche TOUJOURS la progression réelle, mode admin compris : le
// mode admin ne débloque plus les pièces, il ne fait qu'ouvrir l'accès à des
// coffres illimités dans la Réserve. Une Voie affichée comme terminée alors
// que les pièces ne le sont pas serait un mensonge à l'écran.
function renderVoiePage(){
  const elo=vvLoadElo();
  const rank=vvGetRank(elo);
  const nextRank=RANKS[vvGetRankIdx(elo)+1]||null;
  const playableMilestones=UNLOCK_MILESTONES.filter(u=>u.pieceId&&!u.coffre);
  const unlockedCount=playableMilestones.filter(u=>VV_UNLOCKED.has(u.pieceId)).length;
  const progress=nextRank?Math.min(100,Math.round((elo-rank.min)/(nextRank.min-rank.min)*100)):100;
  const banner=document.getElementById('voie-elo-banner');
  banner.innerHTML='<div class="veb-info"><div class="veb-rank-name" style="color:'+rank.color+'">'+rank.name+'</div><div class="veb-elo">'+elo+' <span>ELO</span></div><div class="veb-progress-wrap"><div class="veb-progress-bar" style="width:'+progress+'%;background:linear-gradient(90deg,'+rank.color+',var(--gold))"></div></div><div class="veb-progress-label">'+(nextRank?'Vers '+nextRank.name+' ('+nextRank.min+' ELO) · '+progress+'%':'Rang maximum atteint !')+'</div></div><div class="veb-stats"><div class="veb-stat"><div class="veb-stat-label">Parties</div><div class="veb-stat-val" style="color:var(--text)">'+vvLoadHistory().length+'</div></div><div class="veb-stat"><div class="veb-stat-label">Victoires</div><div class="veb-stat-val" style="color:var(--success)">'+vvLoadHistory().filter(h=>h.result==='win').length+'</div></div><div class="veb-stat"><div class="veb-stat-label">Pièces</div><div class="veb-stat-val" style="color:var(--gold)">'+unlockedCount+'/'+playableMilestones.length+'</div></div></div>';
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
    const cc=CLASS_COLOR_VARS[pd.class]||'var(--muted)';
    const bigBadge=milestone.bigReward?'<span style="font-size:9px;background:rgba(201,168,76,.2);color:var(--gold);padding:2px 6px;border-radius:4px;font-family:Cinzel,serif;margin-left:4px">+ Récompenses</span>':'';
    html+='<div class="voie-milestone"><div class="'+cardCls+'"><span class="vm-piece-emoji">'+pieceIcon(pd.id,'n')+'</span><div class="vm-piece-name">'+pd.name+bigBadge+'</div><div class="vm-piece-class pc-class '+pd.class+'" style="color:'+cc+'">'+pd.class+' · '+pd.value+' pts</div>'+(pd.ability?'<div class="vm-piece-ability">'+(pd.ability.length>80?pd.ability.slice(0,80)+'…':pd.ability)+'</div>':'')+'</div><div class="vm-center"><div class="'+dotCls+'"></div><div class="vm-elo-badge">'+(milestone.eloRequired===0?'Départ':milestone.eloRequired+' ELO')+'</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
  });
  route.innerHTML=html;
  const history=vvLoadHistory().slice().reverse();const histDiv=document.getElementById('voie-history');
  if(!history.length){histDiv.innerHTML='';return;}
  let hhtml='<div class="vh-title">Dernières parties</div>';
  history.forEach(h=>{
    const rLbl=h.result==='win'?'Victoire':h.result==='loss'?'Défaite':'Nulle';
    const rCls=h.result==='win'?'win':h.result==='loss'?'loss':'draw';
    const dCls=h.delta>0?'pos':h.delta<0?'neg':'zero';
    const d=new Date(h.date);
    // Les parties non classées (entraînement, mode admin) sont bien listées,
    // mais sans flèche d'ELO : elles n'en ont pas fait bouger.
    const eloCell=(h.ranked===false)
      ?'<span class="vh-delta zero">—</span><span class="vh-elo">Non classée</span>'
      :'<span class="vh-delta '+dCls+'">'+(h.delta>0?'+':'')+h.delta+'</span><span class="vh-elo">'+h.oldElo+' → '+h.newElo+'</span>';
    hhtml+='<div class="vh-row"><span class="vh-result '+rCls+'">'+rLbl+'</span>'+eloCell+'<span class="vh-date">'+d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span></div>';
  });
  histDiv.innerHTML=hhtml;
}

// La Voie est devenue une face du cube (js/cube-nav.js) : elle n'a plus ni
// bouton d'entrée dans « Mes armées », ni bouton de retour.
// ----------------------------------------------------------------
// REMONTÉE DE LA VOIE
// ----------------------------------------------------------------
// La Voie est embarquée dans une face du cube : c'est le conteneur de la
// face qui défile, pas le document. Remonter window ne faisait donc rien.
//
// Le bouton téléportait en haut de page, ce qui faisait perdre le fil : on ne
// voyait pas les rangs défiler et on ne savait plus où on avait atterri. Il
// remonte maintenant en ACCÉLÉRANT (courbe en ease-in), comme une bille qui
// dévale la pente à l'envers : le regard suit le mouvement et comprend la
// distance parcourue.
function voieScrollHost(){
  return document.getElementById('face-viewport-voie')||
         document.getElementById('page-voie')||
         document.scrollingElement;
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
