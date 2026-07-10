// ================================================================
// TOURNOI.JS — Mode Tournoi (#page-tournoi) : 7 rounds contre chaque
// instructeur IA, bonus/malus ELO de fin de tournoi, et modal d'analyse
// replay des parties jouées.
// ================================================================
// Contient : l'état `tournamentState` (rounds, round courant, armée
// utilisée), le rendu de la page tournoi (progression, liste des rounds,
// bannière de résultat final), le lancement de chaque round
// (launchTournoiRound, quasi-identique à startGame() mais pilote l'ELO/la
// suite différemment), la fin de tournoi (finishTournoi, bonus ±50 ELO),
// l'overlay interstitiel entre les rounds (showRoundOverlay), et le modal
// d'analyse post-tournoi avec échiquier replay coup par coup.
//
// Dépendances : rules-engine.js (GS et son cycle de vie complet),
// game-flow.js (buildGameBoard, updateGamePlayerBars, _playerColor),
// ai-level-modal.js (selectedAILevel, AI_INSTRUCTORS), voie.js
// (vvCalcNewElo, vvCheckNewUnlocks, vvEstimateAiElo), armies.js
// (generateAIArmy), accounts.js (accGet/accSet via vvLoadHistory etc.),
// data-pieces.js (PIECES).
//
// Ce module DOIT être chargé avant game-flow.js et rules-engine.js n'est
// PAS strictement requis mais triggerEndOfGame() dans game-flow.js lit
// `tournamentState.active`, donc ce fichier doit exposer `tournamentState`
// avant que la première partie ne puisse se terminer (chargement normal
// via <script> suffit, l'ordre exact entre tournoi.js et game-flow.js
// n'a pas d'importance tant que les deux sont chargés avant tout clic).
// ================================================================

const TOURNOI_ROUNDS=[0,1,2,3,4,5,6]; // Poussière → Pierre → Bronze → Acier → Obsidienne → Argent → Or

let tournamentState={
  active:false,
  rounds:[],
  currentRound:0,
  armyData:null,
  bonusAwarded:false
};

function vvLoadTournaments(){return accGet('tournaments',[]);}
function vvSaveTournaments(arr){accSet('tournaments',arr.slice(-20));}

function tournoi_wins(){return tournamentState.rounds.filter(r=>r.result==='win').length;}
function tournoi_done(){return tournamentState.rounds.filter(r=>r.result!==null).length;}

