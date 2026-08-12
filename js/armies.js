// ================================================================
// ARMIES.JS : Page "Mes armées" fusionnée avec la composition + "Armées IA"
// + générateur d'armée IA
// ================================================================
// Contient : la page "Mes armées" (#page-armies), qui EST désormais la page
// de composition du joueur — il n'y a plus de liste séparée, une seule
// armée peut être enregistrée, composée ou modifiée, et elle s'enregistre
// TOUTE SEULE dès qu'elle est complète (plus de bouton "Valider"). Contient
// aussi le rendu de la page "Armées IA" (#page-ai-armies, restée une
// liste : l'Instructeur peut recevoir plusieurs armées personnalisées), et
// generateAIArmy() qui compose une armée aléatoire légale pour l'adversaire
// IA quand aucune armée IA personnalisée n'est choisie.
//
// Dépendances : data-pieces.js (PIECES, CLASS_ORDER), accounts.js
// (savedArmies, savedAiArmies, saveArmies, saveAiArmies, VV_UNLOCKED),
// main.js (showPage, showNotif, showPieceCtxMenu, showConfirmModal, escH),
// piece-card.js (pieceCardHTML, wirePieceCards), builder.js
// (derivePlacements, slotStockHTML — la fabrication de l'armée du joueur
// réutilise ces deux fonctions pures, partagées avec la composition de
// l'armée IA), combat-intro.js (launchCombat, launchOnline).
// ================================================================

// ----------------------------------------------------------------
// COMPOSITION DE L'ARMÉE DU JOUEUR — LA PAGE "MES ARMÉES" ELLE-MÊME
// ----------------------------------------------------------------
// UNE SEULE ARMÉE. pArmy est l'état de travail (peut être incomplet en
// cours de composition) ; savedArmies[0] est l'unique armée enregistrée
// (toujours complète). Chaque changement qui laisse pArmy complet
// (Monarque + Général + 3 pièces) s'enregistre immédiatement : composer,
// c'est enregistrer. Un changement qui laisse pArmy incomplet ne touche
// pas à l'armée déjà enregistrée — elle reste utilisable pour un combat
// pendant qu'on retouche sa composition.
let pArmy={mon:null,gen:null,extras:[]};
let pEditId=null;
// pLoaded : une composition en cours (vide ou à moitié faite) ne doit pas
// être écrasée quand on quitte la page puis qu'on y revient — seule la
// PREMIÈRE arrivée (par compte) doit recharger pArmy depuis savedArmies.
// Les arrivées suivantes ne font que redessiner l'état déjà en mémoire.
// Remis à false par accounts.js à la connexion/déconnexion d'un compte.
let pLoaded=false;

const pIsSel=p=>{
  if(p.class==='Monarque')return pArmy.mon?.id===p.id;
  if(p.class==='Général')return pArmy.gen?.id===p.id;
  return pArmy.extras.some(x=>x?.id===p.id);
};
const pGetVal=()=>(pArmy.mon?.value||0)+(pArmy.gen?.value||0)+pArmy.extras.reduce((s,p)=>s+(p?.value||0),0);
const pArmyValid=()=>pArmy.mon&&pArmy.gen&&pArmy.extras.length===3;
const pExtraPieces=()=>pArmy.extras.slice();

// Recharge pArmy depuis la seule armée enregistrée (ou la vide si aucune).
// Robuste aux anciennes sauvegardes qui contenaient plusieurs armées : on ne
// reprend que la première, les autres sont perdues (voir aussi
// loadAccountGlobals, js/accounts.js, qui tronque déjà savedArmies à 1).
function pLoad(){
  const fp=id=>PIECES.find(p=>p.id===id);
  const a=savedArmies[0];
  if(a){
    pArmy.mon=fp(a.mon.id)||null;pArmy.gen=fp(a.gen.id)||null;
    const dist=c=>Math.abs((c==null?0:c)-3.5);
    let ids=(a.extras||[]).slice();
    if(a.placements)ids.sort((x,y)=>dist(a.placements[x])-dist(a.placements[y]));
    pArmy.extras=ids.map(fp).filter(Boolean).slice(0,3);
    pEditId=a.id;
  }else{
    pArmy={mon:null,gen:null,extras:[]};pEditId=null;
  }
}

