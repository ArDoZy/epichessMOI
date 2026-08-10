// ================================================================
// TOURNOI.JS : Mode Tournoi (#page-tournoi), 7 rounds contre chaque
// instructeur IA, abandon/reprise d'un tournoi en cours, et modal d'analyse
// replay des parties jouées. Aucun bonus/pénalité d'ELO de fin de tournoi :
// seul l'ELO gagné ou perdu round par round compte.
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
// ai-level-modal.js (selectedAILevel), voie.js
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

// Le tournoi opposait sept fois de suite le MÊME instructeur sous sept noms
// d'épreuves, la difficulté ne montant que par le budget de son armée. Les
// douze adversaires (AI_OPPONENTS dans js/data-pieces.js) rendent la
// gradation réelle : le tournoi est la moitié haute de l'échelle, de Vitriol
// (800 ELO) à l'Athanor (2300), chacun avec sa force de calcul, son style et
// son armée. C'est le même parcours que la galerie, mais d'une traite et sans
// pouvoir choisir son adversaire.
const TOURNOI_OPPONENT_IDS=['vitriol','cinabre','antimoine','mercure','plombagine','salamandre','athanor'];
const TOURNOI_ROUNDS=[0,1,2,3,4,5,6];
function tournoiTier(i){
  const id=TOURNOI_OPPONENT_IDS[Math.min(Math.max(i,0),TOURNOI_OPPONENT_IDS.length-1)];
  const o=aiOpponentById(id);
  // minValue/name restent exposés sous ces noms : l'overlay de round et la
  // page tournoi les lisent déjà.
  return{...o,minValue:Math.max(0,o.budget-3)};
}

let tournamentState={
  active:false,
  rounds:[],
  currentRound:0,
  armyData:null,
  bonusAwarded:false
};

function vvLoadTournaments(){return accGet('tournaments',[]);}
function vvSaveTournaments(arr){accSet('tournaments',arr.slice(-20));}

// ----------------------------------------------------------------
// TOURNOI ABANDONNÉ : sauvegarde de la progression pour pouvoir reprendre
// ----------------------------------------------------------------
// Quitter un tournoi en cours (bouton « Quitter le tournoi » de l'overlay de
// fin de round) le met de côté ici ; au prochain clic sur « Tournoi » depuis
// le menu principal, on propose de le reprendre.
// L'historique des plateaux (rounds[].boardHistory) N'EST PAS conservé : ce
// sont des dizaines de plateaux 8×8 complets par round, bien trop volumineux
// pour localStorage. L'analyse des rounds joués avant l'interruption repart
// donc de la position initiale.
const TOURNOI_SAVE_KEY='tournoi_saved';
function saveTournoiProgress(){
  if(!tournamentState.active||!tournamentState.armyData){accSet(TOURNOI_SAVE_KEY,null);return;}
  accSet(TOURNOI_SAVE_KEY,{
    rounds:tournamentState.rounds.map(r=>({
      instructorIdx:r.instructorIdx,result:r.result,eloDelta:r.eloDelta,
      aiArmy:r.aiArmy||null,playerColor:r.playerColor||null,movesLog:r.movesLog||null
    })),
    currentRound:tournamentState.currentRound,
    armyData:tournamentState.armyData
  });
}
function loadTournoiProgress(){return accGet(TOURNOI_SAVE_KEY,null);}
function clearTournoiProgress(){accSet(TOURNOI_SAVE_KEY,null);}
function hasAbandonedTournoi(){
  const s=loadTournoiProgress();
  return !!(s&&s.armyData&&Array.isArray(s.rounds)&&s.rounds.some(r=>r.result===null));
}

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
    document.getElementById('tournoi-army-pieces').innerHTML=all.map(p=>pieceIcon(p.id,'n')).join('');
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
    const inst=tournoiTier(i);
    const rd=tournamentState.rounds[i]||{result:null};
    const isActive=tournamentState.active&&i===tournamentState.currentRound&&rd.result===null;
    let cls='tournoi-round';
    if(rd.result==='win')cls+=' round-win';
    else if(rd.result==='loss')cls+=' round-loss';
    else if(rd.result==='draw')cls+=' round-draw';
    else if(isActive)cls+=' round-active';
    return '<div class="'+cls+'">'+
      '<div class="tr-num">Round '+(i+1)+'</div>'+
      '<div class="tr-info"><div class="tr-name">'+inst.name+'</div><div class="tr-elo">'+inst.elo+' ELO</div></div>'+
      '<div class="tr-status '+statusCls[rd.result]+'">'+statusLabel[rd.result]+'</div>'+
      '</div>';
  }).join('');

  const resultBanner=document.getElementById('tournoi-result-banner');
  if(tournamentState.active&&done===7){
    resultBanner.classList.add('show');
    const wins=tournoi_wins();
    const isChampion=wins>=5;
    document.getElementById('trb-icon').textContent=isChampion?'▲':'◆';
    document.getElementById('trb-title').textContent=isChampion?'Champion du tournoi !':'Tournoi terminé';
    document.getElementById('trb-sub').textContent=wins+'/7 victoires. '+(isChampion?'Vous avez dominé le tournoi !':wins>=3?'Bon score, continuez !':"L'entraînement continue !");
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
    const d=new Date(t.date);
    return '<div class="th-row">'+
      '<span style="font-size:18px;color:var(--gold2)">'+(isChamp?'▲':'◆')+'</span>'+
      '<span class="th-wins '+(isChamp?'champion':'normal')+'">'+wins+'/7 victoires</span>'+
      '<span class="th-date">'+d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span>'+
      '</div>';
  }).join('');
}

