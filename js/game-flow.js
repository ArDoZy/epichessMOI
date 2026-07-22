// ================================================================
// GAME-FLOW.JS — Démarrage de partie, construction du plateau initial,
// intro des armées, fin de partie & modal de résultat, annulation de coup
// ================================================================
// Contient : buildGameBoard() (place les pièces des deux armées sur
// l'échiquier 8x8 initial), startGame() (point d'entrée normal, hors
// tournoi), showArmyIntro() (overlay de présentation des deux armées avant
// la partie), triggerEndOfGame() (calcule le nouvel ELO et affiche le modal
// de résultat — mode normal, PAS tournoi), showResultModal(), et le bouton
// "Annuler coup".
//
// Dépendances : rules-engine.js (GS, cloneBoard, updateMedusaParalysis...),
// ai-engine.js (evalBoard indirectement), game-render.js (renderGame,
// updateStatus, buildGameLabels), accounts.js (vvLoadElo, vvSaveElo...),
// voie.js (vvCalcNewElo, vvCheckNewUnlocks, vvEstimateAiElo),
// ai-level-modal.js (selectedAILevel, AI_INSTRUCTORS), data-pieces.js
// (PIECES), tournoi.js (tournamentState — pour distinguer partie normale
// vs round de tournoi dans triggerEndOfGame/game-quit).
//
// _playerColor (couleur assignée au joueur pour LA partie en cours) est une
// variable partagée avec tournoi.js et combat-intro.js.
// ================================================================

let _playerColor='w';

// ----------------------------------------------------------------
// CONSTRUCTION DU PLATEAU INITIAL À PARTIR DE DEUX ARMÉES
// ----------------------------------------------------------------
function buildGameBoard(playerArmyData,aiArmyData){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  let uid=0;
  const make=(pieceId,type,color,emoji,isKing=false)=>({type,color,pieceId,emoji,hasMoved:false,isKing,id:'p'+(uid++)});
  const resolveP=p=>{if(!p)return null;if(p.id&&!p.emoji)return PIECES.find(x=>x.id===p.id)||null;return p;};
  const wm=resolveP(playerArmyData.mon)||PIECES.find(p=>p.id===playerArmyData.mon?.id);
  const wg=resolveP(playerArmyData.gen)||PIECES.find(p=>p.id===playerArmyData.gen?.id);
  b[7][4]=make(wm.id,'k','w',wm.emoji,true);b[7][3]=make(wg.id,wg.pieceType||'q','w',wg.emoji,false);
  (playerArmyData.extras||[]).forEach(id=>{
    const piece=PIECES.find(p=>p.id===id);if(!piece)return;
    const col=playerArmyData.placements?.[id];if(col===undefined)return;
    if(!b[7][col])b[7][col]=make(piece.id,piece.pieceType||'r','w',piece.emoji,false);
    if(piece.qty>=2){const mirCol=7-col;if(mirCol!==4&&mirCol!==3&&!b[7][mirCol])b[7][mirCol]=make(piece.id,piece.pieceType||'r','w',piece.emoji,false);}
  });
  for(let c=0;c<8;c++)if(!b[6][c])b[6][c]=make('std-pawn','p','w','♙',false);
  const am=resolveP(aiArmyData.mon)||PIECES.find(p=>p.id===aiArmyData.mon?.id);
  const ag=resolveP(aiArmyData.gen)||PIECES.find(p=>p.id===aiArmyData.gen?.id);
  b[0][4]=make(am.id,'k','b',am.emoji,true);b[0][3]=make(ag.id,ag.pieceType||'q','b',ag.emoji,false);
  (aiArmyData.extras||[]).forEach(id=>{
    const piece=PIECES.find(p=>p.id===id);if(!piece)return;
    const col=aiArmyData.placements?.[id];if(col===undefined)return;
    if(!b[0][col])b[0][col]=make(piece.id,piece.pieceType||'r','b',piece.emoji,false);
    if(piece.qty>=2){const mirCol=7-col;if(mirCol!==4&&mirCol!==3&&!b[0][mirCol])b[0][mirCol]=make(piece.id,piece.pieceType||'r','b',piece.emoji,false);}
  });
  const stdFill=[{t:'r',e:'♜'},{t:'n',e:'♞'},{t:'b',e:'♝'},null,null,{t:'b',e:'♝'},{t:'n',e:'♞'},{t:'r',e:'♜'}];
  for(let c=0;c<8;c++){if(!b[0][c]&&stdFill[c]&&c!==3&&c!==4)b[0][c]=make('std-'+stdFill[c].t,stdFill[c].t,'b',stdFill[c].e,false);}
  for(let c=0;c<8;c++)if(!b[1][c])b[1][c]=make('std-pawn','p','b','♟',false);
  return b;
}

