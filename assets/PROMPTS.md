# Les planches du décor — catalogue et prompts

Tout le jeu renvoie ici (`[ART]` de `css/style.css`, les README de chaque
dossier d'`assets/`). Ce fichier dit, pour chaque emplacement d'image câblé :
**où déposer le fichier, à quelle taille, et quoi demander au générateur.**

**Rien n'est obligatoire.** Une image absente ne produit qu'un 404 silencieux
et l'écran garde son décor dessiné en CSS. Déposer le fichier au bon chemin
suffit à l'allumer : aucune liste à mettre à jour, rien à décommenter (sauf les
coffres Dame et Roi, § 9).

---

## Mode d'emploi, en quatre temps

1. **Coller le bloc de style (§ 0) une seule fois** en tête de la conversation
   ChatGPT. Toutes les planches du jeu partagent la même lumière et la même
   palette : c'est lui qui la garantit d'une image à l'autre.
2. **Demander une planche à la fois** avec son prompt ci-dessous, en précisant
   le format (« portrait 2:3 », « paysage 3:2 », « carré »). ChatGPT sort
   du 1024 × 1536, 1536 × 1024 ou 1024 × 1024 : ce sont exactement les formats
   attendus.
3. **Déposer le PNG** au chemin indiqué, **en gardant le nom exact** (le
   `.png` ; la conversion fait le reste).
4. **Lancer la conversion**, qui produit le `.webp` léger et repointe le CSS :

   ```bash
   npm i --no-save sharp   # une fois
   npm run opt:images
   ```

   Puis monter `CACHE_VERSION` dans `sw.js` si la planche **remplace** un
   fichier du même nom (sinon les joueurs déjà venus gardent l'ancienne).

---

## § 0. Le bloc de style — à coller en premier

```
Tu vas me produire une série d'illustrations pour « Epic Chess », un jeu
d'échecs de fantasy où des alchimistes ont donné vie aux pièces.
STYLE COMMUN À TOUTES LES IMAGES :
- peinture numérique de fantasy épique, rendu « key art » de jeu vidéo
  premium, textures riches (pierre, laiton, cuir, marbre), lumière
  dramatique ;
- l'atmosphère est un SOIR ÉCLAIRÉ À LA LAMPE, pas une nuit noire : fonds
  ardoise bleu-gris (#1c242b à #31404a), lumière chaude de torches et de
  braises ;
- palette limitée : ardoise froide, laiton / or patiné (#d0a950, #f0d189),
  une touche de vert-de-gris (cuivre oxydé, #3fd0b2) réservée à la magie ;
- architecture gothique, marbre en damier, ornements d'orfèvrerie ;
- AUCUN texte, AUCUN logo, AUCUNE signature, aucun cadre ajouté autour de
  l'image, pas de style cartoon, pas de rendu 3D plastique.
Je te donnerai ensuite chaque image séparément, avec son format.
```

Les trois règles techniques qui reviennent partout :

- **« Fond noir pur »** (effets, coffres) : le jeu fond l'image en
  `mix-blend-mode:screen`, et le noir disparaît. Un fond gris foncé laisserait
  un rectangle visible. Toujours écrire *« sur fond noir pur #000000,
  uniforme, sans vignettage clair »*.
- **« Fond transparent »** (médaillons, ornements, socle) : demander
  *« PNG avec fond transparent, sujet détouré »*. Si ChatGPT livre un damier
  gris peint à la place d'une vraie transparence, le refaire : le damier
  apparaîtrait à l'écran.
- **« Tuilable »** (textures) : *« texture sans raccord, qui se répète à
  l'infini dans les deux sens »*.

---

## Ordre conseillé — ce qui se verra le plus

| Priorité | Planche(s) | Chemin | Où ça se voit |
|---|---|---|---|
| ★★★ | La salle de la partie | `backgrounds/partie.png` | **L'écran de jeu**, derrière et autour du plateau, à chaque partie |
| ★★★ | Coffres Dame et Roi (2 × 5 planches) | `chests/dame/`, `chests/roi/` | Magasin, récompenses : ce sont les deux seuls coffres encore dessinés en CSS |
| ★★★ | Douze portraits d'adversaires | `adversaires/<id>.png` | Galerie, intro de combat, bandeau adverse de chaque partie |
| ★★ | Trois planches de variantes | `variantes/<id>.png` | Cartes de la page Variantes |
| ★★ | Médaillon de rang Acier | `ranks/acier.png` | Le seul des sept rangs sans médaillon (800–1199 ELO) |
| ★★ | Sept paysages de la Diagonale | `voie/biome-<rang>.png` | Page de progression ELO |
| ★★ | Quatre bannières de titre | `banners/<page>.png` | Titres du Magasin, des Adversaires, de la Diagonale, des Récompenses |
| ★ | Toile de démarrage | `backgrounds/chargement.png` | Écran de chargement (sinon : la tempête de `duel-wait`) |
| ★ | Ornement de coin, socle | `ui/ornement-coin.png`, `ui/socle.png` | Fenêtres de résultat, promotion |
| ★ | Deux textures de métal | `ui/laiton.png`, `ui/vert-de-gris.png` | Grain des boutons dorés et verts |

---

## § 1. La salle de la partie — `assets/backgrounds/partie.png`

**Nouvel emplacement.** L'écran de jeu était le seul resté en aplat d'ardoise.
Il reçoit aujourd'hui, en attendant, la planche de la présentation des armées
(`combat-intro.webp`) ; celle-ci passe devant dès qu'elle existe. Affichée
**sous un voile sombre à ~80 %** et centrée sur le plateau : ce qui compte, ce
sont les BORDS de l'image (visibles autour du plateau sur ordinateur, et sous
les boutons sur téléphone).

