// ================================================================
// PIECE-CARD.JS : la carte de pièce et sa fiche (bottom sheet)
// ================================================================
// UN SEUL composant pour TOUTES les cartes de pièces du jeu. Avant, chaque
// écran redessinait sa propre carte avec son propre balisage : le builder
// empilait logo + nom + valeur + schéma de déplacement + pouvoir en toutes
// lettres dans un rectangle plus large que haut, la Voie en dessinait une
// autre, et rien ne se ressemblait d'un écran à l'autre.
//
// LE PRINCIPE : la carte IDENTIFIE, la fiche EXPLIQUE.
//
//   Sur la carte, et rien de plus, dans cet ordre de lecture :
//     1. le logo de la pièce      (le plus gros élément)
//     2. son nom                  (très visible)
//     3. sa valeur en points
//     4. le stock possédé
//   Format PORTRAIT et compact : on en voit huit à l'écran d'un téléphone,
//   ce qui permet de parcourir le catalogue au pouce sans jamais défiler à
//   l'aveugle.
//
//   Au premier appui, la carte s'ouvre et découvre DEUX boutons :
//     « Utiliser »  → engage la pièce dans l'armée (le geste habituel)
//     « Infos »     → ouvre la fiche
//
//   La fiche (bottom sheet, #piece-sheet dans index.html) porte le détail :
//   le nom et le logo, le DÉPLACEMENT en schéma 9×9 (js/piece-moves.js), et
//   le POUVOIR — présenté comme une carte à part entière, avec son icône, son
//   nom propre et sa couleur d'accent, pour qu'un pouvoir se reconnaisse à
//   l'image avant même d'être lu.
//
// Toutes les dimensions sont relatives (%, vw, clamp) : la carte suit la
// largeur de l'écran au lieu d'imposer la sienne.
//
// Dépendances : data-pieces.js (PIECES, CLASS_COLOR_VARS), piece-art.js
// (pieceIcon), main.js (escH), piece-moves.js (pieceMoveDiagramHTML — appelé
// à l'ouverture de la fiche seulement, donc après chargement), economy.js
// (invCount, isOwnablePiece, pieceDeployCount).
// Utilisé par : builder.js (catalogue de composition d'armée).
// ================================================================

// ----------------------------------------------------------------
// LES ICÔNES DE POUVOIR
// ----------------------------------------------------------------
// Un pouvoir doit se reconnaître AVANT d'être lu. Chacun porte donc son
// propre pictogramme, dessiné dans le même vocabulaire que les logos de
// pièces et l'emblème du jeu : trait plein, aucune couleur en dur (tout suit
// currentColor), aucun émoji — un émoji change de dessin d'un téléphone à
// l'autre et ne suit pas le thème.
//
// La clé est l'identifiant de la pièce : c'est le pouvoir de CETTE créature
// qu'on illustre, pas une catégorie abstraite.
const POWER_ICONS={
  // Espadon (Empereur) : une lame.
  empereur:'<path d="M4 20l4-1 11-11 1-4-4 1L5 16z"/><path d="M6 18l-2 2"/><path d="M14 6l4 4"/>',
  // Domination (Grand Maître) : une couronne qui pèse sur une barre.
  'grand-maitre':'<path d="M4 8l3 3 5-6 5 6 3-3v8H4z"/><path d="M4 19h16"/>',
  // Retraite Prudente (Peureux) : une flèche qui rentre derrière un mur.
  peureux:'<path d="M20 4v16"/><path d="M16 12H4"/><path d="M9 7l-5 5 5 5"/>',
  // Obstination (Fourmi) : une flèche qui ne va que vers l'avant.
  fourmi:'<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/><path d="M5 21h14"/>',
  // Cuirasse (Preux Chevalier) : un écu.
  'preux-chevalier':'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  // Charge (Éléphant de guerre) : trois traits de vitesse et une pointe.
  'dresseur-elephant':'<path d="M3 8h7"/><path d="M3 12h5"/><path d="M3 16h7"/><path d="M12 5l8 7-8 7z"/>',
  // Retour à l'État Fondamental (Garde de Pierre) : une ancre.
  'garde-pierre':'<circle cx="12" cy="5" r="2.4"/><path d="M12 8v12"/><path d="M7 12h10"/><path d="M4 15a8 8 0 0 0 16 0"/>',
  // Pétrification (Méduse) : un œil.
  meduse:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  // Orage Sanguinaire (Typhon) : l'éclair.
  typhon:'<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  // Hurlement (Banshee) : des ondes.
  banshee:'<path d="M5 9v6"/><path d="M9 6v12"/><path d="M13 8.5v7"/><path d="M17 5.5v13"/><path d="M21 9v6"/>',
  // Foi Inébranlable (Prêtre) : une croix rayonnante.
  pretre:'<path d="M12 3v18"/><path d="M6.5 9h11"/><path d="M4 5.5L5.6 7"/><path d="M20 5.5L18.4 7"/>',
  // Pièce sans pouvoir : le pictogramme du déplacement seul (deux flèches).
  _none:'<path d="M12 4v16"/><path d="M4 12h16"/><path d="M8.5 7.5L12 4l3.5 3.5"/><path d="M8.5 16.5L12 20l3.5-3.5"/>',
};
function powerIconSVG(pieceId){
  return '<svg class="power-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
    (POWER_ICONS[pieceId]||POWER_ICONS._none)+'</svg>';
}

