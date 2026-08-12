// ================================================================
// BUILDER.JS : Page de composition d'armée (#page-builder)
// ================================================================
// Contient : la logique de sélection des pièces (Monarque/Général/3 pièces
// libres, budget 24 points), le rendu des cartes de pièces (triées par
// classe puis valeur croissante, sans tri/filtre manuel) et des slots de
// composition, l'armée aléatoire, et les boutons de la topbar
// (tout effacer / aléatoire / valider / mes armées). Le bouton
// "Voie" est désormais dans #page-armies (voir voie.js), plus ici.
//
// Dépendances : data-pieces.js (PIECES, CLASS_ORDER),
// main.js (army, editingArmyId, builderMode, showPieceCtxMenu,
// showNotif, updateBuilderBanner), accounts.js (VV_UNLOCKED),
// armies.js (renderArmiesPage/renderAiArmiesPage), accounts.js (saveArmies).
//
// Si vous changez les règles de composition d'armée (budget, nombre de
// pièces), c'est ici. Le rendu visuel des cartes suit les classes CSS
// .piece-card / .comp-slot définies dans css/style.css section [BUILDER].
// ================================================================

// ----------------------------------------------------------------
// HELPERS ARMÉE
// ----------------------------------------------------------------
// army.extras : liste ORDONNÉE des pièces choisies (max 3, max 1 Primordiale).
// L'ordre définit la disposition en partie (voir derivePlacements) : la 1re
// pièce est placée le plus près du Monarque/Général, la dernière dans les coins.
const isSel=p=>{
  if(p.class==='Monarque')return army.mon?.id===p.id;
  if(p.class==='Général')return army.gen?.id===p.id;
  return army.extras.some(x=>x?.id===p.id);
};
const getVal=()=>(army.mon?.value||0)+(army.gen?.value||0)+army.extras.reduce((s,p)=>s+(p?.value||0),0);
const armyValid=()=>army.mon&&army.gen&&army.extras.length===3;
const extraPieces=()=>army.extras.slice();

window.removePiece=(type,idx)=>{
  if(type==='mon')army.mon=null;
  else if(type==='gen')army.gen=null;
  else{if(idx>=0&&idx<army.extras.length)army.extras.splice(idx,1);}
  updAll();
};

// ----------------------------------------------------------------
// RENDU SLOTS DE COMPOSITION
// ----------------------------------------------------------------
// Rappel du stock sous chaque pièce placée : composer une armée qu'on ne peut
// pas aligner est la première frustration possible du système d'économie, elle
// doit se voir dans le slot, pas à la seconde où on lance le combat.
function slotStockHTML(p){
  if(typeof invCount!=='function'||typeof isOwnablePiece!=='function'||!isOwnablePiece(p.id))return '';
  const need=pieceDeployCount(p.id),have=invCount(p.id);
  // « 999 / 2 » plutôt que « 999 / 2 requis » : dans un emplacement large d'un
  // cinquième d'écran de téléphone, le mot passait à la ligne et débordait du
  // cadre. Le rapport se lit sans lui, et l'infobulle le dit en toutes lettres.
  return '<div class="cs-stock'+(have<need?' cs-stock-out':'')+'" title="'+have+
    ' en stock, '+need+' requis pour cette armée">'+have+' / '+need+'</div>';
}

const updSlots=()=>{
  const g=document.getElementById('comp-grid');const all=extraPieces();
  // eidx = index dans army.extras (uniquement pour les 3 pièces déplaçables)
  // LA RÈGLE DE COMPOSITION SE LIT DANS LA FORME DE L'EMPLACEMENT.
  // Les cinq emplacements étaient cinq rectangles pointillés gris identiques,
  // étiquetés « Monarque · Général · Pièce 1 · Pièce 2 · Pièce 3 ». Rien ne
  // disait que les deux premiers sont contraints à une classe et les trois
  // derniers libres — la règle du jeu était invisible dans l'objet même qui
  // la porte. Les deux obligatoires portent donc un trait PLEIN dans leur
  // couleur de classe, dès qu'ils sont vides ; les trois libres gardent le
  // pointillé. « Pièce 1/2/3 » suggérait par ailleurs un ordre qui n'existe
  // pas : trois libellés à lire pour une seule notion, devenue « Libre ».
  const mk=(cls,lbl,p,rm,eidx,req)=>p
    ?'<div class="comp-slot filled '+cls+(eidx!=null?' draggable-slot':'')+'" data-pid="'+p.id+'"'+(eidx!=null?' draggable="true" data-eidx="'+eidx+'"':'')+'><div class="cs-label">'+lbl+'</div><span class="cs-emoji">'+pieceIcon(p.id,'n')+'</span><div class="cs-name">'+p.name+'</div><div class="cs-val">'+p.value+' pts</div>'+slotStockHTML(p)+'<div class="cs-rm" onclick="'+rm+'">'+svgX+'</div></div>'
    :'<div class="comp-slot'+(req?' cs-req '+cls:' cs-free')+'"><div class="cs-label">'+lbl+'</div><div class="cs-ph">'+(req?'':'+')+'</div></div>';
  let h=mk('Monarque','Monarque',army.mon,"removePiece('mon')",null,true)
       +mk('Général','Général',army.gen,"removePiece('gen')",null,true);
  for(let i=0;i<3;i++)h+=mk(all[i]?.class||'','Libre',all[i],"removePiece('pc',"+i+")",all[i]?i:null,false);
  g.innerHTML=h;
  g.querySelectorAll('.comp-slot.filled[data-pid]').forEach(el=>{
    const open=e=>{
      const p=PIECES.find(x=>x.id===el.dataset.pid);if(!p)return;
      showPieceCtxMenu(e,p);
    };
    el.addEventListener('contextmenu',open);
    if(typeof bindLongPress==='function')bindLongPress(el,open);
  });
  wireSlotDragSwap(g);
};

