// ================================================================
// COMBAT-FX.JS : LES EFFETS SPÉCIAUX DU PLATEAU
// ================================================================
// Le combat avait le SON (js/sfx.js : couches, enveloppes, ducking), il avait
// la VIBRATION, il avait la SECOUSSE — et à l'écran, une prise n'était qu'un
// dessin qui se ratatine. Tout le travail fait sur l'oreille n'avait pas son
// équivalent sur l'œil : le coup le plus violent d'une partie et le plus
// anodin se ressemblaient.
//
// Ce module est la moitié visuelle de ce geste. Il ne décide RIEN : il est
// appelé par le moteur (js/rules-engine.js) au moment où un coup s'exécute et
// par le rendu (js/game-render.js) quand une pièce est prise en main ou
// qu'elle meurt, et il pose des éléments éphémères sur DEUX COUCHES d'effets.
// Il ne lit pas l'état de la partie, ne le modifie pas, et ne rend rien : on
// peut le retirer du jeu en enlevant sa balise <script>, tout continue de
// marcher, en plus terne.
//
// -- CE QU'IL MET EN SCÈNE -----------------------------------------------
//   · la PRISE EN MAIN : un halo sous la pièce (en CSS, il dure autant que la
//     sélection) et une onde qui éveille les cases jouables ;
//   · le COUP : une traînée du départ vers l'arrivée, teintée de la classe de
//     la pièce — le roque en a deux, une par pièce déplacée ;
//   · la PRISE : noyau, anneaux et éclats, dimensionnés par la valeur de la
//     victime, plus un voile d'écran au-delà d'un certain seuil ;
//   · la MORT d'une pièce, quelle qu'en soit la cause : poussière et motes ;
//   · les POUVOIRS : vortex du Typhon, hurlement de la Banshee, pétrification
//     de la Méduse, charge du Dresseur ;
//   · la PROMOTION : colonne de lumière, cercles runiques, poussière d'or ;
//   · l'ÉCHEC : alarme sur le roi et cerne rouge sur le plateau ;
//   · le MAT : détonation et rais depuis le roi tombé — et sur une victoire,
//     le plateau qui se dissout dans l'or (fxGoldDissolve), qui sert de
//     transition vers la cinématique d'issue.
//
// -- POURQUOI DEUX COUCHES ------------------------------------------------
// Les pièces vivent sur .gc-layer (z-index 2). Un effet doit tomber d'un côté
// ou de l'autre selon ce qu'il raconte :
//   · .fx-under : ce qui est SOUS la pièce — traînées de déplacement,
//     cercles de promotion, vortex du Typhon. Une traînée par-dessus la pièce
//     qui la laisse serait une traînée qui la cache.
//   · .fx-over  : ce qui est DEVANT — éclats de prise, ondes de choc, voiles
//     d'écran. L'impact doit couvrir la meurtrière.
// LA PROFONDEUR EST PORTÉE PAR LES EFFETS, PAS PAR LES COUCHES (z-index 1 et
// 5, posés en CSS sur les enfants) : un `z-index` sur la couche elle-même
// ouvrirait un contexte d'empilement, et le `mix-blend-mode` de tout ce
// qu'elle contient cesserait de se fondre au plateau — le noir des planches
// dessinées y resterait du noir. Le piège est détaillé dans [COMBAT-FX]
// (css/style.css) ; c'est aussi pourquoi le curseur d'intensité enlève des
// étincelles au lieu de les rendre pâles.
// Aucune des deux ne reçoit de clic : tout le hit-testing reste sur les 64
// cases, comme le veut l'en-tête de js/game-render.js.
//
// -- TROIS INTERRUPTEURS --------------------------------------------------
//   1. `prefers-reduced-motion` : plus rien, pas un seul nœud posé. Quelqu'un
//      qui coupe le mouvement n'a pas demandé des étincelles plus discrètes.
//   2. Le curseur « Effets » du panneau de réglages (0 à 1) : il pilote le
//      NOMBRE de particules. À 0, ce module ne fait rien non plus — un
//      téléphone d'entrée de gamme doit pouvoir rendre le plateau sans une
//      seule particule.
//   3. Un PLAFOND de nœuds vivants (FX_MAX_LIVE). Une rafale de prises dans
//      une partie rapide ne doit pas laisser trois cents éléments animés à
//      l'écran : au-delà, les effets suivants sont simplement sautés.
//
// Dépendances : data-pieces.js (PIECES, pour la classe et donc la couleur).
// Aucune autre — et toutes les fonctions sont appelées ailleurs derrière un
// `typeof …==='function'`, pour que l'ordre de chargement n'ait pas d'importance.
// Câblage visuel : [COMBAT-FX] dans css/style.css.
// ================================================================

