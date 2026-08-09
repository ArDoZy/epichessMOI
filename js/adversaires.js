// ================================================================
// ADVERSAIRES.JS : la galerie des douze adversaires (#page-adversaires)
// ================================================================
// Le jeu n'avait qu'un adversaire, à 2000 ELO, et l'affronter ne rapportait
// rien au classement. Un joueur seul sortait donc du tutoriel face à un mur,
// et ne pouvait gagner AUCUN point d'ELO : ni le Garde de Pierre (30 ELO), ni
// la Méduse (210), ni le Typhon (1000), ni un seul échiquier ne lui étaient
// accessibles. La moitié du jeu était du contenu mort.
//
// Cette page est la réponse : douze adversaires nommés de 150 à 2300 ELO
// (AI_OPPONENTS dans js/data-pieces.js), chacun avec sa force, son style
// d'armée et son palier de coffre, et tous CLASSÉS (voir vvNoEloReason dans
// js/voie.js). Le classement redevient une échelle qu'on gravit en jouant.
//
// Aucun adversaire n'est verrouillé : on peut défier l'Athanor au premier
// jour. La page se contente de dire où l'on en est (« à votre portée »,
// « au-dessus de vous ») et de garder le compte des duels.
//
// Dépendances : data-pieces.js (AI_OPPONENTS, vvGetRank), accounts.js
// (accGet/accSet), main.js (showPage, escH), ai-level-modal.js
// (aiSetOpponent, aiChosenOpponent), armies.js (startArmySelection),
// voie.js (vvLoadElo).
// Utilisé par : cube-nav.js (bouton « Adversaires » du menu principal),
// combat-intro.js et game-flow.js (nom et portrait de l'adversaire engagé).
// ================================================================

// ----------------------------------------------------------------
// PORTRAITS
// ----------------------------------------------------------------
// Chaque adversaire cherche `assets/adversaires/<id>.png`. Le fichier est
// FACULTATIF : sans lui, on dessine un SCEAU procédural à partir de son id.
// Le jeu est donc complet sans un seul octet d'image, et déposer un portrait
// suffit à le faire apparaître — il n'y a aucune liste à tenir à jour.
//
// La bascule se fait à l'affichage et non au chargement : une <img> dont la
// source manque déclenche onerror, on remplace alors son contenu par le
// sceau. Tester l'existence du fichier à l'avance demanderait une requête par
// adversaire à chaque ouverture de la page.
function advPortraitPath(id){return 'assets/adversaires/'+id+'.png';}

// Suite déterministe tirée de l'id : deux adversaires n'ont jamais le même
// sceau, et le sceau d'un adversaire ne change jamais d'une partie à l'autre.
function advHash(id){
  let h=2166136261;
  for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619);}
  return()=>{h^=h<<13;h^=h>>>17;h^=h<<5;h|=0;return((h>>>0)%1000)/1000;};
}

// Sceau d'alchimiste : un anneau, une figure inscrite, des marques réparties
// sur le pourtour. Même vocabulaire graphique que l'emblème du jeu et que les
// logos de pièces (trait plein, deux couleurs, aucun dégradé).
function advSealSVG(opp){
  const rnd=advHash(opp.id);
  const sides=3+Math.floor(rnd()*4);          // triangle à hexagone
  const rot=rnd()*Math.PI*2;
  const R=30;
  const pts=[];
  for(let i=0;i<sides;i++){
    const a=rot+i*2*Math.PI/sides;
    pts.push((50+R*Math.cos(a)).toFixed(1)+','+(50+R*Math.sin(a)).toFixed(1));
  }
  // Cordes internes : elles relient un sommet sur deux, ce qui donne l'étoile
  // quand le nombre de côtés est impair et un simple entrelacs sinon.
  let chords='';
  const step=1+Math.floor(rnd()*Math.max(1,Math.floor(sides/2)));
  for(let i=0;i<sides;i++){
    const a=rot+i*2*Math.PI/sides,b=rot+((i+step)%sides)*2*Math.PI/sides;
    chords+='<line x1="'+(50+R*Math.cos(a)).toFixed(1)+'" y1="'+(50+R*Math.sin(a)).toFixed(1)+
            '" x2="'+(50+R*Math.cos(b)).toFixed(1)+'" y2="'+(50+R*Math.sin(b)).toFixed(1)+'"/>';
  }
  let marks='';
  const nm=4+Math.floor(rnd()*5);
  for(let i=0;i<nm;i++){
    const a=rnd()*Math.PI*2,r1=38,r2=38+2+rnd()*5;
    marks+='<line x1="'+(50+r1*Math.cos(a)).toFixed(1)+'" y1="'+(50+r1*Math.sin(a)).toFixed(1)+
           '" x2="'+(50+r2*Math.cos(a)).toFixed(1)+'" y2="'+(50+r2*Math.sin(a)).toFixed(1)+'"/>';
  }
  return '<svg class="adv-seal" viewBox="0 0 100 100" aria-hidden="true" focusable="false" '+
    'style="--seal:'+opp.accent+'">'+
    '<circle class="as-ring" cx="50" cy="50" r="46"/>'+
    '<circle class="as-ring as-ring2" cx="50" cy="50" r="36"/>'+
    '<polygon class="as-fig" points="'+pts.join(' ')+'"/>'+
    '<g class="as-chord">'+chords+'</g>'+
    '<g class="as-mark">'+marks+'</g>'+
    '<circle class="as-core" cx="50" cy="50" r="5"/>'+
    '</svg>';
}

