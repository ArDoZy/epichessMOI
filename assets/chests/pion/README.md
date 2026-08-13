# Coffre Pion — les sept planches de la destruction

Le Coffre Pion ne s'ouvre pas : il se **brise**. Le joueur frappe le pion,
les fissures s'étendent, la pièce éclate, le socle reste vide. Le moteur
d'animation est dans `js/chest-break.js`, le décor dans `css/style.css`
(section `[CHEST-BREAK]`).

## Les fichiers attendus

Sept images, dans **ce dossier**, sous **exactement** ces noms :

| Fichier | Ce qu'elle montre | Comment on y arrive |
|---|---|---|
| `01-intact.webp`    | le pion intact sur son socle          | état de départ |
| `02-fissure.webp`   | une première fissure lumineuse        | 1ʳᵉ frappe |
| `03-fissures.webp`  | un réseau de fissures                 | 2ᵉ frappe |
| `04-brisures.webp`  | la pièce saturée de fissures          | 3ᵉ frappe |
| `05-eclats.webp`    | l'explosion commence, éclats projetés | 4ᵉ frappe |
| `06-explosion.webp` | l'explosion, plein cadre              | enchaîné seul |
| `07-vide.webp`      | le socle seul, la scène vide          | enchaîné seul |

Quatre frappes suffisent donc : la quatrième déclenche l'explosion, qui se
déroule ensuite toute seule jusqu'au socle vide. Pour rendre `05` et `06`
manuelles elles aussi (six frappes), retirer leur `hold` dans la table
`CHEST_BREAK` de `js/chest-break.js`.

## Ce que les images doivent respecter

**Le cadrage doit être IDENTIQUE d'une planche à l'autre.** C'est la seule
contrainte qui compte : les sept images sont empilées et l'animation fait
simplement monter l'opacité de la suivante par-dessus la pile. Si le socle
se décale d'une image à l'autre, la scène glisse à chaque frappe au lieu de
se fissurer. Même cadre, même socle, même lumière — seule la pièce change.

Le reste :

- **Fond noir**, sans bord clair : la scène est découpée en ovale et fondue
  dans le noir du modal. Un fond qui s'éclaircit sur les bords fait
  réapparaître le rectangle.
- **Portrait**, dans les 2:3 (1024 × 1536 convient). Le cadrage à l'écran est
  en 3:4 centré sur `50% 56%` : garder le pion et le socle dans cette zone.
- **Fissures très lumineuses.** Le halo qui respire est une copie floutée de
  l'image fondue en `screen` : il ne fait ressortir que les zones claires.
  Des fissures ternes ne brilleront pas.

## Poids

Sept images chargées au démarrage du jeu : le total compte plus que chacune.
Les planches d'origine étaient en PNG, 1,7 à 2,2 Mo pièce — **12,8 Mo à
télécharger avant qu'un seul coffre puisse s'ouvrir**. Ces images sont
photographiques (dégradés, halo, grain) : le PNG y est le pire format
possible, il code sans perte un bruit que personne ne regarde. En `.webp`
qualité 86, à taille identique, la même séquence pèse **0,74 Mo** — dix-sept
fois moins, sans différence visible sur le marbre ni sur les fissures.

Refaire la conversion après avoir régénéré une planche :

```sh
npm i -D sharp
node -e "const s=require('sharp'),fs=require('fs');
  fs.readdirSync('.').filter(f=>f.endsWith('.png')).forEach(f=>
    s(f).webp({quality:86,effort:6}).toFile(f.replace('.png','.webp')));"
```

Les noms de fichiers vivent dans la table `CHEST_BREAK` de
`js/chest-break.js` : changer d'extension, c'est changer cette table.

## Essayer sans rien copier

`tools/chest-break-preview.html` joue la séquence dans le navigateur, avec le
vrai CSS et le vrai moteur. La page accepte qu'on lui **dépose sept images**
directement : on voit le rendu avant de décider ce qu'on met dans le dépôt.

## Si le dossier est vide

Le jeu fonctionne. `chestBreakReady()` répond non quand les images manquent,
et la cérémonie retombe sur le coffre à couvercle dessiné en CSS, comme pour
les cinq autres coffres.

## Les autres coffres

Cavalier, Fou, Tour, Dame et Roi gardent le couvercle. Leur donner une
séquence, c'est créer `assets/chests/<id>/` et ajouter une entrée dans
`CHEST_BREAK` (`js/chest-break.js`) : le reste du jeu n'a rien à savoir.