// ----------------------------------------------------------------
// BARRES JOUEUR / IA (avatar, nom, ELO) en haut/bas du plateau
// ----------------------------------------------------------------
function updateGamePlayerBars(){
  const inst=AI_INSTRUCTORS[selectedAILevel];
  const playerElo=vvLoadElo();
  const playerName=CUR_ACC||'Joueur';
  const rank=vvGetRank(playerElo);
  const hav=document.getElementById('human-player-avatar');
  const han=document.getElementById('human-player-name');
  const hae=document.getElementById('human-player-elo');
  if(hav)hav.textContent=playerName.charAt(0).toUpperCase();
  if(han)han.textContent=playerName;
  if(hae)hae.textContent=rank.emoji+' '+playerElo+' ELO';
  const aav=document.getElementById('ai-player-avatar');
  const aan=document.getElementById('ai-player-name');
  const aae=document.getElementById('ai-player-elo');
  if(aav)aav.textContent=inst.emoji;
  if(aan)aan.textContent=inst.name;
  if(aae)aae.textContent=vvEstimateAiElo()+' ELO';
}

// ----------------------------------------------------------------
// DÉMARRAGE DE PARTIE (hors tournoi — voir tournoi.js::launchTournoiRound
// pour l'équivalent en mode tournoi)
// ----------------------------------------------------------------
// startGame accepte un paramètre colorAlreadyChosen. Quand cb-play a déjà
// tiré _playerColor (voir combat-intro.js), on n'écrase pas ce choix ici.
function startGame(colorAlreadyChosen){
  _endGameTriggered=false;
  if(!currentArmyData||!aiArmyData){showNotif('Aucune armée sélectionnée.');return;}
  if(!colorAlreadyChosen)_playerColor=Math.random()<0.5?'w':'b';
  const _aiColor=_playerColor==='w'?'b':'w';
  const playerIsWhite=_playerColor==='w';
  const whiteSideArmy=playerIsWhite?currentArmyData:aiArmyData;
  const blackSideArmy=playerIsWhite?aiArmyData:currentArmyData;
  const clockMs=(typeof selectedTimeControl==='number'&&selectedTimeControl>0)?selectedTimeControl*60000:0;
  GS={board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,halfmoveClock:0,gameOver:false,playerArmy:currentArmyData,aiArmy:aiArmyData,playerColor:_playerColor,aiColor:_aiColor,movePairs:[],capturedW:[],capturedB:[],pendingPromo:null,medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),pretreProtected:new Set(),amazonePostCapture:null,grandMaitreAlive:{w:false,b:false},gardePierreUsed:{w:false,b:false},turnCount:0,historyView:null,lastMoveHistory:[],clockMs,timeWhite:clockMs,timeBlack:clockMs};
  GS.board=buildGameBoard(whiteSideArmy,blackSideArmy);
  updateMedusaParalysis(GS.board,GS);updatePretreProtection(GS.board,GS);updateGrandMaitre(GS.board,GS);
  showPage('page-game');
  updateGamePlayerBars();
  renderGame(GS);updateStatus(GS);updateHistoryNav();
  setTimeout(()=>{buildGameLabels(GS);renderGame(GS);},80);
  if(_playerColor==='b'){
    showNotif('Vous jouez avec les Noirs — l\'IA commence !','ok');
    setTimeout(()=>doAIMove(GS),800);
  } else {
    showNotif('Vous jouez avec les Blancs — à vous de commencer !','ok');
  }
  showArmyIntro(currentArmyData,aiArmyData);
}

