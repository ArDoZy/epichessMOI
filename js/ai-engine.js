// ================================================================
// AI-ENGINE.JS — Évaluation de position, recherche minimax, Web Worker IA
// ================================================================
// Contient : la fonction d'évaluation heuristique (evalBoard), les tables
// de valeur des pièces et tables position-carrés (PST), la recherche
// alpha-beta avec table de transposition/killer moves/null-move/LMR
// (minimax + quiesce), et l'infrastructure Web Worker qui exécute cette
// recherche en arrière-plan pour ne pas geler l'UI (doAIMove +
// doAIMoveMainThread en fallback si les Workers ne sont pas disponibles).
//
// Dépendances : data-pieces.js (PIECES, AI_INSTRUCTORS), rules-engine.js
// (generateMovesRaw, getLegalMoves, isInCheckSimple, updateMedusaParalysis,
// updateGrandMaitre, executeGameMove, cloneBoard, inB, opp).
// Utilisé par : rules-engine.js (postMoveUpdate appelle doAIMove),
// game-flow.js / tournoi.js (le niveau choisi = selectedAILevel, défini
// dans ai-level-modal.js).
//
// Le code du Worker est généré dynamiquement (getWorkerCode) en sérialisant
// les fonctions ci-dessous en texte : si vous modifiez evalBoard/minimax/
// generateMovesRaw etc., le Worker utilisera automatiquement la nouvelle
// version au prochain chargement de page (aucune synchronisation manuelle
// nécessaire), MAIS le fichier rules-engine.js doit être chargé AVANT ce
// fichier pour que ces fonctions existent au moment de la sérialisation.
// ================================================================

const CVAL={
  'roi':10000,'empereur':10000,
  'dame':950,'amazone':800,'chevaucheur-rhinoceros':870,'grand-maitre':1200,
  'cavalier-primordial':360,'fou-primordial':360,'tour-primordiale':530,
  'dresseur-elephant':310,'meduse':240,'typhon':520,
  'alpha':230,
  'fourmi':190,'banshee':430,'preux-chevalier':210,
  'garde-pierre':290,'pretre':420,'std-pawn':100,
};
const PVAL={k:10000,q:950,r:530,b:360,n:360,p:100};

const PAWN_PST=[
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];
const KNIGHT_PST=[
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];
const KING_MIDDLE_PST=[
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20]
];

function getPST(p, r, c){
  const br = p.color==='b' ? r : (7-r);
  if(p.type==='p'||p.pieceId==='std-pawn'||p.pieceId==='fourmi')return PAWN_PST[br][c];
  if(p.type==='n'||p.pieceId==='cavalier-primordial')return KNIGHT_PST[br][c];
  if(p.isKing||p.type==='k')return KING_MIDDLE_PST[br][c];
  return 0;
}