// ----------------------------------------------------------------
// LANCEMENT DU TOURNOI ET DE CHAQUE ROUND
// ----------------------------------------------------------------
function startTournoi(){
  if(!currentArmyData){showNotif('Choisissez une armée dans "Mes armées" avant de lancer un tournoi.','err');return;}
  clearTournoiProgress();   // un nouveau tournoi remplace tout tournoi abandonné
  tournamentState={
    active:true,
    rounds:TOURNOI_ROUNDS.map(idx=>({instructorIdx:idx,result:null,eloDelta:0})),
    currentRound:0,
    armyData:currentArmyData
  };
  renderTournoiPage();
  launchTournoiRound(0);
}

// Reprise d'un tournoi abandonné : on repart du round où il s'était arrêté.
function resumeTournoi(saved){
  tournamentState={
    active:true,
    rounds:saved.rounds.map(r=>({...r})),
    currentRound:saved.currentRound,
    armyData:saved.armyData
  };
  currentArmyData=saved.armyData;
  renderTournoiPage();showPage('page-tournoi');
  setTimeout(()=>launchTournoiRound(tournamentState.currentRound),150);
}

// Abandon depuis l'overlay de fin de round : la progression est mise de côté
// (reprise possible), le tournoi disparaît de l'écran et on rentre au menu.
window.quitTournoi=()=>{
  saveTournoiProgress();
  tournamentState.active=false;
  document.getElementById('round-overlay').classList.remove('show');
  showNotif('Tournoi interrompu, vous pourrez le reprendre depuis le menu.','ok');
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-builder');
};