// Nombre maximum d'effets vivants à un instant donné. Au-delà, on saute :
// mieux vaut un effet manquant qu'un plateau qui rame.
const FX_MAX_LIVE=90;
let _fxLive=0;

// Orientation du plateau, poussée par renderGame (js/game-render.js). Le
// module ne la DEVINE pas : il la reçoit, sinon un joueur des noirs verrait
// ses éclats sur la case symétrique de celle où la prise a eu lieu.
let _fxFlipped=false;
function fxSetFlipped(f){_fxFlipped=!!f;}

// Intensité, 0 à 1. Écrite par le curseur « Effets » (js/settings-admin.js).
// Elle pilote le NOMBRE de particules et la richesse des effets, jamais leur
// opacité : une couche d'effets translucide serait un groupe de composition
// fermé, et le `mix-blend-mode` de tout ce qui s'y trouve cesserait de se
// fondre au bois du plateau (voir [COMBAT-FX] dans css/style.css, où ce piège
// est détaillé). Baisser le curseur ENLÈVE des étincelles ; il ne les rend
// pas pâles.
let _fxLevel=1;
function fxSetLevel(v){
  _fxLevel=Math.max(0,Math.min(1,typeof v==='number'?v:1));
}
function fxGetLevel(){return _fxLevel;}

// L'interrupteur unique. Tout point d'entrée public commence par lui.
function fxOn(){
  if(_fxLevel<=0)return false;
  try{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
  }catch(e){}
  return !!fxBoard();
}

function fxBoard(){return document.getElementById('game-board');}

// Les deux couches, créées à la demande et jamais détruites : elles sont des
// enfants de #game-board au même titre que .gc-layer, et survivent donc aux
// reconstructions de la grille (ensureBoardCells ne vide le plateau que quand
// l'orientation change — voir js/game-render.js).
function fxLayer(which){
  const b=fxBoard();if(!b)return null;
  const cls='fx-layer fx-'+which;
  let el=b.querySelector('.fx-'+which);
  if(!el){
    el=document.createElement('div');
    el.className=cls;
    el.setAttribute('aria-hidden','true');
    b.appendChild(el);
  }
  return el;
}

// Pose un nœud et programme sa disparition. C'est le SEUL chemin par lequel
// un effet entre dans le document : le compteur de nœuds vivants et le
// plafond n'ont de sens que s'il n'y a pas de porte dérobée.
function fxMount(layerName,el,ttl){
  if(_fxLive>=FX_MAX_LIVE)return null;
  const layer=fxLayer(layerName);if(!layer)return null;
  _fxLive++;
  layer.appendChild(el);
  setTimeout(()=>{
    _fxLive--;
    if(el.parentNode)el.parentNode.removeChild(el);
  },ttl);
  return el;
}

