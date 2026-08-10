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

// ----------------------------------------------------------------
// PUISSANCE DU SCEAU
// ----------------------------------------------------------------
// Le sceau ne disait rien de la force de celui qu'il représente : Cendre
// (150 ELO, qui joue presque au hasard) et l'Athanor (2300, recherche
// complète) portaient deux figures de complexité équivalente, tirées du seul
// hasard de leur identifiant. On ne pouvait donc pas VOIR à quoi on s'attaque.
//
// La complexité du dessin suit maintenant le RANG de l'adversaire dans le
// roster : un anneau nu et un triangle en bas de l'échelle, une figure à huit
// sommets, un double polygone, des satellites et une couronne de marques tout
// en haut. Le hasard de l'identifiant décide encore de la FORME (rotation,
// pas des cordes, position des marques) — deux adversaires de même force ne se
// ressemblent pas — mais plus de la QUANTITÉ.
//
// Renvoie 0 (le plus faible) à 1 (le plus fort). Les instructeurs du tutoriel,
// absents du roster, retombent sur 0 : ce sont bien les plus faibles du jeu.
function advSealTier(opp){
  const n=(typeof AI_OPPONENTS!=='undefined')?AI_OPPONENTS.length:1;
  if(n<2)return 0;
  const i=(typeof aiOpponentIndex==='function'&&AI_OPPONENTS.some(o=>o.id===opp.id))
    ?aiOpponentIndex(opp.id):0;
  return i/(n-1);
}

// Sceau d'alchimiste : des anneaux, une figure inscrite, des marques réparties
// sur le pourtour. Même vocabulaire graphique que l'emblème du jeu et que les
// logos de pièces (trait plein, deux couleurs, aucun dégradé).
function advSealSVG(opp){
  const rnd=advHash(opp.id);
  const t=advSealTier(opp);
  const pt=(r,a)=>(50+r*Math.cos(a)).toFixed(1)+','+(50+r*Math.sin(a)).toFixed(1);
  const line=(r1,r2,a1,a2)=>'<line x1="'+(50+r1*Math.cos(a1)).toFixed(1)+'" y1="'+(50+r1*Math.sin(a1)).toFixed(1)+
    '" x2="'+(50+r2*Math.cos(a2===undefined?a1:a2)).toFixed(1)+'" y2="'+(50+r2*Math.sin(a2===undefined?a1:a2)).toFixed(1)+'"/>';
  const poly=(sides,R,rot)=>{
    const pts=[];
    for(let i=0;i<sides;i++)pts.push(pt(R,rot+i*2*Math.PI/sides));
    return pts.join(' ');
  };

  const sides=3+Math.round(t*5);              // triangle (150 ELO) → octogone (2300)
  const rot=rnd()*Math.PI*2;
  const R=30;

  // Cordes internes : elles relient un sommet sur n, ce qui donne l'étoile
  // quand le pas et le nombre de côtés sont premiers entre eux. Les deux plus
  // faibles n'en ont aucune : leur figure reste nue.
  let chords='';
  if(t>=0.15){
    const step=1+Math.floor(rnd()*Math.max(1,Math.floor(sides/2)));
    for(let i=0;i<sides;i++)
      chords+=line(R,R,rot+i*2*Math.PI/sides,rot+((i+step)%sides)*2*Math.PI/sides);
  }

  // Second polygone, décalé d'un demi-pas : l'entrelacs n'apparaît qu'à
  // partir du milieu de l'échelle.
  const fig2=(t>=0.45)
    ?'<polygon class="as-fig as-fig2" points="'+poly(sides,R*0.62,rot+Math.PI/sides)+'"/>'
    :'';

  // Marques de pourtour : de quatre traits épars à une vraie couronne.
  let marks='';
  const nm=4+Math.round(t*14);
  const mrot=rnd()*Math.PI*2;
  for(let i=0;i<nm;i++){
    const a=mrot+i*2*Math.PI/nm+(rnd()-0.5)*0.12;
    marks+=line(38,40+rnd()*5,a);
  }

  // Satellites : des sceaux en orbite, réservés au haut du classement.
  let orbit='';
  const no=Math.round(t*t*4);
  for(let i=0;i<no;i++){
    const a=rot+i*2*Math.PI/Math.max(1,no)+0.4;
    orbit+='<circle class="as-orbit" cx="'+(50+42*Math.cos(a)).toFixed(1)+
           '" cy="'+(50+42*Math.sin(a)).toFixed(1)+'" r="'+(2+t*1.6).toFixed(1)+'"/>';
  }

  return '<svg class="adv-seal" viewBox="0 0 100 100" aria-hidden="true" focusable="false" '+
    'style="--seal:'+opp.accent+'">'+
    '<circle class="as-ring" cx="50" cy="50" r="46"/>'+
    (t>=0.3?'<circle class="as-ring as-ring2" cx="50" cy="50" r="41"/>':'')+
    '<circle class="as-ring as-ring2" cx="50" cy="50" r="36"/>'+
    '<polygon class="as-fig" points="'+poly(sides,R,rot)+'"/>'+
    fig2+
    '<g class="as-chord">'+chords+'</g>'+
    '<g class="as-mark">'+marks+'</g>'+
    '<g class="as-mark">'+orbit+'</g>'+
    (t>=0.75?'<circle class="as-ring" cx="50" cy="50" r="11"/>':'')+
    '<circle class="as-core" cx="50" cy="50" r="'+(4+t*2).toFixed(1)+'"/>'+
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
  const advised=advNextFoe().id;
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
// L'ADVERSAIRE LE PLUS PROCHE DE SON NIVEAU
// ----------------------------------------------------------------
// Il était aussi annoncé sur le menu principal (« À votre mesure : Cendre ·
// 150 ELO »), une ligne de plus sous les boutons alors que la galerie le dit
// déjà, en le désignant « Conseillé ». La fonction reste : c'est elle que le
// multijoueur utilise pour proposer un remplaçant quand aucun humain ne se
// présente (voir #mp-fallback-btn dans js/multiplayer.js).
function advNextFoe(){
  const myElo=(typeof vvLoadElo==='function')?vvLoadElo():0;
  let best=AI_OPPONENTS[0];
  AI_OPPONENTS.forEach(o=>{if(Math.abs(o.elo-myElo)<Math.abs(best.elo-myElo))best=o;});
  return best;
}

document.getElementById('adv-back')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-armies');
});
