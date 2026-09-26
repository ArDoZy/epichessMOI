// ================================================================
// RULES-ENGINE.JS : Moteur de règles pur (génération de coups, échecs,
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
//     spéciaux (Typhon, Banshee, Éléphant de guerre, etc.)
//   - Le système audio (Web Audio API, sans fichiers externes)
//   - L'état de partie GS (game state) et sa structure
//
// Ce module NE FAIT PAS de rendu DOM (sauf appels différés à renderGame/
// postMoveUpdate définis dans game-render.js et game-flow.js, couplage
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

// État de partie global : reconstruit par startGame() dans game-flow.js.
// Voir la structure complète dans ce fichier.
// ================================================================
// LE MODE RELECTURE
// ================================================================
// Une partie enregistrée se REJOUE en repassant ses coups par ce moteur-ci
// (js/replay.js) : c'est le seul moyen d'être sûr qu'une partie relue se
// déroule exactement comme elle s'est jouée — un second moteur de relecture
// aurait divergé du vrai au premier pouvoir modifié.
//
// Rejouer trente coups à la file ne doit évidemment ni jouer trente bruits de
// prise, ni allumer trente gerbes d'étincelles sur un plateau qui n'est pas à
// l'écran, ni faire avancer les quêtes du jour, ni réveiller l'IA, ni
// déclencher une fin de partie. Ce drapeau est ce qui distingue « le moteur
// calcule » de « le joueur joue » : quand il est levé, le moteur ne fait plus
// que muter le plateau et écrire la notation.
//
// IL EST TOUJOURS RABAISSÉ DANS UN `finally` (voir replayApply, js/replay.js) :
// une exception au milieu d'une relecture laisserait sinon le vrai jeu muet.
let REPLAYING=false;
let GS={board:[],turn:'w',selected:null,legalMoves:[],history:[],enPassant:null,halfmoveClock:0,gameOver:false,playerArmy:null,aiArmy:null,movePairs:[],capturedW:[],capturedB:[],pendingPromo:null,medusaParalyzed:new Set(),lastMove:null,anchored:new Set(),pretreProtected:new Set(),amazonePostCapture:null,grandMaitreAlive:{w:false,b:false},gardePierreUsed:{w:false,b:false},turnCount:0,historyView:null,lastMoveHistory:[],clockMs:0,incrementMs:0,timeWhite:0,timeBlack:0};

function inB(r,c){return r>=0&&r<8&&c>=0&&c<8;}
// Les listes de pièces capturées portent l'id et la couleur (et non un
// caractère emoji) : c'est ce qui permet de les redessiner en SVG dans les
// bandeaux joueurs, et de les compter pour l'économie.
function pushCaptured(gs,piece){
  // Un reflet d'Illusion n'est pas une pièce : le prendre ne se compte pas.
  if(piece.pieceId==='reflet')return;
  const rec={id:piece.pieceId,color:piece.color};
  if(piece.color==='w')gs.capturedW.push(rec);else gs.capturedB.push(rec);
}
function opp(color){return color==='w'?'b':'w';}
function cloneBoard(b){return b.map(r=>r.map(p=>p?{...p}:null));}
function getPieceEmoji(cell){if(!cell)return '';return cell.emoji||'?';}

// ================================================================
// HORLOGE DE PARTIE : décompte par joueur, avec incrément Fischer.
// gs.clockMs = temps de départ par joueur en ms (0 = illimité, pas d'horloge).
// gs.incrementMs = temps rendu à celui qui vient de jouer (0 = cadence sèche).
// L'incrément est crédité dans recordMove(), c'est-à-dire au moment exact où
// un coup est inscrit au journal, juste avant que le trait ne change.
// Démarrée par showArmyIntro() à la fermeture de l'overlay (game-flow.js),
// arrêtée dans triggerEndOfGame(). Le rendu des
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
// La pendule tourne aussi pendant qu'on relit l'historique : elle s'arrêtait
// dès que `historyView` n'était plus nul, ce qui faisait des boutons ⏮◀▶⏭ une
// pause illimitée en pleine partie.
function tickClock(gs){
  if(!gs.clockMs||gs.gameOver){gs._clockLastTs=Date.now();return;}
  const now=Date.now();const elapsed=now-gs._clockLastTs;gs._clockLastTs=now;
  const key=gs.turn==='w'?'timeWhite':'timeBlack';
  gs[key]=Math.max(0,gs[key]-elapsed);
  if(typeof renderClocks==='function')renderClocks(gs);
  if(gs[key]<=0){
    stopClockTick(gs);gs.gameOver=true;
    const playerCol=gs.playerColor||'w';
    const result=gs.turn===playerCol?'loss':'win';
    const bar=document.getElementById('game-status');
    if(bar){bar.textContent='Temps écoulé ! '+(result==='win'?'Vous gagnez !':'Votre adversaire gagne !');bar.className='status-bar mate';}
    if(typeof playSound==='function')playSound(result==='win'?'win':'loss');
    if(!_endGameTriggered)triggerEndOfGame(result);
  }
}

// ================================================================
// GÉNÉRATION DE COUPS : helpers génériques
// ================================================================
// LE REFLET DE L'ILLUSION (voir data-pieces.js) est une pièce pour l'adversaire
// et du vent pour son propre camp. Ces deux questions sont donc posées partout
// où l'on demandait « la case est-elle vide ? » ou « est-elle ennemie ? » :
//   canLand   p peut-elle se POSER sur t ? Vide, ennemie, ou un reflet (celui
//             d'en face se prend, le sien se dissipe sous elle).
//   barsPath  t BARRE-t-elle le passage au camp `col` ? Toute pièce, sauf un
//             reflet de ce camp-là.
function canLand(t,p){return !t||t.color!==p.color||t.pieceId==='reflet';}
function barsPath(t,col){return !!t&&!(t.pieceId==='reflet'&&t.color===col);}
function slidingMoves(board,r,c,p,dirs,gs){
  const moves=[];
  for(const[dr,dc] of dirs){
    let nr=r+dr,nc=c+dc;
    while(inB(nr,nc)){
      const t=board[nr][nc];
      if(t&&t.pieceId==='reflet'&&t.color===p.color){moves.push({r:nr,c:nc});nr+=dr;nc+=dc;continue;}
      if(t){if(t.color!==p.color)moves.push({r:nr,c:nc});break;}
      else moves.push({r:nr,c:nc});
      nr+=dr;nc+=dc;
    }
  }
  return moves;
}
function jumpMoves(board,r,c,p,dests){
  const moves=[];
  for(const[dr,dc] of dests){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}
  return moves;
}
function knightMoves(board,r,c,p){return jumpMoves(board,r,c,p,[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]]);}
function kingMoves(board,r,c,p,gs){
  const moves=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}
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
  // DOMINATION DU GRAND MAÎTRE : tant qu'il est vivant, les pions ADVERSES ne
  // peuvent pas avancer de 2 cases. La condition s'annulait quand les deux
  // camps en alignaient un — ce qui n'est pas la règle : chacun subit celui
  // d'en face, y compris quand il a le sien.
  const gmBlocks=!!gs.grandMaitreAlive[opp(p.color)];
  const fr=r+dir;
  if(inB(fr,c)&&!barsPath(board[fr][c],p.color)){
    moves.push({r:fr,c});
    if(r===startRow&&inB(r+2*dir,c)&&!barsPath(board[r+2*dir][c],p.color)&&!gmBlocks)moves.push({r:r+2*dir,c});
  }
  for(const dc of[-1,1]){
    const tr=r+dir,tc=c+dc;if(!inB(tr,tc))continue;const t=board[tr][tc];
    if(t&&t.color!==p.color&&t.pieceId!=='preux-chevalier')moves.push({r:tr,c:tc});
    if(gs.enPassant&&gs.enPassant.r===tr&&gs.enPassant.c===tc)moves.push({r:tr,c:tc,ep:true});
  }
  return moves;
}

