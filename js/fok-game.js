// ================================================================
// FOK-GAME.JS : l'écran de la « Chute des Royaumes »
// ================================================================
// Le plateau, les bandeaux, le journal, la fin de partie. C'est le pendant de
// game-render.js + game-flow.js pour la variante, en beaucoup plus court : il
// n'y a ici ni pouvoir, ni effet spécial, ni armée misée, ni pendule, ni ELO.
// La variante ne coûte rien et ne rapporte rien — on y joue pour la règle.
//
// POURQUOI UN ÉCRAN SÉPARÉ PLUTÔT QUE #page-game. La partie ordinaire tient
// dans un objet GS que quinze fichiers lisent et écrivent (pouvoirs, coffres,
// classement, tutoriel, rejouabilité...). Y greffer un décalage de rangées
// aurait demandé de toucher à chacun d'eux. L'écran de la variante réutilise
// donc la FEUILLE DE STYLE de la partie (mêmes classes, même plateau, même
// colonne latérale, même mise en page sur téléphone) et rien d'autre : il n'y
// a aucun état partagé, donc aucune régression possible sur le jeu principal.
//
// DEUX TEMPS PAR COUP, ET C'EST TOUTE LA MISE EN SCÈNE. La pièce se déplace
// d'abord ; un battement plus tard, les quatre rangées centrales glissent
// ensemble d'une case. Jouer les deux dans le même rendu donnerait une pièce
// qui part en biais sans qu'on comprenne pourquoi — alors que là, on VOIT la
// règle s'appliquer. C'est la même couche de pièces que le jeu principal
// (.gc-layer / .gc-piece en translate3d), donc le glissement est une vraie
// transition CSS et non un redessin.
//
// Dépendances : fok-rules.js, fok-ai.js, piece-art.js (pieceSVG), main.js
// (showPage, escH, showConfirmModal), rules-engine.js (playSound),
// economy-ui.js (getBoardSkin, facultatif). fok-mp.js se branche dessus pour
// les parties en ligne, et n'est pas nécessaire pour jouer contre l'IA.
// ================================================================

const FOK_MOVE_MS=200;    // durée du déplacement, alignée sur .gc-piece
const FOK_SHIFT_MS=260;   // battement avant le décalage de la bande
const FOK_AI_DELAY=320;   // temps de respiration avant que l'IA ne joue

const FOK={
  st:null,
  mode:'ia',          // 'ia' | 'online'
  level:'soldat',
  myColor:'w',
  oppName:'Adversaire',
  oppSub:'',
  sel:null,           // case saisie
  moves:[],           // ses destinations légales
  anim:false,         // un coup est en cours d'animation : plus d'entrée
  pendingPromo:null,  // coup en attente du choix de la pièce promue
  onLocalMove:null,   // branché par fok-mp.js : émet le coup sur le réseau
  onEnd:null,         // branché par fok-mp.js : prévient l'adversaire
};

function fokBoardEl(){return document.getElementById('fok-board');}
function fokFlipped(){return FOK.myColor==='b';}

// ----------------------------------------------------------------
// LES 64 CASES
// ----------------------------------------------------------------
// Bâties une fois par orientation, jamais recréées ensuite : ce sont elles qui
// portent les écouteurs, et une grille immobile est ce qui rend le pointage
// fiable pendant qu'une pièce glisse au-dessus.
let _fokCells=null,_fokFlipped=null,_fokCellAt=[],_fokNodes=new Map(),_fokPieceAt=[];

