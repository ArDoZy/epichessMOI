// ================================================================
// FOK-RULES.JS : « Chute des Royaumes », le moteur de règles
// ================================================================
// La variante tient en une phrase : ON JOUE AUX ÉCHECS ORDINAIRES, MAIS
// APRÈS CHAQUE COUP — le sien comme celui de l'adversaire — TOUTES LES
// PIÈCES DES QUATRE RANGÉES CENTRALES GLISSENT D'UNE CASE VERS LA DROITE,
// la droite étant celle du camp blanc. Les deux premières rangées (1 et 2)
// et les deux dernières (7 et 8) sont fixes : c'est là que les rois et les
// tours restent maîtres de leur sol, et c'est ce qui empêche la partie de
// devenir un pur tirage au sort.
//
// CE QUI ARRIVE AU BORD. Une pièce en colonne h de la bande mobile reparaît
// en colonne a de la même rangée : la bande est un ANNEAU. C'est le seul
// choix qui ne détruit rien au hasard et qui garantit qu'aucune collision
// n'est possible — les quatre rangées glissent d'un bloc, les positions
// relatives y sont conservées, donc deux pièces ne peuvent jamais se
// retrouver sur la même case. Une bande qui ferait tomber la pièce de bord
// hors de l'échiquier supprimerait une Dame sur un coup joué à l'autre bout
// du plateau, sans que personne ne l'ait voulu.
//
// CE QUI EST CONSERVÉ DES ÉCHECS : le déplacement de chaque pièce, la prise,
// l'échec, le mat, le pat, la promotion du pion, le roque, la règle des
// 50 coups et la triple répétition.
//
// CE QUI EST RETIRÉ, ET POURQUOI :
//   · LA PRISE EN PASSANT. Elle se joue sur la case « traversée » par un pion
//     qui vient d'avancer de deux. Entre les deux demi-coups, le glissement a
//     déplacé ce pion ET cette case : la règle ne désignerait plus rien.
//   · LES POUVOIRS ET LES EFFETS SPÉCIAUX d'Epic Chess. La variante se joue
//     avec les seize pièces d'un jeu d'échecs ordinaire (demandé
//     explicitement) : aucune créature, aucune paralysie, aucune charge.
//
// LA LÉGALITÉ SE JUGE APRÈS LE GLISSEMENT. Le glissement fait partie du coup :
// un coup est légal si, UNE FOIS LA BANDE DÉCALÉE, le roi du joueur n'est pas
// en échec. C'est ce qui rend la partie bien définie — au début de chaque
// tour, aucun roi n'est prenable.
//
// Ce fichier ne connaît ni le DOM ni le réseau : il ne manipule qu'un objet
// d'état. Dépendances : aucune. Utilisé par : fok-ai.js (recherche),
// fok-game.js (écran de jeu), fok-mp.js (parties en ligne).
// ================================================================

// Les rangées qui glissent, en indices de tableau (0 = rangée 8, 7 = rangée 1).
// 2,3,4,5 = rangées 6,5,4,3, c'est-à-dire tout sauf les deux premières et les
// deux dernières.
const FOK_SHIFT_ROWS=[2,3,4,5];
const FOK_SHIFTED=[false,false,true,true,true,true,false,false];

// Valeur matérielle, en centipions. Le roi ne vaut rien : il ne se prend pas.
const FOK_VALUE={p:100,n:320,b:330,r:500,q:900,k:0};

// Dessin de chaque type, pris tel quel dans le jeu principal (js/piece-art.js).
// Les quatre premiers passent par les alias des pièces standard, la Dame et le
// Roi sont les dessins d'Epic Chess eux-mêmes.
const FOK_ART={p:'std-pawn',n:'std-n',b:'std-b',r:'std-r',q:'dame',k:'roi'};
const FOK_NAME={p:'Pion',n:'Cavalier',b:'Fou',r:'Tour',q:'Dame',k:'Roi'};
const FOK_FILES=['a','b','c','d','e','f','g','h'];