// Enregistre pArmy si (et seulement si) elle est complète.
function pAutosave(){
  if(!pArmyValid())return;
  const ordered=pExtraPieces();
  const placements=derivePlacements(ordered); // js/builder.js, fonction pure
  const prev=savedArmies[0];
  const id=pEditId||(prev&&prev.id)||Date.now().toString();
  const ad={
    id,createdAt:(prev&&prev.id===id)?prev.createdAt:Date.now(),updatedAt:Date.now(),
    mon:{id:pArmy.mon.id},gen:{id:pArmy.gen.id},
    extras:ordered.map(p=>p.id),placements,totalValue:pGetVal()
  };
  savedArmies=[ad];pEditId=id;saveArmies();
}

// ----------------------------------------------------------------
// LES CINQ EMPLACEMENTS, TOUT EN HAUT — format carte (aspect-ratio 3/4,
// voir .comp-grid-cards dans css/style.css [ARMIES]). Une pièce posée
// remplit tout l'emplacement, comme sur sa carte dans le catalogue.
// PAS DE CROIX : on retire une pièce en appuyant sur son emplacement.
// ----------------------------------------------------------------
function pUpdSlots(){
  const g=document.getElementById('ar-comp-grid');if(!g)return;
  const all=pExtraPieces();
  const mk=(cls,lbl,p,type,eidx,req)=>p
    ?'<div class="comp-slot filled '+cls+(eidx!=null?' draggable-slot':'')+'" data-pid="'+p.id+
       '" data-type="'+type+'"'+(eidx!=null?' draggable="true" data-eidx="'+eidx+'"':'')+
       ' role="button" tabindex="0" aria-label="Retirer '+escH(p.name)+'">'+
       '<span class="cs-emoji">'+pieceIcon(p.id,'n')+'</span>'+
       '<div class="cs-name">'+escH(p.name)+'</div>'+
       '<div class="cs-val">'+p.value+' pts</div>'+
     '</div>'
    :'<div class="comp-slot'+(req?' cs-req '+cls:' cs-free')+'"><div class="cs-label">'+lbl+'</div><div class="cs-ph">'+(req?'':'+')+'</div></div>';
  let h=mk('Monarque','Monarque',pArmy.mon,'mon',null,true)
       +mk('Général','Général',pArmy.gen,'gen',null,true);
  for(let i=0;i<3;i++)h+=mk(all[i]?.class||'','Libre',all[i],'pc',all[i]?i:null,false);
  g.innerHTML=h;
  g.querySelectorAll('.comp-slot.filled[data-pid]').forEach(el=>{
    el.addEventListener('click',()=>{
      const eidxAttr=el.dataset.eidx;
      const eidx=(eidxAttr!=null&&eidxAttr!=='')?parseInt(eidxAttr,10):-1;
      pRemove(el.dataset.type,eidx);
    });
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
    const open=e=>{const p=PIECES.find(x=>x.id===el.dataset.pid);if(!p)return;showPieceCtxMenu(e,p);};
    el.addEventListener('contextmenu',e=>{e.preventDefault();open(e);});
  });
  pWireSlotDragSwap(g);
}
function pRemove(type,idx){
  if(type==='mon')pArmy.mon=null;
  else if(type==='gen')pArmy.gen=null;
  else if(idx>=0&&idx<pArmy.extras.length)pArmy.extras.splice(idx,1);
  pUpdateAll();
}
// Glisser-déposer entre les 3 pièces libres pour réordonner (= changer la
// disposition en partie, voir derivePlacements dans js/builder.js).
function pWireSlotDragSwap(g){
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
      const tmp=pArmy.extras[from];pArmy.extras[from]=pArmy.extras[to];pArmy.extras[to]=tmp;
      pUpdateAll();
    });
  });
}

