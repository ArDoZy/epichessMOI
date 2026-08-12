// ================================================================
// PIECE-MOVES.JS : le déplacement d'une pièce, en image et non en mots
// ================================================================
// POURQUOI. Une fiche de créature disait « Exactement 2 cases orthogonales
// (sans sauter) OU 1 case diagonale ». Cette phrase est exacte, et elle ne
// sert à rien : il faut la relire trois fois, la traduire mentalement en
// cases, et se tromper quand même. Les phrases de déplacement ont donc
// disparu du jeu (elles ne sont plus dans PIECES) et sont remplacées, partout
// où elles se trouvaient, par CE schéma : la pièce au centre d'un échiquier
// 9×9, et un pictogramme sur chaque case qu'elle peut atteindre.
//
//   patte de chien   elle y va par ses propres moyens, chemin dégagé
//   paire d'ailes    elle y va MÊME si le passage est occupé (elle saute)
//   couteau          elle n'y va QUE pour capturer
//   couteau barré    elle n'y va QUE si elle n'y capture rien
//
// (Les POUVOIRS, eux, restent écrits : « paralyse ses voisines en diagonale »
// ne se dessine pas sur une grille de cases.)
//
// COMMENT. Rien n'est saisi à la main : chaque case est obtenue en
// INTERROGEANT LE MOTEUR (generateMovesRaw, js/rules-engine.js) sur un
// plateau fabriqué pour la question. Le schéma ne peut donc pas mentir ni
// prendre du retard sur les règles — modifier le déplacement d'une créature
// dans le moteur redessine son schéma partout, sans rien toucher ici.
//
//   case atteignable ?      plateau vide, la pièce seule
//   uniquement en mangeant  même question avec un ennemi sur la case visée
//   en volant ?             même question avec les 8 cases voisines occupées
//                           par des pièces AMIES (donc infranchissables et
//                           imprenables) : ce qui passe encore a sauté.
//
// LE 9×9 SUR UN MOTEUR 8×8. Un échiquier 8×8 n'a pas de case centrale, et le
// schéma en veut une (la pièce doit pouvoir aller à 4 cases dans les quatre
// directions). Le moteur, lui, est bordé à 8×8 sans discussion (inB). On ne
// le touche pas : on pose la pièce sur la case du plateau réel qui laisse la
// place voulue DANS LA DIRECTION DEMANDÉE — (4,4) couvre les décalages −4 à
// +3, (3,3) les décalages −3 à +4. Les deux réunis couvrent −4 à +4, c'est
// -à-dire les 81 cases du schéma.
//
// Dépendances : rules-engine.js (generateMovesRaw), data-pieces.js (PIECES),
// piece-art.js (pieceSVG). Chargé APRÈS rules-engine.js.
// Utilisé par : builder.js (cartes de pièces), main.js (fiche d'une pièce),
// tuto-drill.js (exercice de déplacement).
// ================================================================

const PMV_SIZE=9;              // côté du schéma
const PMV_MID=(PMV_SIZE-1)/2;  // la case de la pièce : le centre exact

// État de partie minimal accepté par generateMovesRaw : aucun pouvoir en
// cours, aucune prise en passant. La pièce est seule au monde, comme dans
// l'exercice de déplacement (js/tuto-drill.js).
function pmvGs(){
  return{medusaParalyzed:new Set(),anchored:new Set(),pretreProtected:new Set(),
    grandMaitreAlive:{w:false,b:false},enPassant:null,lastMoveHistory:[]};
}

// Les pièces qui ne sont pas au catalogue : les quatre standard qui
// remplissent le fond de plateau (on peut ouvrir leur fiche en pleine partie)
// et les pions promus. Elles n'ont pas d'entrée dans PIECES, donc pas de
// pieceType : sans cette table, le moteur les prendrait toutes pour des dames.
const PMV_STD_TYPES={'std-pawn':'p','std-r':'r','std-n':'n','std-b':'b',
  'dame-promo':'q','tour-promo':'r','fou-promo':'b','cav-promo':'n'};
function pmvTypeOf(pieceId){
  const def=PIECES.find(p=>p.id===pieceId);
  return def?(def.pieceType||'q'):(PMV_STD_TYPES[pieceId]||null);
}
// Une pièce peut-elle être schématisée ? (Un id inconnu du moteur n'aurait
// aucun déplacement à montrer : mieux vaut ne rien afficher qu'une grille
// vide.)
function pieceHasMoveDiagram(pieceId){return !!pieceId&&!!pmvTypeOf(pieceId);}

