// ================================================================
// VOIE.JS — Page "Voie des Victoires" (#page-voie) : ELO, rangs, jalons
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
// (VV_UNLOCKED, ADMIN_MODE, showPage).
// Utilisé par : game-flow.js (triggerEndOfGame appelle vvCalcNewElo/
// vvCheckNewUnlocks), tournoi.js (idem pour chaque round), builder.js
// (bouton "⚔ Voie").
// ================================================================

// ----------------------------------------------------------------
// CALCULS ELO
// ----------------------------------------------------------------
function vvEstimateAiElo(){
  const inst=AI_INSTRUCTORS[selectedAILevel];
  return inst?inst.elo:800;
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
function vvCheckNewUnlocks(oldElo,newElo){
  const newUnlocks=[];
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.pieceId)return;if(u.primordialeChoix||u.coffre)return;
    if(u.eloRequired>oldElo&&u.eloRequired<=newElo&&!VV_UNLOCKED.has(u.pieceId)){VV_UNLOCKED.add(u.pieceId);newUnlocks.push(u.pieceId);}
  });
  if(newUnlocks.length)vvSaveUnlocked(VV_UNLOCKED);return newUnlocks;
}

// ----------------------------------------------------------------
// RENDU DE LA PAGE VOIE
// ----------------------------------------------------------------
function renderVoiePage(){
  const realElo=vvLoadElo();
  const elo=ADMIN_MODE?9999:realElo;
  const rank=ADMIN_MODE?RANKS[RANKS.length-1]:vvGetRank(realElo);
  const nextRank=ADMIN_MODE?null:(RANKS[vvGetRankIdx(realElo)+1]||null);
  const playableMilestones=UNLOCK_MILESTONES.filter(u=>u.pieceId&&!u.primordialeChoix&&!u.coffre);
  const unlockedCount=ADMIN_MODE?playableMilestones.length:playableMilestones.filter(u=>VV_UNLOCKED.has(u.pieceId)).length;
  const progress=ADMIN_MODE?100:(nextRank?Math.min(100,Math.round((realElo-rank.min)/(nextRank.min-rank.min)*100)):100);
  const banner=document.getElementById('voie-elo-banner');
  if(ADMIN_MODE){
    banner.innerHTML='<div class="veb-rank-icon">⚙</div><div class="veb-info"><div class="veb-rank-name" style="color:var(--gold)">MODE ADMINISTRATEUR</div><div class="veb-elo" style="color:var(--gold)">ELO <span>masqué</span></div><div class="veb-progress-wrap"><div class="veb-progress-bar" style="width:100%;background:linear-gradient(90deg,var(--gold),var(--accent2))"></div></div><div class="veb-progress-label">Voie complète en mode admin — progression réelle préservée</div></div><div class="veb-stats"><div class="veb-stat"><div class="veb-stat-label">ELO réel</div><div class="veb-stat-val" style="color:var(--muted)">???</div></div><div class="veb-stat"><div class="veb-stat-label">Pièces</div><div class="veb-stat-val" style="color:var(--gold)">'+unlockedCount+'/'+playableMilestones.length+'</div></div></div>';
  }else{
    banner.innerHTML='<div class="veb-rank-icon">'+rank.emoji+'</div><div class="veb-info"><div class="veb-rank-name" style="color:'+rank.color+'">'+rank.name+'</div><div class="veb-elo">'+realElo+' <span>ELO</span></div><div class="veb-progress-wrap"><div class="veb-progress-bar" style="width:'+progress+'%;background:linear-gradient(90deg,'+rank.color+',var(--gold))"></div></div><div class="veb-progress-label">'+(nextRank?'Vers '+nextRank.name+' ('+nextRank.min+' ELO) — '+progress+'%':'Rang maximum atteint !')+'</div></div><div class="veb-stats"><div class="veb-stat"><div class="veb-stat-label">Parties</div><div class="veb-stat-val" style="color:var(--text)">'+vvLoadHistory().length+'</div></div><div class="veb-stat"><div class="veb-stat-label">Victoires</div><div class="veb-stat-val" style="color:var(--success)">'+vvLoadHistory().filter(h=>h.result==='win').length+'</div></div><div class="veb-stat"><div class="veb-stat-label">Pièces</div><div class="veb-stat-val" style="color:var(--gold)">'+unlockedCount+'/'+playableMilestones.length+'</div></div></div>';
  }
  const route=document.getElementById('voie-route');let html='';
  const chosen=vvLoadPrimordialeChoisie();
  if(chosen){const pd=PIECES.find(p=>p.id===chosen);if(pd)html+='<div class="vm-rank-section"><div class="vm-rank-bar" style="background:var(--primordiale-bg);border:1px solid var(--primordiale)"><span class="vm-rank-emoji">♟</span><span class="vm-rank-label" style="color:var(--primordiale)">Primordiale de départ</span></div></div><div class="voie-milestone"><div class="vm-card reached"><span class="vm-piece-emoji">'+pd.emoji+'</span><div class="vm-piece-name">'+pd.name+' ✓</div><div class="vm-piece-class pc-class Primordiale" style="color:var(--primordiale)">Primordiale — '+pd.value+' pts</div>'+(pd.ability?'<div class="vm-piece-ability">'+pd.ability.slice(0,80)+'…</div>':'')+'</div><div class="vm-center"><div class="vm-dot reached"></div><div class="vm-elo-badge">Départ</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';}
  let lastRankId=null;
  UNLOCK_MILESTONES.forEach((milestone,idx)=>{
    if(milestone.primordialeChoix)return;
    const mRank=vvGetRank(milestone.eloRequired);
    if(mRank.id!==lastRankId){lastRankId=mRank.id;html+='<div class="vm-rank-section"><div class="vm-rank-bar"><span class="vm-rank-emoji">'+mRank.emoji+'</span><span class="vm-rank-label" style="color:'+mRank.color+'">'+mRank.name+'</span><span class="vm-rank-range">'+mRank.min+'–'+(mRank.max===9999?'∞':mRank.max)+' ELO</span></div></div>';}
    if(!milestone.pieceId){const reached2=elo>=milestone.eloRequired;html+='<div class="voie-milestone"><div class="vm-card '+(reached2?'reached':'locked-milestone')+'" style="text-align:center"><span class="vm-piece-emoji">🎁</span><div class="vm-piece-name">'+milestone.label+'</div></div><div class="vm-center"><div class="vm-dot'+(reached2?' reached':'')+'"></div><div class="vm-elo-badge">'+milestone.eloRequired+' ELO</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';return;}
    const pd=PIECES.find(p=>p.id===milestone.pieceId);if(!pd)return;
    const reached=elo>=milestone.eloRequired&&VV_UNLOCKED.has(milestone.pieceId);
    const isCurrent=!reached&&elo<milestone.eloRequired&&(idx===0||(UNLOCK_MILESTONES[idx-1]&&elo>=UNLOCK_MILESTONES[idx-1].eloRequired));
    const dotCls=reached?'vm-dot reached':isCurrent?'vm-dot current-milestone':'vm-dot';
    const cardCls=reached?'vm-card reached':isCurrent?'vm-card current-milestone':'vm-card locked-milestone';
    const cc=CLASS_COLOR_VARS[pd.class]||'var(--muted)';
    const bigBadge=milestone.bigReward?'<span style="font-size:9px;background:rgba(201,168,76,.2);color:var(--gold);padding:2px 6px;border-radius:4px;font-family:Cinzel,serif;margin-left:4px">+ Récompenses</span>':'';
    html+='<div class="voie-milestone"><div class="'+cardCls+'"><span class="vm-piece-emoji">'+pd.emoji+'</span><div class="vm-piece-name">'+pd.name+bigBadge+'</div><div class="vm-piece-class pc-class '+pd.class+'" style="color:'+cc+'">'+pd.class+' — '+pd.value+' pts</div>'+(pd.ability?'<div class="vm-piece-ability">'+(pd.ability.length>80?pd.ability.slice(0,80)+'…':pd.ability)+'</div>':'')+'</div><div class="vm-center"><div class="'+dotCls+'"></div><div class="vm-elo-badge">'+(milestone.eloRequired===0?'Départ':milestone.eloRequired+' ELO')+'</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
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
    hhtml+='<div class="vh-row"><span class="vh-result '+rCls+'">'+rLbl+'</span><span class="vh-delta '+dCls+'">'+(h.delta>0?'+':'')+h.delta+'</span><span class="vh-elo">'+h.oldElo+' → '+h.newElo+'</span><span class="vh-date">'+d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span></div>';
  });
  histDiv.innerHTML=hhtml;
}

