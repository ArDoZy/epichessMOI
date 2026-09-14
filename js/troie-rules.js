// ================================================================
// TROIE-RULES.JS : « Le Cheval de Troie », le moteur de règles
// ================================================================
// La variante tient en une phrase : ON JOUE AUX ÉCHECS ORDINAIRES, MAIS
// CHAQUE JOUEUR A CHOISI, AVANT LE PREMIER COUP, UN DES DEUX CAVALIERS
// ADVERSES POUR ÊTRE SON ESPION — et l'adversaire ne sait pas lequel.
//
// CE QUE FAIT UN ESPION, ET CE QU'IL NE FAIT PAS :
//   · IL RESTE DANS LE CAMP OÙ IL EST. Tant qu'il n'est pas révélé, le
//     cavalier espion est une pièce ordinaire de son camp : c'est son camp
//     qui le joue, qui le déplace, qui prend avec. Personne ne s'aperçoit de
//     rien.
//   · IL NE MET JAMAIS EN ÉCHEC. Un cavalier espion non révélé n'attaque
//     AUCUNE case : il ne donne pas d'échec, il n'interdit pas une case au
//     roi d'en face, il ne cloue rien. C'est la seule chose qui le trahirait
//     sans qu'on le veuille, et la règle la retire.
//   · IL NE SE FAIT PAS PRENDRE PAR SON PROPRIÉTAIRE SECRET PAR MÉGARDE…
//     enfin si, et c'est voulu : rien n'empêche une pièce de le prendre comme
//     n'importe quelle autre pièce de ce camp-là. Quand un cavalier espion
//     tombe avant d'avoir été révélé, PERSONNE NE SAIT que c'en était un —
//     le jeu ne l'annonce pas, et la partie continue comme si de rien n'était.
//   · IL SE RÉVÈLE EN ÉTANT JOUÉ, et seulement comme ça. À son tour, son
//     propriétaire secret peut le jouer au lieu de jouer une de ses pièces :
//     le cavalier CHANGE DE COULEUR sur-le-champ, devient un cavalier
//     parfaitement ordinaire de son nouveau camp, et le saut qu'il fait en se
//     révélant est un saut de cavalier comme un autre — il peut donc prendre,
//     y compris une pièce de son ancien camp.
//
// UN JOUEUR A DONC DEUX JEUX DE COUPS : ceux de ses seize pièces, et le saut
// de son espion s'il est encore en vie et encore secret. C'est tout ce que
// troPseudoMoves ajoute aux échecs, et c'est toute la variante.
//
// OÙ EST L'ESPION ? DANS LA PIÈCE, ET NULLE PART AILLEURS. Une pièce porte
// `spy:'w'` ou `spy:'b'` — la couleur de son propriétaire SECRET, qui est
// toujours l'inverse de sa couleur affichée. Il n'y a pas de seconde table à
// tenir à jour : un espion pris disparaît avec la pièce, un espion révélé
// perd son marquage parce qu'on remplace l'objet (comme pour une promotion).
// Deux sources de vérité sur une information cachée finissent toujours par
// diverger, et une divergence ici, c'est un espion fantôme.
//
// CE QUI EST CONSERVÉ DES ÉCHECS : tous les déplacements, la prise, l'échec,
// le mat, le pat, la promotion, le roque, la prise en passant, la règle des
// 50 coups et la triple répétition.
//
// Ce fichier ne connaît ni le DOM ni le réseau : il ne manipule qu'un objet
// d'état. Dépendances : aucune. Utilisé par : troie-ai.js (recherche),
// troie-game.js (écran de jeu).
//
// PAS DE PARTIE EN LIGNE, ET C'EST UNE DÉCISION. Les deux autres variantes se
// jouent à deux parce que les deux joueurs voient la même chose. Ici, la
// moitié de la partie est une information cachée : la faire tenir sur deux
// navigateurs demande un arbitre à qui les deux camps font confiance, que le
// jeu n'a pas (voir README). On joue donc contre l'IA, qui elle ne triche pas
// — troBeliefState lui retire ce qu'elle n'a pas le droit de savoir.
// ================================================================

const TRO_VALUE={p:100,n:320,b:330,r:500,q:900,k:0};
const TRO_ART={p:'std-pawn',n:'std-n',b:'std-b',r:'std-r',q:'dame',k:'roi'};
const TRO_NAME={p:'Pion',n:'Cavalier',b:'Fou',r:'Tour',q:'Dame',k:'Roi'};
const TRO_FILES=['a','b','c','d','e','f','g','h'];