// ================================================================
// ÉVALUATION DE POSITION
// ================================================================
function evalBoard(board,gs){
  let s=0;
  const fgs={medusaParalyzed:new Set(),pretreProtected:new Set(),anchored:new Set(gs?.anchored||[]),enPassant:null,grandMaitreAlive:{w:false,b:false},board};
  updateMedusaParalysis(board,fgs);updateGrandMaitre(board,fgs);

  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p)continue;
    const v=CVAL[p.pieceId]||PVAL[p.type]||100;
    const pst=getPST(p,r,c);

    let mob=0;
    try{mob=generateMovesRaw(board,r,c,fgs).length;}catch(e){}
    const mobBonus=mob*0.15;

    let passedBonus=0;
    if(p.type==='p'||p.pieceId==='std-pawn'){
      const dir=p.color==='b'?1:-1;
      let passed=true;
      for(let nr=r+dir;nr>=0&&nr<8;nr+=dir){
        for(let dc=-1;dc<=1;dc++){
          const nc=c+dc;
          if(nc<0||nc>7)continue;
          const t=board[nr][nc];
          if(t&&t.color!==p.color&&(t.type==='p'||t.pieceId==='std-pawn')){passed=false;break;}
        }
        if(!passed)break;
      }
      if(passed){const advRows=p.color==='b'?r:(7-r);passedBonus=advRows*8;}
    }

    let kingSafetyBonus=0;
    if(p.isKing||p.type==='k'){
      let defenders=0;
      for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
        if(!dr&&!dc)continue;
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>7||nc<0||nc>7)continue;
        const t=board[nr][nc];
        if(t&&t.color===p.color&&!t.isKing&&t.type!=='k')defenders++;
      }
      kingSafetyBonus=defenders*6;
    }

    let rookBonus=0;
    if(p.type==='r'||p.pieceId==='tour-primordiale'){
      let open=true;
      for(let nr=0;nr<8;nr++){
        const t=board[nr][c];
        if(t&&t!==p&&(t.type==='p'||t.pieceId==='std-pawn')){open=false;break;}
      }
      if(open)rookBonus=15;
    }

    let devBonus=0;
    const isKingPiece=p.isKing||p.type==='k'||['roi','empereur'].includes(p.pieceId);
    const isPawn=p.type==='p'||p.pieceId==='std-pawn'||p.pieceId==='fourmi'||p.pieceId==='preux-chevalier';
    if(!isKingPiece&&!isPawn){
      const homeRow=p.color==='b'?0:7;
      if(r!==homeRow){
        const dist=Math.abs(r-homeRow);
        devBonus=10+dist*4;
      } else {
        if(!p.hasMoved) devBonus=-8;
      }
    }

    let stagnationPenalty=0;
    if(!isKingPiece&&!isPawn&&!p.hasMoved&&v<500){
      stagnationPenalty=-12;
    }

    const total=v+pst+mobBonus+passedBonus+kingSafetyBonus+rookBonus+devBonus+stagnationPenalty;
    s+=total*(p.color==='b'?1:-1);
  }

  return s;
}

function getAllMovesColor(color,board,gs){
  const moves=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.color===color)getLegalMoves(board,r,c,gs).forEach(m=>moves.push({from:{r,c},to:m}));
  }
  moves.sort((a,b)=>{
    const aVic=board[a.to.r][a.to.c];const bVic=board[b.to.r][b.to.c];
    const aV=aVic?(CVAL[aVic.pieceId]||PVAL[aVic.type]||0):0;
    const bV=bVic?(CVAL[bVic.pieceId]||PVAL[bVic.type]||0):0;
    const aAtk=CVAL[board[a.from.r][a.from.c]?.pieceId]||PVAL[board[a.from.r][a.from.c]?.type]||999;
    const bAtk=CVAL[board[b.from.r][b.from.c]?.pieceId]||PVAL[board[b.from.r][b.from.c]?.type]||999;
    const aScore=(aV>0?aV*10-aAtk/10:0);
    const bScore=(bV>0?bV*10-bAtk/10:0);
    if(bScore!==aScore)return bScore-aScore;
    const aCentre=Math.max(0,3-Math.abs(3.5-a.to.c))+Math.max(0,3-Math.abs(3.5-a.to.r));
    const bCentre=Math.max(0,3-Math.abs(3.5-b.to.c))+Math.max(0,3-Math.abs(3.5-b.to.r));
    return bCentre-aCentre;
  });
  return moves;
}

function applyMoveQuick(board,from,to,p){
  const b=cloneBoard(board);
  if(to.stayPut){if(b[to.r][to.c])b[to.r][to.c]=null;return b;}
  if(to.ep){const pr=to.r+(p.color==='w'?1:-1);b[pr][to.c]=null;}
  if(to.castle){if(to.castle==='K'){b[from.r][5]=b[from.r][7];b[from.r][7]=null;}if(to.castle==='Q'){b[from.r][3]=b[from.r][0];b[from.r][0]=null;}}
  b[to.r][to.c]={...p,hasMoved:true};b[from.r][from.c]=null;
  if(b[to.r]?.[to.c]?.pieceId==='std-pawn'&&(to.r===0||to.r===7)&&b[to.r][to.c])b[to.r][to.c]={...b[to.r][to.c],type:'q',emoji:'♛',pieceId:'dame'};
  return b;
}