// ----------------------------------------------------------------
// LE POUVOIR, DÉCOUPÉ
// ----------------------------------------------------------------
// Les libellés de `ability` (js/data-pieces.js) sont écrits « Nom : effet ».
// Le nom mérite d'être un titre, pas le début d'une phrase.
function pieceSplitAbility(p){
  if(!p||!p.ability)return null;
  const i=p.ability.indexOf(' : ');
  if(i===-1)return{name:'',text:p.ability};
  return{name:p.ability.slice(0,i),text:p.ability.slice(i+3)};
}

// La carte du pouvoir. Elle a une VRAIE identité visuelle : encadré propre,
// couleur d'accent tirée de la classe de la pièce, icône dédiée, nom du
// pouvoir en titre.
//
// UNE PIÈCE SANS POUVOIR EN A UNE AUSSI. Le Roi, la Dame, l'Amazone, le
// Centaure et les trois Primordiales portent `ability:null` : la fiche
// n'affichait alors RIEN du tout, et on ne pouvait pas savoir si la pièce
// n'avait pas de pouvoir ou si l'interface avait oublié de l'écrire. La
// question se pose exactement pour ces classes-là — Monarques, Généraux,
// Primordiales — d'où une carte explicite plutôt qu'un vide.
function piecePowerHTML(p){
  const ab=pieceSplitAbility(p);
  const accent=CLASS_COLOR_VARS[p.class]||'var(--accent2)';
  if(!ab){
    return '<div class="power-card power-none" style="--pw:var(--muted)">'+
      '<span class="power-icon">'+powerIconSVG('_none')+'</span>'+
      '<div class="power-body">'+
        '<div class="power-name">Aucun pouvoir</div>'+
        '<div class="power-text">Cette pièce ne compte que sur son déplacement : '+
        'elle n\'ajoute aucun effet spécial à la partie.</div>'+
      '</div></div>';
  }
  return '<div class="power-card" style="--pw:'+accent+'">'+
    '<span class="power-icon">'+powerIconSVG(p.id)+'</span>'+
    '<div class="power-body">'+
      (ab.name?'<div class="power-name">'+escH(ab.name)+'</div>':'')+
      '<div class="power-text">'+escH(ab.text)+'</div>'+
    '</div></div>';
}

