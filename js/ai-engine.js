// ================================================================
// AI-ENGINE.JS : Évaluation de position, recherche minimax, Web Worker IA
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
// Classe de chaque pièce, indexée pour l'évaluation : PIECES.find() dans la
// boucle d'évaluation coûterait une recherche linéaire par case et par nœud.
const PIECE_CLASS_BY_ID=(()=>{const m={};PIECES.forEach(p=>{m[p.id]=p.class;});return m;})();

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

// ORIENTATION DES TABLES : la ligne 0 de chaque table est la rangée LA PLUS
// AVANCÉE du camp considéré (celle de la promotion), la ligne 7 sa rangée de
// départ. Sur ce plateau, r=0 est le fond des Noirs et r=7 celui des Blancs :
// un Blanc avance donc vers r décroissant et lit la table à `r`, un Noir
// avance vers r croissant et la lit à `7-r`.
//
// Les deux étaient INVERSÉS, avec deux conséquences que l'on voyait jouer :
// un pion sur sa case de départ touchait la prime de la 7e rangée (+50) et
// n'avait donc aucune raison d'avancer, et le roi était poussé vers le CENTRE
// du plateau au lieu de rester à l'abri derrière ses pions. La table des
// cavaliers, symétrique haut/bas, ne trahissait rien : le défaut est resté
// invisible longtemps.
function getPST(p, r, c){
  const br = p.color==='w' ? r : (7-r);
  if(p.type==='p'||p.pieceId==='std-pawn'||p.pieceId==='fourmi')return PAWN_PST[br][c];
  if(p.type==='n'||p.pieceId==='cavalier-primordial')return KNIGHT_PST[br][c];
  if(p.isKing||p.type==='k')return KING_MIDDLE_PST[br][c];
  return 0;
}

// ================================================================
// ÉVALUATION DES POUVOIRS
// ================================================================
// L'évaluation ne regardait jusqu'ici QUE les déplacements : matériel,
// mobilité, structure de pions. Elle était donc aveugle à ce qui fait la
// spécificité du jeu. Une Méduse valait ses 240 points même quand elle
// paralysait la Dame adverse ; un Typhon ne voyait jamais qu'il pouvait
// effacer trois pièces d'un coup ; le Prêtre ne comprenait pas qu'il rendait
// ses voisines intouchables.
//
// evalPowers() ajoute un terme par pouvoir, du point de vue du camp de la
// pièce. La convention de signe est celle d'evalBoard : POSITIF favorise les
// Noirs, négatif les Blancs.
//
// Les valeurs sont volontairement modestes (10 à 60 % de la valeur de la
// pièce concernée) : un pouvoir change une position, il ne remplace pas une
// dame. Les surévaluer produirait une IA qui court après ses effets spéciaux
// en laissant ses pièces en prise.
function powerValueAt(board,r,c){
  const p=board[r][c];
  if(!p)return 0;
  return CVAL[p.pieceId]||PVAL[p.type]||100;
}