// ----------------------------------------------------------------
// RENDU DE LA PAGE TOURNOI
// ----------------------------------------------------------------
function renderTournoiPage(){
  const banner=document.getElementById('tournoi-army-banner');
  if(tournamentState.active&&tournamentState.armyData){
    const ad=tournamentState.armyData;
    const fp=id=>PIECES.find(p=>p.id===id);
    const mon=fp(ad.mon?.id||ad.mon);const gen=fp(ad.gen?.id||ad.gen);
    const extras=(ad.extras||[]).map(id=>fp(id)).filter(Boolean);
    const all=[mon,gen,...extras].filter(Boolean);
    document.getElementById('tournoi-army-pieces').textContent=all.map(p=>p.emoji).join(' ');
    document.getElementById('tournoi-army-names').textContent=all.map(p=>p.name).join(' · ');
    banner.style.display='';
  }else{
    banner.style.display='none';
  }

  const done=tournoi_done();
  const pct=Math.round((done/7)*100);
  document.getElementById('tournoi-prog-bar').style.width=pct+'%';
  document.getElementById('tournoi-prog-count').textContent=done+' / 7';

  const cont=document.getElementById('tournoi-rounds');
  const statusLabel={null:'En attente…',win:'Victoire ✓',loss:'Défaite ✗',draw:'Nulle ~'};
  const statusCls={null:'pending',win:'win',loss:'loss',draw:'draw'};
  cont.innerHTML=TOURNOI_ROUNDS.map((instIdx,i)=>{
    const inst=AI_INSTRUCTORS[instIdx];
    const rd=tournamentState.rounds[i]||{result:null};
    const isActive=tournamentState.active&&i===tournamentState.currentRound&&rd.result===null;
    let cls='tournoi-round';
    if(rd.result==='win')cls+=' round-win';
    else if(rd.result==='loss')cls+=' round-loss';
    else if(rd.result==='draw')cls+=' round-draw';
    else if(isActive)cls+=' round-active';
    return '<div class="'+cls+'">'+
      '<div class="tr-num">Round '+(i+1)+'</div>'+
      '<div class="tr-emoji">'+inst.emoji+'</div>'+
      '<div class="tr-info"><div class="tr-name">'+inst.name+'</div><div class="tr-elo">⚡ '+inst.elo+' ELO</div></div>'+
      '<div class="tr-status '+statusCls[rd.result]+'">'+statusLabel[rd.result]+'</div>'+
      '</div>';
  }).join('');

  const resultBanner=document.getElementById('tournoi-result-banner');
  if(tournamentState.active&&done===7){
    resultBanner.classList.add('show');
    const wins=tournoi_wins();
    const isChampion=wins>=5;
    document.getElementById('trb-icon').textContent=isChampion?'🏆':'🎖';
    document.getElementById('trb-title').textContent=isChampion?'Champion du tournoi !':'Tournoi terminé';
    document.getElementById('trb-sub').textContent=wins+'/7 victoires'+(isChampion?' — Vous avez dominé le tournoi !':wins>=3?' — Bon score, continuez !':" — L'entraînement continue !");
    const bonusEl=document.getElementById('trb-bonus');
    const bonus=wins>=5?50:wins<3?-50:0;
    if(bonus>0){bonusEl.style.display='';bonusEl.textContent='🎉 Bonus tournoi : +'+bonus+' ELO';}
    else if(bonus<0){bonusEl.style.display='';bonusEl.textContent='📉 Pénalité tournoi : '+bonus+' ELO';}
    else{bonusEl.style.display='none';}
  }else{
    resultBanner.classList.remove('show');
  }

  renderTournoiHistory();
}

function renderTournoiHistory(){
  const hist=vvLoadTournaments();
  const sec=document.getElementById('tournoi-history-section');
  const list=document.getElementById('tournoi-history-list');
  if(!hist.length){sec.style.display='none';return;}
  sec.style.display='';
  list.innerHTML=[...hist].reverse().map(t=>{
    const wins=t.wins;const isChamp=wins>=5;
    const bonus=wins>=5?50:wins<3?-50:0;
    const d=new Date(t.date);
    return '<div class="th-row">'+
      '<span style="font-size:18px">'+(isChamp?'🏆':'🎖')+'</span>'+
      '<span class="th-wins '+(isChamp?'champion':'normal')+'">'+wins+'/7 victoires</span>'+
      (bonus>0?'<span class="th-bonus pos">+'+bonus+' ELO</span>':bonus<0?'<span class="th-bonus neg">'+bonus+' ELO</span>':'<span class="th-bonus zero">Aucun bonus</span>')+
      '<span class="th-date">'+d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span>'+
      '</div>';
  }).join('');
}

// ----------------------------------------------------------------
// LANCEMENT DU TOURNOI ET DE CHAQUE ROUND
// ----------------------------------------------------------------
function startTournoi(){
  if(!currentArmyData){showNotif('Choisissez une armée dans "Mes armées" avant de lancer un tournoi.','err');return;}
  tournamentState={
    active:true,
    rounds:TOURNOI_ROUNDS.map(idx=>({instructorIdx:idx,result:null,eloDelta:0})),
    currentRound:0,
    armyData:currentArmyData,
    bonusAwarded:false
  };
  renderTournoiPage();
  launchTournoiRound(0);
}