// ================================================================
// GÉNÉRATION DE COUPS : dispatch par pieceId (cœur des règles spéciales)
// ================================================================
function generateMovesRaw(board,r,c,gs){
  const p=board[r][c];if(!p)return[];
  if(gs.medusaParalyzed&&gs.medusaParalyzed.has(`${r},${c}`))return[];
  if(gs.anchored&&gs.anchored.has(`${r},${c}`))return[];
  let moves=[];const id=p.pieceId||'';

  // LE ROI EST LE SEUL MONARQUE. L'Empereur — qui marchait comme lui ET
  // sautait comme un cavalier — a été retiré du jeu : il n'y a donc plus de
  // branche à choisir ici, et plus aucune liste `['roi','empereur']` à tenir
  // à jour ailleurs dans le fichier. `isKing`/`type==='k'` reste le test :
  // c'est lui que porte une pièce PROMUE en Roi comme le Roi de départ.
  if(p.isKing||p.type==='k'||id==='roi'){
    // Le Monarque ne mange jamais l'Infecté : la contagion l'emporterait.
    return kingMoves(board,r,c,p,gs).filter(m=>{const t=board[m.r][m.c];return !(t&&t.pieceId==='infecte'&&t.color!==p.color);});
  }

  switch(id){
    case 'dame':moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],gs);break;
    case 'amazone':moves=[...knightMoves(board,r,c,p),...slidingMoves(board,r,c,p,[[1,1],[1,-1],[-1,1],[-1,-1]],gs)];break;
    case 'chevaucheur-rhinoceros':moves=[...slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs),...knightMoves(board,r,c,p)];break;
    case 'grand-maitre':moves=[...slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],gs),...knightMoves(board,r,c,p)];break;
    case 'cavalier-primordial':moves=knightMoves(board,r,c,p);break;
    case 'fou-primordial':moves=slidingMoves(board,r,c,p,[[1,1],[1,-1],[-1,1],[-1,-1]],gs);break;
    case 'tour-primordiale':moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs);break;
    case 'fourmi':{
      // La Fourmi N'EST PAS un pion (voir TRUE_PAWN_IDS, data-pieces.js) : la
      // Cuirasse du Preux Chevalier, qui n'arrête que les pions, ne la
      // concerne donc pas — elle peut le capturer.
      const fwd=p.color==='w'?-1:1;
      // Avant orthogonal (déplacement ET capture)
      const nrO=r+fwd,ncO=c;
      if(inB(nrO,ncO)&&canLand(board[nrO][ncO],p))moves.push({r:nrO,c:ncO});
      // Avant diagonal gauche et droit (déplacement ET capture)
      for(const dc of[-1,1]){const nrD=r+fwd,ncD=c+dc;if(inB(nrD,ncD)&&canLand(board[nrD][ncD],p))moves.push({r:nrD,c:ncD});}
      break;}
    // Preux Chevalier : exactement 2 ortho (pas de saut) OU 1 diag
    case 'preux-chevalier':
      for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){
        const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;
        const mr=r+dr/2,mc_=c+dc/2;
        if(barsPath(board[mr][mc_],p.color))continue;// chemin bloqué, pas de saut
        if(canLand(board[nr][nc],p))moves.push({r:nr,c:nc});
      }
      for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}
      break;
    case 'dresseur-elephant':
      for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}
      for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;const mr=r+dr/2,mc2=c+dc/2;const mid=board[mr][mc2];if(mid&&mid.color===p.color&&mid.pieceId!=='reflet')continue;if(!canLand(board[nr][nc],p))continue;moves.push({r:nr,c:nc,destroysPath:true,fromR:r,fromC:c});}
      break;
    // LE GARDE DE PIERRE : une case dans les huit directions, et son ancrage.
    // Il était le dernier de trois Gardes — l'Eau n'allait que tout droit, le
    // Feu qu'en biais — retirés du jeu depuis : il porte donc seul le
    // vocabulaire complet du plateau, orthogonal et diagonal à la fois.
    case 'garde-pierre':
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}break;
    case 'meduse':
      for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}break;
    case 'typhon':
      for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc,typhon:true});}break;
    // Banshee : 1 OU 2 cases en diagonale (les 2 cases sans sauter).
    case 'banshee':
      for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;if(canLand(board[nr][nc],p))moves.push({r:nr,c:nc,banshee:true});}
      for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;const mr=r+dr/2,mc4=c+dc/2;if(barsPath(board[mr]?.[mc4],p.color))continue;if(canLand(board[nr][nc],p))moves.push({r:nr,c:nc,banshee:true});}break;
    case 'pretre':
      moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs);
      moves=moves.filter(m=>Math.abs(m.r-r)+Math.abs(m.c-c)<=2);break;
    // LE PÉGASE : le bond du cavalier, en plus long — trois cases dans une
    // direction, puis une de côté. Il saute tout ce qui se trouve entre.
    case 'pegase':
      moves=jumpMoves(board,r,c,p,[[3,1],[3,-1],[-3,1],[-3,-1],[1,3],[-1,3],[1,-3],[-1,-3]]);break;
    // LE LOUP GÉANT : exactement deux cases en diagonale, ni une ni trois, en
    // sautant par-dessus la case du milieu quelle qu'elle soit.
    case 'loup-geant':
      moves=jumpMoves(board,r,c,p,[[2,2],[2,-2],[-2,2],[-2,-2]]);break;
    case 'singe':
      moves=singeMoves(board,r,c,p,gs);break;
    // NYX : le pas du Roi et le bond du Cavalier. Son pouvoir (le brouillard)
    // ne change aucune règle, il ne touche que ce que l'adversaire VOIT
    // (nyxFogFor, plus bas).
    case 'nyx':
      moves=[...jumpMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]),...knightMoves(board,r,c,p)];break;
    // L'INFECTÉ : exactement deux cases, tout droit ou en diagonale, en
    // sautant. Sa contagion est appliquée après le coup (voir
    // infectionKills).
    case 'infecte':
      moves=jumpMoves(board,r,c,p,[[2,0],[-2,0],[0,2],[0,-2],[2,2],[2,-2],[-2,2],[-2,-2]]);break;
    // L'OMBRE : une ou deux cases en ligne droite (sans sauter). Son
    // invisibilité ne touche que l'affichage (ombreHiddenFor, plus bas).
    case 'ombre':
      moves=slidingMoves(board,r,c,p,[[1,0],[-1,0],[0,1],[0,-1]],gs)
        .filter(m=>Math.abs(m.r-r)+Math.abs(m.c-c)<=2);break;
    // L'ILLUSION : une case tout droit, ou une à deux cases en diagonale (sans
    // sauter). Son reflet est posé par applyIllusionReflet, après le coup.
    case 'illusion':
      for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}
      for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;if(barsPath(board[r+dr/2][c+dc/2],p.color))continue;if(canLand(board[nr][nc],p))moves.push({r:nr,c:nc});}
      break;
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
  // FOI INÉBRANLABLE DU PRÊTRE : on ne peut pas capturer une pièce ENNEMIE qui
  // est protégée par SON Prêtre. La clé porte donc la couleur protégée (voir
  // updatePretreProtection) : sans elle, un Prêtre noir rendait aussi
  // intouchables les pièces blanches posées en diagonale de lui.
  moves=moves.filter(m=>{
    const t=board[m.r]?.[m.c];
    if(t&&t.color!==p.color&&gs.pretreProtected&&gs.pretreProtected.has(t.color+':'+m.r+','+m.c))return false;
    return true;
  });
  return moves;
}

// ----------------------------------------------------------------
// LE SINGE : deux pas d'une case en diagonale, dans le même coup
// ----------------------------------------------------------------
// Premier pas sur une voisine en biais, second pas en biais depuis là — et il
// mange ce qu'il trouve à CHACUN des deux : deux pièces ennemies en un coup.
// Il ne revient jamais sur sa case de départ (ce serait un coup sans
// déplacement), et la case du premier pas doit être franchissable : vide, un
// reflet de son camp, ou une ennemie qu'il a le droit de prendre (ni le
// Monarque, ni un Garde ancré, ni une protégée du Prêtre).
//
// LE JOUEUR CHOISIT SON PREMIER PAS (voir « LE SINGE EN DEUX TEMPS »,
// js/game-render.js) : deux chemins menant à la même case sont donc deux coups
// distincts, que distingue `via` (la case du premier pas ; `viaCap` dit qu'on
// y mange). Le multijoueur et la relecture transmettent `via` avec le coup.
// Les coups sont rendus du chemin qui mange le PLUS au chemin qui mange le
// moins : un appelant qui ne connaît que les deux cases (prémouvement,
// ancienne relecture) tombe ainsi sur le meilleur des deux.
//
// L'INFECTÉ ARRÊTE LE SINGE : le manger au premier pas le tuerait sur place,
// le second pas n'aurait jamais lieu. Il ne peut donc le prendre qu'au second.
function singeViaRank(v,p){
  if(!v||v.color===p.color)return 0;
  if(v.pieceId==='reflet')return 1;
  const d=PIECES.find(x=>x.id===v.pieceId);
  return 2+((d&&d.value)||1);
}
function singeMoves(board,r,c,p,gs){
  const paths=[];
  for(const[d1r,d1c] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    const vr=r+d1r,vc=c+d1c;if(!inB(vr,vc))continue;
    const v=board[vr][vc];
    if(v&&v.color===p.color&&v.pieceId!=='reflet')continue;
    if(v&&v.color!==p.color){
      if(v.isKing||v.type==='k'||v.pieceId==='infecte')continue;
      if(gs&&gs.anchored&&gs.anchored.has(vr+','+vc))continue;
      if(gs&&gs.pretreProtected&&gs.pretreProtected.has(v.color+':'+vr+','+vc))continue;
    }
    const rank=singeViaRank(v,p);
    for(const[d2r,d2c] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nr=vr+d2r,nc=vc+d2c;
      if(!inB(nr,nc)||(nr===r&&nc===c))continue;
      if(!canLand(board[nr][nc],p))continue;
      paths.push({r:nr,c:nc,vr,vc,rank});
    }
  }
  paths.sort((a,b)=>b.rank-a.rank);
  return paths.map(m=>{const o={r:m.r,c:m.c,via:{r:m.vr,c:m.vc}};if(m.rank>0)o.viaCap=true;return o;});
}
// Le coup `m` est-il celui qu'on désigne par `to` ? Les deux cases, et le
// premier pas du Singe quand il est précisé.
function sameMove(m,to){
  if(m.r!==to.r||m.c!==to.c)return false;
  if(!to.via)return true;
  return !!m.via&&m.via.r===to.via.r&&m.via.c===to.via.c;
}

