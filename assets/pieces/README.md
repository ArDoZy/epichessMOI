# Les illustrations de créatures — `assets/pieces/`

Une image par créature, nommée **exactement comme l'identifiant de la pièce**
dans `js/data-pieces.js` :

```
assets/pieces/<id>.png     ← la planche du générateur, 1024×1536 (locale)
assets/pieces/<id>.webp    ← ce que le jeu charge, 640×960 (versionné)
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

## LE PASSAGE OBLIGÉ : `npm run opt:images`

C'est la seule commande de ce dossier, et elle n'est pas facultative.

```bash
npm i --no-save sharp     # une fois
npm run opt:images        # après chaque planche déposée
```

**Pourquoi.** Le générateur sort du PNG de 1024×1536, soit **deux à trois
mégaoctets par créature** — cinquante mégaoctets pour les dix-neuf. Or la
plus grande carte du jeu fait **150 px de large** (`.cards-grid .piece-card`)
et le catalogue d'un téléphone en aligne quatre par rangée, à 76 px. On
téléchargerait donc, sur un forfait mobile, cinquante mégaoctets dont le
navigateur jette 95 % des pixels avant de peindre.

`tools/opt-images.js` en tire un **`.webp` de 640×960** — une centaine de
kilo-octets, soit un rapport de 1 à 25 — recadré au centre au rapport 2/3
si la planche ne l'était pas. Le PNG d'origine **reste sur le disque** :
c'est le fichier qu'on retouche et qu'on reconvertit. Il est ignoré par git
(`.gitignore`) : ce qui part au dépôt est le `.webp`, comme pour les
cinquante-huit autres planches du jeu.

**Ce que la carte demande, dans l'ordre** (`pieceCardArtHTML`,
`js/piece-card.js`) :

1. `<id>.webp` — l'illustration optimisée, ce que voit le joueur ;
2. `<id>.png` — la planche brute, pour la minute où l'on vient de la déposer
   et où l'on veut la voir sans rien lancer ;
3. le SVG monochrome, si les deux manquent.

Rien à changer dans le code d'un palier à l'autre : chaque échec passe au
suivant tout seul.

**Une dernière chose, la seule qui se paie en silence** : les images sont
servies par le **cache d'abord** (`sw.js`). Après avoir ajouté ou remplacé des
illustrations, monter `CACHE_VERSION` dans `sw.js`, sinon les joueurs déjà
venus garderont les anciennes.

## Le format : PORTRAIT, ET L'IMAGE REMPLIT LA CARTE

L'illustration ne se pose plus **dans** la carte, elle **est** le haut de la
carte : elle va d'un bord à l'autre, sous le bandeau du nom, comme sur une
carte à collectionner. D'où deux conséquences qui changent le prompt :

* **PORTRAIT, 1024 × 1536** (et non plus carré). C'est le format qui remplit
  un cadre plus haut que large sans laisser de vide sur les côtés. C'est la
  taille qu'on DEMANDE au générateur ; celle qui part au dépôt est le
  640 × 960 produit par `npm run opt:images` — même image, même cadrage,
  vingt-cinq fois moins lourde.
* **Fond PLEIN, pas transparent.** Un fond transparent laisse voir le
  dégradé de la carte et l'illustration flotte ; un fond peint jusqu'aux
  bords fait une carte. Le fond est une **lueur colorée dans la couleur de
  rareté de la créature** (le tableau plus bas donne la couleur), sombre sur
  les bords, claire derrière le sujet. Aucun décor lisible : une lueur, de la
  fumée, deux ou trois éclats — rien qu'on puisse nommer.
* **Marge de sécurité de 12 % en haut et en bas.** Le cadre de la carte est
  un peu moins haut que l'image : elle est posée en `object-fit:cover` et
  perd donc une lisière haute et basse. Ni la couronne ni les pieds ne
  doivent la toucher.
* Les **deux coins du haut** portent les pastilles de coût et de quantité
  (30 px, à cheval sur le bord) : ne rien y mettre d'important.
* La créature **entière**, centrée, en pied ou à mi-corps, vue de face ou de
  trois quarts, en légère **contre-plongée** — on la regarde d'en bas, elle
  domine.
* Elle doit rester reconnaissable **réduite à soixante pixels de large** :
  une silhouette nette, une lumière franche, pas de fioriture.

## Le style : de la HAUTE FANTASY, pas une pièce d'échecs

C'est le point qui a fait rater les premières planches. Un prompt qui dit
« un roi de marbre » rend une **statue de musée** : grise, immobile, muette,
et qui ne va avec rien. Ce ne sont pas des pièces d'échecs sculptées, ce
sont des **créatures vivantes qui posent pour leur carte** — armure ouvrée,
étoffes en mouvement, magie visible, regard qui porte.

À dire dans chaque prompt, ou à poser une fois en tête de conversation :

```
Illustration de carte à collectionner de haute fantasy héroïque, peinte
numériquement. Personnage VIVANT en pleine posture, pas une statue, pas un
objet, pas une figurine de jeu d'échecs. Armure et étoffes richement
ouvragées, or et gemmes, magie visible (halo, runes, particules).
Couleurs SATURÉES et lumière dramatique. JAMAIS de noir et blanc, jamais
de camaïeu de gris, jamais de marbre nu.
```

## Les identifiants et leur sujet

Dix-neuf créatures, la liste qui fait foi étant celle de `PIECES` dans
`js/data-pieces.js`. La **couleur** est celle de la classe (`CLASS_COLOR_VARS`,
même fichier) : c'est elle que la carte pose en bordure et en bandeau, et
c'est donc elle que la lueur du fond doit reprendre — sinon l'illustration
et son cadre jurent.

| Classe | Couleur de la lueur |
|---|---|
| Monarque | bleu roi `#7aa8e6` |
| Général | or orangé `#f0a052` |
| Primordiale | vert clair `#a6c65f` |
| Brute | rouge braise `#e0705f` |
| Sorcier | violet `#b78ee6` |