// Réinitialise _endGameTriggered au début de CHAQUE round (launchTournoiRound
// construit la partie manuellement sans passer par startGame(), qui fait
// normalement cette réinitialisation).
function launchTournoiRound(roundIdx){
  if(roundIdx>=7){finishTournoi();return;}
  _endGameTriggered=false;
  const rd=tournamentState.rounds[roundIdx];
  const instIdx=rd.instructorIdx;
  selectedAILevel=instIdx;
  aiArmyData=generateAIArmy();
  // Sauvegarder l'armée IA du round pour l'analyse ultérieure
  tournamentState.rounds[roundIdx].aiArmy=JSON.parse(JSON.stringify(aiArmyData));
  tournamentState.rounds[roundIdx].movesLog=null;
  currentArmyData=tournamentState.armyData;
  if(!currentArmyData||!aiArmyData){showNotif('Erreur armée.','err');return;}
  // Tirage couleur aléatoire pour le tournoi aussi
  _playerColor=Math.random()<0.5?'w':'b';
  const _aiColor2=_playerColor==='w'?'b':'w';
  const whiteSideArmy2=_playerColor==='w'?currentArmyData:aiArmyData;
  const blackSideArmy2=_playerColor==='w'?aiArmyData:currentArmyData;
  GS={board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,halfmoveClock:0,gameOver:false,
    playerArmy:currentArmyData,aiArmy:aiArmyData,playerColor:_playerColor,aiColor:_aiColor2,movePairs:[],capturedW:[],capturedB:[],pendingPromo:null,
    medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),pretreProtected:new Set(),illusionDecoys:[],
    amazonePostCapture:null,grandMaitreAlive:{w:false,b:false},dictatorSacrifice:null,
    imitateurUsed:{w:false,b:false},gardePierreUsed:{w:false,b:false},ombreVisibleUntil:{},
    turnCount:0,nonSensReversed:{},singeAwaitingStep2:null,_singeStep2Moves:null,nyxColor:null,historyView:null,lastMoveHistory:[]};
  GS.board=buildGameBoard(whiteSideArmy2,blackSideArmy2);
  const playerHasClown2=(currentArmyData.extras||[]).some(id=>id==='clown');
  const aiHasClown=(aiArmyData.extras||[]).some(id=>id==='clown');
  if(playerHasClown2){const choices=PIECES.filter(p=>p.id!=='clown'&&p.class!=='Monarque'&&p.class!=='Général');clownDisguise[_playerColor]=choices[Math.floor(Math.random()*choices.length)];}
  else clownDisguise[_playerColor]=null;
  if(aiHasClown){const choices=PIECES.filter(p=>p.id!=='clown'&&p.class!=='Monarque'&&p.class!=='Général');clownDisguise[_aiColor2]=choices[Math.floor(Math.random()*choices.length)];}
  else clownDisguise[_aiColor2]=null;
  updateMedusaParalysis(GS.board,GS);updatePretreProtection(GS.board,GS);updateGrandMaitre(GS.board,GS);updateNyx(GS.board,GS);
  showPage('page-game');
  updateGamePlayerBars();
  renderGame(GS);updateStatus(GS);updateHistoryNav();
  setTimeout(()=>{buildGameLabels(GS);renderGame(GS);},80);
  if(_playerColor==='b')setTimeout(()=>doAIMove(GS),800);
  showArmyIntro(currentArmyData,aiArmyData);
}

// ----------------------------------------------------------------
// FIN DE TOURNOI — bonus/malus ELO cumulé
// ----------------------------------------------------------------
function finishTournoi(){
  const wins=tournoi_wins();
  const bonus=wins>=5?50:wins<3?-50:0;
  if(bonus!==0&&!tournamentState.bonusAwarded){
    tournamentState.bonusAwarded=true;
    const oldElo=vvLoadElo();
    const newElo=Math.max(0,oldElo+bonus);
    vvSaveElo(newElo);
    if(bonus>0)vvCheckNewUnlocks(oldElo,newElo);
  }
  const hist=vvLoadTournaments();
  hist.push({
    date:Date.now(),wins,
    rounds:tournamentState.rounds.map(r=>({instIdx:r.instructorIdx,result:r.result,eloDelta:r.eloDelta,playerArmy:tournamentState.armyData,aiArmy:r.aiArmy})),
    bonus:wins>=5?50:wins<3?-50:0
  });
  vvSaveTournaments(hist);
  renderTournoiPage();
  showPage('page-tournoi');
}

