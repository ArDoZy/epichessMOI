// Tests unitaires des règles de fin de partie (node --test tools/tests).
const test=require('node:test');
const assert=require('node:assert');
const {loadEngine}=require('./load-engine');
const E=loadEngine();

const empty=()=>Array.from({length:8},()=>Array(8).fill(null));
const pc=(pieceId,color,type,extra)=>Object.assign({pieceId,color,type,hasMoved:true,isKing:type==='k'},extra||{});
const kings=b=>{b[7][4]=pc('roi','w','k');b[0][4]=pc('roi','b','k');return b;};

test('deux créatures de même initiale ne font pas la même position',()=>{
  const a=kings(empty()),b=kings(empty());
  a[4][4]=pc('fourmi','w','p');b[4][4]=pc('fou-primordial','w','b');
  assert.notStrictEqual(E('positionKey')(a,'w'),E('positionKey')(b,'w'));
});

test('le trait, l\'ancrage et le roque comptent dans la position',()=>{
  const key=E('positionKey');const a=kings(empty());
  assert.notStrictEqual(key(a,'w'),key(a,'b'));
  assert.notStrictEqual(key(a,'w',null,new Set(['4,4'])),key(a,'w',null,new Set()));
  const b=kings(empty());b[7][4].hasMoved=false;
  assert.notStrictEqual(key(a,'w'),key(b,'w'));
});

test('la répétition se compte sur les instantanés de même trait',()=>{
  const gs={board:kings(empty()),turn:'w',enPassant:null,anchored:new Set(),history:[]};
  const snap=()=>({board:JSON.parse(JSON.stringify(gs.board)),turn:gs.turn,enPassant:null,anchored:new Set()});
  // Quatre allers-retours de rois : la position de départ revient trois fois.
  for(let i=0;i<8;i++){
    gs.history.push(snap());
    const col=gs.turn,r=col==='w'?7:0,from=i%4<2?4:3,to=i%4<2?3:4;
    gs.board[r][to]=gs.board[r][from];gs.board[r][from]=null;
    gs.turn=col==='w'?'b':'w';
  }
  assert.strictEqual(E('repetitionCount')(gs),3);
});

test('matériel insuffisant : seulement les vrais cavaliers et fous',()=>{
  const ins=E('isInsufficientMaterial');
  const b=kings(empty());assert.strictEqual(ins(b),true);
  b[3][3]=pc('std-b','w','b');assert.strictEqual(ins(b),true);
  b[3][3]=pc('typhon','w','b');assert.strictEqual(ins(b),false,'le Typhon mate');
  b[3][3]=pc('pegase','w','n');assert.strictEqual(ins(b),false,'le Pégase mate');
  b[3][3]=pc('std-b','w','b');b[5][5]=pc('fou-primordial','b','b');
  assert.strictEqual(ins(b),true,'fous de même couleur de case');
  b[5][4]=b[5][5];b[5][5]=null;
  assert.strictEqual(ins(b),false,'fous de couleurs opposées');
});

test('drapeau : nulle si l\'adversaire ne peut plus mater',()=>{
  const can=E('canStillMate');
  const b=kings(empty());
  assert.strictEqual(can(b,'w'),false);
  b[3][3]=pc('std-n','w','n');assert.strictEqual(can(b,'w'),false);
  b[6][6]=pc('std-pawn','b','p');assert.strictEqual(can(b,'w'),true,'le cavalier peut mater un roi gêné par son pion');
  b[3][3]=pc('dame','w','q');b[6][6]=null;assert.strictEqual(can(b,'w'),true);
});