// ================================================================
// TABLE DE TRANSPOSITION — Zobrist + TT avec aging
// ================================================================
const ZK=(()=>{
  let seed=0xDEADBEEF;
  const rnd=()=>{seed=Math.imul(1664525,seed)+1013904223|0;return(seed>>>0);};
  const pieceIds=['roi','empereur','amazone','chevaucheur-rhinoceros',
    'dame','grand-maitre','cavalier-primordial','fou-primordial','tour-primordiale',
    'alpha','fourmi','preux-chevalier','dresseur-elephant','garde-pierre',
    'meduse','typhon','banshee','pretre',
    'std-pawn','std-r','std-n','std-b'];
  const pidx={};pieceIds.forEach((id,i)=>{pidx[id]=i;});
  const T=[];
  for(let s=0;s<64;s++){T[s]=[];for(let p=0;p<pieceIds.length;p++)T[s][p]=[rnd(),rnd()];}
  const turnKey=rnd();
  return{pidx,T,turnKey};
})();

function boardHash(board,isBlackTurn){
  let h=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p)continue;
    const sq=r*8+c;
    const pi=ZK.pidx[p.pieceId]??0;
    const ci=p.color==='w'?0:1;
    h^=ZK.T[sq]?.[pi]?.[ci]||0;
  }
  if(isBlackTurn)h^=ZK.turnKey;
  return h>>>0;
}

const TT_SIZE=1<<18;
const TT_MASK=TT_SIZE-1;
const TT=new Array(TT_SIZE).fill(null);
let _ttGeneration=0;

const TT_EXACT=0,TT_LOWER=1,TT_UPPER=2;

function ttStore(hash,depth,score,flag,bestMove){
  const i=hash&TT_MASK;
  const e=TT[i];
  if(!e||e.gen!==_ttGeneration||depth>=e.depth){
    TT[i]={hash,depth,score,flag,best:bestMove,gen:_ttGeneration};
  }
}
function ttProbe(hash,depth,alpha,beta){
  const e=TT[hash&TT_MASK];
  if(!e||e.hash!==hash)return null;
  const hint=e.best||null;
  if(e.depth>=depth){
    if(e.flag===TT_EXACT)return{score:e.score,cut:true,hint};
    if(e.flag===TT_LOWER&&e.score>=beta)return{score:beta,cut:true,hint};
    if(e.flag===TT_UPPER&&e.score<=alpha)return{score:alpha,cut:true,hint};
  }
  return{score:null,cut:false,hint};
}

const KILLERS=Array.from({length:32},()=>[null,null]);
function storeKiller(depth,move){
  if(!move)return;
  const k=KILLERS[depth%32];
  const isSame=m=>m&&m.from.r===move.from.r&&m.from.c===move.from.c&&m.to.r===move.to.r&&m.to.c===move.to.c;
  if(!isSame(k[0])){k[1]=k[0];k[0]={from:move.from,to:move.to};}
}
function isKiller(move,depth){
  const k=KILLERS[depth%32];
  return k.some(m=>m&&m.from.r===move.from.r&&m.from.c===move.from.c&&m.to.r===move.to.r&&m.to.c===move.to.c);
}

// ================================================================
// QUIESCENCE SEARCH
// ================================================================
let _aiDeadline=0;
let _aiAborted=false;