function fokEnsureCells(){
  const el=fokBoardEl();
  const flipped=fokFlipped();
  if(_fokCells&&_fokFlipped===flipped&&el.querySelector('.gc'))return;
  el.innerHTML='';
  el.setAttribute('role','grid');
  el.setAttribute('aria-label','Échiquier de la Chute des Royaumes');
  _fokCells=[];_fokFlipped=flipped;_fokNodes=new Map();_fokPieceAt=[];
  _fokCellAt=[];for(let i=0;i<8;i++)_fokCellAt.push(new Array(8).fill(null));
  for(let vi=0;vi<8;vi++)for(let vc=0;vc<8;vc++){
    const r=flipped?7-vi:vi,c=flipped?7-vc:vc;
    const d=document.createElement('div');
    d.className='gc '+(((r+c)%2===0)?'l':'d');
    d.dataset.r=r;d.dataset.c=c;
    d.setAttribute('role','gridcell');
    d.tabIndex=(vi===0&&vc===0)?0:-1;
    let coord='';
    if(vc===0)coord+='<span class="gc-rank">'+(8-r)+'</span>';
    if(vi===7)coord+='<span class="gc-file">'+FOK_FILES[c].toUpperCase()+'</span>';
    if(coord)d.innerHTML=coord;
    d.addEventListener('click',()=>fokClick(r,c));
    d.addEventListener('keydown',e=>fokKey(e,r,c,vi,vc));
    d.addEventListener('pointerdown',e=>fokPointerDown(e,r,c));
    el.appendChild(d);
    _fokCells.push(d);
    _fokCellAt[r][c]=d;
  }
  // LA BANDE QUI GLISSE SE VOIT SUR LE PLATEAU. Un seul calque posé sur les
  // quatre rangées centrales, sous les pièces et au-dessus des cases : sans
  // lui, la règle centrale de la variante ne se découvre qu'en jouant un
  // coup — et on la prend alors pour un défaut d'affichage. Un calque unique
  // plutôt qu'une teinte par case : les cases portent déjà leurs
  // surbrillances sur ::before et ::after, il n'y avait plus de place.
  const band=document.createElement('div');
  band.className='fok-band';
  band.setAttribute('aria-hidden','true');
  el.appendChild(band);
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

function fokLayer(){return fokBoardEl().querySelector('.gc-layer');}

// ----------------------------------------------------------------
// PEINTURE DES CASES ET DIFF DES PIÈCES
// ----------------------------------------------------------------
function fokPaintCells(){
  const st=FOK.st;if(!st||!_fokCells)return;
  const check=fokInCheck(st.board,st.turn);
  const mine=!st.gameOver&&st.turn===FOK.myColor&&!FOK.anim;
  for(const el of _fokCells){
    const r=+el.dataset.r,c=+el.dataset.c;
    const cell=st.board[r][c];
    let cls='gc '+(((r+c)%2===0)?'l':'d');
    if(FOK.sel&&FOK.sel.r===r&&FOK.sel.c===c)cls+=' sel';
    const avail=FOK.moves.some(m=>m.to.r===r&&m.to.c===c);
    if(avail)cls+=(cell?' avail-cap':' avail');
    if(st.lastMove){
      if(st.lastMove.from.r===r&&st.lastMove.from.c===c)cls+=' lm-from';
      else if(st.lastMove.to.r===r&&st.lastMove.to.c===c)cls+=' lm-to';
    }
    if(cell&&cell.t==='k'&&cell.color===st.turn&&check)cls+=' gc-check';
    if(cell&&cell.color===FOK.myColor&&mine)cls+=' gc-holds';
    if(el.className!==cls)el.className=cls;
    // La rangée mobile est ANNONCÉE : ce qui se voit par un lavis doit
    // s'entendre, sinon la règle est invisible au lecteur d'écran.
    const lab=fokSquare(r,c)+(FOK_SHIFTED[r]?' (rangée mobile)':'')+
      (cell?', '+FOK_NAME[cell.t]+(cell.color==='w'?' blanc':' noir'):', case vide')+
      (avail?(cell?', prise possible':', déplacement possible'):'');
    if(el.getAttribute('aria-label')!==lab)el.setAttribute('aria-label',lab);
  }
}

// Chaque pièce garde son nœud pour toute la partie : c'est ce qui fait que le
// décalage de la bande se VOIT — huit à seize pièces qui glissent ensemble
// d'une case — au lieu d'apparaître d'un coup ailleurs.
function fokSyncPieces(){
  const st=FOK.st,layer=fokLayer(),flipped=fokFlipped();
  const seen=new Set();
  const at=[];for(let r=0;r<8;r++)at.push(new Array(8).fill(null));
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=st.board[r][c];
    if(!p)continue;
    seen.add(p.id);
    const vi=flipped?7-r:r,vc=flipped?7-c:c;
    const tf='translate3d('+(vc*100)+'%,'+(vi*100)+'%,0)';
    const art=p.t+':'+p.color;
    let node=_fokNodes.get(p.id);
    if(!node){
      node=document.createElement('div');
      node.className='gc-piece gc-born';
      node.innerHTML='<span class="gc-art">'+pieceSVG(FOK_ART[p.t],p.color)+'</span>';
      node._art=art;node._tf=tf;
      node.style.transform=tf;      // posé AVANT l'insertion : sinon la pièce
      layer.appendChild(node);      // glisserait depuis le coin du plateau
      _fokNodes.set(p.id,node);
      setTimeout(()=>node.classList.remove('gc-born'),FOK_MOVE_MS);
    }else{
      if(node._art!==art){          // promotion : le pion DEVIENT la pièce
        const a=node.querySelector('.gc-art');
        if(a){a.innerHTML=pieceSVG(FOK_ART[p.t],p.color);a.classList.add('gc-morph');
          setTimeout(()=>a.classList.remove('gc-morph'),320);}
        node._art=art;
      }
      if(node._tf!==tf){
        node._tf=tf;
        node.classList.add('gc-moving');
        node.style.transform=tf;
        clearTimeout(node._mt);
        node._mt=setTimeout(()=>node.classList.remove('gc-moving'),FOK_MOVE_MS+40);
      }
    }
    at[r][c]=node;
  }
  // Les pièces prises quittent la couche après leur agonie.
  for(const[id,node]of _fokNodes){
    if(seen.has(id))continue;
    _fokNodes.delete(id);
    node.classList.add('gc-dying');
    setTimeout(()=>node.remove(),260);
  }
  _fokPieceAt=at;
}

