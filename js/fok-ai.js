// ================================================================
// FOK-AI.JS : l'adversaire de la « Chute des Royaumes »
// ================================================================
// Une recherche alpha-bêta ordinaire — négamax, approfondissement itératif,
// quiescence sur les prises — posée sur le moteur de la variante
// (js/fok-rules.js). Tout ce qui la distingue d'une IA d'échecs vient de ce
// que le moteur fait sous elle : CHAQUE COUP JOUÉ DÉCALE LA BANDE. L'arbre de
// recherche est donc déjà l'arbre de la variante, sans une ligne de plus ici.
//
// CE QUE L'ÉVALUATION NE FAIT PAS, ET POURQUOI. Les tables de cases des
// moteurs d'échecs (« un cavalier vaut plus en e5 qu'en a1 ») raisonnent
// autant sur la COLONNE que sur la rangée. Ici, la colonne d'une pièce des
// quatre rangées centrales change à chaque demi-coup : un bonus de colonne
// serait un bonus tiré au sort. Ne subsistent donc que des termes de RANGÉE
// (l'avancée des pions, la tour sur la septième), le matériel, la mobilité et
// l'abri du roi — tout ce qui reste vrai après le décalage.
//
// LA RECHERCHE TOURNE SUR LE FIL PRINCIPAL, avec un budget volontairement
// court (au plus 700 ms). Le jeu principal met la sienne dans un Web Worker
// parce qu'elle dispose de cinq secondes ; ici, l'écran ne doit pas se figer,
// et l'approfondissement itératif rend de toute façon le meilleur coup trouvé
// à l'instant où le budget s'épuise.
//
// Dépendances : fok-rules.js. Utilisé par : fok-game.js.
// ================================================================

// Les quatre adversaires. `blunder` est la probabilité de lâcher franchement
// la position (ce que fait un débutant), `noise` la tolérance en centipions
// autour du meilleur coup : deux façons distinctes de se tromper, comme dans
// le jeu principal (voir AI_OPPONENTS, js/data-pieces.js).
const FOK_AI_LEVELS=[
  {id:'apprenti', nom:'Apprenti',  desc:'Voit un coup devant lui, et pas toujours.', depth:2, ms:80,  blunder:.30, noise:180},
  {id:'soldat',   nom:'Soldat',    desc:'Prend ce qui est en prise, garde ce qui est menacé.', depth:3, ms:200, blunder:.10, noise:70},
  {id:'capitaine',nom:'Capitaine', desc:'Calcule les échanges, et le décalage avec.', depth:4, ms:450, blunder:0,   noise:25},
  {id:'usurpateur',nom:'Usurpateur',desc:'Cherche aussi loin que le temps le permet.', depth:8, ms:700, blunder:0,  noise:0},
];
function fokAILevel(id){return FOK_AI_LEVELS.find(l=>l.id===id)||FOK_AI_LEVELS[1];}

const FOK_MATE=100000;

// Avancée des pions, par rangée, du point de vue des Blancs (index 0 = rangée
// 8). Un pion qui monte vaut de plus en plus cher — et dans cette variante, il
// n'a d'ailleurs plus qu'une rangée fixe à traverser pour promouvoir.
const FOK_PAWN_RANK=[0,90,50,25,12,5,0,0];