// ----------------------------------------------------------------
// LE REFLET DE L'ILLUSION, sur un plateau
// ----------------------------------------------------------------
// Après chaque coup de l'Illusion : son ancien reflet s'éteint, un nouveau se
// pose sur la case qu'elle vient de quitter. Le reflet retient l'identifiant
// de son Illusion (`owner`) : c'est ce qui limite chacune à un seul reflet et
// permet d'éteindre celui d'une Illusion prise (refletSweep).
function refletOwnerKey(p){return p.id||('illusion-'+p.color);}
function applyIllusionReflet(b,from,p){
  if(!p||p.pieceId!=='illusion')return;
  const owner=refletOwnerKey(p);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const t=b[r][c];
    if(t&&t.pieceId==='reflet'&&t.owner===owner)b[r][c]=null;
  }
  if(!b[from.r][from.c])
    b[from.r][from.c]={type:'x',color:p.color,pieceId:'reflet',emoji:'',hasMoved:true,isKing:false,
      owner,id:'rf-'+owner+'-'+from.r+from.c};
}
// Un reflet dont l'Illusion n'est plus sur le plateau s'éteint avec elle.
function refletSweep(b){
  const alive=new Set();let any=false;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const t=b[r][c];if(!t)continue;
    if(t.pieceId==='illusion')alive.add(refletOwnerKey(t));
    else if(t.pieceId==='reflet')any=true;
  }
  if(!any)return;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const t=b[r][c];
    if(t&&t.pieceId==='reflet'&&!alive.has(t.owner))b[r][c]=null;
  }
}

// ----------------------------------------------------------------
// LA CONTAGION DE L'INFECTÉ
// ----------------------------------------------------------------
// Qui mange l'Infecté meurt, et l'Infecté meurt de ce qu'il mange. Seule la
// PRISE contamine — la pièce qui se pose sur la case de l'autre —, pas l'orage
// du Typhon ni la charge de l'Éléphant, qui détruisent à distance. Un reflet
// n'est pas une pièce : le prendre ne contamine personne.
function infectionKills(mover,victim){
  if(!mover||!victim||victim.color===mover.color||victim.pieceId==='reflet')return false;
  return victim.pieceId==='infecte'||mover.pieceId==='infecte';
}

// ----------------------------------------------------------------
// LE BROUILLARD DE NYX
// ----------------------------------------------------------------
// Les huit cases autour d'une Nyx sont cachées au camp d'en face quand elles
// sont vides ou tenues par le camp de Nyx : il n'y voit que ses propres
// pièces. Ce n'est PAS une règle — le moteur, l'échec, le mat et l'IA
// raisonnent sur le plateau réel —, c'est ce que le joueur `viewer` a le droit
// de voir. Nyx prise, le brouillard se lève.
function nyxFogFor(board,viewer){
  const fog=new Set();
  if(!board)return fog;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const n=board[r]&&board[r][c];
    if(!n||n.pieceId!=='nyx'||n.color===viewer)continue;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc)continue;
      const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;
      const t=board[nr]&&board[nr][nc];
      if(!t||t.color===n.color)fog.add(nr+','+nc);
    }
  }
  return fog;
}
// L'OMBRE est invisible pour le camp d'en face, sauf pendant le demi-coup
// qui suit son propre déplacement : elle a bougé, on l'a vue passer, puis
// l'adversaire joue et elle disparaît de nouveau. executeGameMove note sur la
// pièce le numéro du demi-coup où elle a bougé (`_seenAt`) ; elle est visible
// tant que ce demi-coup est le dernier joué.
function ombreHiddenFor(board,viewer,turnCount){
  const hid=new Set();
  if(!board)return hid;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const t=board[r]&&board[r][c];
    if(t&&t.pieceId==='ombre'&&t.color!==viewer&&t._seenAt!==turnCount-1)hid.add(r+','+c);
  }
  return hid;
}
function ombreHiddenLive(gs,board){
  if(!gs||gs.gameOver||REPLAYING)return new Set();
  return ombreHiddenFor(board||gs.board,gs.playerColor||'w',gs.turnCount||0);
}
// Le brouillard à l'écran : seulement pendant une vraie partie en cours.
function nyxFogLive(gs,board){
  if(!gs||gs.gameOver||REPLAYING)return new Set();
  return nyxFogFor(board||gs.board,gs.playerColor||'w');
}

// ================================================================
// DÉTECTION D'ÉCHEC
// ================================================================
// Appelée une fois par coup CANDIDAT dans moveLeavesKingInCheck, donc des
// dizaines de milliers de fois par seconde pendant la recherche : elle rend la
// main dès qu'elle a trouvé le roi, au lieu de balayer les 64 cases à chaque
// appel pour retenir le dernier trouvé (il n'y en a jamais qu'un par camp).
function isInCheckSimple(color,board){
  for(let r=0;r<8;r++){
    const row=board[r];
    for(let c=0;c<8;c++){
      const p=row[c];
      if(p&&p.color===color&&(p.type==='k'||p.isKing))return isSquareAttackedSimple(r,c,color,board);
    }
  }
  return false;
}

// ----------------------------------------------------------------
// ENSEMBLES POUR LA DÉTECTION D'ÉCHEC
// ----------------------------------------------------------------
// CUSTOM_MOVE_IDS : pièces dont le déplacement/attaque N'EST PAS celui de
// leur pieceType de base. Elles ont une détection d'échec DÉDIÉE plus bas,
// donc le raccourci « attaque comme son pieceType » ne doit JAMAIS jouer
// pour elles, sinon la Banshee, le Typhon ou un Garde donneraient échec
// comme leur pieceType de base tout le long d'une ligne, ce qui est faux.
const CUSTOM_MOVE_IDS=new Set(['amazone','fourmi','preux-chevalier','dresseur-elephant','garde-pierre','meduse','typhon','banshee','pretre',
  'pegase','loup-geant','singe','illusion','reflet','nyx','infecte','ombre']);
// Pièces qui donnent échec en GLISSANT (portée illimitée). Le raccourci par
// pieceType (b/r/q) couvre en plus les pièces standard et promues.
const DIAG_SLIDER_IDS=new Set(['fou-primordial','amazone','dame','grand-maitre']);
const ORTHO_SLIDER_IDS=new Set(['tour-primordiale','chevaucheur-rhinoceros','dame','grand-maitre']);
// Pièces qui donnent échec par un saut de cavalier.
const KNIGHT_ATK_IDS=new Set(['cavalier-primordial','amazone','chevaucheur-rhinoceros','grand-maitre','nyx']);
// Pièces qui donnent échec sur une case adjacente (8 directions, 1 case).
const KING_ADJ_IDS=new Set(['roi','garde-pierre','nyx']);

function isSquareAttackedSimple(tr,tc,defColor,board){
  const atk=opp(defColor);
  // --- Cavaliers (saut) ---
  for(const[dr,dc] of[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]]){
    const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];
    if(p&&p.color===atk&&(KNIGHT_ATK_IDS.has(p.pieceId)||(!CUSTOM_MOVE_IDS.has(p.pieceId)&&p.type==='n')))return true;
  }
  // --- Glisseurs orthogonaux (tour / dame) ---
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){
    let r=tr+dr,c=tc+dc;
    while(inB(r,c)){
      const p=board[r][c];
      if(p&&p.pieceId==='reflet'&&p.color===atk){r+=dr;c+=dc;continue;}
      if(p){if(p.color===atk&&(ORTHO_SLIDER_IDS.has(p.pieceId)||(!CUSTOM_MOVE_IDS.has(p.pieceId)&&(p.type==='r'||p.type==='q'))))return true;break;}
      r+=dr;c+=dc;
    }
  }
  // --- Glisseurs diagonaux (fou / dame) ---
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    let r=tr+dr,c=tc+dc;
    while(inB(r,c)){
      const p=board[r][c];
      if(p&&p.pieceId==='reflet'&&p.color===atk){r+=dr;c+=dc;continue;}
      if(p){if(p.color===atk&&(DIAG_SLIDER_IDS.has(p.pieceId)||(!CUSTOM_MOVE_IDS.has(p.pieceId)&&(p.type==='b'||p.type==='q'))))return true;break;}
      r+=dr;c+=dc;
    }
  }
  // --- Roi / pièces à portée 1 case dans les 8 directions (Garde de Pierre) ---
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];
    if(p&&p.color===atk&&(p.type==='k'||p.isKing||KING_ADJ_IDS.has(p.pieceId)))return true;
  }
  // --- Pions standard (capture diagonale vers l'avant) ---
  const pawnDir=defColor==='w'?-1:1;
  for(const dc of[-1,1]){const r=tr+pawnDir,c=tc+dc;if(inB(r,c)){const p=board[r][c];if(p&&p.color===atk&&!CUSTOM_MOVE_IDS.has(p.pieceId)&&(p.type==='p'||p.pieceId==='std-pawn'))return true;}}
  // --- Fourmi : avance ortho + diagonale d'1 case (capture comprise) ---
  // atkFwdDir = décalage entre la case cible et la Fourmi (inverse de son avance).
  {const atkFwdDir=atk==='w'?1:-1;
  {const r=tr+atkFwdDir,c=tc;if(inB(r,c)){const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='fourmi')return true;}}
  for(const dc of[-1,1]){const r=tr+atkFwdDir,c=tc+dc;if(inB(r,c)){const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='fourmi')return true;}}}
  // --- Typhon : 1 case en diagonale ---
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='typhon')return true;}
  // --- Banshee : 1 OU 2 cases en diagonale (les 2 cases sans sauter) ---
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='banshee')return true;}
  for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const midR=tr+dr/2,midC=tc+dc/2;if(!inB(midR,midC)||barsPath(board[midR][midC],atk))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='banshee')return true;}
  // --- Preux Chevalier : 2 ortho (chemin libre) OU 1 diagonale ---
  for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const mr=tr+dr/2,mc_=tc+dc/2;if(barsPath(board[mr][mc_],atk))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='preux-chevalier')return true;}
  for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='preux-chevalier')return true;}
  // --- Éléphant de guerre : 1 ou 2 cases ortho (2 = charge, bloquée
  //     seulement par une pièce alliée à mi-chemin) ---
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='dresseur-elephant')return true;}
  for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(!(p&&p.color===atk&&p.pieceId==='dresseur-elephant'))continue;const midR=tr+dr/2,midC=tc+dc/2;if(board[midR][midC]&&board[midR][midC].color===atk&&board[midR][midC].pieceId!=='reflet')continue;return true;}
  // --- Prêtre : 1 ou 2 cases ortho (chemin libre pour 2) ---
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='pretre')return true;}
  for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const mr=tr+dr/2,mc_=tc+dc/2;if(barsPath(board[mr][mc_],atk))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='pretre')return true;}
  // --- Méduse : 1 case orthogonale ---
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='meduse')return true;}
  // --- Pégase : bond de 3 + 1 ---
  for(const[dr,dc] of[[3,1],[3,-1],[-3,1],[-3,-1],[1,3],[-1,3],[1,-3],[-1,-3]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='pegase')return true;}
  // --- Infecté : bond de 2 cases, tout droit ou en diagonale ---
  for(const[dr,dc] of[[2,0],[-2,0],[0,2],[0,-2],[2,2],[2,-2],[-2,2],[-2,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='infecte')return true;}
  // --- Ombre : 1 ou 2 cases en ligne droite (chemin libre pour 2) ---
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1]]){
    let r=tr+dr,c=tc+dc;if(!inB(r,c))continue;
    let p=board[r][c];if(p&&p.color===atk&&p.pieceId==='ombre')return true;
    if(barsPath(p,atk))continue;
    r+=dr;c+=dc;if(!inB(r,c))continue;
    p=board[r][c];if(p&&p.color===atk&&p.pieceId==='ombre')return true;
  }
  // --- Loup Géant : bond de 2 cases en diagonale ---
  for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='loup-geant')return true;}
  // --- Illusion : 1 case tout droit ou en biais, 2 en biais chemin libre ---
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='illusion')return true;}
  for(const[dr,dc] of[[2,2],[2,-2],[-2,2],[-2,-2]]){const r=tr+dr,c=tc+dc;if(!inB(r,c))continue;if(barsPath(board[tr+dr/2][tc+dc/2],atk))continue;const p=board[r][c];if(p&&p.color===atk&&p.pieceId==='illusion')return true;}
  // --- Singe : son premier pas OU son second peut tomber sur la case ---
  // Premier pas : il est en biais contre elle. Second pas : il est à deux
  // pas de biais, par une case V franchissable pour LUI (vide, son propre
  // reflet, ou une pièce du camp attaqué qu'il mangerait en passant).
  for(const[d1r,d1c] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    const vr=tr+d1r,vc=tc+d1c;if(!inB(vr,vc))continue;
    const v=board[vr][vc];
    if(v&&v.color===atk&&v.pieceId==='singe')return true;
    if(v&&v.color===atk&&v.pieceId!=='reflet')continue;
    if(v&&v.color!==atk&&(v.isKing||v.type==='k'))continue;
    for(const[d2r,d2c] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
      const mr=vr+d2r,mc=vc+d2c;if(!inB(mr,mc)||(mr===tr&&mc===tc))continue;
      const m=board[mr][mc];if(m&&m.color===atk&&m.pieceId==='singe')return true;
    }
  }

  return false;
}

