#!/usr/bin/env node
// ================================================================
// OPT-IMAGES.JS : les planches du décor et les créatures, en WebP
// ================================================================
// Un générateur d'images sort du PNG. Ces planches sont photographiques
// (dégradés, halo, grain) : le PNG y est le pire format possible, il code
// sans perte un bruit que personne ne regarde. Un fond d'écran pèse 2 à
// 4 Mo en PNG et 150 Ko en WebP qualité 82, sans différence visible — et
// le jeu en charge une quinzaine.
//
// Le CSS, lui, cite des `.png` : c'est ce que sort le générateur, donc
// déposer le fichier suffit à l'allumer (voir assets/PROMPTS.md). Ce
// script fait le pas d'après, et fait les DEUX moitiés du travail :
//   1. il convertit en .webp tout .png de assets/{backgrounds,banners,ui,
//      fx,ranks,pieces} ;
//   2. il réécrit les url(...) de css/style.css ET les src="..." de
//      index.html pour qu'ils pointent sur le .webp.
// Sans la seconde moitié, convertir éteindrait le décor entier en silence.
//
// index.html est venu s'ajouter avec les sept logos de navigation
// (assets/ui/logo-*), qui sont les seules planches du jeu citées dans le
// BALISAGE et non dans la feuille de style : elles sont en <img>, parce
// qu'une <img> se retire d'elle-même quand le fichier manque (onerror) et
// laisse le pictogramme SVG dessiné en dessous. Ne repointer que le CSS les
// aurait laissées sur des .png convertis, donc absentes.
//
// -- LES CRÉATURES SONT UN CAS À PART, DEUX FOIS ------------------------
// `assets/pieces/` est arrivé avec les dix-neuf illustrations de cartes, et
// il ne se traite comme aucun autre dossier :
//
//   · ON LES REDIMENSIONNE. Les autres planches sont posées en fond d'écran
//     et servent leur pleine taille ; une carte de créature, elle, ne
//     dépasse JAMAIS 150 px de large (`.cards-grid .piece-card`,
//     css/style.css) et tombe à 76 px sur un téléphone, quatre par rangée.
//     Verser une planche de 1024×1536 dans ce cadre, c'est faire télécharger
//     dix-neuf fois sept cent mille pixels dont le navigateur en jette 95 %.
//     On les ramène donc à 640×960 (voir PIECE_W/PIECE_H) : de quoi rester
//     net sur l'emplacement d'armée le plus grand d'un écran à 3× de densité,
//     et rien de plus.
//   · IL N'Y A RIEN À REPOINTER. Leur chemin n'est écrit ni dans le CSS ni
//     dans index.html : il est CONSTRUIT en JavaScript (pieceCardArtHTML,
//     js/piece-card.js), qui demande le `.webp` en premier et retombe tout
//     seul sur le `.png` puis sur le SVG monochrome. Convertir suffit donc,
//     et ne rien convertir marche aussi — c'est simplement plus lourd.
//
// Les PNG d'origine sont CONSERVÉS sur le disque : ce sont les fichiers
// qu'on retouche. Ceux des créatures sont ignorés par git
// (voir .gitignore) : c'est le .webp qu'on verse au dépôt, comme pour les
// cinquante-huit autres planches du jeu.
//
// Deux dossiers sont laissés de côté : `chests/` (déjà en .webp, sa propre
// procédure est dans assets/chests/README.md) et `adversaires/` (des
// vignettes de 512 px, déjà légères, et leur chemin est construit en JS —
// voir advPortraitPath, js/adversaires.js).
//
//   npm i --no-save sharp && node tools/opt-images.js
//   (ou : npm run opt:images)
//
// Relancer le script est sans effet sur ce qui est déjà converti : un .png
// dont le .webp existe et est plus récent est ignoré.
// ================================================================