| Fichier | Créature | Sujet |
|---|---|---|
| `roi.png` | Roi (Monarque) | Un roi guerrier en armure d'argent et de bleu, cape lourde, couronne de fer et de saphirs, épée longue plantée devant lui à deux mains. Barbe, regard de commandement, aucune arrogance. Lueur bleue. |
| `amazone.png` | Amazone (Général) | Une archère en cuir clouté et plaques dorées, arc de guerre bandé, flèche encochée, longue tresse, carquois plein. Traînées ambrées derrière la flèche. |
| `chevaucheur-rhinoceros.png` | Centaure (Général) | Un centaure en armure de plates dorée, torse humain massif, croupe de cheval de bataille, lance de tournoi calée sous le bras, sabots qui frappent la poussière. |
| `dame.png` | Dame (Général) | Une reine-guerrière en robe d'or et de blanc sous un plastron gravé, longue cape, couronne rayonnante, les mains ouvertes d'où monte une lumière dorée. Majesté, pas de pose sexy. |
| `grand-maitre.png` | Grand Maître (Général) | Un vieux mage-stratège en robe d'or sombre et cuivre, capuchon relevé, une main tendue au-dessus d'une **sphère d'orbes lumineux** qui tournent autour de lui comme des pièces sur un plateau. |
| `cavalier-primordial.png` | Cavalier Primordial (Primordiale) | Un cheval de guerre spectral d'énergie verte cabré, crinière de lumière, armure de plaques usées sur le poitrail, sans cavalier. Élémentaire, ancien, pas un fantôme comique. |
| `fou-primordial.png` | Fou Primordial (Primordiale) | Une haute silhouette encapuchonnée sans visage, faite de pierre fendue et de sève verte lumineuse, bras écartés en diagonale, mitre brisée. |
| `tour-primordiale.png` | Tour Primordiale (Primordiale) | Un colosse de pierre en forme de donjon vivant : tour crénelée sur deux jambes de roche, meurtrières d'où filtre une lumière verte, lierre pris dans les joints. |
| `fourmi.png` | Fourmi (Brute) | Une fourmi de guerre géante, carapace chitineuse rouge sombre lustrée, mandibules ouvertes, un pavois et une hallebarde sanglés sur le dos, dressée sur ses pattes arrière. |
| `preux-chevalier.png` | Preux Chevalier (Brute) | Un chevalier en armure de plates complète, grand écu à croix cabossé tenu en avant, heaume clos à plumet, épaules en pierre. Rempart vivant. |
| `dresseur-elephant.png` | Éléphant de guerre (Brute) | Un éléphant de guerre cuirassé en pleine charge, défenses ferrées, caparaçon rouge et or, tourelle de bois sur le dos, trompe levée. |
| `garde-pierre.png` | Garde de Pierre (Brute) | Un fantassin trapu dont l'armure est faite de blocs de granit assemblés, poings serrés, jambes enfoncées dans le sol qui se fissure autour de lui. Ancré, immobile. |
| `meduse.png` | Méduse (Sorcier) | Une méduse : buste de femme, chevelure de serpents vivants, queue de serpent enroulée, arc court dans le dos, **regard qui pétrifie** — deux yeux violets brillants, et la pierre qui gagne ce qu'elle fixe. |
| `typhon.png` | Typhon (Sorcier) | Une créature de tempête : torse humanoïde violet sombre pris dans un tourbillon qui remplace ses jambes, éclairs entre les mains, débris en orbite. |
| `banshee.png` | Banshee (Sorcier) | Une revenante en linceul déchiré qui flotte, bouche ouverte sur un hurlement, cheveux blancs projetés en arrière, ondes de son visibles en cercles violets. |
| `pretre.png` | Prêtre (Sorcier) | Un prêtre-guerrier en chasuble violette et or, capuchon relevé, crosse à croix levée, un dôme de lumière translucide autour de lui. |

Un prompt complet se fabrique en collant le bloc de style ci-dessus, puis la
case « Sujet » de la ligne, puis la couleur de lueur de la classe. Le tout
est repris et détaillé au § 9 bis de `assets/PROMPTS.md`.