// ----------------------------------------------------------------
// GÉOMÉTRIE : DE LA CASE AU POURCENTAGE
// ----------------------------------------------------------------
// Le plateau est carré et les couches d'effets l'épousent : un pourcentage
// de largeur vaut un pourcentage de hauteur. Tout se mesure donc en % de
// plateau, sans une seule valeur en pixels — donc rien à recalculer au
// redimensionnement, exactement comme la couche des pièces.
function fxView(r,c){
  return _fxFlipped?{r:7-r,c:7-c}:{r:r,c:c};
}
// Centre d'une case, en % de plateau.
function fxCenter(r,c){
  const v=fxView(r,c);
  return {x:(v.c+0.5)*12.5,y:(v.r+0.5)*12.5};
}
// Un conteneur de la taille exacte d'une case, posé sur elle.
function fxCellNode(r,c,cls){
  const v=fxView(r,c);
  const el=document.createElement('div');
  el.className='fx-cell '+cls;
  el.style.left=(v.c*12.5)+'%';
  el.style.top=(v.r*12.5)+'%';
  return el;
}

// ----------------------------------------------------------------
// LA COULEUR D'UN EFFET SUIT LA CLASSE DE LA PIÈCE
// ----------------------------------------------------------------
// Les cinq classes ont déjà leur couleur dans la palette, et le joueur les
// connaît : elles teintent les cartes de créature, les emplacements du
// constructeur, les fiches. Une traînée violette dit « un Sorcier vient de
// jouer » sans un mot, et une gerbe orange dit qu'un Général vient de tomber.
// On renvoie le NOM DE LA VARIABLE et non sa valeur : le thème clair
// redéfinit les cinq, et une valeur figée ici ne le suivrait pas.
const FX_CLASS_COLOR={
  'Monarque':'var(--monarque)',
  'Général':'var(--general)',
  'Primordiale':'var(--primordiale)',
  'Sorcier':'var(--sorcier)',
  'Brute':'var(--brute)',
};
function fxPieceColor(pieceId){
  if(typeof PIECES==='undefined'||!pieceId)return 'var(--gold2)';
  const p=PIECES.find(x=>x.id===pieceId);
  return (p&&FX_CLASS_COLOR[p.class])||'var(--gold2)';
}
// La VIOLENCE d'une prise, 0,28 à 1, exactement le chiffre qui pilote déjà le
// son (sfxCaptureForce, js/sfx.js). Les deux doivent parler de la même chose :
// l'oreille et l'œil qui se contredisent, c'est pire que l'un des deux seul.
function fxForce(pieceId){
  if(typeof sfxCaptureForce==='function')return sfxCaptureForce(pieceId);
  return 0.5;
}
// Nombre de particules : proportionnel à la violence ET au curseur.
function fxCount(base,force){
  return Math.max(2,Math.round(base*(0.5+force)*_fxLevel));
}

// ================================================================
// LES EFFETS
// ================================================================

// ----------------------------------------------------------------
// L'IMPACT : ce qu'on voit quand une pièce en prend une autre
// ----------------------------------------------------------------
// Trois couches superposées, et chacune dit autre chose :
//   · le NOYAU, une brûlure blanche au point de contact — l'instant zéro ;
//   · l'ONDE, un anneau qui s'ouvre — la force qui part ;
//   · les ÉCLATS, projetés en étoile — ce qui a été brisé.
// Les trois sont mises à l'échelle par la valeur de la victime : prendre un
// pion fait une étincelle, prendre le Grand Maître fait une déflagration.
function fxImpact(r,c,pieceId){
  if(!fxOn())return;
  const force=fxForce(pieceId);
  const col=fxPieceColor(pieceId);
  const node=fxCellNode(r,c,'fx-impact');
  node.style.setProperty('--fx-c',col);
  node.style.setProperty('--fx-f',force.toFixed(2));

  let html='<span class="fx-core"></span><span class="fx-ring"></span>';
  // Le second anneau ne part qu'au-dessus d'un certain seuil : c'est lui qui
  // fait la différence entre « une prise » et « UNE PRISE ».
  if(force>0.55)html+='<span class="fx-ring fx-ring2"></span>';
  const n=fxCount(9,force);
  for(let i=0;i<n;i++){
    // Étoile régulière, brouillée d'un tiers de pas : un éclatement parfait
    // se lit comme un motif, pas comme une explosion.
    const a=(i/n)*Math.PI*2+(Math.random()-0.5)*(Math.PI/n);
    const d=(34+Math.random()*56)*(0.55+force*0.75);
    html+='<span class="fx-shard" style="'+
      '--dx:'+(Math.cos(a)*d).toFixed(1)+'%;'+
      '--dy:'+(Math.sin(a)*d).toFixed(1)+'%;'+
      '--rot:'+((Math.random()*720-360)|0)+'deg;'+
      '--len:'+(5+Math.random()*6).toFixed(1)+'px;'+
      '--del:'+(Math.random()*70|0)+'ms"></span>';
  }
  node.innerHTML=html;
  fxMount('over',node,760);

  // LA GRANDE PRISE SE VOIT SUR TOUT L'ÉCRAN. Au-delà des trois quarts de
  // l'échelle (un Général, un Monarque), un voile d'ardeur passe sur le
  // plateau entier. C'est le pendant visuel du ducking de la musique : le
  // jeu s'arrête un dixième de seconde sur ce qui vient d'arriver.
  if(force>0.72)fxWash('fx-wash-ember',420);
}