function troIn(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function troOpp(color){return color==='w'?'b':'w';}
function troSquare(r,c){return TRO_FILES[c]+(8-r);}

const TRO_DIR={
  r:[[1,0],[-1,0],[0,1],[0,-1]],
  b:[[1,1],[1,-1],[-1,1],[-1,-1]],
  q:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
};
const TRO_KNIGHT=[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];

// ----------------------------------------------------------------
// L'ÉTAT
// ----------------------------------------------------------------
// board[r][c] = null ou {t,color,id,spy?}. `spy` est la couleur du
// propriétaire SECRET de la pièce ; il n'existe que sur un cavalier, et
// seulement tant que cet espion n'est pas révélé.
function troNewState(){
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
    ep:null,             // case de prise en passant ouverte, ou null
    halfmove:0,
    ply:0,
    moves:[],
    captured:{w:[],b:[]},
    lastMove:null,
    revealed:{w:false,b:false}, // l'espion de ce camp s'est-il montré ?
    gameOver:false,
    result:null,
    reason:'',
    reps:Object.create(null),
  };
}

function troCloneState(st){
  const board=[];
  for(let r=0;r<8;r++)board.push(st.board[r].slice());
  return{
    board,turn:st.turn,uid:st.uid,
    rights:{wK:st.rights.wK,wQ:st.rights.wQ,bK:st.rights.bK,bQ:st.rights.bQ},
    ep:st.ep,halfmove:st.halfmove,ply:st.ply,
    // Journal, prises et compteur de répétitions ne sont pas recopiés : la
    // recherche clone des milliers d'états et n'en a aucun usage.
    moves:st.moves,captured:st.captured,lastMove:st.lastMove,
    revealed:{w:st.revealed.w,b:st.revealed.b},
    gameOver:st.gameOver,result:st.result,reason:st.reason,reps:Object.create(null),
  };
}

// LE CHOIX DE L'ESPION, au coup d'envoi et une seule fois. `owner` choisit le
// cavalier de la case (r,c), qui doit être un cavalier ADVERSE : on n'infiltre
// pas son propre camp. La pièce est REMPLACÉE (et non modifiée) pour la même
// raison que la promotion remplace le pion — les objets de pièce sont partagés
// entre un plateau et ses copies.
function troSetSpy(st,owner,r,c){
  const p=st.board[r][c];
  if(!p||p.t!=='n'||p.color!==troOpp(owner))return false;
  if(troFindSpy(st.board,owner))return false;      // un seul espion par camp
  st.board[r][c]={t:'n',color:p.color,id:p.id,spy:owner};
  return true;
}
// L'espion de `owner`, ou null s'il n'y en a plus (pris, ou déjà révélé).
function troFindSpy(board,owner){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.spy===owner)return{r,c,p};
  }
  return null;
}
// Les cavaliers que `owner` peut choisir : ceux d'en face.
function troSpyChoices(board,owner){
  const out=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t==='n'&&p.color===troOpp(owner))out.push({r,c,p});
  }
  return out;
}

// ----------------------------------------------------------------
// DÉPLACEMENTS
// ----------------------------------------------------------------
function troPieceMoves(board,r,c,out,rights,ep){
  const p=board[r][c];
  if(!p)return out;
  const me=p.color,them=troOpp(me);
  const push=(tr,tc)=>{
    if(!troIn(tr,tc))return false;
    const q=board[tr][tc];
    if(q&&q.color===me)return false;
    out.push({from:{r,c},to:{r:tr,c:tc}});
    return !q;
  };
  if(p.t==='p'){
    const dir=me==='w'?-1:1;
    const start=me==='w'?6:1;
    const last=me==='w'?0:7;
    const one=r+dir;
    if(troIn(one,c)&&!board[one][c]){
      if(one===last)for(const g of['q','r','b','n'])out.push({from:{r,c},to:{r:one,c},promo:g});
      else out.push({from:{r,c},to:{r:one,c}});
      const two=r+dir*2;
      if(r===start&&troIn(two,c)&&!board[two][c])out.push({from:{r,c},to:{r:two,c},dbl:true});
    }
    for(const dc of[-1,1]){
      const tr=one,tc=c+dc;
      if(!troIn(tr,tc))continue;
      const q=board[tr][tc];
      if(q&&q.color===them){
        if(tr===last)for(const g of['q','r','b','n'])out.push({from:{r,c},to:{r:tr,c:tc},promo:g});
        else out.push({from:{r,c},to:{r:tr,c:tc}});
        continue;
      }
      if(q)continue;
      if(ep&&ep.r===tr&&ep.c===tc){
        const v=board[ep.pr][ep.pc];
        if(v&&v.t==='p'&&v.color===them)out.push({from:{r,c},to:{r:tr,c:tc},epc:{r:ep.pr,c:ep.pc}});
      }
    }
    return out;
  }
  if(p.t==='n'){for(const[dr,dc]of TRO_KNIGHT)push(r+dr,c+dc);return out;}
  if(p.t==='k'){
    for(const[dr,dc]of TRO_DIR.q)push(r+dr,c+dc);
    if(rights)troCastleMoves(board,r,c,p,rights,out);
    return out;
  }
  for(const[dr,dc]of TRO_DIR[p.t]){
    let tr=r+dr,tc=c+dc;
    while(push(tr,tc)){tr+=dr;tc+=dc;}
  }
  return out;
}