function quiesce(board,alpha,beta,maxing,fgs,qdepth){
  if(_aiAborted||Date.now()>_aiDeadline){_aiAborted=true;return 0;}
  const standPat=evalBoard(board,fgs);
  if(qdepth<=0)return standPat;
  if(maxing){
    if(standPat>=beta)return beta;
    if(standPat>alpha)alpha=standPat;
  }else{
    if(standPat<=alpha)return alpha;
    if(standPat<beta)beta=standPat;
  }
  const color=maxing?'b':'w';
  const fgs2={...fgs,board,medusaParalyzed:new Set(),pretreProtected:new Set(),grandMaitreAlive:{w:false,b:false}};
  updateMedusaParalysis(board,fgs2);updateGrandMaitre(board,fgs2);
  const moves=getAllMovesColor(color,board,fgs2).filter(({from,to})=>{
    const cap=board[to.r][to.c];
    return (cap&&cap.color!==board[from.r][from.c]?.color)||to.stayPut;
  });
  if(!moves.length)return standPat;
  if(maxing){
    for(const{from,to} of moves){
      if(_aiAborted)return 0;
      const nb=applyMoveQuick(board,from,to,board[from.r][from.c]);
      const ev=quiesce(nb,alpha,beta,false,fgs2,qdepth-1);
      if(ev>alpha)alpha=ev;if(alpha>=beta)return beta;
    }
    return alpha;
  }else{
    for(const{from,to} of moves){
      if(_aiAborted)return 0;
      const nb=applyMoveQuick(board,from,to,board[from.r][from.c]);
      const ev=quiesce(nb,alpha,beta,true,fgs2,qdepth-1);
      if(ev<beta)beta=ev;if(alpha>=beta)return alpha;
    }
    return beta;
  }
}

// ================================================================
// MINIMAX — Alpha-Beta + TT + Null Move + LMR + Killers
// ================================================================
function minimax(board,depth,alpha,beta,maxing,fgs,nullOk,plyFromRoot){
  if(_aiAborted||Date.now()>_aiDeadline){_aiAborted=true;return 0;}

  const hash=boardHash(board,maxing);
  const tte=ttProbe(hash,depth,alpha,beta);
  if(tte&&tte.cut)return tte.score;
  const ttHint=tte?.hint||null;

  if(depth<=0)return quiesce(board,alpha,beta,maxing,fgs,5);

  const color=maxing?'b':'w';
  const fgs2={...fgs,board,medusaParalyzed:new Set(),pretreProtected:new Set(),anchored:new Set(fgs?.anchored||[]),enPassant:null,grandMaitreAlive:{w:false,b:false}};
  updateMedusaParalysis(board,fgs2);updateGrandMaitre(board,fgs2);

  const inCheck=isInCheckSimple(color,board);
  let d=depth;
  if(inCheck&&d<16)d+=1;

  if(nullOk&&d>=3&&!inCheck&&plyFromRoot>0){
    const R=d>=6?3:2;
    const nullScore=minimax(board,d-1-R,alpha,beta,!maxing,fgs2,false,plyFromRoot+1);
    if(!_aiAborted){
      if(maxing&&nullScore>=beta)return beta;
      if(!maxing&&nullScore<=alpha)return alpha;
    }
  }

  let moves=getAllMovesColor(color,board,fgs2);
  if(!moves.length)return inCheck?(maxing?-49000+plyFromRoot:49000-plyFromRoot):0;

  moves.sort((a,b2)=>{
    const sc=(m)=>{
      const isTT=ttHint&&m.from.r===ttHint.from.r&&m.from.c===ttHint.from.c&&m.to.r===ttHint.to.r&&m.to.c===ttHint.to.c;
      if(isTT)return 1000000;
      const vic=board[m.to.r][m.to.c];
      const atk=board[m.from.r][m.from.c];
      const vicV=vic?(CVAL[vic.pieceId]||PVAL[vic.type]||0):0;
      const atkV=atk?(CVAL[atk.pieceId]||PVAL[atk.type]||999):999;
      if(vicV>0)return 100000+vicV*10-atkV;
      if(isKiller(m,plyFromRoot))return 90000;
      return Math.max(0,3-Math.abs(3.5-m.to.c))+Math.max(0,3-Math.abs(3.5-m.to.r));
    };
    return sc(b2)-sc(a);
  });

  let best=maxing?-Infinity:Infinity;
  let bestMoveFound=null;
  let flag=maxing?TT_UPPER:TT_LOWER;
  let moveCount=0;

  for(const{from,to} of moves){
    if(_aiAborted)return 0;
    const p=board[from.r][from.c];if(!p)continue;
    const nb=applyMoveQuick(board,from,to,p);
    moveCount++;

    const isCapture=!!board[to.r][to.c];
    const isKillerMove=isKiller({from,to},plyFromRoot);
    let newD=d-1;
    if(!inCheck&&moveCount>4&&!isCapture&&!isKillerMove&&d>=3&&plyFromRoot>0){
      newD=d-2;
    }

    let ev=minimax(nb,newD,alpha,beta,!maxing,fgs2,true,plyFromRoot+1);
    if(!_aiAborted&&newD<d-1){
      if(maxing&&ev>alpha)ev=minimax(nb,d-1,alpha,beta,!maxing,fgs2,true,plyFromRoot+1);
      else if(!maxing&&ev<beta)ev=minimax(nb,d-1,alpha,beta,!maxing,fgs2,true,plyFromRoot+1);
    }
    if(_aiAborted)return 0;

    if(maxing){
      if(ev>best){best=ev;bestMoveFound={from,to};}
      if(ev>alpha){alpha=ev;flag=TT_EXACT;}
      if(alpha>=beta){if(!isCapture)storeKiller(plyFromRoot,{from,to});flag=TT_LOWER;break;}
    }else{
      if(ev<best){best=ev;bestMoveFound={from,to};}
      if(ev<beta){beta=ev;flag=TT_EXACT;}
      if(alpha>=beta){if(!isCapture)storeKiller(plyFromRoot,{from,to});flag=TT_UPPER;break;}
    }
  }

  if(!_aiAborted)ttStore(hash,d,best,flag,bestMoveFound);
  return best;
}

