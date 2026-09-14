// ================================================================
// TROIE-AI.JS : l'adversaire du « Cheval de Troie »
// ================================================================
// Une recherche alpha-bêta ordinaire — négamax, approfondissement itératif,
// quiescence sur les prises — posée sur le moteur de la variante
// (js/troie-rules.js), comme celle de Board Quake l'est sur le sien.
//
// CE QUI CHANGE TOUT : L'IA NE DOIT PAS SAVOIR. Dans cette variante, l'état
// de la partie contient une information que l'adversaire n'a pas le droit de
// lire — QUEL DE SES CAVALIERS est l'espion du joueur. Une IA qui chercherait
// dans l'état réel jouerait en sachant lequel de ses cavaliers va la trahir,
// le mettrait à l'abri, et la variante n'aurait plus aucun sel.
//
// D'où troBeliefState : avant chaque recherche, on donne à l'IA une COPIE DE
// LA PARTIE OÙ L'ESPION DU JOUEUR N'EXISTE PAS. Elle voit ses deux cavaliers
// comme deux cavaliers ordinaires, exactement comme un humain à sa place ;
// elle garde en revanche SON espion à elle, qu'elle a le droit de connaître
// puisqu'elle l'a choisi.
//
// CETTE VISION EST SÛRE, et ce n'est pas une chance : un coup légal dans la
// vision l'est aussi dans la partie réelle. La légalité ne dépend que de la
// sécurité de SON PROPRE roi, et le cavalier qu'on lui a « démasqué » est de
// SA couleur — il ne menaçait pas son roi avant, il ne le menace pas après.
// Le seul écart possible est en sa défaveur (elle croit donner un échec qui
// n'a pas lieu), et c'est très exactement ce qu'un joueur trompé ressent.
//
// LA RECHERCHE TOURNE SUR LE FIL PRINCIPAL, avec un budget court (au plus
// 700 ms), comme celle des autres variantes : l'écran ne doit pas se figer, et
// l'approfondissement itératif rend le meilleur coup trouvé à l'instant où le
// budget s'épuise.
//
// Dépendances : troie-rules.js. Utilisé par : troie-game.js.
// ================================================================

const TRO_AI_LEVELS=[
  {id:'apprenti', nom:'Apprenti',  desc:'Voit un coup devant lui, et pas toujours.', depth:2, ms:80,  blunder:.30, noise:180},
  {id:'soldat',   nom:'Soldat',    desc:'Prend ce qui est en prise, garde ce qui est menacé.', depth:3, ms:200, blunder:.10, noise:70},
  {id:'capitaine',nom:'Capitaine', desc:'Calcule les échanges, et sait quand ouvrir le cheval.', depth:4, ms:450, blunder:0,   noise:25},
  {id:'usurpateur',nom:'Usurpateur',desc:'Cherche aussi loin que le temps le permet.', depth:8, ms:700, blunder:0,  noise:0},
];
function troAILevel(id){return TRO_AI_LEVELS.find(l=>l.id===id)||TRO_AI_LEVELS[1];}

const TRO_MATE=100000;

// LA VISION DE L'IA. On retire le marquage de l'espion du joueur — la pièce
// reste, seul son secret disparaît — et on garde celui de l'IA.
function troBeliefState(st,aiColor){
  const n=troCloneState(st);
  const foe=troOpp(aiColor);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=n.board[r][c];
    if(p&&p.spy===foe)n.board[r][c]={t:p.t,color:p.color,id:p.id};
  }
  return n;
}

const TRO_PAWN_RANK=[0,90,50,25,12,5,0,0];

// CE QUE VAUT UN ESPION. Il est sur le plateau, il sert son camp d'accueil qui
// le joue sans se douter de rien — mais son propriétaire peut le retourner
// d'un coup, et il ne donne jamais d'échec. On partage donc sa valeur : une
// part au camp qui le manœuvre, la plus grosse à celui qui le tient en
// réserve. C'est ce partage qui pousse l'IA à ouvrir le cheval quand le saut
// rapporte, et à le garder au chaud sinon.
const TRO_SPY_HOST=120;     // ce qu'il rapporte au camp qui croit le posséder
const TRO_SPY_OWNER=260;    // ce qu'il rapporte à son propriétaire secret

