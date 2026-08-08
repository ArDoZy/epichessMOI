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
// Icône stylo en SVG (et non en glyphe unicode/emoji) pour un rendu net et
// cohérent avec les flèches du cube (voir index.html #cube-arrow-*).
const PEN_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>';
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
  // Chrome de la page : masqué pendant la sélection.
  ['b-voie','ar-new'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display=sel?'none':'';});
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
      : '<div class="ac-btns"><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="editPlayerArmy(\''+a.id+'\')">Modifier</button><button class="btn btn-danger" style="font-size:14px;padding:6px 10px" title="Supprimer cette armée" onclick="deletePlayerArmy(\''+a.id+'\')">🗑️</button></div>';
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
    return '<div class="army-card" style="border-top-color:var(--accent2)">'+buildNameBlock(a,true)+'<div class="ac-pieces">'+all.map(p=>'<span>'+p.emoji+'</span>').join('')+'</div><div class="ac-names">'+(mon?.name||'?')+' · '+(gen?.name||'?')+'<br>'+extras.map(p=>p.name).join(' · ')+'</div><div class="ac-val">'+a.totalValue+' pts</div><div class="ac-btns"><button class="btn btn-ghost" style="font-size:11px;padding:6px 12px" onclick="editAiArmy(\''+a.id+'\')">Modifier</button><button class="btn btn-primary" style="font-size:11px;padding:6px 12px" onclick="selectAiArmy(\''+a.id+'\')">Choisir</button><button class="btn btn-danger" style="font-size:14px;padding:6px 10px" title="Supprimer cette armée" onclick="deleteAiArmy(\''+a.id+'\')">🗑️</button></div></div>';
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
// minValue : budget minimum que doit atteindre l'armée générée. Utilisé par
// le tournoi pour faire monter la difficulté palier après palier, maintenant
// que l'adversaire est toujours le même instructeur (voir tournoi.js).
function generateAIArmy(minValue){
  const floor=typeof minValue==='number'?minValue:0;
  // L'IA n'est pas soumise à l'économie : elle ne « possède » pas ses pièces,
  // sinon il faudrait lui tenir un inventaire qui n'a aucun sens de jeu.
  const unlocked=VV_UNLOCKED;
  const monarques=PIECES.filter(p=>p.class==='Monarque'&&unlocked.has(p.id));
  const generaux=PIECES.filter(p=>p.class==='Général'&&unlocked.has(p.id));
  // L'IA peut utiliser TOUTES les Primordiaux (exception spéciale), + les autres pièces débloquées
  // Règle : une pièce avec qty>=2 crée une paire, l'IA ne peut avoir qu'UNE paire de Primordiale max
  // et jamais plusieurs paires de la même pièce (ie. une seule pièce qty>=2 au total parmi les extras)
  const primordiaux=PIECES.filter(p=>p.class==='Primordiale');
  const othersUnlocked=PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général'&&p.class!=='Primordiale'&&unlocked.has(p.id));
  const others=[...primordiaux,...othersUnlocked];
  const allMon=monarques.length?monarques:PIECES.filter(p=>p.id==='roi');
  const allGen=generaux.length?generaux:PIECES.filter(p=>p.id==='dame');
  const allOth=others.length>=3?others:PIECES.filter(p=>p.class!=='Monarque'&&p.class!=='Général').slice(0,6);
  const rnd=arr=>arr[Math.floor(Math.random()*arr.length)];
  let tries=0;
  while(tries++<2000){
    const mon=rnd(allMon);const gen=rnd(allGen);
    if(mon.value+gen.value>22)continue;
    const budget=24-mon.value-gen.value;
    const pool=[...allOth].sort(()=>Math.random()-0.5);
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