function fokRender(){
  if(!FOK.st)return;
  fokEnsureCells();
  fokPaintCells();
  fokSyncPieces();
  fokPaintBars();
}

// ----------------------------------------------------------------
// BANDEAUX, STATUT, JOURNAL
// ----------------------------------------------------------------
function fokPaintBars(){
  const st=FOK.st;
  const mine=st.turn===FOK.myColor;
  document.getElementById('fok-me-bar').classList.toggle('gp-turn',mine&&!st.gameOver);
  document.getElementById('fok-opp-bar').classList.toggle('gp-turn',!mine&&!st.gameOver);
  fokDrawCaptured('fok-cap-me',st.captured[FOK.myColor],fokOpp(FOK.myColor));
  fokDrawCaptured('fok-cap-opp',st.captured[fokOpp(FOK.myColor)],FOK.myColor);
}
function fokDrawCaptured(id,list,color){
  const el=document.getElementById(id);if(!el)return;
  const order=['q','r','b','n','p'];
  const html=(list||[]).slice().sort((a,b)=>order.indexOf(a)-order.indexOf(b))
    .map(t=>pieceIcon(FOK_ART[t],color)).join('');
  if(el.innerHTML!==html)el.innerHTML=html;
}

function fokSetStatus(){
  const st=FOK.st,el=document.getElementById('fok-status');
  if(!el)return;
  let cls='status-bar',txt;
  if(st.gameOver){
    cls+=' mate';
    if(st.result==='draw')txt='Partie nulle — '+st.reason+'.';
    else txt=(st.result===FOK.myColor?'Victoire':'Défaite')+' — '+st.reason+'.';
  }else if(st.turn===FOK.myColor){
    txt=st.check?'Échec ! À vous de jouer.':'À votre tour.';
    cls+=st.check?' check':' ok';
  }else{
    txt=st.check?'Échec à l’adversaire.':(FOK.mode==='ia'?'L’adversaire réfléchit…':'Au tour de votre adversaire.');
    cls+=st.check?' check':' thinking';
  }
  el.className=cls;
  if(el.textContent!==txt)el.textContent=txt;
}

function fokRenderLog(){
  const el=document.getElementById('fok-log');if(!el)return;
  const rows=[];
  const m=FOK.st.moves;
  for(let i=0;i<m.length;i+=2){
    const w=m[i],b=m[i+1];
    rows.push('<div class="move-log-item"><span class="move-log-num">'+(i/2+1)+'.</span>'+
      '<span class="move-log-w">'+pieceIcon(FOK_ART[w.piece],'w')+escH(w.text)+'</span>'+
      '<span class="move-log-b">'+(b?pieceIcon(FOK_ART[b.piece],'b')+escH(b.text):'')+'</span></div>');
  }
  el.innerHTML=rows.join('');
  el.scrollTop=el.scrollHeight;
}

// ----------------------------------------------------------------
// SAISIE
// ----------------------------------------------------------------
function fokPlayable(){
  return FOK.st&&!FOK.st.gameOver&&!FOK.anim&&!FOK.pendingPromo&&FOK.st.turn===FOK.myColor;
}

function fokSelect(r,c){
  FOK.sel={r,c};
  FOK.moves=fokMovesFrom(FOK.st,r,c);
  if(typeof playSound==='function')playSound('tap',{force:.3});
  fokPaintCells();
}
function fokDeselect(){FOK.sel=null;FOK.moves=[];fokPaintCells();}