// ================================================================
// WEB WORKER IA — calcul en arrière-plan pour ne pas bloquer l'UI
// ================================================================
let _aiWorker=null;
let _aiWorkerBusy=false;

function getWorkerCode(){
  const fns=[
    inB,opp,cloneBoard,getPieceEmoji,
    slidingMoves,jumpMoves,knightMoves,kingMoves,pawnMoves,generateMovesRaw,
    isInCheckSimple,isSquareAttackedSimple,getLegalMovesKingFiltered,moveLeavesKingInCheck,getLegalMoves,
    updateMedusaParalysis,updateGrandMaitre,
    applyMoveQuick,evalBoard,getAllMovesColor,
    boardHash,ttStore,ttProbe,storeKiller,isKiller,quiesce,minimax,
    getPST
  ].map(f=>f.toString()).join('\n');

  const consts=`
const PIECES=${JSON.stringify(PIECES)};
const CVAL=${JSON.stringify(CVAL)};
const PVAL=${JSON.stringify(PVAL)};
const PAWN_PST=${JSON.stringify(PAWN_PST)};
const KNIGHT_PST=${JSON.stringify(KNIGHT_PST)};
const KING_MIDDLE_PST=${JSON.stringify(KING_MIDDLE_PST)};
const KNIGHT_PIECE_IDS=new Set(${JSON.stringify([...KNIGHT_PIECE_IDS])});
const ROOK_PIECE_IDS=new Set(${JSON.stringify([...ROOK_PIECE_IDS])});
const BISHOP_PIECE_IDS=new Set(${JSON.stringify([...BISHOP_PIECE_IDS])});
const KING_PIECE_IDS=new Set(${JSON.stringify([...KING_PIECE_IDS])});
const ZK=${JSON.stringify({pidx:ZK.pidx,T:ZK.T,turnKey:ZK.turnKey})};
const TT_SIZE=1<<18;const TT_MASK=TT_SIZE-1;const TT=new Array(TT_SIZE).fill(null);
let _ttGeneration=0;
const TT_EXACT=0,TT_LOWER=1,TT_UPPER=2;
const KILLERS=Array.from({length:32},()=>[null,null]);
const AI_INSTRUCTORS=${JSON.stringify(AI_INSTRUCTORS)};
let _aiDeadline=0;let _aiAborted=false;
function inB(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function opp(color){return color==='w'?'b':'w';}
`;

  return consts+'\n'+fns+`
function fixGs(gs){
  gs.medusaParalyzed=new Set(gs._medusaArr||[]);
  gs.pretreProtected=new Set(gs._pretreArr||[]);
  gs.anchored=new Set(gs._anchoredArr||[]);
  gs.grandMaitreAlive=gs.grandMaitreAlive||{w:false,b:false};
  gs.lastMoveHistory=gs.lastMoveHistory||[];
  return gs;
}

self.onmessage=function(e){
  const{gs:gsRaw,instructorIdx}=e.data;
  const gs=fixGs(gsRaw);
  const instructor=AI_INSTRUCTORS[instructorIdx];

  const moves=getAllMovesColor('b',gs.board,gs);
  if(!moves.length){self.postMessage({bestMove:null});return;}

  if(Math.random()<instructor.noise){
    self.postMessage({bestMove:moves[Math.floor(Math.random()*moves.length)]});return;
  }
  if(instructor.timeMs===0){
    let bestMove=null,bestScore=-Infinity;
    for(const{from,to} of moves){
      const p=gs.board[from.r][from.c];if(!p)continue;
      const nb=applyMoveQuick(gs.board,from,to,p);
      let backPenalty=0;
      if(gs.lastMoveHistory&&gs.lastMoveHistory.length>=2){
        const prev=gs.lastMoveHistory[gs.lastMoveHistory.length-2];
        if(prev&&prev.piece===p.id&&prev.fromR===to.r&&prev.fromC===to.c)backPenalty=-30;
      }
      const sc=evalBoard(nb,gs)+(Math.random()-0.5)*50+backPenalty;
      if(sc>bestScore){bestScore=sc;bestMove={from,to};}
    }
    self.postMessage({bestMove});return;
  }

  _ttGeneration=(_ttGeneration+1)%256;
  KILLERS.forEach(k=>{k[0]=null;k[1]=null;});
  _aiDeadline=Date.now()+instructor.timeMs;
  _aiAborted=false;

  const recentPositions=new Set();
  if(gs.lastMoveHistory){
    for(let i=Math.max(0,gs.lastMoveHistory.length-4);i<gs.lastMoveHistory.length;i++){
      const h=gs.lastMoveHistory[i];
      if(h)recentPositions.add(h.piece+'_'+h.toR+'_'+h.toC);
    }
  }

  let searchMoves=[...moves];
  searchMoves.sort((a,b2)=>{
    const pa=gs.board[a.from.r][a.from.c];
    const pb=gs.board[b2.from.r][b2.from.c];
    const aBack=pa&&recentPositions.has(pa.id+'_'+a.to.r+'_'+a.to.c)?-1:0;
    const bBack=pb&&recentPositions.has(pb.id+'_'+b2.to.r+'_'+b2.to.c)?-1:0;
    return bBack-aBack;
  });

  let bestMove=searchMoves[0];
  let prevScore=null;

  for(let depth=1;depth<=30;depth++){
    if(Date.now()>_aiDeadline)break;
    _aiAborted=false;
    let aAlpha=-Infinity,aBeta=Infinity;
    if(depth>=4&&prevScore!==null){aAlpha=prevScore-50;aBeta=prevScore+50;}
    let iterBest=null,iterScore=-Infinity;
    const fgsRoot={...gs,board:gs.board,medusaParalyzed:new Set(),pretreProtected:new Set(),
      anchored:new Set(gs.anchored||[]),enPassant:null,grandMaitreAlive:{w:false,b:false}};
    updateMedusaParalysis(gs.board,fgsRoot);updateGrandMaitre(gs.board,fgsRoot);
    for(const{from,to} of searchMoves){
      if(Date.now()>_aiDeadline)break;
      const p=gs.board[from.r][from.c];if(!p)continue;
      const nb=applyMoveQuick(gs.board,from,to,p);
      const fgs2={...fgsRoot,board:nb,medusaParalyzed:new Set(),pretreProtected:new Set(),grandMaitreAlive:{w:false,b:false}};
      updateMedusaParalysis(nb,fgs2);updateGrandMaitre(nb,fgs2);
      let score=minimax(nb,depth-1,aAlpha,aBeta,false,fgs2,true,1);
      if(!_aiAborted&&(score<=aAlpha||score>=aBeta)){
        score=minimax(nb,depth-1,-Infinity,Infinity,false,fgs2,true,1);
      }
      if(!_aiAborted&&p&&recentPositions.has(p.id+'_'+to.r+'_'+to.c))score-=20;
      if(!_aiAborted&&score>iterScore){iterScore=score;iterBest={from,to};}
    }
    if(!_aiAborted&&iterBest){
      bestMove=iterBest;prevScore=iterScore;
      const idx=searchMoves.findIndex(m=>m.from.r===bestMove.from.r&&m.from.c===bestMove.from.c&&m.to.r===bestMove.to.r&&m.to.c===bestMove.to.c);
      if(idx>0){const [m]=searchMoves.splice(idx,1);searchMoves.unshift(m);}
    }
  }
  self.postMessage({bestMove});
};
`;
}

