// ================================================================
// CHEST-BREAK.JS : le coffre qu'on BRISE au lieu de l'ouvrir
// ================================================================
// Un coffre à couvercle s'ouvre d'un clic : le joueur regarde. Un coffre qui
// se fissure sous les coups DEMANDE quelque chose — quatre frappes, et à
// chaque frappe la pièce tient un peu moins. C'est la même récompense au
// bout, mais elle a été arrachée.
//
// La séquence n'est pas une vidéo : ce sont huit images fixes empilées, que
// l'on fait apparaître l'une par-dessus l'autre. Tout le mouvement est
// ajouté PAR-DESSUS, en CSS :
//
//   secousse    l'impact déplace et grossit brièvement la scène
//   flash       une gerbe de lumière au point de fracture
//   halo        une copie floutée de l'image, en fusion « screen », qui
//               respire : seules les fissures (les zones claires) brillent,
//               le fond noir n'ajoute rien. Le halo bat de plus en plus vite
//               à mesure que la pièce se fend
//   tremblement à partir de la troisième fissure, la pièce vibre en continu
//               entre deux frappes : elle annonce qu'elle va lâcher
//   éclats      des étincelles projetées depuis le centre
//   teinte      la couleur du rang. Les planches sont rendues en lumière
//               chaude et le navigateur fait tourner cette teinte : blanche
//               pour le Pion, jaune pour le Cavalier, orange pour le Fou,
//               rouge pour la Tour, violette et bleue pour les deux autres.
//               La rotation ne prend QUE la lumière : le marbre, lui, reste
//               du marbre. Aucune image n'est doublée
//               (voir CHEST_BREAK_GLOW et CHEST_BREAK_MARBLE)
//
// Pourquoi empiler les images plutôt que les remplacer : chaque image
// contient tout ce qu'avait la précédente PLUS des fissures en trop. Comme
// elles sont opaques et cadrées à l'identique, il suffit de faire monter
// l'opacité de la nouvelle par-dessus la pile. Les fissures ont alors l'air
// de POUSSER, là où un remplacement les ferait clignoter — et il n'y a jamais
// de creux sombre au milieu du fondu, contrairement à un vrai fondu croisé.
//
// Le Pion, le Cavalier, le Fou et la Tour sont équipés. Les deux autres
// gardent le couvercle dessiné en CSS (voir .chest dans css/style.css) : la cérémonie
// choisit toute seule, selon que le coffre a une séquence d'images
// utilisable ou non (chestBreakReady).
//
// Dépendances : rules-engine.js (playTone, facultatif — le son se tait tout
// seul s'il n'est pas là). Chargé AVANT economy-ui.js, qui s'en sert.
// ================================================================

// ----------------------------------------------------------------
// LES SÉQUENCES
// ----------------------------------------------------------------
// Une étape = une image + la manière d'y arriver. Ajouter un palier de
// fissures, c'est ajouter une image et une ligne ici, rien d'autre : ni le
// moteur ci-dessous ni la cérémonie ne comptent les étapes à l'avance.
//
//   src     nom du fichier, dans `dir`
//   hint    la phrase sous le titre pendant cette étape
//   fade    durée (ms) de la montée en opacité de l'image
//   shake   amplitude (px) de la secousse d'impact
//   snd     {n,f} : la recette de bruitage à jouer et sa force, 0 à 1
//           (voir SFX_RECIPES dans js/sfx.js — `choc` pour une frappe,
//           `blast` pour la déflagration finale)
//   zoom    grossissement au moment de l'impact
//   flash   opacité maximale de la gerbe de lumière (0 = aucune)
//   fdur    durée (ms) de cette gerbe
//   bloom   [repos, sommet] : opacité du halo qui respire
//   bt      période de cette respiration — elle raccourcit, la pièce panique
//   trem    amplitude (px) du tremblement continu entre deux frappes
//   sparks  nombre d'étincelles projetées
//   burst   durée (ms) de la rampe d'échelle de l'ÉCLATEMENT : la planche
//           naît petite au centre (.35) et s'ouvre jusqu'à remplir sa boîte
//   blast   l'image DÉFERLE : elle grandit et sa luminosité s'emballe
//   bsdur   durée (ms) de la rampe d'échelle du déferlement. Elle repart
//           AU-DESSUS de l'arrivée de `burst` et ne fait plus que monter :
//           c'est ce qui interdit à l'explosion de rétrécir d'une planche à
//           l'autre. À ne pas confondre avec `bldur`, qui est le temps de la
//           montée de LUMIÈRE, réglé, lui, contre le voile blanc
//   xfade   fondu croisé (ms) : les planches du dessous s'effacent pendant
//           que celle-ci monte, au lieu de rester allumées derrière
//   white   voile blanc plein écran, en ms : c'est lui qui fait le flash
//   full    la scène quitte sa boîte et prend l'écran. 'bleed' : elle déborde
//           de partout, sans découpe (l'explosion). 'boxed' : elle garde le
//           format de l'image et se centre, découpe comprise (le socle vide)
//   solo    n'affiche QUE cette image : les précédentes sont éteintes
//   snd     fréquences (Hz) empilées pour le bruit de fracture
//   hush    le titre et la phrase s'effacent : la pièce a lâché, plus rien
//           autour de la scène n'a de raison de rester à l'écran
//   hold    si présent, l'étape suivante s'enchaîne SEULE après ce délai (ms)
//   end     dernière étape : la cérémonie reprend la main (les lots)
//   dir     dossier de CETTE image, quand il n'est pas celui du coffre :
//           c'est ce qui permet aux trois dernières planches d'être
//           communes à tous les coffres (voir plus bas)
//
// Les étapes SANS `hold` attendent une frappe. Ici : 01→04 se frappent
// (quatre coups), puis 05 déclenche l'explosion, qui se déroule toute seule
// jusqu'à la scène vide. Pour rendre l'explosion manuelle elle aussi, il
// suffit de retirer les `hold` des étapes 05, 06 et 07.
//
// ----------------------------------------------------------------
// CINQ PLANCHES PAR PIÈCE, TROIS POUR TOUT LE MONDE
// ----------------------------------------------------------------
// Une pièce n'est reconnaissable que tant qu'elle tient debout : le pion se
// fissure en pion, le cavalier en cavalier. Passé l'éclatement, il ne reste
// que du feu et des éclats de marbre — plus rien qui dise de quelle pièce
// ils viennent. Ces trois planches-là (l'explosion, sa suite plein cadre, le
// socle vide) sont donc dessinées UNE FOIS, dans assets/chests/forall/, et
// partagées par tous les coffres. Équiper une nouvelle pièce ne demande plus
// que cinq images.
//
// Chaque coffre reçoit sa PROPRE copie des trois étapes communes
// (chestBreakTail construit des objets neufs) : le réglage du Fou pourra
// diverger de celui du Pion sans que l'un déforme l'autre, et le banc
// d'essai (tools/chest-break-preview.html) peut réécrire les `src` d'une
// séquence sans toucher aux autres.
const CHEST_BREAK_FORALL='assets/chests/forall/';

