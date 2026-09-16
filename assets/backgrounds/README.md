# Les fonds d'écran

Un fond par écran — les quatre faces du cube, les pages hors cube, les
quatre pages du Lore, la table sous le plateau — plus l'écran d'attente
d'un duel en ligne. Affichés à 26–44 % d'opacité, désaturés, le centre
éteint par un masque radial : ce sont des fonds, le contenu passe devant.

Dossier facultatif : sans un fichier, l'écran garde son dégradé, comme
avant que ces images existent. Chemins, dimensions et prompts :
**`assets/PROMPTS.md`, § 3**. Câblage : `[ART]` dans `css/style.css`.

## Statut actuel

**Les seize fonds du catalogue sont tous posés**, convertis en `.webp` par
`tools/opt-images.js` : `main-page`, `armees`, `armurerie`, `magasin`,
`adversaires`, `voie`, `recompenses`, `comptes`, `atelier`, `combat-intro`,
`duel-wait`, `table`, `lore-1` à `lore-4`.

`duel-wait.webp` — l'échiquier pris dans la tempête — sert **deux** écrans :
la recherche d'un adversaire et le démarrage du jeu (la barre de progression
à l'ouverture). La planche dédiée au démarrage, `chargement.webp`
(`assets/PROMPTS.md`, § 3 bis), reste facultative : posée, elle passe devant
sans rien à recoder.

## `main-page.webp` a changé de tableau

Le menu principal ne montre plus le champ de bataille nuageux en paysage,
mais **la grande salle** : une nef gothique en portrait (1024 × 1536), deux
cavaliers cabrés sur leurs socles, un damier de marbre au sol et la cité qui
s'ouvre au fond. Le fichier garde son nom — rien à recâbler — mais il est
posé autrement : **plus de masque radial qui perçait son milieu**, et une
opacité de 92 % au lieu de 40 %.

C'est le reste du menu qui l'autorise : le titre, l'arène et le bouton
COMBAT portent maintenant leurs propres planches opaques (voir
`assets/ui/README.md` et `[GRANDE-SALLE]` dans `css/style.css`), et n'ont
plus besoin qu'on éteigne l'image sous eux pour rester lisibles.

Le PNG d'origine est dans `assets/sources/menu/`, hors du dépôt ;
`tools/prep-menu-art.py` le reconvertit.