// UN APPUI COURT DOIT SUFFIRE À SÉLECTIONNER. Le geste commence sur
// `pointerdown` (c'est lui qui arme le glissé-déposé et qui sélectionne la
// pièce), et le navigateur envoie ENSUITE un `click` sur la même case : ce
// clic voyait une pièce déjà sélectionnée — par le pointerdown d'il y a
// quelques millisecondes — et la désélectionnait aussitôt. La pièce
// s'éteignait donc au lever du doigt, et seul un appui LONG, qui n'engendre
// pas de clic sur écran tactile, laissait la sélection en place. C'est le
// geste qui décide maintenant : quand le pointerup a déjà résolu l'appui, il
// pose ce drapeau et le clic qui suit passe son tour.
// Le drapeau est remis à zéro à chaque pointerdown : un clic qui ne viendrait
// jamais (relâchement hors de la case, geste annulé) ne peut pas manger le
// suivant.
let _fokSkipClick=false;

function fokClick(r,c){
  if(_fokSkipClick){_fokSkipClick=false;return;}
  if(!fokPlayable())return;
  const st=FOK.st,cell=st.board[r][c];
  if(FOK.sel){
    if(FOK.sel.r===r&&FOK.sel.c===c){fokDeselect();return;}
    const target=FOK.moves.find(m=>m.to.r===r&&m.to.c===c);
    if(target){fokTryMove(FOK.sel,{r,c});return;}
  }
  if(cell&&cell.color===FOK.myColor)fokSelect(r,c);
  else fokDeselect();
}

// Le coup demandé par le joueur. La promotion ouvre une fenêtre : c'est le
// seul moment où le jeu attend une réponse avant de jouer.
function fokTryMove(from,to){
  const st=FOK.st;
  const all=fokPieceMoves(st.board,from.r,from.c,[],st.rights)
    .filter(m=>m.to.r===to.r&&m.to.c===to.c&&fokMoveIsSafe(st,m,st.turn));
  if(!all.length)return;
  const promos=all.filter(m=>m.promo);
  if(promos.length){FOK.pendingPromo=promos;fokDeselect();fokShowPromo();return;}
  fokDeselect();
  fokPlayMove(all[0],true);
}

function fokShowPromo(){
  const row=document.getElementById('fok-promo-row');
  row.innerHTML=['q','r','b','n'].map(t=>
    '<button class="fok-promo-btn" data-t="'+t+'" title="'+FOK_NAME[t]+'">'+
      pieceSVG(FOK_ART[t],FOK.myColor)+'<span>'+FOK_NAME[t]+'</span></button>').join('');
  document.getElementById('fok-promo').classList.add('show');
}
function fokChoosePromo(t){
  const list=FOK.pendingPromo;FOK.pendingPromo=null;
  document.getElementById('fok-promo').classList.remove('show');
  if(!list)return;
  const mv=list.find(m=>m.promo===t)||list[0];
  fokPlayMove(mv,true);
}