function getLegalMovesKingFiltered(board,r,c,gs,moves){
  const p=board[r][c];if(!p)return moves;
  const isKingPiece=p.type==='k'||p.isKing||p.pieceId==='roi';
  if(!isKingPiece)return moves;
  return moves.filter(m=>{
    for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const tr=m.r+dr,tc=m.c+dc;if(!inB(tr,tc))continue;const t=board[tr][tc];if(t&&t.color!==p.color&&t.pieceId==='typhon')return false;}
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=m.r+dr,nc=m.c+dc;if(!inB(nr,nc))continue;const t=board[nr][nc];if(t&&t.color!==p.color&&(t.type==='k'||t.isKing))return false;}
    return true;
  });
}

function moveLeavesKingInCheck(board,fromR,fromC,move,color,anchored){
  if(move.stayPut)return false;
  const b=cloneBoard(board);const p=b[fromR][fromC];if(!p)return false;
  const victim=b[move.r][move.c];
  if(move.ep){const pr=move.r+(color==='w'?1:-1);b[pr][move.c]=null;}
  if(move.castle){if(move.castle==='K'){b[fromR][5]=b[fromR][7];b[fromR][7]=null;}if(move.castle==='Q'){b[fromR][3]=b[fromR][0];b[fromR][0]=null;}}
  b[move.r][move.c]={...p,hasMoved:true};b[fromR][fromC]=null;
  // Les pouvoirs qui effacent ou repoussent une pièce font partie du coup :
  // les ignorer ici, c'était refuser une parade parfaitement valable.
  applyCollateralOnBoard(b,{r:fromR,c:fromC},move,p,anchored,victim);
  return isInCheckSimple(color,b);
}

function getLegalMoves(board,r,c,gs){
  const p=board[r][c];if(!p)return[];
  let raw=generateMovesRaw(board,r,c,gs);
  raw=getLegalMovesKingFiltered(board,r,c,gs,raw);
  const anchored=gs&&gs.anchored;
  return raw.filter(m=>!moveLeavesKingInCheck(board,r,c,m,p.color,anchored));
}

function hasLegalMovesForColor(color,board,gs){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.color===color&&getLegalMoves(board,r,c,gs).length>0)return true;}
  return false;
}

