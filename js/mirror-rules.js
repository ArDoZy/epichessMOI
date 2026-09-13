// ================================================================
// MIRROR-RULES.JS : « Mirror Chess », le moteur de règles
// ================================================================
// La variante tient en une phrase : ON JOUE AUX ÉCHECS ORDINAIRES, MAIS
// CHAQUE PIÈCE EST JUMELÉE À SA SYMÉTRIQUE, ET BOUGER L'UNE FAIT BOUGER
// L'AUTRE. Les paires sont fixées au coup d'envoi par la symétrie axiale du
// plateau (colonne c ↔ colonne 7−c) : chez les Blancs, le Roi e1 est jumelé
// à la Dame d1, les fous c1 et f1 entre eux, les cavaliers b1 et g1, les
// tours a1 et h1, et les pions deux à deux — d2 avec e2, c2 avec f2, b2 avec
// g2, a2 avec h2. Les Noirs ont exactement les mêmes paires.
//
// LE COUP JUMEAU. Quand vous jouez une pièce, sa jumelle part dans la
// direction MIROIR — la gauche et la droite s'échangent, l'avant et
// l'arrière ne changent pas — et du MÊME NOMBRE DE CASES. La tour a1 qui va
// en c1 (deux cases à droite) envoie la tour h1 en f1 (deux cases à gauche) ;
// le fou c1 qui va en a3 (haut-gauche) envoie le fou f1 en h3 (haut-droite).
// Tant que rien ne bloque, la symétrie de la position se conserve d'elle-même.
//
// LE REPLI, quand la jumelle ne peut pas faire les N cases demandées : elle
// en fait LE PLUS POSSIBLE SANS DÉPASSER N, en s'arrêtant devant une pièce
// amie et EN PRENANT la pièce ennemie sur laquelle elle tombe. Si elle ne
// peut faire aucune case — bloquée tout de suite, ou incapable de cette
// direction-là —, elle reste sur place et le coup d'origine reste légal.
// Elle ne va JAMAIS plus loin que la pièce jouée, elle ne saute rien, elle ne
// pousse rien.
//
// LA PAIRE DÉPAREILLÉE, ET C'EST LE CŒUR DE LA VARIANTE : le Roi est jumelé
// à la DAME. La Dame qui traverse le plateau en quatre cases fait marcher le
// Roi d'une case — « le plus possible sans dépasser » —, dans la direction
// miroir. Jouer sa Dame, c'est donc promener son Roi à chaque coup, et c'est
// ce qui rend cette variante mortelle. Le Roi tiré sur une case attaquée ne
// se sauve pas tout seul : le coup entier devient simplement illégal.
//
// LE CAVALIER n'a pas de « nombre de cases » : son jumeau fait le saut
// miroir exact, ou il ne bouge pas. Il n'y a rien à raccourcir dans un saut.
//
// LE VEUVAGE. Une pièce dont la jumelle est prise bouge SEULE pour le reste
// de la partie : on ne se re-jumelle jamais. Perdre une pièce libère donc sa
// sœur — c'est la seule compensation d'une perte, et elle compte.
//
// CE QUI EST CONSERVÉ DES ÉCHECS : tous les déplacements, la prise, l'échec,
// le mat, le pat, la promotion, le roque, la prise en passant, la règle des
// 50 coups et la triple répétition.
//
// TROIS RÈGLES DE RÉSOLUTION, dans cet ordre, et il n'y en a pas d'autres :
//   1. LA PIÈCE JOUÉE BOUGE D'ABORD, la jumelle ensuite. La jumelle voit donc
//      le plateau d'APRÈS : elle est bloquée par la case que la pièce jouée
//      vient d'occuper, et elle ne peut pas y atterrir.
//   2. LA LÉGALITÉ SE JUGE APRÈS LES DEUX DÉPLACEMENTS. Un coup est légal si,
//      une fois la pièce ET sa jumelle posées, votre roi n'est pas en échec.
//      Le coup jumeau n'est jamais facultatif : on ne peut pas le refuser
//      pour se sauver.
//   3. AUCUNE RÉACTION EN CHAÎNE. Le coup jumeau ne réveille pas la jumelle
//      de la jumelle (il n'y en a pas : les paires sont deux à deux), et la
//      tour du roque, qui saute avec le Roi, ne déclenche pas la sienne —
//      le roque est UN coup de roi, pas un coup de tour.
//
// Le roque, justement, mérite sa ligne : le Roi fait deux cases, donc la Dame
// en fait deux en miroir si elle peut. Roquer du petit côté tire la Dame vers
// la gauche ; c'est rarement gratuit.
//
// Ce fichier ne connaît ni le DOM ni le réseau : il ne manipule qu'un objet
// d'état. Dépendances : aucune. Utilisé par : mirror-ai.js (recherche),
// mirror-game.js (écran de jeu), mirror-mp.js (parties en ligne).
//
// POURQUOI DU FAIRE/DÉFAIRE ET NON DES COPIES. Le moteur de la Chute des
// Royaumes clone huit rangées à chaque nœud ; ici un coup est DEUX
// déplacements, et la recherche en paierait le double. Tout passe donc par
// mirDoMove/mirUndoMove, qui mutent le plateau et savent le remettre exactement
// comme il était — y compris les droits au roque et les cases de prise en
// passant. C'est la seule optimisation de ce fichier, et elle est locale.
// ================================================================