- Format : **paysage 3:2** (1536 × 1024). Opaque.

```
Paysage 3:2. L'intérieur d'une salle de guerre d'alchimistes, vue de face,
à hauteur de table. Au centre, une grande table de chêne massive et vide
(on y posera l'échiquier : le centre de l'image doit rester calme, sombre et
sans détail). Sur les côtés et au fond : colonnes gothiques, étagères de
grimoires, cornues et alambics en laiton, cartes de bataille épinglées, deux
braseros qui éclairent la scène d'une lumière chaude et basse. Brume légère
au sol. Composition symétrique, profondeur de champ : le fond est flou.
```

---

## § 2. Les douze adversaires — `assets/adversaires/<id>.png`

**Carré 1024 × 1024** (512 minimum), visage **centré et lisible en 26 px**,
fond sombre. Le tableau des douze sujets (Cendre, Suie, Bruyère, Orpiment,
Vitriol, Cinabre, Antimoine, Mercure, Plombagine, La Salamandre, L'Instructeur,
L'Athanor) est dans **`assets/adversaires/README.md`** ; le nom du fichier est
l'`id` de la première colonne.

```
Portrait carré, buste centré, épaules coupées en bas du cadre. Fond d'atelier
d'alchimiste très assombri et flou. Éclairage latéral de bougie. Le visage
doit rester lisible une fois réduit à la taille d'un timbre : traits nets,
silhouette simple, contraste fort entre le visage et le fond.
SUJET : <coller la case « SUJET » du tableau>
```

Pas de conversion : les portraits restent en `.png` (512 px suffisent).

---

## § 3. Les fonds d'écran — `assets/backgrounds/`

**Les seize fonds du catalogue sont posés** (menu, armées, armurerie, magasin,
adversaires, voie, récompenses, comptes, atelier, intro de combat, attente en
ligne, table, Lore 1 à 4). Pour en refaire un, garder le même nom et le même
format (1536 × 1024 paysage, sauf `main-page` et `lore-*` en portrait
1024 × 1536), puis monter `CACHE_VERSION` dans `sw.js`.

### § 3 bis. La toile de démarrage — `backgrounds/chargement.png`

Posée **par-dessus** `duel-wait.webp` : tant qu'elle manque, c'est la tempête
qui s'affiche. Portrait **1024 × 1536**, opaque. Le nom du jeu et la barre de
progression s'écrivent au milieu : haut et bas plus sombres.

```
Portrait 2:3. Un échiquier de marbre géant posé au sommet d'une tour
d'alchimiste, sous un ciel d'orage doré au crépuscule. Les pièces d'échecs,
hautes comme des hommes, s'éveillent : fissures lumineuses dorées, fumée
d'or qui s'en échappe. Grand vide calme au centre de l'image. Haut et bas de
l'image plus sombres.
```

### § 3 ter. Les sept paysages de la Diagonale — `assets/voie/biome-<rang>.png`

Un par rang : `bois`, `pierre`, `bronze`, `acier`, `obsidienne`, `argent`, `or`.
**Carré 1024 × 1024, vu du dessus à la verticale**, un sentier de terre battue
qui traverse l'image **du bord haut au bord bas en passant par le milieu**. Les
bandes se répètent bout à bout : **le haut doit se raccorder au bas**.

```
Carré, vue aérienne strictement verticale (plongée à 90°). Un sentier de
terre battue, large d'un cinquième de l'image, traverse l'image de haut en
bas exactement par le milieu. Texture qui se raccorde parfaitement entre le
bord haut et le bord bas. Pas de personnage, pas de bâtiment coupé par les
bords. PAYSAGE : <voir ci-dessous>
```

| Fichier | PAYSAGE |
|---|---|
| `biome-bois.png` | une forêt de chênes au sol de mousse et de feuilles mortes, souches, champignons |
| `biome-pierre.png` | une lande rocailleuse grise, blocs de granit, bruyère rase |
| `biome-bronze.png` | une plaine d'automne cuivrée, blés couchés, ruines de murets de pierre ocre |
| `biome-acier.png` | une forge à ciel ouvert : dalles de fer, rails, enclumes et scories froides, reflets bleutés |
| `biome-obsidienne.png` | une terre volcanique noire vitrifiée, fissures de lave violette et orangée |
| `biome-argent.png` | un glacier sous la lune, neige tassée, cristaux de givre argentés |
| `biome-or.png` | un parvis de palais céleste : dalles d'or et de marbre blanc, nuages dorés en contrebas |

Puis `npm run opt:images` (le jeu ne cherche QUE le `.webp` ici).

---

## § 4. Les bannières de titre — `assets/banners/<page>.png`

Quatre : `magasin`, `adversaires`, `voie`, `recompenses`. Un bandeau ouvragé
**derrière** le titre de la page ; le titre reste du texte, **la planche ne
porte aucun mot**. Paysage **3:2 (1536 × 1024)**, mais seule la **bande
centrale horizontale** (un onzième de la hauteur) est visible : tout le motif
doit tenir sur une ligne au milieu, le reste en noir.

```
Paysage 3:2, fond noir pur. Au milieu de l'image, UNE SEULE bande horizontale
fine : un bandeau d'orfèvrerie en laiton ciselé, sur toute la largeur, avec
au centre un cartouche vide (aucun texte). Le haut et le bas de l'image sont
entièrement noirs. MOTIF : <voir ci-dessous>
```

| Fichier | MOTIF |
|---|---|
| `magasin.png` | balances de marchand et perles nacrées incrustées aux deux extrémités |
| `adversaires.png` | deux épées croisées et des sceaux d'alchimiste aux extrémités |
| `voie.png` | une diagonale d'échiquier gravée, et un soleil levant d'or au centre |
| `recompenses.png` | une couronne de lauriers au centre, rubans et médailles de part et d'autre |

---

## § 5. Le mobilier — `assets/ui/`

**PNG à fond transparent**, obligatoire.

| Fichier | Format | Prompt |
|---|---|---|
| `ornement-coin.png` | carré 512 | *« Un ornement d'angle d'orfèvrerie en laiton ciselé, en forme de L avec volutes et une palmette, qui occupe le coin HAUT GAUCHE d'un carré ; le reste de l'image vide. Fond transparent, détouré. »* Le jeu le retourne pour les trois autres coins. |
| `socle.png` | paysage 3:1 (1536 × 512) | *« Un socle ovale de pierre gravée vu de trois quarts, bord cerclé de laiton, runes discrètes sur la tranche, sans rien dessus. Fond transparent. »* Posé sous les créatures (promotion, déblocage). |

### § 5 bis. Les deux textures de métal (tuilables)

Carré **1024 × 1024**, **sans raccord** dans les deux sens, **sans ombre
directionnelle** (elles sont fondues en `overlay` par-dessus la couleur du
bouton : seul le grain compte).

| Fichier | Prompt |
|---|---|
| `laiton.png` | *« Texture de laiton brossé légèrement patiné, micro-rayures fines, reflets doux, sans raccord, vue à plat, éclairage uniforme. »* |
| `vert-de-gris.png` | *« Texture de cuivre oxydé vert-de-gris, taches de patine turquoise sur fond cuivre, sans raccord, vue à plat, éclairage uniforme. »* |

---

## § 6. Les effets — `assets/fx/`

**Les six sont posés** (`halo-victoire`, `onde-choc`, `braises`,
`eclat-capture`, `flamme-echec`, `cercle-runique`). Pour en refaire un : même
nom, carré 1254 ou 1024, **fond noir pur**, lumière seule.

---

## § 7. Le médaillon de rang Acier — `assets/ranks/acier.png`

**Le seul des sept qui manque.** Carré **1024 × 1024**, **fond transparent**,
UNE silhouette massive au centre (il s'affiche à 26 px sur la Diagonale : un
détail fin n'y serait qu'une tache). Il doit ressembler aux six autres —
joindre `ranks/bronze.webp` ou `ranks/argent.webp` à la conversation comme
référence de style.

```
Carré, fond transparent. Un médaillon rond de rang en ACIER bleuté poli,
bord épais riveté, au centre une tour d'échecs en relief forgée, reflets
froids bleu acier (#8fa8b8). Même style, même cadrage et même épaisseur que
le médaillon de référence joint. Aucun texte.
```

La conversion le ramène à 288 px (`tools/opt-images.js`).

---

## § 8. Les planches des variantes — `assets/variantes/<id>.png`

**Nouvel emplacement.** Posées à droite de la carte de chaque variante, fondues
vers la gauche pour ne jamais passer sous le texte (opacité ~35 %). Paysage
**3:2 (1536 × 1024)** ; **le sujet à DROITE de l'image**, la moitié gauche
sombre et vide.

| Fichier | Prompt |
|---|---|
| `fok.png` | *« Paysage 3:2. Un échiquier de pierre fendu par un séisme : les quatre rangées centrales glissent de côté dans un grondement de poussière dorée, pièces qui vacillent. Sujet dans le tiers droit, moitié gauche sombre et vide. »* |
| `mirror.png` | *« Paysage 3:2. Un roi et une reine d'échecs de marbre face à face de part et d'autre d'un miroir d'eau vertical, chacun reflet exact de l'autre, lumière vert-de-gris. Sujet dans le tiers droit, moitié gauche sombre et vide. »* |
| `troie.png` | *« Paysage 3:2. Un cavalier d'échecs noir dont l'ombre projetée sur le damier est celle d'un cavalier blanc ; un masque de bal doré posé contre son socle. Sujet dans le tiers droit, moitié gauche sombre et vide. »* |

---

## § 9. Les coffres Dame et Roi — `assets/chests/dame/`, `assets/chests/roi/`

Ce sont **les deux seuls coffres encore dessinés en CSS** (un coffre à
couvercle marron et un jaune, au milieu de quatre statuettes de marbre). Cinq
planches chacun, **exactement comme celles du Pion, du Cavalier, du Fou et de
la Tour** — les ouvrir côte à côte avant de commencer :

| Fichier | Ce qu'il montre |
|---|---|
| `01-intact.png` | la pièce intacte sur son socle |
| `02-fissure.png` | une première fissure lumineuse |
| `03-fissures.png` | un réseau de fissures |
| `04-brisures.png` | la pièce saturée de fissures |
| `05-eclats.png` | la pièce se rompt, éclats projetés |

Contraintes (détail dans `assets/chests/README.md`) :

- **Portrait 1024 × 1536, fond noir pur.**
- **Cadrage IDENTIQUE** entre les cinq planches, et identique à celui des
  quatre coffres existants : même socle, même taille de pièce, même position.
  Joindre `chests/tour/01-intact.webp` comme référence et demander *« exactement
  le même cadrage, le même socle et la même lumière, seule la pièce change »*.
- **Lumière CHAUDE (or) et elle seule colorée**, marbre blanc neutre. Ne PAS
  peindre les fissures en violet ou en bleu : c'est le code qui teinte la
  lumière du rang.

```
Portrait 2:3, fond noir pur. Une statuette de <DAME | ROI> d'échecs en marbre
blanc veiné, haute et élégante, posée sur un socle de pierre sombre au centre
bas de l'image, éclairée d'en haut. <ÉTAT : intacte | une première fissure
fine qui brille d'une lumière dorée intense | un réseau de fissures dorées
lumineuses | la pièce entièrement couverte de fissures dorées incandescentes
| la pièce qui éclate en morceaux, éclats de marbre projetés, lumière dorée
qui jaillit>. Même cadrage exact que l'image de référence jointe.
```

Les planches sont déjà en `.webp` ailleurs dans ce dossier : convertir à la
main (`npx sharp-cli` ou un export WebP qualité 82), **sans redimensionner**.
Puis décommenter la ligne correspondante de `CHEST_BREAK` en tête de
`js/chest-break.js` — c'est la seule planche du jeu qui demande un geste de
plus, et `assets/chests/README.md` explique pourquoi.

### § 9 bis. Les créatures — `assets/pieces/<id>.png`

**Les seize sont posées.** Le bloc de style propre aux cartes, la couleur de
lueur de chaque classe et le sujet de chaque créature sont dans
`assets/pieces/README.md`. Portrait 1024 × 1536 ; `npm run opt:images` les
ramène à 640 × 960.