function fokEvalBoard(st){
  const b=st.board;
  let sc=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p)continue;
    const s=p.color==='w'?1:-1;
    sc+=s*FOK_VALUE[p.t];
    if(p.t==='p')sc+=s*FOK_PAWN_RANK[p.color==='w'?r:7-r];
    // Sortir les pièces légères de leur rangée de départ, qui est FIXE : une
    // pièce restée là ne participe à rien et ne bougera jamais toute seule.
    else if(p.t==='n'||p.t==='b'){
      const home=p.color==='w'?7:0;
      if(r===home)sc-=s*14;
    }
    // La tour sur la rangée où l'adversaire garde ses pions : ce terme-là
    // survit au décalage, puisque le décalage ne change pas de rangée.
    else if(p.t==='r'){
      const seventh=p.color==='w'?1:6;
      if(r===seventh)sc+=s*22;
    }
    // LE ROI QUITTE LA BANDE MOBILE, ou il passe la partie à dériver. C'est le
    // conseil stratégique le plus sûr de la variante, et l'évaluation doit le
    // connaître : un roi dans les quatre rangées centrales change de colonne à
    // chaque demi-coup, donc d'abri à chaque demi-coup.
    else if(p.t==='k'&&FOK_SHIFTED[r])sc-=s*45;
  }
  sc+=(fokMobility(b,'w')-fokMobility(b,'b'))*3;
  return sc;
}

// Mobilité : nombre de cases atteignables, sans allouer un seul objet de coup
// (l'évaluation est appelée à chaque feuille).
function fokMobility(b,color){
  let n=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p||p.color!==color)continue;
    if(p.t==='p'){
      const dir=color==='w'?-1:1;
      if(fokIn(r+dir,c)&&!b[r+dir][c])n++;
      for(const dc of[-1,1]){const q=fokIn(r+dir,c+dc)&&b[r+dir][c+dc];if(q&&q.color!==color)n++;}
      continue;
    }
    if(p.t==='n'||p.t==='k'){
      const set=p.t==='n'?FOK_KNIGHT:FOK_DIR.q;
      for(const[dr,dc]of set){
        const tr=r+dr,tc=c+dc;
        if(!fokIn(tr,tc))continue;
        const q=b[tr][tc];
        if(!q||q.color!==color)n++;
      }
      continue;
    }
    for(const[dr,dc]of FOK_DIR[p.t]){
      let tr=r+dr,tc=c+dc;
      while(fokIn(tr,tc)){
        const q=b[tr][tc];
        if(q){if(q.color!==color)n++;break;}
        n++;tr+=dr;tc+=dc;
      }
    }
  }
  return n;
}

// Ordre des coups : les prises d'abord, la plus grosse pièce prise par la plus
// petite en tête (MVV-LVA), puis les promotions. Un alpha-bêta mal ordonné
// coûte un facteur dix ; c'est le seul vrai réglage de performance ici.
function fokOrder(st,moves){
  const b=st.board;
  for(const mv of moves){
    const victim=b[mv.to.r][mv.to.c];
    const mover=b[mv.from.r][mv.from.c];
    mv._s=(victim?FOK_VALUE[victim.t]*8-FOK_VALUE[mover.t]:0)+(mv.promo?FOK_VALUE[mv.promo]:0);
  }
  moves.sort((a,b2)=>b2._s-a._s);
  return moves;
}

let _fokDeadline=0,_fokNodeCount=0,_fokAbort=false;
function fokTimeUp(){
  if(_fokAbort)return true;
  if((++_fokNodeCount&255)===0&&Date.now()>_fokDeadline)_fokAbort=true;
  return _fokAbort;
}

// Quiescence : on ne juge jamais une position au milieu d'un échange. Elle ne
// prolonge que les PRISES — dans cette variante, une menace tranquille est de
// toute façon déplacée au demi-coup suivant.
function fokQuiesce(st,alpha,beta,color,depth){
  const stand=(color==='w'?1:-1)*fokEvalBoard(st);
  if(stand>=beta)return beta;
  if(stand>alpha)alpha=stand;
  if(depth<=0||fokTimeUp())return alpha;
  const caps=fokOrder(st,fokPseudoMoves(st,color).filter(mv=>
    st.board[mv.to.r][mv.to.c]||mv.promo));
  for(const mv of caps){
    if(!fokMoveIsSafe(st,mv,color))continue;
    const n=fokCloneState(st);
    fokMake(n,mv);
    const sc=-fokQuiesce(n,-beta,-alpha,fokOpp(color),depth-1);
    if(fokTimeUp())return alpha;
    if(sc>=beta)return beta;
    if(sc>alpha)alpha=sc;
  }
  return alpha;
}

