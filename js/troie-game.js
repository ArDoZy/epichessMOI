// ================================================================
// TROIE-GAME.JS : l'écran du « Cheval de Troie »
// ================================================================
// Le plateau, le choix de l'espion, les bandeaux, le journal, la fin de
// partie. C'est le pendant de game-render.js + game-flow.js pour la variante,
// en beaucoup plus court : il n'y a ici ni pouvoir, ni effet spécial, ni armée
// misée, ni pendule, ni ELO. La variante ne coûte rien et ne rapporte rien —
// on y joue pour la règle.
//
// POURQUOI UN ÉCRAN SÉPARÉ PLUTÔT QUE #page-game : même raison que pour les
// deux autres variantes. L'écran réutilise la FEUILLE DE STYLE de la partie
// (mêmes classes, même plateau, même colonne latérale, même mise en page sur
// téléphone) et rien d'autre : aucun état partagé, donc aucune régression
// possible sur le jeu principal.
//
// -- CE QUE CET ÉCRAN DOIT MONTRER, ET SURTOUT CE QU'IL DOIT TAIRE ---
// La variante repose ENTIÈREMENT sur une information cachée. L'écran a donc
// une responsabilité qu'aucun autre n'a dans ce jeu : ne pas vendre la mèche.
//   · VOTRE espion porte une marque discrète (.tro-mine) : vous l'avez choisi,
//     vous avez le droit de savoir lequel c'est, et le chercher à chaque coup
//     serait une corvée, pas une difficulté intéressante.
//   · L'ESPION ADVERSE n'est marqué NULLE PART tant que la partie dure. Ni
//     classe, ni attribut, ni texte : ce qui est écrit dans le DOM se lit,
//     et un joueur curieux ouvre l'inspecteur.
//   · EN MODE ANALYSE (js/variant-analysis.js), les espions non révélés
//     prennent leur couleur : MARRON pour l'espion des Noirs infiltré chez les
//     Blancs, BLEU CLAIR pour l'espion des Blancs infiltré chez les Noirs.
//     Celui de l'adversaire n'apparaît qu'une fois la partie TERMINÉE —
//     sinon, remonter le temps de trois coups suffirait à le démasquer, et la
//     variante n'existerait plus.
//
// -- LE CHOIX DE L'ESPION ------------------------------------------
// Une fenêtre au coup d'envoi, deux cartes : les deux cavaliers d'en face. On
// ne peut pas la refuser — sans espion, il n'y a pas de partie. Contre l'IA,
// elle choisit le sien en même temps, au hasard (troAIChooseSpy) ; EN LIGNE,
// chacun choisit chez soi et le choix NE TRAVERSE JAMAIS LE RÉSEAU (voir
// js/troie-mp.js). Les deux camps s'annoncent seulement « j'ai choisi », et la
// partie part quand les deux l'ont dit.
//
// -- EN LIGNE, CHAQUE CAMP EN SAIT MOINS QUE LE MOTEUR -------------
// Contre l'IA, un seul programme tient la partie et connaît les deux espions.
// En ligne, PERSONNE ne les connaît tous les deux, et c'est ce qui rend la
// variante honnête. Deux conséquences, portées par trois fonctions de ce
// fichier :
//   · troResolveRemote — un coup reçu peut paraître illégal parce qu'il
//     dépend de l'espion d'en face, qu'on ne connaît pas. On essaie alors les
//     hypothèses, sans en garder aucune ;
//   · troVerdict / troApplyVerdict — ON NE JUGE PAS LA POSITION DE
//     L'ADVERSAIRE. Échec, mat et pat du camp au trait sont calculés par le
//     client de CE camp-là, seul à savoir ce qu'il faut savoir, et annoncés à
//     l'autre. Sans cela, un camp croirait mater avec un cavalier qui,
//     en face, ne met même pas en échec.
//
// Dépendances : troie-rules.js, troie-ai.js, variant-analysis.js,
// piece-art.js (pieceSVG), main.js (showPage, escH, showConfirmModal),
// rules-engine.js (playSound), economy-ui.js (getBoardSkin, facultatif).
// js/troie-mp.js se branche dessus pour les parties en ligne, et n'est pas
// nécessaire pour jouer contre l'IA.
// ================================================================

const TRO_MOVE_MS=200;    // durée du déplacement, alignée sur .gc-piece
const TRO_AI_DELAY=320;   // temps de respiration avant que l'IA ne joue

const TRO={
  st:null,
  mode:'ia',              // 'ia' | 'online'
  level:'soldat',
  myColor:'w',
  oppName:'Adversaire',
  oppSub:'',
  sel:null,
  moves:[],
  anim:false,
  pendingPromo:null,
  choosing:false,         // la fenêtre du choix de l'espion est ouverte
  oppReady:false,         // l'adversaire en ligne a choisi son espion
  awaiting:false,         // on attend son verdict sur le coup qu'on vient de jouer
  onLocalMove:null,       // branché par troie-mp.js : émet le coup sur le réseau
  onReady:null,           // branché par troie-mp.js : « j'ai choisi mon espion »
  onClaim:null,           // branché par troie-mp.js : prouver son cheval à l'arbitre
  onVerify:null,          // branché par troie-mp.js : faire vérifier le sien
  onVerdict:null,         // branché par troie-mp.js : l'état de NOTRE camp
  onEnd:null,             // branché par troie-mp.js : prévient l'adversaire
  an:null,                // le mode analyse (js/variant-analysis.js)
};

// L'analyse est créée une fois pour toutes : vanReset la vide au coup d'envoi
// de chaque partie.
TRO.an=vanNew({prefix:'tro',render:()=>{troRender();troSetStatus();troMarkLog();}});

function troBoardEl(){return document.getElementById('tro-board');}
function troFlipped(){return TRO.myColor==='b';}

// ----------------------------------------------------------------
// LES 64 CASES
// ----------------------------------------------------------------
let _troCells=null,_troFlipped=null,_troCellAt=[],_troNodes=new Map(),_troPieceAt=[];