// Une pièce posée sur un plateau de test. hasMoved:true n'est pas un détail :
// sans lui, un Monarque proposerait des roques vers des tours absentes, et un
// pion afficherait son bond d'ouverture comme un déplacement ordinaire.
function pmvCell(pieceId,color){
  const def=PIECES.find(p=>p.id===pieceId);
  const type=pmvTypeOf(pieceId)||'q';
  return{type,color,pieceId,emoji:def?.emoji||'',
    hasMoved:true,isKing:(type==='k'),id:'pmv'};
}
// Bouchon : une Tour Primordiale, choisie parce qu'elle n'a aucune immunité
// (la Cuirasse du Preux Chevalier, elle, fausserait le test des pièces qui ne
// peuvent pas le capturer).
function pmvBlocker(color){return pmvCell('tour-primordiale',color);}

function pmvBoard(r0,c0,pieceId,color){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  b[r0][c0]=pmvCell(pieceId,color);
  return b;
}

// La pièce posée en (r0,c0) peut-elle rejoindre (r0+dr, c0+dc) ?
// `setup` habille le plateau avant la question (ennemi sur la case visée,
// voisines bouchées…).
function pmvCanReach(pieceId,color,r0,c0,dr,dc,setup){
  const nr=r0+dr,nc=c0+dc;
  if(nr<0||nr>7||nc<0||nc>7)return false;
  const b=pmvBoard(r0,c0,pieceId,color);
  if(setup)setup(b,r0,c0,nr,nc,color);
  return generateMovesRaw(b,r0,c0,pmvGs()).some(m=>m.r===nr&&m.c===nc);
}

// Les trois habillages de plateau.
function pmvPutEnemy(b,r0,c0,nr,nc,color){b[nr][nc]=pmvBlocker(color==='w'?'b':'w');}
function pmvRing(b,r0,c0,nr,nc,color){
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;
    const r=r0+dr,c=c0+dc;
    if(r<0||r>7||c<0||c>7)continue;
    if(r===nr&&c===nc)continue;   // ne jamais boucher la case dont on parle
    b[r][c]=pmvBlocker(color);
  }
}

// ----------------------------------------------------------------
// D'OÙ L'ON POSE LA QUESTION
// ----------------------------------------------------------------
// Le schéma montre le RÉPERTOIRE d'une créature, pas ce qu'elle peut faire
// depuis une case en particulier. Or certaines créatures ne se déplacent pas
// pareil partout : le Peureux ne sort jamais des quatre rangées de son camp,
// un pion ne fait son bond de deux cases que de sa rangée de départ.
//
// La question était posée d'UNE seule case, la rangée 4 — qui se trouve être,
// pour les Blancs, la ligne de front du camp du Peureux. Son schéma le
// montrait donc incapable d'avancer d'un pas, ce qui est faux partout ailleurs
// dans son camp. On essaie maintenant les rangées dans l'ordre : celle qui a
// toujours servi d'abord (rien ne change pour les créatures dont le
// déplacement ne dépend pas de la case), puis les autres, jusqu'à en trouver
// une d'où la case visée est atteignable.
//
// Les trois questions (peut-elle y aller, seulement pour manger, en volant)
// sont ensuite posées depuis CETTE rangée-là et pas une autre : mélanger deux
// origines produirait un pictogramme qui ne correspond à aucune position.
function pmvRowCandidates(dr){
  const def=(dr===PMV_MID)?PMV_MID-1:PMV_MID;
  const ok=r=>r>=0&&r<=7&&r+dr>=0&&r+dr<=7;
  const out=ok(def)?[def]:[];
  for(let r=0;r<8;r++)if(ok(r)&&r!==def)out.push(r);
  return out;
}

