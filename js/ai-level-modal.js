// ================================================================
// AI-LEVEL-MODAL.JS — Modal de choix de l'instructeur IA avant un combat
// ================================================================
// Contient : la logique du modal #ai-lvl-modal (grille des 7 instructeurs,
// verrouillage selon le rang ELO atteint, sélection).
//
// Dépendances : data-pieces.js (AI_INSTRUCTORS, RANKS, vvGetRankIdx),
// accounts.js (accGet), main.js.
// Utilisé par : combat-intro.js (bouton "Choisir l'instructeur →").
// La variable `selectedAILevel` est lue par ai-engine.js et game-flow.js
// pour déterminer la force de l'IA pendant la partie.
// ================================================================

let selectedAILevel=0;

// Cadence de partie fixe : 10 minutes par joueur (pas de sélection possible).
// Lu par game-flow.js/tournoi.js au démarrage de la partie.
const selectedTimeControl=10;

function getUnlockedLevels(elo){
  if(ADMIN_MODE)return AI_INSTRUCTORS.map(()=>true);
  const ri=vvGetRankIdx(elo);return AI_INSTRUCTORS.map((_,i)=>i<=ri);
}

function showAILevelModal(callback){
  const elo=accGet('elo',0);const unlocked=getUnlockedLevels(elo);
  const modal=document.getElementById('ai-lvl-modal');const grid=document.getElementById('ai-lvl-grid');
  modal.classList.add('show');
  let def=0;for(let i=0;i<unlocked.length;i++)if(unlocked[i])def=i;
  // Toujours pré-sélectionner le niveau le plus élevé débloqué
  selectedAILevel=def;
  const render=()=>{
    grid.innerHTML=AI_INSTRUCTORS.map((ai,i)=>{
      const ok=unlocked[i];const sel=selectedAILevel===i;
      return '<div class="ai-lvl-card '+(ok?'':'lvl-locked ')+( sel?'lvl-sel':'')+'" data-i="'+i+'">'+
        '<span class="lvl-emoji">'+ai.emoji+'</span>'+
        '<div class="lvl-name">'+ai.name+'</div>'+
        '<div class="lvl-info">'+(ai.timeMs===0?'Éval rapide':ai.timeMs<1000?ai.timeMs+'ms':Math.round(ai.timeMs/1000)+'s')+(ai.noise>0?' · Bruit '+Math.round(ai.noise*100)+'%':'')+'</div>'+
        '<div style="font-size:10px;color:var(--gold);font-family:Cinzel,serif;margin-top:3px">⚡ '+ai.elo+' ELO</div>'+
        '<div class="'+(ok?'lvl-ok':'lvl-lock')+'">'+( ok?'✓ Débloqué':'🔒 '+RANKS[i].name)+'</div>'+
        '<div style="font-size:10px;color:var(--muted);margin-top:4px;line-height:1.4">'+ai.desc+'</div>'+
        '</div>';
    }).join('');
    grid.querySelectorAll('.ai-lvl-card:not(.lvl-locked)').forEach(el=>{
      el.addEventListener('click',()=>{selectedAILevel=parseInt(el.dataset.i);render();});
    });
  };
  render();
  document.getElementById('ai-lvl-cancel').onclick=()=>modal.classList.remove('show');
  document.getElementById('ai-lvl-ok').onclick=()=>{modal.classList.remove('show');if(callback)callback();};
}