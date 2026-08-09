// ================================================================
// GAME-FLOW.JS : Démarrage de partie, construction du plateau initial,
// intro des armées, fin de partie & modal de résultat, annulation de coup
// ================================================================
// Contient : buildGameBoard() (place les pièces des deux armées sur
// l'échiquier 8x8 initial), startGame() (point d'entrée normal, hors
// tournoi), showArmyIntro() (overlay de présentation des deux armées avant
// la partie), triggerEndOfGame() (calcule le nouvel ELO et affiche le modal
// de résultat, mode normal, PAS tournoi), showResultModal(), et le bouton
// "Annuler coup".
//
// Dépendances : rules-engine.js (GS, cloneBoard, updateMedusaParalysis...),
// ai-engine.js (evalBoard indirectement), game-render.js (renderGame,
// updateStatus, buildGameLabels), accounts.js (vvLoadElo, vvSaveElo...),
// voie.js (vvCalcNewElo, vvCheckNewUnlocks, vvEstimateAiElo),
// ai-level-modal.js (selectedAILevel, AI_INSTRUCTORS), data-pieces.js
// (PIECES), tournoi.js (tournamentState, pour distinguer partie normale
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
// Le camp (Blancs/Noirs) n'est PLUS affiché : le plateau est déjà orienté du
// côté du joueur, ses pièces sont en bas, et la couleur ne change rien à ce
// qu'il a à faire. Ne restent que l'identité et le classement.
function updateGamePlayerBars(){
  const playerElo=vvLoadElo();
  const playerName=CUR_ACC||'Joueur';
  const hav=document.getElementById('human-player-avatar');
  const han=document.getElementById('human-player-name');
  const hae=document.getElementById('human-player-elo');
  if(hav)hav.textContent=playerName.charAt(0).toUpperCase();
  if(han)han.textContent=playerName;
  if(hae)hae.textContent=playerElo+' ELO';
  const aav=document.getElementById('ai-player-avatar');
  const aan=document.getElementById('ai-player-name');
  const aae=document.getElementById('ai-player-elo');
  // En ligne, le camp adverse est un vrai joueur : on affiche le pseudo et
  // l'ELO qu'il a transmis à la connexion plutôt qu'un « Adversaire » anonyme.
  if(GS&&GS.multiplayer){
    const oppName=(typeof MP!=='undefined'&&MP.oppName)?MP.oppName:'Adversaire';
    const oppElo=(typeof MP!=='undefined'&&typeof MP.oppElo==='number')?MP.oppElo+' ELO':'En ligne';
    if(aav)aav.textContent=oppName.charAt(0).toUpperCase();
    if(aan)aan.textContent=oppName;
    if(aae)aae.textContent=oppElo;
    return;
  }
  // Instructeur du tutoriel : son nom, et « entraînement » à la place d'un
  // ELO qui n'est pas en jeu.
  if(GS&&GS.tuto){
    if(aav)aav.textContent='I';
    if(aan)aan.textContent=GS.tuto.name||'Instructeur';
    if(aae)aae.textContent='Entraînement';
    return;
  }
  const foe=(typeof aiCurrentOpponent==='function')?aiCurrentOpponent():INSTRUCTOR;
  if(aav){
    // Le portrait remplace l'initiale quand l'adversaire en a un : douze
    // adversaires réduits à douze lettres seraient douze fois la même case.
    if(typeof advPortrait==='function')aav.innerHTML=advPortrait(foe,'adv-portrait-xs');
    else aav.textContent=foe.name.charAt(0).toUpperCase();
  }
  if(aan)aan.textContent=foe.name;
  if(aae)aae.textContent=foe.elo+' ELO';
}