const MIR_VALUE={p:100,n:320,b:330,r:500,q:900,k:0};
const MIR_ART={p:'std-pawn',n:'std-n',b:'std-b',r:'std-r',q:'dame',k:'roi'};
const MIR_NAME={p:'Pion',n:'Cavalier',b:'Fou',r:'Tour',q:'Dame',k:'Roi'};
const MIR_FILES=['a','b','c','d','e','f','g','h'];

function mirIn(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function mirOpp(color){return color==='w'?'b':'w';}
function mirSquare(r,c){return MIR_FILES[c]+(8-r);}
function mirSign(n){return n>0?1:(n<0?-1:0);}

const MIR_DIR={
  r:[[1,0],[-1,0],[0,1],[0,-1]],
  b:[[1,1],[1,-1],[-1,1],[-1,-1]],
  q:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
};
const MIR_KNIGHT=[[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];

// ----------------------------------------------------------------
// L'ÉTAT
// ----------------------------------------------------------------
// board[r][c] = null ou {t,color,id,mate}. `mate` est l'identifiant de la
// pièce jumelle, posé au coup d'envoi et JAMAIS modifié ensuite : le lien
// suit la pièce, pas la case. Une position symétrique en apparence ne
// rétablit donc aucune paire rompue, et une pièce dont la jumelle est prise
// garde un `mate` qui ne désigne plus personne — c'est exactement ce qui la
// rend veuve (mirFindMate ne trouve rien et ne rend aucun coup jumeau).
function mirNewState(){
  const back=['r','n','b','q','k','b','n','r'];
  const board=[];
  for(let r=0;r<8;r++)board.push(new Array(8).fill(null));
  let uid=0;
  const mk=(r,c,t,color)=>{board[r][c]={t,color,id:'p'+(uid++),mate:null};};
  for(let c=0;c<8;c++){
    mk(0,c,back[c],'b');mk(1,c,'p','b');mk(6,c,'p','w');mk(7,c,back[c],'w');
  }
  // Le jumelage, et c'est toute la mise en place de la variante : sur chacune
  // des quatre rangées peuplées, la colonne c se lie à la colonne 7−c.
  for(const r of [0,1,6,7])for(let c=0;c<4;c++){
    const a=board[r][c],b=board[r][7-c];
    a.mate=b.id;b.mate=a.id;
  }
  return{
    board,
    turn:'w',
    uid,
    rights:{wK:true,wQ:true,bK:true,bQ:true},
    ep:[],               // cases de prise en passant ouvertes (jusqu'à DEUX :
                         //  une paire de pions peut pousser de deux ensemble)
    halfmove:0,          // demi-coups sans prise ni poussée de pion
    ply:0,
    moves:[],            // journal : {color,num,piece,text,mv}
    captured:{w:[],b:[]},
    lastMove:null,       // {from,to,tfrom,tto} — les QUATRE cases du coup
    gameOver:false,
    result:null,
    reason:'',
    reps:Object.create(null),
  };
}

// Le clone ne sert qu'aux rares endroits qui ne peuvent pas défaire (l'écran
// de jeu, pour prévisualiser). La recherche, elle, fait/défait.
function mirCloneState(st){
  const board=[];
  for(let r=0;r<8;r++)board.push(st.board[r].slice());
  return{
    board,turn:st.turn,uid:st.uid,
    rights:{wK:st.rights.wK,wQ:st.rights.wQ,bK:st.rights.bK,bQ:st.rights.bQ},
    ep:st.ep.slice(),halfmove:st.halfmove,ply:st.ply,
    moves:st.moves,captured:st.captured,lastMove:st.lastMove,
    gameOver:st.gameOver,result:st.result,reason:st.reason,reps:Object.create(null),
  };
}

// Où est la pièce d'identifiant `id` ? Un balayage des 64 cases, appelé une
// fois par coup engendré. Une table id→case serait plus rapide et devrait
// être tenue à jour par faire/défaire : deux sources de vérité pour gagner
// quelques pourcents, on s'en passe.
function mirFindMate(board,piece){
  if(!piece||!piece.mate)return null;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const q=board[r][c];
    if(q&&q.id===piece.mate)return{r,c,p:q};
  }
  return null;
}

// ----------------------------------------------------------------
// LA FORME D'UN COUP
// ----------------------------------------------------------------
// Ce que la jumelle doit imiter : soit un SAUT (le cavalier, qu'on ne peut ni
// raccourcir ni rallonger), soit une GLISSADE — une direction d'une case et
// un nombre de pas. La poussée de deux du pion, le roque et la prise en
// diagonale rentrent tous dans la glissade, ce qui évite d'avoir un cas
// particulier par coup spécial.
function mirShape(piece,mv){
  const dr=mv.to.r-mv.from.r,dc=mv.to.c-mv.from.c;
  if(piece.t==='n')return{jump:true,dr,dc};
  return{jump:false,ur:mirSign(dr),uc:mirSign(dc),n:Math.max(Math.abs(dr),Math.abs(dc))};
}

// LE COUP JUMEAU, sur le plateau d'APRÈS le coup joué. `ur,uc` sont déjà
// retournés en miroir par l'appelant. Rend null quand la jumelle ne peut
// faire aucune case : ce n'est pas une erreur, c'est le repli à zéro.
function mirTwinSlide(board,r,c,p,ur,uc,n,ep){
  if(p.t==='n')return null;                                  // un cavalier ne glisse pas
  if(p.t==='r'&&ur!==0&&uc!==0)return null;                  // une tour ne va pas en diagonale
  if(p.t==='b'&&(ur===0||uc===0))return null;                // un fou ne va pas tout droit
  if(p.t==='p')return mirTwinPawn(board,r,c,p,ur,uc,n,ep);
  const lim=p.t==='k'?Math.min(n,1):n;                       // le Roi ne fait qu'un pas
  let k=0;
  for(let i=1;i<=lim;i++){
    const nr=r+ur*i,nc=c+uc*i;
    if(!mirIn(nr,nc))break;
    const q=board[nr][nc];
    if(q&&q.color===p.color)break;                           // on s'arrête DEVANT une amie
    k=i;
    if(q)break;                                              // et SUR une ennemie, qu'on prend
  }
  if(!k)return null;
  return{from:{r,c},to:{r:r+ur*k,c:c+uc*k}};
}

// Le pion jumeau. C'est la pièce dont les déplacements dépendent le plus de
// ce qu'il y a sur la case d'arrivée, donc celle où le repli demande le plus
// de soin : EN DIAGONALE, UN PION NE SE DÉPLACE QUE S'IL PREND. Sans rien à
// prendre en diagonale miroir, il ne bouge pas du tout — il n'avance pas tout
// droit « à défaut », ce qui inventerait un déplacement que les échecs ne
// connaissent pas.
function mirTwinPawn(board,r,c,p,ur,uc,n,ep){
  const f=p.color==='w'?-1:1;
  if(ur!==f||n<1)return null;                                // jamais en arrière, jamais de côté
  const last=p.color==='w'?0:7;
  if(uc===0){
    const start=p.color==='w'?6:1;
    const lim=Math.min(n,r===start?2:1);
    let k=0;
    for(let i=1;i<=lim;i++){
      const nr=r+f*i;
      if(!mirIn(nr,c)||board[nr][c])break;                   // un pion ne prend pas devant lui
      k=i;
    }
    if(!k)return null;
    return{from:{r,c},to:{r:r+f*k,c},dbl:k===2,needPromo:r+f*k===last};
  }
  if(Math.abs(uc)!==1)return null;
  const nr=r+f,nc=c+uc;
  if(!mirIn(nr,nc))return null;
  const q=board[nr][nc];
  if(q)return q.color===p.color?null:{from:{r,c},to:{r:nr,c:nc},needPromo:nr===last};
  for(const e of ep||[]){
    if(e.r!==nr||e.c!==nc)continue;
    const v=board[e.pr][e.pc];
    if(v&&v.t==='p'&&v.color!==p.color)return{from:{r,c},to:{r:nr,c:nc},epc:{r:e.pr,c:e.pc}};
  }
  return null;
}

function mirTwinJump(board,r,c,p,dr,dc){
  if(p.t!=='n')return null;                                  // seul un cavalier saute
  const nr=r+dr,nc=c+dc;
  if(!mirIn(nr,nc))return null;
  const q=board[nr][nc];
  if(q&&q.color===p.color)return null;
  return{from:{r,c},to:{r:nr,c:nc}};
}

// ----------------------------------------------------------------
// FAIRE ET DÉFAIRE
// ----------------------------------------------------------------
// LA PROMOTION CRÉE UN NOUVEL OBJET au lieu de changer le type de l'ancien :
// les pièces sont partagées entre un plateau et ses copies, et muter la pièce
// promouvrait aussi le pion de l'original. Le nouvel objet garde l'identifiant
// ET le jumelage : promouvoir ne rompt aucune paire.
function mirPromoted(p,t){return{t,color:p.color,id:p.id,mate:p.mate};}

// Un demi-déplacement (la pièce jouée OU sa jumelle), avec de quoi le défaire.
function mirDoStep(board,step){
  const p=board[step.from.r][step.from.c];
  const taken=board[step.to.r][step.to.c];
  const rec={step,p,taken,epTaken:null};
  board[step.from.r][step.from.c]=null;
  board[step.to.r][step.to.c]=step.promo?mirPromoted(p,step.promo):p;
  if(step.epc){
    rec.epTaken=board[step.epc.r][step.epc.c];
    board[step.epc.r][step.epc.c]=null;
  }
  if(step.castle){
    const h=step.from.r;
    rec.rookFrom=step.castle==='K'?{r:h,c:7}:{r:h,c:0};
    rec.rookTo=step.castle==='K'?{r:h,c:5}:{r:h,c:3};
    rec.rook=board[rec.rookFrom.r][rec.rookFrom.c];
    board[rec.rookTo.r][rec.rookTo.c]=rec.rook;
    board[rec.rookFrom.r][rec.rookFrom.c]=null;
  }
  return rec;
}
function mirUndoStep(board,rec){
  const step=rec.step;
  if(step.castle){
    board[rec.rookFrom.r][rec.rookFrom.c]=rec.rook;
    board[rec.rookTo.r][rec.rookTo.c]=null;
  }
  board[step.from.r][step.from.c]=rec.p;
  board[step.to.r][step.to.c]=rec.taken;
  if(step.epc)board[step.epc.r][step.epc.c]=rec.epTaken;
}

// LE COUP ENTIER : la pièce jouée, puis sa jumelle. Défaire se fait dans
// l'ordre inverse, sinon la jumelle repose sa pièce sur une case que le coup
// principal n'a pas encore libérée.
function mirDoMove(board,mv){
  const a=mirDoStep(board,mv);
  const b=mv.twin?mirDoStep(board,mv.twin):null;
  return{a,b};
}
function mirUndoMove(board,rec){
  if(rec.b)mirUndoStep(board,rec.b);
  mirUndoStep(board,rec.a);
}

// Le coup jumeau que ce coup-ci déclenche, calculé sur le plateau d'APRÈS le
// coup principal — c'est la règle n°1, et c'est pour ça qu'on fait puis
// défait ici plutôt que de lire le plateau tel quel.
function mirResolveTwin(board,mv,ep){
  const p=board[mv.from.r][mv.from.c];
  if(!p||!p.mate)return null;
  const shape=mirShape(p,mv);
  const rec=mirDoStep(board,mv);
  let tw=null;
  const m=mirFindMate(board,p);
  if(m){
    tw=shape.jump
      ? mirTwinJump(board,m.r,m.c,m.p,shape.dr,-shape.dc)
      : mirTwinSlide(board,m.r,m.c,m.p,shape.ur,-shape.uc,shape.n,ep);
  }
  mirUndoStep(board,rec);
  return tw;
}

// ----------------------------------------------------------------
// DÉPLACEMENTS PSEUDO-LÉGAUX DE LA PIÈCE JOUÉE
// ----------------------------------------------------------------
function mirPieceMoves(board,r,c,out,rights,ep){
  const p=board[r][c];
  if(!p)return out;
  const me=p.color,them=mirOpp(me);
  const push=(tr,tc)=>{
    if(!mirIn(tr,tc))return false;
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
    if(mirIn(one,c)&&!board[one][c]){
      if(one===last)for(const g of['q','r','b','n'])out.push({from:{r,c},to:{r:one,c},promo:g});
      else out.push({from:{r,c},to:{r:one,c}});
      const two=r+dir*2;
      if(r===start&&mirIn(two,c)&&!board[two][c])out.push({from:{r,c},to:{r:two,c},dbl:true});
    }
    for(const dc of[-1,1]){
      const tr=one,tc=c+dc;
      if(!mirIn(tr,tc))continue;
      const q=board[tr][tc];
      if(q&&q.color===them){
        if(tr===last)for(const g of['q','r','b','n'])out.push({from:{r,c},to:{r:tr,c:tc},promo:g});
        else out.push({from:{r,c},to:{r:tr,c:tc}});
        continue;
      }
      if(q)continue;
      for(const e of ep||[]){
        if(e.r!==tr||e.c!==tc)continue;
        const v=board[e.pr][e.pc];
        if(v&&v.t==='p'&&v.color===them)out.push({from:{r,c},to:{r:tr,c:tc},epc:{r:e.pr,c:e.pc}});
      }
    }
    return out;
  }
  if(p.t==='n'){for(const[dr,dc]of MIR_KNIGHT)push(r+dr,c+dc);return out;}
  if(p.t==='k'){
    for(const[dr,dc]of MIR_DIR.q)push(r+dr,c+dc);
    if(rights)mirCastleMoves(board,r,c,p,rights,out);
    return out;
  }
  for(const[dr,dc]of MIR_DIR[p.t]){
    let tr=r+dr,tc=c+dc;
    while(push(tr,tc)){tr+=dr;tc+=dc;}
  }
  return out;
}

// LE ROQUE EST CONSERVÉ, et il coûte : le Roi fait deux cases, donc la Dame —
// sa jumelle — en fait deux en miroir si elle le peut. On garde ici les
// conditions ordinaires (ni en échec, ni à travers l'échec, cases vides,
// droits intacts) ; la case d'ARRIVÉE, elle, est jugée comme toutes les
// autres, une fois les deux déplacements faits.
function mirCastleMoves(board,r,c,p,rights,out){
  const home=p.color==='w'?7:0;
  if(r!==home||c!==4)return;
  const key=p.color==='w'?'w':'b';
  const foe=mirOpp(p.color);
  if(mirAttacked(board,r,4,foe))return;
  const rook=(rr,rc)=>{const q=board[rr][rc];return q&&q.t==='r'&&q.color===p.color;};
  if(rights[key+'K']&&!board[home][5]&&!board[home][6]&&rook(home,7)
     &&!mirAttacked(board,home,5,foe))
    out.push({from:{r,c},to:{r:home,c:6},castle:'K'});
  if(rights[key+'Q']&&!board[home][3]&&!board[home][2]&&!board[home][1]&&rook(home,0)
     &&!mirAttacked(board,home,3,foe))
    out.push({from:{r,c},to:{r:home,c:2},castle:'Q'});
}

function mirAttacked(board,tr,tc,by){
  for(const[dr,dc]of MIR_KNIGHT){
    const p=board[tr+dr]&&board[tr+dr][tc+dc];
    if(p&&p.color===by&&p.t==='n')return true;
  }
  for(const[dr,dc]of MIR_DIR.q){
    const p=board[tr+dr]&&board[tr+dr][tc+dc];
    if(p&&p.color===by&&p.t==='k')return true;
  }
  const pd=by==='w'?1:-1;
  for(const dc of[-1,1]){
    const p=board[tr+pd]&&board[tr+pd][tc+dc];
    if(p&&p.color===by&&p.t==='p')return true;
  }
  for(const[dr,dc]of MIR_DIR.r){
    let r=tr+dr,c=tc+dc;
    while(mirIn(r,c)){
      const p=board[r][c];
      if(p){if(p.color===by&&(p.t==='r'||p.t==='q'))return true;break;}
      r+=dr;c+=dc;
    }
  }
  for(const[dr,dc]of MIR_DIR.b){
    let r=tr+dr,c=tc+dc;
    while(mirIn(r,c)){
      const p=board[r][c];
      if(p){if(p.color===by&&(p.t==='b'||p.t==='q'))return true;break;}
      r+=dr;c+=dc;
    }
  }
  return false;
}

function mirFindKing(board,color){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t==='k'&&p.color===color)return{r,c};
  }
  return null;
}
function mirInCheck(board,color){
  const k=mirFindKing(board,color);
  return !!k&&mirAttacked(board,k.r,k.c,mirOpp(color));
}