// ----------------------------------------------------------------
// OVERLAY INTERSTITIEL ENTRE LES ROUNDS
// ----------------------------------------------------------------
function showRoundOverlay(roundIdx,result,eloBefore,eloAfter,eloDelta){
  const overlay=document.getElementById('round-overlay');
  const icons={win:'🏆',loss:'💀',draw:'🤝'};
  const texts={win:'Victoire !',loss:'Défaite',draw:'Nulle'};
  const isLast=roundIdx===6;

  document.getElementById('rb-round-label').textContent='Round '+(roundIdx+1)+' / 7';
  document.getElementById('rb-result-icon').textContent=icons[result];
  const rt=document.getElementById('rb-result-text');
  rt.textContent=texts[result];rt.className='rb-result-text '+result;
  document.getElementById('rb-elo-before').textContent=eloBefore;
  document.getElementById('rb-elo-after').textContent=eloAfter;
  const de=document.getElementById('rb-elo-delta');
  de.textContent=(eloDelta>0?'+':'')+eloDelta;
  de.className='rb-elo-delta '+(eloDelta>0?'pos':eloDelta<0?'neg':'zero');

  const nextWrap=document.getElementById('rb-next-wrap');
  const nextBtn=document.getElementById('rb-next-btn');
  if(!isLast){
    nextWrap.style.display='';
    const nextInst=AI_INSTRUCTORS[TOURNOI_ROUNDS[roundIdx+1]];
    document.getElementById('rb-next-emoji').textContent=nextInst.emoji;
    document.getElementById('rb-next-name').textContent=nextInst.name;
    document.getElementById('rb-next-elo').textContent='⚡ '+nextInst.elo+' ELO';
    nextBtn.textContent='Round suivant →';
  }else{
    nextWrap.style.display='none';
    nextBtn.textContent='Voir le résultat final 🏆';
  }

  overlay.classList.add('show');

  const newBtn=nextBtn.cloneNode(true);nextBtn.replaceWith(newBtn);
  newBtn.addEventListener('click',()=>{
    overlay.classList.remove('show');
    if(!isLast){
      tournamentState.currentRound=roundIdx+1;
      renderTournoiPage();
      launchTournoiRound(roundIdx+1);
    }else{
      finishTournoi();
    }
  },{once:true});
}

// ----------------------------------------------------------------
// FIN DE PARTIE EN CONTEXTE TOURNOI (appelée par game-render.js::updateStatus
// et game-flow.js::game-quit lorsque tournamentState.active === true)
// ----------------------------------------------------------------
function triggerTournoiEndOfGame(result){
  if(_endGameTriggered)return;_endGameTriggered=true;

  const roundIdx=tournamentState.currentRound;
  const oldElo=vvLoadElo();
  const aiElo=vvEstimateAiElo();
  const{newElo,delta}=vvCalcNewElo(oldElo,aiElo,result);
  const newRankIdx=vvGetRankIdx(newElo);if(newRankIdx>vvLoadRankMax())vvSaveRankMax(newRankIdx);
  vvCheckNewUnlocks(oldElo,newElo);
  vvSaveElo(newElo);
  const history=vvLoadHistory();
  history.push({result,oldElo,newElo,delta,date:Date.now(),aiElo,tournoi:true});
  vvSaveHistory(history);

  tournamentState.rounds[roundIdx].result=result;
  tournamentState.rounds[roundIdx].eloDelta=delta;
  tournamentState.rounds[roundIdx].movesLog=GS.movePairs?JSON.parse(JSON.stringify(GS.movePairs)):[];
  const boardSnapshots=[buildGameBoard(tournamentState.armyData,tournamentState.rounds[roundIdx].aiArmy)];
  (GS.history||[]).forEach(snap=>{boardSnapshots.push(snap.board.map(r=>r.map(p=>p?{...p}:null)));});
  boardSnapshots.push(GS.board.map(r=>r.map(p=>p?{...p}:null)));
  tournamentState.rounds[roundIdx].boardHistory=boardSnapshots;

  setTimeout(()=>playSound(result==='win'?'win':result==='loss'?'loss':'draw'),200);

  setTimeout(()=>showRoundOverlay(roundIdx,result,oldElo,newElo,delta),400);
}