// Le voile d'écran : un aplat qui traverse le plateau et s'éteint.
function fxWash(cls,ttl){
  if(!fxOn())return;
  const el=document.createElement('div');
  el.className='fx-wash '+cls;
  fxMount('over',el,ttl);
}

// ----------------------------------------------------------------
// LA TRAÎNÉE : le chemin parcouru reste une fraction de seconde
// ----------------------------------------------------------------
// Une pièce glissait d'une case à l'autre sans rien laisser : sur un plateau
// de 64 cases, un coup joué à l'autre bout de l'écran passait inaperçu — et
// c'est le problème le plus fréquent d'une partie en ligne, où l'on ne
// regarde pas la main de l'adversaire. La traînée dit D'OÙ ça vient.
//
// Elle est posée SOUS les pièces : par-dessus, elle masquerait celle qui la
// laisse au moment précis où on la regarde.
function fxTrail(from,to,pieceId,heavy){
  if(!fxOn())return;
  const a=fxCenter(from.r,from.c),b=fxCenter(to.r,to.c);
  const dx=b.x-a.x,dy=b.y-a.y;
  const len=Math.sqrt(dx*dx+dy*dy);
  if(len<1)return; // une pièce qui ne bouge pas ne laisse pas de sillage
  const el=document.createElement('div');
  el.className='fx-trail'+(heavy?' fx-trail-heavy':'');
  el.style.left=a.x+'%';
  el.style.top=a.y+'%';
  el.style.width=len+'%';
  el.style.setProperty('--rot',(Math.atan2(dy,dx)*180/Math.PI).toFixed(1)+'deg');
  el.style.setProperty('--fx-c',fxPieceColor(pieceId));
  fxMount('under',el,520);
}

// ----------------------------------------------------------------
// L'AGONIE : la poussière que laisse une pièce qui disparaît
// ----------------------------------------------------------------
// Appelée par syncPieces (js/game-render.js) pour TOUTE pièce qui quitte le
// plateau, et c'est ce qui la rend précieuse : elle couvre la prise ordinaire,
// mais aussi les victimes collatérales du Typhon et tout ce qu'un pouvoir
// futur effacera — sans que ce module ait à connaître un seul pouvoir.
function fxPuff(r,c,pieceId){
  if(!fxOn())return;
  const force=fxForce(pieceId);
  const node=fxCellNode(r,c,'fx-puff');
  node.style.setProperty('--fx-c',fxPieceColor(pieceId));
  let html='<span class="fx-smoke"></span>';
  const n=fxCount(5,force*0.7);
  for(let i=0;i<n;i++){
    const a=-Math.PI/2+(Math.random()-0.5)*2.4;
    const d=18+Math.random()*30;
    html+='<span class="fx-mote-up" style="'+
      '--dx:'+(Math.cos(a)*d).toFixed(1)+'%;'+
      '--dy:'+(Math.sin(a)*d).toFixed(1)+'%;'+
      '--sz:'+(2+Math.random()*3).toFixed(1)+'px;'+
      '--del:'+(Math.random()*140|0)+'ms"></span>';
  }
  node.innerHTML=html;
  fxMount('over',node,900);
}