// LE COUP QUI RÉVÈLE. L'espion saute comme un cavalier, mais il saute DÉJÀ
// sous sa nouvelle couleur : il ne peut pas atterrir sur une pièce de son
// propriétaire secret (ce sont maintenant ses alliées) et il PEUT prendre une
// pièce de son ancien camp (ce sont maintenant ses ennemies). C'est le sens
// même de la variante : le cheval s'ouvre à l'intérieur des murs.
function troSpyMoves(board,r,c,owner,out){
  for(const[dr,dc]of TRO_KNIGHT){
    const tr=r+dr,tc=c+dc;
    if(!troIn(tr,tc))continue;
    const q=board[tr][tc];
    if(q&&q.color===owner)continue;
    out.push({from:{r,c},to:{r:tr,c:tc},reveal:owner});
  }
  return out;
}

function troCastleMoves(board,r,c,p,rights,out){
  const home=p.color==='w'?7:0;
  if(r!==home||c!==4)return;
  const key=p.color==='w'?'w':'b';
  const foe=troOpp(p.color);
  if(troAttacked(board,r,4,foe))return;
  const rook=(rr,rc)=>{const q=board[rr][rc];return q&&q.t==='r'&&q.color===p.color;};
  if(rights[key+'K']&&!board[home][5]&&!board[home][6]&&rook(home,7)
     &&!troAttacked(board,home,5,foe))
    out.push({from:{r,c},to:{r:home,c:6},castle:'K'});
  if(rights[key+'Q']&&!board[home][3]&&!board[home][2]&&!board[home][1]&&rook(home,0)
     &&!troAttacked(board,home,3,foe))
    out.push({from:{r,c},to:{r:home,c:2},castle:'Q'});
}

// LA CASE EST-ELLE ATTAQUÉE PAR LE CAMP `by` ? C'est ici, et à cet unique
// endroit, que « l'espion ne met pas en échec » est écrit : un cavalier qui
// porte encore son marquage d'espion n'attaque rien. Il BLOQUE toujours les
// lignes — c'est une pièce, elle est bien là —, mais elle ne menace personne.
function troAttacked(board,tr,tc,by){
  for(const[dr,dc]of TRO_KNIGHT){
    const p=board[tr+dr]&&board[tr+dr][tc+dc];
    if(p&&p.color===by&&p.t==='n'&&!p.spy)return true;
  }
  for(const[dr,dc]of TRO_DIR.q){
    const p=board[tr+dr]&&board[tr+dr][tc+dc];
    if(p&&p.color===by&&p.t==='k')return true;
  }
  const pd=by==='w'?1:-1;
  for(const dc of[-1,1]){
    const p=board[tr+pd]&&board[tr+pd][tc+dc];
    if(p&&p.color===by&&p.t==='p')return true;
  }
  for(const[dr,dc]of TRO_DIR.r){
    let r=tr+dr,c=tc+dc;
    while(troIn(r,c)){
      const p=board[r][c];
      if(p){if(p.color===by&&(p.t==='r'||p.t==='q'))return true;break;}
      r+=dr;c+=dc;
    }
  }
  for(const[dr,dc]of TRO_DIR.b){
    let r=tr+dr,c=tc+dc;
    while(troIn(r,c)){
      const p=board[r][c];
      if(p){if(p.color===by&&(p.t==='b'||p.t==='q'))return true;break;}
      r+=dr;c+=dc;
    }
  }
  return false;
}

function troFindKing(board,color){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t==='k'&&p.color===color)return{r,c};
  }
  return null;
}
function troInCheck(board,color){
  const k=troFindKing(board,color);
  return !!k&&troAttacked(board,k.r,k.c,troOpp(color));
}