// ----------------------------------------------------------------
// ENGENDRER LES COUPS
// ----------------------------------------------------------------
// Chaque coup porte SON coup jumeau (`mv.twin`), résolu ici une fois pour
// toutes : le reste du programme — l'écran, la recherche, le réseau — n'a
// jamais à le recalculer, et il n'existe donc qu'UN seul endroit dans le jeu
// où la règle du miroir est écrite.
function mirGenerate(st,color){
  color=color||st.turn;
  const raw=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    if(p&&p.color===color)mirPieceMoves(st.board,r,c,raw,st.rights,st.ep);
  }
  const out=[];
  for(const mv of raw){
    const tw=mirResolveTwin(st.board,mv,st.ep);
    // Un pion jumeau qui atteint la dernière rangée promeut lui aussi, et le
    // joueur choisit sa pièce SÉPARÉMENT : on ouvre donc les quatre branches.
    if(tw&&tw.needPromo){
      for(const g of['q','r','b','n']){
        const t={from:tw.from,to:tw.to,promo:g,dbl:tw.dbl||false};
        out.push(Object.assign({},mv,{twin:t}));
      }
      continue;
    }
    mv.twin=tw;
    out.push(mv);
  }
  return out;
}

// LA LÉGALITÉ SE JUGE APRÈS LES DEUX DÉPLACEMENTS : c'est la règle n°2, et
// c'est cette fonction qui la porte. Elle est appelée des dizaines de milliers
// de fois par seconde pendant que l'IA cherche — d'où le faire/défaire.
function mirMoveIsSafe(st,mv,color){
  const rec=mirDoMove(st.board,mv);
  const bad=mirInCheck(st.board,color);
  mirUndoMove(st.board,rec);
  return !bad;
}

