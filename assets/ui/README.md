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

Les sept logos ont eux aussi besoin d'une vraie transparence, et surtout
d'être **lisibles entre 17 et 26 px** : une seule forme, aucun décor autour,
l'objet qui remplit le carré. Les trois logos du menu ne portent AUCUN effet
peint — les flammes, les éclats et la spirale de lumière qui s'allument quand
une récompense attend sont animés par le navigateur (`.jt-fx`,
`css/style.css`), par-dessus.

Dossier facultatif, fichier par fichier : sans image, l'interface garde ses
aplats, ses bordures et ses pictogrammes dessinés en SVG, comme aujourd'hui.
Chemins, dimensions et prompts : **`assets/PROMPTS.md`, § 5 et § 5 bis**.
Câblage : `[ART]` dans `css/style.css`.
