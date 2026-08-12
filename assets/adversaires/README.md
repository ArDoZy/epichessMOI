# Portraits des adversaires

Ce dossier est **facultatif**. Le jeu fonctionne entièrement sans lui : quand
`<id>.png` manque, `advSealSVG()` (js/adversaires.js) dessine un sceau
d'alchimiste déterministe à partir de l'id de l'adversaire. Déposer une image
suffit à la faire apparaître — il n'y a **aucune liste à mettre à jour**, ni
ici ni dans le code.

## Format

- Nom du fichier : exactement l'`id` de l'adversaire dans `AI_OPPONENTS`
  (js/data-pieces.js), en minuscules, extension `.png`.
- Carré, 512×512 minimum. L'image est recadrée en `object-fit: cover` dans une
  vignette de 72 px sur la galerie et de 26 px sur la page de combat : le
  visage doit être **centré et lisible en très petit**.
- Fond sombre. La vignette n'a pas de cadre et se pose sur `--surface` :
  un fond clair ferait une tache blanche dans l'interface.

## Prompt de base

À coller tel quel dans ChatGPT / Midjourney / une autre IA d'image, en
remplaçant la dernière ligne par le sujet voulu.

```
Portrait carré, buste centré, style illustration peinte sombre et sobre,
éclairage de bougie latéral, fond d'atelier d'alchimiste très assombri et
flou. Palette limitée : noirs bleutés, or patiné, vert-de-gris. Aucun texte,
aucun logo, aucun cadre, pas de style cartoon, pas de rendu 3D brillant.
Composition centrée, épaules coupées en bas du cadre.
SUJET : …
```

## Les douze sujets

| Fichier | Adversaire | ELO | SUJET à mettre dans le prompt |
|---|---|---|---|
| `cendre.png` | Cendre | 150 | Une très jeune apprentie au visage barbouillé de suie, cheveux gris de cendre mal coupés, tablier de toile râpé, un balai posé contre l'épaule. Regard curieux, un peu perdu. |
| `suie.png` | Suie | 300 | Un souffleur de verre trapu, joues rougies par le four, lunettes de protection fumées relevées sur le front, canne à souffler dans une main. Air gourmand et distrait. |
| `bruyere.png` | Bruyère | 450 | Une herboriste maigre en manteau de laine verte, capuche baissée, couronne de brindilles sèches, des dizaines de petits bocaux d'herbes accrochés à sa ceinture. Visage calme et patient. |
| `orpiment.png` | Orpiment | 620 | Un broyeur de minerai massif, épaules énormes, bras nus couverts de poussière jaune d'orpiment, marteau de pierre sur l'épaule, mâchoire carrée, regard buté. |
| `vitriol.png` | Vitriol | 800 | Un alchimiste sec et nerveux, gants de cuir épais rongés par l'acide, cicatrices de brûlures chimiques sur les avant-bras, fiole fumante d'un liquide bleu à la main. Sourire trop pressé. |
| `cinabre.png` | Cinabre | 980 | Une teinturière du mercure, mains et avant-bras teints de rouge vermillon jusqu'au coude, longue robe sombre, cheveux noirs relevés, regard fixe et froid. Aucune arme, aucune tension. |
| `antimoine.png` | Antimoine | 1150 | Un gardien vieillissant en armure de plaques ternies et rapiécées, casque sous le bras, barbe grise taillée court, cicatrice en travers de l'arcade. Immobile, planté comme un mur. |
| `mercure.png` | Mercure | 1350 | Un messager svelte en manteau de voyage argenté qui semble encore flotter, capuche à demi tombée, traits fins et flous comme saisis en mouvement, sablier brisé pendu au cou. |
| `plombagine.png` | Plombagine | 1550 | Un scribe pâle et austère, doigts noircis de mine de plomb, besicles rondes, col haut, une pile de registres reliés serrée contre lui. Regard analytique, sans chaleur. |
| `salamandre.png` | La Salamandre | 1750 | Une femme guerrière-alchimiste dont la peau porte des motifs de braise incandescente, cheveux d'un roux ardent, manteau roussi aux épaules, flammes basses léchant ses avant-bras. |
| `instructeur.png` | L'Instructeur | 2000 | Un homme d'âge mûr en robe de laboratoire vert-de-gris impeccable, cheveux tirés en arrière, lunettes fines, mains croisées. Autorité tranquille, aucun signe d'effort. |
| `athanor.png` | L'Athanor | 2300 | Une silhouette encapuchonnée dont le visage est un four d'alchimiste ouvert : à la place des traits, une porte de fonte entrouverte sur des braises dorées. Robe lourde brodée d'or terni. |

## Autres images facultatives

- `../backgrounds/main-page.png` — fond du menu principal, 2560×1440, PNG. Le
  **centre doit rester vide et sombre** : l'emblème, le titre et le bouton
  COMBAT s'y posent, et un masque radial éteint l'image au milieu (voir
  `[LAB-BG]` dans css/style.css).