function fokSearch(st,depth,alpha,beta,color,ply){
  if(fokTimeUp())return 0;
  if(depth<=0)return fokQuiesce(st,alpha,beta,color,4);
  const moves=fokOrder(st,fokPseudoMoves(st,color)).filter(mv=>fokMoveIsSafe(st,mv,color));
  if(!moves.length)return fokInCheck(st.board,color)?-FOK_MATE+ply:0;
  if(st.halfmove>=100)return 0;
  for(const mv of moves){
    const n=fokCloneState(st);
    fokMake(n,mv);
    const sc=-fokSearch(n,depth-1,-beta,-alpha,fokOpp(color),ply+1);
    if(fokTimeUp())return alpha;
    if(sc>=beta)return beta;
    if(sc>alpha)alpha=sc;
  }
  return alpha;
}

// Note tous les coups de la racine, à profondeur croissante, jusqu'à épuiser
// le budget. Renvoie la liste triée : c'est elle que fokAIPick ouvre ensuite
// pour y choisir, éventuellement de travers si l'adversaire est faible.
function fokSearchRoot(st,level){
  const color=st.turn;
  const moves=fokOrder(st,fokPseudoMoves(st,color)).filter(mv=>fokMoveIsSafe(st,mv,color));
  if(!moves.length)return[];
  let scored=moves.map(mv=>({mv,score:0}));
  _fokDeadline=Date.now()+level.ms;_fokNodeCount=0;_fokAbort=false;
  for(let d=1;d<=level.depth;d++){
    const round=[];
    // FENÊTRE COMPLÈTE À LA RACINE, et ce n'est pas une négligence. Rétrécir
    // la fenêtre sur le meilleur coup trouvé fait « échouer bas » tous les
    // coups inférieurs, qui rendent alors EXACTEMENT la note du meilleur :
    // l'adversaire ne choisit plus dans une fenêtre de tolérance (voir
    // fokAIPick), il choisit au hasard entre des coups faussement à égalité —
    // et les quatre niveaux jouent pareil, c'est-à-dire mal. On paie donc une
    // recherche complète par coup de la racine pour que les notes existent.
    for(const e of scored){
      const n=fokCloneState(st);
      fokMake(n,e.mv);
      const sc=-fokSearch(n,d-1,-Infinity,Infinity,fokOpp(color),1);
      if(_fokAbort)break;
      round.push({mv:e.mv,score:sc});
    }
    // Une itération interrompue en cours de route n'a pas vu tous les coups :
    // ses notes ne valent que si elle est complète.
    if(round.length===scored.length)scored=round.sort((a,b)=>b.score-a.score);
    if(_fokAbort)break;
  }
  return scored.sort((a,b)=>b.score-a.score);
}

// Le choix final, et les deux façons de se tromper. Un adversaire faible doit
// perdre des parties de façon CRÉDIBLE : jouer le meilleur coup moins bien
// n'existe pas, on choisit donc soit dans une fenêtre autour du meilleur, soit
// — rarement — n'importe où.
function fokAIPick(scored,level){
  if(!scored.length)return null;
  if(level.blunder&&Math.random()<level.blunder)
    return scored[Math.floor(Math.random()*scored.length)].mv;
  const best=scored[0].score;
  const pool=scored.filter(e=>best-e.score<=(level.noise||0));
  return pool[Math.floor(Math.random()*pool.length)].mv;
}

// Le seul point d'entrée utilisé par l'écran de jeu.
function fokAIMove(st,levelId){
  const level=fokAILevel(levelId);
  const scored=fokSearchRoot(st,level);
  return fokAIPick(scored,level);
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={FOK_AI_LEVELS,fokAILevel,fokAIMove,fokSearchRoot,fokEvalBoard};
}
