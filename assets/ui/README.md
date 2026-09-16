# Le mobilier de l'interface, et les sept logos

Le cadre de l'échiquier, l'ornement d'angle des cartes, le socle des
créatures, les deux textures de métal qui grainent les boutons — et les
**sept emblèmes de navigation** (`logo-*.png`) : les quatre onglets du cube
(Combat, Magasin, Mes armées, Guerre des clans) et les trois boutons de
voies du menu principal (colonne des victoires, rangée de la richesse,
récompense journalière).

Trois de ces planches ont besoin d'une **vraie transparence** (PNG à canal
alpha) : `cadre-plateau.png`, `ornement-coin.png` et `socle.png` — elles
masquent ce qu'il y a dessous au lieu de s'y ajouter. Les deux textures
(`laiton.png`, `vert-de-gris.png`) doivent être **tuilables**.

**Les sept logos sont posés** (`logo-*.webp`, 256 px, canal alpha, 11 à
28 Ko pièce). Ils sont détourés au plus près puis recentrés dans un carré :
c'est ce qui leur donne le même poids optique alors que le livre est large
et le bouclier haut. Ils sont la seule famille du dossier livrée en `.webp`,
parce qu'ils sont déjà passés par `tools/opt-images.js`.

Ils ne portent **AUCUN effet peint**. Les flammes qui lèchent la couronne de
lauriers, les arcs qui claquent autour de l'éclair et la spirale de lumière
qui tourne autour du livre sont dessinés et animés par le navigateur
(`.jtf-*` dans `css/style.css`, matières dans le `<defs>` en tête
d'`index.html`) : ils ne s'allument que quand une récompense attend, et
s'éteignent quand elle est prise. Une lueur peinte sur la planche ferait
double feu, et resterait allumée pour toujours.

Le mobilier, lui, reste à faire. Dossier facultatif fichier par fichier :
sans image, l'interface garde ses aplats, ses bordures et ses pictogrammes
dessinés en SVG. Chemins, dimensions et prompts : **`assets/PROMPTS.md`,
§ 5 et § 5 bis**. Câblage : `[ART]` dans `css/style.css`.

## Les cinq planches du menu principal, et les trois emblèmes repeints

Le menu était fait de rectangles CSS ; il est maintenant fait de planches
peintes. Cinq sont arrivées, et trois des sept logos ont été **remplacés
sous le même nom** :

| Fichier | Ce qu'il habille |
|---|---|
| `ornement-titre.webp` | le cartouche autour d'« Epic Chess » (deux volutes, le mot au milieu) |
| `cadre-arene.webp` | le cadre de l'arène : rang, ELO, jauge |
| `cercle-voie.webp` | l'anneau des trois boutons de voie |
| `plaque-combat.webp` | la plaque d'or du grand bouton COMBAT |
| `logo-journaliere.webp` | le livre ouvert — **nouveau dessin** |
| `logo-victoires.webp` | la couronne de lauriers — **nouveau dessin** |
| `logo-richesse.webp` | l'éclair — **nouveau dessin** |

Les trois emblèmes gardent le format des quatre autres (256 px, canal alpha,
carré, détourés au plus près puis recentrés) : rien à recâbler, ni dans le
CSS ni dans le balisage.

Ils ne portent toujours **AUCUN effet peint** — c'est la règle du haut de ce
fichier, et le livre est celui qui la teste : son rendu d'origine était
traversé d'un halo de lumière. Le halo est coupé au détourage
(`tools/prep-menu-art.py`), parce que la spirale qui tourne autour du livre
est dessinée et animée par le navigateur (`.jtf-*`) et ne s'allume QUE quand
une récompense attend. Une lueur cuite dans la planche resterait allumée pour
toujours, et ferait double feu quand l'autre s'allume.

Ces cinq planches remplacent trois des dessins SVG de `[ORFEVRERIE]` sur le
seul menu : `cartouche.svg` (qui sert toujours les autres titres),
`anneau.svg` et `plaque.svg`. Câblage : `[GRANDE-SALLE]` en fin de
`css/style.css`. Sources et reconversion : `assets/sources/menu/` et
`tools/prep-menu-art.py`.