// ----------------------------------------------------------------
// LES POUVOIRS : une signature par créature
// ----------------------------------------------------------------
// Les pouvoirs du jeu s'appliquaient en silence : le Typhon détruisait quatre
// pièces autour de lui et rien à l'écran ne disait que c'était LUI. Chaque
// pouvoir a maintenant son geste, et c'est le geste qui l'explique — un
// joueur qui n'a jamais lu la fiche du Typhon comprend en une partie.
function fxPower(kind,r,c){
  if(!fxOn())return;
  switch(kind){
    // L'ORAGE SANGUINAIRE : un vortex qui s'ouvre sous la créature et balaie
    // ses quatre diagonales. Les pièces détruites, elles, ont déjà leur
    // bouffée de poussière par la voie normale (fxPuff).
    case 'typhon':{
      const node=fxCellNode(r,c,'fx-vortex');
      node.innerHTML='<span class="fx-swirl"></span><span class="fx-swirl fx-swirl2"></span>';
      fxMount('under',node,900);
      fxShockwave(r,c,'fx-shock-typhon');
      break;
    }
    // LE HURLEMENT : trois ondes concentriques qui partent de la Banshee.
    // C'est un son qu'on dessine — d'où les anneaux nets et non un halo.
    case 'banshee':{
      const node=fxCellNode(r,c,'fx-scream');
      node.innerHTML='<span class="fx-cry"></span><span class="fx-cry fx-cry2"></span><span class="fx-cry fx-cry3"></span>';
      fxMount('over',node,900);
      break;
    }
    // LA PÉTRIFICATION : un éclat froid sur la pièce qui vient d'être changée
    // en pierre. Il ne dure pas : l'état, lui, est déjà porté en permanence
    // par .pc-para (le gris et le halo violet sur la pièce elle-même).
    case 'meduse':{
      const node=fxCellNode(r,c,'fx-petrify');
      node.innerHTML='<span class="fx-stone"></span><span class="fx-crack"></span>';
      fxMount('over',node,720);
      break;
    }
    // LA CHARGE DE L'ÉLÉPHANT : la case écrasée sur son passage.
    case 'charge':{
      const node=fxCellNode(r,c,'fx-crush');
      node.innerHTML='<span class="fx-dustring"></span>';
      fxMount('under',node,620);
      break;
    }
  }
}

// L'onde de choc : le seul effet qui va chercher une planche dessinée
// (assets/fx/onde-choc.webp, fondue en `screen`). Le dégradé radial reste
// dessous et fait tout le travail quand le fichier manque — c'est la règle de
// tout le décor du jeu (voir [ART] dans css/style.css).
function fxShockwave(r,c,extraCls){
  if(!fxOn())return;
  const node=fxCellNode(r,c,'fx-shock '+(extraCls||''));
  fxMount('over',node,760);
}

