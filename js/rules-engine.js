// ================================================================
// RULES-ENGINE.JS — Moteur de règles pur (génération de coups, échecs,
// exécution des coups avec tous les pouvoirs spéciaux des pièces)
// ================================================================
// Contient : toute la logique de règles indépendante du rendu :
//   - Génération de coups bruts par pièce (generateMovesRaw + helpers
//     slidingMoves/jumpMoves/knightMoves/kingMoves/pawnMoves)
//   - Détection d'échec (isInCheckSimple, isSquareAttackedSimple)
//   - Filtrage des coups légaux (getLegalMoves, moveLeavesKingInCheck)
//   - Mise à jour des états spéciaux (Méduse paralysie, Prêtre protection,
//     Grand Maître domination)
//   - Exécution complète d'un coup (executeGameMove) avec tous les effets
//     spéciaux (Typhon, Banshee, Dresseur, etc.)
//   - Le système audio (Web Audio API, sans fichiers externes)
//   - L'état de partie GS (game state) et sa structure
//
// Ce module NE FAIT PAS de rendu DOM (sauf appels différés à renderGame/
// postMoveUpdate définis dans game-render.js et game-flow.js — couplage
// volontaire car la fin d'un coup doit déclencher un re-rendu et l'IA).
//
// Dépendances : data-pieces.js (PIECES, TRUE_PAWN_IDS).
// Utilisé par : game-render.js (clics, drag&drop), ai-engine.js (simulation
// de coups), game-flow.js (démarrage partie, promotion, sacrifices).
//
// Si vous ajoutez une NOUVELLE PIÈCE avec un mouvement inédit : ajoutez son
// cas dans generateMovesRaw() (switch sur pieceId), et si elle attaque en
// échec d'une façon qu'aucune pièce existante ne couvre, ajoutez la
// détection correspondante dans isSquareAttackedSimple().
// ================================================================

const FILES=['A','B','C','D','E','F','G','H'];

// État de partie global — reconstruit par startGame()/launchTournoiRound()
// dans game-flow.js / tournoi.js. Voir la structure complète dans ces fichiers.
let GS={board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,halfmoveClock:0,gameOver:false,playerArmy:null,aiArmy:null,movePairs:[],capturedW:[],capturedB:[],pendingPromo:null,medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),pretreProtected:new Set(),amazonePostCapture:null,grandMaitreAlive:{w:false,b:false},gardePierreUsed:{w:false,b:false},turnCount:0,historyView:null,lastMoveHistory:[],clockMs:0,timeWhite:0,timeBlack:0};