// Réinitialise _endGameTriggered au début de CHAQUE round (launchTournoiRound
// construit la partie manuellement sans passer par startGame(), qui fait
// normalement cette réinitialisation).
function launchTournoiRound(roundIdx){
  if(roundIdx>=7){finishTournoi();return;}
  _endGameTriggered=false;
  const rd=tournamentState.rounds[roundIdx];
  const tier=tournoiTier(roundIdx);
  // Chaque round a son adversaire, avec sa propre force de calcul : c'est lui
  // que la recherche doit incarner, pas l'index laissé par la partie
  // précédente.
  selectedAILevel=aiOpponentIndex(tier.id);
  // L'ELO de référence du palier sert au calcul du gain : perdre au round 7
  // ne doit pas coûter autant que perdre au round 1.
  if(typeof vvSetOpponentElo==='function')vvSetOpponentElo(tier.elo);
  aiArmyData=generateAIArmy(tier.minValue,{style:tier.style,budget:tier.budget,full:true});
  // Sauvegarder l'armée IA du round pour l'analyse ultérieure
  tournamentState.rounds[roundIdx].aiArmy=JSON.parse(JSON.stringify(aiArmyData));
  tournamentState.rounds[roundIdx].movesLog=null;
  currentArmyData=tournamentState.armyData;
  if(!currentArmyData||!aiArmyData){showNotif('Erreur armée.','err');return;}
  // Tirage couleur aléatoire pour le tournoi aussi. Mémorisée sur le round :
  // l'analyse a besoin de savoir de quel côté le joueur était pour reconstruire
  // et orienter correctement le plateau.
  _playerColor=Math.random()<0.5?'w':'b';
  tournamentState.rounds[roundIdx].playerColor=_playerColor;
  const _aiColor2=_playerColor==='w'?'b':'w';
  const whiteSideArmy2=_playerColor==='w'?currentArmyData:aiArmyData;
  const blackSideArmy2=_playerColor==='w'?aiArmyData:currentArmyData;
  // Même cadence que le reste du jeu : 10 min + 5 s par coup (js/ai-level-modal.js).
  const clockMs2=(typeof selectedTimeControl==='number'&&selectedTimeControl>0)?selectedTimeControl*60000:0;
  const incrementMs2=(typeof selectedTimeIncrement==='number'&&selectedTimeIncrement>0)?selectedTimeIncrement*1000:0;
  GS={board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,halfmoveClock:0,gameOver:false,
    playerArmy:currentArmyData,aiArmy:aiArmyData,playerColor:_playerColor,aiColor:_aiColor2,movePairs:[],capturedW:[],capturedB:[],pendingPromo:null,
    medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),pretreProtected:new Set(),
    amazonePostCapture:null,grandMaitreAlive:{w:false,b:false},
    gardePierreUsed:{w:false,b:false},
    turnCount:0,historyView:null,lastMoveHistory:[],clockMs:clockMs2,incrementMs:incrementMs2,timeWhite:clockMs2,timeBlack:clockMs2};
  GS.board=buildGameBoard(whiteSideArmy2,blackSideArmy2);
  // Le journal des coups garde sinon ceux du round précédent jusqu'au premier
  // coup joué (voir la même remise à zéro dans js/game-flow.js::startGame).
  if(typeof renderMoveLog==='function')renderMoveLog(GS);
  updateMedusaParalysis(GS.board,GS);updatePretreProtection(GS.board,GS);updateGrandMaitre(GS.board,GS);
  // Un round de tournoi engage les pièces comme n'importe quelle partie.
  if(typeof economyCommit==='function')economyCommit(currentArmyData);
  if(typeof renderGameStake==='function')renderGameStake(GS);
  showPage('page-game');
  updateGamePlayerBars();
  renderGame(GS);updateStatus(GS);updateHistoryNav();
  setTimeout(()=>{buildGameLabels(GS);renderGame(GS);},80);
  // Le premier coup de l'IA est déclenché par la fin de la cinématique
  // d'entrée (showArmyIntro), comme en partie normale.
  showArmyIntro(currentArmyData,aiArmyData);
  saveTournoiProgress();
}

// ----------------------------------------------------------------
// FIN DE TOURNOI
// ----------------------------------------------------------------
// Aucun bonus ni pénalité d'ELO de fin de tournoi : seul l'ELO gagné/perdu
// round par round (comme une partie normale) compte.
function finishTournoi(){
  const wins=tournoi_wins();
  const hist=vvLoadTournaments();
  hist.push({
    date:Date.now(),wins,
    rounds:tournamentState.rounds.map(r=>({instIdx:r.instructorIdx,result:r.result,eloDelta:r.eloDelta,playerArmy:tournamentState.armyData,aiArmy:r.aiArmy}))
  });
  vvSaveTournaments(hist);
  clearTournoiProgress();   // tournoi terminé : plus rien à reprendre
  renderTournoiPage();
  showPage('page-tournoi');
}