// ----------------------------------------------------------------
// LA CARTE : 9×9 de catégories
// ----------------------------------------------------------------
// Valeurs : null (hors de portée), 'self', 'walk', 'fly', 'kill', 'peace'.
const _pmvCache=new Map();
function pieceMoveMap(pieceId){
  if(_pmvCache.has(pieceId))return _pmvCache.get(pieceId);
  const color='w';   // le haut du schéma est donc le camp adverse
  const grid=[];
  for(let i=0;i<PMV_SIZE;i++){
    const row=[];
    for(let j=0;j<PMV_SIZE;j++){
      const dr=i-PMV_MID,dc=j-PMV_MID;
      if(!dr&&!dc){row.push('self');continue;}
      // Colonne choisie pour que la case visée tienne sur le plateau réel.
      // Aucune créature n'est restreinte en colonne : une seule suffit.
      const c0=(dc===PMV_MID)?PMV_MID-1:PMV_MID;
      let r0=null,canMove=false,canTake=false;
      for(const r of pmvRowCandidates(dr)){
        const m=pmvCanReach(pieceId,color,r,c0,dr,dc,null);
        const t=pmvCanReach(pieceId,color,r,c0,dr,dc,pmvPutEnemy);
        if(m||t){r0=r;canMove=m;canTake=t;break;}
      }
      let cat=null;
      if(r0===null)cat=null;
      else if(!canMove)cat='kill';
      else if(!canTake)cat='peace';
      else if(Math.abs(dr)<=1&&Math.abs(dc)<=1)cat='walk';  // pas de case à survoler
      else cat=pmvCanReach(pieceId,color,r0,c0,dr,dc,pmvRing)?'fly':'walk';
      row.push(cat);
    }
    grid.push(row);
  }
  _pmvCache.set(pieceId,grid);
  return grid;
}

// ----------------------------------------------------------------
// LES PICTOGRAMMES
// ----------------------------------------------------------------
// Dessinés (et non pris dans une police d'emojis) : ils doivent avoir la même
// forme sur tous les systèmes et tenir dans une case de 11 px.
const PMV_ICONS={
  // Patte de chien : quatre coussinets et une pelote. Elle y va à pied.
  walk:'<path d="M6.6 10.4c-1.3 0-2.2-1.4-2.1-2.9.2-1.5 1.2-2.6 2.4-2.4 1.2.2 1.9 1.5 1.7 3-.2 1.4-1 2.3-2 2.3z"/>'+
       '<path d="M11.1 8.7c-1.3 0-2.2-1.5-2.1-3.2.2-1.7 1.2-2.9 2.5-2.8 1.3.1 2.1 1.6 1.9 3.3-.2 1.6-1.1 2.7-2.3 2.7z"/>'+
       '<path d="M16.2 8.7c-1.2 0-2.1-1.1-2.3-2.7-.2-1.7.6-3.2 1.9-3.3 1.3-.1 2.3 1.1 2.5 2.8.1 1.7-.8 3.2-2.1 3.2z"/>'+
       '<path d="M20.4 12.6c-1 0-1.8-.9-2-2.3-.2-1.5.5-2.8 1.7-3 1.2-.2 2.2.9 2.4 2.4.1 1.5-.8 2.9-2.1 2.9z"/>'+
       '<path d="M12 21.6c-2.6 0-5.2-1.1-5.9-3.2-.7-2 .7-3.6 2.3-5 1.2-1 2.1-2.3 3.6-2.3s2.4 1.3 3.6 2.3c1.6 1.4 3 3 2.3 5-.7 2.1-3.3 3.2-5.9 3.2z"/>',
  // Paire d'ailes : elle passe PAR-DESSUS ce qui est sur le chemin.
  fly:'<path d="M11.2 16.2C7.6 16 4 13.9 1.8 9.9.9 8.3.6 6.6.8 5c2.6-.5 5.4.5 7.4 2.3 1.7 1.6 2.8 3.7 3 5.9z"/>'+
      '<path d="M11.2 19.6c-2.7-.2-5.2-1.4-6.9-3.3 1.9-1 4.2-1.2 6.2-.5.4.9.6 2.2.7 3.8z"/>'+
      '<path d="M12.8 16.2c.2-2.2 1.3-4.3 3-5.9C17.8 8.5 20.6 7.5 23.2 8c.2 1.6-.1 3.3-1 4.9-2.2 4-5.8 6.1-9.4 6.3z" transform="translate(0,-2)"/>'+
      '<path d="M12.8 19.6c.1-1.6.3-2.9.7-3.8 2-.7 4.3-.5 6.2.5-1.7 1.9-4.2 3.1-6.9 3.3z"/>',
  // Couteau : elle ne va sur cette case QUE pour manger.
  kill:'<path d="M2.4 15.1 14.6 5.4c.9 1.3 1.3 2.9 1.1 4.5-.2 1.6-1 3-2.2 4L8.6 17.8z"/>'+
       '<rect x="14.6" y="14.6" width="7.4" height="3.4" rx="1.7" transform="rotate(-38 14.6 14.6)"/>',
  // Couteau BARRÉ : elle va sur cette case, mais jamais pour manger. Le trait
  // d'interdiction se lit du premier coup et ne ressemble à aucune aile.
  peace:'<g opacity=".55"><path d="M2.4 15.1 14.6 5.4c.9 1.3 1.3 2.9 1.1 4.5-.2 1.6-1 3-2.2 4L8.6 17.8z"/>'+
        '<rect x="14.6" y="14.6" width="7.4" height="3.4" rx="1.7" transform="rotate(-38 14.6 14.6)"/></g>'+
        '<path class="pmv-bar" d="M3.4 20.6 20.6 3.4" fill="none" stroke-width="3.2" stroke-linecap="round"/>',
};
// La légende ne commente QUE les deux pictogrammes qui disent une RESTRICTION
// (« seulement pour capturer », « seulement sans capturer »). La patte et les
// ailes se comprennent d'elles-mêmes sur le schéma : les légender revenait à
// écrire deux lignes de texte sous chaque carte pour ne rien apprendre.
const PMV_LABELS={
  kill:'y va seulement pour capturer',
  peace:'y va seulement sans capturer',
};
const PMV_LEGEND_CATS=['kill','peace'];