// ----------------------------------------------------------------
// LA PROMOTION : un pion devient une créature
// ----------------------------------------------------------------
// Le nœud de la pièce SURVIT à la promotion (voir gc-morph, js/game-render.js) :
// il n'y a donc rien à faire disparaître, seulement quelque chose à célébrer.
// Une colonne de lumière tombe sur la case, un cercle runique s'ouvre au sol.
function fxPromote(r,c,pieceId){
  if(!fxOn())return;
  const node=fxCellNode(r,c,'fx-promo');
  node.style.setProperty('--fx-c',fxPieceColor(pieceId));
  node.innerHTML='<span class="fx-pillar"></span><span class="fx-rune"></span><span class="fx-rune fx-rune2"></span>';
  fxMount('under',node,1200);
  fxShockwave(r,c,'fx-shock-gold');
  // La poussière d'or qui monte de la case. Elle emprunte la mote de
  // l'agonie (.fx-mote-up) et rien d'autre : c'est le même mouvement — une
  // chose qui s'échappe vers le haut —, seule la couleur change de camp, du
  // deuil à la fête. Deux animations pour un seul geste ne se justifieraient
  // que si elles se distinguaient à l'œil ; celles-là non.
  const motes=fxCellNode(r,c,'fx-puff fx-promo-motes');
  motes.style.setProperty('--fx-c','var(--gold2)');
  let html='';
  const n=fxCount(9,0.9);
  for(let i=0;i<n;i++){
    const a=-Math.PI/2+(Math.random()-0.5)*2.1;
    const d=26+Math.random()*44;
    html+='<span class="fx-mote-up" style="'+
      '--dx:'+(Math.cos(a)*d).toFixed(1)+'%;'+
      '--dy:'+(Math.sin(a)*d).toFixed(1)+'%;'+
      '--sz:'+(3+Math.random()*4).toFixed(1)+'px;'+
      '--del:'+(Math.random()*420|0)+'ms"></span>';
  }
  motes.innerHTML=html;
  fxMount('over',motes,1400);
}

// ----------------------------------------------------------------
// LA PRISE EN MAIN : le halo sous la pièce et l'éveil des cases
// ----------------------------------------------------------------
// La sélection était une surbrillance de case et une pastille par
// destination, toutes deux permanentes (voir .gc.sel et .gc.avail dans
// css/style.css) : elles disent l'ÉTAT, correctement, mais rien ne disait le
// GESTE — le moment où la main se referme sur la pièce et où le plateau
// répond. Une étincelle par case jouable, une seule fois, en cascade depuis
// la pièce : le plateau s'éveille dans l'ordre où l'œil le parcourt.
//
// Le halo sous la pièce, lui, est en CSS pur ([COMBAT-FX]) : il dure aussi
// longtemps que la sélection, ce qu'un nœud jetable ne saurait pas faire.
function fxSelect(from,cells){
  if(!fxOn()||!cells||!cells.length)return;
  const a=fxCenter(from.r,from.c);
  // Une Dame au centre ouvre vingt-sept destinations : autant d'étincelles
  // simultanées noieraient la lecture du plateau au lieu de l'aider, et
  // mangeraient le plafond de nœuds vivants pour le coup suivant. Les plus
  // proches d'abord — ce sont celles qu'on regarde.
  const sorted=cells.slice().sort((m,n)=>{
    const dm=Math.hypot(m.r-from.r,m.c-from.c),dn=Math.hypot(n.r-from.r,n.c-from.c);
    return dm-dn;
  }).slice(0,Math.max(4,Math.round(14*_fxLevel)));
  for(const m of sorted){
    const b=fxCenter(m.r,m.c);
    const dist=Math.hypot(b.x-a.x,b.y-a.y);
    const node=fxCellNode(m.r,m.c,'fx-wake');
    // Le retard suit la DISTANCE et non le rang dans la liste : l'onde part
    // de la pièce, elle ne parcourt pas un tableau.
    node.style.setProperty('--del',(dist*4.5|0)+'ms');
    node.innerHTML='<span class="fx-wake-ring"></span>';
    fxMount('over',node,900);
  }
}

// Où est le roi de ce camp ? Les deux effets d'alerte (l'échec, le mat) se
// posent sur SA case et pas ailleurs : c'est ce qui les rend lisibles d'un
// coup d'œil au lieu d'être une lumière quelque part sur le plateau. La
// recherche est refaite ici plutôt qu'empruntée au moteur pour que ce module
// reste sans dépendance : soixante-quatre cases parcourues une fois par
// échec, c'est gratuit, et ça évite d'accrocher les effets à une fonction
// interne des règles.
function fxKingCell(board,color){
  if(!board)return null;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r]&&board[r][c];
    if(p&&p.color===color&&(p.type==='k'||p.isKing))return{r:r,c:c};
  }
  return null;
}