function troEvalBoard(st){
  const b=st.board;
  let sc=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p)continue;
    const s=p.color==='w'?1:-1;
    if(p.spy){
      sc+=s*TRO_SPY_HOST;
      sc+=(p.spy==='w'?1:-1)*TRO_SPY_OWNER;
      continue;                                   // pas de bonus de développement
    }
    sc+=s*TRO_VALUE[p.t];
    if(p.t==='p')sc+=s*TRO_PAWN_RANK[p.color==='w'?r:7-r];
    else if(p.t==='n'||p.t==='b'){
      const home=p.color==='w'?7:0;
      if(r===home)sc-=s*14;                       // une pièce restée chez elle ne joue pas
    }
    else if(p.t==='r'){
      const seventh=p.color==='w'?1:6;
      if(r===seventh)sc+=s*22;
    }
    else if(p.t==='k'){
      // Le roi au centre est un roi en danger, et il l'est deux fois ici : un
      // cavalier ennemi peut apparaître à trois cases de lui sans prévenir.
      if(r>=2&&r<=5&&c>=2&&c<=5)sc-=s*30;
    }
  }
  sc+=(troMobility(b,'w')-troMobility(b,'b'))*3;
  return sc;
}

// Mobilité : cases atteignables, sans allouer un objet de coup. L'espion n'y
// compte pas pour son camp d'accueil — il ne menace rien, il ne défend rien.
function troMobility(b,color){
  let n=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p||p.color!==color||p.spy)continue;
    if(p.t==='p'){
      const dir=color==='w'?-1:1;
      if(troIn(r+dir,c)&&!b[r+dir][c])n++;
      for(const dc of[-1,1]){const q=troIn(r+dir,c+dc)&&b[r+dir][c+dc];if(q&&q.color!==color)n++;}
      continue;
    }
    if(p.t==='n'||p.t==='k'){
      const set=p.t==='n'?TRO_KNIGHT:TRO_DIR.q;
      for(const[dr,dc]of set){
        const tr=r+dr,tc=c+dc;
        if(!troIn(tr,tc))continue;
        const q=b[tr][tc];
        if(!q||q.color!==color)n++;
      }
      continue;
    }
    for(const[dr,dc]of TRO_DIR[p.t]){
      let tr=r+dr,tc=c+dc;
      while(troIn(tr,tc)){
        const q=b[tr][tc];
        if(q){if(q.color!==color)n++;break;}
        n++;tr+=dr;tc+=dc;
      }
    }
  }
  return n;
}

// Ordre des coups : les prises d'abord (MVV-LVA), puis les promotions, puis
// la révélation — qui vaut au moins ce que l'espion gagne à changer de camp.
function troOrder(st,moves){
  const b=st.board;
  for(const mv of moves){
    const victim=b[mv.to.r][mv.to.c];
    const mover=b[mv.from.r][mv.from.c];
    mv._s=(victim?TRO_VALUE[victim.t]*8-TRO_VALUE[mover?mover.t:'p']:0)+
      (mv.promo?TRO_VALUE[mv.promo]:0)+(mv.reveal?TRO_VALUE.n-TRO_SPY_OWNER:0);
  }
  moves.sort((a,b2)=>b2._s-a._s);
  return moves;
}

let _troDeadline=0,_troNodeCount=0,_troAbort=false;
function troTimeUp(){
  if(_troAbort)return true;
  if((++_troNodeCount&255)===0&&Date.now()>_troDeadline)_troAbort=true;
  return _troAbort;
}

// Quiescence : on ne juge jamais une position au milieu d'un échange. La
// révélation en fait partie — c'est un coup qui change le matériel.
function troQuiesce(st,alpha,beta,color,depth){
  const stand=(color==='w'?1:-1)*troEvalBoard(st);
  if(stand>=beta)return beta;
  if(stand>alpha)alpha=stand;
  if(depth<=0||troTimeUp())return alpha;
  const caps=troOrder(st,troPseudoMoves(st,color).filter(mv=>
    st.board[mv.to.r][mv.to.c]||mv.promo||mv.reveal));
  for(const mv of caps){
    if(!troMoveIsSafe(st,mv,color))continue;
    const n=troCloneState(st);
    troMake(n,mv);
    const sc=-troQuiesce(n,-beta,-alpha,troOpp(color),depth-1);
    if(troTimeUp())return alpha;
    if(sc>=beta)return beta;
    if(sc>alpha)alpha=sc;
  }
  return alpha;
}