// ----------------------------------------------------------------
// LA CARTE
// ----------------------------------------------------------------
// opts :
//   locked     true  → la pièce n'est pas débloquée (contenu voilé, cadenas)
//   lockLabel  ce qu'il faut pour l'obtenir (« Coffre », « Bronze (150 ELO) »)
//   selected   true  → déjà engagée dans l'armée en cours
//   actions    false → carte purement décorative (aucun bouton à l'appui)
//
// Le stock n'est affiché que pour les pièces qui se possèdent en exemplaires
// (isOwnablePiece) : écrire « 0 » sous une pièce qui ne se stocke pas serait
// un mensonge.
function pieceCardHTML(p,opts){
  const o=opts||{};
  const ownable=(typeof isOwnablePiece==='function')&&isOwnablePiece(p.id);
  const have=(ownable&&typeof invCount==='function')?invCount(p.id):0;
  const need=(ownable&&typeof pieceDeployCount==='function')?pieceDeployCount(p.id):0;
  const out=ownable&&have<need;
  const cls=['pcard',p.class];
  if(o.locked)cls.push('pcard-locked');
  if(o.selected)cls.push('pcard-sel');
  if(out&&!o.locked)cls.push('pcard-out');
  return '<article class="'+cls.join(' ')+'" data-id="'+p.id+'" tabindex="0" '+
      'role="button" aria-label="'+escH(p.name)+'">'+
    // 1. LOGO
    '<span class="pcard-logo">'+pieceIcon(p.id,'n')+'</span>'+
    // 2. NOM
    '<div class="pcard-name">'+escH(p.name)+'</div>'+
    // 3. VALEUR  ·  4. STOCK
    '<div class="pcard-foot">'+
      '<span class="pcard-val">'+p.value+'</span>'+
      (ownable?'<span class="pcard-stock'+(out?' pcard-stock-out':'')+'">×'+have+'</span>':'')+
    '</div>'+
    (o.locked?'<span class="pcard-lock"><span class="lock-icon"></span>'+
      (o.lockLabel?'<span class="lock-rank">'+escH(o.lockLabel)+'</span>':'')+'</span>':'')+
    // Les deux actions, révélées au premier appui sur la carte. Elles sont
    // posées SOUS la carte et par-dessus ses voisines (position absolue) :
    // la grille ne bouge pas d'un pixel quand on ouvre une carte.
    '<div class="pcard-actions">'+
      (o.locked?''
        :'<button type="button" class="pcard-act pcard-use" data-act="use">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6, 15 12, 9 18"/></svg>'+
          '<span>'+(o.selected?'Retirer':'Utiliser')+'</span></button>')+
      '<button type="button" class="pcard-act pcard-infos" data-act="info">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6, 15 12, 9 18"/></svg>'+
        '<span>Infos</span></button>'+
    '</div>'+
  '</article>';
}

// ----------------------------------------------------------------
// COMPORTEMENT DES CARTES
// ----------------------------------------------------------------
// Une seule carte ouverte à la fois : deux jeux de boutons visibles en même
// temps, sur une grille aussi dense, ne se rattachent plus visuellement à
// leur carte.
//
// onUse(piece) : ce que fait « Utiliser ». Le module ne connaît PAS les
// règles de composition d'armée, il ne fait que transmettre.
function pcardCloseAll(root){
  (root||document).querySelectorAll('.pcard.pcard-open')
    .forEach(el=>el.classList.remove('pcard-open'));
}
function wirePieceCards(root,handlers){
  if(!root)return;
  const h=handlers||{};
  root.querySelectorAll('.pcard').forEach(el=>{
    const p=PIECES.find(x=>x.id===el.dataset.id);
    if(!p)return;
    el.addEventListener('click',e=>{
      const btn=e.target.closest('.pcard-act');
      if(btn){
        e.stopPropagation();
        if(btn.dataset.act==='use'){
          el.classList.remove('pcard-open');
          if(h.onUse)h.onUse(p);
        }else{
          el.classList.remove('pcard-open');
          openPieceSheet(p.id);
        }
        return;
      }
      const wasOpen=el.classList.contains('pcard-open');
      pcardCloseAll(root);
      if(!wasOpen)el.classList.add('pcard-open');
    });
    // Clavier : Entrée/Espace ouvrent la carte comme un appui.
    el.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      e.preventDefault();el.click();
    });
    // L'appui long saute les deux boutons et va droit à la fiche : c'est le
    // geste qu'avait déjà le jeu pour consulter une pièce, on ne le retire pas
    // à ceux qui l'ont appris.
    if(typeof bindLongPress==='function')bindLongPress(el,()=>openPieceSheet(p.id));
    el.addEventListener('contextmenu',e=>{e.preventDefault();openPieceSheet(p.id);});
  });
}
// Un appui à côté referme la carte ouverte.
document.addEventListener('click',e=>{
  if(e.target.closest('.pcard'))return;
  pcardCloseAll();
});