// ================================================================
// MISES À JOUR DES ÉTATS SPÉCIAUX (à appeler après chaque coup)
// ================================================================
function updateMedusaParalysis(board,gs){
  // L'ensemble PRÉCÉDENT est retenu le temps du recalcul : la pétrification
  // ne se voit qu'à l'INSTANT où elle tombe. L'état, lui, est déjà porté en
  // permanence par la pièce elle-même (.pc-para : gris et halo violet, voir
  // js/game-render.js) — rejouer l'éclat à chaque coup ferait clignoter la
  // moitié du plateau tant qu'une Méduse tient sa diagonale.
  const before=gs.medusaParalyzed||new Set();
  gs.medusaParalyzed=new Set();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.pieceId==='meduse'){for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nr=r+dr,nc=c+dc;if(inB(nr,nc)&&board[nr][nc]&&board[nr][nc].color!==p.color)gs.medusaParalyzed.add(`${nr},${nc}`);}}}
  if(typeof fxPower==='function'){
    gs.medusaParalyzed.forEach(k=>{
      if(before.has(k))return;
      const rc=k.split(',');
      fxPower('meduse',+rc[0],+rc[1]);
    });
  }
}
// Clés de la forme « <couleur protégée>:<r>,<c> » : le Prêtre couvre ses
// ALLIÉES en diagonale, et elles seules. Le Monarque en est exclu — le rendre
// imprenable rendrait le mat impossible, ce qui n'est pas un pouvoir mais une
// fin de partie supprimée.
function updatePretreProtection(board,gs){
  gs.pretreProtected=new Set();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(!p||p.pieceId!=='pretre')continue;
    for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nr=r+dr,nc=c+dc;if(!inB(nr,nc))continue;
      const t=board[nr][nc];
      if(!t||t.color!==p.color)continue;
      if(t.isKing||t.type==='k'||t.pieceId==='reflet')continue;
      gs.pretreProtected.add(t.color+':'+nr+','+nc);
    }
  }
}
function updateGrandMaitre(board,gs){
  gs.grandMaitreAlive={w:false,b:false};
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.pieceId==='grand-maitre')gs.grandMaitreAlive[p.color]=true;}
}
function applyTyphonEffect(toR,toC,board,p,gs){
  if(p.pieceId!=='typhon')return;
  for(const[dr,dc] of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nr=toR+dr,nc=toC+dc;if(!inB(nr,nc))continue;const t=board[nr][nc];
    if(t&&t.color!==p.color&&!gs.anchored?.has(`${nr},${nc}`)&&!(t.isKing||t.type==='k')){pushCaptured(gs,t);board[nr][nc]=null;}
  }
}
// ----------------------------------------------------------------
// HURLEMENT DE LA BANSHEE
// ----------------------------------------------------------------
// Après son déplacement, chaque PION ennemi posé sur l'une des huit cases
// adjacentes recule d'une case, si celle qui est derrière lui est libre.
//
// IL NE FONCTIONNAIT PAS, pour deux raisons. Il ne regardait qu'UNE rangée, et
// c'était celle DERRIÈRE la Banshee : `oppDir` valait +1 pour les Blancs, qui
// avancent pourtant vers r décroissant — donc la seule ligne où un pion adverse
// ne se trouve jamais. Et il prenait pour des pions toutes les pièces de
// pieceType 'p', c'est-à-dire aussi la Fourmi, la Méduse et le Garde de Pierre.
//
// Les reculs sont RELEVÉS D'ABORD, appliqués ensuite : une pièce repoussée
// atterrit parfois sur une autre case voisine de la Banshee, et serait
// repoussée une seconde fois par la même itération.
function applyBansheePush(board,toR,toC,color){
  const pushes=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;
    const nr=toR+dr,nc=toC+dc;if(!inB(nr,nc))continue;
    const t=board[nr][nc];
    if(!t||t.color===color||!isTruePawn(t))continue;
    const br=nr+(t.color==='w'?1:-1);
    if(inB(br,nc)&&!board[br][nc])pushes.push({fr:nr,fc:nc,tr:br,tc:nc});
  }
  pushes.forEach(m=>{
    if(!board[m.fr][m.fc]||board[m.tr][m.tc])return;
    board[m.tr][m.tc]=board[m.fr][m.fc];board[m.fr][m.fc]=null;
  });
}
function applyBansheeEffect(toR,toC,board,p){
  if(p.pieceId!=='banshee')return;
  applyBansheePush(board,toR,toC,p.color);
}
// ----------------------------------------------------------------
// DÉGÂTS COLLATÉRAUX SUR UN PLATEAU SIMULÉ
// ----------------------------------------------------------------
// Mêmes effets que applyTyphonEffect / applyChargeEffect /
// applyBansheeEffect, mais sur un plateau NU : rien n'est inscrit dans les
// listes de pièces capturées, aucun état de partie n'est touché. C'est ce
// dont ont besoin les deux endroits qui SIMULENT un coup sans le jouer :
//
//   - moveLeavesKingInCheck : sans cela, « j'efface au Typhon la pièce qui me
//     met en échec » était jugé illégal, parce que la simulation déplaçait le
//     Typhon sans appliquer sa destruction — le roi restait donc en échec sur
//     le plateau simulé. Idem pour la charge de l'Éléphant de guerre.
//   - applyMoveQuick (js/ai-engine.js) : la recherche voyait ces coups comme
//     de simples déplacements et ne découvrait leurs effets qu'une fois joués,
//     donc l'IA n'a jamais joué un Typhon POUR ce qu'il fait.
//
// anchored (facultatif) : cases d'un Garde de Pierre ancré, imprenables.
// victim  (facultatif) : ce qui occupait la case d'arrivée AVANT le coup. Sert
//          seulement à savoir si une Illusion vient d'être prise, pour
//          éteindre son reflet.
//
// Le second pas du Singe (`via`) et le reflet de l'Illusion sont traités ici
// pour la même raison que la charge ou l'orage : ils font partie du coup.
function applyCollateralOnBoard(b,from,to,p,anchored,victim){
  let illusionDown=!!(victim&&victim.pieceId==='illusion'&&victim.color!==p.color);
  const hits=(t,r,c)=>{
    const h=t&&t.color!==p.color&&!(t.isKing||t.type==='k')&&!(anchored&&anchored.has(r+','+c));
    if(h&&t.pieceId==='illusion')illusionDown=true;
    return h;
  };
  if(to.via&&hits(b[to.via.r][to.via.c],to.via.r,to.via.c))b[to.via.r][to.via.c]=null;
  if(to.destroysPath){
    const fr=(to.fromR!==undefined)?to.fromR:from.r,fc=(to.fromC!==undefined)?to.fromC:from.c;
    const dr=Math.sign(to.r-fr),dc=Math.sign(to.c-fc);
    let nr=fr+dr,nc=fc+dc;
    while(inB(nr,nc)&&(nr!==to.r||nc!==to.c)){
      if(hits(b[nr][nc],nr,nc))b[nr][nc]=null;
      nr+=dr;nc+=dc;
    }
  }
  if(p.pieceId==='typhon'){
    for(const[dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nr=to.r+dr,nc=to.c+dc;
      if(!inB(nr,nc))continue;
      if(hits(b[nr][nc],nr,nc))b[nr][nc]=null;
    }
  }
  if(p.pieceId==='banshee')applyBansheePush(b,to.r,to.c,p.color);
  if(p.pieceId==='illusion')applyIllusionReflet(b,from,p);
  if(infectionKills(p,victim)&&b[to.r][to.c]&&b[to.r][to.c].color===p.color){
    b[to.r][to.c]=null;
    if(p.pieceId==='illusion')illusionDown=true;
  }
  if(illusionDown)refletSweep(b);
  return b;
}

function applyChargeEffect(move,board,p,gs){
  if(!move.destroysPath)return;
  const dr=Math.sign(move.r-move.fromR),dc=Math.sign(move.c-move.fromC);
  let nr=move.fromR+dr,nc=move.fromC+dc;
  while(nr!==move.r||nc!==move.c){
    const t=board[nr][nc];
    if(t&&t.color!==p.color&&!gs.anchored?.has(`${nr},${nc}`)&&!(t.isKing||t.type==='k')){
      pushCaptured(gs,t);
      board[nr][nc]=null;
    }
    nr+=dr;nc+=dc;
  }
}

// La colonne de lumière d'une promotion (js/combat-fx.js). Trois chemins
// mènent à une promotion — reçue d'un adversaire en ligne, choisie par l'IA,
// choisie par le joueur dans sa fenêtre — et ils n'ont en commun que la case
// et le plateau : d'où ce guichet, plutôt que trois fois la même précaution.
// La créature est lue APRÈS coup sur le plateau, parce que c'est elle qui
// donne sa couleur à l'effet, et pas le pion qu'elle vient de remplacer.
// ----------------------------------------------------------------
// LA SIGNATURE D'UNE CRÉATURE QUI VIENT DE JOUER
// ----------------------------------------------------------------
// fxPlayMove (js/combat-fx.js) reçoit déjà le coup et ses trois pouvoirs
// DESTRUCTEURS — la charge, l'orage, le hurlement —, qui ont en commun de
// faire disparaître quelque chose. Les trois qui suivent ne détruisent rien,
// et c'est pour cela qu'ils n'avaient aucune image : ils changent une RÈGLE.
//
// Un pouvoir qui change une règle sans rien montrer n'est pas discret, il est
// absent : le joueur d'en face voit ses pions refuser d'avancer de deux cases
// et n'a aucun moyen de relier ce refus au Grand Maître posé six cases plus
// loin. Chacun reçoit donc son geste, à l'instant où il prend effet.
//
// Appelé APRÈS fxPlayMove pour que la signature se pose par-dessus la traînée
// du coup, et jamais l'inverse.
function fxCreatureSignature(p,to,board,gs){
  if(typeof fxPower!=='function'||!p)return;
  switch(p.pieceId){
    // FOI INÉBRANLABLE : le dôme s'ouvre là où le Prêtre se pose. Les alliées
    // qu'il couvre portent leur liseré en permanence (.pc-warded,
    // js/game-render.js) : ici l'ÉVÉNEMENT, là-bas l'ÉTAT.
    // FOI INÉBRANLABLE : le dôme ne s'ouvre QUE s'il couvre quelqu'un. Posé à
    // chacun des coups du Prêtre, cet effet d'une seconde pleine — le plus long
    // du jeu — se déclencherait sur des déplacements qui ne protègent
    // personne, et l'œil cesserait de le lire au troisième. C'est la leçon
    // déjà tirée sur la prise en main (js/combat-fx.js) : un effet fréquent
    // doit être plus discret, ou plus rare. Celui-ci sera plus rare.
    case 'pretre':{
      let couvre=false;
      for(const[dr,dc] of[[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nr=to.r+dr,nc=to.c+dc;
        if(!inB(nr,nc))continue;
        const t=board[nr][nc];
        if(t&&t.color===p.color&&!(t.isKing||t.type==='k')){couvre=true;break;}
      }
      if(couvre)fxPower('foi',to.r,to.c);
      break;
    }
    // DOMINATION : UNE SEULE FOIS PAR PARTIE, et c'est tout le raisonnement.
    // La Domination est vraie tant que le Grand Maître vit — c'est un état,
    // porté en permanence par la pièce (.pc-dominant). En rejouer l'onde à
    // chacun de ses coups reviendrait à annoncer une nouvelle à chaque fois
    // qu'on la répète : au troisième coup, on ne la lit plus. Elle est donc
    // posée au premier coup du Grand Maître, là où le joueur d'en face
    // découvre à qui il a affaire, et plus jamais ensuite.
    case 'grand-maitre':
      if(!p._dominShown){p._dominShown=true;fxPower('domination',to.r,to.c);}
      break;
  }
}

function fxPromoteAt(board,to){
  if(typeof fxPromote!=='function'||REPLAYING)return;
  const np=board&&board[to.r]&&board[to.r][to.c];
  fxPromote(to.r,to.c,np&&np.pieceId);
}

// ================================================================
// EXÉCUTION D'UN COUP : cœur du moteur, tous les effets spéciaux
// ================================================================
function executeGameMove(from,to,gs){
  const b=gs.board;const p=b[from.r][from.c];if(!p)return;
  gs.singeVia=null;   // un Singe à mi-chemin (js/game-render.js) : le coup part, l'étape s'efface
  const snapshot={board:cloneBoard(b),turn:gs.turn,enPassant:gs.enPassant,halfmoveClock:gs.halfmoveClock,movePairs:JSON.parse(JSON.stringify(gs.movePairs)),capturedW:[...gs.capturedW],capturedB:[...gs.capturedB],anchored:new Set(gs.anchored||[]),grandMaitreAlive:{...gs.grandMaitreAlive},turnCount:gs.turnCount,timeWhite:gs.timeWhite,timeBlack:gs.timeBlack,replay:(gs.replay||[]).slice()};
  gs.history.push(snapshot);gs.historyView=null;
  // L'Ombre qui bouge se montre pour ce demi-coup-ci (ombreHiddenFor).
  if(p.pieceId==='ombre')p._seenAt=gs.turnCount||0;

  let captured=null;
  if(to.ep){const pr=to.r+(p.color==='w'?1:-1);captured=b[pr][to.c];if(captured)pushCaptured(gs,captured);b[pr][to.c]=null;}
  else{
    captured=b[to.r][to.c];
    // Se poser sur SON reflet le dissipe : ce n'est pas une prise.
    if(captured&&captured.color===p.color&&captured.pieceId==='reflet')captured=null;
    if(captured)pushCaptured(gs,captured);
  }
  // LE PREMIER PAS DU SINGE : ce qu'il mange en passant (voir singeMoves).
  let viaCaptured=null;
  if(to.via){
    const v=b[to.via.r][to.via.c];
    if(v&&v.color!==p.color&&!(v.isKing||v.type==='k')){viaCaptured=v;pushCaptured(gs,v);b[to.via.r][to.via.c]=null;}
  }

  if(to.castle){if(to.castle==='K'){b[from.r][5]=b[from.r][7];b[from.r][7]=null;if(b[from.r][5])b[from.r][5].hasMoved=true;}if(to.castle==='Q'){b[from.r][3]=b[from.r][0];b[from.r][0]=null;if(b[from.r][3])b[from.r][3].hasMoved=true;}}

  b[to.r][to.c]=p;b[from.r][from.c]=null;p.hasMoved=true;

  if(to.destroysPath)applyChargeEffect(to,b,p,gs);
  applyTyphonEffect(to.r,to.c,b,p,gs);
  applyBansheeEffect(to.r,to.c,b,p);
  // L'Illusion laisse son reflet sur la case qu'elle quitte ; une Illusion
  // prise (par n'importe quel chemin : prise, orage, charge, Singe) emporte
  // le sien.
  applyIllusionReflet(b,from,p);
  // LA CONTAGION : la pièce qui vient de manger l'Infecté — ou l'Infecté qui
  // vient de manger — meurt sur la case de sa prise.
  const contagion=infectionKills(p,captured)&&b[to.r][to.c]===p;
  if(contagion){pushCaptured(gs,p);b[to.r][to.c]=null;}
  refletSweep(b);

  // ---- LES EFFETS SPÉCIAUX (js/combat-fx.js) --------------------------
  // UN SEUL APPEL, ET LE MOTEUR N'EN SAIT PAS PLUS. On décrit ce qui vient
  // d'arriver — d'où, vers où, avec quoi, sur qui, sous quel pouvoir — et le
  // module d'effets décide de ce que ça donne à l'écran. Le moteur n'a donc
  // aucune notion de traînée, de vortex ni de voile, et le module aucune
  // notion de règle : on peut retirer sa balise <script> d'index.html, tout
  // continue de marcher, en plus terne.
  //
  // C'est posé ICI et non à la fin de la fonction parce que la promotion
  // ouvre une fenêtre modale et RETOURNE (voir plus bas) : les effets du coup
  // qui promeut seraient perdus.
  // LE BROUILLARD NE LAISSE PAS PASSER LA TRAÎNÉE. Une pièce adverse qui entre
  // dans le brouillard de Nyx (ou en sort) ne dessine pas son chemin : il
  // dirait où elle est.
  const fogNow=nyxFogLive(gs,b);
  const hiddenMove=p.color!==(gs.playerColor||'w')&&(fogNow.has(to.r+','+to.c)||fogNow.has(from.r+','+from.c));
  if(typeof fxPlayMove==='function'&&!REPLAYING&&!hiddenMove){
    // La prise en passant se joue sur une case que le pion N'ATTEINT PAS :
    // l'éclat doit tomber sur la victime, une rangée derrière, sinon il
    // s'allume sur une case où il ne s'est rien passé.
    const capAt=to.ep?{r:to.r+(p.color==='w'?1:-1),c:to.c}:{r:to.r,c:to.c};
    const power=to.destroysPath?'charge'
      :(p.pieceId==='typhon'?'typhon'
      :(p.pieceId==='banshee'?'banshee':null));
    let rook=null,rookPieceId=null;
    // Le roque déplace DEUX pièces : sans la seconde traînée, le coup se lit
    // comme un déplacement de roi et la tour semble s'être téléportée.
    if(to.castle==='K'){rook={from:{r:from.r,c:7},to:{r:from.r,c:5}};rookPieceId=b[from.r][5]&&b[from.r][5].pieceId;}
    else if(to.castle==='Q'){rook={from:{r:from.r,c:0},to:{r:from.r,c:3}};rookPieceId=b[from.r][3]&&b[from.r][3].pieceId;}
    fxPlayMove({
      from:{r:from.r,c:from.c},to:{r:to.r,c:to.c},capAt:capAt,
      pieceId:p.pieceId,captured:captured?captured.pieceId:null,
      castle:to.castle||null,rook:rook,rookPieceId:rookPieceId,power:power,
    });
    if(viaCaptured&&typeof fxImpact==='function')fxImpact(to.via.r,to.via.c,viaCaptured.pieceId);
    // Les pouvoirs qui ne détruisent rien mais changent une règle : le dôme du
    // Prêtre, la Domination du Grand Maître.
    if(!REPLAYING)fxCreatureSignature(p,to,b,gs);
  }

  gs.enPassant=null;
  if(p.pieceId==='std-pawn'&&Math.abs(to.r-from.r)===2)gs.enPassant={r:(to.r+from.r)/2,c:from.c};
  if(!captured&&viaCaptured)captured=viaCaptured;
  gs.halfmoveClock=(p.type==='p'||captured)?0:gs.halfmoveClock+1;

  // LE PION ET LA FOURMI se promeuvent en atteignant la dernière rangée (voir
  // PROMOTING_IDS, js/data-pieces.js). Ni l'un ni l'autre ne recule : la
  // rangée 0 est forcément celle des Blancs, la 7 celle des Noirs.
  const isPawnPromo=!contagion&&pieceCanPromote(p.pieceId)&&(to.r===0||to.r===7);
  if(isPawnPromo){
    const aiCol=gs.aiColor||'b';
    // Promotion imposée : coup reçu d'un adversaire en ligne, qui a déjà
    // choisi sa pièce. On l'applique telle quelle, sans modal ni évaluation
    // IA, pour que les deux plateaux restent identiques.
    if(gs._forcedPromo){
      const opt=gs._forcedPromo;gs._forcedPromo=null;
      b[to.r][to.c]={...p,type:opt.type,emoji:opt.emoji,pieceId:opt.pieceId};
      playSound('promo');fxPromoteAt(b,to);recordMove(p,to,!!captured,gs,from);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);
    }
    else if(p.color===aiCol&&!gs.multiplayer){
      // L'IA choisit la meilleure pièce de son armée via évaluation rapide
      // Même exclusion que pour le joueur : une promotion en Fourmi ne serait
      // qu'une promotion reportée d'un coup.
      const aiExtras=(gs.aiArmy?.extras||[]).map(id=>PIECES.find(x=>x.id===id))
        .filter(x=>x&&!pieceCanPromote(x.id));
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
      playSound('promo');fxPromoteAt(b,to);recordMove(p,to,!!captured,gs,from);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);
    }
    else{gs.pendingPromo={from,to,p};showPromoModal(gs);return;}
  }else{
    // Son du déplacement normal
    // L'INTENSITÉ SUIT LA VALEUR DE LA PIÈCE PRISE. Prendre un pion et
    // prendre le Grand Maître (13 points) produisaient exactement le même
    // bruit : le moment le plus satisfaisant d'une partie d'échecs ne disait
    // rien de ce qui venait de se passer. sfxCaptureForce (js/sfx.js) en
    // tire un chiffre de 0,28 à 1 qui déplace ensemble le volume, la
    // hauteur, la brillance, la vibration et la secousse du plateau.
    if(to.castle)playSound('castle');
    else if(captured)playSound('capture',{force:(typeof sfxCaptureForce==='function')?sfxCaptureForce(captured.pieceId):0.5});
    else playSound('move');
    // Enregistrer le coup dans l'historique de positions (pour détecter les allers-retours IA)
    gs.lastMoveHistory=gs.lastMoveHistory||[];
    gs.lastMoveHistory.push({piece:p.id,fromR:from.r,fromC:from.c,toR:to.r,toC:to.c,color:p.color});
    if(gs.lastMoveHistory.length>8)gs.lastMoveHistory.shift();
    recordMove(p,to,!!captured,gs,from);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);
  }
}

