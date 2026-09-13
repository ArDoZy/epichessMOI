// ================================================================
// MIRROR-AI.JS : l'adversaire de « Mirror Chess »
// ================================================================
// Une recherche alpha-bêta ordinaire — négamax, approfondissement itératif,
// quiescence sur les prises — posée sur le moteur de la variante
// (js/mirror-rules.js). Rien n'y parle du miroir : l'arbre de recherche EST
// déjà celui de la variante, puisqu'un « coup » rendu par le moteur contient
// la pièce jouée ET sa jumelle. On cherche donc dans le vrai jeu sans une
// ligne de règle ici.
//
// ELLE FAIT ET DÉFAIT, ELLE NE CLONE PAS. Un coup de cette variante est deux
// déplacements : cloner huit rangées par nœud en coûterait le double pour
// rien. mirMake rend de quoi tout remettre en place (mirUnmake), y compris
// les droits au roque et les cases de prise en passant.
//
// CE QUE L'ÉVALUATION SAIT DE LA VARIANTE, ET QUI NE SE DEVINE PAS À UNE
// PROFONDEUR DE QUATRE :
//   · LE ROI JUMELÉ À SA DAME EST UN ROI EN SURSIS. Tant que la Dame vit,
//     chacun de ses coups traîne le Roi d'une case. Un roi déjà sorti de ses
//     deux premières rangées est donc en danger permanent, et pas seulement
//     dans la ligne qu'on est en train de calculer.
//   · LE VEUVAGE EST UN GAIN. Une pièce dont la jumelle est prise se joue
//     seule : elle ne traîne plus rien, et surtout elle n'est plus traînée.
//     C'est la compensation d'une perte, et elle est réelle — sans ce terme,
//     l'adversaire refuse des échanges qui le libéreraient.
//
// LA RECHERCHE TOURNE SUR LE FIL PRINCIPAL, budget volontairement court : le
// jeu principal met la sienne dans un Worker parce qu'elle a cinq secondes ;
// ici l'écran ne doit pas se figer, et l'approfondissement itératif rend le
// meilleur coup trouvé à l'instant où le budget s'épuise.
//
// Dépendances : mirror-rules.js. Utilisé par : mirror-game.js.
// ================================================================

const MIR_AI_LEVELS=[
  {id:'apprenti',  nom:'Apprenti',   desc:'Voit un coup devant lui, et pas toujours.',           depth:2, ms:90,  blunder:.30, noise:180},
  {id:'soldat',    nom:'Soldat',     desc:'Prend ce qui est en prise, garde ce qui est menacé.', depth:3, ms:260, blunder:.10, noise:70},
  {id:'capitaine', nom:'Capitaine',  desc:'Calcule les échanges, et le coup jumeau avec.',       depth:4, ms:600, blunder:0,   noise:25},
  {id:'usurpateur',nom:'Usurpateur', desc:'Cherche aussi loin que le temps le permet.',          depth:8, ms:900, blunder:0,   noise:0},
];
function mirAILevel(id){return MIR_AI_LEVELS.find(l=>l.id===id)||MIR_AI_LEVELS[1];}

const MIR_MATE=100000;
const MIR_PAWN_RANK=[0,95,55,28,13,5,0,0];

// Quelles pièces sont encore veuves ? Deux balayages de 64 cases plutôt qu'une
// recherche par pièce (qui en ferait 64 × 64) : l'évaluation est appelée à
// chaque feuille, et c'est le seul endroit du moteur où ça se paie.
const _mirAlive=new Set();
function mirWidowScan(b){
  _mirAlive.clear();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=b[r][c];if(p)_mirAlive.add(p.id);}
  return _mirAlive;
}

