// ================================================================
// CINEMATICS.JS : mise en scène de l'entrée en combat et de son issue
// ================================================================
// Deux moments seulement sont mis en scène, ceux qui portent l'enjeu :
//
//   1. L'ENTRÉE EN COMBAT (playCombatCinematic) : deux volets d'ardoise se
//      referment sur l'écran, les deux armées se dressent face à face, un
//      choc les sépare, les volets se rouvrent sur le plateau. ~2,6 s.
//   2. L'ISSUE (playOutcomeCinematic) : le verdict tombe, puis le décompte
//      de ce que la partie a coûté et rapporté en pièces (js/economy.js).
//
// Les deux sont TOUJOURS interrompables (clic, Échap, ou bouton « Passer ») :
// une cinématique qu'on ne peut pas couper devient une punition dès la
// troisième partie. Le rappel `onDone` est garanti exactement une fois, que
// la séquence aille au bout ou qu'elle soit passée.
//
// Dépendances : piece-art.js (pieceIcon), data-pieces.js (PIECES),
// rules-engine.js (playSound). Utilisé par game-flow.js.
// ================================================================

let _cineActive=null;

function cineRoot(){return document.getElementById('cine-root');}

// Ferme la cinématique en cours et exécute son rappel. Idempotent : plusieurs
// sources peuvent demander la fermeture (fin du minuteur, clic, Échap).
function cineDismiss(){
  const c=_cineActive;
  if(!c)return;
  _cineActive=null;
  clearTimeout(c.timer);
  if(c.el){
    c.el.classList.add('cine-out');
    setTimeout(()=>c.el.remove(),480);
  }
  if(c.onDone)c.onDone();
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_cineActive)cineDismiss();});

function cineMount(html,durationMs,onDone){
  // Une cinématique en remplace une autre plutôt que de s'empiler : deux
  // overlays superposés laisseraient l'un des deux orphelin à l'écran.
  if(_cineActive)cineDismiss();
  const root=cineRoot();if(!root){if(onDone)onDone();return;}
  const el=document.createElement('div');
  el.className='cine';
  el.innerHTML=html+'<button class="cine-skip" type="button">Passer</button>';
  root.appendChild(el);
  _cineActive={el,onDone,timer:setTimeout(cineDismiss,durationMs)};
  el.querySelector('.cine-skip').addEventListener('click',ev=>{ev.stopPropagation();cineDismiss();});
  el.addEventListener('click',cineDismiss);
  return el;
}

// Résout une armée (format sauvegardé ou format catalogue) en liste de pièces.
function cineArmyPieces(armyData){
  if(!armyData)return[];
  const fp=id=>PIECES.find(p=>p.id===id);
  const mon=fp(armyData.mon?.id||armyData.mon)||armyData.mon;
  const gen=fp(armyData.gen?.id||armyData.gen)||armyData.gen;
  const extras=(armyData.extras||[]).map(e=>fp(e&&e.id?e.id:e)).filter(Boolean);
  return [mon,gen,...extras].filter(Boolean);
}

