#!/usr/bin/env node
// ================================================================
// OPT-IMAGES.JS : les planches du décor, en WebP, sans casser le CSS
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
//      fx,ranks} ;
//   2. il réécrit les url(...) de css/style.css pour qu'elles pointent sur
//      le .webp.
// Sans la seconde moitié, convertir éteindrait le décor entier en silence.
//
// Les PNG d'origine sont CONSERVÉS : ce sont les fichiers qu'on retouche.
// Ajoutez-les à .gitignore si vous ne voulez pas les verser au dépôt.
//
// Deux dossiers sont laissés de côté : `chests/` (déjà en .webp, sa propre
// procédure est dans assets/chests/README.md) et `adversaires/` (des
// vignettes de 512 px, déjà légères, et leur chemin est construit en JS —
// voir advPortraitPath, js/adversaires.js).
//
//   npm i --no-save sharp && node tools/opt-images.js
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
const DIRS = ['backgrounds', 'banners', 'ui', 'fx', 'ranks'];
const QUALITY = 82;

async function main() {
  const converted = [];

  for (const dir of DIRS) {
    const abs = path.join(ROOT, 'assets', dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs)) {
      if (!file.endsWith('.png')) continue;
      const src = path.join(abs, file);
      const out = src.replace(/\.png$/, '.webp');
      if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
        converted.push('assets/' + dir + '/' + file);
        continue;
      }
      // `alpha` est conservé : le cadre du plateau, les ornements, les
      // socles et les médaillons de rang n'existent que par leur
      // transparence (assets/PROMPTS.md, § « Le fond noir »).
      await sharp(src).webp({ quality: QUALITY, effort: 6 }).toFile(out);
      const gain = fs.statSync(src).size / fs.statSync(out).size;
      console.log('  ' + dir + '/' + file + '  →  .webp  (÷' + gain.toFixed(1) + ')');
      converted.push('assets/' + dir + '/' + file);
    }
  }

  if (!converted.length) {
    console.log('Aucun .png à convertir dans assets/{' + DIRS.join(',') + '}.');
    return;
  }

  // Le CSS ne suit pas tout seul : on ne réécrit QUE les chemins dont le
  // .webp vient d'être produit, et jamais une extension au hasard.
  const cssPath = path.join(ROOT, 'css', 'style.css');
  let css = fs.readFileSync(cssPath, 'utf8');
  let patched = 0;
  for (const rel of converted) {
    const from = "url('../" + rel + "')";
    const to = "url('../" + rel.replace(/\.png$/, '.webp') + "')";
    if (css.includes(from)) {
      css = css.split(from).join(to);
      patched++;
    }
  }
  if (patched) {
    fs.writeFileSync(cssPath, css);
    console.log('\ncss/style.css : ' + patched + ' chemin(s) repointé(s) sur .webp.');
  } else {
    console.log('\ncss/style.css : rien à repointer (déjà fait).');
  }
  console.log(converted.length + ' planche(s) en .webp.');
}

main().catch(e => { console.error(e); process.exit(1); });