// ----------------------------------------------------------------
// DÉMARRAGE DE PARTIE (hors tournoi, voir tournoi.js::launchTournoiRound
// pour l'équivalent en mode tournoi)
// ----------------------------------------------------------------
// startGame accepte un paramètre colorAlreadyChosen. Quand cb-play a déjà
// tiré _playerColor (voir combat-intro.js), on n'écrase pas ce choix ici.
// tutoCfg (facultatif) : bataille scriptée du tutoriel, voir tutoStartBattle()
// dans js/tutorial.js. Elle impose le plateau, la couleur et la pendule, ne
// touche PAS à la Réserve (les pièces du tutoriel sont prêtées, pas engagées)
// et court-circuite la cinématique d'entrée : à ce stade le joueur n'a pas
// encore d'armée, il n'y a rien à présenter.
//   {battle, name, level, playerColor, board(), clockMin, armyIds:{mon,gen,extras}}
function startGame(colorAlreadyChosen,multiplayer,tutoCfg){
  _endGameTriggered=false;
  stopCombatMusicImmediate();
  if(!tutoCfg&&(!currentArmyData||!aiArmyData)){showNotif('Aucune armée sélectionnée.');return;}
  if(tutoCfg)_playerColor=tutoCfg.playerColor||'w';
  else if(!colorAlreadyChosen)_playerColor=Math.random()<0.5?'w':'b';
  const _aiColor=_playerColor==='w'?'b':'w';
  const playerIsWhite=_playerColor==='w';
  const whiteSideArmy=playerIsWhite?currentArmyData:aiArmyData;
  const blackSideArmy=playerIsWhite?aiArmyData:currentArmyData;
  // Cadence : 10 min + 5 s par coup pour toute vraie partie (joueur en ligne
  // comme Instructeur à 2000 ELO). Les batailles du tutoriel n'ont PAS de
  // pendule du tout : on n'apprend pas à jouer avec un chronomètre au-dessus
  // de l'épaule (tutoCfg.clockMin vaut 0 partout, voir js/tutorial.js).
  const clockMs=tutoCfg
    ?((tutoCfg.clockMin>0)?tutoCfg.clockMin*60000:0)
    :((typeof selectedTimeControl==='number'&&selectedTimeControl>0)?selectedTimeControl*60000:0);
  const incrementMs=(!tutoCfg&&typeof selectedTimeIncrement==='number'&&selectedTimeIncrement>0)
    ?selectedTimeIncrement*1000:0;
  // En tutoriel, playerArmy sert uniquement à l'affichage et aux choix de
  // promotion : l'armée n'est pas prélevée sur la Réserve.
  const playerArmy=tutoCfg?tutoCfg.army:currentArmyData;
  const aiArmy=tutoCfg?tutoCfg.army:aiArmyData;
  GS={board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,halfmoveClock:0,gameOver:false,playerArmy,aiArmy,playerColor:_playerColor,aiColor:_aiColor,multiplayer:!!multiplayer,tuto:tutoCfg||null,movePairs:[],capturedW:[],capturedB:[],pendingPromo:null,medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),pretreProtected:new Set(),amazonePostCapture:null,grandMaitreAlive:{w:false,b:false},gardePierreUsed:{w:false,b:false},turnCount:0,historyView:null,lastMoveHistory:[],clockMs,incrementMs,timeWhite:clockMs,timeBlack:clockMs};
  GS.board=tutoCfg?tutoCfg.board():buildGameBoard(whiteSideArmy,blackSideArmy);
  // Le journal des coups garde le contenu de la partie PRÉCÉDENTE tant qu'un
  // premier coup n'a pas été joué : on le vide ici, en même temps que GS.
  if(typeof renderMoveLog==='function')renderMoveLog(GS);
  updateMedusaParalysis(GS.board,GS);updatePretreProtection(GS.board,GS);updateGrandMaitre(GS.board,GS);
  // Les exemplaires quittent la Réserve MAINTENANT : ils sont sur le terrain
  // et donc en jeu (voir js/economy.js, en-tête). Rien de tel en tutoriel :
  // ces pièces sont prêtées par le savant, les perdre ne coûte rien.
  if(!tutoCfg&&typeof economyCommit==='function')economyCommit(currentArmyData);
  if(typeof renderGameStake==='function')renderGameStake(tutoCfg?{}:GS);
  // Une partie contre un autre joueur a sa propre adresse (voir setAppPath
  // dans js/main.js) : /combat. Elle revient à l'adresse d'origine dès qu'on
  // quitte la partie.
  if(typeof setAppPath==='function')setAppPath(multiplayer?COMBAT_PATH:appHomePath());
  showPage('page-game');
  // "Annuler coup" est retiré en ligne : l'annulation serait unilatérale et
  // désynchroniserait les deux plateaux.
  const undoBtn=document.getElementById('game-undo');
  if(undoBtn)undoBtn.style.display=multiplayer?'none':'';
  updateGamePlayerBars();
  renderGame(GS);updateStatus(GS);updateHistoryNav();
  setTimeout(()=>{buildGameLabels(GS);renderGame(GS);},80);
  // Le premier coup de l'IA n'est PAS déclenché ici : il l'est à la fin de la
  // cinématique d'entrée (showArmyIntro), en même temps que l'horloge. Sinon
  // l'IA jouerait derrière le rideau, sur un plateau que le joueur n'a pas
  // encore vu, et le joueur découvrirait la partie déjà entamée.
  // En tutoriel, pas de cinématique : les deux camps ont la même armée, il n'y
  // a rien à révéler, et le savant vient de parler juste avant.
  if(tutoCfg)startGameClockAndAI();
  else showArmyIntro(currentArmyData,aiArmyData);
}

