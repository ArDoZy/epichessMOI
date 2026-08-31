# Les médaillons de rang

Sept rangs (`RANKS`, `js/data-pieces.js`), sept médaillons :
`bois`, `pierre`, `bronze`, `acier`, `obsidienne`, `argent`, `or`.

Le nom du fichier est **exactement l'id du rang**. Il n'y a aucune liste à
mettre à jour : les trois pages qui l'affichent passent toutes par
`rankMedalHTML()` (`js/main.js`), qui construit le chemin à partir de
l'id — en tentant d'abord `.webp`, puis `.png` (`rankMedalErr()`, même
fichier). Si aucun des deux n'existe, l'`<img>` se retire d'elle-même et
la mise en page redevient exactement celle d'avant.

**Statut actuel : six rangs sur sept sont posés** (`bois`, `pierre`,
`bronze`, `obsidienne`, `argent`, `or`, tous convertis en `.webp` par
`tools/opt-images.js`). Il manque `acier.png` — voir le prompt dans
`assets/PROMPTS.md`, § 7.

**Ils s'affichent à 26 px** sur les bandeaux de rang de la Diagonale. Un
dessin compliqué n'y est plus qu'une tache : une seule silhouette centrale,
massive, et rien d'autre.

Dossier facultatif : sans image, la pastille reste vide et invisible.
Prompts : **`assets/PROMPTS.md`, § 7**.