// ================================================================
// AUDIO ENGINE : Web Audio API, aucun fichier externe
// ================================================================
let _audioCtx=null;
let _soundEnabled=true;
// Volume des bruitages, 0 à 1. Déclaré ICI et non dans settings-admin.js :
// playTone() en a besoin, et une variable `let` d'un autre script serait dans
// sa zone morte tant que ce script n'a pas été exécuté. Le curseur des
// réglages ne fait plus que l'écrire.
let _sfxVol=1;

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
  // Le curseur « Bruitages » ne faisait que couper le son à zéro : entre 10 %
  // et 100 % tous les bruitages sortaient au même volume.
  const vol=Math.max(0.0001,(volume||0.35)*_sfxVol);
  gain.gain.setValueAtTime(vol,ctx.currentTime);
  if(fadeOut)gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration);
  osc.start(ctx.currentTime);osc.stop(ctx.currentTime+duration);
}

// ----------------------------------------------------------------
// LE POINT D'ENTRÉE UNIQUE DES BRUITAGES
// ----------------------------------------------------------------
// playSound() était un empilement de playTone() : une sinusoïde à 440 Hz
// pour un déplacement, deux dents de scie pour une capture. Des bips. Le
// moteur vit maintenant dans js/sfx.js — couches, enveloppes, bruit filtré,
// variation de hauteur, ducking de la musique et retour haptique — et cette
// fonction n'est plus que le guichet qui y mène.
//
// ELLE GARDE SON NOM ET SA SIGNATURE : une centaine d'appels y mènent depuis
// tout le jeu, et aucun n'a eu à changer. Le second argument est nouveau et
// facultatif : {force} 0..1 dit la VIOLENCE de l'événement (prendre un pion
// n'est pas prendre le Grand Maître), {shakeEl} l'élément à faire trembler.
//
// Le repli sur playTone() n'est pas décoratif : si js/sfx.js ne s'est pas
// chargé, le jeu doit rester jouable avec du son plutôt que muet.
function playSound(type,opts){
  if(!_soundEnabled||REPLAYING)return;
  if(typeof sfxFeel==='function'){sfxFeel(type,opts);return;}
  const ctx=getAudioCtx();if(!ctx)return;
  playTone(type==='capture'?180:440,'sine',0.08,0.3,true);
}