// ----------------------------------------------------------------
// LEVER DE RIDEAU : pendule, musique, et premier coup de l'IA
// ----------------------------------------------------------------
// Point unique appelé à la fin de la cinématique d'entrée (ou tout de suite
// en tutoriel, qui n'en a pas) : si c'est à l'IA de jouer, elle s'y met
// maintenant. Sinon elle jouerait derrière le rideau et le joueur
// découvrirait la partie déjà entamée.
function startGameClockAndAI(){
  startClockTick(GS);renderClocks(GS);startCombatMusic();
  if(!GS.multiplayer&&!GS.gameOver&&GS.turn===(GS.aiColor||'b'))setTimeout(()=>doAIMove(GS),450);
}

// ----------------------------------------------------------------
// OVERLAY DE PRÉSENTATION DES ARMÉES (avant chaque partie)
// ----------------------------------------------------------------
// Les libellés "Votre armée (Blancs/Noirs)" reflètent la couleur réellement
// assignée pour cette partie (GS.playerColor), qui est tirée au hasard.
function showArmyIntro(playerArmy,aiArmy){
  // L'ancien écran était un tableau de deux colonnes listant le déplacement
  // et le pouvoir de chaque pièce, avec un compte à rebours de 10 secondes :
  // beaucoup de texte, aucune tension, et 10 s d'attente à chaque partie.
  // C'est maintenant une vraie séquence d'entrée en combat (js/cinematics.js),
  // interrompable d'un clic. Les fiches de pièces restent consultables à tout
  // moment par clic droit, elles n'ont pas à bloquer le lancement.
  const oppName=(GS&&GS.multiplayer)
    ?((typeof MP!=='undefined'&&MP.oppName)?MP.oppName:'Votre adversaire')
    :((typeof aiCurrentOpponent==='function')?aiCurrentOpponent().name:INSTRUCTOR.name);
  const start=startGameClockAndAI;
  if(typeof playCombatCinematic==='function')
    playCombatCinematic(playerArmy,aiArmy,oppName,(GS&&GS.playerColor)||_playerColor||'w',start);
  else start();
}