// LA FIN EST UN SEUL GESTE, et ses temps s'emboîtent au millième :
// 05 ne tient que 190 ms, juste de quoi voir la pièce partir en morceaux ;
// 06 la fait éclater au-dessus de son socle, encore dans la boîte, le temps
// d'un battement ; 07 déferle alors sur tout l'écran en montant en
// luminosité, pendant qu'un voile blanc monte par-dessus — au sommet du
// voile, l'écran est entièrement lumineux et ne montre plus rien ; c'est
// SOUS ce voile, à couvert, que l'explosion s'éteint et que le socle vide
// prend sa place. Le voile redescend, la luminosité revient à la normale, et
// le socle est là. Le flash ne cache pas une transition ratée : il EST la
// transition.
function chestBreakTail(){
  return [
    // L'ÉCLATEMENT. La pièce part en morceaux mais le socle est encore là,
    // et la scène tient encore dans son ovale : c'est le dernier plan où
    // l'on voit d'où vient l'explosion. Il ne dure qu'un battement.
    //
    // `burst` EST LA MOITIÉ MANQUANTE DE L'EXPLOSION. Cette planche arrivait
    // à sa taille définitive d'un seul coup : sa seule variation d'échelle
    // était le `zoom` de la secousse, qui RETOMBE à 1 par construction — le
    // souffle finissait donc plus petit qu'au sommet de l'impact, et la
    // planche suivante repartait d'ailleurs. Elle s'ouvre maintenant de .35
    // à 1 en 220 ms : les morceaux sont propulsés vers l'extérieur, et le
    // déferlement qui suit reprend au-dessus de 1, jamais en dessous.
    {src:'06-explosion.webp', hint:'', fade:90, dir:CHEST_BREAK_FORALL, hush:true,
     shake:22, zoom:1.13, flash:.86, fdur:300, bloom:[.30,.72], bt:'.7s',
     sparks:44, sparkR:1.6, trem:2.2, burst:220, xfade:90, hold:260,
     snd:{n:'blast',f:.7}},

    // L'EXPLOSION. Elle sort de sa boîte : plein écran, en `cover` — une
    // déflagration n'a pas de composition à préserver, on peut la rogner
    // n'importe comment. La secousse est retirée ici, elle ne ferait que
    // découvrir du noir sur les bords ; c'est le grossissement et la
    // luminosité qui portent le coup.
    //
    // ELLE DOIT SE REGARDER. Première version : le voile blanc montait dès
    // la première image, et la planche d'explosion était mangée par le
    // flash avant d'avoir été vue — on payait une image pour ne jamais
    // l'afficher. La montée de lumière (`bldur`) prend donc son temps et ne
    // rejoint le voile blanc qu'à la toute fin.
    //
    // DEUX TEMPS, DEUX RAMPES. `bsdur` est le temps de la GÉOMÉTRIE : le
    // souffle repart de 1.10 — au-dessus du 1 où l'éclatement s'est arrêté —
    // et décélère jusqu'à 1.75 en un demi-battement. `bldur` est le temps de
    // la LUMIÈRE, deux fois plus long, calé sur le voile blanc. Les
    // confondre était l'origine du défaut : une seule durée forçait la
    // géométrie à s'étirer sur le temps de la lumière, et le raccord entre
    // les deux planches ne pouvait plus se faire au bon endroit.
    //
    // `xfade` efface la pile du dessous pendant que celle-ci monte. Elle
    // couvre tout l'écran et rien ne se lit à travers, mais les planches
    // laissées allumées derrière ressortiraient à la moindre baisse
    // d'opacité — et la fin de la rampe en est une.
    {src:'07-explosion-suite.webp', hint:'', fade:60, dir:CHEST_BREAK_FORALL, hush:true,
     full:'bleed', blast:true, bsdur:520, bldur:1150, xfade:60,
     white:1500, flash:.9, fdur:520,
     sparks:54, sparkR:3.2, hold:1050,
     snd:{n:'blast',f:1}},

    // LE SOCLE VIDE. En `boxed` : ici le cadrage compte, le socle doit
    // rester entier sur un téléphone comme sur un écran large. `solo`
    // éteint les sept images du dessous — sans quoi l'explosion continuerait
    // de brûler derrière, à travers l'ovale de découpe.
    {src:'08-vide.webp', hint:'', fade:380, dir:CHEST_BREAK_FORALL,
     full:'boxed', solo:true, trem:0, hold:620, end:true},
  ];
}