function fokIn(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function fokOpp(color){return color==='w'?'b':'w';}
function fokSquare(r,c){return FOK_FILES[c]+(8-r);}

// ----------------------------------------------------------------
// L'ÉTAT
// ----------------------------------------------------------------
// board[r][c] = null ou {t,color,id}. L'identifiant est STABLE pour toute la
// vie de la pièce : c'est lui qui permet à l'écran de faire glisser le même
// nœud d'une case à l'autre au lieu de redessiner le plateau (voir
// fok-game.js), et donc de MONTRER le décalage au lieu de le subir.
function fokNewState(){
  const back=['r','n','b','q','k','b','n','r'];
  const board=[];
  for(let r=0;r<8;r++)board.push(new Array(8).fill(null));
  let uid=0;
  for(let c=0;c<8;c++){
    board[0][c]={t:back[c],color:'b',id:'p'+(uid++)};
    board[1][c]={t:'p',color:'b',id:'p'+(uid++)};
    board[6][c]={t:'p',color:'w',id:'p'+(uid++)};
    board[7][c]={t:back[c],color:'w',id:'p'+(uid++)};
  }
  return{
    board,
    turn:'w',
    uid,
    rights:{wK:true,wQ:true,bK:true,bQ:true},
    halfmove:0,          // demi-coups sans prise ni poussée de pion (règle des 50)
    ply:0,               // demi-coups joués depuis le début
    moves:[],            // journal : un coup = {mv, text, color, num}
    captured:{w:[],b:[]},// types pris PAR le camp de la clé
    lastMove:null,       // {from,to} en coordonnées d'APRÈS le glissement
    gameOver:false,
    result:null,         // 'w' | 'b' | 'draw'
    reason:'',
    reps:Object.create(null), // positions déjà vues -> nombre de fois
  };
}

function fokCloneState(st){
  const board=[];
  for(let r=0;r<8;r++)board.push(st.board[r].slice());
  return{
    board,turn:st.turn,uid:st.uid,
    rights:{wK:st.rights.wK,wQ:st.rights.wQ,bK:st.rights.bK,bQ:st.rights.bQ},
    halfmove:st.halfmove,ply:st.ply,
    // Le journal, les prises et le compteur de répétitions NE SONT PAS
    // recopiés : la recherche de l'IA clone des milliers d'états par coup et
    // n'en a aucun usage. fokUpdateStatus, qui écrit dans `reps`, ne doit donc
    // être appelée que sur l'état de la VRAIE partie.
    moves:st.moves,captured:st.captured,lastMove:st.lastMove,
    gameOver:st.gameOver,result:st.result,reason:st.reason,reps:Object.create(null),
  };
}

// ----------------------------------------------------------------
// LE GLISSEMENT
// ----------------------------------------------------------------
// Une seule fonction, appelée à un seul endroit (fokShiftState) : la règle
// entière de la variante tient dans ces quatre lignes, et il faut qu'elle
// reste lisible d'un coup d'œil.
function fokShiftBoard(board){
  for(const r of FOK_SHIFT_ROWS){
    const src=board[r],out=new Array(8).fill(null);
    for(let c=0;c<8;c++)out[(c+1)%8]=src[c];
    board[r]=out;
  }
}
// Où se retrouve une case après le glissement. Sert à replacer les marques du
// dernier coup : sans ça, la case de départ et la case d'arrivée montreraient
// l'endroit où le coup a été joué, et non celui où il se lit maintenant.
function fokShiftCoord(r,c){return FOK_SHIFTED[r]?{r,c:(c+1)%8}:{r,c};}

// ----------------------------------------------------------------
// DÉPLACEMENTS
// ----------------------------------------------------------------
const FOK_DIR={
  r:[[1,0],[-1,0],[0,1],[0,-1]],
  b:[[1,1],[1,-1],[-1,1],[-1,-1]],
  q:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
};
const FOK_KNIGHT=[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];

// Coups pseudo-légaux d'UNE pièce : la géométrie, sans se demander si le roi
// reste en sécurité (c'est fokLegalMoves qui tranche, et seulement après avoir
// fait glisser la bande).
function fokPieceMoves(board,r,c,out,rights){
  const p=board[r][c];
  if(!p)return out;
  const me=p.color,them=fokOpp(me);
  const push=(tr,tc)=>{
    if(!fokIn(tr,tc))return false;
    const q=board[tr][tc];
    if(q&&q.color===me)return false;
    out.push({from:{r,c},to:{r:tr,c:tc}});
    return !q;                       // on continue tant que la case était vide
  };
  if(p.t==='p'){
    const dir=me==='w'?-1:1;
    const start=me==='w'?6:1;
    const last=me==='w'?0:7;
    const one=r+dir;
    if(fokIn(one,c)&&!board[one][c]){
      if(one===last)for(const q of ['q','r','b','n'])out.push({from:{r,c},to:{r:one,c},promo:q});
      else out.push({from:{r,c},to:{r:one,c}});
      // La poussée de deux ne part que de la rangée de départ, qui est l'une
      // des rangées FIXES : le glissement ne peut donc jamais rendre ce droit
      // à un pion qui l'aurait déjà dépensé.
      const two=r+dir*2;
      if(r===start&&fokIn(two,c)&&!board[two][c])out.push({from:{r,c},to:{r:two,c},dbl:true});
    }
    for(const dc of [-1,1]){
      const tr=one,tc=c+dc;
      if(!fokIn(tr,tc))continue;
      const q=board[tr][tc];
      if(!q||q.color!==them)continue;
      if(tr===last)for(const g of ['q','r','b','n'])out.push({from:{r,c},to:{r:tr,c:tc},promo:g});
      else out.push({from:{r,c},to:{r:tr,c:tc}});
    }
    return out;
  }
  if(p.t==='n'){for(const[dr,dc]of FOK_KNIGHT)push(r+dr,c+dc);return out;}
  if(p.t==='k'){
    for(const[dr,dc]of FOK_DIR.q)push(r+dr,c+dc);
    if(rights)fokCastleMoves(board,r,c,p,rights,out);
    return out;
  }
  for(const[dr,dc]of FOK_DIR[p.t]){
    let tr=r+dr,tc=c+dc;
    while(push(tr,tc)){tr+=dr;tc+=dc;}
  }
  return out;
}

// LE ROQUE EST CONSERVÉ, et il n'y a aucune contradiction avec la variante :
// la rangée du roi et celle des tours sont justement les deux rangées qui ne
// glissent pas. Le roi et sa tour sont donc chez eux, exactement comme aux
// échecs ordinaires — c'est même la seule chose qui reste stable dans cette
// partie, et c'est ce qui en fait un refuge.
function fokCastleMoves(board,r,c,p,rights,out){
  const home=p.color==='w'?7:0;
  if(r!==home||c!==4)return;
  const key=p.color==='w'?'w':'b';
  if(fokAttacked(board,r,4,fokOpp(p.color)))return;   // on ne roque pas en échec
  const rook=(rr,rc)=>{const q=board[rr][rc];return q&&q.t==='r'&&q.color===p.color;};
  if(rights[key+'K']&&!board[home][5]&&!board[home][6]&&rook(home,7)
     &&!fokAttacked(board,home,5,fokOpp(p.color)))
    out.push({from:{r,c},to:{r:home,c:6},castle:'K'});
  if(rights[key+'Q']&&!board[home][3]&&!board[home][2]&&!board[home][1]&&rook(home,0)
     &&!fokAttacked(board,home,3,fokOpp(p.color)))
    out.push({from:{r,c},to:{r:home,c:2},castle:'Q'});
}

// La case (tr,tc) est-elle attaquée par le camp `by` ? On part de la case et
// on remonte les rayons : c'est beaucoup moins cher que d'engendrer tous les
// coups adverses, et cette fonction est appelée à chaque nœud de la recherche.
function fokAttacked(board,tr,tc,by){
  for(const[dr,dc]of FOK_KNIGHT){
    const p=board[tr+dr]&&board[tr+dr][tc+dc];
    if(p&&p.color===by&&p.t==='n')return true;
  }
  for(const[dr,dc]of FOK_DIR.q){
    const p=board[tr+dr]&&board[tr+dr][tc+dc];
    if(p&&p.color===by&&p.t==='k')return true;
  }
  // Pions : ils prennent vers l'avant de LEUR camp.
  const pd=by==='w'?1:-1;           // la case est devant le pion attaquant
  for(const dc of [-1,1]){
    const p=board[tr+pd]&&board[tr+pd][tc+dc];
    if(p&&p.color===by&&p.t==='p')return true;
  }
  for(const[dr,dc]of FOK_DIR.r){
    let r=tr+dr,c=tc+dc;
    while(fokIn(r,c)){
      const p=board[r][c];
      if(p){if(p.color===by&&(p.t==='r'||p.t==='q'))return true;break;}
      r+=dr;c+=dc;
    }
  }
  for(const[dr,dc]of FOK_DIR.b){
    let r=tr+dr,c=tc+dc;
    while(fokIn(r,c)){
      const p=board[r][c];
      if(p){if(p.color===by&&(p.t==='b'||p.t==='q'))return true;break;}
      r+=dr;c+=dc;
    }
  }
  return false;
}

function fokFindKing(board,color){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t==='k'&&p.color===color)return{r,c};
  }
  return null;
}
function fokInCheck(board,color){
  const k=fokFindKing(board,color);
  return !!k&&fokAttacked(board,k.r,k.c,fokOpp(color));
}