document.getElementById('b-voie').addEventListener('click',()=>{renderVoiePage();showPage('page-voie');});
document.getElementById('voie-back').addEventListener('click',()=>showPage('page-builder'));
document.getElementById('voie-scroll-top').addEventListener('click',()=>{document.getElementById('page-voie').scrollTop=0;window.scrollTo(0,0);});

// ----------------------------------------------------------------
// CHOIX DE LA PRIMORDIALE DE DÉPART (premier lancement du compte)
// ----------------------------------------------------------------
function showPrimordialeChoiceModal(){
  const modal=document.getElementById('primordiale-modal');modal.style.display='flex';
  const cont=document.getElementById('primordiale-choices');
  const primordiaux=PRIMORDIAUX_CHOIX.map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
  cont.innerHTML=primordiaux.map(p=>'<div class="primordiale-choice-card" data-id="'+p.id+'"><span class="pc-big-emoji">'+p.emoji+'</span><div class="pc-big-name">'+p.name+'</div><div class="pc-big-mvt">'+p.movement+'</div></div>').join('');
  cont.querySelectorAll('.primordiale-choice-card').forEach(el=>{
    el.addEventListener('click',()=>{
      const id=el.dataset.id;vvSavePrimordialeChoisie(id);VV_UNLOCKED.add(id);vvSaveUnlocked(VV_UNLOCKED);
      modal.style.display='none';showNotif('✨ '+(PIECES.find(p=>p.id===id)?.name)+' choisie ! Bonne chance !','ok');updAll();
    });
  });
}