function evalPowers(board,fgs){
  let s=0;
  const sign=col=>col==='b'?1:-1;

  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p)continue;
    const id=p.pieceId;const sg=sign(p.color);

    // MÉDUSE : chaque pièce ennemie paralysée en diagonale est retirée du jeu
    // tant que la Méduse tient. Vaut d'autant plus que la victime est chère.
    if(id==='meduse'){
      for(const[dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>7||nc<0||nc>7)continue;
        const t=board[nr][nc];
        if(t&&t.color!==p.color)s+=sg*Math.min(260,powerValueAt(board,nr,nc)*0.34);
      }
    }

    // PRÊTRE : interdit les captures sur ses quatre diagonales. Compte les
    // pièces AMIES ainsi mises à l'abri (une case vide protégée ne vaut rien).
    else if(id==='pretre'){
      for(const[dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nr=r+dr,nc=c+dc;
        if(nr<0||nr>7||nc<0||nc>7)continue;
        const t=board[nr][nc];
        if(t&&t.color===p.color)s+=sg*Math.min(120,powerValueAt(board,nr,nc)*0.16);
      }
    }

    // TYPHON : détruit tout ce qui est adjacent à sa case d'ARRIVÉE. On
    // évalue la meilleure de ses quatre destinations, pas sa case actuelle :
    // c'est la menace qui pèse sur l'adversaire.
    else if(id==='typhon'){
      let best=0;
      for(const[dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
        const tr=r+dr,tc=c+dc;
        if(tr<0||tr>7||tc<0||tc>7)continue;
        const occ=board[tr][tc];
        if(occ&&occ.color===p.color)continue;
        let gain=occ?powerValueAt(board,tr,tc):0;
        for(const[ar,ac] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
          const br2=tr+ar,bc=tc+ac;
          if(br2<0||br2>7||bc<0||bc>7)continue;
          const v=board[br2][bc];
          if(v&&v.color!==p.color&&!(v.isKing||v.type==='k'))gain+=powerValueAt(board,br2,bc);
        }
        if(gain>best)best=gain;
      }
      // 40 % : la menace n'est pas encore encaissée, l'adversaire peut parer.
      s+=sg*best*0.40;
    }

    // DRESSEUR D'ÉLÉPHANT : la charge de 2 cases écrase ce qu'elle traverse.
    else if(id==='dresseur-elephant'){
      let best=0;
      for(const[dr,dc] of [[2,0],[-2,0],[0,2],[0,-2]]){
        const tr=r+dr,tc=c+dc;
        if(tr<0||tr>7||tc<0||tc>7)continue;
        const mid=board[r+dr/2][c+dc/2];
        if(mid&&mid.color===p.color)continue;
        const dest=board[tr][tc];
        if(dest&&dest.color===p.color)continue;
        let gain=0;
        if(mid&&mid.color!==p.color&&!(mid.isKing||mid.type==='k'))gain+=powerValueAt(board,r+dr/2,c+dc/2);
        if(dest&&dest.color!==p.color)gain+=powerValueAt(board,tr,tc);
        if(gain>best)best=gain;
      }
      s+=sg*best*0.35;
    }

    // GRAND MAÎTRE : sa seule présence prive l'adversaire du double pas de
    // pion, ce qui étouffe son développement. Effet global, pas positionnel.
    else if(id==='grand-maitre'){
      if(!fgs.grandMaitreAlive||!fgs.grandMaitreAlive[p.color==='w'?'b':'w'])s+=sg*55;
    }

    // GARDE DE PIERRE : une fois ancré il est imprenable ET immobile. C'est
    // un mur : précieux devant son roi, quasi inutile ailleurs.
    else if(id==='garde-pierre'){
      const anchored=fgs.anchored&&fgs.anchored.has(r+','+c);
      if(anchored){
        let shields=0;
        for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
          if(!dr&&!dc)continue;
          const nr=r+dr,nc=c+dc;
          if(nr<0||nr>7||nc<0||nc>7)continue;
          const t=board[nr][nc];
          if(t&&t.color===p.color&&(t.isKing||t.type==='k'))shields+=1;
        }
        s+=sg*(shields?130:-30);
      }
    }

    // PREUX CHEVALIER : sa cuirasse le rend intouchable par les pions, qui
    // sont justement la moitié des pièces du plateau. Prime constante.
    else if(id==='preux-chevalier'){
      s+=sg*40;
    }

    // BANSHEE : repousse les pions adverses proches, ce qui casse leur
    // structure. Vaut par le nombre de pions à portée de hurlement.
    else if(id==='banshee'){
      const dir=p.color==='w'?-1:1;
      for(let dc=-1;dc<=1;dc++){
        const nr=r+dir,nc=c+dc;
        if(nr<0||nr>7||nc<0||nc>7)continue;
        const t=board[nr][nc];
        if(t&&t.color!==p.color&&(t.type==='p'||t.pieceId==='std-pawn'))s+=sg*22;
      }
    }

    // ALPHA : saute exactement à 2 cases en diagonale, donc il ignore les
    // blocages mais laisse les cases adjacentes libres. Utile au contact des
    // lignes ennemies, faible à l'arrière.
    else if(id==='alpha'){
      const adv=p.color==='b'?r:(7-r);
      s+=sg*adv*4;
    }
  }
  return s;
}