// ----------------------------------------------------------------
// JOUER UN COUP
// ----------------------------------------------------------------
// Le coup se joue en DEUX temps, et l'écran en a besoin : la pièce se déplace
// d'abord (fokMakeRaw), puis la bande glisse (fokShiftState). Les montrer
// ensemble donnerait une pièce qui part en biais sans qu'on comprenne
// pourquoi ; les montrer l'un après l'autre montre la règle.
// La recherche de l'IA, elle, enchaîne les deux d'un coup (fokMake).
// Applique le coup au SEUL plateau (pas aux droits de roque, pas au compteur
// des 50 coups). Partagée par le coup réel et par le test de légalité, pour
// qu'il n'y ait jamais deux façons de déplacer une pièce dans ce fichier.
//
// LA PROMOTION CRÉE UN NOUVEL OBJET au lieu de changer le type de l'ancien :
// les pièces sont partagées entre un plateau et sa copie (on ne recopie que
// les rangées), et muter la pièce promouvrait aussi le pion de l'original —
// y compris pendant un simple test de légalité.
function fokApplyToBoard(board,mv){
  const p=board[mv.from.r][mv.from.c];
  if(!p)return null;
  const taken=board[mv.to.r][mv.to.c];
  board[mv.from.r][mv.from.c]=null;
  board[mv.to.r][mv.to.c]=mv.promo?{t:mv.promo,color:p.color,id:p.id}:p;
  if(mv.castle){
    const home=mv.from.r;
    if(mv.castle==='K'){board[home][5]=board[home][7];board[home][7]=null;}
    else{board[home][3]=board[home][0];board[home][0]=null;}
  }
  return taken;
}

