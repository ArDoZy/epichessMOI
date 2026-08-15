# Les coffres qu'on brise — les planches de la destruction

Certains coffres ne s'ouvrent pas : ils se **brisent**. Le joueur frappe la
pièce, les fissures s'étendent, la statuette éclate, le socle reste vide. Le
moteur d'animation est dans `js/chest-break.js`, le décor dans `css/style.css`
(section `[CHEST-BREAK]`).

Deux coffres sont équipés : le **Pion** et le **Cavalier**. Les quatre autres
gardent le couvercle dessiné en CSS.

## Cinq planches par pièce, trois pour tout le monde

Une pièce n'est reconnaissable que tant qu'elle tient debout. Passé
l'éclatement, il ne reste que du feu et des éclats de marbre — plus rien qui
dise de quelle pièce ils viennent. Les trois dernières planches sont donc
dessinées **une fois** et partagées par tous les coffres.

`assets/chests/<pièce>/` — les cinq planches propres à la pièce :

| Fichier | Ce qu'elle montre | Comment on y arrive |
|---|---|---|
| `01-intact.webp`   | la pièce intacte sur son socle          | état de départ |
| `02-fissure.webp`  | une première fissure lumineuse          | 1ʳᵉ frappe |
| `03-fissures.webp` | un réseau de fissures                   | 2ᵉ frappe |
| `04-brisures.webp` | la pièce saturée de fissures            | 3ᵉ frappe |
| `05-eclats.webp`   | la pièce se rompt, éclats projetés      | 4ᵉ frappe |

`assets/chests/forall/` — les trois planches communes :

| Fichier | Ce qu'elle montre | Comment on y arrive |
|---|---|---|
| `06-explosion.webp`       | l'éclatement au-dessus du socle  | enchaînée seule |
| `07-explosion-suite.webp` | l'explosion, plein cadre         | enchaînée seule |
| `08-vide.webp`            | le socle seul, la scène vide     | enchaînée seule |

Quatre frappes suffisent donc : la quatrième déclenche l'explosion, qui se
déroule ensuite toute seule jusqu'au socle vide. Pour rendre `05`, `06` et `07`
manuelles elles aussi, retirer leur `hold` dans `js/chest-break.js`
(`chestBreakSeq` et `chestBreakTail`).

## Équiper une nouvelle pièce

1. Produire les cinq planches, sous exactement ces noms, dans
   `assets/chests/<id>/` — l'`id` est celui de `CHESTS` (`js/data-pieces.js`) :
   `fou`, `tour`, `dame`, `roi`.
2. Ajouter une ligne à `CHEST_BREAK`, en tête de `js/chest-break.js` :

   ```js
   fou: chestBreakSeq('assets/chests/fou/', 'le fou'),
   ```

   (le second argument est le nom qui apparaît dans « Frappez le fou pour le
   briser »)

Le reste du jeu n'a rien à savoir : les trois planches communes s'ajoutent
d'elles-mêmes, la cérémonie choisit la séquence au lieu du couvercle, et le
Magasin montre la statuette de la pièce à la place du coffre dessiné — il se
décide sur l'existence d'une séquence, pas sur une liste de noms.

## Ce que les images doivent respecter

**Le cadrage doit être IDENTIQUE d'une planche à l'autre**, y compris entre
les cinq de la pièce et les trois communes. C'est la seule contrainte qui
compte : les planches sont empilées et l'animation fait simplement monter
l'opacité de la suivante par-dessus la pile. Si le socle se décale d'une image
à l'autre, la scène glisse à chaque frappe au lieu de se fissurer. Même cadre,
même socle, même lumière — seule la pièce change.

Le reste :

- **Fond noir**, sans bord clair : la scène est découpée en ovale et fondue
  dans le noir du modal. Un fond qui s'éclaircit sur les bords fait
  réapparaître le rectangle.
- **Portrait**, dans les 2:3 (1024 × 1536 exactement, comme les planches déjà
  en place). Le cadrage à l'écran est en 3:4 centré sur `50% 56%` : garder la
  pièce et le socle dans cette zone.
- **Fissures très lumineuses.** Le halo qui respire est une copie floutée de
  l'image fondue en `screen` : il ne fait ressortir que les zones claires.
  Des fissures ternes ne brilleront pas.

## Poids

Les planches sont chargées au démarrage du jeu : le total compte plus que
chacune. Les images d'origine sont en PNG, 1,7 à 2,4 Mo pièce — **plus de
12 Mo par coffre à télécharger avant qu'un seul puisse s'ouvrir**. Ces images
sont photographiques (dégradés, halo, grain) : le PNG y est le pire format
possible, il code sans perte un bruit que personne ne regarde. En `.webp`
qualité 86, à taille identique, la même séquence pèse **environ 0,55 Mo** —
dix-sept fois moins, sans différence visible sur le marbre ni sur les
fissures. Les trois planches communes ne sont téléchargées **qu'une fois pour
tous les coffres**, `pbLoad` les mettant en cache par URL.

Refaire la conversion après avoir régénéré une planche (depuis le dossier qui
contient les PNG) :

```sh
npm i --no-save sharp
node -e "const s=require('sharp'),fs=require('fs');
  fs.readdirSync('.').filter(f=>f.endsWith('.png')).forEach(f=>
    s(f).resize(1024,1536,{fit:'fill'}).webp({quality:86,effort:6})
      .toFile(f.replace('.png','.webp')));"
```

Le `resize` n'est pas cosmétique : un générateur d'images rend parfois
1023 × 1537 au lieu de 1024 × 1536, et une planche d'un pixel de travers
décale toute la pile.

Les noms de fichiers vivent dans `js/chest-break.js` (`chestBreakSeq` et
`chestBreakTail`) : changer d'extension, c'est changer ces deux fonctions.
Éviter les **espaces** dans les noms de fichiers — ils traversent mal les URL.

## Essayer sans rien copier

`tools/chest-break-preview.html` joue la séquence dans le navigateur, avec le
vrai CSS et le vrai moteur. `?chest=cavalier` choisit le coffre à régler (le
bouton « Autre coffre » fait tourner). La page accepte aussi qu'on lui
**dépose les huit images** directement : on voit le rendu avant de décider ce
qu'on met dans le dépôt.

## Si un dossier est vide

Le jeu fonctionne. `chestBreakReady()` répond non quand les images manquent,
et la cérémonie retombe sur le coffre à couvercle dessiné en CSS, comme pour
les coffres non équipés.