// La couleur du pictogramme est portée par son CONTENEUR (case du schéma ou
// ligne de légende), pas par le tracé : la case peut ainsi se teinter de la
// même couleur, et un seul dessin sert aux deux endroits.
function pmvIcon(cat){
  return '<svg class="pmv-i" viewBox="0 0 24 24" aria-hidden="true">'+PMV_ICONS[cat]+'</svg>';
}

// ----------------------------------------------------------------
// LE SCHÉMA
// ----------------------------------------------------------------
// opts.legend  : ajoute la liste des pictogrammes réellement présents
// opts.cls     : classe supplémentaire (taille : pmv-sm / pmv-lg)
const _pmvHtml=new Map();
function pieceMoveDiagramHTML(pieceId,opts){
  const o=opts||{};
  const key=pieceId+'|'+(o.legend?1:0);
  let html=_pmvHtml.get(key);
  if(html===undefined){
    const grid=pieceMoveMap(pieceId);
    let cells='';
    for(let i=0;i<PMV_SIZE;i++)for(let j=0;j<PMV_SIZE;j++){
      const cat=grid[i][j];
      cells+='<div class="pmv-c '+((i+j)%2?'pmv-dark':'pmv-light')+
        (cat&&cat!=='self'?' pmv-on pmv-'+cat:'')+'">'+
        (cat==='self'?'<span class="pmv-piece">'+pieceSVG(pieceId,'w')+'</span>'
          :(cat?pmvIcon(cat):''))+
      '</div>';
    }
    // Le schéma ne porte plus la mention « ↑ camp adverse » sous la grille.
    // Elle n'apparaissait que sous les pièces au déplacement orienté (Fourmi,
    // Peureux, Méduse…), ajoutait une ligne sous un dessin déjà serré, et
    // n'apprenait rien : le haut d'un échiquier est le camp d'en face, c'est
    // vrai de toutes les cases du jeu.
    html='<div class="pmv"><div class="pmv-grid">'+cells+'</div></div>';
    if(o.legend)html+=pieceMoveLegendHTML(pieceId);
    _pmvHtml.set(key,html);
  }
  return '<div class="pmv-wrap '+(o.cls||'')+'">'+html+'</div>';
}

// Légende : seulement les pictogrammes de RESTRICTION que CE schéma utilise
// (voir PMV_LEGEND_CATS). Une pièce ordinaire n'en montre aucun et n'a donc
// pas de légende du tout.
function pieceMoveLegendHTML(pieceId){
  const grid=pieceMoveMap(pieceId);
  const used=[];
  PMV_LEGEND_CATS.forEach(cat=>{
    if(grid.some(row=>row.includes(cat)))used.push(cat);
  });
  const canMove=grid.some(row=>row.some(cat=>cat&&cat!=='self'));
  if(!canMove)return '<div class="pmv-legend"><span class="pmv-l-txt">Cette pièce ne peut pas se déplacer.</span></div>';
  if(!used.length)return '';
  return '<div class="pmv-legend">'+used.map(cat=>
    '<span class="pmv-l pmv-'+cat+'">'+pmvIcon(cat)+
    '<span class="pmv-l-txt">'+PMV_LABELS[cat]+'</span></span>').join('')+'</div>';
}