// ================================================================
// STYLES DE JEU : ce qui distingue un adversaire d'un autre
// ================================================================
// Deux adversaires qui partagent la même fonction d'évaluation jouent la même
// partie, à la profondeur près : la seule chose qui les séparait était leur
// taux d'erreur, ce qui donne douze versions plus ou moins abîmées du même
// joueur. Chaque adversaire porte donc un STYLE (voir AI_OPPONENTS dans
// js/data-pieces.js) qui repondère les termes que evalBoard calcule DÉJÀ :
// aucun parcours de plateau supplémentaire, donc aucun coût de recherche.
//
// Convention : le style s'applique aux pièces NOIRES. Dans le repère de la
// recherche, l'IA est toujours noire (un adversaire qui joue les blancs reçoit
// un plateau miroité, voir mirrorBoardForWorker), donc « noir » = « l'IA ».
//
//   mob    mobilité            adv   avancée dans le camp adverse
//   pst    tables de cases     king  pièces autour de son propre roi
//   pow    pouvoirs spéciaux   count prime par pièce encore en vie
//   dev    développement       mat   multiplicateur de matériel
const STYLE_W={
  equilibre:  null,
  erratique:  null,
  gourmand:   {mob:0.4,dev:0.3,pow:0.5,mat:1.06},
  nuee:       {count:20,mat:0.97},
  brute:      {advBrute:7,mob:0.8},
  agressif:   {adv:5,pow:1.25,king:0.5,dev:1.4},
  sorcier:    {pow:2.0,mob:0.8,mat:0.96},
  defensif:   {king:2.4,adv:-3,mob:0.9,mat:1.04},
  mobile:     {mob:2.6,dev:1.4,adv:1.5},
  positionnel:{pst:1.6,mob:1.3,dev:1.2,struct:1.6},
};
// Style de l'adversaire en cours de réflexion. Écrit juste avant la recherche
// (aiApplyStyle), lu par evalBoard. Nul = évaluation neutre.
let _aiStyleW=null;
function aiApplyStyle(styleName){_aiStyleW=(styleName&&STYLE_W[styleName])||null;}

// ================================================================
// ÉVALUATION DE POSITION
// ================================================================
function evalBoard(board,gs){
  let s=0;
  const SW=_aiStyleW;
  const fgs={medusaParalyzed:new Set(),pretreProtected:new Set(),anchored:new Set(gs?.anchored||[]),enPassant:null,grandMaitreAlive:{w:false,b:false},board};
  updateMedusaParalysis(board,fgs);updateGrandMaitre(board,fgs);

  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p)continue;
    const isAI=SW&&p.color==='b';
    const v=(CVAL[p.pieceId]||PVAL[p.type]||100)*((isAI&&SW.mat)||1);
    const pst=getPST(p,r,c)*((isAI&&SW.pst)||1);

    // Une pièce paralysée par une Méduse ne peut rien faire : la compter à sa
    // pleine valeur ferait croire à l'IA qu'elle a du matériel utilisable.
    const paralyzed=fgs.medusaParalyzed.has(r+','+c);

    let mob=0;
    try{mob=generateMovesRaw(board,r,c,fgs).length;}catch(e){}
    const mobBonus=mob*0.15*((isAI&&SW.mob)||1);

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
      if(passed){const advRows=p.color==='b'?r:(7-r);passedBonus=advRows*8*((isAI&&SW.struct)||1);}
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
      kingSafetyBonus=defenders*6*((isAI&&SW.king)||1);
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
      devBonus*=((isAI&&SW.dev)||1);
    }

    let stagnationPenalty=0;
    if(!isKingPiece&&!isPawn&&!p.hasMoved&&v<500){
      stagnationPenalty=-12;
    }

    const paralysisPenalty=paralyzed?-Math.min(200,v*0.30):0;

    // Termes propres au style, tous nuls hors adversaire stylé (SW==null).
    let styleBonus=0;
    if(isAI){
      // Avancée : nombre de rangées gagnées vers le camp adverse. Un agressif
      // veut être chez l'autre, un défensif veut rester chez lui.
      if(SW.adv&&!isKingPiece)styleBonus+=r*SW.adv;
      if(SW.advBrute&&PIECE_CLASS_BY_ID[p.pieceId]==='Brute')styleBonus+=r*SW.advBrute;
      // Nuée : chaque pièce encore en vie compte, indépendamment de sa valeur.
      // C'est ce qui produit un adversaire qui refuse les échanges.
      if(SW.count&&!isKingPiece)styleBonus+=SW.count;
    }

    const total=v+pst+mobBonus+passedBonus+kingSafetyBonus+rookBonus+devBonus+stagnationPenalty+paralysisPenalty+styleBonus;
    s+=total*(p.color==='b'?1:-1);
  }

  const pw=evalPowers(board,fgs);
  // Un sorcier surévalue ses propres pouvoirs (et pas ceux de l'adversaire) :
  // evalPowers est signé, on ne majore donc que la part positive (= noire).
  if(SW&&SW.pow&&pw>0)return s+pw*SW.pow;
  return s+pw;
}