// ----------------------------------------------------------------
// LE CATALOGUE, EN DESSOUS — en vrac : pas de slots par catégorie, pas
// d'étiquette "Monarque"/"Général"/etc. Seule reste la couleur en tête de
// carte (voir .pcard::before, [PCARD]). Uniquement les pièces déjà
// débloquées, triées du Monarque le moins cher au Sorcier le plus cher.
// ----------------------------------------------------------------
function pToggle(p){
  if(!VV_UNLOCKED.has(p.id))return;
  const sel=pIsSel(p);
  if(p.class==='Monarque'){
    if(sel)pArmy.mon=null;
    else{if(pArmy.mon){showNotif('Vous avez déjà un monarque.');return;}if(pGetVal()+p.value>24){showNotif('Dépasse 24 points.');return;}pArmy.mon=p;}
  }else if(p.class==='Général'){
    if(sel)pArmy.gen=null;
    else{if(pArmy.gen){showNotif('Vous avez déjà un général.');return;}if(pGetVal()+p.value>24){showNotif('Dépasse 24 points.');return;}pArmy.gen=p;}
  }else if(p.class==='Primordiale'){
    if(sel){const i=pArmy.extras.findIndex(x=>x?.id===p.id);if(i!==-1)pArmy.extras.splice(i,1);}
    else{if(pArmy.extras.some(x=>x.class==='Primordiale')){showNotif('1 primordiale maximum.');return;}if(pGetVal()+p.value>24){showNotif('Dépasse 24 points.');return;}if(pArmy.extras.length>=3){showNotif('3 pièces max.');return;}pArmy.extras.push(p);}
  }else{
    if(sel){const i=pArmy.extras.findIndex(x=>x?.id===p.id);if(i!==-1)pArmy.extras.splice(i,1);}
    else{if(pArmy.extras.length>=3){showNotif('3 pièces max.');return;}if(pGetVal()+p.value>24){showNotif('Dépasse 24 points.');return;}pArmy.extras.push(p);}
  }
  pUpdateAll();
}
function pRenderCards(){
  const cont=document.getElementById('ar-cards-container');if(!cont)return;
  const list=PIECES.filter(p=>VV_UNLOCKED.has(p.id))
    .sort((a,b)=>{const d=CLASS_ORDER[a.class]-CLASS_ORDER[b.class];return d||a.value-b.value;});
  if(!list.length){
    cont.innerHTML='<div class="empty-armies"><span class="vial"><span class="vial-bubble"></span></span><p>Débloquez vos premières pièces pour composer une armée.</p></div>';
    return;
  }
  cont.innerHTML='<div class="cards-grid">'+list.map(p=>pieceCardHTML(p,{locked:false,selected:pIsSel(p)})).join('')+'</div>';
  wirePieceCards(cont,{onUse:pToggle});
}

// ----------------------------------------------------------------
// BUDGET + ENREGISTREMENT
// ----------------------------------------------------------------
function pUpdStats(){
  const v=pGetVal(),over=v>24;
  const val=document.getElementById('ar-s-val');if(val)val.textContent=v+' / 24';
  const box=document.getElementById('ar-army-box');if(box)box.classList.toggle('bd-over',over);
}
function pUpdateAll(){
  pUpdSlots();pRenderCards();pUpdStats();
  pAutosave();
}

// Armée aléatoire : 1 monarque, 1 général, 3 pièces parmi les débloquées
// (budget 24 pts, 1 primordiale max). Enregistrée aussitôt (toujours
// complète par construction).
function pRandomize(){
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
    if(chosen.length===3){pArmy.mon=mon;pArmy.gen=gen;pArmy.extras=chosen;pUpdateAll();return;}
  }
  showNotif('Impossible de générer une armée aléatoire avec vos pièces actuelles.','err');
}
function pReset(){
  pArmy={mon:null,gen:null,extras:[]};pEditId=null;
  savedArmies=[];saveArmies();
  pUpdateAll();
}
document.getElementById('ar-random')?.addEventListener('click',pRandomize);
document.getElementById('ar-reset')?.addEventListener('click',pReset);

// Point d'entrée de la page "Mes armées" : recharge depuis la seule armée
// enregistrée et (re)dessine. Appelée à chaque arrivée sur la face "armées"
// du cube (cube-nav.js) et à chaque rafraîchissement externe (achat/ouverture
// de coffre, fin de tutoriel...) : dans tous les cas, savedArmies[0] est la
// seule source de vérité, donc la recharger est toujours sûr.
const renderArmiesPage=()=>{
  if(!pLoaded){pLoad();pLoaded=true;}
  pUpdateAll();
};