// ----------------------------------------------------------------
// LA FICHE : BOTTOM SHEET
// ----------------------------------------------------------------
// Elle monte du bas de l'écran, à portée de pouce, et se referme au
// glissement vers le bas, au voile, à la croix ou à Échap.
//
// Elle s'ouvre AUSSI pour une pièce verrouillée : savoir ce que fait une
// créature qu'on n'a pas encore est précisément ce qui donne envie de la
// débloquer. C'est même le seul endroit où l'on peut lire le pouvoir des
// Primordiales, de l'Empereur ou du Grand Maître avant de les posséder — la
// carte, elle, reste voilée.
function openPieceSheet(pieceId){
  const p=PIECES.find(x=>x.id===pieceId);
  const sheet=document.getElementById('piece-sheet');
  if(!p||!sheet)return;
  pcardCloseAll();
  const accent=CLASS_COLOR_VARS[p.class]||'var(--accent2)';
  sheet.style.setProperty('--pcls',accent);
  document.getElementById('psheet-logo').innerHTML=pieceIcon(p.id,'n');
  document.getElementById('psheet-name').textContent=p.name;
  const ownable=(typeof isOwnablePiece==='function')&&isOwnablePiece(p.id);
  const have=(ownable&&typeof invCount==='function')?invCount(p.id):0;
  document.getElementById('psheet-meta').innerHTML=
    '<span class="psheet-class">'+escH(p.class)+'</span>'+
    '<span class="psheet-val">'+p.value+' pts</span>'+
    (ownable?'<span class="psheet-stock">×'+have+' en stock</span>':'');
  const mvt=document.getElementById('psheet-mvt');
  const canDraw=typeof pieceMoveDiagramHTML==='function'&&
    (typeof pieceHasMoveDiagram!=='function'||pieceHasMoveDiagram(p.id));
  mvt.innerHTML=canDraw?pieceMoveDiagramHTML(p.id,{legend:true}):
    '<div class="psheet-empty">Déplacement indisponible.</div>';
  document.getElementById('psheet-power').innerHTML=piecePowerHTML(p);
  sheet.classList.add('show');
  sheet.setAttribute('aria-hidden','false');
}
function closePieceSheet(){
  const sheet=document.getElementById('piece-sheet');
  if(!sheet)return;
  sheet.classList.remove('show');
  sheet.setAttribute('aria-hidden','true');
}
document.getElementById('psheet-close')?.addEventListener('click',closePieceSheet);
document.getElementById('psheet-scrim')?.addEventListener('click',closePieceSheet);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const sheet=document.getElementById('piece-sheet');
  if(sheet&&sheet.classList.contains('show')){e.stopPropagation();closePieceSheet();}
},true);

// Glissement vers le bas sur la poignée ou l'en-tête : le geste attendu d'un
// bottom sheet. En dessous de 60 px, la feuille revient en place.
(function(){
  const panel=document.querySelector('#piece-sheet .psheet-panel');
  if(!panel)return;
  let y0=null,dy=0;
  const start=e=>{
    if(e.touches.length!==1)return;
    // On ne capte que la poignée et l'en-tête : le corps de la fiche défile.
    if(!e.target.closest('.psheet-grab,.psheet-head'))return;
    y0=e.touches[0].clientY;dy=0;panel.style.transition='none';
  };
  const move=e=>{
    if(y0===null)return;
    dy=Math.max(0,e.touches[0].clientY-y0);
    panel.style.transform='translateY('+dy+'px)';
  };
  const end=()=>{
    if(y0===null)return;
    panel.style.transition='';panel.style.transform='';
    if(dy>60)closePieceSheet();
    y0=null;dy=0;
  };
  panel.addEventListener('touchstart',start,{passive:true});
  panel.addEventListener('touchmove',move,{passive:true});
  panel.addEventListener('touchend',end);
  panel.addEventListener('touchcancel',end);
})();