function inB(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function opp(color){return color==='w'?'b':'w';}
function cloneBoard(b){return b.map(r=>r.map(p=>p?{...p}:null));}
function getPieceEmoji(cell){if(!cell)return '';return cell.emoji||'?';}

// ================================================================
// HORLOGE DE PARTIE — décompte simple par joueur (pas d'incrément).
// gs.clockMs = temps de départ par joueur en ms (0 = illimité, pas d'horloge).
// Démarrée par showArmyIntro() à la fermeture de l'overlay (game-flow.js),
// arrêtée dans triggerEndOfGame()/triggerTournoiEndOfGame(). Le rendu des
// badges (#human-player-clock/#ai-player-clock) est fait par renderClocks()
// dans game-render.js, appelée à chaque tick et à chaque renderGame().
// ================================================================
function startClockTick(gs){
  stopClockTick(gs);
  if(!gs.clockMs)return;
  gs._clockLastTs=Date.now();
  gs._clockTimerId=setInterval(()=>tickClock(gs),200);
}
function stopClockTick(gs){
  if(gs&&gs._clockTimerId){clearInterval(gs._clockTimerId);gs._clockTimerId=null;}
}
function tickClock(gs){
  if(!gs.clockMs||gs.gameOver||gs.historyView!==null){gs._clockLastTs=Date.now();return;}
  const now=Date.now();const elapsed=now-gs._clockLastTs;gs._clockLastTs=now;
  const key=gs.turn==='w'?'timeWhite':'timeBlack';
  gs[key]=Math.max(0,gs[key]-elapsed);
  if(typeof renderClocks==='function')renderClocks(gs);
  if(gs[key]<=0){
    stopClockTick(gs);gs.gameOver=true;
    const playerCol=gs.playerColor||'w';
    const result=gs.turn===playerCol?'loss':'win';
    const bar=document.getElementById('game-status');
    if(bar){bar.textContent='⏱ Temps écoulé ! '+(result==='win'?'Vous gagnez !':'L\'IA gagne !');bar.className='status-bar mate';}
    if(typeof playSound==='function')playSound(result==='win'?'win':'loss');
    if(!_endGameTriggered)triggerEndOfGame(result);
  }
}

// ================================================================
// GÉNÉRATION DE COUPS — helpers génériques
// ================================================================
function slidingMoves(board,r,c,p,dirs,gs){
  const moves=[];
  for(const[dr,dc] of dirs){
    let nr=r+dr,nc=c+dc;
    while(inB(nr,nc)){
      const t=board[nr][nc];
      if(t){if(t.color!==p.color)moves.push({r:nr,c:nc});break;}
      else moves.push({r:nr,c:nc});
      nr+=dr;nc+=dc;
    }
  }
  return moves;
}
function jumpMoves(board,r,c,p,dests){
  const moves=[];
  for(const[dr,dc] of dests){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}
  return moves;
}
function knightMoves(board,r,c,p){return jumpMoves(board,r,c,p,[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]]);}
function kingMoves(board,r,c,p,gs){
  const moves=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}
  if(!p.hasMoved){
    const inChk=isInCheckSimple(p.color,board);
    if(!inChk){
      if(!board[r][5]&&!board[r][6]&&!isSquareAttackedSimple(r,5,p.color,board)&&!isSquareAttackedSimple(r,6,p.color,board)){const rk=board[r][7];if(rk&&rk.type==='r'&&!rk.hasMoved)moves.push({r,c:6,castle:'K'});}
      if(!board[r][1]&&!board[r][2]&&!board[r][3]&&!isSquareAttackedSimple(r,2,p.color,board)&&!isSquareAttackedSimple(r,3,p.color,board)){const rk=board[r][0];if(rk&&rk.type==='r'&&!rk.hasMoved)moves.push({r,c:2,castle:'Q'});}
    }
  }
  return moves;
}
function pawnMoves(board,r,c,p,gs){
  const moves=[];const dir=p.color==='w'?-1:1;const startRow=p.color==='w'?6:1;
  const gmBlocks=gs.grandMaitreAlive[opp(p.color)]&&!gs.grandMaitreAlive[p.color];
  const fr=r+dir;
  if(inB(fr,c)&&!board[fr][c]){
    moves.push({r:fr,c});
    if(r===startRow&&inB(r+2*dir,c)&&!board[r+2*dir][c]&&!gmBlocks)moves.push({r:r+2*dir,c});
  }
  for(const dc of[-1,1]){
    const tr=r+dir,tc=c+dc;if(!inB(tr,tc))continue;const t=board[tr][tc];
    if(t&&t.color!==p.color&&t.pieceId!=='preux-chevalier')moves.push({r:tr,c:tc});
    if(gs.enPassant&&gs.enPassant.r===tr&&gs.enPassant.c===tc)moves.push({r:tr,c:tc,ep:true});
  }
  return moves;
}