function mirLegalMoves(st,color){
  color=color||st.turn;
  return mirGenerate(st,color).filter(mv=>mirMoveIsSafe(st,mv,color));
}

// Coups légaux d'une seule case : ce que l'écran demande quand on saisit une
// pièce. Les variantes de promotion sont repliées sur une entrée par case
// d'arrivée — le choix des pièces se fait ensuite, dans une fenêtre.
function mirMovesFrom(st,r,c){
  const p=st.board[r][c];
  if(!p||p.color!==st.turn||st.gameOver)return[];
  const raw=mirGenerate(st,p.color).filter(mv=>
    mv.from.r===r&&mv.from.c===c&&mirMoveIsSafe(st,mv,p.color));
  const seen=new Set(),out=[];
  for(const mv of raw){
    const k=mv.to.r+','+mv.to.c;
    if(seen.has(k))continue;
    seen.add(k);out.push(mv);
  }
  return out;
}
// Toutes les variantes d'un même trajet (les quatre promotions de la pièce
// jouée × les quatre de sa jumelle) : l'écran en a besoin pour poser ses
// questions de promotion.
function mirMovesTo(st,from,to){
  const p=st.board[from.r][from.c];
  if(!p)return[];
  return mirGenerate(st,p.color).filter(mv=>
    mv.from.r===from.r&&mv.from.c===from.c&&mv.to.r===to.r&&mv.to.c===to.c&&
    mirMoveIsSafe(st,mv,p.color));
}