function initAudioOnInteraction(){
  document.addEventListener('click',()=>{getAudioCtx();},{once:true});
  document.addEventListener('touchstart',()=>{getAudioCtx();},{once:true,passive:true});
}
initAudioOnInteraction();

// ================================================================
// POST-COUP : enchaîne mise à jour d'états spéciaux + rendu + tour IA
// (renderGame/updateStatus sont définis dans game-render.js ;
//  doAIMove est défini dans ai-engine.js)
// ================================================================
function postMoveUpdate(gs){
  updateMedusaParalysis(gs.board,gs);updatePretreProtection(gs.board,gs);updateGrandMaitre(gs.board,gs);
  // RELECTURE : on recalcule les états spéciaux (fait juste au-dessus) et on
  // note l'échec ou le mat dans la notation — c'est tout. Pas de barre de
  // statut, pas de rendu, pas de fin de partie, pas de coup d'IA : la partie
  // est finie depuis longtemps, on ne fait que la relire.
  if(REPLAYING){
    if(typeof isInCheckSimple==='function'&&typeof hasLegalMovesForColor==='function'){
      const t=gs.turn;
      const check=isInCheckSimple(t,gs.board);
      const libre=hasLegalMovesForColor(t,gs.board,gs);
      if(typeof markLastMove==='function')markLastMove(gs,(!libre&&check)?'#':check?'+':'');
    }
    return;
  }
  updateStatus(gs);renderGame(gs);
  const aiCol=gs.aiColor||'b';
  if(gs.turn===aiCol&&!gs.multiplayer&&!gs.gameOver&&!gs.pendingPromo)setTimeout(()=>doAIMove(gs),500);
  // LE PRÉMOUVEMENT PART D'ICI, et de nulle part ailleurs : c'est le seul
  // point qui voit TOUS les coups — le nôtre, celui de l'IA, celui d'un
  // adversaire en ligne — et donc le seul qui sache que le trait vient de
  // nous revenir (js/game-render.js, section « LE PRÉMOUVEMENT »).
  if(typeof premoveRun==='function')premoveRun(gs);
}

// ================================================================
// PROMOTION DU PION (joueur humain) : inclut le Général + les pièces de l'armée
// ================================================================
function showPromoModal(gs){
  const modal=document.getElementById('promo-modal');const box=document.getElementById('promo-box');
  modal.querySelector('.promo-title').textContent='Choisir la promotion';modal.classList.add('active');
  // ON NE SE PROMEUT PAS EN QUELQUE CHOSE QUI SE PROMEUT. La Fourmi arrive sur
  // la dernière rangée et devient autre chose (PROMOTING_IDS,
  // js/data-pieces.js) : la choisir ici donnerait une pièce qui n'attend que
  // de se promouvoir à son tour, sur la case où elle vient de naître. Une
  // armée qui n'aligne QUE des créatures de ce genre retombe sur les quatre
  // pièces standard, plutôt que sur une fenêtre vide.
  const armyPieces=(gs.playerArmy?.extras||[]).map(id=>PIECES.find(p=>p.id===id))
    .filter(p=>p&&!pieceCanPromote(p.id));
  const genPiece=gs.playerArmy?.gen?.id?PIECES.find(p=>p.id===gs.playerArmy.gen.id):null;
  const stdPieces=[{type:'q',emoji:'♕',label:'Dame',pieceId:'dame-promo'},{type:'r',emoji:'♖',label:'Tour',pieceId:'tour-promo'},{type:'b',emoji:'♗',label:'Fou',pieceId:'fou-promo'},{type:'n',emoji:'♘',label:'Cavalier',pieceId:'cav-promo'}];
  let options;
  if(armyPieces.length>0){
    options=armyPieces.map(p=>({type:p.pieceType||'q',emoji:p.emoji,label:p.name,pieceId:p.id}));
    // Ajouter aussi le Général si pas déjà dedans
    if(genPiece&&!options.find(o=>o.pieceId===genPiece.id))options.push({type:genPiece.pieceType||'q',emoji:genPiece.emoji,label:genPiece.name,pieceId:genPiece.id});
  }else options=stdPieces;
  const pcol=gs.playerColor||'w';
  box.innerHTML=options.map((pp,i)=>'<div class="promo-piece" data-idx="'+i+'" title="'+pp.label+'">'+
    pieceSVG(pp.pieceId,pcol)+'<span class="promo-piece-lbl">'+pp.label+'</span></div>').join('');
  box.querySelectorAll('.promo-piece').forEach((el,i)=>{el.addEventListener('click',()=>{
    const opt=options[i];const{from,to,p}=gs.pendingPromo;
    gs.board[to.r][to.c]={...p,type:opt.type,emoji:opt.emoji,pieceId:opt.pieceId};
    gs.pendingPromo=null;modal.classList.remove('active');playSound('promo');
    fxPromoteAt(gs.board,to);
    // Règle d'économie : une promotion CRÉE un exemplaire de la pièce
    // choisie, crédité immédiatement (voir economy.js::economyOnPromotion).
    if(typeof economyOnPromotion==='function')economyOnPromotion(opt.pieceId,gs);
    // En ligne, le coup n'est transmis qu'ici : l'adversaire a besoin de la
    // pièce choisie, pas seulement des cases de départ et d'arrivée.
    if(gs.multiplayer&&typeof mpSendMove==='function')mpSendMove(from,to,{type:opt.type,emoji:opt.emoji,pieceId:opt.pieceId});
    recordMove(p,to,false,gs,from);gs.turn=opp(gs.turn);gs.turnCount++;postMoveUpdate(gs);
  });});
}

// ================================================================
// JOURNAL DES COUPS : la notation algébrique, avec le logo pour lettre
// ================================================================
// LE JOURNAL DISAIT LES DEUX CASES, « ♞E1–F3 ». C'était une redondance : la
// case de départ ne sert à rien tant qu'un seul cavalier peut atteindre F3, et
// aucune notation d'échecs ne l'écrit. On note donc comme tout le monde depuis
// deux siècles — la pièce, puis la case d'arrivée —, la LETTRE de la pièce
// étant remplacée par son LOGO : sur un jeu où les pièces sont des créatures,
// « M » ou « G » ne désignerait rien (Méduse, Monarque ? Garde de Pierre,
// Grand Maître ?), le dessin, si.
//
// LA CASE DE DÉPART REVIENT QUAND, ET SEULEMENT QUAND, ELLE LÈVE UNE
// AMBIGUÏTÉ : deux créatures du même logo pouvant aller sur la même case. On
// donne alors la colonne si elle suffit (« ♞ef3 »), sinon la rangée, sinon
// les deux — exactement la règle de la notation algébrique. Un pion qui
// capture garde toujours sa colonne, comme le veut la règle officielle.
//
// D'OÙ VIENT LE PLATEAU D'AVANT LE COUP. recordMove() est appelée APRÈS la
// mutation du plateau : chercher les rivales sur `gs.board` échouerait, la
// case d'arrivée étant désormais occupée par la pièce qui vient d'y aller.
// executeGameMove() empile juste avant de jouer un instantané complet
// (gs.history) : c'est lui qu'on interroge, avec ses propres états spéciaux
// recalculés dessus, pour que la question posée soit bien « qui POUVAIT y
// aller ? ».
const ML_FILES=FILES.map(f=>f.toLowerCase());
function mlSquare(r,c){return ML_FILES[c]+(8-r);}
// Deux pièces sont « du même type » si elles portent le MÊME LOGO : c'est ce
// que le joueur lit. Une Dame de départ et une Dame de promotion ont deux
// identifiants (`dame`, `dame-promo`) et un seul dessin — les distinguer ici
// laisserait passer une vraie ambiguïté.
function mlArtKey(id){
  return (typeof PIECE_ART_ALIAS!=='undefined'&&PIECE_ART_ALIAS[id])||id;
}
// Le plateau d'avant le coup, reconstitué depuis le dernier instantané, avec
// ses états spéciaux recalculés dessus. Renvoie null si l'instantané ne
// correspond pas au coup qu'on note (partie rejouée, coup hors moteur) : la
// notation se passe alors de désambiguïsation plutôt que d'en inventer une.
function mlPreState(p,gs,from){
  if(!from||!gs||!Array.isArray(gs.history)||!gs.history.length)return null;
  const snap=gs.history[gs.history.length-1];
  const pre=snap&&snap.board;
  const was=pre&&pre[from.r]&&pre[from.r][from.c];
  if(!was||was.color!==p.color||was.pieceId!==p.pieceId)return null;
  const preGs={board:pre,enPassant:snap.enPassant,
    anchored:snap.anchored||new Set(),
    grandMaitreAlive:snap.grandMaitreAlive||{w:false,b:false},
    medusaParalyzed:new Set(),pretreProtected:new Set(),lastMoveHistory:[]};
  updateMedusaParalysis(pre,preGs);
  updatePretreProtection(pre,preGs);
  return{pre,preGs};
}
// Ce qu'il faut ajouter au logo pour que le coup soit sans ambiguïté : rien,
// une colonne, une rangée, ou la case entière.
function mlDisambiguation(p,to,isCapture,gs,from){
  const truePawn=(typeof TRUE_PAWN_IDS!=='undefined')&&TRUE_PAWN_IDS.has(p.pieceId);
  const st=mlPreState(p,gs,from);
  if(!st)return (isCapture&&truePawn&&from)?ML_FILES[from.c]:'';
  const mine=mlArtKey(p.pieceId);
  const rivals=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    if(r===from.r&&c===from.c)continue;
    const q=st.pre[r][c];
    if(!q||q.color!==p.color||mlArtKey(q.pieceId)!==mine)continue;
    if(getLegalMoves(st.pre,r,c,st.preGs).some(m=>m.r===to.r&&m.c===to.c))rivals.push({r,c});
  }
  if(!rivals.length)return (isCapture&&truePawn)?ML_FILES[from.c]:'';
  if(rivals.every(q=>q.c!==from.c))return ML_FILES[from.c];
  if(rivals.every(q=>q.r!==from.r))return String(8-from.r);
  return mlSquare(from.r,from.c);
}
// ================================================================
// LA TRACE REJOUABLE D'UNE PARTIE
// ================================================================
// Une partie terminée ne laissait derrière elle qu'un RÉSULTAT : « victoire,
// +23 ELO ». Le journal des coups, lui, mourait avec la page — impossible de
// revoir la partie du voisin qu'on vient d'affronter, ni la sienne du mois
// dernier. C'est pourtant la première chose qu'on veut faire après une belle
// partie, et la seule façon d'apprendre de celle qu'on a perdue.
//
// On note donc chaque coup sous sa forme la plus courte qui se rejoue : les
// quatre coordonnées de la case de départ et de la case d'arrivée, plus
// l'identifiant de la pièce choisie s'il y a eu promotion. « 6444 » est un
// coup, « 1044:dame » une promotion en Dame. Trente coups tiennent en deux
// cents octets, c'est-à-dire rien du tout à côté d'une ligne d'historique.
//
// LA LISTE EST UN INSTANTANÉ COMME LES AUTRES : elle est empilée dans
// gs.history à chaque coup (voir executeGameMove) et restaurée à l'annulation,
// sinon un coup annulé resterait dans la partie rejouée.
//
// LE ROQUE, LA PRISE EN PASSANT, LA CHARGE ET LES POUVOIRS N'ONT RIEN À
// NOTER : ils se déduisent des deux cases, puisque la relecture repasse par
// le MOTEUR (generateMovesRaw / executeGameMove) et non par une copie des
// règles. Une règle qui change change donc aussi les parties rejouées — c'est
// exactement ce qu'on veut : elles ne sont pas des vidéos, ce sont des coups.
function replayNote(p,to,gs,from){
  if(!gs||!from)return;
  if(!Array.isArray(gs.replay))gs.replay=[];
  const now=gs.board&&gs.board[to.r]&&gs.board[to.r][to.c];
  // Promotion : la pièce posée sur la case d'arrivée n'est plus celle qui est
  // partie. C'est le seul cas où les deux cases ne suffisent pas.
  const promo=(now&&p&&now.pieceId!==p.pieceId)?now.pieceId:null;
  // Le premier pas du Singe, quand il y en a un : « 6442@53 ».
  const via=to.via?'@'+to.via.r+to.via.c:'';
  gs.replay.push(''+from.r+from.c+to.r+to.c+via+(promo?':'+promo:''));
}