function mirEvalBoard(st){
  const b=st.board;
  const alive=mirWidowScan(b);
  let sc=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p)continue;
    const s=p.color==='w'?1:-1;
    const linked=!!(p.mate&&alive.has(p.mate));
    sc+=s*MIR_VALUE[p.t];
    if(p.t==='p'){
      sc+=s*MIR_PAWN_RANK[p.color==='w'?r:7-r];
      if(!linked)sc+=s*10;                    // un pion libre avance quand il veut
    }else if(p.t==='n'||p.t==='b'){
      const home=p.color==='w'?7:0;
      if(r===home)sc-=s*14;                   // une pièce restée chez elle ne sert à rien
      if(!linked)sc+=s*14;
    }else if(p.t==='r'){
      const seventh=p.color==='w'?1:6;
      if(r===seventh)sc+=s*22;
      if(!linked)sc+=s*14;
    }else if(p.t==='q'){
      if(!linked)sc+=s*18;                    // une Dame veuve ne promène plus le Roi
    }else if(p.t==='k'){
      // LE TERME DE LA VARIANTE. Un roi encore attelé à sa Dame se fait
      // déplacer à chaque coup de celle-ci : hors de ses deux rangées de
      // départ, il ne se met plus à l'abri, il dérive.
      const home=p.color==='w'?7:0;
      const depth=Math.abs(r-home);
      if(linked)sc-=s*(depth*26);
      else sc-=s*(depth*6);
    }
  }
  sc+=(mirMobility(b,'w')-mirMobility(b,'b'))*3;
  return sc;
}

// Mobilité géométrique, sans allouer un seul objet de coup.
function mirMobility(b,color){
  let n=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(!p||p.color!==color)continue;
    if(p.t==='p'){
      const dir=color==='w'?-1:1;
      if(mirIn(r+dir,c)&&!b[r+dir][c])n++;
      for(const dc of[-1,1]){const q=mirIn(r+dir,c+dc)&&b[r+dir][c+dc];if(q&&q.color!==color)n++;}
      continue;
    }
    if(p.t==='n'||p.t==='k'){
      const set=p.t==='n'?MIR_KNIGHT:MIR_DIR.q;
      for(const[dr,dc]of set){
        const tr=r+dr,tc=c+dc;
        if(!mirIn(tr,tc))continue;
        const q=b[tr][tc];
        if(!q||q.color!==color)n++;
      }
      continue;
    }
    for(const[dr,dc]of MIR_DIR[p.t]){
      let tr=r+dr,tc=c+dc;
      while(mirIn(tr,tc)){
        const q=b[tr][tc];
        if(q){if(q.color!==color)n++;break;}
        n++;tr+=dr;tc+=dc;
      }
    }
  }
  return n;
}

// Ordre des coups : les prises d'abord, la plus grosse pièce prise par la plus
// petite en tête (MVV-LVA). LES DEUX PRISES COMPTENT — celle de la pièce jouée
// et celle de sa jumelle : un coup dont seul le jumeau prend une Dame serait
// sinon examiné en dernier.
function mirOrder(st,moves){
  const b=st.board;
  for(const mv of moves){
    let s=0;
    const v1=b[mv.to.r][mv.to.c];
    const m1=b[mv.from.r][mv.from.c];
    if(v1)s+=MIR_VALUE[v1.t]*8-MIR_VALUE[m1.t];
    if(mv.promo)s+=MIR_VALUE[mv.promo];
    if(mv.twin){
      const v2=b[mv.twin.to.r][mv.twin.to.c];
      const m2=b[mv.twin.from.r][mv.twin.from.c];
      if(v2&&m2)s+=MIR_VALUE[v2.t]*8-MIR_VALUE[m2.t];
      if(mv.twin.epc)s+=MIR_VALUE.p*8;
      if(mv.twin.promo)s+=MIR_VALUE[mv.twin.promo];
    }
    if(mv.epc)s+=MIR_VALUE.p*8;
    mv._s=s;
  }
  moves.sort((a,b2)=>b2._s-a._s);
  return moves;
}
// Ce coup prend-il quelque chose, d'un côté ou de l'autre ? C'est le filtre de
// la quiescence, et il doit connaître le coup jumeau.
function mirIsNoisy(st,mv){
  const b=st.board;
  if(b[mv.to.r][mv.to.c]||mv.promo||mv.epc)return true;
  if(!mv.twin)return false;
  return !!(b[mv.twin.to.r][mv.twin.to.c]||mv.twin.promo||mv.twin.epc);
}