function fokMakeRaw(st,mv){
  const b=st.board;
  const p=b[mv.from.r][mv.from.c];
  if(!p)return null;
  const moverType=p.t;
  const taken=fokApplyToBoard(b,mv);
  // Droits au roque : perdus dès que le roi ou la tour concernée bouge, et
  // dès qu'une tour est prise sur sa case d'origine.
  const key=p.color==='w'?'w':'b';
  if(moverType==='k'||mv.castle){st.rights[key+'K']=false;st.rights[key+'Q']=false;}
  if(moverType==='r'){
    const home=p.color==='w'?7:0;
    if(mv.from.r===home&&mv.from.c===0)st.rights[key+'Q']=false;
    if(mv.from.r===home&&mv.from.c===7)st.rights[key+'K']=false;
  }
  if(taken&&taken.t==='r'){
    const tk=taken.color==='w'?'w':'b';
    const home=taken.color==='w'?7:0;
    if(mv.to.r===home&&mv.to.c===0)st.rights[tk+'Q']=false;
    if(mv.to.r===home&&mv.to.c===7)st.rights[tk+'K']=false;
  }
  st.halfmove=(taken||moverType==='p')?0:st.halfmove+1;
  return taken;
}

function fokShiftState(st){
  fokShiftBoard(st.board);
  st.turn=fokOpp(st.turn);
  st.ply++;
}