// ----------------------------------------------------------------
// LANCEMENT D'UN COMBAT DEPUIS LE MENU PRINCIPAL
// ----------------------------------------------------------------
// Il n'y a plus d'écran de choix : une seule armée peut exister. "COMBAT" et
// "Adversaires" partent donc directement au combat avec elle (ou, à défaut,
// ramènent sur "Mes armées" pour en composer une).
window.startArmySelection=mode=>{
  if(!savedArmies.length){
    renderArmiesPage();showPage('page-armies');
    showNotif('Votre armée est incomplète','err');
    return;
  }
  const a=savedArmies[0];
  if(typeof armyStock==='function'){
    const stock=armyStock(a);
    if(!stock.ok){
      renderArmiesPage();showPage('page-armies');
      showConfirmModal('Stock insuffisant : '+stock.missing.map(m=>m.name+' ('+m.have+'/'+m.need+')').join(', ')+
        '. Récupérez le coffre de réapprovisionnement dans l\'Armurerie, ou composez une autre armée.',()=>{},
        {okLabel:'Compris',cancelLabel:'Fermer',okClass:'btn-primary'});
      return;
    }
  }
  if(mode==='online')launchOnline(a.id);
  else launchCombat(a.id);
};

// Conservée pour compatibilité (cube-nav.js l'appelle au retour au menu) :
// il n'y a plus d'état de sélection à effacer.
window.clearArmySelection=()=>{};

// loadArmyForEdit : utilisée par combat-intro.js (launchCombat/launchOnline)
// pour renseigner l'état global `army`/`editingArmyId` de l'ancien builder
// avant de lancer la partie. Conservée telle quelle : d'autres modules
// peuvent encore la lire.
const loadArmyForEdit=ad=>{
  const fp=id=>PIECES.find(p=>p.id===id);
  army.mon=fp(ad.mon.id)||null;army.gen=fp(ad.gen.id)||null;
  const dist=c=>Math.abs((c==null?0:c)-3.5);
  let ids=(ad.extras||[]).slice();
  if(ad.placements)ids.sort((a,b)=>dist(ad.placements[a])-dist(ad.placements[b]));
  army.extras=ids.map(fp).filter(Boolean).slice(0,3);
  editingArmyId=ad.id;
};

// ----------------------------------------------------------------
// NOM DE L'ARMÉE IA : bouton "Nommer l'armée" (ou nom + petit stylo une fois
// nommée) affiché au-dessus de la carte, à la place des dates. L'armée du
// joueur n'a plus de nom : il n'y en a qu'une, rien ne la distingue d'une
// autre.
// ----------------------------------------------------------------
// PEN_ICON / TRASH_ICON sont définies dans js/main.js (icônes partagées).
let _renamingArmyId=null;
const buildNameBlock=(a,isAi)=>{
  if(_renamingArmyId===a.id){
    return '<div class="ac-name-edit-row"><input type="text" class="ac-name-input" id="ac-name-input-'+a.id+'" value="'+escH(a.name||'')+'" maxlength="30" placeholder="Nom de l\'armée" onkeydown="if(event.key===\'Enter\')confirmRenameArmy(\''+a.id+'\','+(!!isAi)+')"><button class="btn btn-gold" style="font-size:11px;padding:6px 10px" onclick="confirmRenameArmy(\''+a.id+'\','+(!!isAi)+')">Valider</button></div>';
  }
  if(a.name){
    return '<div class="ac-name-row"><span class="ac-name">'+escH(a.name)+'</span><button class="ac-name-edit-btn" title="Renommer" onclick="startRenameArmy(\''+a.id+'\','+(!!isAi)+')">'+PEN_ICON+'</button></div>';
  }
  return '<button class="btn btn-ghost ac-name-btn" onclick="startRenameArmy(\''+a.id+'\','+(!!isAi)+')">Nommer l\'armée</button>';
};
window.startRenameArmy=(id,isAi)=>{
  _renamingArmyId=id;
  if(isAi)renderAiArmiesPage();
  setTimeout(()=>{const inp=document.getElementById('ac-name-input-'+id);if(inp){inp.focus();inp.select();}},0);
};
window.confirmRenameArmy=(id,isAi)=>{
  const inp=document.getElementById('ac-name-input-'+id);if(!inp)return;
  const val=inp.value.trim();
  const list=isAi?savedAiArmies:savedArmies;
  const a=list.find(x=>x.id===id);if(a)a.name=val||null;
  if(isAi)saveAiArmies();else saveArmies();
  _renamingArmyId=null;
  if(isAi)renderAiArmiesPage();
};