// Glisser-déposer entre les 3 slots de pièces pour réordonner (= changer la
// disposition en partie). Le Monarque et le Général ne sont pas déplaçables.
function wireSlotDragSwap(g){
  g.querySelectorAll('.comp-slot.draggable-slot').forEach(el=>{
    el.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',el.dataset.eidx);el.classList.add('slot-dragging');});
    el.addEventListener('dragend',()=>{el.classList.remove('slot-dragging');g.querySelectorAll('.slot-over').forEach(x=>x.classList.remove('slot-over'));});
    el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('slot-over');});
    el.addEventListener('dragleave',()=>el.classList.remove('slot-over'));
    el.addEventListener('drop',e=>{
      e.preventDefault();el.classList.remove('slot-over');
      const from=parseInt(e.dataTransfer.getData('text/plain'),10);
      const to=parseInt(el.dataset.eidx,10);
      if(isNaN(from)||isNaN(to)||from===to)return;
      const tmp=army.extras[from];army.extras[from]=army.extras[to];army.extras[to]=tmp;
      updAll();
    });
  });
}
// La pastille « Armurerie : — / Prête / Manque » a été retirée de la topbar :
// chaque carte de pièce porte déjà son stock, et chaque slot de composition
// répète le compte exact sous la pièce posée (.cs-stock). Trois fois la même
// information sur un écran de téléphone, c'était deux de trop.
// LA RAISON DU BLOCAGE, en toutes lettres. « Valider » restait grisé sans
// jamais dire ce qui manquait : il fallait deviner la règle de composition
// (un monarque, un général, exactement trois pièces, 24 points) en essayant.
// Une seule raison à la fois, la plus proche de ce que le joueur vient de
// faire — en énumérer trois n'aide personne.
function armyBlockReason(){
  const v=getVal();
  if(v>24)return 'Dépassement de '+(v-24)+' point'+(v-24>1?'s':'');
  if(!army.mon)return 'Il manque un Monarque';
  if(!army.gen)return 'Il manque un Général';
  const n=army.extras.length;
  if(n<3)return 'Encore '+(3-n)+' pièce'+(3-n>1?'s':'')+' à choisir';
  return '';
}

const updStats=()=>{
  const v=getVal(),over=v>24;
  document.getElementById('s-val').textContent=v+' / 24';
  // La jauge : un état numérique devient un état perceptible. Elle se remplit
  // sur la même durée que le nombre change, et sature à 100 % pour ne pas
  // déborder de sa piste quand l'armée dépasse le budget — c'est la couleur
  // qui dit le dépassement, pas la largeur.
  const g=document.getElementById('s-gauge');
  if(g)g.style.width=Math.min(100,v/24*100)+'%';
  const box=document.getElementById('army-box');
  if(box)box.classList.toggle('bd-over',over);
  const why=armyBlockReason();
  document.getElementById('b-validate').disabled=!armyValid()||over;
  const w=document.getElementById('b-validate-why');
  if(w)w.textContent=why;
};
const updAll=()=>{updSlots();renderCards();updStats();};