// --- Glissé-déposé. La case reste la cible du pointeur (la couche des pièces
// ne reçoit aucun clic) : on suit le doigt avec le fantôme du jeu principal,
// et on résout sur la case relâchée. ---
let _fokDrag=null;
function fokPointerDown(e,r,c){
  _fokSkipClick=false;
  if(!fokPlayable()||e.button&&e.button!==0)return;
  const cell=FOK.st.board[r][c];
  if(!cell||cell.color!==FOK.myColor)return;
  const already=!!(FOK.sel&&FOK.sel.r===r&&FOK.sel.c===c);
  if(!already)fokSelect(r,c);
  _fokDrag={r,c,x:e.clientX,y:e.clientY,moved:false,already};
  const ghost=document.getElementById('drag-ghost');
  if(ghost){ghost.innerHTML=pieceSVG(FOK_ART[cell.t],cell.color);
    ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';}
}
function fokPointerMove(e){
  if(!_fokDrag)return;
  const dx=e.clientX-_fokDrag.x,dy=e.clientY-_fokDrag.y;
  const ghost=document.getElementById('drag-ghost');
  if(!_fokDrag.moved&&Math.sqrt(dx*dx+dy*dy)>6){
    _fokDrag.moved=true;
    if(ghost)ghost.style.display='block';
    const n=_fokPieceAt[_fokDrag.r]&&_fokPieceAt[_fokDrag.r][_fokDrag.c];
    if(n)n.classList.add('dragging');
  }
  if(_fokDrag.moved&&ghost){ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';}
}
function fokPointerUp(e){
  const d=_fokDrag;if(!d)return;
  _fokDrag=null;
  const ghost=document.getElementById('drag-ghost');
  if(ghost)ghost.style.display='none';
  const n=_fokPieceAt[d.r]&&_fokPieceAt[d.r][d.c];
  if(n)n.classList.remove('dragging');
  if(!d.moved){
    // Simple appui. Sur une pièce DÉJÀ sélectionnée, on laisse le clic faire
    // son travail : il la désélectionnera, et c'est le comportement attendu.
    // Sur une pièce que CE geste vient de sélectionner (pointerdown), le clic
    // ferait exactement l'inverse de ce qu'on demande — il passe son tour.
    if(!d.already)_fokSkipClick=true;
    return;
  }
  // Un glissé s'est résolu ici : le clic qui suit parfois (relâchement sur la
  // case de départ) ne doit pas reprendre le geste à son compte.
  _fokSkipClick=true;
  const cell=fokCellFromPoint(e.clientX,e.clientY);
  if(cell&&FOK.moves.some(m=>m.to.r===cell.r&&m.to.c===cell.c))fokTryMove({r:d.r,c:d.c},cell);
  else fokDeselect();
}
function fokCellFromPoint(x,y){
  const el=fokBoardEl();if(!el)return null;
  const b=el.getBoundingClientRect();
  const px=x-b.left,py=y-b.top;
  if(px<0||py<0||px>b.width||py>b.height)return null;
  const vi=Math.floor(py/(b.height/8)),vc=Math.floor(px/(b.width/8));
  const flipped=fokFlipped();
  const r=flipped?7-vi:vi,c=flipped?7-vc:vc;
  return fokIn(r,c)?{r,c}:null;
}
document.addEventListener('pointermove',fokPointerMove);
document.addEventListener('pointerup',fokPointerUp);
document.addEventListener('pointercancel',()=>{ _fokDrag=null;
  const g=document.getElementById('drag-ghost');if(g)g.style.display='none';});

// Clavier : les flèches déplacent le curseur, Entrée saisit et joue — comme
// sur le plateau du jeu principal.
function fokKey(e,r,c,vi,vc){
  if(e.key==='Enter'||e.key===' '){e.preventDefault();fokClick(r,c);return;}
  if(e.key==='Escape'){fokDeselect();return;}
  const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];
  if(!d)return;
  e.preventDefault();
  const nvi=Math.min(7,Math.max(0,vi+d[0])),nvc=Math.min(7,Math.max(0,vc+d[1]));
  const flipped=fokFlipped();
  const tr=flipped?7-nvi:nvi,tc=flipped?7-nvc:nvc;
  const el=_fokCellAt[tr]&&_fokCellAt[tr][tc];
  if(el){_fokCells.forEach(x=>x.tabIndex=-1);el.tabIndex=0;el.focus();}
}

// ----------------------------------------------------------------
// JOUER UN COUP : déplacement, puis décalage
// ----------------------------------------------------------------
// `local` distingue le coup du joueur (à émettre sur le réseau) de celui qui
// arrive de l'adversaire ou de l'IA (déjà connu de tout le monde).
function fokPlayMove(mv,local){
  const st=FOK.st;
  if(st.gameOver||FOK.anim)return;
  const mover=st.board[mv.from.r][mv.from.c];
  if(!mover)return;
  const type=mover.t,color=mover.color;
  if(local&&FOK.onLocalMove)FOK.onLocalMove(fokPackMove(mv));

  const taken=fokMakeRaw(st,mv);
  if(taken)st.captured[color].push(taken.t);
  st.lastMove={from:{r:mv.from.r,c:mv.from.c},to:{r:mv.to.r,c:mv.to.c}};
  FOK.anim=true;
  fokRender();
  if(typeof playSound==='function')
    playSound(mv.castle?'castle':(mv.promo?'promo':(taken?'capture':'move')));

  // LE DÉCALAGE, un battement plus tard. C'est la variante elle-même : on lui
  // laisse son propre temps à l'écran.
  setTimeout(()=>{
    fokShiftState(st);
    st.lastMove={from:fokShiftCoord(mv.from.r,mv.from.c),to:fokShiftCoord(mv.to.r,mv.to.c)};
    fokUpdateStatus(st);
    fokRecord(st,mv,taken,color,type);
    FOK.anim=false;
    fokRender();fokRenderLog();fokSetStatus();fokSyncChrome();
    if(st.check&&!st.gameOver&&typeof playSound==='function')playSound('check');
    if(st.gameOver){fokFinish();return;}
    if(FOK.mode==='ia'&&st.turn!==FOK.myColor)setTimeout(fokAITurn,FOK_AI_DELAY);
  },FOK_SHIFT_MS);
}

function fokAITurn(){
  const st=FOK.st;
  if(!st||st.gameOver||st.turn===FOK.myColor||FOK.mode!=='ia')return;
  // La recherche est synchrone et bornée (voir fok-ai.js) : on la laisse
  // partir après un rendu, pour que « L'adversaire réfléchit… » soit
  // effectivement affiché avant que le fil ne se bloque.
  requestAnimationFrame(()=>{
    const mv=fokAIMove(st,FOK.level);
    if(!mv)return;
    fokPlayMove(mv,false);
  });
}

// Coup reçu du réseau (fok-mp.js). Il est REVÉRIFIÉ par le moteur : un client
// modifié ne peut pas faire jouer un coup illégal chez l'adversaire.
function fokRemoteMove(pk){
  const st=FOK.st;
  if(!st||st.gameOver)return false;
  if(st.turn===FOK.myColor)return false;
  const mv=fokFindMove(st,pk);
  if(!mv)return false;
  if(FOK.anim){setTimeout(()=>fokRemoteMove(pk),FOK_SHIFT_MS);return true;}
  fokPlayMove(mv,false);
  return true;
}

// ----------------------------------------------------------------
// FIN DE PARTIE
// ----------------------------------------------------------------
function fokFinish(){
  fokSetStatus();
  const st=FOK.st;
  const win=st.result==='draw'?null:st.result===FOK.myColor;
  if(typeof playSound==='function')playSound(win===null?'draw':(win?'win':'loss'));
  document.getElementById('fok-res-title').textContent=
    st.result==='draw'?'Partie nulle':(win?'Victoire':'Défaite');
  document.getElementById('fok-res-sub').textContent=
    'Chute des Royaumes — '+st.reason+', en '+Math.ceil(st.moves.length/2)+' coups.';
  const btns=document.getElementById('fok-res-btns');
  btns.innerHTML=(FOK.mode==='ia'?'<button class="btn btn-gold" id="fok-res-again">Rejouer</button>':'')+
    '<button class="btn btn-ghost" id="fok-res-quit">Quitter</button>';
  document.getElementById('fok-result').classList.add('show');
  const again=document.getElementById('fok-res-again');
  if(again)again.onclick=()=>{
    document.getElementById('fok-result').classList.remove('show');
    fokStartGame({mode:'ia',level:FOK.level,myColor:FOK.myColor==='w'?'b':'w',
      oppName:FOK.oppName,oppSub:FOK.oppSub});
  };
  document.getElementById('fok-res-quit').onclick=fokLeave;
  const quit=document.getElementById('fok-quit');
  if(quit)quit.querySelector('span').textContent='Quitter';
}

// Abandon : la partie est perdue tout de suite, et l'adversaire en ligne est
// prévenu (fok-mp.js).
function fokResign(){
  const st=FOK.st;
  if(!st||st.gameOver){fokLeave();return;}
  showConfirmModal('Abandonner cette partie ?',()=>{
    if(!FOK.st||FOK.st.gameOver)return;
    FOK.st.gameOver=true;FOK.st.result=fokOpp(FOK.myColor);FOK.st.reason='abandon';
    if(FOK.onEnd)FOK.onEnd('resign');
    fokFinish();fokRender();
  },{okLabel:'Abandonner',cancelLabel:'Continuer'});
}

// Défaite/victoire imposée de l'extérieur (adversaire parti, abandon reçu).
function fokDeclare(result,reason){
  const st=FOK.st;
  if(!st||st.gameOver)return;
  st.gameOver=true;st.result=result;st.reason=reason||'abandon';
  fokFinish();fokRender();
}

function fokLeave(){
  document.getElementById('fok-result').classList.remove('show');
  document.getElementById('fok-promo').classList.remove('show');
  FOK.pendingPromo=null;
  if(FOK.onEnd)FOK.onEnd('leave');
  FOK.onLocalMove=null;FOK.onEnd=null;
  if(typeof goToMainMenu==='function')goToMainMenu();
  else showPage('page-jouer');
}

// ----------------------------------------------------------------
// DÉMARRAGE
// ----------------------------------------------------------------
function fokStartGame(opts){
  opts=opts||{};
  FOK.st=fokNewState();
  FOK.mode=opts.mode||'ia';
  FOK.level=opts.level||'soldat';
  FOK.myColor=opts.myColor||'w';
  FOK.oppName=opts.oppName||'Adversaire';
  FOK.oppSub=opts.oppSub||'';
  FOK.sel=null;FOK.moves=[];FOK.anim=false;FOK.pendingPromo=null;
  _fokCells=null;_fokFlipped=null;_fokNodes=new Map();
  const board=fokBoardEl();
  if(board)board.innerHTML='';
  fokUpdateStatus(FOK.st);

  const me=(typeof CUR_ACC==='string'&&CUR_ACC)?CUR_ACC:'Joueur';
  document.getElementById('fok-me-name').textContent=me;
  document.getElementById('fok-me-av').textContent=me.charAt(0).toUpperCase();
  document.getElementById('fok-me-sub').textContent=FOK.myColor==='w'?'Blancs':'Noirs';
  document.getElementById('fok-opp-name').textContent=FOK.oppName;
  document.getElementById('fok-opp-av').textContent=(FOK.oppName||'?').charAt(0).toUpperCase();
  document.getElementById('fok-opp-sub').textContent=FOK.oppSub||(FOK.myColor==='w'?'Noirs':'Blancs');
  const quit=document.getElementById('fok-quit');
  if(quit)quit.querySelector('span').textContent='Abandonner';
  document.getElementById('fok-result').classList.remove('show');
  fokPanelClose();

  showPage('page-fok');
  fokRender();fokRenderLog();fokSetStatus();
  requestAnimationFrame(()=>{fokSyncChrome();fokRender();});
  if(FOK.mode==='ia'&&FOK.st.turn!==FOK.myColor)setTimeout(fokAITurn,600);
}

// ----------------------------------------------------------------
// PANNEAUX ET MESURE DE L'ÉCRAN
// ----------------------------------------------------------------
// Même principe que la partie ordinaire : le panneau se pose SUR la zone
// située sous le plateau, et rien d'autre ne bouge (voir [GAME-PANEL] dans
// css/style.css).
let _fokPanel=null;
function fokPanelClose(){
  if(!_fokPanel)return;
  const el=document.getElementById(_fokPanel);
  if(el)el.hidden=true;
  document.querySelectorAll('#fok-under .gt-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
  _fokPanel=null;
}
function fokPanelToggle(id,btn){
  if(_fokPanel===id){fokPanelClose();return;}
  fokPanelClose();
  const el=document.getElementById(id);
  if(!el)return;
  el.hidden=false;_fokPanel=id;
  btn.setAttribute('aria-expanded','true');
  if(id==='fok-panel-history'){const l=document.getElementById('fok-log');if(l)l.scrollTop=l.scrollHeight;}
}

// Hauteur occupée par tout ce qui n'est pas le plateau : c'est elle qui borne
// la taille de l'échiquier sur téléphone (--game-chrome, voir [MOBILE-GAME]).
function fokSyncChrome(){
  const page=document.getElementById('page-fok');
  if(!page||!page.classList.contains('active'))return;
  const board=fokBoardEl(),wrap=page.querySelector('.game-wrap'),main=page.querySelector('.game-main');
  if(!board||!wrap||!main)return;
  const b=board.getBoundingClientRect();
  if(b.height<=0)return;
  const cs=getComputedStyle(wrap);
  const gap=parseFloat(cs.rowGap||cs.gap)||0;
  const padB=parseFloat(cs.paddingBottom)||0;
  const m=main.getBoundingClientRect();
  let below=Math.max(0,m.bottom-b.bottom),n=0;
  const under=document.getElementById('fok-under');
  for(const el of[document.getElementById('fok-me-bar'),document.getElementById('fok-status'),
                  under,page.querySelector('.game-btns')]){
    if(!el||el.offsetParent===null)continue;
    if(el===under){
      // La zone des panneaux s'étend sur tout l'espace libre : on ne compte
      // que ce qu'elle porte VRAIMENT, sinon le plateau rétrécirait pour
      // laisser de la place à du vide (la boucle serait sans fin).
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
window.addEventListener('resize',fokSyncChrome);
window.addEventListener('orientationchange',()=>setTimeout(fokSyncChrome,120));

// ----------------------------------------------------------------
// BRANCHEMENTS
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('fok-quit')?.addEventListener('click',()=>{
    if(FOK.st&&FOK.st.gameOver)fokLeave();else fokResign();
  });
  document.getElementById('fok-btn-history')?.addEventListener('click',e=>
    fokPanelToggle('fok-panel-history',e.currentTarget));
  document.getElementById('fok-btn-regle')?.addEventListener('click',e=>
    fokPanelToggle('fok-panel-regle',e.currentTarget));
  document.querySelectorAll('[data-fok-close]').forEach(b=>b.addEventListener('click',fokPanelClose));
  document.getElementById('fok-promo-row')?.addEventListener('click',e=>{
    const b=e.target.closest('.fok-promo-btn');
    if(b)fokChoosePromo(b.dataset.t);
  });
});

// ================================================================
// LE SALON DE LA VARIANTE
// ================================================================
// Une seule fenêtre, quatre vues : choisir l'adversaire, choisir le niveau de
// l'IA, choisir la façon de trouver un joueur, attendre. Elle est ouverte par
// la carte « Chute des Royaumes » de la page Variantes (js/variantes.js).
//
// Les trois entrées en ligne (partie rapide, partie privée, code) appellent
// js/fok-mp.js. Si ce fichier n'est pas chargé — ou si le multijoueur n'est
// pas configuré —, la vue le DIT au lieu d'ouvrir un écran qui n'aboutit pas.
let _fokLobbyView='menu';

function fokOpenLobby(){
  _fokLobbyView='menu';
  fokLobbyRender();
  document.getElementById('fok-lobby').classList.add('show');
}
function fokCloseLobby(){
  document.getElementById('fok-lobby').classList.remove('show');
  if(typeof fokMpCancel==='function')fokMpCancel();
}

function fokLobbyRender(msg){
  const body=document.getElementById('fok-lobby-body');
  if(!body)return;
  let h='';
  if(_fokLobbyView==='menu'){
    h='<div class="fok-lob-grid">'+
      '<button class="fok-lob-card" data-view="ia"><b>Affronter l’IA</b><span>Quatre adversaires, de l’Apprenti à l’Usurpateur.</span></button>'+
      '<button class="fok-lob-card" data-view="online"><b>Affronter un joueur</b><span>Partie rapide, ou partie privée entre amis.</span></button>'+
    '</div>';
  }else if(_fokLobbyView==='ia'){
    h='<div class="fok-lob-grid">'+FOK_AI_LEVELS.map(l=>
      '<button class="fok-lob-card" data-level="'+l.id+'"><b>'+escH(l.nom)+'</b><span>'+escH(l.desc)+'</span></button>').join('')+
      '</div><button class="btn btn-ghost fok-lob-back" data-view="menu">Retour</button>';
  }else if(_fokLobbyView==='online'){
    const ok=(typeof fokMpAvailable==='function')&&fokMpAvailable();
    h=ok?('<div class="fok-lob-grid">'+
      '<button class="fok-lob-card" data-online="quick"><b>Partie rapide</b><span>On vous trouve un adversaire qui attend la même chose.</span></button>'+
      '<button class="fok-lob-card" data-online="host"><b>Créer une partie privée</b><span>Vous recevez un code à quatre lettres à transmettre.</span></button>'+
      '</div>'+
      '<div class="fok-lob-join"><input id="fok-code" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false">'+
      '<button class="btn btn-gold" data-online="join">Rejoindre</button></div>')
      :'<div class="fok-lob-note">Le jeu en ligne n’est pas disponible ici (bibliothèque réseau bloquée ou hors connexion). L’IA, elle, fonctionne toujours.</div>';
    h+='<button class="btn btn-ghost fok-lob-back" data-view="menu">Retour</button>';
  }else if(_fokLobbyView==='wait'){
    h='<div class="fok-lob-wait"><div class="mp-radar"><span></span><span></span><span></span></div>'+
      '<div class="fok-lob-note" id="fok-wait-note">'+escH(msg||'Recherche d’un adversaire…')+'</div></div>'+
      '<button class="btn btn-ghost fok-lob-back" data-view="cancel">Annuler</button>';
  }
  body.innerHTML=h;
}

// Message d'attente, sans reconstruire la vue (fok-mp.js l'appelle à chaque
// changement d'état du salon).
function fokLobbyWait(msg){
  if(_fokLobbyView!=='wait'){_fokLobbyView='wait';fokLobbyRender(msg);return;}
  const n=document.getElementById('fok-wait-note');
  if(n)n.textContent=msg;
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('fok-lobby-close')?.addEventListener('click',fokCloseLobby);
  document.getElementById('fok-lobby-body')?.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if(b.dataset.view==='cancel'){_fokLobbyView='online';if(typeof fokMpCancel==='function')fokMpCancel();fokLobbyRender();return;}
    if(b.dataset.view){_fokLobbyView=b.dataset.view;fokLobbyRender();return;}
    if(b.dataset.level){
      const l=fokAILevel(b.dataset.level);
      document.getElementById('fok-lobby').classList.remove('show');
      fokStartGame({mode:'ia',level:l.id,myColor:'w',oppName:l.nom,oppSub:'Intelligence artificielle'});
      return;
    }
    if(b.dataset.online&&typeof fokMpStart==='function'){
      const code=(document.getElementById('fok-code')?.value||'').trim().toUpperCase();
      fokMpStart(b.dataset.online,code);
    }
  });
});