// ----------------------------------------------------------------
// JOUER UN COUP
// ----------------------------------------------------------------
// La révélation REMPLACE l'objet de pièce, exactement comme la promotion : on
// ne mute jamais une pièce partagée entre un plateau et ses copies. Le nouvel
// objet garde l'identifiant — l'écran fait donc GLISSER le même cavalier au
// lieu d'en tuer un et d'en créer un autre, et c'est ce qui rend la
// révélation lisible.
function troApplyToBoard(board,mv){
  const p=board[mv.from.r][mv.from.c];
  if(!p)return null;
  const taken=board[mv.to.r][mv.to.c];
  board[mv.from.r][mv.from.c]=null;
  board[mv.to.r][mv.to.c]=mv.reveal
    ?{t:'n',color:mv.reveal,id:p.id}
    :(mv.promo?{t:mv.promo,color:p.color,id:p.id}:p);
  if(mv.epc){
    const v=board[mv.epc.r][mv.epc.c];
    board[mv.epc.r][mv.epc.c]=null;
    if(v)return v;
  }
  if(mv.castle){
    const home=mv.from.r;
    if(mv.castle==='K'){board[home][5]=board[home][7];board[home][7]=null;}
    else{board[home][3]=board[home][0];board[home][0]=null;}
  }
  return taken;
}

function troMakeRaw(st,mv){
  const b=st.board;
  const p=b[mv.from.r][mv.from.c];
  if(!p)return null;
  const moverType=p.t;
  // Le camp à qui ce coup appartient : celui qui joue, donc le propriétaire
  // secret quand l'espion se révèle — et non la couleur affichée de la pièce.
  const side=mv.reveal||p.color;
  const taken=troApplyToBoard(b,mv);
  const key=side==='w'?'w':'b';
  if(moverType==='k'||mv.castle){st.rights[key+'K']=false;st.rights[key+'Q']=false;}
  if(moverType==='r'&&!mv.reveal){
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
  // La prise en passant n'est ouverte que par la poussée de deux qui vient
  // d'être jouée, et par elle seule.
  st.ep=(mv.dbl&&moverType==='p')
    ?{r:(mv.from.r+mv.to.r)/2,c:mv.from.c,pr:mv.to.r,pc:mv.to.c}
    :null;
  // Une révélation est irréversible : elle remet le compteur des 50 coups à
  // zéro au même titre qu'une prise.
  st.halfmove=(taken||moverType==='p'||mv.reveal)?0:st.halfmove+1;
  if(mv.reveal)st.revealed[mv.reveal]=true;
  return taken;
}

function troMake(st,mv){
  const taken=troMakeRaw(st,mv);
  st.turn=troOpp(st.turn);
  st.ply++;
  return taken;
}

// Le coup laisse-t-il notre roi en sécurité ? Appelée des dizaines de milliers
// de fois par seconde : on sauve les huit rangées, on joue, on regarde, on
// remet tout en place, sans allouer autre chose que ces huit copies.
const _troSaved=[];
function troMoveIsSafe(st,mv,color){
  const b=st.board;
  for(let r=0;r<8;r++)_troSaved[r]=b[r].slice();
  troApplyToBoard(b,mv);
  const bad=troInCheck(b,color);
  for(let r=0;r<8;r++)b[r]=_troSaved[r];
  return !bad;
}

// LES DEUX JEUX DE COUPS D'UN JOUEUR : ses pièces, et son espion. Un cavalier
// espion apparaît donc dans DEUX listes — celle de son camp d'accueil, qui le
// joue sans savoir, et celle de son propriétaire, qui le révélerait.
function troPseudoMoves(st,color){
  const out=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    if(!p)continue;
    if(p.color===color)troPieceMoves(st.board,r,c,out,st.rights,st.ep);
    else if(p.spy===color&&p.t==='n')troSpyMoves(st.board,r,c,color,out);
  }
  return out;
}

function troLegalMoves(st,color){
  color=color||st.turn;
  return troPseudoMoves(st,color).filter(mv=>troMoveIsSafe(st,mv,color));
}

// Coups légaux d'une seule case : ce que l'écran demande quand on saisit une
// pièce. Les promotions sont repliées sur une entrée par case d'arrivée.
function troMovesFrom(st,r,c){
  const p=st.board[r][c];
  if(!p||st.gameOver)return[];
  if(p.color!==st.turn&&p.spy!==st.turn)return[];
  const raw=troLegalMoves(st,st.turn).filter(mv=>mv.from.r===r&&mv.from.c===c);
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
// LES ESPIONS FONT PARTIE DE LA POSITION : deux plateaux identiques dont les
// espions diffèrent n'offrent pas les mêmes coups, et la triple répétition se
// tromperait en les confondant.
function troPositionKey(st){
  let s='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    s+=p?((p.color===st.turn?p.t.toUpperCase():p.t)+(p.spy||'')):'.';
  }
  return s+st.turn+(st.rights.wK?'K':'')+(st.rights.wQ?'Q':'')+
    (st.rights.bK?'k':'')+(st.rights.bQ?'q':'')+(st.ep?'e'+st.ep.r+st.ep.c:'');
}

