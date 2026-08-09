// ================================================================
// ARMIES.JS : Pages "Mes armées" / "Armées IA" + générateur d'armée IA
// ================================================================
// Contient : le rendu des listes d'armées sauvegardées (#page-armies et
// #page-ai-armies), les actions modifier/supprimer, le mode SÉLECTION
// (déclenché par "COMBAT"/"Tournoi" du menu principal : un clic sur une
// carte lance la partie), le chargement d'une armée sauvegardée dans le builder pour
// édition, et generateAIArmy() qui compose une armée aléatoire légale pour
// l'adversaire IA quand aucune armée IA personnalisée n'est choisie.
//
// Dépendances : data-pieces.js (PIECES), accounts.js (savedArmies,
// savedAiArmies, saveArmies, saveAiArmies, VV_UNLOCKED), main.js (army,
// editingArmyId, builderMode, updateBuilderBanner, updAll, showPage,
// showNotif), tournoi.js (tournamentState, renderTournoiPage, startTournoi),
// combat-intro.js (renderCombatPage, launchParticles).
// ================================================================

// ----------------------------------------------------------------
// PAGE ARMÉES JOUEUR
// ----------------------------------------------------------------
const loadArmyForEdit=ad=>{
  const fp=id=>PIECES.find(p=>p.id===id);
  army.mon=fp(ad.mon.id)||null;army.gen=fp(ad.gen.id)||null;
  // Reconstruit l'ordre (= disposition) : la pièce la plus proche du centre
  // (colonnes 3/4) vient en premier. Robuste aux anciennes sauvegardes.
  const dist=c=>Math.abs((c==null?0:c)-3.5);
  let ids=(ad.extras||[]).slice();
  if(ad.placements)ids.sort((a,b)=>dist(ad.placements[a])-dist(ad.placements[b]));
  army.extras=ids.map(fp).filter(Boolean).slice(0,3);
  editingArmyId=ad.id;
};

// ----------------------------------------------------------------
// NOM DE L'ARMÉE : bouton "Nommer l'armée" (ou nom + petit stylo une fois
// nommée) affiché au-dessus de la carte, à la place des dates.
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
  if(isAi)renderAiArmiesPage();else renderArmiesPage();
  setTimeout(()=>{const inp=document.getElementById('ac-name-input-'+id);if(inp){inp.focus();inp.select();}},0);
};
window.confirmRenameArmy=(id,isAi)=>{
  const inp=document.getElementById('ac-name-input-'+id);if(!inp)return;
  const val=inp.value.trim();
  const list=isAi?savedAiArmies:savedArmies;
  const a=list.find(x=>x.id===id);if(a)a.name=val||null;
  if(isAi)saveAiArmies();else saveArmies();
  _renamingArmyId=null;
  if(isAi)renderAiArmiesPage();else renderArmiesPage();
};

// ----------------------------------------------------------------
// MODE SÉLECTION D'ARMÉE
// ----------------------------------------------------------------
// Un combat / un tournoi ne se lance plus depuis la carte d'armée : on part
// du menu principal (gros bouton "COMBAT" ou bouton "Tournoi" de la face
// JOUER), ce qui amène ICI en mode sélection. La page se réduit alors à un
// choix : toutes les autres actions (Voie, Nouvelle armée, Modifier,
// Renommer, Supprimer) sont masquées et un clic sur une carte lance
// directement le combat/le tournoi avec cette armée.
let armySelectMode=null;   // null | 'online' | 'ia' | 'tournoi'

window.startArmySelection=mode=>{
  // Sans armée sauvegardée il n'y a rien à sélectionner : on affiche la page
  // normale (avec "+ Nouvelle armée") plutôt qu'un mode sélection vide.
  if(!savedArmies.length){
    armySelectMode=null;renderArmiesPage();showPage('page-armies');
    showNotif('Composez d\'abord une armée pour pouvoir combattre.','err');
    return;
  }
  // Une seule armée = aucun choix à faire. Afficher un écran de sélection
  // avec une seule carte, c'est demander de confirmer la seule réponse
  // possible : on part directement au combat avec elle.
  if(savedArmies.length===1){
    armySelectMode=mode;
    pickArmyForBattle(savedArmies[0].id);
    return;
  }
  armySelectMode=mode;
  renderArmiesPage();showPage('page-armies');
};
window.clearArmySelection=()=>{
  if(!armySelectMode)return;
  armySelectMode=null;renderArmiesPage();
};
window.cancelArmySelection=()=>{
  armySelectMode=null;renderArmiesPage();
  if(typeof goToMainMenu==='function')goToMainMenu();
};
window.pickArmyForBattle=id=>{
  const mode=armySelectMode;if(!mode)return;
  const a=savedArmies.find(x=>x.id===id);
  // Dernier filet : une armée dont la réserve est insuffisante ne part pas
  // au combat, quel que soit le mode.
  if(a&&typeof armyStock==='function'){
    const stock=armyStock(a);
    if(!stock.ok){
      // On sort du mode sélection et on montre l'armurerie : le joueur doit
      // pouvoir agir (modifier l'armée, aller à la Réserve), pas rester sur
      // un écran de choix qui refuse le seul choix disponible.
      armySelectMode=null;renderArmiesPage();showPage('page-armies');
      showConfirmModal('Réserve insuffisante : '+stock.missing.map(m=>m.name+' ('+m.have+'/'+m.need+')').join(', ')+
        '. Récupérez le coffre de réapprovisionnement dans la Réserve, ou composez une autre armée.',()=>{},
        {okLabel:'Compris',cancelLabel:'Fermer',okClass:'btn-primary'});
      return;
    }
  }
  armySelectMode=null;renderArmiesPage();
  if(mode==='tournoi')launchTournoiFromArmy(id);
  else if(mode==='online')launchOnline(id);
  else launchCombat(id);
};