// ================================================================
// GÉNÉRATION DE COUPS — dispatch par pieceId (cœur des règles spéciales)
// ================================================================
function generateMovesRaw(board,r,c,gs){
  const p=board[r][c];if(!p)return[];
  if(gs.medusaParalyzed&&gs.medusaParalyzed.has(`${r},${c}`))return[];
  if(gs.anchored&&gs.anchored.has(`${r},${c}`))return[];
  let moves=[];const id=p.pieceId||'';

  if(p.isKing||p.type==='k'||['roi','empereur'].includes(id)){
    if(id==='empereur'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}moves=moves.concat(knightMoves(board,r,c,p));}
    else moves=kingMoves(board,r,c,p,gs);
    return moves;
  }

  switch(id){
    case 'dame':moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],gs);break;
    case 'amazone':moves=[...knightMoves(board,r,c,p),...slidingMoves(board,r,c,p,[[1,1],[1,-1],[-1,1],[-1,-1]],gs)];break;
    case 'chevaucheur-rhinoceros':moves=[...slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs),...knightMoves(board,r,c,p)];break;
    case 'grand-maitre':moves=[...slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],gs),...knightMoves(board,r,c,p)];break;
    case 'cavalier-primordial':moves=knightMoves(board,r,c,p);break;
    case 'fou-primordial':moves=slidingMoves(board,r,c,p,[[1,1],[1,-1],[-1,1],[-1,-1]],gs);break;
    case 'tour-primordiale':moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs);break;
    case 'alpha':moves=jumpMoves(board,r,c,p,[[2,2],[2,-2],[-2,2],[-2,-2]]);break;
    case 'fourmi':{
      // Comme un pion, la Fourmi ne peut ni se déplacer sur, ni capturer,
      // un Preux Chevalier (ability "Cuirasse").
      const fwd=p.color==='w'?-1:1;
      // Avant orthogonal (déplacement ET capture)
      const nrO=r+fwd,ncO=c;
      if(inB(nrO,ncO)&&(!board[nrO][ncO]||(board[nrO][ncO].color!==p.color&&board[nrO][ncO].pieceId!=='preux-chevalier')))moves.push({r:nrO,c:ncO});
      // Avant diagonal gauche et droit (déplacement ET capture)
      for(const dc of[-1,1]){const nrD=r+fwd,ncD=c+dc;if(inB(nrD,ncD)&&(!board[nrD][ncD]||(board[nrD][ncD].color!==p.color&&board[nrD][ncD].pieceId!=='preux-chevalier')))moves.push({r:nrD,c:ncD});}
      break;}
    // Preux Chevalier — exactement 2 ortho (pas de saut) OU 1 diag
    case 'preux-chevalier':
      for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){
        const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;
        const mr=r+dr/2,mc_=c+dc/2;
        if(board[mr][mc_])continue;// chemin bloqué — pas de saut
        if(!board[nr][nc]||board[nr][nc].color!==p.color)moves.push({r:nr,c:nc});
      }
      for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}
      break;
    case 'dresseur-elephant':
      for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}
      for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;const mr=r+dr/2,mc2=c+dc/2;if(board[mr][mc2]&&board[mr][mc2].color===p.color)continue;if(board[nr][nc]&&board[nr][nc].color===p.color)continue;moves.push({r:nr,c:nc,destroysPath:true,fromR:r,fromC:c});}
      break;
    case 'garde-pierre':
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}break;
    case 'meduse':
      for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc});}break;
    case 'typhon':
      for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&(!board[nr][nc]||board[nr][nc].color!==p.color))moves.push({r:nr,c:nc,typhon:true});}break;
    case 'banshee':
      for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;const mr=r+dr/2,mc4=c+dc/2;if(board[mr]?.[mc4])continue;if(!board[nr][nc]||board[nr][nc].color!==p.color)moves.push({r:nr,c:nc,banshee:true});}break;
    case 'pretre':
      moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs);
      moves=moves.filter(m=>Math.abs(m.r-r)+Math.abs(m.c-c)<=2);break;
    default:
      switch(p.type){
        case 'p':moves=pawnMoves(board,r,c,p,gs);break;
        case 'n':moves=knightMoves(board,r,c,p);break;
        case 'b':moves=slidingMoves(board,r,c,p,[[1,1],[1,-1],[-1,1],[-1,-1]],gs);break;
        case 'r':moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs);break;
        case 'q':moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],gs);break;
        case 'k':moves=kingMoves(board,r,c,p,gs);break;
      }
  }
  moves=moves.filter(m=>{
    if(board[m.r]?.[m.c]&&board[m.r][m.c].color!==p.color){if(gs.pretreProtected&&gs.pretreProtected.has(`${m.r},${m.c}`))return false;}
    return true;
  });
  return moves;
}

// ================================================================
// DÉTECTION D'ÉCHEC
// ================================================================
function isInCheckSimple(color,board){
  let kr=-1,kc=-1;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.color===color&&(p.type==='k'||p.isKing)){kr=r;kc=c;}}
  if(kr===-1)return false;return isSquareAttackedSimple(kr,kc,color,board);
}

const KNIGHT_PIECE_IDS=new Set(['cavalier-primordial','chevaucheur-rhinoceros','grand-maitre','empereur','amazone']);
const ROOK_PIECE_IDS=new Set(['tour-primordiale','chevaucheur-rhinoceros','dame','grand-maitre','pretre','meduse','dresseur-elephant']);
const BISHOP_PIECE_IDS=new Set(['fou-primordial','amazone','dame','grand-maitre']);
const KING_PIECE_IDS=new Set(['roi','garde-pierre','meduse']);