// ----------------------------------------------------------------
// L'ÉCHEC : le roi menacé s'embrase
// ----------------------------------------------------------------
// La case du roi porte déjà un liseré permanent (.gc-check) : il dit l'ÉTAT.
// Ce qui manquait, c'est l'ÉVÉNEMENT — le moment où l'échec tombe. Deux
// anneaux d'ardeur sur le roi, et un cerne rouge sur tout le plateau.
function fxCheck(r,c){
  if(!fxOn())return;
  const node=fxCellNode(r,c,'fx-alarm');
  node.innerHTML='<span class="fx-alarm-ring"></span><span class="fx-alarm-ring fx-alarm-ring2"></span>';
  fxMount('over',node,900);
  const v=document.createElement('div');
  v.className='fx-vignette';
  fxMount('over',v,900);
}

// ----------------------------------------------------------------
// L'ISSUE : le mat, sur le plateau, avant toute fenêtre
// ----------------------------------------------------------------
// La cinématique d'issue (js/cinematics.js) arrive quelques instants plus
// tard, avec le verdict et le décompte. Entre le dernier coup et elle, le
// plateau ne disait rien. Il dit maintenant qui vient de tomber : des rais
// partent de la case du roi maté, et le plateau se fige une seconde.
// COMBIEN DE TEMPS LE PLATEAU GARDE LA PAROLE. La cinématique d'issue
// (js/cinematics.js) est un voile plein écran : montée à l'instant du mat,
// elle recouvrirait l'effet avant qu'on en voie une image. economy-ui.js
// (settleAndCelebrate) demande donc ici combien de temps attendre — et la
// réponse n'est PAS une constante : elle ne vaut que si un mat vient
// réellement d'être joué. Une nulle par répétition, un abandon ou une
// pendule à zéro passent par le même chemin sans avoir rien allumé sur le
// plateau, et rien ne doit alors les retarder d'une seconde et demie.
let _fxMateAt=0,_fxMateMs=0;
function fxOutcomeDelay(){
  if(!_fxMateMs)return 0;
  const since=Date.now()-_fxMateAt;
  // Passé un tiers de seconde, ce mat-là n'est plus celui qu'on nous
  // annonce : on ne retarde rien.
  if(since>300)return 0;
  return Math.max(0,_fxMateMs-since);
}

function fxMate(r,c,playerWins){
  if(!fxOn())return;
  // L'ORDRE DES MONTAGES EST L'ORDRE D'EMPILEMENT. Le voile de désaturation
  // ternit CE QUI EST PEINT DERRIÈRE LUI (backdrop-filter) : il doit donc
  // être posé en premier, sinon les rais dorés qu'il est censé faire
  // ressortir passeraient dessous et se terniraient avec le plateau.
  const desat=document.createElement('div');
  desat.className='fx-desat';
  fxMount('over',desat,1200);

  // L'onde de choc autour du roi : le mat est une DÉTONATION, pas une
  // extinction. Elle part avant les rais, qui l'étirent ensuite.
  fxShockwave(r,c,playerWins?'fx-shock-gold':'');

  const node=fxCellNode(r,c,playerWins?'fx-final fx-final-win':'fx-final fx-final-loss');
  let html='<span class="fx-final-core"></span>';
  const n=Math.max(4,Math.round(10*_fxLevel));
  for(let i=0;i<n;i++)html+='<span class="fx-ray" style="--rot:'+((i/n)*360).toFixed(1)+'deg;--del:'+(i*22)+'ms"></span>';
  node.innerHTML=html;
  fxMount('over',node,1600);

  if(playerWins)fxGoldDissolve();
  else fxWash('fx-wash-ash',1100);

  _fxMateAt=Date.now();
  _fxMateMs=playerWins?FX_WIN_MS:FX_LOSS_MS;
}