function fokMake(st,mv){
  const taken=fokMakeRaw(st,mv);
  fokShiftState(st);
  return taken;
}

// Le coup laisse-t-il notre roi en sécurité UNE FOIS LA BANDE DÉCALÉE ?
// C'est LA question de la variante, et elle est posée des dizaines de milliers
// de fois par seconde pendant que l'IA réfléchit : on sauve les huit rangées,
// on joue, on décale, on regarde, on remet tout en place. Aucune allocation
// au-delà des huit copies de rangée.
const _fokSaved=[];
function fokMoveIsSafe(st,mv,color){
  const b=st.board;
  for(let r=0;r<8;r++)_fokSaved[r]=b[r].slice();
  fokApplyToBoard(b,mv);
  fokShiftBoard(b);
  const bad=fokInCheck(b,color);
  for(let r=0;r<8;r++)b[r]=_fokSaved[r];
  return !bad;
}

function fokPseudoMoves(st,color){
  const out=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    if(p&&p.color===color)fokPieceMoves(st.board,r,c,out,st.rights);
  }
  return out;
}

function fokLegalMoves(st,color){
  color=color||st.turn;
  return fokPseudoMoves(st,color).filter(mv=>fokMoveIsSafe(st,mv,color));
}

// Coups légaux d'une seule case : ce que l'écran demande quand on saisit une
// pièce. Les promotions sont repliées sur une seule entrée par case d'arrivée
// (le choix de la pièce se fait ensuite, dans une fenêtre).
function fokMovesFrom(st,r,c){
  const p=st.board[r][c];
  if(!p||p.color!==st.turn||st.gameOver)return[];
  const raw=fokPieceMoves(st.board,r,c,[],st.rights).filter(mv=>fokMoveIsSafe(st,mv,p.color));
  const seen=new Set(),out=[];
  for(const mv of raw){
    const k=mv.to.r+','+mv.to.c;
    if(seen.has(k))continue;
    seen.add(k);out.push(mv);
  }
  return out;
}

// ----------------------------------------------------------------
// FIN DE PARTIE
// ----------------------------------------------------------------
function fokPositionKey(st){
  let s='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    s+=p?(p.color===st.turn?p.t.toUpperCase():p.t):'.';
  }
  return s+st.turn+(st.rights.wK?'K':'')+(st.rights.wQ?'Q':'')+(st.rights.bK?'k':'')+(st.rights.bQ?'q':'');
}

// Matériel insuffisant : roi seul contre roi seul, ou contre un fou ou un
// cavalier isolé. Le glissement n'y change rien — une pièce mineure seule ne
// mate pas plus sur un anneau que sur un échiquier ordinaire.
function fokInsufficient(board){
  const men=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t!=='k')men.push(p.t);
  }
  if(!men.length)return true;
  return men.length===1&&(men[0]==='b'||men[0]==='n');
}