// ----------------------------------------------------------------
// 1. ENTRÉE EN COMBAT
// ----------------------------------------------------------------
// playerColor sert à colorer les pièces du bon camp : voir son armée en
// blanc alors qu'on va jouer les noirs serait déroutant dès le premier coup.
function playCombatCinematic(playerArmy,oppArmy,oppName,playerColor,onDone){
  const pc=playerColor==='b'?'b':'w';
  const oc=pc==='w'?'b':'w';
  const row=(pieces,color,side)=>'<div class="cine-row cine-'+side+'">'+
    pieces.map((p,i)=>'<span class="pc-icon" style="animation-delay:'+(0.12+i*0.09)+'s">'+
      pieceSVG(p.id,color)+'</span>').join('')+'</div>';

  const html=
    '<div class="cine-shutter top"></div><div class="cine-shutter bot"></div>'+
    '<div class="cine-shock"></div>'+
    '<div class="cine-body">'+
      '<div class="cine-vs">'+
        '<div class="cine-side">'+
          '<div class="cine-side-lbl">Votre armée</div>'+
          row(cineArmyPieces(playerArmy),pc,'left')+
          '<div class="cine-side-name">'+escH(CUR_ACC||'Vous')+'</div>'+
        '</div>'+
        '<div class="cine-clash">VS</div>'+
        '<div class="cine-side">'+
          '<div class="cine-side-lbl">Adversaire</div>'+
          row(cineArmyPieces(oppArmy),oc,'right')+
          '<div class="cine-side-name">'+escH(oppName||'L\'Instructeur')+'</div>'+
        '</div>'+
      '</div>'+
    '</div>';

  cineMount(html,2600,onDone);
  // Le son suit l'animation : le choc visuel est calé à 0,78 s (voir
  // .cine-clash/.cine-shock dans css [CINEMATIC]).
  setTimeout(()=>{if(_cineActive&&typeof playSound==='function')playSound('capture');},780);
}

// ----------------------------------------------------------------
// 2. ISSUE DU COMBAT
// ----------------------------------------------------------------
// report vient de economySettle() : {lost, returned, gained, streak, chest}.
function playOutcomeCinematic(result,report,onDone){
  const verdict={win:'VICTOIRE',loss:'DÉFAITE',draw:'NULLE'}[result]||'FIN';
  const cls={win:'v-win',loss:'v-loss',draw:'v-draw'}[result]||'v-draw';
  const sub={
    win:'Les survivants rentrent au camp.',
    loss:'Toute l\'armée engagée est perdue.',
    draw:'Chacun repart avec ses survivants.',
  }[result]||'';

  const tally=(label,map,extraCls,emptyMsg)=>{
    const entries=Object.entries(map||{}).filter(([,n])=>n>0);
    const inner=entries.length
      ? entries.map(([id,n])=>'<span class="tally-q">'+n+'×</span>'+pieceIcon(id,'n',1.5)).join('')
      : '<span class="tally-none">'+emptyMsg+'</span>';
    return '<div class="tally-box '+extraCls+'"><div class="tally-lbl">'+label+'</div><div class="tally-row">'+inner+'</div></div>';
  };

  let boxes=tally('Pièces perdues',report&&report.lost,'tally-loss','Aucune perte');
  if(report&&Object.keys(report.gained||{}).length)
    boxes+=tally('Créées par promotion',report.gained,'tally-gain','—');
  // IL N'Y A PLUS DE COFFRE DE SÉRIE À ANNONCER ICI. Une victoire donnait un
  // coffre selon la série du jour ; elle fait maintenant avancer la COLONNE
  // DES VICTOIRES (js/rewards.js), dont le palier s'encaisse à la main sur sa
  // page. Ce n'est donc plus un gain de fin de partie à récapituler.

  // Braises pour une défaite, poussière d'or pour une victoire.
  const moteColor=result==='win'?'#e6c576':result==='loss'?'#d9552f':'#8698a1';
  let motes='<div class="cine-motes">';
  for(let i=0;i<26;i++){
    const size=2+Math.random()*5,dur=3.5+Math.random()*4;
    motes+='<span class="cine-mote" style="left:'+(Math.random()*100).toFixed(1)+'%;bottom:-4%;width:'+size.toFixed(1)+'px;height:'+size.toFixed(1)+'px;background:'+moteColor+';animation-duration:'+dur.toFixed(1)+'s;animation-delay:'+(Math.random()*2).toFixed(1)+'s"></span>';
  }
  motes+='</div>';

  cineMount(
    motes+
    '<div class="cine-body">'+
      '<div class="cine-verdict '+cls+'">'+verdict+'</div>'+
      '<div class="cine-verdict-sub">'+sub+'</div>'+
      '<div class="cine-tally">'+boxes+'</div>'+
    '</div>',
    result==='loss'?3400:3800,onDone);
}
