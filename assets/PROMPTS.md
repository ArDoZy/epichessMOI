# Toutes les images du jeu — le catalogue et les prompts

Ce fichier est la **liste complète** des planches que le jeu sait afficher,
et le prompt à donner à un générateur d'images pour chacune.

Rien ici n'est obligatoire. Le jeu tourne aujourd'hui sans une seule de ces
images, et il tournera encore avec trois sur soixante. C'est la règle déjà
posée par les portraits d'adversaires et par le fond du menu principal,
généralisée à tout le décor : **une image absente ne produit qu'un 404
silencieux**, la règle CSS retombe sur le décor dessiné en dégradés, et il
n'y a rien à décommenter, rien à déclarer, aucune liste à tenir à jour.

**Le geste est donc toujours le même : générer l'image, la renommer
exactement comme la colonne « Fichier » le dit, la déposer au chemin
indiqué, et c'est allumé.** Le câblage existe déjà : il est dans la section
`[ART]` de `css/style.css`.

---

## 1. Avant de générer quoi que ce soit

### Les trois tailles que sait faire ChatGPT

Un générateur d'images ne rend pas n'importe quelle dimension. Les trois
seules disponibles sont :

| Demandé dans le prompt | Pixels | Pour quoi |
|---|---|---|
| « format paysage » | 1536 × 1024 | fonds d'écran, bannières, flammes |
| « format portrait » | 1024 × 1536 | pages du Lore, planches de coffre |
| « format carré »   | 1024 × 1024 | médaillons, ornements, textures, effets |

Chaque prompt ci-dessous dit lequel demander. **Ne redimensionne rien à la
main** : le jeu recadre lui-même (`background-size:cover`), et une image
étirée se voit tout de suite.

### Le fond noir, et pourquoi il vaut mieux qu'un fond transparent

La grande majorité des effets — halos, ondes de choc, étincelles, braises,
flammes — sont dessinés **sur fond parfaitement noir**, et le jeu les fond
en `mix-blend-mode:screen`. En `screen`, le noir disparaît complètement et
seule la lumière reste. C'est de la transparence gratuite : pas de canal
alpha à produire, pas de liseré gris autour du halo, et le fichier pèse
trois fois moins qu'un PNG transparent. C'est déjà le procédé du halo des
coffres (`assets/chests/README.md`).