// unsorted : minimax refait son propre tri (table de transposition, killers,
// historique), le tri MVV/LVA fait ici serait alors payé deux fois par nœud
// pour rien. La quiescence, elle, garde ce tri : c'est son seul ordre.
function getAllMovesColor(color,board,gs,unsorted){
  const moves=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.color===color)getLegalMoves(board,r,c,gs).forEach(m=>moves.push({from:{r,c},to:m}));
  }
  if(unsorted)return moves;
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

function applyMoveQuick(board,from,to,p,anchored){
  const b=cloneBoard(board);
  if(to.stayPut){if(b[to.r][to.c])b[to.r][to.c]=null;return b;}
  if(to.ep){const pr=to.r+(p.color==='w'?1:-1);b[pr][to.c]=null;}
  if(to.castle){if(to.castle==='K'){b[from.r][5]=b[from.r][7];b[from.r][7]=null;}if(to.castle==='Q'){b[from.r][3]=b[from.r][0];b[from.r][0]=null;}}
  b[to.r][to.c]={...p,hasMoved:true};b[from.r][from.c]=null;
  // Typhon, charge du Dresseur, hurlement de la Banshee : ces effets sont le
  // coup, pas un supplément. Sans eux la recherche évaluait un Typhon comme un
  // fou d'une case et ne jouait jamais le coup qui efface trois pièces.
  applyCollateralOnBoard(b,from,to,b[to.r][to.c],anchored);
  if(b[to.r]?.[to.c]?.pieceId==='std-pawn'&&(to.r===0||to.r===7)&&b[to.r][to.c])b[to.r][to.c]={...b[to.r][to.c],type:'q',emoji:'♛',pieceId:'dame'};
  return b;
}

// ================================================================
// TABLE DE TRANSPOSITION : Zobrist + TT avec aging
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

// TABLE D'HISTOIRE : mémorise quelles paires (case de départ, case d'arrivée)
// ont provoqué des coupures alpha-beta, toutes profondeurs confondues. Un coup
// qui réfute souvent la position sera essayé plus tôt la prochaine fois, ce
// qui fait tomber l'arbre plus vite. Complément des killers, qui eux ne
// valent que pour une profondeur donnée.
const HIST=new Int32Array(4096);
function histIdx(m){return ((m.from.r*8+m.from.c)<<6)|(m.to.r*8+m.to.c);}
function histBump(m,depth){const i=histIdx(m);HIST[i]=Math.min(1<<22,HIST[i]+depth*depth);}
function histGet(m){return HIST[histIdx(m)];}
function histDecay(){for(let i=0;i<HIST.length;i++)HIST[i]>>=1;}

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