// ----------------------------------------------------------------
// JOUER UN COUP POUR DE BON
// ----------------------------------------------------------------
// Droits au roque : perdus dès que le roi ou la tour concernée bouge — et
// « bouge » inclut ÊTRE TIRÉ PAR SA JUMELLE. Une Dame qui promène son Roi lui
// coûte donc le roque, exactement comme s'il avait été joué.
function mirTouch(st,step,piece,taken){
  if(!piece)return;
  const key=piece.color==='w'?'w':'b';
  const home=piece.color==='w'?7:0;
  if(piece.t==='k'||step.castle){st.rights[key+'K']=false;st.rights[key+'Q']=false;}
  if(piece.t==='r'&&step.from.r===home){
    if(step.from.c===0)st.rights[key+'Q']=false;
    if(step.from.c===7)st.rights[key+'K']=false;
  }
  if(taken&&taken.t==='r'){
    const tk=taken.color==='w'?'w':'b';
    const th=taken.color==='w'?7:0;
    if(step.to.r===th&&step.to.c===0)st.rights[tk+'Q']=false;
    if(step.to.r===th&&step.to.c===7)st.rights[tk+'K']=false;
  }
}

// Les cases de prise en passant ouvertes par CE coup. Il peut y en avoir deux :
// une paire de pions jumeaux qui pousse de deux en ouvre une chacune.
function mirNewEp(mv,board){
  const out=[];
  const add=step=>{
    if(!step||!step.dbl)return;
    const p=board[step.to.r][step.to.c];
    if(!p||p.t!=='p')return;
    out.push({r:(step.from.r+step.to.r)/2,c:step.from.c,pr:step.to.r,pc:step.to.c});
  };
  add(mv);add(mv.twin);
  return out;
}