let _mirDeadline=0,_mirNodeCount=0,_mirAbort=false;
function mirTimeUp(){
  if(_mirAbort)return true;
  if((++_mirNodeCount&255)===0&&Date.now()>_mirDeadline)_mirAbort=true;
  return _mirAbort;
}

function mirQuiesce(st,alpha,beta,color,depth){
  const stand=(color==='w'?1:-1)*mirEvalBoard(st);
  if(stand>=beta)return beta;
  if(stand>alpha)alpha=stand;
  if(depth<=0||mirTimeUp())return alpha;
  const caps=mirOrder(st,mirGenerate(st,color).filter(mv=>mirIsNoisy(st,mv)));
  for(const mv of caps){
    if(!mirMoveIsSafe(st,mv,color))continue;
    const rec=mirMake(st,mv);
    const sc=-mirQuiesce(st,-beta,-alpha,mirOpp(color),depth-1);
    mirUnmake(st,rec);
    if(mirTimeUp())return alpha;
    if(sc>=beta)return beta;
    if(sc>alpha)alpha=sc;
  }
  return alpha;
}

function mirSearch(st,depth,alpha,beta,color,ply){
  if(mirTimeUp())return 0;
  if(depth<=0)return mirQuiesce(st,alpha,beta,color,3);
  const moves=mirOrder(st,mirGenerate(st,color)).filter(mv=>mirMoveIsSafe(st,mv,color));
  if(!moves.length)return mirInCheck(st.board,color)?-MIR_MATE+ply:0;
  if(st.halfmove>=100)return 0;
  for(const mv of moves){
    const rec=mirMake(st,mv);
    const sc=-mirSearch(st,depth-1,-beta,-alpha,mirOpp(color),ply+1);
    mirUnmake(st,rec);
    if(mirTimeUp())return alpha;
    if(sc>=beta)return beta;
    if(sc>alpha)alpha=sc;
  }
  return alpha;
}

// Note tous les coups de la racine, à profondeur croissante, jusqu'à épuiser
// le budget. FENÊTRE COMPLÈTE À LA RACINE, volontairement : rétrécir la
// fenêtre sur le meilleur coup fait « échouer bas » tous les autres, qui
// rendent alors exactement la même note — les quatre niveaux choisiraient
// au hasard entre des coups faussement à égalité, et joueraient donc pareil.
function mirSearchRoot(st,level){
  const color=st.turn;
  const moves=mirOrder(st,mirGenerate(st,color)).filter(mv=>mirMoveIsSafe(st,mv,color));
  if(!moves.length)return[];
  let scored=moves.map(mv=>({mv,score:0}));
  _mirDeadline=Date.now()+level.ms;_mirNodeCount=0;_mirAbort=false;
  for(let d=1;d<=level.depth;d++){
    const round=[];
    for(const e of scored){
      const rec=mirMake(st,e.mv);
      const sc=-mirSearch(st,d-1,-Infinity,Infinity,mirOpp(color),1);
      mirUnmake(st,rec);
      if(_mirAbort)break;
      round.push({mv:e.mv,score:sc});
    }
    if(round.length===scored.length)scored=round.sort((a,b)=>b.score-a.score);
    if(_mirAbort)break;
  }
  return scored.sort((a,b)=>b.score-a.score);
}

// Les deux façons de se tromper : la bourde franche du débutant, et la
// tolérance autour du meilleur coup. Un adversaire faible doit perdre de façon
// crédible — « jouer le meilleur coup moins bien » n'existe pas.
function mirAIPick(scored,level){
  if(!scored.length)return null;
  if(level.blunder&&Math.random()<level.blunder)
    return scored[Math.floor(Math.random()*scored.length)].mv;
  const best=scored[0].score;
  const pool=scored.filter(e=>best-e.score<=(level.noise||0));
  return pool[Math.floor(Math.random()*pool.length)].mv;
}

function mirAIMove(st,levelId){
  const level=mirAILevel(levelId);
  const scored=mirSearchRoot(st,level);
  return mirAIPick(scored,level);
}

if(typeof module!=='undefined'&&module.exports){
  Object.assign(global,require('./mirror-rules.js'));
  module.exports={MIR_AI_LEVELS,mirAILevel,mirAIMove,mirSearchRoot,mirEvalBoard};
}