// Le Typhon efface-t-il au moins une pièce en se posant là ? Sert à la
// quiescence, qui doit traiter ce coup comme une prise même quand la case
// d'arrivée est vide. Le roi est épargné par le pouvoir, il ne compte pas.
function destroysSomething(board,to,p){
  for(const[dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nr=to.r+dr,nc=to.c+dc;
    if(nr<0||nr>7||nc<0||nc>7)continue;
    const t=board[nr][nc];
    if(t&&t.color!==p.color&&!(t.isKing||t.type==='k'))return true;
  }
  return false;
}

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
  // La quiescence ne prolonge que les coups VIOLENTS, pour ne pas s'arrêter au
  // milieu d'un échange. Elle ne retenait que les prises « classiques », celles
  // qui atterrissent sur une pièce ennemie — or dans ce jeu les coups les plus
  // violents n'en sont pas : un Typhon qui se pose sur une case VIDE efface
  // jusqu'à huit voisines, et la charge du Dresseur écrase ce qu'elle traverse.
  // La recherche évaluait donc tranquillement une position à un demi-coup
  // d'être balayée, ce qui est exactement l'effet d'horizon que la quiescence
  // existe pour supprimer.
  const moves=getAllMovesColor(color,board,fgs2).filter(({from,to})=>{
    const p=board[from.r][from.c];
    const cap=board[to.r][to.c];
    if(cap&&cap.color!==p?.color)return true;
    if(to.stayPut||to.destroysPath)return true;
    if(p&&p.pieceId==='typhon')return destroysSomething(board,to,p);
    return false;
  });
  if(!moves.length)return standPat;
  if(maxing){
    for(const{from,to} of moves){
      if(_aiAborted)return 0;
      const nb=applyMoveQuick(board,from,to,board[from.r][from.c],fgs2.anchored);
      const ev=quiesce(nb,alpha,beta,false,fgs2,qdepth-1);
      if(ev>alpha)alpha=ev;if(alpha>=beta)return beta;
    }
    return alpha;
  }else{
    for(const{from,to} of moves){
      if(_aiAborted)return 0;
      const nb=applyMoveQuick(board,from,to,board[from.r][from.c],fgs2.anchored);
      const ev=quiesce(nb,alpha,beta,true,fgs2,qdepth-1);
      if(ev<beta)beta=ev;if(alpha>=beta)return alpha;
    }
    return beta;
  }
}

// ================================================================
// MINIMAX : Alpha-Beta + TT + Null Move + LMR + Killers
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

  let moves=getAllMovesColor(color,board,fgs2,true);
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
      // Coups tranquilles : l'historique des coupures passe avant la simple
      // proximite du centre, c'est un signal bien plus informatif.
      return histGet(m)+Math.max(0,3-Math.abs(3.5-m.to.c))+Math.max(0,3-Math.abs(3.5-m.to.r));
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
    const nb=applyMoveQuick(board,from,to,p,fgs2.anchored);
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
      if(alpha>=beta){if(!isCapture){storeKiller(plyFromRoot,{from,to});histBump({from,to},d);}flag=TT_LOWER;break;}
    }else{
      if(ev<best){best=ev;bestMoveFound={from,to};}
      if(ev<beta){beta=ev;flag=TT_EXACT;}
      if(alpha>=beta){if(!isCapture){storeKiller(plyFromRoot,{from,to});histBump({from,to},d);}flag=TT_UPPER;break;}
    }
  }

  if(!_aiAborted)ttStore(hash,d,best,flag,bestMoveFound);
  return best;
}

// ================================================================
// RECHERCHE À LA RACINE ET CHOIX DU COUP
// ================================================================
// Ces deux fonctions sont partagées mot pour mot par le Worker et par le
// repli sur le thread principal : la boucle d'approfondissement itératif
// existait en double, à soixante lignes d'écart, et les deux copies avaient
// déjà divergé (la pénalité d'aller-retour n'était appliquée que d'un côté).
//
// aiSearchRoot renvoie TOUS les coups avec leur score, et non le seul
// meilleur : c'est ce que réclame le modèle de force (voir aiPickMove).