function troEnsureCells(){
  const el=troBoardEl();
  const flipped=troFlipped();
  if(_troCells&&_troFlipped===flipped&&el.querySelector('.gc'))return;
  el.innerHTML='';
  el.setAttribute('role','grid');
  el.setAttribute('aria-label','Échiquier du Cheval de Troie');
  _troCells=[];_troFlipped=flipped;_troNodes=new Map();_troPieceAt=[];
  _troCellAt=[];for(let i=0;i<8;i++)_troCellAt.push(new Array(8).fill(null));
  for(let vi=0;vi<8;vi++)for(let vc=0;vc<8;vc++){
    const r=flipped?7-vi:vi,c=flipped?7-vc:vc;
    const d=document.createElement('div');
    d.className='gc '+(((r+c)%2===0)?'l':'d');
    d.dataset.r=r;d.dataset.c=c;
    d.setAttribute('role','gridcell');
    d.tabIndex=(vi===0&&vc===0)?0:-1;
    let coord='';
    if(vc===0)coord+='<span class="gc-rank">'+(8-r)+'</span>';
    if(vi===7)coord+='<span class="gc-file">'+TRO_FILES[c].toUpperCase()+'</span>';
    if(coord)d.innerHTML=coord;
    d.addEventListener('click',()=>troClick(r,c));
    d.addEventListener('keydown',e=>troKey(e,r,c,vi,vc));
    d.addEventListener('pointerdown',e=>troPointerDown(e,r,c));
    el.appendChild(d);
    _troCells.push(d);
    _troCellAt[r][c]=d;
  }
  const layer=document.createElement('div');
  layer.className='gc-layer';
  el.appendChild(layer);
  if(typeof getBoardSkin==='function'){
    const sk=getBoardSkin();
    if(sk&&sk.file){
      el.style.backgroundImage='url("'+sk.file+'")';
      el.style.setProperty('--sq-light',sk.sqLight||'#e2cba6');
      el.style.setProperty('--sq-dark',sk.sqDark||'#5a4130');
    }
  }
}

function troLayer(){return troBoardEl().querySelector('.gc-layer');}

// ----------------------------------------------------------------
// PEINTURE DES CASES ET DIFF DES PIÈCES
// ----------------------------------------------------------------
function troPaintCells(){
  const st=TRO.st;if(!st||!_troCells)return;
  const board=vanBoard(TRO.an,st);
  const turn=vanTurn(TRO.an,st);
  const last=vanLastMove(TRO.an,st);
  const past=!vanLive(TRO.an);
  const check=troInCheck(board,turn);
  const mine=!past&&!st.gameOver&&st.turn===TRO.myColor&&!TRO.anim;
  for(const el of _troCells){
    const r=+el.dataset.r,c=+el.dataset.c;
    const cell=board[r][c];
    let cls='gc '+(((r+c)%2===0)?'l':'d');
    if(!past&&TRO.sel&&TRO.sel.r===r&&TRO.sel.c===c)cls+=' sel';
    const avail=!past&&TRO.moves.some(m=>m.to.r===r&&m.to.c===c);
    if(avail)cls+=(cell?' avail-cap':' avail');
    if(last){
      if(last.from.r===r&&last.from.c===c)cls+=' lm-from';
      else if(last.to.r===r&&last.to.c===c)cls+=' lm-to';
    }
    if(cell&&cell.t==='k'&&cell.color===turn&&check)cls+=' gc-check';
    // « Prenable en main » : ses propres pièces, et son espion — qui est une
    // pièce d'en face, et c'est tout l'intérêt.
    if(cell&&mine&&(cell.color===TRO.myColor||cell.spy===TRO.myColor))cls+=' gc-holds';
    if(el.className!==cls)el.className=cls;
    // L'ÉTIQUETTE NE DIT QUE CE QUE L'ŒIL VOIT. Le lecteur d'écran apprend que
    // c'est VOTRE espion (vous le savez déjà) ; l'espion adverse, lui, n'est
    // pas plus nommé ici qu'il n'est peint là.
    let lab=troSquare(r,c)+(cell?', '+TRO_NAME[cell.t]+(cell.color==='w'?' blanc':' noir'):', case vide');
    if(cell&&cell.spy&&troSpyShown(cell))lab+=', cavalier espion'+(cell.spy===TRO.myColor?' — le vôtre':'');
    if(avail)lab+=cell?', prise possible':', déplacement possible';
    if(el.getAttribute('aria-label')!==lab)el.setAttribute('aria-label',lab);
  }
}

// FAUT-IL MONTRER CET ESPION ? La question de tout l'écran, et elle a une
// seule réponse, écrite ici : le vôtre, toujours ; celui d'en face, seulement
// une fois la partie finie. Le reste du fichier ne fait que lire cette
// fonction — c'est ce qui garantit qu'aucun coin d'écran ne trahit l'autre.
function troSpyShown(p){
  if(!p||!p.spy)return false;
  if(p.spy===TRO.myColor)return true;
  return !!(TRO.st&&TRO.st.gameOver);
}
// La classe qui peint un espion. En direct, votre espion porte une marque
// discrète ; EN ANALYSE, les espions prennent leurs couleurs — marron pour
// celui des Noirs (infiltré chez les Blancs), bleu clair pour celui des
// Blancs (infiltré chez les Noirs).
function troSpyClass(p){
  if(!troSpyShown(p))return'';
  if(!vanLive(TRO.an))return p.spy==='b'?'tro-spy-b':'tro-spy-w';
  return p.spy===TRO.myColor?'tro-mine':'';
}

// Chaque pièce garde son nœud pour toute la partie : c'est ce qui fait que le
// cavalier révélé CHANGE DE COULEUR sur place, au lieu de disparaître et de
// réapparaître — on voit alors le cheval s'ouvrir.
function troSyncPieces(){
  const st=TRO.st,layer=troLayer(),flipped=troFlipped();
  const board=vanBoard(TRO.an,st);
  const seen=new Set();
  const at=[];for(let r=0;r<8;r++)at.push(new Array(8).fill(null));
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(!p)continue;
    seen.add(p.id);
    const vi=flipped?7-r:r,vc=flipped?7-c:c;
    const tf='translate3d('+(vc*100)+'%,'+(vi*100)+'%,0)';
    const art=p.t+':'+p.color;
    const mark=troSpyClass(p);
    let node=_troNodes.get(p.id);
    if(!node){
      node=document.createElement('div');
      node.className='gc-piece gc-born'+(mark?' '+mark:'');
      node.innerHTML='<span class="gc-art">'+pieceSVG(TRO_ART[p.t],p.color)+'</span>';
      node._art=art;node._tf=tf;node._mark=mark;
      node.style.transform=tf;
      layer.appendChild(node);
      _troNodes.set(p.id,node);
      setTimeout(()=>node.classList.remove('gc-born'),TRO_MOVE_MS);
    }else{
      if(node._art!==art){        // promotion, ou RÉVÉLATION : la pièce devient
        const a=node.querySelector('.gc-art');
        if(a){a.innerHTML=pieceSVG(TRO_ART[p.t],p.color);a.classList.add('gc-morph');
          setTimeout(()=>a.classList.remove('gc-morph'),320);}
        node._art=art;
      }
      if(node._mark!==mark){
        node.classList.remove('tro-mine','tro-spy-w','tro-spy-b');
        if(mark)node.classList.add(mark);
        node._mark=mark;
      }
      if(node._tf!==tf){
        node._tf=tf;
        node.classList.add('gc-moving');
        node.style.transform=tf;
        clearTimeout(node._mt);
        node._mt=setTimeout(()=>node.classList.remove('gc-moving'),TRO_MOVE_MS+40);
      }
    }
    at[r][c]=node;
  }
  for(const[id,node]of _troNodes){
    if(seen.has(id))continue;
    _troNodes.delete(id);
    node.classList.add('gc-dying');
    setTimeout(()=>node.remove(),260);
  }
  _troPieceAt=at;
}