// Les cinq planches propres à une pièce. Le rythme est le même d'un coffre à
// l'autre — c'est la même destruction, seule la statuette change — donc une
// seule fabrique, à qui l'on donne le dossier et le nom de la pièce (celui
// qui apparaît dans la première phrase, « Frappez le cavalier… »).
function chestBreakSeq(dir,piece){
  return {
    dir:dir,
    stages:[
      // « Frappez la tour pour LA briser » : l'accord suit le nom donné, sans
      // quoi la Tour et la Dame parleraient au masculin.
      {src:'01-intact.webp',   hint:'Frappez '+piece+' pour '+(/^la /.test(piece)?'la':'le')+' briser', fade:260},

      {src:'02-fissure.webp',  hint:'Encore',            fade:210, shake:7,  zoom:1.045,
       flash:.42, fdur:280, bloom:[.10,.26], bt:'3.2s', sparks:8,  snd:{n:'choc',f:.42}},

      {src:'03-fissures.webp', hint:'Encore',            fade:190, shake:10, zoom:1.06,
       flash:.55, fdur:300, bloom:[.16,.40], bt:'2.3s', sparks:14, trem:.4, snd:{n:'choc',f:.62}},

      {src:'04-brisures.webp', hint:'Il ne tient plus…', fade:170, shake:14, zoom:1.075,
       flash:.68, fdur:320, bloom:[.24,.62], bt:'1.4s', sparks:22, trem:1,  snd:{n:'choc',f:.82}},

      // À partir d'ici la pièce ne tient plus : plus une seule frappe à
      // donner, la destruction s'enchaîne d'elle-même jusqu'au socle vide.
      // LE NOM DU COFFRE S'EN VA ICI, et non trois planches plus loin. Il
      // ne s'effaçait qu'à l'explosion plein écran (`pb-full`) : entre les
      // deux, l'éclatement se jouait avec « Coffre Pion » toujours écrit
      // par-dessus. Or la pièce ne tient plus dès cette planche-ci — il n'y
      // a plus de coffre à nommer, il n'y a qu'une destruction à regarder.
      {src:'05-eclats.webp',   hint:'',                  fade:120, shake:20, zoom:1.11,
       flash:.80, fdur:300, bloom:[.35,.80], bt:'.9s',  sparks:34, trem:1.8,
       hush:true, hold:190, snd:{n:'choc',f:1}},
    ].concat(chestBreakTail()),
    // Format des planches (largeur/hauteur). Il donne à la scène `boxed` les
    // proportions exactes de l'image, pour que l'ovale de découpe tombe
    // pile sur ses bords.
    ratio:2/3,
  };
}

// Un coffre n'entre ici QUE quand ses cinq planches sont dans le dépôt : la
// ligne est ce qui donne au Magasin le droit d'afficher sa statuette
// (chestBreakPoster, plus bas), et une ligne posée d'avance montrerait une
// image cassée en attendant les images. Les deux autres attendent donc,
// prêtes à décommenter — leur COULEUR, elle, est déjà réglée
// (CHEST_BREAK_GLOW) : le jour où assets/chests/dame/ est rempli, la ligne
// suffit, le violet de la Dame vient avec.
const CHEST_BREAK={
  pion:    chestBreakSeq('assets/chests/pion/',    'le pion'),
  cavalier:chestBreakSeq('assets/chests/cavalier/','le cavalier'),
  fou:     chestBreakSeq('assets/chests/fou/',     'le fou'),
  tour:    chestBreakSeq('assets/chests/tour/',    'la tour'),
  // dame: chestBreakSeq('assets/chests/dame/',    'la dame'),
  // roi:  chestBreakSeq('assets/chests/roi/',     'le roi'),
};

function chestBreakFor(chestId){
  return (chestId&&CHEST_BREAK[chestId])||null;
}