const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch (e) {
  console.error('sharp est introuvable. Installez-le d\'abord :\n  npm i --no-save sharp');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const QUALITY = 82;

// La taille d'arrivée d'une illustration de créature. Elle se déduit de la
// taille D'AFFICHAGE, jamais de la taille de sortie du générateur :
//   · la plus grande carte du jeu est un emplacement d'armée de première
//     rangée, une demi-largeur d'une colonne plafonnée à 560 px, soit
//     environ 270 px de large ;
//   · sur un écran à 2× cela demande 540 px de pixels réels, et 640 laisse
//     la marge du cadrage `object-fit:cover`.
// Le rapport 2/3 est celui de la carte : on ne le recalcule pas, on le pose,
// et `fit:'cover'` recadre au centre la planche qui ne l'aurait pas.
const PIECE_W = 640, PIECE_H = 960;

// Chaque dossier a sa recette. `resize` absent : on garde la taille d'origine.
// `rewrite:false` : le chemin n'est écrit ni dans le CSS ni dans index.html,
// il n'y a donc rien à repointer après la conversion.
const RECIPES = {
  backgrounds: { quality: QUALITY, rewrite: true },
  banners:     { quality: QUALITY, rewrite: true },
  ui:          { quality: QUALITY, rewrite: true },
  fx:          { quality: QUALITY, rewrite: true },
  // LES MÉDAILLONS DE RANG SONT RAMENÉS À 288 PX. Ils étaient convertis à la
  // taille du générateur (1254 px, ~400 Ko pièce, 2,3 Mo les six) alors
  // qu'ils ne s'affichent jamais au-delà de 88 px (.ja-medal) : 288 couvre un
  // écran à 3× de densité. `contain` sur fond transparent : ils n'existent que
  // par leur détourage.
  ranks:       { quality: 88, rewrite: true,
                 resize: { width: 288, height: 288, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } },
  // Les planches des cartes de variantes (assets/PROMPTS.md, § 8) : posées
  // à droite de la carte, jamais plus hautes que 200 px à l'écran.
  variantes:   { quality: QUALITY, rewrite: true,
                 resize: { width: 768, height: 512, fit: 'cover', position: 'centre' } },
  // Les paysages de la Diagonale (§ 3 ter) : leur chemin est construit en JS
  // (voie.js), qui demande le .webp — rien à repointer, convertir suffit.
  voie:        { quality: QUALITY, rewrite: false,
                 resize: { width: 1024, height: 1024, fit: 'cover', position: 'centre' } },
  pieces:      { quality: 80, rewrite: false,
                 resize: { width: PIECE_W, height: PIECE_H, fit: 'cover', position: 'centre' } },
};

async function main() {
  const converted = [];   // ce qui est passé en .webp, tous dossiers confondus
  const rewritable = [];  // le sous-ensemble dont un chemin est écrit en dur

  for (const [dir, recipe] of Object.entries(RECIPES)) {
    const abs = path.join(ROOT, 'assets', dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs)) {
      if (!file.endsWith('.png')) continue;
      const src = path.join(abs, file);
      const out = src.replace(/\.png$/, '.webp');
      const rel = 'assets/' + dir + '/' + file;
      if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
        converted.push(rel);
        if (recipe.rewrite) rewritable.push(rel);
        continue;
      }
      // `alpha` est conservé : le cadre du plateau, les ornements, les
      // socles et les médaillons de rang n'existent que par leur
      // transparence (assets/PROMPTS.md, § « Le fond noir »). Les créatures,
      // elles, sont peintes sur un fond plein — leur canal alpha est plat et
      // ne coûte rien.
      let img = sharp(src);
      if (recipe.resize) img = img.resize(recipe.resize);
      await img.webp({ quality: recipe.quality, effort: 6 }).toFile(out);
      const gain = fs.statSync(src).size / fs.statSync(out).size;
      const ko = Math.round(fs.statSync(out).size / 1024);
      console.log('  ' + dir + '/' + file + '  →  .webp  (÷' + gain.toFixed(1) + ', ' + ko + ' Ko)');
      converted.push(rel);
      if (recipe.rewrite) rewritable.push(rel);
    }
  }

  if (!converted.length) {
    console.log('Aucun .png à convertir dans assets/{' + Object.keys(RECIPES).join(',') + '}.');
    return;
  }

  // Ni le CSS ni le balisage ne suivent tout seuls : on ne réécrit QUE les
  // chemins dont le .webp vient d'être produit, et jamais une extension au
  // hasard. Le CSS cite `url('../assets/…')`, index.html cite
  // `src="assets/…"` — deux formes, une seule liste. Les créatures n'y sont
  // pas : leur chemin est construit en JavaScript, qui demande déjà le .webp.
  if (rewritable.length) {
    const targets = [
      { file: path.join(ROOT, 'css', 'style.css'),
        label: 'css/style.css',
        form: rel => "url('../" + rel + "')" },
      { file: path.join(ROOT, 'index.html'),
        label: 'index.html',
        form: rel => 'src="' + rel + '"' },
    ];
    for (const t of targets) {
      if (!fs.existsSync(t.file)) continue;
      let text = fs.readFileSync(t.file, 'utf8');
      let patched = 0;
      for (const rel of rewritable) {
        const from = t.form(rel);
        const to = t.form(rel.replace(/\.png$/, '.webp'));
        if (text.includes(from)) {
          text = text.split(from).join(to);
          patched++;
        }
      }
      if (patched) {
        fs.writeFileSync(t.file, text);
        console.log('\n' + t.label + ' : ' + patched + ' chemin(s) repointé(s) sur .webp.');
      } else {
        console.log('\n' + t.label + ' : rien à repointer (déjà fait).');
      }
    }
  }

  const pieces = converted.filter(rel => rel.startsWith('assets/pieces/')).length;
  console.log(converted.length + ' planche(s) en .webp' +
    (pieces ? ', dont ' + pieces + ' créature(s) ramenée(s) à ' + PIECE_W + '×' + PIECE_H : '') + '.');
  if (pieces) {
    console.log('Les créatures s\'allument toutes seules : js/piece-card.js demande le .webp.\n' +
      'Pensez à monter CACHE_VERSION dans sw.js — les images sont servies par le cache d\'abord.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