function troRender(){
  if(!TRO.st)return;
  troEnsureCells();
  troPaintCells();
  troSyncPieces();
  troPaintBars();
}

// ----------------------------------------------------------------
// BANDEAUX, STATUT, JOURNAL
// ----------------------------------------------------------------
function troPaintBars(){
  const st=TRO.st;
  const turn=vanTurn(TRO.an,st);
  const mine=turn===TRO.myColor;
  const over=st.gameOver&&vanLive(TRO.an);
  document.getElementById('tro-me-bar').classList.toggle('gp-turn',mine&&!over);
  document.getElementById('tro-opp-bar').classList.toggle('gp-turn',!mine&&!over);
  troDrawCaptured('tro-cap-me',vanCaptured(TRO.an,st,TRO.myColor),troOpp(TRO.myColor));
  troDrawCaptured('tro-cap-opp',vanCaptured(TRO.an,st,troOpp(TRO.myColor)),TRO.myColor);
}
function troDrawCaptured(id,list,color){
  const el=document.getElementById(id);if(!el)return;
  const order=['q','r','b','n','p'];
  const html=(list||[]).slice().sort((a,b)=>order.indexOf(a)-order.indexOf(b))
    .map(t=>pieceIcon(TRO_ART[t],color)).join('');
  if(el.innerHTML!==html)el.innerHTML=html;
}

// OÙ EN EST VOTRE ESPION ? La question qu'on se pose à chaque coup, et à
// laquelle le plateau seul ne répond pas : un cavalier pris avant d'avoir été
// révélé disparaît sans un mot — c'est la règle — et le bandeau est le seul
// endroit où l'on peut apprendre qu'on n'a plus de cheval.
function troSpyNote(){
  const st=TRO.st;
  const me=troFindSpy(st.board,TRO.myColor);
  // AVANT LE CHOIX, on n'a pas encore d'espion — ce n'est pas la même chose
  // que de n'en avoir plus, et le dire de travers ferait croire à une pièce
  // perdue avant le premier coup.
  if(TRO.choosing&&!me)return'Choisissez d’abord votre espion.';
  if(me)return'Votre espion attend en '+troSquare(me.r,me.c)+'.';
  if(st.revealed[TRO.myColor])return'Votre espion a changé de camp.';
  return'Votre espion est tombé avant d’avoir servi.';
}

function troSetStatus(){
  const st=TRO.st,el=document.getElementById('tro-status');
  if(!el)return;
  const past=vanStatusText(TRO.an);
  if(past){
    el.className='status-bar van-mode';
    if(el.textContent!==past)el.textContent=past;
    return;
  }
  let cls='status-bar',txt;
  if(st.gameOver){
    cls+=' mate';
    if(st.result==='draw')txt='Partie nulle — '+st.reason+'.';
    else txt=(st.result===TRO.myColor?'Victoire':'Défaite')+' — '+st.reason+'.';
  }else if(TRO.mode==='online'&&!troBothReady()){
    // LES DEUX CHOIX D'ABORD. Personne ne joue tant que les deux chevaux ne
    // sont pas entrés : un premier coup joué avant que l'autre ait choisi lui
    // retirerait des cavaliers à infiltrer.
    txt=TRO.choosing?'Choisissez votre espion.':'En attente du choix de l’adversaire…';
    cls+=' thinking';
  }else if(st.turn===TRO.myColor){
    txt=(st.check?'Échec ! À vous de jouer. ':'À votre tour. ')+troSpyNote();
    cls+=st.check?' check':' ok';
  }else{
    txt=st.check?'Échec à l’adversaire.'
      :(TRO.mode==='ia'?'L’adversaire réfléchit…':'Au tour de votre adversaire.');
    cls+=st.check?' check':' thinking';
  }
  el.className=cls;
  if(el.textContent!==txt)el.textContent=txt;
}

// Le journal est écrit par le mode analyse : chaque demi-coup y est un bouton
// qui saute à sa position (js/variant-analysis.js).
function troRenderLog(){
  const el=document.getElementById('tro-log');if(!el)return;
  el.innerHTML=vanLogHTML(TRO.st.moves,TRO_ART);
  vanMarkLog(TRO.an,el);
}
function troMarkLog(){vanMarkLog(TRO.an,document.getElementById('tro-log'));}

// ----------------------------------------------------------------
// SAISIE
// ----------------------------------------------------------------
// Les deux espions sont-ils entrés ? Contre l'IA, elle choisit le sien au
// coup d'envoi, donc la question ne se pose qu'en ligne.
function troBothReady(){
  return TRO.mode!=='online'||(!TRO.choosing&&TRO.oppReady);
}
function troPlayable(){
  return TRO.st&&!TRO.st.gameOver&&!TRO.anim&&!TRO.pendingPromo&&!TRO.choosing&&
    troBothReady()&&vanLive(TRO.an)&&TRO.st.turn===TRO.myColor;
}
// Les pièces que l'on peut prendre en main : les siennes, plus son espion.
function troCanHold(cell){
  return !!cell&&(cell.color===TRO.myColor||cell.spy===TRO.myColor);
}

function troSelect(r,c){
  TRO.sel={r,c};
  TRO.moves=troMovesFrom(TRO.st,r,c);
  if(typeof playSound==='function')playSound('tap',{force:.3});
  troPaintCells();
}
function troDeselect(){TRO.sel=null;TRO.moves=[];troPaintCells();}

// Même correctif que les deux autres variantes : le pointerdown sélectionne,
// et le clic qui suit ne doit pas désélectionner aussitôt (voir fok-game.js).
let _troSkipClick=false;