// ----------------------------------------------------------------
// PAGE ARMÉES IA — inchangée : l'Instructeur peut recevoir plusieurs
// armées personnalisées, seule l'armée DU JOUEUR est limitée à une seule.
// ----------------------------------------------------------------
const renderAiArmiesPage=()=>{
  const grid=document.getElementById('ai-armies-grid');
  if(!savedAiArmies.length){grid.innerHTML='<div class="empty-armies"><span class="vial"><span class="vial-bubble"></span></span><p>Aucune armée IA enregistrée.<br>Créez une armée pour l\'IA !</p></div>';return;}
  grid.innerHTML=savedAiArmies.map(a=>{
    const mon=PIECES.find(p=>p.id===a.mon.id);const gen=PIECES.find(p=>p.id===a.gen.id);
    const extras=a.extras.map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
    const all=[mon,gen,...extras].filter(Boolean);
    return '<div class="army-card" style="border-top-color:var(--accent2)">'+buildNameBlock(a,true)+'<div class="ac-pieces">'+all.map(p=>'<span>'+p.emoji+'</span>').join('')+'</div><div class="ac-names">'+(mon?.name||'?')+' · '+(gen?.name||'?')+'<br>'+extras.map(p=>p.name).join(' · ')+'</div><div class="ac-val">'+a.totalValue+' pts</div><div class="ac-btns"><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="editAiArmy(\''+a.id+'\')">Modifier</button><button class="btn btn-primary" style="font-size:11px;padding:6px 12px" onclick="selectAiArmy(\''+a.id+'\')">Choisir</button><button class="btn btn-danger" style="font-size:14px;padding:6px 10px" title="Supprimer cette armée" onclick="deleteAiArmy(\''+a.id+'\')">'+TRASH_ICON+'</button></div></div>';
  }).join('');
};
window.editAiArmy=id=>{const a=savedAiArmies.find(x=>x.id===id);if(!a)return;builderMode='ai';updateBuilderBanner();loadArmyForEdit(a);showPage('page-builder');updAll();};
window.deleteAiArmy=id=>{showConfirmModal('Supprimer cette armée ?',()=>{savedAiArmies=savedAiArmies.filter(a=>a.id!==id);saveAiArmies();renderAiArmiesPage();});};
window.selectAiArmy=id=>{
  const a=savedAiArmies.find(x=>x.id===id);if(!a)return;
  const fp=id=>PIECES.find(p=>p.id===id);
  aiArmyData={mon:fp(a.mon.id),gen:fp(a.gen.id),extras:a.extras,placements:a.placements,totalValue:a.totalValue};
  if(currentArmyData)startAiBattle(currentArmyData,aiArmyData);
  else{showNotif('Sélectionnez d\'abord votre armée.');renderArmiesPage();showPage('page-armies');}
};
document.getElementById('ai-ar-back').addEventListener('click',()=>{if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-builder');});
document.getElementById('ai-ar-new').addEventListener('click',()=>{builderMode='ai';updateBuilderBanner();army={mon:null,gen:null,extras:[]};editingArmyId=null;showPage('page-builder');updAll();});

// ----------------------------------------------------------------
// GÉNÉRATEUR D'ARMÉE IA ALÉATOIRE
// ----------------------------------------------------------------
// minValue : budget minimum que doit atteindre l'armée générée.
// opts.style : style de l'adversaire (voir AI_OPPONENTS dans data-pieces.js).
//   Il ne change pas la force de calcul, il change CE QU'ELLE ALIGNE — c'est
//   ce qui fait qu'affronter Cinabre (sorcier) et Orpiment (brute) au même
//   niveau ne se joue pas de la même façon.
// opts.full : puiser dans TOUT le catalogue au lieu des seules pièces
//   débloquées par le joueur. Un adversaire à 1750 ELO doit pouvoir aligner
//   un Typhon que le joueur n'a pas encore vu : c'est comme ça qu'on découvre
//   qu'il existe. Les armées « miroir » gardent l'ancien comportement, qui
//   garantit un duel à armes connues.
const ARMY_STYLE_CLASS={
  brute:'Brute',sorcier:'Sorcier',nuee:'Brute',
  agressif:'Général',gourmand:'Général',positionnel:'Primordiale',
  defensif:'Brute',mobile:'Primordiale',
};
function generateAIArmy(minValue,opts){
  opts=opts||{};
  const floor=typeof minValue==='number'?minValue:0;
  // L'IA n'est pas soumise à l'économie : elle ne « possède » pas ses pièces,
  // sinon il faudrait lui tenir un inventaire qui n'a aucun sens de jeu.
  const unlocked=VV_UNLOCKED;
  const known=p=>opts.full||unlocked.has(p.id);
  const monarques=PIECES.filter(p=>p.class==='Monarque'&&known(p));
  const generaux=PIECES.filter(p=>p.class==='Général'&&known(p));
  // L'IA peut utiliser TOUTES les Primordiaux (exception spéciale), + les autres pièces débloquées
  // Règle : une pièce avec qty>=2 crée une paire, l'IA ne peut avoir qu'UNE paire de Primordiale max
  // et jamais plusieurs paires de la même pièce (ie. une seule pièce qty>=2 au total parmi les extras)
  const primordiaux=PIECES.filter(p=>p.class==='Primordiale');
  const othersUnlocked=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&p.class!=='Primordiale'&&known(p));
  const others=[...primordiaux,...othersUnlocked];
  const allMon=monarques.length?monarques:PIECES.filter(p=>p.id==='roi');
  const allGen=generaux.length?generaux:PIECES.filter(p=>p.id==='dame');
  const allOth=others.length>=3?others:PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général').slice(0,6);
  const rnd=arr=>arr[Math.floor(Math.random()*arr.length)];
  // Le style ne verrouille pas la composition, il la penche : la classe
  // favorite passe en tête du tirage une fois sur deux. Un filtre strict
  // produirait douze adversaires interchangeables au sein d'un même style.
  const favClass=ARMY_STYLE_CLASS[opts.style]||null;
  const shuffle=arr=>{
    const a=[...arr].sort(()=>Math.random()-0.5);
    if(!favClass)return a;
    return a.sort((x,y)=>{
      const sx=(x.class===favClass&&Math.random()<0.75)?1:0;
      const sy=(y.class===favClass&&Math.random()<0.75)?1:0;
      return sy-sx;
    });
  };
  // Un budget d'armée plus bas est la façon la plus lisible d'affaiblir un
  // adversaire sans le rendre stupide : il joue bien, avec moins.
  const cap=Math.max(6,Math.min(24,(typeof opts.budget==='number')?opts.budget:24));
  let tries=0;
  while(tries++<2000){
    const mon=rnd(allMon);const gen=rnd(allGen);
    if(mon.value+gen.value>cap-2)continue;
    const budget=cap-mon.value-gen.value;
    const pool=shuffle(allOth);
    let chosen=[];let val=0;let primCount=0;
    const usedIds=new Set(); // pas de doublon de pièce
    for(const p of pool){
      if(chosen.length>=3)break;
      if(usedIds.has(p.id))continue; // même pièce déjà choisie
      if(p.class==='Primordiale'&&primCount>=1)continue; // max 1 paire de Primordiale
      if(val+p.value>budget)continue;
      chosen.push(p);val+=p.value;usedIds.add(p.id);
      if(p.class==='Primordiale')primCount++;
    }
    if(chosen.length===3&&(mon.value+gen.value+val)>=floor){
      // Colonnes gauches canoniques {0,1,2} : buildGameBoard miroite en 7-col,
      // donc placement symétrique sans collision. Ordre aléatoire entre les 3.
      const cols=[0,1,2].sort(()=>Math.random()-0.5);const placements={};
      chosen.forEach((p,i)=>{placements[p.id]=cols[i];});
      return{mon,gen,extras:chosen.map(p=>p.id),placements,totalValue:mon.value+gen.value+val,_random:true};
    }
  }
  // Fallback (budget très serré) : pièces distinctes les moins chères, tirées au hasard
  const mon=rnd(allMon),gen=rnd(allGen);
  const shuffledOth=[...allOth].sort(()=>Math.random()-0.5);
  const ext=shuffledOth.filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,3);
  const cols=[0,1,2].sort(()=>Math.random()-0.5);const placements={};
  ext.forEach((p,i)=>{placements[p.id]=cols[i];});
  return{mon,gen,extras:ext.map(p=>p.id),placements,totalValue:mon.value+gen.value+ext.reduce((s,p)=>s+p.value,0),_random:true};
}