function isSquareAttackedSimple(tr,tc,defColor,board){
  const atk=opp(defColor);
  // Knights
  for(const[dr,dc] of[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]]){
    const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];
    if(p&&p.color===atk&&(p.type==='n'||KNIGHT_PIECE_IDS.has(p.pieceId)))return true;
  }
  // Rooks
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){
    let r=tr+dr,c=tc+dc;
    while(inB(r,c)){
      const p=board[r][c];
      if(p){
        if(p.color===atk){
          if(p.type==='r'||p.type==='q'||ROOK_PIECE_IDS.has(p.pieceId))return true;
          if(Math.abs(r-tr)<=1&&Math.abs(c-tc)<=1&&(p.type==='k'||p.isKing||KING_PIECE_IDS.has(p.pieceId)))return true;
        }
        break;
      }
      r+=dr;c+=dc;
    }
  }
  // Bishops/Queens
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    let r=tr+dr,c=tc+dc;
    while(inB(r,c)){
      const p=board[r][c];
      if(p){
        if(p.color===atk){
          if(p.type==='b'||p.type==='q'||BISHOP_PIECE_IDS.has(p.pieceId))return true;
          if(Math.abs(r-tr)<=1&&Math.abs(c-tc)<=1&&(p.type==='k'||p.isKing||KING_PIECE_IDS.has(p.pieceId)))return true;
        }
        break;
      }
      r+=dr;c+=dc;
    }
  }
  // Pawns
  const pawnDir=defColor==='w'?-1:1;
  for(const dc of[-1,1]){const r=tr+pawnDir,c=tc+dc;if(inB(r,c)){const p=board[r][c];if(p&&p.color===atk&&(p.type==='p'||p.pieceId==='std-pawn'))return true;}}
  // Fourmi (avant ortho avec capture, avant diag avec capture)
  {const atkFwdDir=atk==='w'?-1:1;
  // Fourmi attaque en avant orthogonal
  {const r=tr+atkFwdDir,c=tc;if(inB(r,c)){const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='fourmi')return true;}}
  // Fourmi attaque en diagonale avant
  for(const dc of[-1,1]){const r=tr+atkFwdDir,c=tc+dc;if(inB(r,c)){const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='fourmi')return true;}}}
  // Typhon (1 diag)
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='typhon')return true;}
  // Alpha (saut 2 diag)
  for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='alpha')return true;}
  // Banshee (2 diag sans saut)
  for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const midR=tr+dr/2,midC=tc+dc/2;if(!inB(midR,midC))continue;if(board[midR][midC])continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='banshee')return true;}
  // Preux-chevalier: 2 ortho (pas bloqué) OU 1 diag
  for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const mr=tr+dr/2,mc_=tc+dc/2;if(board[mr][mc_])continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='preux-chevalier')return true;}
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='preux-chevalier')return true;}
  // Dresseur éléphant
  for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(!p||p.color!==atk||p.pieceId!=='dresseur-elephant')continue;const midR=tr+dr/2,midC=tc+dc/2;if(board[midR][midC]&&board[midR][midC].color===atk)continue;return true;}

  return false;
}

function getLegalMovesKingFiltered(board,r,c,gs,moves){
  const p=board[r][c];if(!p)return moves;
  const isKingPiece=p.type==='k'||p.isKing||['roi','empereur'].includes(p.pieceId);
  if(!isKingPiece)return moves;
  return moves.filter(m=>{
    for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const tr=m.r+dr,tc=m.c+dc;if(!inB(tr,tc))continue;const t=board[tr][tc];if(t&&t.color!==p.color&&t.pieceId==='typhon')return false;}
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=m.r+dr,nc=m.c+dc;if(!inB(nr,nc))continue;const t=board[nr][nc];if(t&&t.color!==p.color&&(t.type==='k'||t.isKing))return false;}
    return true;
  });
}