function troClick(r,c){
  if(_troSkipClick){_troSkipClick=false;return;}
  if(!troPlayable())return;
  const st=TRO.st,cell=st.board[r][c];
  if(TRO.sel){
    if(TRO.sel.r===r&&TRO.sel.c===c){troDeselect();return;}
    const target=TRO.moves.find(m=>m.to.r===r&&m.to.c===c);
    if(target){troTryMove(TRO.sel,{r,c});return;}
  }
  if(troCanHold(cell))troSelect(r,c);
  else troDeselect();
}

function troTryMove(from,to){
  const st=TRO.st;
  const all=troLegalMoves(st,st.turn).filter(m=>
    m.from.r===from.r&&m.from.c===from.c&&m.to.r===to.r&&m.to.c===to.c);
  if(!all.length)return;
  const promos=all.filter(m=>m.promo);
  troDeselect();
  if(promos.length){TRO.pendingPromo=promos;troShowPromo();return;}
  troSendWithClaim(all[0]);
}

function troShowPromo(){
  const row=document.getElementById('tro-promo-row');
  row.innerHTML=['q','r','b','n'].map(t=>
    '<button class="fok-promo-btn" data-t="'+t+'" title="'+TRO_NAME[t]+'">'+
      pieceSVG(TRO_ART[t],TRO.myColor)+'<span>'+TRO_NAME[t]+'</span></button>').join('');
  document.getElementById('tro-promo').classList.add('show');
}
function troChoosePromo(t){
  const list=TRO.pendingPromo;TRO.pendingPromo=null;
  document.getElementById('tro-promo').classList.remove('show');
  if(!list)return;
  troSendWithClaim(list.find(m=>m.promo===t)||list[0]);
}