// DEUX TEMPS, PARCE QUE L'ÉCRAN EN A BESOIN. La recherche joue un coup d'un
// bloc (mirMake) ; l'écran, lui, pose d'abord la pièce jouée, laisse un
// battement, puis fait partir la jumelle — c'est ainsi qu'on VOIT la règle au
// lieu de la subir. Les deux chemins passent par les mêmes fonctions : il n'y
// a jamais deux façons de jouer un coup dans ce fichier.
function mirMakeFirst(st,mv){
  const b=st.board;
  const rec={pending:mv,
    mover:b[mv.from.r][mv.from.c],
    twinPiece:mv.twin?b[mv.twin.from.r][mv.twin.from.c]:null,
    prevRights:{wK:st.rights.wK,wQ:st.rights.wQ,bK:st.rights.bK,bQ:st.rights.bQ},
    prevEp:st.ep,prevHalf:st.halfmove};
  rec.a=mirDoStep(b,mv);
  rec.b=null;
  rec.taken=[rec.a.taken||rec.a.epTaken||null,null];
  return rec;
}
function mirMakeRest(st,rec){
  const mv=rec.pending;
  if(mv.twin){
    rec.b=mirDoStep(st.board,mv.twin);
    rec.taken[1]=rec.b.taken||rec.b.epTaken||null;
  }
  mirTouch(st,mv,rec.mover,rec.a.taken);
  if(mv.twin)mirTouch(st,mv.twin,rec.twinPiece,rec.b.taken);
  const pawnMoved=(rec.mover&&rec.mover.t==='p')||(rec.twinPiece&&rec.twinPiece.t==='p');
  st.halfmove=(rec.taken[0]||rec.taken[1]||pawnMoved)?0:st.halfmove+1;
  st.ep=mirNewEp(mv,st.board);
  st.turn=mirOpp(st.turn);
  st.ply++;
  return rec;
}
function mirMake(st,mv){return mirMakeRest(st,mirMakeFirst(st,mv));}
function mirUnmake(st,rec){
  mirUndoMove(st.board,rec);
  st.rights=rec.prevRights;
  st.ep=rec.prevEp;
  st.halfmove=rec.prevHalf;
  st.turn=mirOpp(st.turn);
  st.ply--;
}