// Le camp au trait dans le repère de recherche est toujours 'b'.
function aiSearchRoot(gs,opp){
  const moves=getAllMovesColor('b',gs.board,gs);
  if(!moves.length)return null;

  // Cases récemment occupées par la pièce qui s'y trouve : sert à décourager
  // les allers-retours, qui font perdre la partie par répétition.
  const recent=new Set();
  const lmh=gs.lastMoveHistory||[];
  for(let i=Math.max(0,lmh.length-4);i<lmh.length;i++){
    const h=lmh[i];if(h)recent.add(h.piece+'_'+h.toR+'_'+h.toC);
  }
  const backPenalty=(p,to)=>(p&&recent.has(p.id+'_'+to.r+'_'+to.c))?20:0;

  aiApplyStyle(opp.style);

  // Adversaire sans budget de réflexion : la position est jugée juste après le
  // coup, sans aucune recherche. Il voit la pièce à prendre, pas le mat en deux.
  if(!opp.timeMs){
    const scored=moves.map(({from,to})=>{
      const p=gs.board[from.r][from.c];
      if(!p)return{from,to,score:-Infinity};
      const nb=applyMoveQuick(gs.board,from,to,p,gs.anchored);
      return{from,to,score:evalBoard(nb,gs)-backPenalty(p,to)};
    });
    scored.sort((a,b)=>b.score-a.score);
    return scored;
  }

  _ttGeneration=(_ttGeneration+1)%256;
  KILLERS.forEach(k=>{k[0]=null;k[1]=null;});
  histDecay();
  _aiDeadline=Date.now()+opp.timeMs;
  _aiAborted=false;

  const maxDepth=Math.max(1,Math.min(30,opp.depthCap||30));
  let searchMoves=[...moves];
  // Résultat de la dernière itération COMPLÈTE : une itération interrompue par
  // la pendule n'a évalué qu'une partie des coups, ses scores ne sont pas
  // comparables entre eux et fausseraient le tirage de aiPickMove.
  let scored=searchMoves.map(({from,to})=>({from,to,score:0}));
  let prevScore=null;

  for(let depth=1;depth<=maxDepth;depth++){
    if(Date.now()>_aiDeadline)break;
    _aiAborted=false;
    let aAlpha=-Infinity,aBeta=Infinity;
    if(depth>=4&&prevScore!==null){aAlpha=prevScore-50;aBeta=prevScore+50;}
    const fgsRoot={...gs,board:gs.board,medusaParalyzed:new Set(),pretreProtected:new Set(),
      anchored:new Set(gs.anchored||[]),enPassant:null,grandMaitreAlive:{w:false,b:false}};
    updateMedusaParalysis(gs.board,fgsRoot);updateGrandMaitre(gs.board,fgsRoot);
    const iter=[];let complete=true;
    for(const{from,to} of searchMoves){
      if(Date.now()>_aiDeadline){complete=false;break;}
      const p=gs.board[from.r][from.c];if(!p)continue;
      const nb=applyMoveQuick(gs.board,from,to,p,gs.anchored);
      const fgs2={...fgsRoot,board:nb,medusaParalyzed:new Set(),pretreProtected:new Set(),grandMaitreAlive:{w:false,b:false}};
      updateMedusaParalysis(nb,fgs2);updateGrandMaitre(nb,fgs2);
      let score=minimax(nb,depth-1,aAlpha,aBeta,false,fgs2,true,1);
      if(!_aiAborted&&(score<=aAlpha||score>=aBeta))score=minimax(nb,depth-1,-Infinity,Infinity,false,fgs2,true,1);
      if(_aiAborted){complete=false;break;}
      iter.push({from,to,score:score-backPenalty(p,to)});
    }
    if(!complete||!iter.length)break;
    iter.sort((a,b)=>b.score-a.score);
    scored=iter;prevScore=iter[0].score;
    // Le meilleur coup de cette itération passe en tête de la suivante : c'est
    // lui qui fait tomber l'arbre le plus vite.
    searchMoves=iter.map(m=>({from:m.from,to:m.to}));
  }
  return scored;
}

// Choix du coup parmi les coups notés, selon la force de l'adversaire.
//
//   blunder : probabilité de lâcher franchement la position. Les débutants
//             accrochent des pièces ; sans ce terme, un adversaire imprécis
//             reste bizarrement solide et ne perd jamais bêtement.
//   slack   : tolérance en centipions autour du meilleur coup. On tire au sort
//             parmi TOUS les coups qui ne perdent pas plus que ça, ce qui
//             produit des coups plausibles mais imprécis — et non le charabia
//             que donnait l'ancien tirage uniforme sur tous les coups légaux.
//
// Un mat trouvé n'est jamais gâché : au-delà de 40000, la fenêtre se ferme.
// Un adversaire faible ne voit pas le mat (sa recherche est trop courte), mais
// s'il le voit, il le joue — sinon il aurait l'air de se moquer du joueur.
function aiPickMove(scored,opp){
  if(!scored||!scored.length)return null;
  const pick=m=>({from:m.from,to:m.to});
  if(scored.length===1)return pick(scored[0]);
  const best=scored[0].score;
  if(best>=40000)return pick(scored[0]);
  if(opp.blunder&&Math.random()<opp.blunder)
    return pick(scored[Math.floor(Math.random()*scored.length)]);
  const slack=opp.slack||0;
  if(slack<=0)return pick(scored[0]);
  let n=1;
  while(n<scored.length&&scored[n].score>=best-slack)n++;
  return pick(scored[Math.floor(Math.random()*n)]);
}