// ----------------------------------------------------------------
// LA COULEUR DE LA LUMIÈRE — UNE TEINTE PAR COFFRE, SANS UNE IMAGE DE PLUS
// ----------------------------------------------------------------
// Chaque rang a sa couleur : le Pion est blanc, le Cavalier jaune, le Fou
// orange, la Tour rouge, la Dame violette, le Roi bleu. On la voit à deux
// endroits, et ce sont les deux qui coûtent cher à redessiner : la lumière
// qui sort des fissures, et l'explosion.
//
// LES PLANCHES NE SONT PAS REDESSINÉES POUR AUTANT. Elles sont rendues une
// fois, en lumière chaude — un or à ~35° de teinte, mesuré sur les images —
// et c'est le NAVIGATEUR qui fait tourner cette teinte vers la couleur du
// rang, avec `hue-rotate()` sur l'image affichée.
//
// MAIS ON NE PEUT PAS FAIRE TOURNER TOUTE L'IMAGE. hue-rotate laisse les
// gris exactement où ils sont et ne déplace que ce qui est coloré : sur un
// marbre parfaitement neutre, elle ne toucherait que la lumière. Le marbre
// de ces planches N'EST PAS neutre — il est éclairé chaud, et sa saturation
// mesurée monte de 0,11 (pièce intacte) à 0,33 (pièce saturée de fissures),
// c'est-à-dire la saturation de la lumière elle-même. Faire tourner l'image
// entière de −45° pour la Tour ne rougissait donc pas que les fissures :
// elle repeignait la statuette en rose.
//
// D'où la CLÉ. La rotation est appliquée deux fois — une image chaude, une
// image gardée telle quelle — et les deux sont recousues pixel par pixel
// selon une seule question : ce pixel est-il de la LUMIÈRE (chaud, R
// nettement au-dessus de B) ou de la PIERRE (R ≈ B) ? La lumière prend la
// couleur du rang, la pierre reste du marbre. C'est un filtre SVG (six
// primitives, voir pbTintFilterHTML) parce que CSS ne sait pas mélanger
// deux versions d'une même image selon son contenu.
//
// R − B est la bonne mesure ici, et pas une mesure de saturation générale,
// parce que les planches ne contiennent qu'une seule couleur : de l'or. Le
// marbre intact reste sous 0,14 ; les fissures et le feu dépassent 0,30 —
// deux populations séparées, la rampe (CHEST_BREAK_MARBLE) passe entre.
//
// Le même réglage sert aux trois planches communes (l'explosion) : c'est le
// même feu doré qui tourne, et l'explosion du Roi est donc bleue sans qu'on
// ait eu à dessiner six explosions. La clé y gagne même les éclats de
// marbre projetés, qui restent de la pierre blanche au milieu du feu.
//
//   rot  rotation de teinte (deg). 0 = les planches telles qu'elles sont
//        rendues, c'est-à-dire l'orange : le Fou n'en demande presque pas.
//   sat  saturation APRÈS rotation. Une grande rotation délave (la matrice
//        n'est qu'une approximation), on rattrape ici.
//   lum  luminosité AVANT rotation. Les planches d'explosion sont
//        surexposées — du blanc à 98 % de valeur — et un blanc ne prend
//        aucune teinte : les assombrir d'un cheveu les fait redescendre
//        du plafond, où la couleur peut enfin se poser. 1 = intact.
//   h    teinte (deg) de ce qui est DESSINÉ en CSS par-dessus les planches :
//        la gerbe de lumière, les étincelles, le voile blanc du flash.
//   hs   saturation de ces mêmes dessins. 0 % = du blanc pur (le Pion).
//
// Les valeurs ont été calées en simulant les primitives de filtre CSS sur
// les vraies planches, teinte cible par teinte cible ; elles se retouchent
// à vue dans tools/chest-break-preview.html, qui a un sélecteur de couleur.
const CHEST_BREAK_GLOW={
  pion:    {rot:0,    sat:0.12, lum:1.00, h:42,  hs:'0%'},   // blanc
  cavalier:{rot:19,   sat:1.35, lum:1.00, h:48,  hs:'92%'},  // jaune
  fou:     {rot:-7,   sat:1.30, lum:1.00, h:30,  hs:'95%'},  // orange
  tour:    {rot:-45,  sat:1.85, lum:0.93, h:4,   hs:'92%'},  // rouge
  dame:    {rot:-128, sat:1.80, lum:0.90, h:285, hs:'85%'},  // violet
  roi:     {rot:172,  sat:1.70, lum:0.90, h:205, hs:'92%'},  // bleu
};

// La teinte neutre : les planches telles qu'elles sont rendues. C'est ce que
// reçoit un coffre absent de la table — mieux vaut la lumière d'origine
// qu'une scène qui refuse de s'afficher.
const CHEST_BREAK_GLOW0={rot:0,sat:1,lum:1,h:42,hs:'88%'};

// LE MARBRE — ce qui échappe à la couleur du rang.
//
//   sat  saturation de la pierre, une fois la lumière retirée. Les planches
//        sortent de l'atelier avec un marbre crème ; 0,70 le ramène au
//        blanc cassé qu'on attend d'une statuette, sans le vider en gris.
//   k,i  la rampe de la clé : clé = k·(R − B) + i, bornée à [0,1]. Ici la
//        pierre (R − B ≤ 0,14) donne 0 — pas un soupçon de teinte — et la
//        lumière (≥ 0,34) donne 1. Entre les deux, la clé fond : c'est ce
//        dégradé qui fait que la lueur DÉBORDE des fissures sur le marbre
//        voisin, au lieu de s'arrêter net sur un liseré.
const CHEST_BREAK_MARBLE={sat:0.70,k:5,i:-0.70};

function chestBreakGlow(chestId){
  return CHEST_BREAK_GLOW[chestId]||CHEST_BREAK_GLOW0;
}

// ----------------------------------------------------------------
// LE FILTRE QUI SÉPARE LA LUMIÈRE DE LA PIERRE
// ----------------------------------------------------------------
// Six primitives, et aucune ne rééchantillonne l'image — que des matrices
// de couleur et deux compositions, gratuites sur un GPU :
//
//   1-2  l'image CHAUDE : teinte tournée vers la couleur du rang, puis
//        resaturée (les deux réglages de CHEST_BREAK_GLOW).
//   3    l'image FROIDE : la même, gardée telle quelle, à peine dessaturée
//        pour que le marbre lise blanc.
//   4    LA CLÉ : une matrice qui jette les couleurs et ne garde, dans le
//        canal alpha, que k·(R − B) + i — la chaleur du pixel. Opaque sur
//        les fissures et le feu, transparente sur la pierre.
//   5-6  l'image chaude est découpée par la clé (`in`), et ce qui reste est
//        posé sur l'image froide (`over`). Le résultat est exactement le
//        fondu chaud/froid pixel à pixel, la clé servant d'opacité.
//
// Deux filtres identiques au lieu d'un : le halo (.pb-bloom) est plus
// saturé que l'image (×1.15), et un filtre SVG ne sait pas lire une
// variable CSS — il faut donc un exemplaire par réglage.
const PB_TINT='pbTint',PB_TINT_B='pbTintBloom';