function moveLeavesKingInCheck(board,fromR,fromC,move,color){
  if(move.stayPut)return false;
  const b=cloneBoard(board);const p=b[fromR][fromC];if(!p)return false;
  if(move.ep){const pr=move.r+(color==='w'?1:-1);b[pr][move.c]=null;}
  if(move.castle){if(move.castle==='K'){b[fromR][5]=b[fromR][7];b[fromR][7]=null;}if(move.castle==='Q'){b[fromR][3]=b[fromR][0];b[fromR][0]=null;}}
  b[move.r][move.c]={...p,hasMoved:true};b[fromR][fromC]=null;
  return isInCheckSimple(color,b);
}

function getLegalMoves(board,r,c,gs){
  const p=board[r][c];if(!p)return[];
  let raw=generateMovesRaw(board,r,c,gs);
  raw=getLegalMovesKingFiltered(board,r,c,gs,raw);
  return raw.filter(m=>!moveLeavesKingInCheck(board,r,c,m,p.color));
}

function hasLegalMovesForColor(color,board,gs){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.color===color&&getLegalMoves(board,r,c,gs).length>0)return true;}
  return false;
}

// ================================================================
// MISES À JOUR DES ÉTATS SPÉCIAUX (à appeler après chaque coup)
// ================================================================
function updateMedusaParalysis(board,gs){
  gs.medusaParalyzed=new Set();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.pieceId==='meduse'){for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&board[nr][nc]&&board[nr][nc].color!==p.color)gs.medusaParalyzed.add(`${nr},${nc}`);}}}
}
function updatePretreProtection(board,gs){
  gs.pretreProtected=new Set();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.pieceId==='pretre'){for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc))gs.pretreProtected.add(`${nr},${nc}`);}}}
}
function updateGrandMaitre(board,gs){
  gs.grandMaitreAlive={w:false,b:false};
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.pieceId==='grand-maitre')gs.grandMaitreAlive[p.color]=true;}
}
function applyTyphonEffect(toR,toC,board,p,gs){
  if(p.pieceId!=='typhon')return;
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nr=toR+dr,nc=toC+dc;if(!inB(nr,nc))continue;const t=board[nr][nc];
    if(t&&t.color!==p.color&&!gs.anchored?.has(`${nr},${nc}`)&&!(t.isKing||t.type==='k')){if(t.color==='w')gs.capturedW.push(t.emoji);else gs.capturedB.push(t.emoji);board[nr][nc]=null;}
  }
}
function applyBansheeEffect(toR,toC,board,p){
  if(p.pieceId!=='banshee')return;
  const oppDir=p.color==='w'?1:-1;
  for(let dc=-1;dc<=1;dc++){const nr=toR+oppDir,nc=toC+dc;if(!inB(nr,nc))continue;const t=board[nr][nc];if(t&&(t.type==='p'||t.pieceId==='std-pawn')&&t.color!==p.color){const back=t.color==='w'?1:-1;const br=nr+back;if(inB(br,nc)&&!board[br][nc]){board[br][nc]=t;board[nr][nc]=null;}}}
}
function applyDresseurEffect(move,board,p,gs){
  if(!move.destroysPath)return;
  const dr=Math.sign(move.r-move.fromR),dc=Math.sign(move.c-move.fromC);
  let nr=move.fromR+dr,nc=move.fromC+dc;
  while(nr!==move.r||nc!==move.c){
    const t=board[nr][nc];
    if(t&&t.color!==p.color&&!gs.anchored?.has(`${nr},${nc}`)&&!(t.isKing||t.type==='k')){
      if(t.color==='w')gs.capturedW.push(t.emoji);else gs.capturedB.push(t.emoji);
      board[nr][nc]=null;
    }
    nr+=dr;nc+=dc;
  }
}