// ----------------------------------------------------------------
// OVERLAY DE PRÉSENTATION DES ARMÉES (avant chaque partie)
// ----------------------------------------------------------------
// Les libellés "Votre armée (Blancs/Noirs)" reflètent la couleur réellement
// assignée pour cette partie (GS.playerColor), qui est tirée au hasard.
function showArmyIntro(playerArmy,aiArmy){
  document.querySelector('.army-intro-overlay')?.remove();
  const fp=id=>PIECES.find(p=>p.id===id);
  const inst=AI_INSTRUCTORS[selectedAILevel];
  const pCol=(GS&&GS.playerColor)||_playerColor||'w';
  const playerLabel='Votre armée ('+(pCol==='w'?'Blancs':'Noirs')+')';
  const aiLabel='Armée adverse ('+(pCol==='w'?'Noirs':'Blancs')+')';
  const playerTitleCls=pCol==='w'?'white':'black';
  const aiTitleCls=pCol==='w'?'black':'white';
  const buildSide=(armyData,label,titleCls)=>{
    const mon=fp(armyData.mon?.id||armyData.mon)||armyData.mon;
    const gen=fp(armyData.gen?.id||armyData.gen)||armyData.gen;
    const extras=(armyData.extras||[]).map(id=>fp(id)).filter(Boolean);
    const all=[mon,gen,...extras].filter(Boolean);
    const rows=all.map(p=>'<div class="aio-piece-row"><div class="aio-emoji">'+p.emoji+'</div><div class="aio-piece-info"><div class="aio-piece-name">'+p.name+' <span style="font-size:9px;color:var(--muted);font-family:Cinzel,serif">'+p.class+'</span></div><div class="aio-piece-mvt">🚶 '+(p.movement||'')+'</div>'+(p.ability?'<div class="aio-piece-ability">✨ '+p.ability+'</div>':'')+'</div></div>').join('');
    return '<div class="aio-side"><div class="aio-side-title '+titleCls+'">'+label+'</div>'+rows+'</div>';
  };
  const INTRO_DURATION=10;
  const overlay=document.createElement('div');overlay.className='army-intro-overlay';
  overlay.innerHTML='<div class="army-intro-box"><span class="aio-close" id="aio-close-btn">✕</span><div class="aio-title">⚔ Les Armées en Présence — '+inst.emoji+' '+inst.name+'</div><div class="aio-sides">'+buildSide(playerArmy,playerLabel,playerTitleCls)+buildSide(aiArmy,aiLabel,aiTitleCls)+'</div><div class="aio-timer"><span id="aio-countdown">'+INTRO_DURATION+'</span>s — Cliquez ✕ pour fermer<div class="aio-timer-bar"><div class="aio-timer-fill" id="aio-timer-fill" style="width:100%"></div></div></div></div>';
  document.body.appendChild(overlay);
  // L'horloge ne démarre qu'à la fermeture de cet aperçu (pas pendant la
  // présentation des armées), pour ne pas gruger le temps du 1er joueur.
  const closeOverlay=()=>{overlay.classList.add('hiding');setTimeout(()=>overlay.remove(),650);startClockTick(GS);renderClocks(GS);};
  document.getElementById('aio-close-btn').addEventListener('click',closeOverlay);
  let remaining=INTRO_DURATION;
  const tick=setInterval(()=>{remaining--;const el=document.getElementById('aio-countdown');const bar=document.getElementById('aio-timer-fill');if(el)el.textContent=remaining;if(bar)bar.style.width=(remaining/INTRO_DURATION*100)+'%';if(remaining<=0){clearInterval(tick);closeOverlay();}},1000);
}