function ensureWorker(){
  if(_aiWorker)return;
  try{
    const blob=new Blob([getWorkerCode()],{type:'application/javascript'});
    _aiWorker=new Worker(URL.createObjectURL(blob));
    _aiWorker.onerror=(e)=>{console.warn('AI Worker error:',e);_aiWorker=null;_aiWorkerBusy=false;};
  }catch(err){console.warn('Worker not available, using main thread');_aiWorker=null;}
}

function serializeGs(gs){
  return{
    board:gs.board.map(r=>r.map(p=>p?{...p}:null)),
    turn:gs.turn,enPassant:gs.enPassant,halfmoveClock:gs.halfmoveClock,
    grandMaitreAlive:gs.grandMaitreAlive||{w:false,b:false},
    _medusaArr:[...(gs.medusaParalyzed||[])],
    _pretreArr:[...(gs.pretreProtected||[])],
    _anchoredArr:[...(gs.anchored||[])],
    lastMoveHistory:(gs.lastMoveHistory||[]).slice(-6),
  };
}

function doAIMove(gs){
  const aiCol=gs.aiColor||'b';
  if(gs.gameOver||gs.turn!==aiCol)return;

  ensureWorker();

  if(_aiWorker&&!_aiWorkerBusy){
    _aiWorkerBusy=true;
    const gsData=serializeGs(gs);
    _aiWorker.onmessage=(e)=>{
      _aiWorkerBusy=false;
      if(gs.gameOver||gs.turn!==aiCol)return;
      const{bestMove}=e.data;
      if(bestMove){
        let move=bestMove;
        if(aiCol==='w'){
          move={from:{r:7-bestMove.from.r,c:bestMove.from.c},to:{r:7-bestMove.to.r,c:bestMove.to.c}};
        }
        gs.lastMove={from:move.from,to:move.to,capture:!!gs.board[move.to.r][move.to.c]};
        executeGameMove(move.from,move.to,gs);
      }
    };
    if(aiCol==='w'){
      const mirrorGs=mirrorBoardForWorker(gsData);
      _aiWorker.postMessage({gs:mirrorGs,instructorIdx:selectedAILevel});
    }else{
      _aiWorker.postMessage({gs:gsData,instructorIdx:selectedAILevel});
    }
  }else{
    doAIMoveMainThread(gs);
  }
}