// ----------------------------------------------------------------
// OVERLAY INTERSTITIEL ENTRE LES ROUNDS
// ----------------------------------------------------------------
// noEloReason : renseigné quand le round n'a pas compté (mode admin).
function showRoundOverlay(roundIdx,result,eloBefore,eloAfter,eloDelta,noEloReason){
  const overlay=document.getElementById('round-overlay');
  const icons={win:'▲',loss:'▼',draw:'◆'};
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
  const eloRow=document.querySelector('#round-overlay .rb-elo-row');
  if(eloRow)eloRow.style.display=noEloReason?'none':'';

  const nextWrap=document.getElementById('rb-next-wrap');
  const nextBtn=document.getElementById('rb-next-btn');
  if(!isLast){
    nextWrap.style.display='';
    const nextInst=tournoiTier(roundIdx+1);
    document.getElementById('rb-next-name').textContent=nextInst.name;
    document.getElementById('rb-next-elo').textContent=nextInst.elo+' ELO · armée '+nextInst.minValue+'+ pts';
    nextBtn.textContent='Round suivant →';
  }else{
    nextWrap.style.display='none';
    nextBtn.textContent='Voir le résultat final';
  }

  // « Quitter le tournoi » n'a de sens que s'il reste des rounds à jouer :
  // au dernier round, le tournoi est terminé, il n'y a plus rien à abandonner.
  const quitBtn=document.getElementById('rb-quit-btn');
  if(quitBtn)quitBtn.style.display=isLast?'none':'';

  overlay.classList.add('show');

  const newBtn=nextBtn.cloneNode(true);nextBtn.replaceWith(newBtn);
  newBtn.addEventListener('click',()=>{
    overlay.classList.remove('show');
    if(!isLast){
      tournamentState.currentRound=roundIdx+1;
      saveTournoiProgress();
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
  stopClockTick(GS);
  endCombatMusic();

  const roundIdx=tournamentState.currentRound;
  const oldElo=vvLoadElo();
  const aiElo=vvEstimateAiElo();
  // Mode admin : un round de tournoi ne rapporte rien non plus (voir
  // vvNoEloReason dans voie.js).
  const noEloReason=(typeof vvNoEloReason==='function')?vvNoEloReason(GS):null;
  let newElo=oldElo,delta=0;
  if(!noEloReason){
    const calc=vvCalcNewElo(oldElo,aiElo,result);
    newElo=calc.newElo;delta=calc.delta;
    const newRankIdx=vvGetRankIdx(newElo);if(newRankIdx>vvLoadRankMax())vvSaveRankMax(newRankIdx);
    vvCheckNewUnlocks(oldElo,newElo);
    vvSaveElo(newElo);
  }
  const history=vvLoadHistory();
  history.push({result,oldElo,newElo,delta,date:Date.now(),aiElo,tournoi:true,ranked:!noEloReason});
  vvSaveHistory(history);

  tournamentState.rounds[roundIdx].result=result;
  tournamentState.rounds[roundIdx].eloDelta=delta;
  tournamentState.rounds[roundIdx].movesLog=GS.movePairs?JSON.parse(JSON.stringify(GS.movePairs)):[];
  // Les positions de l'analyse viennent UNIQUEMENT de GS : un instantané est
  // empilé dans GS.history AVANT chaque coup, donc GS.history[0] EST déjà la
  // position de départ. Reconstruire une position initiale à part (comme
  // avant) donnait un premier plateau reconstruit avec le joueur toujours du
  // côté des Blancs : quand le joueur avait les Noirs, le plateau se
  // retournait dès qu'on avançait d'un coup, et il y avait en plus un
  // doublon de la position de départ.
  const boardSnapshots=(GS.history||[]).map(snap=>snap.board.map(r=>r.map(p=>p?{...p}:null)));
  boardSnapshots.push(GS.board.map(r=>r.map(p=>p?{...p}:null)));
  tournamentState.rounds[roundIdx].boardHistory=boardSnapshots;
  saveTournoiProgress();

  setTimeout(()=>playSound(result==='win'?'win':result==='loss'?'loss':'draw'),200);

  // Même enchaînement qu'une partie normale (js/economy-ui.js) : règlement de
  // la Réserve, cinématique d'issue, ouverture du coffre gagné, puis verdict.
  const showOverlay=()=>showRoundOverlay(roundIdx,result,oldElo,newElo,delta,noEloReason);
  if(typeof settleAndCelebrate==='function')settleAndCelebrate(result,GS,showOverlay);
  else setTimeout(showOverlay,400);
  if(typeof renderStreakBadge==='function')renderStreakBadge();
}

// ----------------------------------------------------------------
// LISTENERS UI PAGE TOURNOI
// ----------------------------------------------------------------
// Bouton "Tournoi" du menu principal : comme le bouton COMBAT, il passe
// d'abord par "Mes armées" en mode sélection, le tournoi démarre une fois
// l'armée choisie (voir armies.js : startArmySelection/launchTournoiFromArmy).
// Un tournoi abandonné en cours de route est proposé à la reprise ; « Non »
// le supprime définitivement et enchaîne sur un nouveau tournoi.
function startNewTournoi(){
  clearTournoiProgress();
  if(typeof startArmySelection==='function')startArmySelection('tournoi');
  else{renderTournoiPage();showPage('page-tournoi');}
}
document.getElementById('b-tournoi').addEventListener('click',()=>{
  // Pendant le tutoriel, le tournoi n'a pas de sens : il demande une armée
  // composée, que le joueur n'a pas encore. Le clic est renvoyé vers la
  // bataille scriptée en cours (voir tutoInterceptCombat).
  if(typeof tutoInterceptCombat==='function'&&tutoInterceptCombat())return;
  if(typeof tutoActive==='function'&&tutoActive())return;
  if(hasAbandonedTournoi()){
    const saved=loadTournoiProgress();
    showConfirmModal('Continuer le tournoi précédent ?',()=>resumeTournoi(saved),
      {okLabel:'Oui',cancelLabel:'Non',okClass:'btn-gold',onNo:startNewTournoi});
    return;
  }
  startNewTournoi();
});
// Le bouton "Tournoi" n'est plus dans le builder (il vit désormais sous
// JOUER sur la face principale du cube) : les retours ramènent donc au
// menu principal plutôt qu'au builder.
document.getElementById('tournoi-back').addEventListener('click',()=>{if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-builder');});
document.getElementById('tournoi-back2').addEventListener('click',()=>{
  tournamentState.active=false;
  army={mon:null,gen:null,extras:[]};
  editingArmyId=null;updAll();
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-builder');
});
document.getElementById('tournoi-restart').addEventListener('click',()=>{
  tournamentState.active=false;
  startNewTournoi();
});
document.getElementById('rb-quit-btn').addEventListener('click',quitTournoi);

// ================================================================
// ANALYSE DE TOURNOI : modal de replay coup par coup
// ================================================================
let taCurrentRound=null;
let taMoveIdx=0;
let taBoardStates=[];
let taFlip=false;   // vrai si le joueur avait les Noirs sur le round analysé

function openTournoiAnalyse(){
  const modal=document.getElementById('tournoi-analyse-modal');
  modal.style.visibility='visible';
  renderTournoiAnalyseRounds();
  document.getElementById('tournoi-analyse-replay').style.display='none';
}

function renderTournoiAnalyseRounds(){
  const cont=document.getElementById('tournoi-analyse-rounds');
  const statusIcon={win:'▲',loss:'▼',draw:'◆',null:'○'};
  const statusCls={win:'var(--success)',loss:'var(--danger)',draw:'var(--gold)',null:'var(--muted)'};
  cont.innerHTML=tournamentState.rounds.map((rd,i)=>{
    const inst=tournoiTier(i);
    const canReplay=rd.result!==null;
    return '<div style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:14px;text-align:center;cursor:'+(canReplay?'pointer':'default')+';transition:all .2s" '
      +(canReplay?'onclick="loadTournoiRoundReplay('+i+')" onmouseenter="this.style.borderColor=\'var(--gold)\'" onmouseleave="this.style.borderColor=\'var(--border)\'"':'')+'>'
      +'<div style="font-family:\'Cinzel\',serif;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Round '+(i+1)+'</div>'
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
  const inst=tournoiTier(roundIdx);

  document.getElementById('tournoi-analyse-replay-title').textContent=
    'Round '+(roundIdx+1)+' · '+inst.name+' · '+(rd.result==='win'?'Victoire':rd.result==='loss'?'Défaite':'Nulle');

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
  document.getElementById('ta-player-army').innerHTML=pPieces.map(p=>pieceIcon(p.id,'n')).join('');
  document.getElementById('ta-player-names').textContent=pPieces.map(p=>p.name).join(' · ');
  document.getElementById('ta-ai-label').textContent=inst.name;
  document.getElementById('ta-ai-army').innerHTML=aPieces.map(p=>pieceIcon(p.id,'n')).join('');
  document.getElementById('ta-ai-names').textContent=aPieces.map(p=>p.name).join(' · ');

  // Le plateau est présenté du point de vue du joueur, comme pendant la
  // partie : retourné s'il avait les Noirs sur ce round.
  taFlip=rd.playerColor==='b';

  if(rd.boardHistory&&rd.boardHistory.length>0){
    taBoardStates=rd.boardHistory;
  }else{
    // Pas d'historique (round rejoué après reprise d'un tournoi interrompu) :
    // on se contente de la position de départ, reconstruite du bon côté.
    const fallbackAi=aArmy||{mon:{id:'roi'},gen:{id:'dame'},extras:[]};
    taBoardStates=[taFlip?buildGameBoard(fallbackAi,pArmy):buildGameBoard(pArmy,fallbackAi)];
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
  for(let vi=0;vi<8;vi++)for(let vc=0;vc<8;vc++){
    const r=taFlip?7-vi:vi;
    const c=taFlip?7-vc:vc;
    const isLight=(r+c)%2===0;
    const cell=boardState[r][c];
    const isHL=(fromCell&&fromCell.r===r&&fromCell.c===c)||(toCell&&toCell.r===r&&toCell.c===c);
    html+='<div class="ta-cell '+(isLight?'light':'dark')+(isHL?' highlight':'')+'">'+(cell?pieceSVG(cell.pieceId,cell.color):'')+'</div>';
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
    const wTxt=Array.isArray(pair)?pair[0]||'':(pair.w||'');
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