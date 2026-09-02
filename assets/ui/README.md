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