// Vignette utilisée partout où un adversaire est montré (galerie, page de
// combat, bandeau de partie, modal de résultat).
function advPortrait(opp,cls){
  const seal=advSealSVG(opp);
  const safe=seal.replace(/"/g,'&quot;');
  return '<span class="adv-portrait '+(cls||'')+'" style="--accent:'+opp.accent+'">'+
    '<img src="'+advPortraitPath(opp.id)+'" alt="" loading="lazy" '+
    'onerror="this.parentNode.innerHTML=this.dataset.seal;" data-seal="'+safe+'">'+
    '</span>';
}

// ----------------------------------------------------------------
// PALMARÈS PAR ADVERSAIRE
// ----------------------------------------------------------------
// Sans mémoire, douze adversaires ne sont qu'une liste : c'est le compte des
// duels qui en fait douze rivaux. Enregistré par triggerEndOfGame.
function advRecords(){return accGet('opp_records',{})||{};}
function advRecord(id){const r=advRecords()[id];return r||{w:0,l:0,d:0};}
function advNoteResult(id,result){
  if(!id)return;
  const all=advRecords();
  const r=all[id]||{w:0,l:0,d:0};
  if(result==='win')r.w++;else if(result==='loss')r.l++;else r.d++;
  all[id]=r;accSet('opp_records',all);
}
function advDefeated(id){return advRecord(id).w>0;}

// ----------------------------------------------------------------
// LIBELLÉS
// ----------------------------------------------------------------
const ADV_STYLE_LABEL={
  erratique:'Imprévisible',gourmand:'Vorace',nuee:'En nuée',brute:'Force brute',
  agressif:'Agressif',sorcier:'Sorcier',defensif:'Défensif',mobile:'Mobile',
  positionnel:'Positionnel',equilibre:'Complet',
};
// Écart de niveau, dit en français plutôt qu'en points : c'est la seule
// information dont le joueur a besoin pour choisir à qui se mesurer.
function advGapLabel(oppElo,myElo){
  const d=oppElo-myElo;
  if(d<=-350)return{txt:'Bien en dessous de vous',cls:'adv-gap-low'};
  if(d<=-120)return{txt:'En dessous de vous',cls:'adv-gap-low'};
  if(d<120)  return{txt:'À votre portée',cls:'adv-gap-even'};
  if(d<350)  return{txt:'Au-dessus de vous',cls:'adv-gap-high'};
  return{txt:'Très au-dessus de vous',cls:'adv-gap-far'};
}

// ----------------------------------------------------------------
// RENDU DE LA PAGE
// ----------------------------------------------------------------
function renderAdversairesPage(){
  const grid=document.getElementById('adv-grid');
  if(!grid)return;
  const myElo=(typeof vvLoadElo==='function')?vvLoadElo():0;
  const chosen=(typeof aiChosenOpponent==='function')?aiChosenOpponent().id:'instructeur';
  // Un compte neuf est à 0 ELO : les douze adversaires sont alors « au-dessus
  // de vous », et la colonne d'écarts ne dit plus rien d'utile. On désigne
  // donc toujours celui dont on est le plus proche — il y a toujours un
  // prochain adversaire à viser, quel que soit son niveau.
  let advised=AI_OPPONENTS[0].id,bestGap=Infinity;
  AI_OPPONENTS.forEach(o=>{const g=Math.abs(o.elo-myElo);if(g<bestGap){bestGap=g;advised=o.id;}});
  const sub=document.getElementById('adv-sub');
  if(sub)sub.textContent='Vous êtes à '+myElo+' ELO. Chaque duel compte au classement : '+
    'battre plus fort que soi rapporte, perdre contre plus faible coûte.';
  grid.innerHTML=AI_OPPONENTS.map(o=>{
    const rec=advRecord(o.id);
    const gap=advGapLabel(o.elo,myElo);
    const chest=(typeof chestById==='function')?chestById(CHESTS[o.tier]?.id||'pion'):null;
    const recTxt=(rec.w+rec.l+rec.d)>0
      ? '<span class="adv-rec-w">'+rec.w+'V</span><span class="adv-rec-d">'+rec.d+'N</span><span class="adv-rec-l">'+rec.l+'D</span>'
      : '<span class="adv-rec-none">Jamais affronté</span>';
    return '<button class="adv-card'+(o.id===chosen?' adv-card-on':'')+(advDefeated(o.id)?' adv-card-beaten':'')+
      (o.id===advised?' adv-card-advised':'')+
      '" style="--accent:'+o.accent+'" data-id="'+o.id+'" type="button">'+
      advPortrait(o)+
      '<div class="adv-body">'+
        '<div class="adv-head"><span class="adv-name">'+escH(o.name)+'</span>'+
          '<span class="adv-elo">'+o.elo+'</span></div>'+
        '<div class="adv-title">'+escH(o.title)+'</div>'+
        '<div class="adv-desc">'+escH(o.desc)+'</div>'+
        '<div class="adv-tags">'+
          '<span class="adv-tag">'+(ADV_STYLE_LABEL[o.style]||o.style)+'</span>'+
          '<span class="adv-tag">armée '+o.budget+' pts</span>'+
          (chest?'<span class="adv-tag adv-tag-chest">jusqu\'au '+escH(chest.name)+'</span>':'')+
        '</div>'+
        '<div class="adv-foot"><span class="adv-gap '+gap.cls+'">'+
          (o.id===advised?'À votre mesure':gap.txt)+'</span>'+
          '<span class="adv-rec">'+recTxt+'</span></div>'+
      '</div>'+
      (o.id===advised?'<span class="adv-advised">Conseillé</span>':'')+
      (advDefeated(o.id)?'<span class="adv-beaten-mark" title="Déjà vaincu">✦</span>':'')+
      '</button>';
  }).join('');
  grid.querySelectorAll('.adv-card').forEach(el=>{
    el.addEventListener('click',()=>advPick(el.dataset.id));
  });
}

// Choisir un adversaire enchaîne directement sur le choix de l'armée : c'est
// la suite évidente, et l'écran de sélection porte déjà le nom du défié.
function advPick(id){
  if(typeof aiSetOpponent==='function')aiSetOpponent(id);
  renderAdversairesPage();
  if(typeof startArmySelection==='function')startArmySelection('ia');
}

function showAdversairesPage(){
  renderAdversairesPage();
  showPage('page-adversaires');
}

// ----------------------------------------------------------------
// RAPPEL SUR LE MENU PRINCIPAL
// ----------------------------------------------------------------
// « Adversaires » n'est qu'un bouton parmi trois, alors que c'est par là que
// passe toute la progression d'un joueur seul. Le menu nomme donc celui qui
// est à sa mesure : il y a toujours un prochain adversaire à viser, et une
// raison d'y aller.
function advNextFoe(){
  const myElo=(typeof vvLoadElo==='function')?vvLoadElo():0;
  let best=AI_OPPONENTS[0];
  AI_OPPONENTS.forEach(o=>{if(Math.abs(o.elo-myElo)<Math.abs(best.elo-myElo))best=o;});
  return best;
}
function renderNextFoeHint(){
  const el=document.getElementById('jouer-foe-hint');
  if(!el)return;
  if(!CUR_ACC){el.innerHTML='';return;}
  const o=advNextFoe();
  const beaten=advDefeated(o.id);
  el.innerHTML='À votre mesure : <b style="color:'+o.accent+'">'+escH(o.name)+'</b> · '+o.elo+' ELO'+
    (beaten?' <span class="jfh-beaten">déjà vaincu</span>':'');
}

document.getElementById('adv-back')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-armies');
});