// ================================================================
// EXÉCUTION D'UN COUP — cœur du moteur, tous les effets spéciaux
// ================================================================
function executeGameMove(from,to,gs){
  const b=gs.board;const p=b[from.r][from.c];if(!p)return;
  const snapshot={board:cloneBoard(b),turn:gs.turn,enPassant:gs.enPassant,halfmoveClock:gs.halfmoveClock,movePairs:JSON.parse(JSON.stringify(gs.movePairs)),capturedW:[...gs.capturedW],capturedB:[...gs.capturedB],anchored:new Set(gs.anchored||[]),grandMaitreAlive:{...gs.grandMaitreAlive},turnCount:gs.turnCount,timeWhite:gs.timeWhite,timeBlack:gs.timeBlack};
  gs.history.push(snapshot);gs.historyView=null;

  let captured=null;
  if(to.ep){const pr=to.r+(p.color==='w'?1:-1);captured=b[pr][to.c];if(captured){if(captured.color==='w')gs.capturedW.push(captured.emoji);else gs.capturedB.push(captured.emoji);}b[pr][to.c]=null;}
  else{
    captured=b[to.r][to.c];
    if(captured){
      if(captured.color==='w')gs.capturedW.push(captured.emoji);else gs.capturedB.push(captured.emoji);
      if(p.pieceId==='amazone')gs.amazonePostCapture={r:to.r,c:to.c,color:p.color};
    }
  }

  if(to.castle){if(to.castle==='K'){b[from.r][5]=b[from.r][7];b[from.r][7]=null;if(b[from.r][5])b[from.r][5].hasMoved=true;}if(to.castle==='Q'){b[from.r][3]=b[from.r][0];b[from.r][0]=null;if(b[from.r][3])b[from.r][3].hasMoved=true;}}

  b[to.r][to.c]=p;b[from.r][from.c]=null;p.hasMoved=true;

  if(to.destroysPath)applyDresseurEffect(to,b,p,gs);
  applyTyphonEffect(to.r,to.c,b,p,gs);
  applyBansheeEffect(to.r,to.c,b,p);

  gs.enPassant=null;
  if(p.pieceId==='std-pawn'&&Math.abs(to.r-from.r)===2)gs.enPassant={r:(to.r+from.r)/2,c:from.c};
  gs.halfmoveClock=(p.type==='p'||captured)?0:gs.halfmoveClock+1;

  const isPawnPromo=TRUE_PAWN_IDS.has(p.pieceId)&&(to.r===0||to.r===7);
  if(isPawnPromo){
    const aiCol=gs.aiColor||'b';
    if(p.color===aiCol){
      // L'IA choisit la meilleure pièce de son armée via évaluation rapide
      const aiExtras=(gs.aiArmy?.extras||[]).map(id=>PIECES.find(x=>x.id===id)).filter(Boolean);
      const aiGen=gs.aiArmy?.gen?.id?PIECES.find(x=>x.id===gs.aiArmy.gen.id):null;
      const stdOpts=aiCol==='b'
        ?[{type:'q',emoji:'♛',pieceId:'dame'},{type:'r',emoji:'♜',pieceId:'tour-primordiale'},{type:'b',emoji:'♝',pieceId:'fou-primordial'},{type:'n',emoji:'♞',pieceId:'cavalier-primordial'}]
        :[{type:'q',emoji:'♕',pieceId:'dame'},{type:'r',emoji:'♖',pieceId:'tour-primordiale'},{type:'b',emoji:'♗',pieceId:'fou-primordial'},{type:'n',emoji:'♘',pieceId:'cavalier-primordial'}];
      const promoOpts=aiExtras.length>0
        ?[...aiExtras.map(x=>({type:x.pieceType||'q',emoji:x.emoji,pieceId:x.id})),
           ...(aiGen?[{type:aiGen.pieceType||'q',emoji:aiGen.emoji,pieceId:aiGen.id}]:[]),
           ...stdOpts]
        :stdOpts;
      // Évaluer chaque option
      let bestOpt=promoOpts[0];let bestSc=-Infinity;
      for(const opt of promoOpts){
        const bc=cloneBoard(b);
        bc[to.r][to.c]={...p,type:opt.type,emoji:opt.emoji,pieceId:opt.pieceId};
        bc[from.r][from.c]=null;
        const sc=evalBoard(bc,gs);
        if(sc>bestSc){bestSc=sc;bestOpt=opt;}
      }
      b[to.r][to.c]={...p,type:bestOpt.type,emoji:bestOpt.emoji,pieceId:bestOpt.pieceId};
      playSound('promo');recordMove(p,to,!!captured,gs);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);
    }
    else{gs.pendingPromo={from,to,p};showPromoModal(gs);return;}
  }else{
    // Son du déplacement normal
    if(to.castle)playSound('castle');
    else if(captured)playSound('capture');
    else playSound('move');
    // Enregistrer le coup dans l'historique de positions (pour détecter les allers-retours IA)
    gs.lastMoveHistory=gs.lastMoveHistory||[];
    gs.lastMoveHistory.push({piece:p.id,fromR:from.r,fromC:from.c,toR:to.r,toC:to.c,color:p.color});
    if(gs.lastMoveHistory.length>8)gs.lastMoveHistory.shift();
    recordMove(p,to,!!captured,gs);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);
  }
}