// ----------------------------------------------------------------
// LISTENERS UI PAGE TOURNOI
// ----------------------------------------------------------------
document.getElementById('b-tournoi').addEventListener('click',()=>{
  renderTournoiPage();showPage('page-tournoi');
});
document.getElementById('tournoi-back').addEventListener('click',()=>showPage('page-builder'));
document.getElementById('tournoi-back2').addEventListener('click',()=>{
  tournamentState.active=false;
  army={mon:null,gen:null,pcs:[null,null,null],prims:[]};
  editingArmyId=null;updAll();
  showPage('page-builder');
});
document.getElementById('tournoi-restart').addEventListener('click',()=>{
  tournamentState.active=false;
  showNotif('Sélectionnez votre armée depuis "Mes armées" puis lancez un nouveau tournoi.','ok');
  renderArmiesPage();showPage('page-armies');
});

// ================================================================
// ANALYSE DE TOURNOI — modal de replay coup par coup
// ================================================================
let taCurrentRound=null;
let taMoveIdx=0;
let taBoardStates=[];

function openTournoiAnalyse(){
  const modal=document.getElementById('tournoi-analyse-modal');
  modal.style.visibility='visible';
  renderTournoiAnalyseRounds();
  document.getElementById('tournoi-analyse-replay').style.display='none';
}

function renderTournoiAnalyseRounds(){
  const cont=document.getElementById('tournoi-analyse-rounds');
  const statusIcon={win:'✅',loss:'❌',draw:'🤝',null:'⏳'};
  const statusCls={win:'var(--success)',loss:'var(--danger)',draw:'var(--gold)',null:'var(--muted)'};
  cont.innerHTML=tournamentState.rounds.map((rd,i)=>{
    const inst=AI_INSTRUCTORS[rd.instructorIdx];
    const canReplay=rd.result!==null;
    return '<div style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:14px;text-align:center;cursor:'+(canReplay?'pointer':'default')+';transition:all .2s" '
      +(canReplay?'onclick="loadTournoiRoundReplay('+i+')" onmouseenter="this.style.borderColor=\'var(--gold)\'" onmouseleave="this.style.borderColor=\'var(--border)\'"':'')+'>'
      +'<div style="font-family:\'Cinzel\',serif;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Round '+(i+1)+'</div>'
      +'<div style="font-size:26px;margin-bottom:4px">'+inst.emoji+'</div>'
      +'<div style="font-family:\'Cinzel\',serif;font-size:11px;font-weight:700;margin-bottom:6px">'+inst.name+'</div>'
      +'<div style="font-size:18px;color:'+statusCls[rd.result]+'">'+statusIcon[rd.result||'null']+'</div>'
      +(canReplay?'<div style="font-size:9px;color:var(--muted);margin-top:5px;font-family:\'Cinzel\',serif">Cliquer pour analyser</div>':'')
      +'</div>';
  }).join('');
}