const renderArmiesPage=()=>{
  const grid=document.getElementById('armies-grid');
  const sel=!!armySelectMode;
  // Chrome de la page : masqué pendant la sélection. (Le bouton « Voie » a
  // disparu de cette page — la Voie est une face du cube — d'où la liste à
  // un seul élément.)
  ['ar-new'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display=sel?'none':'';});
  const banner=document.getElementById('armies-select-banner');
  if(banner){
    banner.style.display=sel?'':'none';
    banner.innerHTML=sel?'<span class="asb-txt">'+(armySelectMode==='tournoi'?'Sélectionnez l\'armée avec laquelle vous voulez disputer le tournoi':armySelectMode==='online'?'Sélectionnez l\'armée que vous engagez contre un autre joueur':'Sélectionnez l\'armée avec laquelle affronter l\'Instructeur')+'</span><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="cancelArmySelection()">Annuler</button>':'';
  }
  if(!savedArmies.length){grid.innerHTML='<div class="empty-armies"><span class="vial"><span class="vial-bubble"></span></span><p>Aucune armée enregistrée.<br>Composez votre première armée !</p></div>';return;}
  grid.innerHTML=savedArmies.map(a=>{
    const mon=PIECES.find(p=>p.id===a.mon.id);const gen=PIECES.find(p=>p.id===a.gen.id);
    const extras=a.extras.map(id=>PIECES.find(p=>p.id===id)).filter(Boolean);
    const all=[mon,gen,...extras].filter(Boolean);
    // En mode sélection : carte entièrement cliquable, nom en lecture seule,
    // aucun bouton d'action.
    const head=sel
      ? '<div class="ac-name-row"><span class="ac-name'+(a.name?'':' ac-name-none')+'">'+escH(a.name||'Armée sans nom')+'</span></div>'
      : buildNameBlock(a,false);
    const btns=sel?''
      : '<div class="ac-btns"><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="editPlayerArmy(\''+a.id+'\')">Modifier</button><button class="btn btn-danger" style="font-size:14px;padding:6px 10px" title="Supprimer cette armée" onclick="deletePlayerArmy(\''+a.id+'\')">'+TRASH_ICON+'</button></div>';
    // Une armée dont le stock est insuffisant reste visible et modifiable,
    // mais ne peut pas être engagée : elle est marquée, pas cachée.
    const stock=(typeof armyStock==='function')?armyStock(a):{ok:true,missing:[]};
    const open=(sel&&stock.ok)
      ? '<div class="army-card army-card-selectable" onclick="pickArmyForBattle(\''+a.id+'\')">'
      : '<div class="army-card'+(stock.ok?'':' army-card-nostock')+'">';
    const stockLine=stock.ok
      ? ''
      : '<div class="ac-nostock">Réserve insuffisante : '+stock.missing.map(m=>escH(m.name)+' '+m.have+'/'+m.need).join(', ')+'</div>';
    return open+head+'<div class="ac-pieces">'+all.map(p=>'<span title="'+escH(p.name)+'">'+pieceIcon(p.id,'n',1.7)+'</span>').join('')+'</div><div class="ac-names">'+( mon?.name||'?')+' (Monarque) · '+(gen?.name||'?')+' (Général)<br>'+extras.map(p=>p.name).join(' · ')+'</div><div class="ac-val">'+a.totalValue+' pts</div>'+stockLine+btns+'</div>';
  }).join('');
};
window.editPlayerArmy=id=>{const a=savedArmies.find(x=>x.id===id);if(!a)return;builderMode='player';updateBuilderBanner();loadArmyForEdit(a);showPage('page-builder');updAll();};
window.deletePlayerArmy=id=>{showConfirmModal('Supprimer cette armée ?',()=>{savedArmies=savedArmies.filter(a=>a.id!==id);saveArmies();renderArmiesPage();});};
window.launchTournoiFromArmy=id=>{
  const a=savedArmies.find(x=>x.id===id);if(!a)return;
  loadArmyForEdit(a);currentArmyData=a;
  tournamentState.active=false; // reset pour permettre nouveau tournoi
  renderTournoiPage();showPage('page-tournoi');
  // L'armée vient d'être choisie explicitement en mode sélection : plus de
  // confirmation à demander, le tournoi démarre directement.
  setTimeout(startTournoi,150);
};
document.getElementById('ar-new').addEventListener('click',()=>{builderMode='player';updateBuilderBanner();army={mon:null,gen:null,extras:[]};editingArmyId=null;showPage('page-builder');updAll();});

// ----------------------------------------------------------------
// PAGE ARMÉES IA
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
  if(currentArmyData){renderCombatPage(currentArmyData,'ia');showPage('page-combat');launchParticles();}
  else{showNotif('Sélectionnez d\'abord votre armée.');renderArmiesPage();showPage('page-armies');}
};
document.getElementById('ai-ar-back').addEventListener('click',()=>{if(currentArmyData){renderCombatPage(currentArmyData,'ia');showPage('page-combat');launchParticles();}else showPage('page-builder');});
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
//   qu'il existe. Les armées « miroir » et le tournoi gardent l'ancien
//   comportement, qui garantit un duel à armes connues.
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