function recordMove(p,to,isCapture,gs,from){
  replayNote(p,to,gs,from);
  // QUÊTES DE LA RANGÉE DE LA RICHESSE (js/rewards.js) : « déplacer 5 fois X »,
  // « capturer 3 pièces avec X », « engager X et la jouer 3 fois ». C'est ici
  // et nulle part ailleurs, pour la même raison que l'incrément Fischer
  // ci-dessous : recordMove est le seul point par lequel passe TOUT coup
  // effectivement joué. Seuls les coups DU JOUEUR comptent (l'adversaire, IA
  // ou humain en ligne, passe par la même fonction), et jamais ceux du
  // tutoriel, où les pièces sont prêtées.
  if(!REPLAYING&&gs&&!gs.tuto&&p&&p.color===(gs.playerColor||'w')&&typeof questNoteMove==='function')
    questNoteMove(gs,p.pieceId,!!isCapture);
  // Incrément Fischer : le joueur qui vient de jouer récupère son bonus. Ici
  // et pas ailleurs, parce que recordMove est le seul point par lequel passe
  // TOUT coup effectivement joué (y compris l'ancrage du Garde de Pierre, qui
  // ne passe pas par executeGameMove).
  if(!REPLAYING&&gs&&gs.clockMs&&gs.incrementMs&&!gs.gameOver){
    const k=p.color==='w'?'timeWhite':'timeBlack';
    gs[k]=(gs[k]||0)+gs.incrementMs;
    if(typeof renderClocks==='function')renderClocks(gs);
  }
  // LE LOGO TIENT LIEU DE LETTRE, puis vient la case d'arrivée — et entre les
  // deux, la colonne ou la rangée de départ seulement si une autre créature du
  // même logo pouvait aller là (voir mlDisambiguation, plus haut). Le roque
  // garde sa notation, la seule que tout le monde lise du premier coup d'œil.
  const icon=(typeof pieceIcon==='function')?pieceIcon(p.pieceId,p.color,1.05):'';
  let txt;
  if(to.castle)txt=icon+'<span class="ml-sq">'+(to.castle==='K'?'O-O':'O-O-O')+'</span>';
  else if(from&&from.r===to.r&&from.c===to.c)
    // Ancrage du Garde de Pierre : la pièce ne se déplace pas, elle se fixe.
    txt=icon+'<span class="ml-sq">'+mlSquare(to.r,to.c)+'</span><span class="ml-flag">ancré</span>';
  else{
    const dis=mlDisambiguation(p,to,!!isCapture,gs,from);
    txt=icon+(dis?'<span class="ml-dis">'+dis+'</span>':'')+
      (isCapture?'<span class="ml-x">×</span>':'')+
      '<span class="ml-sq">'+mlSquare(to.r,to.c)+'</span>'+
      (to.ep?'<span class="ml-flag">e.p.</span>':'')+
      (to.destroysPath?'<span class="ml-flag">charge</span>':'')+
      (p.pieceId==='typhon'?'<span class="ml-flag">typhon</span>':'')+
      // La case d'arrivée est vide après une prise : la pièce y est morte de
      // la contagion de l'Infecté.
      (isCapture&&gs.board&&gs.board[to.r]&&!gs.board[to.r][to.c]?'<span class="ml-flag">contagion</span>':'');
    // UN COUP ADVERSE QUI S'ACHÈVE DANS LE BROUILLARD DE NYX ne s'écrit pas :
    // le journal dirait ce que le plateau cache.
    if(!REPLAYING&&p.color!==(gs.playerColor||'w')&&nyxFogLive(gs).has(to.r+','+to.c))
      txt='<span class="ml-flag">dans le brouillard</span>';
  }
  if(p.color==='w')gs.movePairs.push([txt,'']);
  else{if(gs.movePairs.length>0)gs.movePairs[gs.movePairs.length-1][1]=txt;else gs.movePairs.push(['…',txt]);}
  renderMoveLog(gs);
}

// Ajoute « + » (échec) ou « # » (mat) au DERNIER demi-coup inscrit.
// Appelée par updateStatus et non par recordMove : au moment où le coup est
// inscrit, les états spéciaux (paralysie de la Méduse, protection du Prêtre)
// n'ont pas encore été recalculés, et le mat serait donc jugé sur un plateau
// périmé — on annoncerait des mats qui n'en sont pas.
function markLastMove(gs,mark){
  if(!gs.movePairs.length||!mark)return;
  const pair=gs.movePairs[gs.movePairs.length-1];
  const i=pair[1]?1:0;
  if(!pair[i]||pair[i].indexOf('ml-mark')>=0)return;
  pair[i]+='<span class="ml-mark">'+mark+'</span>';
  renderMoveLog(gs);
}
function renderMoveLog(gs){
  if(REPLAYING)return;   // le journal à l'écran est celui de la VRAIE partie
  const log=document.getElementById('move-log');if(!log)return;
  const cur=gs.historyView!==null?Math.floor(gs.historyView/2):gs.movePairs.length-1;
  log.innerHTML=gs.movePairs.map((pair,i)=>{const isH=gs.historyView!==null&&i===cur;return '<div class="move-log-item'+(isH?' ml-here':'')+'"><span class="move-log-num">'+(i+1)+'.</span><span class="move-log-w">'+pair[0]+'</span><span class="move-log-b">'+(pair[1]||'')+'</span></div>';}).join('');
  // LE JOURNAL SUIT CE QU'ON REGARDE. Il défilait toujours jusqu'en bas, y
  // compris pendant une relecture : on remontait au douzième coup et la liste
  // repartait aussitôt au dernier, emportant la ligne qu'on venait de
  // désigner. Pendant la relecture, c'est la position COURANTE qu'on amène à
  // l'écran ; le reste du temps, le dernier coup joué.
  const here=log.querySelector('.ml-here');
  if(here&&typeof here.scrollIntoView==='function')here.scrollIntoView({block:'nearest'});
  else log.scrollTop=log.scrollHeight;
}

// ================================================================
// FIN DE PARTIE : nulle par matériel insuffisant / répétition / 50 coups
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
    const p=board[r][c];if(p&&!(p.isKing||p.type==='k')&&p.pieceId!=='reflet')pieces.push(p);
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

// updateStatus et triggerEndOfGame vivent dans game-render.js et
// game-flow.js (ils dépendent de l'ELO et du contexte de partie), mais
// updateStatus() est appelée par postMoveUpdate()
// ci-dessus : elle DOIT donc être chargée avant toute exécution de coup,
// c'est-à-dire game-flow.js doit être chargé avant que la partie démarre
// (ce qui est garanti par l'ordre de <script> dans index.html).