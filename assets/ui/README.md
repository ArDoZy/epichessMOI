# Le mobilier de l'interface

Le cadre de l'échiquier, l'ornement d'angle des cartes, le socle des
créatures et les deux textures de métal qui grainent les boutons.

Trois de ces planches ont besoin d'une **vraie transparence** (PNG à canal
alpha) : `cadre-plateau.png`, `ornement-coin.png` et `socle.png` — elles
masquent ce qu'il y a dessous au lieu de s'y ajouter. Les deux textures
(`laiton.png`, `vert-de-gris.png`) doivent être **tuilables**.

Dossier facultatif : sans image, l'interface garde ses aplats et ses
bordures, comme aujourd'hui. Chemins, dimensions et prompts :
**`assets/PROMPTS.md`, § 5**. Câblage : `[ART]` dans `css/style.css`.