// ================================================================
// AUDIO ENGINE — Web Audio API, aucun fichier externe
// ================================================================
let _audioCtx=null;
let _soundEnabled=true;

function getAudioCtx(){
  if(!_audioCtx){
    try{_audioCtx=new(window.AudioContext||window.webkitAudioContext)();}
    catch(e){return null;}
  }
  if(_audioCtx.state==='suspended')_audioCtx.resume();
  return _audioCtx;
}

function playTone(freq,type,duration,volume,fadeOut){
  if(!_soundEnabled)return;
  const ctx=getAudioCtx();if(!ctx)return;
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  osc.type=type||'sine';osc.frequency.setValueAtTime(freq,ctx.currentTime);
  gain.gain.setValueAtTime(volume||0.35,ctx.currentTime);
  if(fadeOut)gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration);
  osc.start(ctx.currentTime);osc.stop(ctx.currentTime+duration);
}

function playSound(type){
  if(!_soundEnabled)return;
  const ctx=getAudioCtx();if(!ctx)return;
  switch(type){
    case 'move':{
      playTone(440,'sine',0.07,0.28,true);
      break;}
    case 'capture':{
      playTone(180,'sawtooth',0.04,0.48,true);
      setTimeout(()=>playTone(120,'sawtooth',0.08,0.32,true),30);
      break;}
    case 'check':{
      playTone(660,'square',0.06,0.38,true);
      setTimeout(()=>playTone(880,'square',0.08,0.38,true),80);
      break;}
    case 'win':{
      [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.18,0.45,true),i*120));
      break;}
    case 'loss':{
      [440,370,294,220].forEach((f,i)=>setTimeout(()=>playTone(f,'triangle',0.22,0.40,true),i*130));
      break;}
    case 'draw':{
      playTone(330,'sine',0.12,0.35,true);
      setTimeout(()=>playTone(330,'sine',0.12,0.35,true),180);
      break;}
    case 'castle':{
      playTone(523,'sine',0.06,0.32,true);
      setTimeout(()=>playTone(659,'sine',0.09,0.32,true),70);
      break;}
    case 'promo':{
      [523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.14,0.40,true),i*80));
      break;}
    case 'error':{
      playTone(200,'sawtooth',0.12,0.35,true);
      break;}
  }
}

function initAudioOnInteraction(){
  document.addEventListener('click',()=>{getAudioCtx();},{once:true});
  document.addEventListener('touchstart',()=>{getAudioCtx();},{once:true,passive:true});
}
initAudioOnInteraction();

// ================================================================
// POST-COUP — enchaîne mise à jour d'états spéciaux + rendu + tour IA
// (renderGame/updateStatus sont définis dans game-render.js ;
//  doAIMove est défini dans ai-engine.js)
// ================================================================
function postMoveUpdate(gs){
  updateMedusaParalysis(gs.board,gs);updatePretreProtection(gs.board,gs);updateGrandMaitre(gs.board,gs);
  updateStatus(gs);renderGame(gs);
  const aiCol=gs.aiColor||'b';
  if(gs.turn===aiCol&&!gs.gameOver&&!gs.pendingPromo)setTimeout(()=>doAIMove(gs),500);
}