// ----------------------------------------------------------------
// MODAL DE RÉSULTAT DE PARTIE (victoire/défaite/nulle)
// ----------------------------------------------------------------
// noEloReason : renseigné quand la partie n'était pas classée (voir
// vvNoEloReason dans voie.js). La ligne « ancien → nouveau ELO » laisse alors
// la place à la raison : afficher « 0 → 0 · +0 » ferait croire à un bug.
function showResultModal(result,oldElo,newElo,delta,newUnlockIds,noEloReason){
  setTimeout(()=>playSound(result==='win'?'win':result==='loss'?'loss':'draw'),200);
  const modal=document.getElementById('result-modal');const box=document.getElementById('result-box');
  const rank=vvGetRank(newElo);
  box.className='result-box '+(result==='win'?'win-result':result==='loss'?'loss-result':'draw-result');
  // Plus de chevron au-dessus du titre pour une victoire ou une défaite : le
  // mot et sa couleur disent déjà tout, le triangle n'ajoutait qu'un symbole
  // à décoder. La nulle garde son losange, qui la distingue d'un coup d'œil.
  const icons={win:'',loss:'',draw:'◆'};const titles={win:'Victoire !',loss:'Défaite',draw:'Nulle'};
  const iconEl=document.getElementById('result-icon');
  iconEl.textContent=icons[result];
  iconEl.style.display=icons[result]?'':'none';
  const titleEl=document.getElementById('result-title');titleEl.textContent=titles[result];
  titleEl.className='result-title '+(result==='win'?'win-text':result==='loss'?'loss-text':'draw-text');
  // Contre QUI : avec douze adversaires, « Victoire ! +23 » ne dit plus la
  // moitié de ce qui s'est passé. La ligne porte aussi le palmarès du duel,
  // qui est la seule raison d'y revenir une fois l'adversaire battu.
  const foeEl=document.getElementById('result-foe');
  if(foeEl){
    const foe=(!GS.multiplayer&&!GS.tuto&&typeof aiCurrentOpponent==='function')?aiCurrentOpponent():null;
    if(foe){
      const rec=(typeof advRecord==='function')?advRecord(foe.id):null;
      const tally=rec?' · '+rec.w+'V '+rec.d+'N '+rec.l+'D':'';
      foeEl.style.display='';
      foeEl.textContent=foe.name+' · '+foe.elo+' ELO'+tally;
    }else foeEl.style.display='none';
  }
  document.getElementById('result-elo-before').textContent=oldElo;
  document.getElementById('result-elo-after').textContent=newElo;
  const deltaEl=document.getElementById('result-elo-delta');deltaEl.textContent=(delta>0?'+':'')+delta;
  deltaEl.className='result-elo-delta '+(delta>0?'pos':delta<0?'neg':'zero');
  const eloRow=box.querySelector('.result-elo-row');
  const noteEl=document.getElementById('result-elo-note');
  if(eloRow)eloRow.style.display=noEloReason?'none':'';
  // Les batailles du tutoriel n'ont pas besoin d'être justifiées à chaque fin
  // de partie : le savant vient de dire que c'est un entraînement. La ligne
  // d'ELO disparaît, la phrase aussi. Le mode admin, lui, garde sa mention :
  // elle rappelle où l'on se trouve.
  const showNote=!!noEloReason&&noEloReason!==VV_NO_ELO_TRAINING;
  if(noteEl){noteEl.style.display=showNote?'':'none';noteEl.textContent=showNote?noEloReason:'';}
  document.getElementById('result-rank-name').textContent=rank.name+' · '+newElo+' ELO';
  const unlockSec=document.getElementById('unlock-section');
  if(newUnlockIds&&newUnlockIds.length>0){
    const pid=newUnlockIds[0];const pd=PIECES.find(p=>p.id===pid);
    if(pd){unlockSec.style.display='';document.getElementById('unlock-piece-emoji').innerHTML=pieceIcon(pd.id,'n');document.getElementById('unlock-piece-name').textContent=pd.name;const clsEl=document.getElementById('unlock-piece-class');clsEl.textContent=pd.class;clsEl.className='unlock-piece-class pc-class '+pd.class;document.getElementById('unlock-piece-ability').textContent=pd.ability||'Aucun pouvoir spécial.';}
    else unlockSec.style.display='none';
  }else unlockSec.style.display='none';
  // Coffre obtenu : le modal l'annonce, la Réserve l'ouvre. Ouvrir un coffre
  // ici, par-dessus le modal de fin, empilerait deux célébrations.
  const chestSec=document.getElementById('result-chest');
  if(chestSec){
    const st=_lastSettlement;
    if(st&&st.chest){
      chestSec.style.display='';
      chestSec.innerHTML='<div class="rc-lbl">Série de '+st.streak+' victoire'+(st.streak>1?'s':'')+'</div>'+
        '<div class="rc-name">'+st.chest.name+' obtenu</div>'+
        '<div class="rc-hint">Ouvrez-le dans la Réserve.</div>';
    }else chestSec.style.display='none';
  }
  modal.classList.add('active');
}
document.getElementById('result-close-btn').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
});