// ----------------------------------------------------------------
// LA VICTOIRE : le plateau se dissout dans l'or
// ----------------------------------------------------------------
// C'est le seul effet du jeu qui a le droit de FAIRE DISPARAÎTRE ce qu'il
// recouvre, et c'est voulu : il n'arrive qu'une fois par partie gagnée, et
// il sert de transition. Le plateau s'emplit de poussière d'or jusqu'à
// n'être plus qu'un aplat, et c'est sur cet aplat que la cinématique d'issue
// se lève — au lieu de tomber sèchement sur un échiquier encore là.
//
// Les motes sont montées APRÈS le voile : elles doivent rester visibles
// pendant qu'il s'épaissit, sinon la dissolution n'est plus faite de
// particules mais d'un simple fondu au jaune.
const FX_WIN_MS=1500;
const FX_LOSS_MS=1000;
function fxGoldDissolve(){
  if(!fxOn())return;
  const veil=document.createElement('div');
  veil.className='fx-gold-veil';
  fxMount('over',veil,FX_WIN_MS+500);

  const swarm=document.createElement('div');
  swarm.className='fx-gold-swarm';
  // LA MONTÉE EST MESURÉE EN PIXELS, ET C'EST LE SEUL ENDROIT DU MODULE QUI
  // TOUCHE À UNE MESURE. Partout ailleurs la course d'une particule est un
  // pourcentage de sa CASE, et l'astuce est de lui donner la taille de la
  // case pour que le pourcentage tombe juste (voir .fx-shard dans le CSS).
  // Ici la mote traverse le PLATEAU : lui donner la taille du plateau
  // reviendrait à empiler cinquante calques pleine surface, et un pourcentage
  // sur un point de six pixels ne vaut, lui, que deux pixels. On mesure donc
  // le plateau une fois — une victoire par partie, c'est gratuit.
  const b=fxBoard();
  const h=(b&&b.getBoundingClientRect().height)||360;
  let html='';
  const n=Math.max(10,Math.round(46*_fxLevel));
  for(let i=0;i<n;i++){
    // Réparties sur toute la largeur et sur les deux tiers bas : la
    // poussière monte, elle ne pleut pas.
    html+='<span class="fx-gold-mote" style="'+
      'left:'+(Math.random()*100).toFixed(1)+'%;'+
      'top:'+(35+Math.random()*70).toFixed(1)+'%;'+
      '--sz:'+(3+Math.random()*7).toFixed(1)+'px;'+
      '--rise:'+(-(0.35+Math.random()*0.6)*h).toFixed(0)+'px;'+
      '--del:'+(Math.random()*900|0)+'ms"></span>';
  }
  swarm.innerHTML=html;
  fxMount('over',swarm,FX_WIN_MS+500);
}

// ================================================================
// L'ORCHESTRATEUR : un coup, tous ses effets
// ================================================================
// C'EST LE SEUL POINT D'ENTRÉE DU MOTEUR. executeGameMove (js/rules-engine.js)
// appelle cette fonction et rien d'autre : le moteur n'a pas à savoir qu'il
// existe des traînées, des vortex ou des voiles d'écran, et ce fichier n'a pas
// à savoir comment un coup se calcule. `d` décrit ce qui vient de se passer :
//   {from, to, capAt, pieceId, captured, castle, rook:{from,to}, rookPieceId,
//    power:'typhon'|'banshee'|'charge'|null}
// `capAt` est la case de la VICTIME, qui n'est pas toujours celle d'arrivée :
// une prise en passant se joue une rangée derrière.
function fxPlayMove(d){
  if(!fxOn()||!d)return;
  const heavy=!!d.captured||d.power==='charge';
  fxTrail(d.from,d.to,d.pieceId,heavy);
  if(d.rook)fxTrail(d.rook.from,d.rook.to,d.rookPieceId||d.pieceId,false);
  if(d.captured){
    const at=d.capAt||d.to;
    fxImpact(at.r,at.c,d.captured);
  }
  if(d.power)fxPower(d.power,d.to.r,d.to.c);
}