function mirrorBoardForWorker(gsData){
  const mirrorColor=c=>c==='w'?'b':'w';
  const mirrorBoard=gsData.board.slice().reverse().map(row=>row.map(p=>p?{...p,color:mirrorColor(p.color)}:null));
  return{...gsData,board:mirrorBoard,turn:'b',_medusaArr:[],_pretreArr:[],_anchoredArr:[]};
}

// ----------------------------------------------------------------
// FALLBACK — recherche IA sur le thread principal (si Web Worker
// indisponible, ex: certains contextes file:// restrictifs)
// ----------------------------------------------------------------
function doAIMoveMainThread(gs){
  const aiCol=gs.aiColor||'b';
  if(gs.gameOver||gs.turn!==aiCol)return;
  const moves=getAllMovesColor(aiCol,gs.board,gs);
  if(!moves.length)return;
  const instructor=AI_INSTRUCTORS[selectedAILevel];

  const recentPositions=new Set();
  if(gs.lastMoveHistory){
    for(let i=Math.max(0,gs.lastMoveHistory.length-4);i<gs.lastMoveHistory.length;i++){
      const h=gs.lastMoveHistory[i];
      if(h&&h.color===aiCol)recentPositions.add(h.piece+'_'+h.toR+'_'+h.toC);
    }
  }

  if(Math.random()<instructor.noise){
    const m=moves[Math.floor(Math.random()*moves.length)];
    gs.lastMove={from:m.from,to:m.to,capture:!!gs.board[m.to.r][m.to.c]};executeGameMove(m.from,m.to,gs);return;
  }
  if(instructor.timeMs===0){
    let bestMove=null,bestScore=-Infinity;
    for(const{from,to} of moves){
      const p=gs.board[from.r][from.c];if(!p)continue;
      const nb=applyMoveQuick(gs.board,from,to,p);
      const backPenalty=(p&&recentPositions.has(p.id+'_'+to.r+'_'+to.c))?-30:0;
      const sc=evalBoard(nb,gs)+(Math.random()-0.5)*50+backPenalty;
      if(sc>bestScore){bestScore=sc;bestMove={from,to};}
    }
    if(bestMove){gs.lastMove={from:bestMove.from,to:bestMove.to,capture:!!gs.board[bestMove.to.r][bestMove.to.c]};executeGameMove(bestMove.from,bestMove.to,gs);}
    return;
  }
  _ttGeneration=(_ttGeneration+1)%256;
  KILLERS.forEach(k=>{k[0]=null;k[1]=null;});
  _aiDeadline=Date.now()+instructor.timeMs;
  _aiAborted=false;
  let searchMoves=[...moves];let bestMove=searchMoves[0];let prevScore=null;
  for(let depth=1;depth<=30;depth++){
    if(Date.now()>_aiDeadline)break;
    _aiAborted=false;
    let aAlpha=-Infinity,aBeta=Infinity;
    if(depth>=4&&prevScore!==null){aAlpha=prevScore-50;aBeta=prevScore+50;}
    let iterBest=null,iterScore=-Infinity;
    const fgsRoot={...gs,board:gs.board,medusaParalyzed:new Set(),pretreProtected:new Set(),anchored:new Set(gs.anchored||[]),enPassant:null,grandMaitreAlive:{w:false,b:false}};
    updateMedusaParalysis(gs.board,fgsRoot);updateGrandMaitre(gs.board,fgsRoot);
    for(const{from,to} of searchMoves){
      if(Date.now()>_aiDeadline)break;
      const p=gs.board[from.r][from.c];if(!p)continue;
      const nb=applyMoveQuick(gs.board,from,to,p);
      const fgs2={...fgsRoot,board:nb,medusaParalyzed:new Set(),pretreProtected:new Set(),grandMaitreAlive:{w:false,b:false}};
      updateMedusaParalysis(nb,fgs2);updateGrandMaitre(nb,fgs2);
      let score=minimax(nb,depth-1,aAlpha,aBeta,false,fgs2,true,1);
      if(!_aiAborted&&(score<=aAlpha||score>=aBeta))score=minimax(nb,depth-1,-Infinity,Infinity,false,fgs2,true,1);
      if(!_aiAborted&&p&&recentPositions.has(p.id+'_'+to.r+'_'+to.c))score-=20;
      if(!_aiAborted&&score>iterScore){iterScore=score;iterBest={from,to};}
    }
    if(!_aiAborted&&iterBest){
      bestMove=iterBest;prevScore=iterScore;
      const idx=searchMoves.findIndex(m=>m.from.r===bestMove.from.r&&m.from.c===bestMove.from.c&&m.to.r===bestMove.to.r&&m.to.c===bestMove.to.c);
      if(idx>0){const [m]=searchMoves.splice(idx,1);searchMoves.unshift(m);}
    }
  }
  if(bestMove){gs.lastMove={from:bestMove.from,to:bestMove.to,capture:!!gs.board[bestMove.to.r][bestMove.to.c]};executeGameMove(bestMove.from,bestMove.to,gs);}
}