window.loadTournoiRoundReplay=function(roundIdx){
  const rd=tournamentState.rounds[roundIdx];
  if(!rd||rd.result===null)return;
  taCurrentRound=roundIdx;
  const inst=AI_INSTRUCTORS[rd.instructorIdx];

  document.getElementById('tournoi-analyse-replay-title').textContent=
    'Round '+(roundIdx+1)+' — '+inst.emoji+' '+inst.name+' — '+(rd.result==='win'?'Victoire ✅':rd.result==='loss'?'Défaite ❌':'Nulle 🤝');

  const pArmy=tournamentState.armyData;
  const aArmy=rd.aiArmy;
  const fp=id=>PIECES.find(p=>p.id===id);
  function armyPieces(ad){
    if(!ad)return[];
    const mon=fp(ad.mon?.id||ad.mon);
    const gen=fp(ad.gen?.id||ad.gen);
    const extras=(ad.extras||[]).map(id=>fp(id)).filter(Boolean);
    return[mon,gen,...extras].filter(Boolean);
  }
  const pPieces=armyPieces(pArmy);
  const aPieces=armyPieces(aArmy);
  document.getElementById('ta-player-army').textContent=pPieces.map(p=>p.emoji).join(' ');
  document.getElementById('ta-player-names').textContent=pPieces.map(p=>p.name).join(' · ');
  document.getElementById('ta-ai-label').textContent=inst.name;
  document.getElementById('ta-ai-army').textContent=aPieces.map(p=>p.emoji).join(' ');
  document.getElementById('ta-ai-names').textContent=aPieces.map(p=>p.name).join(' · ');

  if(rd.boardHistory&&rd.boardHistory.length>0){
    taBoardStates=rd.boardHistory;
  }else{
    taBoardStates=[buildGameBoard(pArmy,aArmy||{mon:{id:'roi'},gen:{id:'dame'},extras:[]})];
  }

  taMoveIdx=0;
  renderTaBoard(taBoardStates[0],null,null);
  renderTaMoveLog(rd.movesLog||[]);

  document.getElementById('tournoi-analyse-replay').style.display='';
  setTimeout(()=>{document.getElementById('tournoi-analyse-modal').scrollTop=9999;},100);
};

function renderTaBoard(boardState,fromCell,toCell){
  const cont=document.getElementById('ta-board');
  let html='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const isLight=(r+c)%2===0;
    const cell=boardState[r][c];
    const isHL=(fromCell&&fromCell.r===r&&fromCell.c===c)||(toCell&&toCell.r===r&&toCell.c===c);
    html+='<div class="ta-cell '+(isLight?'light':'dark')+(isHL?' highlight':'')+'">'+(cell?cell.emoji||'':'')+'</div>';
  }
  cont.innerHTML=html;
  const idx=taMoveIdx;const total=taBoardStates.length-1;
  document.getElementById('ta-move-idx').textContent='Coup '+idx+' / '+total;
}

function renderTaMoveLog(movePairs){
  const log=document.getElementById('ta-movelog');
  if(!movePairs||!movePairs.length){log.innerHTML='<span style="color:var(--muted)">Aucun coup enregistré</span>';return;}
  let html='';
  movePairs.forEach((pair,i)=>{
    const wTxt=Array.isArray(pair)?pair[0]||'—':(pair.w||'—');
    const bTxt=Array.isArray(pair)?pair[1]||'':(pair.b||'');
    const miW=i*2+1;
    const miB=i*2+2;
    html+='<div style="display:flex;gap:4px;align-items:baseline">'
      +'<span style="color:var(--muted);min-width:20px;font-size:10px">'+(i+1)+'.</span>'
      +'<span class="ta-move-item" data-mi="'+miW+'" onclick="taGotoMove('+miW+')">'+wTxt+'</span>'
      +(bTxt?'<span class="ta-move-item" data-mi="'+miB+'" onclick="taGotoMove('+miB+')">'+bTxt+'</span>':'')
      +'</div>';
  });
  log.innerHTML=html;
}

window.taGotoMove=function(idx){
  idx=Math.max(0,Math.min(idx,taBoardStates.length-1));
  taMoveIdx=idx;
  renderTaBoard(taBoardStates[idx],null,null);
  document.querySelectorAll('.ta-move-item').forEach(el=>{
    el.classList.toggle('active',parseInt(el.dataset.mi)===idx);
  });
};

document.getElementById('tournoi-analyse-close').addEventListener('click',()=>{
  document.getElementById('tournoi-analyse-modal').style.visibility='hidden';
});
document.getElementById('ta-first').addEventListener('click',()=>taGotoMove(0));
document.getElementById('ta-prev').addEventListener('click',()=>taGotoMove(taMoveIdx-1));
document.getElementById('ta-next').addEventListener('click',()=>taGotoMove(taMoveIdx+1));
document.getElementById('ta-last').addEventListener('click',()=>taGotoMove(taBoardStates.length-1));

document.getElementById('tournoi-analyze').addEventListener('click',openTournoiAnalyse);