document.getElementById('result-continue').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
  editingArmyId=null;currentArmyData=null;aiArmyData=null;
  updAll();
  // Fin de partie → retour automatique au menu principal (face JOUER).
  // On ne réinitialise PAS l'armée composée pour pouvoir relancer via JOUER.
  if(typeof goToMainMenu==='function')goToMainMenu();else{renderArmiesPage();showPage('page-armies');}
});

document.getElementById('result-rejouer').addEventListener('click',()=>{
  document.getElementById('result-modal').classList.remove('active');
  if(!GS||!GS.playerArmy){renderArmiesPage();showPage('page-armies');return;}
  if(typeof armyStock==='function'&&!armyStock(GS.playerArmy).ok){
    showConfirmModal('Votre réserve ne permet plus d\'aligner cette armée. Passez par la Réserve ou composez-en une autre.',()=>{
      renderArmiesPage();showPage('page-armies');
    },{okLabel:'Mes armées',cancelLabel:'Fermer',okClass:'btn-primary'});
    return;
  }
  const prevPlayerArmy=GS.playerArmy;
  currentArmyData=prevPlayerArmy;
  aiArmyData=generateAIArmy();
  renderCombatPage(prevPlayerArmy,GS.multiplayer?'online':'ia');
  showPage('page-combat');launchParticles();
});

document.getElementById('result-revanche').addEventListener('click',()=>{
  // En ligne, une revanche se NÉGOCIE : elle ne démarre que si l'adversaire
  // la demande aussi (voir mpTryRematch). Le modal reste ouvert entre-temps.
  if(GS&&GS.multiplayer&&typeof mpProposeRematch==='function'&&mpProposeRematch())return;
  document.getElementById('result-modal').classList.remove('active');
  if(!GS||!GS.playerArmy||!GS.aiArmy){renderArmiesPage();showPage('page-armies');return;}
  const prevPlayerArmy=GS.playerArmy;
  const prevAiArmy=GS.aiArmy;
  currentArmyData=prevPlayerArmy;
  aiArmyData=prevAiArmy;
  renderCombatPage(prevPlayerArmy,GS.multiplayer?'online':'ia');
  showPage('page-combat');launchParticles();
});