function pbKeyMatrix(){
  const m=CHEST_BREAK_MARBLE;
  // Trois lignes vides (le résultat n'a pas de couleur, juste une opacité),
  // puis la ligne alpha : k·R + 0·G − k·B + 0·A + i.
  return '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 '+m.k+' 0 '+(-m.k)+' 0 '+m.i;
}

function pbTintFilterHTML(id){
  return '<filter id="'+id+'" color-interpolation-filters="sRGB">'+
    '<feColorMatrix data-pb="rot" type="hueRotate" values="0" result="pbRot"/>'+
    '<feColorMatrix data-pb="sat" type="saturate" values="1" in="pbRot" result="pbHot"/>'+
    '<feColorMatrix type="saturate" values="'+CHEST_BREAK_MARBLE.sat+'" in="SourceGraphic" result="pbCold"/>'+
    '<feColorMatrix type="matrix" in="SourceGraphic" result="pbKey" values="'+pbKeyMatrix()+'"/>'+
    '<feComposite in="pbHot" in2="pbKey" operator="in" result="pbLit"/>'+
    '<feComposite in="pbLit" in2="pbCold" operator="over"/>'+
  '</filter>';
}

// Les deux filtres vivent dans un SVG de taille nulle, posé une fois en fin
// de page. Rend null tant qu'il n'y a pas de <body> : l'appelant retombe
// alors sur le repli écrit dans la CSS (rotation globale), et la scène
// s'affiche quand même — un `filter:url()` qui ne pointe sur rien
// EFFACERAIT l'élément.
function pbDefs(){
  let svg=document.getElementById('pb-defs');
  if(svg)return svg;
  if(!document.body)return null;
  svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('id','pb-defs');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  svg.setAttribute('width','0');
  svg.setAttribute('height','0');
  svg.setAttribute('style','position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.innerHTML=pbTintFilterHTML(PB_TINT)+pbTintFilterHTML(PB_TINT_B);
  document.body.appendChild(svg);
  return svg;
}

function pbTintTune(svg,id,rot,sat){
  const f=svg.querySelector('#'+id);
  if(!f)return false;
  const r=f.querySelector('[data-pb="rot"]'),s=f.querySelector('[data-pb="sat"]');
  if(!r||!s)return false;
  r.setAttribute('values',rot);
  s.setAttribute('values',sat);
  return true;
}

// Pose les variables sur la scène et accorde les deux filtres. Tout le reste
// est en CSS : les images et le halo lisent lum et --pb-tint, la gerbe, les
// étincelles et le voile lisent h/hs. Repeindre en cours de séquence est
// donc gratuit — le banc d'essai s'en sert pour comparer deux couleurs sans
// rejouer.
function chestBreakPaint(host,chestId){
  if(!host)return;
  const g=chestBreakGlow(chestId);
  host.style.setProperty('--pb-rot',g.rot+'deg');
  host.style.setProperty('--pb-sat',g.sat);
  host.style.setProperty('--pb-lum',g.lum);
  host.style.setProperty('--pb-h',g.h);
  host.style.setProperty('--pb-hs',g.hs);

  // Le filtre n'est branché QUE s'il est bien en place : --pb-tint absente,
  // la CSS garde son repli (la rotation globale d'autrefois, marbre teinté
  // compris) plutôt que de faire disparaître la scène.
  const svg=pbDefs();
  if(!svg)return;
  if(pbTintTune(svg,PB_TINT,g.rot,g.sat))
    host.style.setProperty('--pb-tint','url(#'+PB_TINT+')');
  if(pbTintTune(svg,PB_TINT_B,g.rot,+(g.sat*1.15).toFixed(3)))
    host.style.setProperty('--pb-tint-b','url(#'+PB_TINT_B+')');
}

function pbSrc(cfg,i){
  const st=cfg.stages[i],s=st.src;
  // Une source absolue (data:, blob:, http…) court-circuite le dossier : la
  // page de réglage tools/chest-break-preview.html injecte ainsi les images
  // que l'on vient de déposer, sans rien copier dans le dépôt.
  if(/^(data:|blob:|https?:|\/)/.test(s))return s;
  // `dir` d'étape avant `dir` de coffre : les trois dernières planches sont
  // communes à tous les coffres et vivent ailleurs (CHEST_BREAK_FORALL).
  return (st.dir||cfg.dir)+s;
}

// ----------------------------------------------------------------
// CHARGEMENT DES IMAGES
// ----------------------------------------------------------------
// Une planche d'explosion qui arrive en retard, c'est un écran noir au pire
// moment. On charge donc tout dès le démarrage, en tâche de fond, et la
// cérémonie ne propose la séquence que si la PREMIÈRE image est là : les
// suivantes ont tout le temps d'arriver, il y a une frappe humaine entre
// chacune.
const _pbLoad={};
function pbLoad(src){
  let e=_pbLoad[src];
  if(e)return e;
  e=_pbLoad[src]={ok:false,fail:false,waiting:[]};
  const img=new Image();
  img.decoding='async';
  const settle=ok=>{
    e[ok?'ok':'fail']=true;
    e.waiting.splice(0).forEach(fn=>fn(ok));
  };
  img.onload=()=>settle(true);
  img.onerror=()=>settle(false);
  img.src=src;
  e.img=img;
  return e;
}

// Attend qu'une image soit disponible, mais JAMAIS plus de `wait` ms : sur un
// réseau lent, mieux vaut enchaîner sur une image encore absente — l'image du
// dessous, opaque, reste affichée en attendant — que de figer la cérémonie
// sur une frappe qui n'a rien donné.
function pbWhenReady(src,cb,wait){
  const e=pbLoad(src);
  if(e.ok||e.fail)return cb(e.ok);
  let done=false;
  const fire=ok=>{if(done)return;done=true;cb(ok);};
  e.waiting.push(fire);
  setTimeout(()=>fire(e.ok),wait||1400);
}

// La PREMIÈRE image sert de sonde : si elle manque, le dossier n'a pas été
// rempli et les quatre autres manquent aussi. Inutile d'aller chercher quatre
// 404 de plus — la cérémonie retombera de toute façon sur le couvercle.
function chestBreakPreload(){
  Object.keys(CHEST_BREAK).forEach(id=>{
    const cfg=CHEST_BREAK[id];
    pbWhenReady(pbSrc(cfg,0),ok=>{
      if(ok)cfg.stages.forEach((s,i)=>i&&pbLoad(pbSrc(cfg,i)));
    },20000);
  });
}

// La séquence est-elle utilisable MAINTENANT ? Non si le coffre n'en a pas,
// non si les images ne sont pas dans le dépôt (404) : dans les deux cas la
// cérémonie retombe sur le coffre à couvercle, et le jeu reste jouable même
// si le dossier assets/chests/ est vide.
// L'AFFICHE d'un coffre : sa première planche, la statuette intacte. C'est
// ELLE qui représente le coffre partout dans le jeu — série du jour, colonne
// des victoires, Magasin, cartes du mode test (chestVisual, js/economy-ui.js).
// Rend '' pour un coffre sans séquence (la Dame et le Roi, dont les planches
// n'existent pas encore) : l'appelant retombe alors sur le coffre à couvercle
// dessiné en CSS.
function chestBreakPoster(chestId){
  const cfg=chestBreakFor(chestId);
  return cfg?pbSrc(cfg,0):'';
}

function chestBreakReady(chestId){
  const cfg=chestBreakFor(chestId);
  if(!cfg)return false;
  return pbLoad(pbSrc(cfg,0)).ok===true;
}

// Le jeu doit rester agréable quand le système demande moins d'animation :
// on garde les fondus et la lumière, on retire tout ce qui bouge.
function pbCalm(){
  return window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
}
// LE HALO EST LE SEUL ÉLÉMENT DE LA CÉRÉMONIE QU'ON PEUT S'OFFRIR OU NON.
// C'est une copie FLOUTÉE de l'image courante, plein écran, fondue en
// « screen » : à elle seule, elle coûte plus cher que tout le reste de la
// scène réunie, et sur un téléphone modeste c'est elle qui fait tomber
// l'ouverture de coffre à dix images par seconde. L'interrupteur « Effets »
// des réglages (js/settings-admin.js) la commande donc, comme il commande les
// effets de combat : c'est la même question posée par le même joueur — « mon
// téléphone n'y arrive pas ». Tout le reste de la cérémonie est intact.
function pbBloomOn(){
  if(pbCalm())return false;
  return (typeof fxGetLevel!=='function')||fxGetLevel()>0;
}

// Relance une animation CSS déjà jouée : retirer la classe ne suffit pas, le
// navigateur regroupe les deux changements dans la même image. Lire une
// propriété de disposition force la césure entre les deux.
function pbRestart(el,cls){
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ----------------------------------------------------------------
// LE SON DE LA FRACTURE
// ----------------------------------------------------------------
// IL ÉTAIT FABRIQUÉ ICI, ET C'ÉTAIT L'ERREUR. Chaque étape portait une liste
// de fréquences, et cette fonction en empilait les notes en dents de scie
// avec playTone : un grésillement métallique, sans attaque ni corps, qu'on
// se prenait quatre fois de suite en brisant un coffre. Le jeu a pourtant un
// moteur de bruitages complet — couches, enveloppes, bruit filtré, variation,
// ducking de la musique, haptique (js/sfx.js) —, et le coffre était le seul
// endroit à ne pas s'en servir.
//
// Deux recettes lui ont été ajoutées, `choc` et `blast`, et il ne reste ici
// que le guichet. Une étape ne décrit donc plus des fréquences mais une
// INTENTION : quel son, et avec quelle force — celle-ci ouvre le filtre,
// monte le volume et raidit la vibration, exactement comme pour une prise sur
// le plateau.
function pbSound(snd){
  if(!snd||typeof playSound!=='function')return;
  playSound(snd.n,{force:snd.f||0.6});
}

// ----------------------------------------------------------------
// LE MOTEUR
// ----------------------------------------------------------------
// chestBreakMount installe la scène et rend une télécommande :
//   next()   passe à l'étape suivante (une frappe)
//   busy()   une étape est en cours : la frappe suivante est ignorée, sinon
//            un joueur qui martèle traverserait toute la séquence sans rien
//            voir
//   destroy() vide la scène à la fermeture de la cérémonie
// onDone est appelé une fois le socle vide : la cérémonie reprend alors la
// main et révèle les lots.
function chestBreakMount(chestId,onDone){
  const cfg=chestBreakFor(chestId);
  const host=document.getElementById('chest-break');
  if(!cfg||!host)return null;

  const calm=pbCalm();
  host.innerHTML=
    '<div class="pb-shake"><div class="pb-trem"><div class="pb-scene">'+
      cfg.stages.map((s,i)=>'<img class="pb-frame" alt="" draggable="false" src="'+pbSrc(cfg,i)+'">').join('')+
      (pbBloomOn()?'<div class="pb-bloom"></div>':'')+
    '</div></div></div>'+
    '<div class="pb-flash"></div><div class="pb-sparks"></div>'+
    '<div class="pb-white"></div>';
  host.className='pbreak';
  // La couleur du rang, posée avant la première image : les fissures du
  // Cavalier ne doivent pas s'allumer en orange pour redevenir jaunes à la
  // frappe suivante.
  chestBreakPaint(host,chestId);
  host.hidden=false;

  const shake=host.querySelector('.pb-shake'),
        trem =host.querySelector('.pb-trem'),
        scene=host.querySelector('.pb-scene'),
        bloom=host.querySelector('.pb-bloom'),
        flash=host.querySelector('.pb-flash'),
        white=host.querySelector('.pb-white'),
        sparkBox=host.querySelector('.pb-sparks'),
        frames=[].slice.call(host.querySelectorAll('.pb-frame'));

  const ctl={i:-1,_busy:true,_timer:null,_dead:false};
  ctl.busy=()=>ctl._busy;

  // Mode `boxed` : la scène reprend le format de l'image, aussi grande que
  // l'écran le permet, et se centre. CSS seul n'y arrive pas — `aspect-ratio`
  // avec une hauteur imposée ET une largeur plafonnée casse le rapport dans
  // un sens ou dans l'autre selon l'écran. Deux lignes de calcul le font
  // exactement, et le rendez-vous avec l'ovale de découpe est garanti.
  function fitBox(){
    if(!host.classList.contains('pb-boxed'))return;
    const ar=cfg.ratio||2/3,vw=innerWidth,vh=innerHeight;
    let w=vh*ar,h=vh;
    if(w>vw){w=vw;h=vw/ar;}
    scene.style.width=w+'px';
    scene.style.height=h+'px';
  }
  window.addEventListener('resize',fitBox);

  // Les étincelles sont créées à la volée puis se retirent elles-mêmes : une
  // explosion en projette une cinquantaine, les garder dans le document
  // alourdirait la scène pour rien.
  function sparks(n,radius){
    if(calm||!n)return;
    for(let k=0;k<n;k++){
      const a=Math.random()*Math.PI*2,
            d=(40+Math.random()*150)*(radius||1),
            sp=document.createElement('span');
      sp.className='pb-spark';
      sp.style.setProperty('--dx',(Math.cos(a)*d).toFixed(1)+'px');
      sp.style.setProperty('--dy',(Math.sin(a)*d).toFixed(1)+'px');
      sp.style.setProperty('--s',(2+Math.random()*4).toFixed(1)+'px');
      sp.style.setProperty('--d',(420+Math.random()*520).toFixed(0)+'ms');
      sp.addEventListener('animationend',()=>sp.remove());
      sparkBox.appendChild(sp);
    }
  }

  function go(i){
    if(ctl._dead)return;
    const st=cfg.stages[i];
    if(!st)return;
    ctl.i=i;ctl._busy=true;

    pbWhenReady(pbSrc(cfg,i),()=>{
      if(ctl._dead)return;

      // LE TITRE ET LA PHRASE S'EFFACENT dès que la pièce a lâché — et non
      // au passage en plein écran, deux planches plus loin, où le nom du
      // coffre se lisait encore par-dessus les premiers éclats. Ils
      // reviennent d'eux-mêmes sur le socle vide, qui ne porte pas `hush` :
      // c'est là qu'ils annoncent les lots.
      host.classList.toggle('pb-hush',!!st.hush);

      // LA SCÈNE QUITTE SA BOÎTE. À l'explosion, l'ovale et les 320 px de
      // large sautent : l'image passe en position fixe sur tout l'écran. Les
      // deux textes sont déjà partis (`hush` ci-dessus), donc le passage hors
      // flux ne fait sauter aucun texte.
      if(st.full){
        host.classList.add('pb-full');
        host.classList.toggle('pb-bleed',st.full==='bleed');
        host.classList.toggle('pb-boxed',st.full==='boxed');
        fitBox();
      }

      // L'image monte par-dessus la pile ; celles du dessous restent en
      // place, cachées derrière, et rien ne clignote. Sauf `solo` : la
      // dernière image est seule en scène, on éteint tout le reste.
      //
      // ET ON L'ÉTEINT D'UN COUP, SANS FONDU. Chaque planche garde le
      // `--pb-fade` de SON étape, et ces durées ne sont pas les mêmes : la
      // pièce intacte s'était installée en 260 ms, les planches d'explosion
      // en 70 et 90. Retirer `on` à toutes en même temps les faisait donc
      // disparaître dans le DÉSORDRE — les explosions du dessus s'effaçaient
      // les premières et découvraient, pendant deux ou trois images, la
      // statuette intacte du dessous. Le coffre se reconstituait juste après
      // avoir explosé. On remet la durée à zéro avant de les couper : la pile
      // s'éteint en une seule image, à couvert sous le voile blanc, et il ne
      // reste que le socle vide qui monte.
      //
      // `xfade` EST L'AUTRE FAÇON D'ÉTEINDRE LA PILE, celle de l'explosion :
      // la même coupe, mais étalée sur quelques images pendant que la
      // planche du dessus monte — un fondu croisé. Ce que la planche du
      // dessus fait apparaître, celle du dessous le libère au même rythme.
      //
      // Dans les deux cas on retire AUSSI les classes d'échelle : elles se
      // figent sur leur dernière image (`forwards`), et une opacité figée
      // par une animation l'emporte sur celle qu'on vient de remettre à
      // zéro — la planche resterait à l'écran par-dessus la suivante.
      const f=frames[i],cut=st.solo?0:(st.xfade||0);
      if(st.solo||st.xfade)frames.forEach(o=>{
        if(o===f)return;
        o.style.setProperty('--pb-fade',cut+'ms');
        o.classList.remove('on','pb-burst','pb-blast');
      });
      f.style.setProperty('--pb-fade',(st.fade||240)+'ms');
      f.classList.add('on');

      // LES DEUX RAMPES D'ÉCHELLE DE L'EXPLOSION. Elles sont portées par la
      // PLANCHE, pas par la scène : c'est ce qui permet à la seconde de
      // repartir exactement là où la première s'arrête, et à toute la
      // séquence d'être monotone croissante — le souffle ne rétrécit jamais.
      // Voir pbBurstIn / pbBlastIn dans css/style.css.
      f.classList.remove('pb-burst','pb-blast');
      if(bloom)bloom.classList.remove('pb-burst');
      if(st.burst){
        host.style.setProperty('--pb-burstdur',st.burst+'ms');
        pbRestart(f,'pb-burst');
        // Le halo est une copie de la planche : il s'ouvre avec elle, sans
        // quoi il resterait grandeur nature autour d'un éclatement encore
        // minuscule.
        if(bloom)pbRestart(bloom,'pb-burst');
      }
      if(st.blast){
        host.style.setProperty('--pb-blastdur',(st.bsdur||520)+'ms');
        pbRestart(f,'pb-blast');
      }

      // L'EMBALLEMENT LUMINEUX. `blast` monte la luminosité de la scène
      // jusqu'à la brûlure, sur son propre temps (`bldur`, calé sur le voile
      // blanc, et non sur la rampe d'échelle ci-dessus) ; le voile monte
      // par-dessus et finit le travail. Retirer la classe à l'étape suivante
      // rend sa luminosité normale à la scène — sous le voile, donc
      // invisiblement.
      scene.classList.toggle('blast',!!st.blast);
      if(st.blast){
        host.style.setProperty('--pb-bldur',(st.bldur||440)+'ms');
        pbRestart(scene,'blast');
      }
      if(st.white){
        host.style.setProperty('--pb-wdur',st.white+'ms');
        pbRestart(white,'go');
      }

      // Le halo suit l'image affichée : même cadrage, mais flouté et fondu
      // en « screen », donc seules les fissures brillent.
      if(bloom){
        bloom.style.backgroundImage='url("'+pbSrc(cfg,i)+'")';
        const b=st.bloom||[0,0];
        host.style.setProperty('--pb-b0',b[0]);
        host.style.setProperty('--pb-b1',b[1]);
      }
      host.style.setProperty('--pb-bt',st.bt||'2.6s');

      // Le tremblement continu s'installe et ne repart plus tant que la
      // pièce est là : fendue jusqu'au cœur, elle ne redevient pas calme
      // entre deux coups. `trem:0` l'arrête — le socle vide, lui, ne vibre
      // pas : il n'y a plus rien dessus pour trembler.
      if(st.trem===0)trem.classList.remove('live');
      else if(st.trem&&!calm){
        trem.style.setProperty('--pb-trem',st.trem+'px');
        trem.classList.add('live');
      }

      if(!calm&&st.shake){
        host.style.setProperty('--pb-amp',st.shake+'px');
        host.style.setProperty('--pb-zoom',st.zoom||1.05);
        pbRestart(shake,'go');
      }
      if(st.flash){
        host.style.setProperty('--pb-fmax',calm?Math.min(st.flash,.45):st.flash);
        host.style.setProperty('--pb-fdur',(st.fdur||300)+'ms');
        flash.classList.toggle('big',!!st.blast);
        pbRestart(flash,'go');
      }
      sparks(st.sparks,st.sparkR);
      pbSound(st.snd);

      const hint=document.getElementById('chest-hint');
      if(hint&&st.hint!==undefined)hint.textContent=st.hint;

      // Une étape à `hold` enchaîne seule sur la suivante ; sans `hold`, la
      // main revient au joueur dès que l'impact est retombé.
      if(st.end){
        host.classList.add('pb-done');
        ctl._timer=setTimeout(()=>{ctl._busy=false;if(onDone)onDone();},st.hold||400);
      }else if(st.hold!==undefined){
        ctl._timer=setTimeout(()=>go(i+1),st.hold);
      }else{
        ctl._timer=setTimeout(()=>{ctl._busy=false;},Math.max(160,(st.fdur||0)*.55));
      }
    });
  }

  ctl.next=function(){
    if(ctl._busy||ctl._dead)return;
    if(ctl.i+1<cfg.stages.length)go(ctl.i+1);
  };
  ctl.destroy=function(){
    ctl._dead=true;
    clearTimeout(ctl._timer);
    window.removeEventListener('resize',fitBox);
    host.hidden=true;
    host.innerHTML='';
    host.className='pbreak';
  };

  // La première image s'installe sans impact : c'est l'état de départ, la
  // pièce intacte, pas encore un coup reçu.
  go(0);
  ctl._timer=setTimeout(()=>{ctl._busy=false;},120);
  return ctl;
}

// Le chargement démarre avec le jeu, à l'écart du premier rendu : au moment
// où un coffre équipé tombe, ses huit planches sont dans le cache depuis
// longtemps — et les trois planches communes n'ont été téléchargées qu'une
// fois pour tous les coffres, pbLoad les mettant en cache par URL.
(function(){
  const start=()=>window.requestIdleCallback
    ?requestIdleCallback(chestBreakPreload,{timeout:2000})
    :setTimeout(chestBreakPreload,600);
  if(document.readyState==='complete')start();
  else window.addEventListener('load',start);
})();