// ----------------------------------------------------------------
// MODAL DE RÉSULTAT DE PARTIE (victoire/défaite/nulle)
// ----------------------------------------------------------------
function showResultModal(result,oldElo,newElo,delta,newUnlockIds){
  setTimeout(()=>playSound(result==='win'?'win':result==='loss'?'loss':'draw'),200);
  const modal=document.getElementById('result-modal');const box=document.getElementById('result-box');
  const rank=vvGetRank(newElo);
  box.className='result-box '+(result==='win'?'win-result':result==='loss'?'loss-result':'draw-result');
  const icons={win:'🏆',loss:'💀',draw:'🤝'};const titles={win:'Victoire !',loss:'Défaite',draw:'Nulle'};
  document.getElementById('result-icon').textContent=icons[result];
  const titleEl=document.getElementById('result-title');titleEl.textContent=titles[result];
  titleEl.className='result-title '+(result==='win'?'win-text':result==='loss'?'loss-text':'draw-text');
  document.getElementById('result-elo-before').textContent=oldElo;
  document.getElementById('result-elo-after').textContent=newElo;
  const deltaEl=document.getElementById('result-elo-delta');deltaEl.textContent=(delta>0?'+':'')+delta;
  deltaEl.className='result-elo-delta '+(delta>0?'pos':delta<0?'neg':'zero');
  document.getElementById('result-rank-icon').textContent=rank.emoji;
  document.getElementById('result-rank-name').textContent=rank.name+' — '+newElo+' ELO';
  const unlockSec=document.getElementById('unlock-section');
  if(newUnlockIds&&newUnlockIds.length>0){
    const pid=newUnlockIds[0];const pd=PIECES.find(p=>p.id===pid);
    if(pd){unlockSec.style.display='';document.getElementById('unlock-piece-emoji').textContent=pd.emoji;document.getElementById('unlock-piece-name').textContent=pd.name;const clsEl=document.getElementById('unlock-piece-class');clsEl.textContent=pd.class;clsEl.className='unlock-piece-class pc-class '+pd.class;document.getElementById('unlock-piece-ability').textContent=pd.ability||'Aucun pouvoir spécial.';}
    else unlockSec.style.display='none';
  }else unlockSec.style.display='none';
  modal.classList.add('active');
}
document.getElementById('result-close-btn').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
});

document.getElementById('result-continue').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
  army={mon:null,gen:null,extras:[]};
  editingArmyId=null;currentArmyData=null;aiArmyData=null;
  updAll();
  renderArmiesPage();showPage('page-armies');
});

document.getElementById('result-rejouer').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
  if(!GS||!GS.playerArmy){renderArmiesPage();showPage('page-armies');return;}
  const prevPlayerArmy=GS.playerArmy;
  currentArmyData=prevPlayerArmy;
  aiArmyData=generateAIArmy();
  renderCombatPage(prevPlayerArmy,false);
  showPage('page-combat');launchParticles();
});

document.getElementById('result-revanche').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
  if(!GS||!GS.playerArmy||!GS.aiArmy){renderArmiesPage();showPage('page-armies');return;}
  const prevPlayerArmy=GS.playerArmy;
  const prevAiArmy=GS.aiArmy;
  currentArmyData=prevPlayerArmy;
  aiArmyData=prevAiArmy;
  renderCombatPage(prevPlayerArmy,true);
  showPage('page-combat');launchParticles();
});