// ----------------------------------------------------------------
// FIN DE PARTIE : calcule le nouvel ELO et déclenche le modal de résultat.
// Délègue à tournoi.js::triggerTournoiEndOfGame si un tournoi est actif.
// ----------------------------------------------------------------
let _endGameTriggered=false;
let _lastSettlement=null;   // rapport d'économie de la dernière partie
function triggerEndOfGame(result){
  // En mode tournoi, déléguer au gestionnaire tournoi
  if(tournamentState.active){triggerTournoiEndOfGame(result);return;}
  if(_endGameTriggered)return;_endGameTriggered=true;
  stopClockTick(GS);
  endCombatMusic();
  // Bataille du tutoriel : ni ELO, ni coffre de série, ni règlement de la
  // Réserve. C'est le savant qui commente et enchaîne (revanche jusqu'à la
  // victoire, puis coffre et exercice de déplacement).
  if(GS&&GS.tuto){
    if(typeof tutoOnBattleEnd==='function')tutoOnBattleEnd(result);
    return;
  }
  const oldElo=vvLoadElo();const aiElo=vvEstimateAiElo();
  // Partie non classée (mode admin uniquement, hors tutoriel qui sort plus
  // haut) : les duels contre les adversaires du laboratoire, eux, comptent.
  // l'ELO ne bouge pas d'un point, donc aucun déblocage par palier non plus.
  // Le reste de la fin de partie est inchangé : la série de victoires, les
  // coffres et le règlement des pièces engagées valent dans tous les modes.
  const noEloReason=(typeof vvNoEloReason==='function')?vvNoEloReason(GS):null;
  let newElo=oldElo,delta=0,newUnlocks=[];
  if(!noEloReason){
    const calc=vvCalcNewElo(oldElo,aiElo,result);
    newElo=calc.newElo;delta=calc.delta;
    const newRankIdx=vvGetRankIdx(newElo);if(newRankIdx>vvLoadRankMax())vvSaveRankMax(newRankIdx);
    newUnlocks=vvCheckNewUnlocks(oldElo,newElo);
    vvSaveElo(newElo);
  }
  const foeId=(!GS.multiplayer&&typeof aiCurrentOpponent==='function')?aiCurrentOpponent().id:null;
  if(foeId&&typeof advNoteResult==='function')advNoteResult(foeId,result);
  const history=vvLoadHistory();history.push({result,oldElo,newElo,delta,date:Date.now(),aiElo,ranked:!noEloReason,opp:foeId});vvSaveHistory(history);
  // Règlement des pièces engagées AVANT l'affichage : la cinématique montre
  // le décompte réel, pas une estimation.
  _lastSettlement=(typeof economySettle==='function')?economySettle(result,GS):null;
  if(typeof renderStreakBadge==='function')renderStreakBadge();
  // La cinématique d'issue passe en premier, le modal de résultat (ELO,
  // déblocages) prend le relais à sa fermeture.
  const showModal=()=>showResultModal(result,oldElo,newElo,delta,newUnlocks,noEloReason);
  if(typeof playOutcomeCinematic==='function')playOutcomeCinematic(result,_lastSettlement,showModal);
  else setTimeout(showModal,400);
}

// ----------------------------------------------------------------
// ANNULER COUP
// ----------------------------------------------------------------
// Réinitialise _endGameTriggered : annuler un coup après une fin de partie
// (mat/pat/nulle) doit permettre à triggerEndOfGame() de s'exécuter à
// nouveau si la partie reprend et se termine une seconde fois.
document.getElementById('game-undo').addEventListener('click',()=>{
  if(!GS||GS.history.length<1)return;
  // En ligne, annuler unilatéralement désynchroniserait les deux plateaux.
  if(GS.multiplayer){showNotif('Impossible d\'annuler un coup en partie en ligne.','err');return;}
  GS.historyView=null;
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
// BOUTON "ABANDONNER / QUITTER" : gère aussi bien une partie normale
// qu'un round de tournoi
// ----------------------------------------------------------------
document.getElementById('game-quit').addEventListener('click',()=>{
  // En ligne : prévenir l'adversaire de l'abandon avant de fermer le salon.
  if(GS&&GS.multiplayer){
    if(!GS.gameOver&&typeof mpNotifyResign==='function')mpNotifyResign();
    if(typeof mpLeave==='function')mpLeave();
  }
  if(GS&&GS.gameOver){
    stopClockTick(GS);
    if(_aiWorker&&_aiWorkerBusy){_aiWorker.terminate();_aiWorker=null;_aiWorkerBusy=false;}
    document.getElementById('promo-modal').classList.remove('active');
    editingArmyId=null;currentArmyData=null;aiArmyData=null;
    updAll();
    // Quitter une partie terminée → retour au menu principal (face JOUER).
    if(typeof goToMainMenu==='function')goToMainMenu();else{renderArmiesPage();showPage('page-armies');}
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