function troSearch(st,depth,alpha,beta,color,ply){
  if(troTimeUp())return 0;
  if(depth<=0)return troQuiesce(st,alpha,beta,color,4);
  const moves=troOrder(st,troPseudoMoves(st,color)).filter(mv=>troMoveIsSafe(st,mv,color));
  if(!moves.length)return troInCheck(st.board,color)?-TRO_MATE+ply:0;
  if(st.halfmove>=100)return 0;
  for(const mv of moves){
    const n=troCloneState(st);
    troMake(n,mv);
    const sc=-troSearch(n,depth-1,-beta,-alpha,troOpp(color),ply+1);
    if(troTimeUp())return alpha;
    if(sc>=beta)return beta;
    if(sc>alpha)alpha=sc;
  }
  return alpha;
}

// Note tous les coups de la racine, à profondeur croissante. Fenêtre complète
// à la racine, pour la même raison que dans fok-ai.js : une fenêtre rétrécie
// donne à tous les coups inférieurs la note du meilleur, et les quatre
// niveaux se mettent alors à jouer pareil.
function troSearchRoot(st,level){
  const color=st.turn;
  const moves=troOrder(st,troPseudoMoves(st,color)).filter(mv=>troMoveIsSafe(st,mv,color));
  if(!moves.length)return[];
  let scored=moves.map(mv=>({mv,score:0}));
  _troDeadline=Date.now()+level.ms;_troNodeCount=0;_troAbort=false;
  for(let d=1;d<=level.depth;d++){
    const round=[];
    for(const e of scored){
      const n=troCloneState(st);
      troMake(n,e.mv);
      const sc=-troSearch(n,d-1,-Infinity,Infinity,troOpp(color),1);
      if(_troAbort)break;
      round.push({mv:e.mv,score:sc});
    }
    if(round.length===scored.length)scored=round.sort((a,b)=>b.score-a.score);
    if(_troAbort)break;
  }
  return scored.sort((a,b)=>b.score-a.score);
}

function troAIPick(scored,level){
  if(!scored.length)return null;
  if(level.blunder&&Math.random()<level.blunder)
    return scored[Math.floor(Math.random()*scored.length)].mv;
  const best=scored[0].score;
  const pool=scored.filter(e=>best-e.score<=(level.noise||0));
  return pool[Math.floor(Math.random()*pool.length)].mv;
}

// LE SEUL POINT D'ENTRÉE DE L'ÉCRAN. Il cherche dans la VISION de l'IA, puis
// ramène le coup trouvé dans l'état réel de la partie (troFindMove) : les deux
// listes coïncident, mais ce sont deux objets, et c'est le vrai qu'on joue.
function troAIMove(st,levelId){
  const level=troAILevel(levelId);
  const belief=troBeliefState(st,st.turn);
  const scored=troSearchRoot(belief,level);
  const pick=troAIPick(scored,level);
  if(!pick)return null;
  return troFindMove(st,troPackMove(pick))||troLegalMoves(st,st.turn)[0]||null;
}

// LE CHOIX DE L'ESPION PAR L'IA, au coup d'envoi. Au hasard entre les deux
// cavaliers d'en face, et c'est le bon choix : les deux sont symétriques au
// départ, et n'importe quelle préférence serait un motif que le joueur
// finirait par lire.
function troAIChooseSpy(st,aiColor){
  const list=troSpyChoices(st.board,aiColor);
  if(!list.length)return null;
  return list[Math.floor(Math.random()*list.length)];
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={TRO_AI_LEVELS,troAILevel,troAIMove,troAIChooseSpy,troBeliefState,
    troSearchRoot,troEvalBoard};
}