// ================================================================
// WEB WORKER IA : calcul en arrière-plan pour ne pas bloquer l'UI
// ================================================================
let _aiWorker=null;
let _aiWorkerBusy=false;

function getWorkerCode(){
  const fns=[
    inB,opp,cloneBoard,getPieceEmoji,
    slidingMoves,jumpMoves,knightMoves,kingMoves,pawnMoves,generateMovesRaw,
    isInCheckSimple,isSquareAttackedSimple,getLegalMovesKingFiltered,applyCollateralOnBoard,moveLeavesKingInCheck,getLegalMoves,
    updateMedusaParalysis,updateGrandMaitre,
    applyMoveQuick,powerValueAt,evalPowers,evalBoard,getAllMovesColor,
    boardHash,ttStore,ttProbe,storeKiller,isKiller,destroysSomething,quiesce,minimax,
    histIdx,histBump,histGet,histDecay,getPST,
    aiApplyStyle,aiSearchRoot,aiPickMove
  ].map(f=>f.toString()).join('\n');

  const consts=`
const PIECES=${JSON.stringify(PIECES)};
const CVAL=${JSON.stringify(CVAL)};
const PVAL=${JSON.stringify(PVAL)};
const PIECE_CLASS_BY_ID=${JSON.stringify(PIECE_CLASS_BY_ID)};
const STYLE_W=${JSON.stringify(STYLE_W)};
let _aiStyleW=null;
const PAWN_PST=${JSON.stringify(PAWN_PST)};
const KNIGHT_PST=${JSON.stringify(KNIGHT_PST)};
const KING_MIDDLE_PST=${JSON.stringify(KING_MIDDLE_PST)};
const CUSTOM_MOVE_IDS=new Set(${JSON.stringify([...CUSTOM_MOVE_IDS])});
const DIAG_SLIDER_IDS=new Set(${JSON.stringify([...DIAG_SLIDER_IDS])});
const ORTHO_SLIDER_IDS=new Set(${JSON.stringify([...ORTHO_SLIDER_IDS])});
const KNIGHT_ATK_IDS=new Set(${JSON.stringify([...KNIGHT_ATK_IDS])});
const KING_ADJ_IDS=new Set(${JSON.stringify([...KING_ADJ_IDS])});
const ZK=${JSON.stringify({pidx:ZK.pidx,T:ZK.T,turnKey:ZK.turnKey})};
const TT_SIZE=1<<18;const TT_MASK=TT_SIZE-1;const TT=new Array(TT_SIZE).fill(null);
let _ttGeneration=0;
const TT_EXACT=0,TT_LOWER=1,TT_UPPER=2;
const KILLERS=Array.from({length:32},()=>[null,null]);
const HIST=new Int32Array(4096);
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
  const opp=AI_INSTRUCTORS[instructorIdx]||AI_INSTRUCTORS[0];
  const scored=aiSearchRoot(gs,opp);
  self.postMessage({bestMove:aiPickMove(scored,opp)});
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

function doAIMove(gs,retry){
  const aiCol=gs.aiColor||'b';
  if(gs.gameOver||gs.turn!==aiCol)return;

  ensureWorker();

  // Le Worker est encore sur la recherche de la partie PRÉCÉDENTE (revanche
  // ou nouveau round lancé pendant que l'Instructeur réfléchissait). Basculer
  // sur le thread principal figerait l'interface trois secondes : on repasse
  // simplement la main, et on n'insiste pas au-delà de trois secondes.
  if(_aiWorker&&_aiWorkerBusy){
    const n=(retry||0)+1;
    if(n<=10){setTimeout(()=>doAIMove(gs,n),300);return;}
    _aiWorker.terminate();_aiWorker=null;_aiWorkerBusy=false;
    ensureWorker();
  }

  if(_aiWorker&&!_aiWorkerBusy){
    _aiWorkerBusy=true;
    const gsData=serializeGs(gs);
    _aiWorker.onmessage=(e)=>{
      _aiWorkerBusy=false;
      if(gs.gameOver||gs.turn!==aiCol)return;
      const{bestMove}=e.data;
      if(bestMove){
        const move=(aiCol==='w')?unmirrorMove(bestMove):bestMove;
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
  // La case de prise en passant vit dans le repère du plateau : la laisser
  // telle quelle sur un plateau retourné désignait une case à l'autre bout,
  // et l'IA jouant les Blancs se voyait offrir (ou refuser) une prise qui
  // n'existait pas.
  const ep=gsData.enPassant?{r:7-gsData.enPassant.r,c:gsData.enPassant.c}:null;
  return{...gsData,board:mirrorBoard,turn:'b',enPassant:ep,_medusaArr:[],_pretreArr:[],_anchoredArr:[]};
}

// Ramène un coup trouvé sur le plateau miroité dans le repère réel.
// Les DRAPEAUX du coup font partie du coup : `castle`, `ep`, `typhon`,
// `destroysPath` et le couple fromR/fromC de la charge du Dresseur étaient
// perdus en route, parce que seules les coordonnées étaient recopiées. Une IA
// jouant les Blancs roquait donc sans déplacer sa tour, prenait en passant
// sans retirer le pion, et chargeait au Dresseur sans rien écraser.
function unmirrorMove(m){
  const to={...m.to,r:7-m.to.r,c:m.to.c};
  if(to.fromR!==undefined)to.fromR=7-to.fromR;
  return{from:{r:7-m.from.r,c:m.from.c},to};
}

// ----------------------------------------------------------------
// FALLBACK : recherche IA sur le thread principal (si Web Worker
// indisponible, ex: certains contextes file:// restrictifs)
// ----------------------------------------------------------------
function doAIMoveMainThread(gs){
  const aiCol=gs.aiColor||'b';
  if(gs.gameOver||gs.turn!==aiCol)return;
  const opp=AI_INSTRUCTORS[selectedAILevel]||AI_INSTRUCTORS[0];
  // aiSearchRoot raisonne toujours du point de vue des Noirs (c'est la
  // convention de signe d'evalBoard). Une IA qui joue les Blancs reçoit donc
  // le plateau miroité, exactement comme le Worker, et le coup rendu est
  // ramené dans le repère réel.
  const mirrored=aiCol==='w';
  const searchGs=mirrored?mirrorGsForSearch(gs):gs;
  const scored=aiSearchRoot(searchGs,opp);
  let move=aiPickMove(scored,opp);
  if(!move)return;
  if(mirrored)move={from:{r:7-move.from.r,c:move.from.c},to:{...move.to,r:7-move.to.r,c:move.to.c}};
  gs.lastMove={from:move.from,to:move.to,capture:!!gs.board[move.to.r][move.to.c]};
  executeGameMove(move.from,move.to,gs);
}

// Miroir haut/bas + inversion des couleurs, sur un etat de partie vivant.
// Les etats speciaux (paralysie, protection, ancrage) sont recalcules par la
// recherche elle-meme : les transposer ici ne servirait qu'a les transposer mal.
function mirrorGsForSearch(gs){
  const flip=c=>c==='w'?'b':'w';
  const board=gs.board.slice().reverse().map(row=>row.map(p=>p?{...p,color:flip(p.color)}:null));
  return{...gs,board,turn:'b',medusaParalyzed:new Set(),pretreProtected:new Set(),
    anchored:new Set(),enPassant:null,grandMaitreAlive:{w:false,b:false},
    lastMoveHistory:(gs.lastMoveHistory||[]).map(h=>({...h,fromR:7-h.fromR,toR:7-h.toR,color:flip(h.color)}))};
}