// ================================================================
// PROMOTION DU PION (joueur humain) — inclut le Général + les pièces de l'armée
// ================================================================
function showPromoModal(gs){
  const modal=document.getElementById('promo-modal');const box=document.getElementById('promo-box');
  modal.querySelector('.promo-title').textContent='Choisir la promotion';modal.classList.add('active');
  const armyPieces=(gs.playerArmy?.extras||[]).map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
  const genPiece=gs.playerArmy?.gen?.id?PIECES.find(p=>p.id===gs.playerArmy.gen.id):null;
  const stdPieces=[{type:'q',emoji:'♕',label:'Dame',pieceId:'dame-promo'},{type:'r',emoji:'♖',label:'Tour',pieceId:'tour-promo'},{type:'b',emoji:'♗',label:'Fou',pieceId:'fou-promo'},{type:'n',emoji:'♘',label:'Cavalier',pieceId:'cav-promo'}];
  let options;
  if(armyPieces.length>0){
    options=armyPieces.map(p=>({type:p.pieceType||'q',emoji:p.emoji,label:p.name,pieceId:p.id}));
    // Ajouter aussi le Général si pas déjà dedans
    if(genPiece&&!options.find(o=>o.pieceId===genPiece.id))options.push({type:genPiece.pieceType||'q',emoji:genPiece.emoji,label:genPiece.name,pieceId:genPiece.id});
  }else options=stdPieces;
  box.innerHTML=options.map((pp,i)=>'<div class="promo-piece" data-idx="'+i+'" title="'+pp.label+'">'+pp.emoji+'</div>').join('');
  box.querySelectorAll('.promo-piece').forEach((el,i)=>{el.addEventListener('click',()=>{const opt=options[i];const{p,to}=gs.pendingPromo;gs.board[to.r][to.c]={...p,type:opt.type,emoji:opt.emoji,pieceId:opt.pieceId};gs.pendingPromo=null;modal.classList.remove('active');playSound('promo');recordMove(p,to,false,gs);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);});});
}

// ================================================================
// JOURNAL DES COUPS (notation textuelle simple, PAS la notation FIDE)
// ================================================================
function recordMove(p,to,isCapture,gs){
  const col=FILES[to.c],row=8-to.r;const icon=getPieceEmoji(p);const txt=icon+(isCapture?'x':'')+col+row;
  if(p.color==='w')gs.movePairs.push([txt,'']);
  else{if(gs.movePairs.length>0)gs.movePairs[gs.movePairs.length-1][1]=txt;else gs.movePairs.push(['…',txt]);}
  renderMoveLog(gs);
}
function renderMoveLog(gs){
  const log=document.getElementById('move-log');if(!log)return;
  const cur=gs.historyView!==null?Math.floor(gs.historyView/2):gs.movePairs.length-1;
  log.innerHTML=gs.movePairs.map((pair,i)=>{const isH=gs.historyView!==null&&i===cur;return '<div class="move-log-item" style="'+(isH?'background:rgba(201,168,76,.15);border-radius:4px;':'')+'"><span class="move-log-num">'+(i+1)+'.</span><span class="move-log-w">'+pair[0]+'</span><span class="move-log-b">'+(pair[1]||'')+'</span></div>';}).join('');
  log.scrollTop=log.scrollHeight;
}

// ================================================================
// FIN DE PARTIE — nulle par matériel insuffisant / répétition / 50 coups
// ================================================================
function boardFEN(board){
  // Représentation simplifiée pour la détection de répétition
  let s='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    s+=p?(p.color[0]+p.pieceId[0]):'.';
  }
  return s;
}

function isInsufficientMaterial(board){
  // Mat impossible si seulement rois + (cavaliers ou fous de même couleur)
  const pieces=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(p&&!(p.isKing||p.type==='k'))pieces.push(p);
  }
  if(pieces.length===0)return true; // Roi vs Roi
  if(pieces.length===1){
    const p=pieces[0];
    // Roi + cavalier ou fou vs Roi seul
    if(p.type==='n'||p.pieceId==='cavalier-primordial')return true;
    if(p.type==='b'||p.pieceId==='fou-primordial')return true;
  }
  if(pieces.length===2){
    const [a,b]=pieces;
    // Deux fous de même couleur de case vs Roi
    if((a.type==='b'||a.pieceId==='fou-primordial')&&(b.type==='b'||b.pieceId==='fou-primordial')){
      // Même couleur de case ?
      let aR=-1,aC=-1,bR=-1,bC=-1;
      for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p===a){aR=r;aC=c;}if(p===b){bR=r;bC=c;}}
      if((aR+aC)%2===(bR+bC)%2)return true;
    }
  }
  return false;
}

// updateStatus / triggerEndOfGame / triggerTournoiEndOfGame vivent dans
// game-flow.js et tournoi.js respectivement (ils dépendent de l'ELO et
// du contexte tournoi), mais updateStatus() est appelée par postMoveUpdate()
// ci-dessus : elle DOIT donc être chargée avant toute exécution de coup,
// c'est-à-dire game-flow.js doit être chargé avant que la partie démarre
// (ce qui est garanti par l'ordre de <script> dans index.html).