// Statut de la position AU TRAIT : c'est ce que l'écran affiche et ce qui
// arrête la partie.
function fokUpdateStatus(st){
  const moves=fokLegalMoves(st,st.turn);
  const check=fokInCheck(st.board,st.turn);
  st.legalCount=moves.length;
  st.check=check;
  if(!moves.length){
    st.gameOver=true;
    if(check){st.result=fokOpp(st.turn);st.reason='mat';}
    else{st.result='draw';st.reason='pat';}
    return st;
  }
  if(st.halfmove>=100){st.gameOver=true;st.result='draw';st.reason='50 coups';return st;}
  if(fokInsufficient(st.board)){st.gameOver=true;st.result='draw';st.reason='matériel insuffisant';return st;}
  const key=fokPositionKey(st);
  st.reps[key]=(st.reps[key]||0)+1;
  if(st.reps[key]>=3){st.gameOver=true;st.result='draw';st.reason='triple répétition';}
  return st;
}

// ----------------------------------------------------------------
// NOTATION
// ----------------------------------------------------------------
// Pas de notation algébrique abrégée ici, et c'est délibéré : « Cf3 » désigne
// une case que le glissement aura déplacée au coup suivant. On écrit donc
// toujours le trajet complet — départ, flèche, arrivée —, la seule écriture
// qui reste vraie une fois la bande décalée.
function fokMoveText(st,mv,taken){
  if(mv.castle)return mv.castle==='K'?'O-O':'O-O-O';
  return fokSquare(mv.from.r,mv.from.c)+(taken?'×':'–')+fokSquare(mv.to.r,mv.to.c)+
    (mv.promo?'='+FOK_NAME[mv.promo][0]:'');
}

// Enregistre le coup joué dans le journal. Appelée APRÈS le glissement, quand
// le statut de la nouvelle position est connu.
function fokRecord(st,mv,taken,mover,pieceType){
  const mark=st.gameOver&&st.reason==='mat'?'#':(st.check?'+':'');
  st.moves.push({
    color:mover,
    num:Math.floor(st.moves.length/2)+1,
    piece:pieceType||'p',
    text:fokMoveText(st,mv,taken)+mark,
    mv:{fr:mv.from.r,fc:mv.from.c,tr:mv.to.r,tc:mv.to.c,promo:mv.promo||null,castle:mv.castle||null},
  });
}

// Sérialisation d'un coup pour le réseau : quatre nombres et deux drapeaux,
// rien d'autre. Un client modifié ne peut donc rien envoyer que le moteur
// d'en face ne vérifie lui-même (voir fokFindMove).
function fokPackMove(mv){
  return{fr:mv.from.r,fc:mv.from.c,tr:mv.to.r,tc:mv.to.c,promo:mv.promo||null,castle:mv.castle||null};
}
// Retrouve le coup LÉGAL correspondant à ce que l'adversaire annonce. Renvoie
// null si ce coup n'existe pas : on refuse alors de l'appliquer plutôt que de
// laisser un client bricolé déplacer une pièce comme il veut.
function fokFindMove(st,pk){
  if(!pk)return null;
  const list=fokLegalMoves(st,st.turn);
  return list.find(m=>m.from.r===pk.fr&&m.from.c===pk.fc&&m.to.r===pk.tr&&m.to.c===pk.tc&&
    (m.promo||null)===(pk.promo||null)&&(m.castle||null)===(pk.castle||null))||null;
}

if(typeof window!=='undefined'){
  window.FOK_SHIFT_ROWS=FOK_SHIFT_ROWS;
  window.fokNewState=fokNewState;
}
if(typeof module!=='undefined'&&module.exports){
  module.exports={fokNewState,fokCloneState,fokApplyToBoard,fokMoveIsSafe,fokPositionKey,fokRecord,fokPieceMoves,fokPseudoMoves,fokFindKing,fokInsufficient,fokLegalMoves,fokMovesFrom,fokMake,fokMakeRaw,
    fokShiftState,fokShiftBoard,fokShiftCoord,fokUpdateStatus,fokInCheck,fokAttacked,
    fokMoveText,fokPackMove,fokFindMove,FOK_VALUE,FOK_ART,FOK_NAME,fokSquare,fokOpp};
}