// ----------------------------------------------------------------
// FIN DE PARTIE
// ----------------------------------------------------------------
function mirPositionKey(st){
  let s='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    s+=p?(p.color===st.turn?p.t.toUpperCase():p.t):'.';
  }
  s+=st.turn+(st.rights.wK?'K':'')+(st.rights.wQ?'Q':'')+(st.rights.bK?'k':'')+(st.rights.bQ?'q':'');
  // Les paires font partie de la position : deux plateaux identiques dont les
  // veuvages diffèrent n'offrent pas les mêmes coups, et la triple répétition
  // se tromperait en les confondant.
  const links=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    if(p&&p.mate&&mirFindMate(st.board,p))links.push(r*8+c);
  }
  return s+'|'+links.join('.')+'|'+st.ep.map(e=>e.r*8+e.c).join('.');
}

function mirInsufficient(board){
  const men=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.t!=='k')men.push(p.t);
  }
  if(!men.length)return true;
  return men.length===1&&(men[0]==='b'||men[0]==='n');
}

function mirUpdateStatus(st){
  const moves=mirLegalMoves(st,st.turn);
  const check=mirInCheck(st.board,st.turn);
  st.legalCount=moves.length;
  st.check=check;
  if(!moves.length){
    st.gameOver=true;
    if(check){st.result=mirOpp(st.turn);st.reason='mat';}
    else{st.result='draw';st.reason='pat';}
    return st;
  }
  if(st.halfmove>=100){st.gameOver=true;st.result='draw';st.reason='50 coups';return st;}
  if(mirInsufficient(st.board)){st.gameOver=true;st.result='draw';st.reason='matériel insuffisant';return st;}
  const key=mirPositionKey(st);
  st.reps[key]=(st.reps[key]||0)+1;
  if(st.reps[key]>=3){st.gameOver=true;st.result='draw';st.reason='triple répétition';}
  return st;
}