// Matériel insuffisant. UN ESPION NON RÉVÉLÉ NE COMPTE PAS POUR SON CAMP
// D'ACCUEIL mais reste du matériel sur le plateau : tant qu'il est là, la
// partie peut basculer d'un coup, et la déclarer nulle serait faux.
function troInsufficient(board){
  const men=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t!=='k')men.push(p);
  }
  if(men.some(p=>p.spy))return false;
  if(!men.length)return true;
  return men.length===1&&(men[0].t==='b'||men[0].t==='n');
}

function troUpdateStatus(st){
  const moves=troLegalMoves(st,st.turn);
  const check=troInCheck(st.board,st.turn);
  st.legalCount=moves.length;
  st.check=check;
  if(!moves.length){
    st.gameOver=true;
    if(check){st.result=troOpp(st.turn);st.reason='mat';}
    else{st.result='draw';st.reason='pat';}
    return st;
  }
  if(st.halfmove>=100){st.gameOver=true;st.result='draw';st.reason='50 coups';return st;}
  if(troInsufficient(st.board)){st.gameOver=true;st.result='draw';st.reason='matériel insuffisant';return st;}
  const key=troPositionKey(st);
  st.reps[key]=(st.reps[key]||0)+1;
  if(st.reps[key]>=3){st.gameOver=true;st.result='draw';st.reason='triple répétition';}
  return st;
}

// ----------------------------------------------------------------
// NOTATION
// ----------------------------------------------------------------
// Trajet complet plutôt qu'algébrique abrégée, comme dans les deux autres
// variantes. LA RÉVÉLATION PORTE SA MARQUE (⚑) : c'est l'événement de la
// partie, et un journal qui écrirait « b8–c6 » sans rien dire laisserait
// croire que les Noirs ont joué leur propre cavalier.
function troMoveText(mv,taken){
  if(mv.castle)return mv.castle==='K'?'O-O':'O-O-O';
  return troSquare(mv.from.r,mv.from.c)+((taken||mv.epc)?'×':'–')+troSquare(mv.to.r,mv.to.c)+
    (mv.promo?'='+TRO_NAME[mv.promo][0]:'')+(mv.reveal?' ⚑':'');
}

function troRecord(st,mv,taken,mover,pieceType){
  const mark=st.gameOver&&st.reason==='mat'?'#':(st.check?'+':'');
  st.moves.push({
    color:mover,
    num:Math.floor(st.moves.length/2)+1,
    piece:pieceType||'p',
    text:troMoveText(mv,taken)+mark,
    mv:troPackMove(mv),
  });
}

function troPackMove(mv){
  return{fr:mv.from.r,fc:mv.from.c,tr:mv.to.r,tc:mv.to.c,
    promo:mv.promo||null,castle:mv.castle||null,reveal:mv.reveal||null};
}
// Retrouve le coup LÉGAL correspondant à ce qu'on annonce. Sert à ramener le
// coup choisi par l'IA dans sa vision incomplète (troBeliefState) vers l'état
// réel de la partie : les deux listes coïncident, mais ce sont deux objets.
function troFindMove(st,pk){
  if(!pk)return null;
  const list=troLegalMoves(st,st.turn);
  return list.find(m=>m.from.r===pk.fr&&m.from.c===pk.fc&&m.to.r===pk.tr&&m.to.c===pk.tc&&
    (m.promo||null)===(pk.promo||null)&&(m.castle||null)===(pk.castle||null)&&
    (m.reveal||null)===(pk.reveal||null))||null;
}

if(typeof window!=='undefined'){
  window.troNewState=troNewState;
  window.troSetSpy=troSetSpy;
}
if(typeof module!=='undefined'&&module.exports){
  module.exports={troNewState,troCloneState,troSetSpy,troFindSpy,troSpyChoices,
    troApplyToBoard,troMakeRaw,troMake,troMoveIsSafe,troPseudoMoves,troLegalMoves,
    troMovesFrom,troPieceMoves,troSpyMoves,troAttacked,troInCheck,troFindKing,
    troInsufficient,troUpdateStatus,troPositionKey,troRecord,troMoveText,
    troPackMove,troFindMove,troSquare,troOpp,troIn,
    TRO_VALUE,TRO_ART,TRO_NAME,TRO_FILES,TRO_DIR,TRO_KNIGHT};
}