**Cinq familles seulement ont besoin d'une VRAIE transparence** (`fond
transparent, PNG avec canal alpha` dans le prompt), parce qu'elles doivent
masquer ce qu'il y a dessous au lieu de s'y ajouter :

- `assets/ui/cadre-plateau.png`
- `assets/ui/ornement-coin.png`
- `assets/ui/socle.png`
- `assets/ranks/*.png`
- `assets/adversaires/*.png` (fond sombre suffit, mais l'alpha est mieux)

Tout le reste : **fond noir pour les effets, image pleine pour les fonds
d'écran.**

### Le poids

Ces images sont photographiques (dégradés, halo, grain) : le PNG y est le
pire format possible, il code sans perte un bruit que personne ne regarde.
Un fond d'écran en PNG pèse 2 à 4 Mo ; le même en WebP qualité 82 pèse
150 Ko, sans différence visible.

Le jeu lit des `.png` — c'est ce que sort le générateur, donc déposer le
fichier suffit. **Quand tu en auras déposé une dizaine, lance la
conversion** :

```sh
npm i --no-save sharp
node tools/opt-images.js
```

`tools/opt-images.js` convertit tous les `.png` de `assets/backgrounds`,
`banners`, `ui`, `fx` et `ranks` en `.webp`, **et met à jour les chemins
dans `css/style.css`** pour qu'ils pointent sur les `.webp`. Il ne touche
pas aux dossiers `chests/` (déjà convertis) ni `adversaires/` (déjà légers).

### Ce qu'aucun prompt ne doit oublier

Un générateur d'images ajoute spontanément du texte illisible, une
signature, un cadre décoratif et une vignette noire. Le bloc de style
ci-dessous les interdit explicitement. **Ne le retire pas.**

---

## 2. LE BLOC DE STYLE — à coller UNE FOIS, en tête de la conversation

Ouvre une conversation ChatGPT, colle ce bloc tel quel, puis enchaîne les
prompts des sections suivantes. Le modèle garde la charte d'une image à
l'autre, et les soixante planches sortent du même atelier — ce qui compte
plus que la qualité de chacune prise séparément.

```
Tu vas me générer une série d'illustrations pour un jeu d'échecs
fantastique. Voici la CHARTE GRAPHIQUE, applique-la à TOUTES les images que
je vais te demander, sans que j'aie à la répéter.

UNIVERS : un atelier d'alchimiste-forgeron, éclairé à la lampe à huile et à
la forge. Ni médiéval sale, ni steampunk à engrenages : un lieu de travail
savant, du métal ouvré, du verre, de la pierre taillée, des braises.

TECHNIQUE : illustration peinte numérique, matières lisibles (marbre,
laiton, cuivre oxydé, chêne huilé, ardoise). Coups de pinceau visibles.
PAS de rendu 3D plastique, PAS de style cartoon, PAS de photographie, PAS
de pixel art, PAS d'anime.

PALETTE, stricte, et c'est le point le plus important :
- fonds et ombres : ardoise bleu-vert, de #1c242b à #31404a ;
- métaux et lumière : laiton doré chaud, #d0a950 et #f0d189 ;
- lueurs d'alchimie : vert-de-gris de cuivre oxydé, #3fd0b2 ;
- feu et danger : braise orangée, #f26a3d.
Aucune autre couleur dominante. Pas de magenta, pas de bleu roi, pas de
vert sapin.

LUMIÈRE : chaude et dirigée (une source, latérale ou basse), ombres
franchement BLEUES. Contraste MOYEN : l'image doit rester lisible. Ni un
aplat noir, ni une image délavée. Pas de vignette noire dans les angles.

INTERDITS ABSOLUS, sur toutes les images : aucun texte, aucune lettre,
aucun chiffre, aucun symbole écrit, aucune signature, aucun watermark,
aucun logo, aucun cadre décoratif ajouté, aucune bordure, aucun personnage
qui regarde l'objectif sauf si je le demande.

Réponds juste « compris », et attends mes demandes une par une.
```

---

## 3. LES FONDS D'ÉCRAN — `assets/backgrounds/`

Un fond doit **rester un fond**. Le jeu les affiche à 26–40 % d'opacité,
désaturés, et éteint le centre de l'image au masque radial : c'est là que
vivent les titres et les boutons. D'où la règle de composition, valable
pour les onze : **le centre est vide et sombre, l'action est sur les
bords.**

Tous en **format paysage (1536 × 1024)**, sauf indication contraire.

| Fichier | Écran | Ce qu'on y voit |
|---|---|---|
| `main-page.png` | menu principal (face JOUER) | l'atelier, vu de loin |
| `armees.png` | face « Mes armées » | l'établi de composition |
| `armurerie.png` | face « Armurerie » | les étagères de créatures |
| `magasin.png` | face « Magasin » | le comptoir du marchand |
| `adversaires.png` | page « Les Adversaires » | la galerie des portraits |
| `voie.png` | page « Diagonale de la Puissance » | l'ascension |
| `recompenses.png` | page « Récompenses » | le trésor |
| `comptes.png` | page « Comptes » | le registre |
| `atelier.png` | composition d'armée IA | la table de plans |
| `combat-intro.png` | présentation des armées | la lice, avant le choc |
| `duel-wait.png` | attente d'un adversaire en ligne | le seuil |
| `table.png` | **sous le plateau** — format **carré** | le bois de l'établi |
| `lore-1.png` … `lore-4.png` | les 4 pages d'introduction — format **portrait** | l'histoire |

### `main-page.png` — le menu principal

```
Format paysage. Un vaste atelier d'alchimiste-forgeron vu en plan large,
depuis l'entrée. Au fond à gauche, une forge dont les braises éclairent la
salle en orange ; à droite, un mur d'étagères de fioles et de grimoires
éclairé par une lampe à huile en laiton. Au plafond, des chaînes et des
alambics suspendus. LE CENTRE DE L'IMAGE EST VIDE ET SOMBRE : juste le sol
de dalles et de la poussière en suspension dans un rai de lumière. Aucune
créature, aucun personnage, aucune table au milieu. Profondeur, brume
lumineuse, échelle monumentale.
```

### `armees.png` — l'établi de composition

```
Format paysage. Un grand établi de chêne vu de face, occupant le bas et les
côtés du cadre. Dessus, posés à plat : des pièces d'échecs de marbre
inachevées, des ciseaux à pierre, un compas de laiton, des chutes de
feutre vert. Une lampe de laiton à gauche jette une lumière chaude en
rasant le bois. LE CENTRE DU CADRE EST DÉGAGÉ, simple bois nu dans la
pénombre. Vu légèrement en plongée.
```

### `armurerie.png` — les étagères

```
Format paysage. Une salle voûtée dont les deux murs latéraux sont couverts
d'étagères de bois sombre chargées de socles vides, de coffres ferrés, de
statuettes de marbre sous cloches de verre. Une allée centrale VIDE ET
SOMBRE mène vers le fond. Lumière de vert-de-gris (#3fd0b2) émanant des
cloches, et une lampe de laiton chaude au premier plan à droite. Symétrie
frontale, perspective à un point de fuite au centre.
```

### `magasin.png` — le comptoir

```
Format paysage. Le comptoir d'un marchand alchimiste, vu de derrière le
client : un long plan de bois patiné traverse le bas du cadre. Derrière,
un mur de casiers, une balance à plateaux de laiton, des bourses de cuir,
des perles de verre vert-de-gris dans des coupelles. LE HAUT ET LE CENTRE
DU CADRE RESTENT SOMBRES ET VIDES. Lumière chaude venant de la gauche,
poussière dans l'air.
```

### `adversaires.png` — la galerie

```
Format paysage. Un long couloir de pierre dont les deux murs portent des
cadres de portraits VIDES — des cadres de laiton et de bois ouvragés,
accrochés en rangée, dont la toile est noire et illisible. Le couloir
s'enfonce vers un fond obscur. LE CENTRE EST VIDE. Éclairage de bougies
posées sur des consoles, halo chaud sur chaque cadre, ombres bleues au sol.
```

### `voie.png` — l'ascension

```
Format paysage. Un immense escalier de pierre en diagonale, montant du coin
inférieur gauche vers le coin supérieur droit, à flanc de tour intérieure.
Chaque palier porte un brasero allumé, de plus en plus lumineux vers le
haut. Le reste du cadre est de la maçonnerie sombre et du vide. AUCUN
PERSONNAGE. Sensation de hauteur et d'effort, brume dorée dans le haut.
```

### `recompenses.png` — le trésor

```
Format paysage. Une chambre forte basse de plafond. Sur les côtés du cadre,
empilés contre les murs : des coffres ferrés fermés, des sacs de toile,
des colonnes de perles de verre vert-de-gris, des lingots de laiton. LE
CENTRE DU SOL EST VIDE, dallé, dans la pénombre. Un unique rai de lumière
chaude tombe du haut à gauche. Richesse ancienne et rangée, pas un tas
d'or de dragon.
```

### `comptes.png` — le registre

```
Format paysage. Un pupitre de scribe en bois sombre vu de trois quarts, sur
la gauche du cadre, portant un grand registre ouvert aux pages illisibles
(AUCUN texte lisible), un encrier de laiton, une plume, un cachet de cire.
À droite, un mur de casiers à parchemins roulés. Le centre du cadre est un
mur nu dans l'ombre. Lumière de chandelle, très chaude, ombres bleues.
```

### `atelier.png` — la table de plans

```
Format paysage. Une grande table de travail vue à la verticale, en plongée
totale, couverte de plans techniques dessinés à l'encre sur papier bistre
— des schémas de mouvements, des grilles, des cercles de compas — mais
AUCUN texte lisible. Des poids de laiton retiennent les coins des feuilles.
Le centre de la table est laissé libre. Lumière chaude et rasante venant du
haut du cadre.
```

### `combat-intro.png` — la lice

```
Format paysage. Une arène de pierre circulaire vue au ras du sol, à hauteur
d'homme. Deux braseros de laiton se font face, un à gauche, un à droite,
flammes hautes. Entre eux, LE CENTRE EST TOTALEMENT VIDE : du sable, de la
poussière qui se soulève. Le fond est une muraille sombre. Tension avant le
choc, lumière orange latérale double, ombres longues et bleues.
```

### `duel-wait.png` — le seuil

```
Format paysage. Une porte de bronze massive, fermée, vue de face au fond
d'une salle vide. Un halo de vert-de-gris (#3fd0b2) filtre par ses
jointures. Le reste de la salle est sombre, dallée, sans meuble. Attente,
silence, symétrie parfaite. Aucun personnage.
```

### `table.png` — le bois sous le plateau (format CARRÉ)

```
Format carré. Vue à la verticale, en plongée totale, d'un plan de travail
en chêne huilé très ancien : veines profondes, entailles de ciseau, taches
d'encre et de cire, un cerne de verre. Uniquement le bois, cadre rempli,
AUCUN objet dessus, aucune bordure, aucun bord de table visible. Lumière
chaude et diffuse, légèrement plus vive au centre.
```

### `lore-1.png` … `lore-4.png` — les quatre pages du Lore (format PORTRAIT)

Ce sont les seules images du jeu qui ont le droit de **se voir** : elles
sont affichées à 44 % d'opacité, en fondu vers le bas, derrière le texte
d'introduction. Composition : **sujet dans le tiers supérieur, bas du cadre
sombre et vide** (le texte s'y pose).

```
[lore-1] Format portrait. Un ciel d'orage bleu ardoise au-dessus d'une
plaine de pierre nue. Au centre en haut, une immense sphère de verre
fissurée flotte, traversée d'une lueur de vert-de-gris. Le bas du cadre est
une terre sombre et vide. Solennel, désolé, monumental.
```

```
[lore-2] Format portrait. Une main de forgeron, en haut du cadre, verse un
métal en fusion doré dans un moule en forme de pièce d'échecs. Étincelles,
fumée, lumière orange intense sur les avant-bras. Le bas du cadre est
l'obscurité de l'atelier. Gros plan, matière, chaleur.
```

```
[lore-3] Format portrait. Une créature de marbre à demi taillée s'anime sur
son socle, en haut du cadre : des veines de lumière vert-de-gris courent
dans la pierre et éclairent l'atelier autour d'elle. Le bas du cadre est
sombre et vide. Émerveillement, silence, première étincelle de vie.
```

```
[lore-4] Format portrait. Deux armées de statuettes de marbre se font face
sur un damier de pierre immense, vues de très haut et de loin, en haut du
cadre. Entre les deux lignes, un espace vide balayé de brume dorée. Le bas
du cadre s'enfonce dans l'ombre. Épique, distant, avant la première
bataille.
```

---

## 4. LES BANNIÈRES DE TITRE — `assets/banners/`

Un bandeau ouvragé posé **derrière** le titre de la page, à la place du
titre nu sur du vide. Le texte reste du texte — il se redimensionne, il se
lit par un lecteur d'écran : **la planche ne porte donc AUCUN mot.**

Format **paysage (1536 × 1024)**. Le jeu n'en garde qu'une **large bande
centrale**, rognée en `cover` : compose le motif **au milieu de la
hauteur**, le haut et le bas du cadre peuvent rester noirs, ils seront
coupés. Les deux extrémités gauche et droite sont éteintes en fondu par le
jeu — inutile d'y soigner quoi que ce soit.

| Fichier | Page |
|---|---|
| `magasin.png` | Magasin |
| `adversaires.png` | Les Adversaires |
| `voie.png` | Diagonale de la Puissance |
| `recompenses.png` | Récompenses |

```
[magasin] Format paysage. Une enseigne de marchand en laiton martelé,
horizontale, très allongée, centrée dans la hauteur du cadre : une plaque
nue encadrée de deux volutes, avec une petite balance à plateaux au centre
et deux anneaux de suspension aux extrémités. LA PLAQUE EST VIDE, AUCUN
TEXTE. Fond noir uni au-dessus et au-dessous. Lumière chaude, métal usé.
```

```
[adversaires] Format paysage. Un bandeau horizontal de bois sombre sculpté,
très allongé, centré dans la hauteur : deux masques de théâtre en bronze se
faisant face aux extrémités, une frise de laiton entre eux, le centre du
bandeau LISSE ET VIDE. Fond noir uni au-dessus et au-dessous.
```

```
[voie] Format paysage. Un bandeau horizontal de pierre gravée, très
allongé, centré dans la hauteur : une frise en dents de scie ascendante de
gauche à droite, incrustée de laiton, deux braseros minuscules aux
extrémités. Le centre est LISSE ET VIDE, AUCUN TEXTE. Fond noir uni
au-dessus et au-dessous.
```

```
[recompenses] Format paysage. Un bandeau horizontal en laiton et velours,
très allongé, centré dans la hauteur : deux palmes de laurier en laiton se
rejoignant aux extrémités, une bande de velours sombre au milieu,
entièrement LISSE ET VIDE. Quelques perles de verre vert-de-gris serties
aux jonctions. Fond noir uni au-dessus et au-dessous.
```

---

## 5. LE MOBILIER — `assets/ui/`

### `cadre-plateau.png` — le cadre de l'échiquier

C'est **la seule planche du jeu dont le centre doit être entièrement
transparent** : elle est posée en surimpression sur le plateau, et le jeu
joue à travers. Format **carré**, PNG à canal alpha.

```
Format carré, FOND ENTIÈREMENT TRANSPARENT (PNG avec canal alpha). Un cadre
carré vide, vu strictement de face, sans perspective : une baguette de
chêne sombre de largeur régulière, ferrée aux quatre angles par des
équerres de laiton rivetées. Le cadre occupe exactement le bord du carré et
NE DÉBORDE PAS. TOUT L'INTÉRIEUR DU CADRE EST VIDE ET TRANSPARENT — pas de
damier, pas de fond, pas d'ombre portée à l'intérieur. Les quatre côtés
sont identiques, les quatre angles identiques. Lumière chaude venant du
haut à gauche.
```

### `ornement-coin.png` — l'angle des cartes

Le jeu pose **la même planche aux quatre angles** d'une carte, sans la
retourner (une couche de fond ne se transforme pas). Elle doit donc être
**symétrique par rapport à sa diagonale**. Format **carré**, PNG à canal
alpha.

```
Format carré, FOND ENTIÈREMENT TRANSPARENT (PNG avec canal alpha). Un
ornement d'angle en filigrane de laiton, occupant le coin SUPÉRIEUR GAUCHE
du carré et se dégradant vers le centre : deux volutes fines partant du
coin, l'une vers la droite, l'autre vers le bas, RIGOUREUSEMENT SYMÉTRIQUES
par rapport à la diagonale du carré. Trait fin, ciselé, laiton patiné, très
peu de matière — c'est une dentelle de métal, pas une plaque. Le reste du
carré est entièrement transparent.
```

### `laiton.png` et `vert-de-gris.png` — le grain des boutons

Posées en `overlay` sur la couleur plate des boutons : elles ne font que
grainer le métal. Format **carré**, et le prompt doit dire **tuilable**
(sans quoi la répétition se verra).

```
[laiton] Format carré. Une texture de laiton martelé vue à plat, SANS
AUCUN objet ni relief identifiable : uniquement le grain du métal, de fines
rayures de polissage, un très léger piqué de corrosion. TUILABLE / SEAMLESS
(les bords gauche-droite et haut-bas se raccordent parfaitement). Éclairage
parfaitement uniforme, sans reflet localisé, sans ombre, sans vignette.
Contraste TRÈS faible : c'est un grain, pas une image.
```

```
[vert-de-gris] Format carré. Une texture de cuivre oxydé vue à plat, SANS
AUCUN objet : uniquement la patine vert-de-gris (#3fd0b2) mouchetée sur le
cuivre sombre, granuleuse et irrégulière. TUILABLE / SEAMLESS. Éclairage
uniforme, sans reflet, sans ombre, sans vignette. Contraste TRÈS faible.
```

### `socle.png` — le présentoir des créatures

```
Format carré, FOND ENTIÈREMENT TRANSPARENT (PNG avec canal alpha). Un socle
de pierre elliptique vu presque de profil, à hauteur de table, occupant le
bas du carré : une galette de marbre gris veiné, chanfreinée, posée sur
rien. AUCUNE créature dessus, le dessus est vide. Une ombre douce sous le
socle. Le haut du carré est entièrement transparent.
```

---

## 6. LES EFFETS — `assets/fx/`

**Tous sur fond parfaitement noir**, sans exception : le jeu les fond en
`screen`, le noir disparaît, seule la lumière reste. Un fond gris foncé au
lieu de noir laisserait un rectangle visible à l'écran.

| Fichier | Format | Quand ça se voit |
|---|---|---|
| `halo-victoire.png` | carré | derrière le verdict, en cas de victoire |
| `onde-choc.png` | carré | au moment du « VS » de l'entrée en combat |
| `braises.png` | portrait | pendant l'annonce du résultat |
| `eclat-capture.png` | carré | sur la case, au moment d'une capture |
| `flamme-echec.png` | paysage | derrière la barre d'état, en cas d'échec |
| `cercle-runique.png` | carré | derrière une créature qu'on vient de débloquer |

```
[halo-victoire] Format carré, FOND PARFAITEMENT NOIR. Une explosion de
rayons de lumière dorée (#f0d189) partant du centre exact du cadre vers
l'extérieur : une trentaine de faisceaux fins et longs, de longueurs
inégales, plus une nappe lumineuse au centre. Les rayons s'éteignent
complètement avant d'atteindre les bords. Rien d'autre : pas d'objet, pas
de sol, pas de personnage, juste la lumière sur le noir.
```

```
[onde-choc] Format carré, FOND PARFAITEMENT NOIR. Un anneau de choc vu de
face, centré : un cercle de lumière orange braise (#f26a3d) d'épaisseur
irrégulière, déchiqueté, entouré d'un nuage de poussière et de petits
éclats projetés vers l'extérieur. LE CENTRE DE L'ANNEAU EST NOIR ET VIDE.
L'anneau s'éteint avant les bords du cadre.
```

```
[braises] Format portrait, FOND PARFAITEMENT NOIR. Une pluie ascendante de
braises et d'étincelles orange et dorées, de tailles très variées, réparties
sur toute la hauteur, plus denses en bas qu'en haut. Chacune est un petit
point lumineux avec un halo. Aucune flamme, aucun objet, aucune fumée
grise. TUILABLE VERTICALEMENT : le haut et le bas du cadre se raccordent.
```

```
[eclat-capture] Format carré, FOND PARFAITEMENT NOIR. Un impact vu de face,
centré : un éclair blanc-doré au point d'impact, d'où partent une dizaine
d'éclats de marbre et une gerbe d'étincelles orange, dans toutes les
directions. Compact, contenu dans le tiers central du cadre, s'éteignant
complètement avant les bords.
```

```
[flamme-echec] Format paysage, FOND PARFAITEMENT NOIR. Une bande
horizontale de flammes basses et de braises orange (#f26a3d), courant sur
toute la largeur du cadre au niveau du milieu de la hauteur, comme un feu
qui lèche le bas d'un mur. Les flammes sont basses, larges, sans forme
reconnaissable. Le haut et le bas du cadre sont parfaitement noirs.
```

```
[cercle-runique] Format carré, FOND PARFAITEMENT NOIR. Un cercle
d'alchimie vu strictement de face, centré, tracé en lumière vert-de-gris
(#3fd0b2) : deux anneaux concentriques, une géométrie de segments et de
petits cercles entre eux, et des marques abstraites régulièrement réparties
— DES FORMES GÉOMÉTRIQUES SEULEMENT, aucune lettre, aucun chiffre, aucune
rune d'un alphabet existant. Le centre du cercle est vide et noir. Trait
fin et lumineux, s'éteignant avant les bords.
```

---

## 7. LES MÉDAILLONS DE RANG — `assets/ranks/`

Sept rangs, sept médaillons. Ils s'affichent à trois endroits : le grand
bandeau d'ELO de la Diagonale (52 px), chaque bandeau de rang de la route
(26 px) et la fenêtre de fin de partie (30 px). **À 26 px, un dessin
compliqué n'est plus qu'une tache** : la consigne « une seule silhouette
centrale, très lisible en tout petit » n'est pas négociable.

Le nom du fichier est exactement l'id du rang : aucune liste à mettre à
jour, `rankMedalHTML()` (`js/main.js`) construit le chemin depuis l'id, et
retire l'image d'elle-même si le fichier manque.

Format **carré**, PNG à canal alpha, fond transparent.

| Fichier | Rang | ELO | Matière |
|---|---|---|---|
| `bois.png` | Bois | 0–199 | chêne brut |
| `pierre.png` | Pierre | 200–499 | granit taillé |
| `bronze.png` | Bronze | 500–799 | bronze coulé |
| `acier.png` | Acier | 800–1199 | acier bleui |
| `obsidienne.png` | Obsidienne | 1200–1499 | verre volcanique |
| `argent.png` | Argent | 1500–1999 | argent poli |
| `or.png` | Or Légendaire | 2000+ | or massif |

Prompt commun, en remplaçant la dernière ligne :

```
Format carré, FOND ENTIÈREMENT TRANSPARENT (PNG avec canal alpha). Un
médaillon circulaire vu strictement de face, centré, occupant environ 85 %
du cadre. Structure identique d'un médaillon à l'autre : un anneau extérieur
uni, et au centre UNE SEULE forme en relief, massive et très lisible même
réduite à 26 pixels. Pas de petits détails, pas de gravure fine, pas de
ruban, pas d'étoile, aucun texte ni chiffre. Éclairage chaud venant du haut
à gauche, ombre propre en bas à droite.
MATIÈRE ET MOTIF : …
```

| Fichier | Ligne à mettre à la place de « MATIÈRE ET MOTIF » |
|---|---|
| `bois.png` | Chêne brut à peine dégrossi, échardes, cerclage de fer noir. Au centre, un pion très simple taillé à la hache. |
| `pierre.png` | Granit gris taillé au ciseau, arêtes vives, éclats. Au centre, une tour massive et trapue. |
| `bronze.png` | Bronze coulé et patiné, coulures figées. Au centre, un heaume fermé, de face. |
| `acier.png` | Acier bleui au feu, poli miroir, reflets froids. Au centre, deux épées croisées, très épaisses. |
| `obsidienne.png` | Verre volcanique noir, cassure conchoïdale, arêtes coupantes, reflet violet sombre. Au centre, une flamme dressée. |
| `argent.png` | Argent poli miroir, très clair, arêtes nettes. Au centre, une couronne à cinq pointes. |
| `or.png` | Or massif brillant, laiton chaud, halo lumineux autour du médaillon. Au centre, un soleil à huit rayons épais. |

---

## 8. LES PORTRAITS D'ADVERSAIRES — `assets/adversaires/`

Douze portraits, déjà entièrement spécifiés dans
**`assets/adversaires/README.md`** : les douze sujets y sont, un par
adversaire, avec leur ELO.

Le prompt de base qui s'y trouve a été écrit pour l'ancienne palette, très
sombre. Avec le bloc de style de ce fichier en tête de conversation, il se
résume à :

```
Portrait carré, buste centré, épaules coupées en bas du cadre, fond
d'atelier très assombri et flou. Le visage doit rester lisible réduit à
26 pixels : lumière franche sur les traits, pas de contre-jour. Fond
sombre uni derrière la tête.
SUJET : … (voir le tableau de assets/adversaires/README.md)
```

---

## 9. LES DEUX COFFRES QUI MANQUENT — `assets/chests/dame/` et `roi/`

Quatre coffres sur six se brisent en séquence (Pion, Cavalier, Fou, Tour).
La Dame et le Roi gardent le couvercle dessiné en CSS **faute de
planches**. Il en faut **cinq par pièce**, et rien d'autre : les trois
dernières (explosion, explosion pleine, socle vide) sont communes et
existent déjà dans `assets/chests/forall/`.

`assets/chests/README.md` décrit la mécanique complète. Les trois
contraintes qui décident du résultat :

1. **Cadrage rigoureusement identique** d'une planche à l'autre, et
   identique à celui des quatre coffres existants — les planches sont
   empilées, un socle qui bouge d'un pixel fait glisser toute la scène.
   Le plus sûr : **joindre `assets/chests/tour/01-intact.webp` au prompt**
   et demander « même cadrage, même socle, même échelle, seule la pièce
   change ».
2. **Lumière CHAUDE et elle seule colorée** — surtout pas violette pour la
   Dame ni bleue pour le Roi. C'est le code qui tourne la teinte vers celle
   du rang ; une planche déjà violette échappe au filtre.
3. **Fond noir**, format **portrait** (1024 × 1536).

```
Format portrait, FOND NOIR, sans bord clair. Une statuette de marbre blanc
posée sur un socle de pierre circulaire, vue de face, centrée, occupant les
deux tiers de la hauteur. Éclairage CHAUD ET DORÉ uniquement (or à environ
35° de teinte), venant du bas ; le marbre reste neutre, seule la lumière est
colorée. Aucun autre objet, aucun décor, aucune couleur froide.
LA PIÈCE : une reine d'échecs, haute et élancée, couronne à pointes.
ÉTAT : …
```

Les cinq états, à mettre à la place de « ÉTAT », en régénérant **la même
image** à chaque fois (dans ChatGPT : « reprends exactement l'image
précédente et ajoute… ») :

| Fichier | ÉTAT |
|---|---|
| `01-intact.webp` | La statuette est intacte, sans aucune fissure. |
| `02-fissure.webp` | Une unique fissure lumineuse dorée court sur le corps de la statuette. |
| `03-fissures.webp` | Un réseau de fissures dorées lumineuses s'étend sur toute la statuette. |
| `04-brisures.webp` | La statuette est saturée de fissures incandescentes, la lumière déborde des cassures. |
| `05-eclats.webp` | La statuette se rompt : des éclats de marbre se détachent et sont projetés, le feu doré jaillit de l'intérieur. |

Pour le Roi (`assets/chests/roi/`), même série, en remplaçant la ligne
« LA PIÈCE » par : *un roi d'échecs, massif et large d'épaules, surmonté
d'une croix*.

Les cinq planches sortent en PNG et doivent finir en `.webp` **exactement
1024 × 1536** — c'est la commande donnée dans `assets/chests/README.md`.
Puis décommenter la ligne correspondante en tête de `js/chest-break.js`.

---

## 10. Récapitulatif : les soixante chemins

```
assets/backgrounds/  main-page.png  armees.png  armurerie.png  magasin.png
                     adversaires.png  voie.png  recompenses.png  comptes.png
                     atelier.png  combat-intro.png  duel-wait.png
                     table.png  lore-1.png  lore-2.png  lore-3.png  lore-4.png
assets/banners/      magasin.png  adversaires.png  voie.png  recompenses.png
assets/ui/           cadre-plateau.png  ornement-coin.png  socle.png
                     laiton.png  vert-de-gris.png
assets/fx/           halo-victoire.png  onde-choc.png  braises.png
                     eclat-capture.png  flamme-echec.png  cercle-runique.png
assets/ranks/        bois.png  pierre.png  bronze.png  acier.png
                     obsidienne.png  argent.png  or.png
assets/adversaires/  cendre.png  suie.png  bruyere.png  orpiment.png
                     vitriol.png  cinabre.png  antimoine.png  mercure.png
                     plombagine.png  salamandre.png  instructeur.png  athanor.png
assets/chests/dame/  01-intact.webp … 05-eclats.webp
assets/chests/roi/   01-intact.webp … 05-eclats.webp
```

**Par quoi commencer, si tu n'en fais que cinq :** `main-page.png` (c'est
le premier écran), les sept `ranks/` (c'est ce qu'on regarde le plus
souvent), `cadre-plateau.png` (c'est l'écran où on passe le plus de temps),
`halo-victoire.png` (c'est le moment qu'on veut revivre) et
`table.png`. Le reste est du confort.