// ----------------------------------------------------------------
// NOTATION
// ----------------------------------------------------------------
// Pas d'algébrique abrégée : un coup de cette variante est DEUX déplacements,
// et « Cf3 » n'en nommerait qu'un. On écrit les deux trajets complets, séparés
// par un point médian — le second est le coup jumeau, et son absence se lit
// aussi (pièce veuve, ou jumelle bloquée à zéro case).
function mirStepText(step,taken){
  if(step.castle)return step.castle==='K'?'O-O':'O-O-O';
  // La prise en passant laisse la case d'arrivée vide : sans ce `step.epc`,
  // elle s'écrirait comme un déplacement tranquille.
  return mirSquare(step.from.r,step.from.c)+((taken||step.epc)?'×':'–')+mirSquare(step.to.r,step.to.c)+
    (step.promo?'='+MIR_NAME[step.promo][0]:'');
}
function mirMoveText(mv,tk){
  const a=mirStepText(mv,tk&&tk[0]);
  if(!mv.twin)return a;
  return a+' · '+mirStepText(mv.twin,tk&&tk[1]);
}

function mirRecord(st,mv,tk,mover,pieceType){
  const mark=st.gameOver&&st.reason==='mat'?'#':(st.check?'+':'');
  st.moves.push({
    color:mover,
    num:Math.floor(st.moves.length/2)+1,
    piece:pieceType||'p',
    text:mirMoveText(mv,tk)+mark,
    mv:mirPackMove(mv),
  });
}

// Sérialisation réseau : la pièce JOUÉE seulement, plus le choix de promotion
// de sa jumelle. Le coup jumeau, lui, n'est jamais transmis — il se recalcule
// à l'identique des deux côtés, et le recalculer est précisément ce qui
// empêche un client bricolé de faire bouger une jumelle comme il veut.
function mirPackMove(mv){
  return{fr:mv.from.r,fc:mv.from.c,tr:mv.to.r,tc:mv.to.c,
    promo:mv.promo||null,castle:mv.castle||null,
    tpromo:(mv.twin&&mv.twin.promo)||null};
}
function mirFindMove(st,pk){
  if(!pk)return null;
  const list=mirLegalMoves(st,st.turn);
  return list.find(m=>m.from.r===pk.fr&&m.from.c===pk.fc&&m.to.r===pk.tr&&m.to.c===pk.tc&&
    (m.promo||null)===(pk.promo||null)&&(m.castle||null)===(pk.castle||null)&&
    ((m.twin&&m.twin.promo)||null)===(pk.tpromo||null))||null;
}

if(typeof window!=='undefined'){
  window.mirNewState=mirNewState;
}
if(typeof module!=='undefined'&&module.exports){
  module.exports={mirNewState,mirCloneState,mirFindMate,mirShape,mirResolveTwin,
    mirDoMove,mirUndoMove,mirMake,mirMakeFirst,mirMakeRest,mirUnmake,mirDoStep,mirUndoStep,mirGenerate,mirLegalMoves,mirMovesFrom,mirMovesTo,
    mirMoveIsSafe,mirPieceMoves,mirAttacked,mirInCheck,mirFindKing,mirInsufficient,
    mirUpdateStatus,mirPositionKey,mirRecord,mirMoveText,mirStepText,mirPackMove,mirFindMove,
    mirSquare,mirOpp,mirIn,MIR_VALUE,MIR_ART,MIR_NAME,MIR_DIR,MIR_KNIGHT,MIR_FILES};
}
