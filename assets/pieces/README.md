# Les illustrations de créatures — `assets/pieces/`

Une image par créature, nommée **exactement comme l'identifiant de la pièce**
dans `js/data-pieces.js`, en `.png` :

```
assets/pieces/<id>.png
```

C'est la carte du CATALOGUE qui les affiche — la grille de composition
d'armée et les emplacements de l'armée choisie (voir `pieceCardArtHTML`,
`js/piece-card.js`). **Le plateau ne les utilise pas** : une pièce en partie
reste dessinée par son SVG monochrome (`js/piece-art.js`), qui doit se lire
sur une case de quarante pixels.

## Rien n'est obligatoire

Comme partout ailleurs dans `assets/`, **une image absente ne produit qu'un
404 silencieux**. L'`<img>` se retire d'elle-même (`onerror`), et le SVG
monochrome de la pièce reprend sa place dans la carte — c'est ce qu'on voit
aujourd'hui, tant que ce dossier est vide. Il n'y a aucune liste à tenir à
jour, rien à déclarer : déposer `assets/pieces/meduse.png` suffit à ce que
la Méduse s'illustre au prochain rechargement.

## Le format

La carte réserve à l'illustration un cadre **un peu plus large que haut**,
en haut de la carte, et l'image y est posée en `object-fit:contain` : elle
n'est jamais rognée, et ses proportions ne bougent pas.

* **Carré**, 1024×1024 (le format le plus court à générer).
* **PNG**, fond de préférence transparent — la carte pose derrière un halo
  dans la couleur de rareté de la créature, qui ne se voit que si le fond
  la laisse passer. Un fond sombre uni marche aussi.
* La créature **entière**, centrée, vue de face ou de trois quarts, tenant
  dans le cadre sans toucher les bords.
* Elle doit rester reconnaissable **réduite à soixante pixels de large** :
  une silhouette nette, une lumière franche, pas de décor.

## Les identifiants

* `roi.png`
* `empereur.png`
* `amazone.png`
* `chevaucheur-rhinoceros.png`
* `dame.png`
* `grand-maitre.png`
* `cavalier-primordial.png`
* `fou-primordial.png`
* `tour-primordiale.png`
* `fourmi.png`
* `preux-chevalier.png`
* `dresseur-elephant.png`
* `garde-eau.png`
* `garde-feu.png`
* `garde-pierre.png`
* `meduse.png`
* `typhon.png`
* `banshee.png`
* `pretre.png`
* `pion.png`
* `cavalier.png`
* `fou.png`
* `tour.png`

La liste qui fait foi est celle de `PIECES` dans `js/data-pieces.js` : si
une créature y est ajoutée, son illustration porte son identifiant, et rien
d'autre n'est à toucher.