// ----------------------------------------------------------------
// FIN DE PARTIE — calcule le nouvel ELO et déclenche le modal de résultat.
// Délègue à tournoi.js::triggerTournoiEndOfGame si un tournoi est actif.
// ----------------------------------------------------------------
let _endGameTriggered=false;
function triggerEndOfGame(result){
  // En mode tournoi, déléguer au gestionnaire tournoi
  if(tournamentState.active){triggerTournoiEndOfGame(result);return;}
  if(_endGameTriggered)return;_endGameTriggered=true;
  stopClockTick(GS);
  const oldElo=vvLoadElo();const aiElo=vvEstimateAiElo();
  const{newElo,delta}=vvCalcNewElo(oldElo,aiElo,result);
  const newRankIdx=vvGetRankIdx(newElo);if(newRankIdx>vvLoadRankMax())vvSaveRankMax(newRankIdx);
  const newUnlocks=vvCheckNewUnlocks(oldElo,newElo);
  vvSaveElo(newElo);
  const history=vvLoadHistory();history.push({result,oldElo,newElo,delta,date:Date.now(),aiElo});vvSaveHistory(history);
  setTimeout(()=>showResultModal(result,oldElo,newElo,delta,newUnlocks),400);
}

// ----------------------------------------------------------------
// ANNULER COUP
// ----------------------------------------------------------------
// Réinitialise _endGameTriggered : annuler un coup après une fin de partie
// (mat/pat/nulle) doit permettre à triggerEndOfGame() de s'exécuter à
// nouveau si la partie reprend et se termine une seconde fois.
document.getElementById('game-undo').addEventListener('click',()=>{
  if(!GS||GS.history.length<1)return;GS.historyView=null;
  const plies=Math.min(2,GS.history.length);
  for(let i=0;i<plies;i++){
    if(!GS.history.length)break;
    const h=GS.history.pop();
    GS.board=cloneBoard(h.board);GS.turn=h.turn;GS.enPassant=h.enPassant;GS.halfmoveClock=h.halfmoveClock;
    GS.capturedW=[...h.capturedW];GS.capturedB=[...h.capturedB];
    if(h.movePairs)GS.movePairs=JSON.parse(JSON.stringify(h.movePairs));
    if(h.anchored)GS.anchored=new Set(h.anchored);
    if(h.grandMaitreAlive)GS.grandMaitreAlive={...h.grandMaitreAlive};
    if(h.turnCount!==undefined)GS.turnCount=h.turnCount;
    if(h.timeWhite!==undefined)GS.timeWhite=h.timeWhite;
    if(h.timeBlack!==undefined)GS.timeBlack=h.timeBlack;
  }
  GS.selected=null;GS.legalMoves=[];GS.gameOver=false;GS.lastMove=null;GS.amazonePostCapture=null;
  _endGameTriggered=false;
  updateMedusaParalysis(GS.board,GS);updatePretreProtection(GS.board,GS);updateGrandMaitre(GS.board,GS);
  renderMoveLog(GS);renderGame(GS);updateStatus(GS);updateHistoryNav();
  startClockTick(GS); // relance le décompte (l'annulation peut suivre une fin de partie)
});

// ----------------------------------------------------------------
// BOUTON "ABANDONNER / QUITTER" — gère aussi bien une partie normale
// qu'un round de tournoi
// ----------------------------------------------------------------
document.getElementById('game-quit').addEventListener('click',()=>{
  if(GS&&GS.gameOver){
    stopClockTick(GS);
    if(_aiWorker&&_aiWorkerBusy){_aiWorker.terminate();_aiWorker=null;_aiWorkerBusy=false;}
    document.getElementById('promo-modal').classList.remove('active');
    army={mon:null,gen:null,extras:[]};
    editingArmyId=null;currentArmyData=null;aiArmyData=null;
    updAll();renderArmiesPage();showPage('page-armies');
    return;
  }
  if(GS)GS.gameOver=true;
  stopClockTick(GS);
  if(_aiWorker&&_aiWorkerBusy){_aiWorker.terminate();_aiWorker=null;_aiWorkerBusy=false;}
  document.getElementById('promo-modal').classList.remove('active');
  if(tournamentState.active){
    triggerTournoiEndOfGame('loss');
  }else{
    triggerEndOfGame('loss');
  }
},{once:false});