// ----------------------------------------------------------------
// TOGGLE SÉLECTION D'UNE PIÈCE
// ----------------------------------------------------------------
const toggle=p=>{
  if(!VV_UNLOCKED.has(p.id)){
    const m=UNLOCK_MILESTONES.find(u=>u.pieceId===p.id);
    if(m&&m.coffre)showNotif('Cette pièce s\'obtient dans un coffre !');
    else showNotif('Pièce verrouillée, requis : '+(m&&m.eloRequired<999999?vvGetRank(m.eloRequired).name+' ('+m.eloRequired+' ELO)':'ELO insuffisant'));
    return;
  }
  const sel=isSel(p);
  if(p.class==='Monarque'){
    if(sel)army.mon=null;
    else{if(army.mon){showNotif('Vous avez déjà un monarque.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}army.mon=p;}
  }else if(p.class==='Général'){
    if(sel)army.gen=null;
    else{if(army.gen){showNotif('Vous avez déjà un général.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}army.gen=p;}
  }else if(p.class==='Primordiale'){
    if(sel){const i=army.extras.findIndex(x=>x?.id===p.id);if(i!==-1)army.extras.splice(i,1);}
    else{if(army.extras.some(x=>x.class==='Primordiale')){showNotif('1 primordiale maximum.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}if(army.extras.length>=3){showNotif('3 pièces max.');return;}army.extras.push(p);}
  }else{
    if(sel){const i=army.extras.findIndex(x=>x?.id===p.id);if(i!==-1)army.extras.splice(i,1);}
    else{if(army.extras.length>=3){showNotif('3 pièces max.');return;}if(getVal()+p.value>24){showNotif('Dépasse 24 points.');return;}army.extras.push(p);}
  }
  updAll();
};

// ----------------------------------------------------------------
// RENDU DES CARTES : toujours triées par classe puis par valeur croissante
// (plus de tri/filtre manuel : voir le bandeau de raccourcis par catégorie,
// géré plus bas par wireClassJumpRail()).
// ----------------------------------------------------------------
// LE BALISAGE DES CARTES N'EST PLUS ÉCRIT ICI. Il vient de pieceCardHTML()
// (js/piece-card.js), le composant partagé : logo, nom, valeur, stock, et
// rien d'autre. Le déplacement et le pouvoir, qui remplissaient chaque carte
// de trois blocs illisibles à cette taille, sont dans la fiche — le bottom
// sheet ouvert par le bouton « Infos ». Résultat : des cartes au format
// portrait, huit visibles à l'écran d'un téléphone, et un catalogue qu'on
// parcourt au pouce.
const getSorted=()=>[...PIECES].sort((a,b)=>{const d=CLASS_ORDER[a.class]-CLASS_ORDER[b.class];return d||a.value-b.value;});

// Ce qu'il faut pour débloquer une pièce, dit en trois mots sous le cadenas.
// Le palier à atteindre, tel qu'il s'écrit dans le PIED d'une carte : une
// pastille de la largeur d'une carte, soit trois ou quatre caractères utiles.
// Le nom du rang y était accolé (« Pierre · 480 ELO ») et faisait passer
// l'étiquette sur deux lignes dans un espace prévu pour une ; il est de toute
// façon déductible de l'ELO, et la fiche de la pièce le donne en entier.
function pieceLockLabel(p){
  const m=UNLOCK_MILESTONES.find(u=>u.pieceId===p.id);
  if(!m||m.coffre)return 'Coffre';
  return m.eloRequired<999999?m.eloRequired+' ELO':'';
}

const renderCards=()=>{
  const ps=getSorted();const byClass={};
  ps.forEach(p=>{if(!byClass[p.class])byClass[p.class]=[];byClass[p.class].push(p);});
  let html='';
  ['Monarque','Général','Primordiale','Brute','Sorcier'].forEach(cls=>{
    if(!byClass[cls]?.length)return;
    // En-tete de section : le MEME motif que l'Armurerie (libelle court, filet
    // qui court jusqu'au bord, decompte a droite). C'etait le troisieme style
    // d'en-tete de l'application ; il n'y en a plus qu'un.
    html+='<div class="class-sec '+cls+'" id="cls-sec-'+cls+'">'+
      '<div class="class-hdr '+cls+'"><span class="class-hdr-name">'+cls+'</span>'+
      '<span class="class-hdr-n">'+byClass[cls].length+'</span></div>'+
      '<div class="cards-grid">';
    byClass[cls].forEach(p=>{
      const unlocked=VV_UNLOCKED.has(p.id);
      html+=pieceCardHTML(p,{
        locked:!unlocked,
        lockLabel:unlocked?'':pieceLockLabel(p),
        selected:isSel(p),
      });
    });
    html+='</div></div>';
  });
  document.getElementById('cards-container').innerHTML=html;
  // « Utiliser » applique les règles de composition (budget, 3 pièces, une
  // seule Primordiale) exactement comme le clic d'avant : c'est toggle() qui
  // décide, le composant ne fait que transmettre l'intention.
  wirePieceCards(document.getElementById('cards-container'),{onUse:toggle});
};

// Le titre « Votre armée » a disparu du panneau : cinq emplacements étiquetés
// Monarque / Général / Libre disent déjà ce qu'ils sont, et le titre était le
// TROISIÈME style d'en-tête de section de l'écran. Le mode Instructeur reste
// annoncé par le bandeau, qui l'écrit en toutes lettres.
function updateBuilderBanner(){
  const banner=document.getElementById('builder-mode-banner');
  if(builderMode==='ai'){
    banner.textContent='Mode Instructeur : vous composez l\'armée de l\'Instructeur adverse';
    banner.classList.add('show');
  }else banner.classList.remove('show');
}

// ----------------------------------------------------------------
// PLACEMENT DÉRIVÉ DE L'ORDRE + ENREGISTREMENT DE L'ARMÉE
// ----------------------------------------------------------------
// La disposition en partie découle de l'ORDRE des 3 pièces choisies :
// la Pièce 1 flanque directement le Monarque/Général (colonnes 2 & 5),
// la Pièce 2 suit (colonnes 1 & 6), la Pièce 3 occupe les coins (0 & 7).
// buildGameBoard() place à `col` puis miroir en 7-col, d'où une seule colonne
// « gauche » suffit par pièce.
const ORDER_COLS=[2,1,0];
function derivePlacements(orderedPieces){
  const placements={};
  orderedPieces.forEach((p,i)=>{placements[p.id]=ORDER_COLS[i]!==undefined?ORDER_COLS[i]:i;});
  return placements;
}
function saveArmyFromBuilder(){
  if(!armyValid())return;
  const ordered=extraPieces();
  const placements=derivePlacements(ordered);
  const isAi=builderMode==='ai';
  const targetList=isAi?savedAiArmies:savedArmies;
  const ad={
    id:editingArmyId||Date.now().toString(),
    createdAt:editingArmyId?(targetList.find(a=>a.id===editingArmyId)?.createdAt||Date.now()):Date.now(),
    updatedAt:Date.now(),mon:{id:army.mon.id},gen:{id:army.gen.id},
    extras:ordered.map(p=>p.id),placements,totalValue:getVal()
  };
  if(editingArmyId){const idx=targetList.findIndex(a=>a.id===editingArmyId);if(idx!==-1)targetList[idx]=ad;else targetList.push(ad);}
  else targetList.push(ad);
  if(isAi){savedAiArmies=targetList;saveAiArmies();}else{savedArmies=targetList;saveArmies();}
  editingArmyId=null;
  if(isAi){renderAiArmiesPage();showPage('page-ai-armies');}else{renderArmiesPage();showPage('page-armies');}
}

// ----------------------------------------------------------------
// ARMÉE ALÉATOIRE : 1 monarque, 1 général, 3 pièces, tirés parmi les
// pièces débloquées par le joueur (budget 24 pts, 1 primordiale max).
// ----------------------------------------------------------------
function randomizeArmy(){
  const unlocked=VV_UNLOCKED;
  const monarques=PIECES.filter(p=>p.class==='Monarque'&&unlocked.has(p.id));
  const generaux=PIECES.filter(p=>p.class==='Général'&&unlocked.has(p.id));
  const others=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&unlocked.has(p.id));
  if(!monarques.length||!generaux.length||others.length<3){showNotif('Débloquez plus de pièces pour une armée aléatoire complète.','err');return;}
  const rnd=arr=>arr[Math.floor(Math.random()*arr.length)];
  let tries=0;
  while(tries++<2000){
    const mon=rnd(monarques);const gen=rnd(generaux);
    if(mon.value+gen.value>22)continue;
    const budget=24-mon.value-gen.value;
    const pool=[...others].sort(()=>Math.random()-0.5);
    let chosen=[];let val=0;let primCount=0;const usedIds=new Set();
    for(const p of pool){
      if(chosen.length>=3)break;
      if(usedIds.has(p.id))continue;
      if(p.class==='Primordiale'&&primCount>=1)continue;
      if(val+p.value>budget)continue;
      chosen.push(p);val+=p.value;usedIds.add(p.id);
      if(p.class==='Primordiale')primCount++;
    }
    if(chosen.length===3){
      army.mon=mon;army.gen=gen;army.extras=chosen;editingArmyId=null;updAll();return;
    }
  }
  showNotif('Impossible de générer une armée aléatoire avec vos pièces actuelles.','err');
}

// ----------------------------------------------------------------
// LISTENERS UI
// ----------------------------------------------------------------
document.getElementById('b-reset').addEventListener('click',()=>{army={mon:null,gen:null,extras:[]};editingArmyId=null;updAll();});
document.getElementById('b-random').addEventListener('click',randomizeArmy);
document.getElementById('b-validate').addEventListener('click',()=>{if(armyValid())saveArmyFromBuilder();});
document.getElementById('b-armies').addEventListener('click',()=>{if(builderMode==='ai'){renderAiArmiesPage();showPage('page-ai-armies');}else{renderArmiesPage();showPage('page-armies');}});