// --- Glissé-déposé, identique aux deux autres variantes. ---
let _troDrag=null;
function troPointerDown(e,r,c){
  _troSkipClick=false;
  if(!troPlayable()||e.button&&e.button!==0)return;
  const cell=TRO.st.board[r][c];
  if(!troCanHold(cell))return;
  const already=!!(TRO.sel&&TRO.sel.r===r&&TRO.sel.c===c);
  if(!already)troSelect(r,c);
  _troDrag={r,c,x:e.clientX,y:e.clientY,moved:false,already};
  const ghost=document.getElementById('drag-ghost');
  if(ghost){ghost.innerHTML=pieceSVG(TRO_ART[cell.t],cell.color);
    ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';}
}
function troPointerMove(e){
  if(!_troDrag)return;
  const dx=e.clientX-_troDrag.x,dy=e.clientY-_troDrag.y;
  const ghost=document.getElementById('drag-ghost');
  if(!_troDrag.moved&&Math.sqrt(dx*dx+dy*dy)>6){
    _troDrag.moved=true;
    if(ghost)ghost.style.display='block';
    const n=_troPieceAt[_troDrag.r]&&_troPieceAt[_troDrag.r][_troDrag.c];
    if(n)n.classList.add('dragging');
  }
  if(_troDrag.moved&&ghost){ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';}
}
function troPointerUp(e){
  const d=_troDrag;if(!d)return;
  _troDrag=null;
  const ghost=document.getElementById('drag-ghost');
  if(ghost)ghost.style.display='none';
  const n=_troPieceAt[d.r]&&_troPieceAt[d.r][d.c];
  if(n)n.classList.remove('dragging');
  if(!d.moved){
    if(!d.already)_troSkipClick=true;
    return;
  }
  _troSkipClick=true;
  const cell=troCellFromPoint(e.clientX,e.clientY);
  if(cell&&TRO.moves.some(m=>m.to.r===cell.r&&m.to.c===cell.c))troTryMove({r:d.r,c:d.c},cell);
  else troDeselect();
}
function troCellFromPoint(x,y){
  const el=troBoardEl();if(!el)return null;
  const b=el.getBoundingClientRect();
  const px=x-b.left,py=y-b.top;
  if(px<0||py<0||px>b.width||py>b.height)return null;
  const vi=Math.floor(py/(b.height/8)),vc=Math.floor(px/(b.width/8));
  const flipped=troFlipped();
  const r=flipped?7-vi:vi,c=flipped?7-vc:vc;
  return troIn(r,c)?{r,c}:null;
}
document.addEventListener('pointermove',troPointerMove);
document.addEventListener('pointerup',troPointerUp);
document.addEventListener('pointercancel',()=>{ _troDrag=null;
  const g=document.getElementById('drag-ghost');if(g)g.style.display='none';});

function troKey(e,r,c,vi,vc){
  if(e.key==='Enter'||e.key===' '){e.preventDefault();troClick(r,c);return;}
  if(e.key==='Escape'){troDeselect();return;}
  const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];
  if(!d)return;
  e.preventDefault();
  const nvi=Math.min(7,Math.max(0,vi+d[0])),nvc=Math.min(7,Math.max(0,vc+d[1]));
  const flipped=troFlipped();
  const tr=flipped?7-nvi:nvi,tc=flipped?7-nvc:nvc;
  const el=_troCellAt[tr]&&_troCellAt[tr][tc];
  if(el){_troCells.forEach(x=>x.tabIndex=-1);el.tabIndex=0;el.focus();}
}

// ----------------------------------------------------------------
// JOUER UN COUP
// ----------------------------------------------------------------
// UN SEUL TEMPS, contrairement aux deux autres variantes : il n'y a pas de
// second déplacement à montrer. Ce qu'il y a à voir — le cavalier qui change
// de couleur sur sa case d'arrivée — est déjà porté par le morphing de la
// pièce (troSyncPieces).
// LE COUP QUI REPOSE SUR LE SECRET PASSE D'ABORD PAR L'ARBITRE. Une
// révélation, ou un coup qui n'est légal que parce qu'un cavalier d'en face
// est notre espion (troNeedsClaim) : l'adversaire ne pourra pas le comprendre
// tout seul, et le serveur est le seul à pouvoir lui confirmer qu'on ne ment
// pas (ec_troie_claim, supabase/schema.sql). On réclame AVANT d'envoyer : si
// la réclamation échoue, on joue quand même — l'arbitre est un renfort, pas
// une condition d'existence de la partie (voir troMpArbiterDown).
function troSendWithClaim(mv){
  const st=TRO.st;
  if(TRO.mode!=='online'||!TRO.onClaim||!troNeedsClaim(st,mv,TRO.myColor)){
    troPlayMove(mv,true);
    return;
  }
  const spy=troFindSpy(st.board,TRO.myColor);
  const piece=mv.reveal?(st.board[mv.from.r][mv.from.c]||{}).id:(spy&&spy.p.id);
  if(!piece){troPlayMove(mv,true);return;}
  TRO.anim=true;                       // le plateau ne répond plus le temps de l'aller-retour
  troSetStatus();
  Promise.resolve(TRO.onClaim(piece,st.ply)).catch(()=>false).then(()=>{
    TRO.anim=false;
    troPlayMove(mv,true);
  });
}

// `local` distingue le coup du joueur (à émettre sur le réseau) de celui qui
// arrive de l'adversaire ou de l'IA (déjà connu de tout le monde).
function troPlayMove(mv,local){
  const st=TRO.st;
  if(st.gameOver||TRO.anim)return;
  const mover=st.board[mv.from.r][mv.from.c];
  if(!mover)return;
  const type=mover.t;
  const side=mv.reveal||mover.color;     // le camp à qui ce coup appartient
  // ON ATTEND SON VERDICT DÈS L'ENVOI, et non après notre animation : le
  // réseau peut répondre avant que notre pièce ait fini de glisser, et un
  // verdict qui arrive trop tôt serait jeté.
  if(local&&TRO.mode==='online')TRO.awaiting=true;
  if(local&&TRO.onLocalMove)TRO.onLocalMove(troPackMove(mv));
  const taken=troMakeRaw(st,mv);
  if(taken)st.captured[side].push(taken.t);
  st.lastMove={from:{r:mv.from.r,c:mv.from.c},to:{r:mv.to.r,c:mv.to.c}};
  st.turn=troOpp(st.turn);
  st.ply++;
  TRO.anim=true;
  troRender();
  if(typeof playSound==='function')
    playSound(mv.reveal?'promo':(mv.castle?'castle':(mv.promo?'promo':(taken?'capture':'move'))));

  setTimeout(()=>{
    troUpdateStatus(st);
    // EN LIGNE, ON NE JUGE PAS LA POSITION D'EN FACE. Le camp qui vient de
    // recevoir le coup est le seul à connaître son propre espion : lui seul
    // sait s'il est en échec, mat ou pat. On efface donc notre verdict sur
    // SON camp et on attend le sien (troApplyVerdict) ; le nôtre, en
    // revanche, on le calcule et on l'annonce.
    const judgeThem=(TRO.mode==='online'&&st.turn!==TRO.myColor);
    if(judgeThem){
      st.gameOver=false;st.result=null;st.reason='';st.check=false;
      TRO.awaiting=true;
    }
    troRecord(st,mv,taken,side,type);
    vanPush(TRO.an,st);
    TRO.anim=false;
    troRender();troRenderLog();troSetStatus();troSyncChrome();
    if(st.check&&!st.gameOver&&typeof playSound==='function')playSound('check');
    if(TRO.mode==='online'&&!local)troSendVerdict();
    if(st.gameOver){troFinish();return;}
    if(TRO.mode==='ia'&&st.turn!==TRO.myColor)setTimeout(troAITurn,TRO_AI_DELAY);
  },TRO_MOVE_MS);
}

// ----------------------------------------------------------------
// LE VERDICT, EN LIGNE : ce que NOTRE camp est seul à pouvoir dire
// ----------------------------------------------------------------
// Il part après chaque coup reçu, et il contient exactement ce que l'autre ne
// peut pas calculer : sommes-nous en échec, la partie est-elle finie, et
// pourquoi. Aucune information sur notre espion n'y transite — « je suis en
// échec » ne dit pas par quoi.
function troSendVerdict(){
  const st=TRO.st;
  if(!st||!TRO.onVerdict)return;
  TRO.onVerdict({
    check:!!st.check,
    over:!!st.gameOver,
    result:st.gameOver?st.result:null,
    reason:st.gameOver?st.reason:'',
  });
}
// Le verdict de l'adversaire sur le coup qu'on vient de jouer.
function troApplyVerdict(v){
  const st=TRO.st;
  if(!st||!v||!TRO.awaiting)return;
  // Notre coup glisse encore : on laisse la pièce arriver avant de poser le
  // verdict, sinon la fin de partie s'afficherait par-dessus un plateau qui
  // n'a pas fini de bouger.
  if(TRO.anim){setTimeout(()=>troApplyVerdict(v),TRO_MOVE_MS);return;}
  TRO.awaiting=false;
  if(st.gameOver)return;                       // déjà fini de notre côté
  st.check=!!v.check;
  if(v.over){
    st.gameOver=true;
    st.result=(v.result==='draw')?'draw':(v.result||troOpp(TRO.myColor));
    st.reason=v.reason||'mat';
    troRender();troSetStatus();troFinish();
    return;
  }
  troRender();troSetStatus();
}

// ----------------------------------------------------------------
// LE COUP REÇU DU RÉSEAU (js/troie-mp.js)
// ----------------------------------------------------------------
// Il est REVÉRIFIÉ par le moteur local, comme dans les deux autres variantes :
// un client modifié ne peut pas faire bouger une pièce comme il veut chez
// l'adversaire. Mais ici la vérification doit composer avec ce qu'on IGNORE,
// et c'est tout le sel de troResolveRemote.
// Elle rend une PROMESSE : quand le coup reçu repose sur son espion, il faut
// demander à l'arbitre, et l'arbitre est au bout du réseau.
function troRemoteMove(pk){
  const st=TRO.st;
  if(!st||st.gameOver)return Promise.resolve(false);
  const side=troOpp(TRO.myColor);
  if(st.turn!==side)return Promise.resolve(false);
  if(TRO.anim)return new Promise(res=>setTimeout(()=>res(troRemoteMove(pk)),TRO_MOVE_MS));
  // La lecture d'un coup reçu quand on ignore l'espion d'en face est un
  // raisonnement sur les RÈGLES, pas sur l'écran : elle vit dans le moteur
  // (troRemoteOptions, js/troie-rules.js), où elle se teste sans navigateur.
  const opts=troRemoteOptions(st,pk,side,TRO.myColor);
  if(!opts.length)return Promise.resolve(false);
  // Le coup se lit tel quel : rien à prouver, rien à demander.
  if(!opts[0].pieceId){troPlayMove(opts[0].mv,false);return Promise.resolve(true);}
  return troJudge(opts,side);
}

// LES HYPOTHÈSES, SOUMISES À L'ARBITRE, UNE PAR UNE. Il ne répond « oui » que
// pour la pièce que l'adversaire vient de réclamer : une seule hypothèse peut
// donc être confirmée, et une invention n'en obtient aucune. Quand l'arbitre
// est absent — hors ligne, serveur injoignable, multijoueur non configuré —,
// on retombe sur la parole donnée : la première hypothèse qui tient, ce qui
// était le seul comportement possible avant lui.
function troJudge(opts,side){
  const st=TRO.st;
  // LE DEMI-COUP NE VOYAGE PAS : les deux camps sont au même `ply` avant le
  // coup, et c'est celui-là que l'arbitre a enregistré. Un numéro transmis
  // serait un numéro qu'on peut écrire soi-même.
  const ply=st.ply;
  if(!TRO.onVerify){
    troPlayMove(opts[0].mv,false);
    return Promise.resolve(true);
  }
  let i=0;
  const suivant=()=>{
    if(i>=opts.length)return Promise.resolve(false);
    const opt=opts[i++];
    return Promise.resolve(TRO.onVerify(opt.pieceId,ply)).catch(()=>null).then(ok=>{
      if(ok===null){                       // l'arbitre n'a pas répondu du tout
        troPlayMove(opts[0].mv,false);
        return true;
      }
      if(!ok)return suivant();
      // CONFIRMÉ : ce cavalier EST son espion, et on a le droit de le savoir —
      // c'est son propre coup qui vient de nous le dire. On garde donc la
      // marque, et le moteur devient exact pour la suite de la partie.
      troAdoptOption(st,opt,side);
      troPlayMove(opt.mv,false);
      return true;
    });
  };
  return suivant();
}

// Défaite/victoire imposée de l'extérieur (adversaire parti, abandon reçu).
function troDeclare(result,reason){
  const st=TRO.st;
  if(!st||st.gameOver)return;
  st.gameOver=true;st.result=result;st.reason=reason||'abandon';
  troFinish();troRender();
}

function troAITurn(){
  const st=TRO.st;
  if(!st||st.gameOver||st.turn===TRO.myColor||TRO.mode!=='ia')return;
  // La recherche est synchrone et bornée (voir troie-ai.js) : on la laisse
  // partir après un rendu, pour que « L'adversaire réfléchit… » soit
  // effectivement affiché avant que le fil ne se bloque.
  requestAnimationFrame(()=>{
    const mv=troAIMove(st,TRO.level);
    if(!mv)return;
    troPlayMove(mv,false);
  });
}

// ----------------------------------------------------------------
// FIN DE PARTIE
// ----------------------------------------------------------------
// C'EST LE MOMENT OÙ TOUT SE DIT. Le cheval adverse est nommé — révélé, tombé
// sans servir, ou encore tapi dans vos rangs —, et c'est souvent là que la
// partie s'explique.
function troSpyStory(){
  const st=TRO.st;
  const foe=troOpp(TRO.myColor);
  const his=troFindSpy(st.board,foe);
  if(his)return'Son espion dormait encore dans vos rangs : votre cavalier '+troSquare(his.r,his.c)+'.';
  if(st.revealed[foe])return'Son espion s’était retourné contre vous en cours de partie.';
  return'Son espion est tombé sans avoir jamais servi — et vous ne saviez pas que c’en était un.';
}

function troFinish(){
  troSetStatus();
  const st=TRO.st;
  const win=st.result==='draw'?null:st.result===TRO.myColor;
  if(typeof playSound==='function')playSound(win===null?'draw':(win?'win':'loss'));
  document.getElementById('tro-res-title').textContent=
    st.result==='draw'?'Partie nulle':(win?'Victoire':'Défaite');
  document.getElementById('tro-res-sub').innerHTML=
    escH('Cheval de Troie — '+st.reason+', en '+Math.ceil(st.moves.length/2)+' coups.')+
    '<br>'+escH(troSpyStory());
  const btns=document.getElementById('tro-res-btns');
  btns.innerHTML=(TRO.mode==='ia'?'<button class="btn btn-gold" id="tro-res-again">Rejouer</button>':'')+
    '<button class="btn btn-primary" id="tro-res-an">Analyser</button>'+
    '<button class="btn btn-ghost" id="tro-res-quit">Quitter</button>';
  document.getElementById('tro-result').classList.add('show');
  document.getElementById('tro-res-an').onclick=()=>{
    document.getElementById('tro-result').classList.remove('show');
    troOpenAnalysis();
  };
  const again=document.getElementById('tro-res-again');
  if(again)again.onclick=()=>{
    document.getElementById('tro-result').classList.remove('show');
    troStartGame({mode:'ia',level:TRO.level,myColor:TRO.myColor==='w'?'b':'w',
      oppName:TRO.oppName,oppSub:TRO.oppSub});
  };
  document.getElementById('tro-res-quit').onclick=troLeave;
  const quit=document.getElementById('tro-quit');
  if(quit)quit.querySelector('span').textContent='Quitter';
  troRender();      // les deux espions peuvent maintenant se montrer
}

// Ouvre le journal sur la position de départ : l'entrée du mode analyse
// depuis le modal de fin de partie.
function troOpenAnalysis(){
  const btn=document.getElementById('tro-btn-history');
  if(btn&&_troPanel!=='tro-panel-history')troPanelToggle('tro-panel-history',btn);
  vanGoto(TRO.an,0);
}

function troResign(){
  const st=TRO.st;
  if(!st||st.gameOver){troLeave();return;}
  showConfirmModal('Abandonner cette partie ?',()=>{
    if(!TRO.st||TRO.st.gameOver)return;
    TRO.st.gameOver=true;TRO.st.result=troOpp(TRO.myColor);TRO.st.reason='abandon';
    if(TRO.onEnd)TRO.onEnd('resign');
    troFinish();troRender();
  },{okLabel:'Abandonner',cancelLabel:'Continuer'});
}

function troLeave(){
  TRO.choosing=false;
  document.getElementById('tro-result').classList.remove('show');
  document.getElementById('tro-promo').classList.remove('show');
  document.getElementById('tro-spy').classList.remove('show');
  TRO.pendingPromo=null;
  if(TRO.onEnd)TRO.onEnd('leave');
  TRO.onLocalMove=null;TRO.onReady=null;TRO.onVerdict=null;TRO.onEnd=null;
  TRO.onClaim=null;TRO.onVerify=null;
  if(typeof goToMainMenu==='function')goToMainMenu();
  else showPage('page-jouer');
}

// ----------------------------------------------------------------
// DÉMARRAGE, ET LE CHOIX DE L'ESPION
// ----------------------------------------------------------------
// La partie est POSÉE d'abord (plateau, bandeaux, journal vide), puis la
// fenêtre du choix s'ouvre par-dessus : on voit ainsi le camp qu'on
// s'apprête à infiltrer pendant qu'on choisit, ce qui est exactement le
// moment où l'on veut le voir.
function troStartGame(opts){
  opts=opts||{};
  TRO.st=troNewState();
  TRO.mode=opts.mode||'ia';
  TRO.level=opts.level||'soldat';
  TRO.myColor=opts.myColor||'w';
  TRO.oppName=opts.oppName||'Adversaire';
  TRO.oppSub=opts.oppSub||'';
  TRO.sel=null;TRO.moves=[];TRO.anim=false;TRO.pendingPromo=null;TRO.choosing=true;
  TRO.oppReady=false;TRO.awaiting=false;
  _troCells=null;_troFlipped=null;_troNodes=new Map();
  const board=troBoardEl();
  if(board)board.innerHTML='';

  // L'IA choisit SON espion tout de suite, et personne ne l'apprendra avant
  // la fin de la partie (troSpyShown). EN LIGNE, il n'y a rien à choisir ici :
  // l'espion de l'adversaire est choisi sur SA machine et n'existe pas dans
  // cet onglet — c'est ce qui rend le secret réel plutôt que promis.
  if(TRO.mode==='ia'){
    const pick=troAIChooseSpy(TRO.st,troOpp(TRO.myColor));
    if(pick)troSetSpy(TRO.st,troOpp(TRO.myColor),pick.r,pick.c);
  }
  troUpdateStatus(TRO.st);
  vanReset(TRO.an,TRO.st);
  vanBind(TRO.an,'tro');

  const me=(typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur';
  document.getElementById('tro-me-name').textContent=me;
  document.getElementById('tro-me-av').textContent=me.charAt(0).toUpperCase();
  document.getElementById('tro-me-sub').textContent=TRO.myColor==='w'?'Blancs':'Noirs';
  document.getElementById('tro-opp-name').textContent=TRO.oppName;
  document.getElementById('tro-opp-av').textContent=(TRO.oppName||'?').charAt(0).toUpperCase();
  document.getElementById('tro-opp-sub').textContent=TRO.oppSub||(TRO.myColor==='w'?'Noirs':'Blancs');
  const quit=document.getElementById('tro-quit');
  if(quit)quit.querySelector('span').textContent='Abandonner';
  document.getElementById('tro-result').classList.remove('show');
  troPanelClose();

  showPage('page-troie');
  troRender();troRenderLog();troSetStatus();
  requestAnimationFrame(()=>{troSyncChrome();troRender();});
  troAskSpy();
}

// LA FENÊTRE DU CHOIX. Deux cartes, les deux cavaliers d'en face, et aucune
// façon de passer outre : une partie sans espion ne serait pas cette partie.
function troAskSpy(){
  const st=TRO.st;
  const list=troSpyChoices(st.board,TRO.myColor);
  const row=document.getElementById('tro-spy-row');
  const foe=troOpp(TRO.myColor);
  row.innerHTML=list.map(k=>
    '<button class="tro-spy-btn" data-r="'+k.r+'" data-c="'+k.c+'">'+
      pieceSVG(TRO_ART.n,foe)+
      '<span>Cavalier '+troSquare(k.r,k.c)+'</span></button>').join('');
  document.getElementById('tro-spy').classList.add('show');
}
function troChooseSpy(r,c){
  if(!TRO.st)return;
  if(!troSetSpy(TRO.st,TRO.myColor,r,c))return;
  TRO.choosing=false;
  document.getElementById('tro-spy').classList.remove('show');
  if(typeof playSound==='function')playSound('promo');
  troUpdateStatus(TRO.st);
  vanReset(TRO.an,TRO.st);          // la photo de départ porte ce qu'on sait
  troRender();troSetStatus();
  // EN LIGNE, ON ANNONCE QU'ON A CHOISI — pas ce qu'on a choisi. C'est tout
  // ce que l'adversaire a besoin de savoir pour que la partie parte.
  if(TRO.mode==='online'&&TRO.onReady)TRO.onReady();
  if(TRO.mode==='ia'&&TRO.st.turn!==TRO.myColor)setTimeout(troAITurn,600);
}
// L'adversaire en ligne vient d'annoncer son choix (js/troie-mp.js).
function troOppReady(){
  TRO.oppReady=true;
  if(TRO.st)troSetStatus();
}

// ----------------------------------------------------------------
// PANNEAUX ET MESURE DE L'ÉCRAN
// ----------------------------------------------------------------
let _troPanel=null;
function troPanelClose(){
  if(!_troPanel)return;
  const el=document.getElementById(_troPanel);
  if(el)el.hidden=true;
  document.querySelectorAll('#tro-under .gt-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
  _troPanel=null;
}
function troPanelToggle(id,btn){
  if(_troPanel===id){troPanelClose();return;}
  troPanelClose();
  const el=document.getElementById(id);
  if(!el)return;
  el.hidden=false;_troPanel=id;
  btn.setAttribute('aria-expanded','true');
  if(id==='tro-panel-history'){const l=document.getElementById('tro-log');if(l)l.scrollTop=l.scrollHeight;}
}

// Hauteur occupée par tout ce qui n'est pas le plateau : c'est elle qui borne
// la taille de l'échiquier sur téléphone (--game-chrome, voir [MOBILE-GAME]).
function troSyncChrome(){
  const page=document.getElementById('page-troie');
  if(!page||!page.classList.contains('active'))return;
  const board=troBoardEl(),wrap=page.querySelector('.game-wrap'),main=page.querySelector('.game-main');
  if(!board||!wrap||!main)return;
  const b=board.getBoundingClientRect();
  if(b.height<=0)return;
  const cs=getComputedStyle(wrap);
  const gap=parseFloat(cs.rowGap||cs.gap)||0;
  const padB=parseFloat(cs.paddingBottom)||0;
  const m=main.getBoundingClientRect();
  let below=Math.max(0,m.bottom-b.bottom),n=0;
  const under=document.getElementById('tro-under');
  for(const el of[document.getElementById('tro-me-bar'),document.getElementById('tro-status'),
                  under,page.querySelector('.game-btns')]){
    if(!el||el.offsetParent===null)continue;
    if(el===under){
      let h=0,k=0;
      for(const ch of el.children){
        if(ch.hidden)continue;
        const st2=getComputedStyle(ch);
        if(st2.position==='absolute'||st2.display==='none')continue;
        const rr=ch.getBoundingClientRect();
        if(rr.height>0){h+=rr.height;k++;}
      }
      const g2=parseFloat(getComputedStyle(el).rowGap||getComputedStyle(el).gap)||0;
      below+=k?h+g2*(k-1):0;
    }else below+=el.getBoundingClientRect().height;
    n++;
  }
  below+=gap*n+padB;
  const chrome=Math.round(b.top+below+12);
  if(chrome>0&&chrome<3000)document.documentElement.style.setProperty('--game-chrome',chrome+'px');
}
window.addEventListener('resize',troSyncChrome);
window.addEventListener('orientationchange',()=>setTimeout(troSyncChrome,120));

// ----------------------------------------------------------------
// BRANCHEMENTS
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('tro-quit')?.addEventListener('click',()=>{
    if(TRO.st&&TRO.st.gameOver)troLeave();else troResign();
  });
  document.getElementById('tro-btn-history')?.addEventListener('click',e=>
    troPanelToggle('tro-panel-history',e.currentTarget));
  document.getElementById('tro-btn-regle')?.addEventListener('click',e=>
    troPanelToggle('tro-panel-regle',e.currentTarget));
  document.querySelectorAll('[data-tro-close]').forEach(b=>b.addEventListener('click',troPanelClose));
  document.getElementById('tro-promo-row')?.addEventListener('click',e=>{
    const b=e.target.closest('.fok-promo-btn');
    if(b)troChoosePromo(b.dataset.t);
  });
  document.getElementById('tro-spy-quit')?.addEventListener('click',troLeave);
  document.getElementById('tro-spy-row')?.addEventListener('click',e=>{
    const b=e.target.closest('.tro-spy-btn');
    if(b)troChooseSpy(+b.dataset.r,+b.dataset.c);
  });
});

// ================================================================
// LE SALON DE LA VARIANTE
// ================================================================
// Une seule fenêtre, quatre vues : choisir l'adversaire, choisir le niveau de
// l'IA, choisir la façon de trouver un joueur, attendre — exactement comme
// les deux autres variantes.
//
// Les trois entrées en ligne appellent js/troie-mp.js. Si ce fichier n'est pas
// chargé — ou si le multijoueur n'est pas configuré —, la vue le DIT au lieu
// d'ouvrir un écran qui n'aboutit pas.
let _troLobbyView='menu';

function troOpenLobby(){
  _troLobbyView='menu';
  troLobbyRender();
  document.getElementById('tro-lobby').classList.add('show');
}
function troCloseLobby(){
  document.getElementById('tro-lobby').classList.remove('show');
  if(typeof troMpCancel==='function')troMpCancel();
}

function troLobbyRender(msg){
  const body=document.getElementById('tro-lobby-body');
  if(!body)return;
  let h='';
  if(_troLobbyView==='menu'){
    h='<div class="fok-lob-grid">'+
      '<button class="fok-lob-card" data-view="ia"><b>Affronter l’IA</b><span>Quatre adversaires, de l’Apprenti à l’Usurpateur.</span></button>'+
      '<button class="fok-lob-card" data-view="online"><b>Affronter un joueur</b><span>Partie rapide, ou partie privée entre amis. Chacun choisit son espion chez soi.</span></button>'+
    '</div>';
  }else if(_troLobbyView==='ia'){
    h='<div class="fok-lob-grid">'+TRO_AI_LEVELS.map(l=>
      '<button class="fok-lob-card" data-level="'+l.id+'"><b>'+escH(l.nom)+'</b><span>'+escH(l.desc)+'</span></button>').join('')+
      '</div><button class="btn btn-ghost fok-lob-back" data-view="menu">Retour</button>';
  }else if(_troLobbyView==='online'){
    const ok=(typeof troMpAvailable==='function')&&troMpAvailable();
    h=ok?('<div class="fok-lob-grid">'+
      '<button class="fok-lob-card" data-online="quick"><b>Partie rapide</b><span>On vous trouve un adversaire qui attend la même chose.</span></button>'+
      '<button class="fok-lob-card" data-online="host"><b>Créer une partie privée</b><span>Vous recevez un code à quatre lettres à transmettre.</span></button>'+
      '</div>'+
      '<div class="fok-lob-join"><input id="tro-code" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false">'+
      '<button class="btn btn-gold" data-online="join">Rejoindre</button></div>'+
      '<div class="fok-lob-note">Votre espion ne quitte jamais cet appareil : l’adversaire ne l’apprendra que si vous le jouez.</div>')
      :'<div class="fok-lob-note">Le jeu en ligne n’est pas disponible ici (bibliothèque réseau bloquée ou hors connexion). L’IA, elle, fonctionne toujours.</div>';
    h+='<button class="btn btn-ghost fok-lob-back" data-view="menu">Retour</button>';
  }else if(_troLobbyView==='wait'){
    h='<div class="fok-lob-wait"><div class="mp-radar"><span></span><span></span><span></span></div>'+
      '<div class="fok-lob-note" id="tro-wait-note">'+escH(msg||'Recherche d’un adversaire…')+'</div></div>'+
      '<button class="btn btn-ghost fok-lob-back" data-view="cancel">Annuler</button>';
  }
  body.innerHTML=h;
}

// Message d'attente, sans reconstruire la vue (js/troie-mp.js l'appelle à
// chaque changement d'état du salon).
function troLobbyWait(msg){
  if(_troLobbyView!=='wait'){_troLobbyView='wait';troLobbyRender(msg);return;}
  const n=document.getElementById('tro-wait-note');
  if(n)n.textContent=msg;
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('tro-lobby-close')?.addEventListener('click',troCloseLobby);
  document.getElementById('tro-lobby-body')?.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.view==='cancel'){_troLobbyView='online';if(typeof troMpCancel==='function')troMpCancel();troLobbyRender();return;}
    if(b.dataset.view){_troLobbyView=b.dataset.view;troLobbyRender();return;}
    if(b.dataset.level){
      const l=troAILevel(b.dataset.level);
      document.getElementById('tro-lobby').classList.remove('show');
      troStartGame({mode:'ia',level:l.id,myColor:'w',oppName:l.nom,oppSub:'Intelligence artificielle'});
      return;
    }
    if(b.dataset.online&&typeof troMpStart==='function'){
      const code=(document.getElementById('tro-code')?.value||'').trim().toUpperCase();
      troMpStart(b.dataset.online,code);
    }
  });
});
