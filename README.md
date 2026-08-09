# Epic Chess : Architecture du projet

Ce projet est un jeu d'échecs variant ("Epic Chess") en HTML/CSS/JS pur,
**sans build step, sans modules ES, sans dépendance externe** (hors polices
Google Fonts). Il s'ouvre en double-cliquant sur `index.html`, aucun serveur
n'est nécessaire.

## Pourquoi cette architecture

Le fichier était à l'origine un unique `.html` de ~3000 lignes. Il a été
découpé en modules **par domaine fonctionnel** pour qu'on puisse te donner
(ou que tu puisses éditer) un seul fichier à la fois (par exemple
`css/style.css` ou `js/tournoi.js`) sans avoir besoin de relire tout le
reste, du moment que la structure ci-dessous est connue.

Tous les scripts sont chargés via des balises `<script src="...">`
classiques (pas de `import`/`export`, pas de bundler). Toutes les variables
et fonctions sont donc dans un espace de noms global partagé : c'est
volontaire et c'est ce qui permet au moteur de jeu, au rendu, et à l'IA de
se parler directement.

## Arborescence

```
epic-chess/
├── index.html              # Coquille HTML légère : tout le markup des pages
│                            # + chargement ordonné des <script src="...">
├── README.md                # Ce fichier
├── robots.txt               # Autorise les crawlers, y compris ceux des IA
├── sitemap.xml              # Une seule URL (le jeu est une SPA)
├── llms.txt                 # Résumé factuel du jeu pour les moteurs IA
├── site.webmanifest         # Métadonnées d'installation (icône, couleurs)
├── favicon.svg              # Icône d'onglet (fiole d'alchimiste)
├── apple-touch-icon.png     # 180×180, écran d'accueil iOS
├── og-image.png             # 1200×630, aperçu de partage (Discord, X...)
├── assets/
│   └── boards/              # Textures d'échiquier en SVG procédural
│       ├── bois.svg          # (générées par tools/gen-boards.js, ne pas
│       ├── pierre.svg        #  éditer à la main : relancer le script)
│       ├── acier.svg
│       ├── argent.svg
│       └── or.svg
├── info.html                # Page /info : présentation + FAQ indexables
│                            # (déplacées hors de la page de connexion)
├── .github/
│   └── workflows/
│       └── supabase-keepalive.yml  # Ping quotidien : empêche le projet
│                                   # Supabase gratuit de se mettre en veille
├── tools/
│   ├── gen-boards.js        # Générateur des textures d'échiquier (node)
│   ├── gen-social.js        # Régénère og-image.png et apple-touch-icon.png
│   └── smoke-test.js        # `npm test` : rejoue tout le parcours du jeu
│                            #  dans un vrai navigateur (voir plus bas)
├── css/
│   └── style.css            # Tout le CSS, organisé en sections [TAG] commentées
└── js/
    ├── data-pieces.js       # Données pures (pièces, rangs, INSTRUCTOR,
    │                          # BOARD_SKINS, CHESTS, déblocages)
    ├── piece-art.js         # Logos de pièces dessinés en SVG (remplace les emojis)
    ├── main.js               # État global partagé + helpers (showPage, showNotif...)
    ├── cube-nav.js           # Navigation principale par cube 3D (CSS). Déplace
    │                          # armées/partie/réserve/voie dans les faces.
    ├── accounts.js           # Comptes locaux (localStorage), connexion
    ├── economy.js            # Possession des pièces, mise en jeu, coffres, séries
    ├── ai-level-modal.js     # Réduit à selectedAILevel/selectedTimeControl
    ├── builder.js            # Page de composition d'armée
    ├── armies.js             # Pages "Mes armées" / "Armées IA" + génération IA
    ├── combat-intro.js       # Page d'intro combat (VS)
    ├── rules-engine.js       # Moteur de règles pur (coups, échecs, exécution)
    ├── combat-music.js       # Musique de combat en boucle
    ├── cinematics.js         # Cinématiques d'entrée en combat et d'issue
    ├── game-render.js        # Rendu plateau, drag&drop, clics, historique
    ├── ai-engine.js          # Évaluation (dont les POUVOIRS), minimax, Worker IA
    ├── game-flow.js          # Démarrage partie, fin de partie, résultat
    ├── voie.js                # Page "Voie des Victoires" (ELO, rangs, jalons)
    ├── economy-ui.js         # Page "Réserve" : inventaire, coffres, échiquiers
    ├── tuto-drill.js         # Exercice de déplacement d'une créature débloquée
    ├── tutorial.js           # Tutoriel : 4 batailles scriptées + visite guidée
    ├── tournoi.js             # Mode Tournoi + modal d'analyse replay
    ├── settings-admin.js     # Panneau réglages + mode Administrateur
    └── multiplayer.js        # Parties en ligne (Supabase Realtime)
```

## Les systèmes à comprendre avant d'éditer

### 1. L'économie des pièces (`js/economy.js`)

C'est la mécanique centrale et celle qui a le plus de ramifications. Une
pièce se **possède en exemplaires** ; l'engager dans une partie la
**retire de l'inventaire au lancement** (`economyCommit`), et la fin de
partie décide de ce qui revient (`economySettle`) : rien en cas de défaite,
les survivants en cas de victoire ou de nulle. Les pions et pièces standard
qui complètent le plateau (`FREE_PIECE_IDS`) ne se possèdent pas, sinon une
défaite coûterait huit pions et le jeu deviendrait injouable.

Toute nouvelle façon de démarrer une partie DOIT appeler `economyCommit()`,
et toute nouvelle façon de la terminer DOIT appeler `economySettle()`, sinon
les exemplaires engagés restent hors inventaire. Le garde-fou est
`economyRecoverOrphanEngagement()`, appelé à la connexion : il rend les
pièces d'une partie interrompue.

### 2. Les logos de pièces (`js/piece-art.js`)

Les émojis ont été remplacés par des silhouettes SVG. `pieceSVG(id,color)`
rend une pièce plein format (plateau), `pieceIcon(id,color,tailleEm)` une
version en ligne (listes, journal des coups). Les deux camps partagent le
même dessin : seules les variables CSS `--pc-fill` / `--pc-line` changent.
Une pièce sans entrée dans `PIECE_ART` retombe sur un jeton neutre, le jeu
reste jouable.

**Piège** : plusieurs emplacements héritaient d'un `font-size` prévu pour
des émojis. Comme `pieceIcon` dimensionne en `em`, un `font-size:46px`
hérité produit une icône de 120 px qui déborde. La section `[ICON-SIZES]`
de `css/style.css` fixe donc la taille en pixels partout où c'est le cas.

### 3. Les deux parcours de combat (`js/combat-intro.js`)

`#page-combat` a **deux modes**, portés par `combatMode` :

- `'online'` : COMBAT, le gros bouton du menu. On cherche un adversaire
  humain ; la page montre l'armée engagée face à un adversaire inconnu et
  porte les trois façons d'en trouver un.
- `'ia'` : bouton secondaire « Affronter l'Instructeur ». La page montre les
  deux armées en présence.

`renderCombatPage(armee, mode)` est le point d'entrée unique : tout appelant
doit passer le mode, sinon on retombe sur `'ia'`. Les deux rangées de boutons
existent dans le HTML et s'excluent (`#cactions-online` / `#cactions-ia`).

### 4. L'IA (`js/ai-engine.js`)

Il n'y a plus qu'un adversaire, `INSTRUCTOR`, qui joue toujours à pleine
puissance. `evalBoard()` combine l'évaluation classique (matériel, tables
position-carrés, mobilité, structure de pions) et `evalPowers()`, qui note
les **capacités spéciales** : paralysie de la Méduse, protection du Prêtre,
zone de destruction du Typhon, charge du Dresseur, domination du Grand
Maître, ancrage du Garde de Pierre.

Ces deux fonctions sont sérialisées dans le Web Worker : si vous en ajoutez
une nouvelle, **ajoutez-la aussi à la liste `fns` de `getWorkerCode()`**,
sinon le Worker plantera et l'IA basculera silencieusement sur le thread
principal (jouable, mais l'interface se figera pendant sa réflexion).

Trois points méritent d'être connus avant de toucher au moteur :

- **L'orientation des tables position-carrés** (`getPST`). La ligne 0 de
  `PAWN_PST` / `KING_MIDDLE_PST` est la rangée la plus AVANCÉE du camp
  considéré. Sur ce plateau, `r=0` est le fond des Noirs : un Blanc lit donc
  la table à `r`, un Noir à `7-r`. Les deux étaient inversés, ce qui donnait
  une prime de 7e rangée aux pions restés sur leur case de départ et poussait
  le roi vers le centre du plateau. La table des cavaliers étant symétrique,
  rien ne le trahissait à l'œil.
- **Les pouvoirs destructeurs font partie du coup.** `applyMoveQuick()`
  applique `applyCollateralOnBoard()` (rules-engine.js) : sans lui, la
  recherche voyait un Typhon comme un fou d'une case et ne jouait jamais le
  coup qui efface trois pièces. La même fonction est appelée par
  `moveLeavesKingInCheck()`, ce qui rend légale la parade « j'efface au
  Typhon la pièce qui me met en échec » — elle était refusée avant.
- **Le tri des coups n'a lieu qu'une fois.** `getAllMovesColor(…, unsorted)`
  saute son tri MVV/LVA quand `minimax` va de toute façon refaire le sien
  (table de transposition, killers, historique). La quiescence, elle, garde
  le tri : c'est son seul ordre.

### 5. Le tutoriel (`js/tutorial.js`)

Le savant parle, et le joueur AGIT. Le tutoriel se déroule en deux temps.

**Les quatre batailles scriptées.** Un compte neuf ne possède que son Roi et
sa Dame : les créatures s'obtiennent en jouant, et les trois premières
s'obtiennent ici. Chaque bataille oppose le joueur à un instructeur
volontairement faible (`TUTO_INSTRUCTORS` dans `data-pieces.js`, ajoutés à
`AI_INSTRUCTORS` après l'Instructeur normal), avec **la même armée des deux
côtés, posée en dur** (`tutoBuildBoard`) : personne ne perd parce qu'il a mal
composé. Une victoire ouvre un coffre au contenu **imposé** qui débloque une
créature (Alpha, Fourmi, Garde de Pierre), suivie de son exercice de
déplacement. Une défaite ne fait pas avancer : le savant propose la revanche,
autant de fois qu'il le faut.

Ces batailles passent par `startGame(true,false,tutoCfg)` : le troisième
argument impose le plateau et la couleur, **saute l'économie** (rien n'est
prélevé sur la Réserve, une promotion ne crédite rien) et court-circuite la
cinématique d'entrée. `triggerEndOfGame` les détourne vers `tutoOnBattleEnd` :
ni ELO, ni coffre de série, ni règlement de Réserve. **Aucune des quatre
batailles n'a de pendule** (`clockMin:0` partout) : le chronomètre arrive avec
les vraies parties.

**La visite du laboratoire.** Les étapes qui portent un `click` attendent un
vrai clic sur le vrai bouton : à la fin, le joueur a réellement tourné le
cube, composé une armée et ouvert sa Réserve.

Il se déclenche une seule fois, à la fermeture du parchemin d'accueil d'un
compte neuf (`tutoMaybeStart`), et se rejoue depuis les réglages
(`tutoStart(0)`). Deux drapeaux par compte : `tuto_done` (terminé) et
`tuto_step` (étape courante). La progression est sauvegardée à chaque étape et
reprise à la connexion suivante.

**Passer le tutoriel** (`tutoSkip`, bouton `#tuto-skip` à côté des répliques du
savant) donne exactement ce que le tutoriel aurait donné : les trois créatures
avec leurs exemplaires, plus une première armée tirée au hasard **parmi les
pièces réellement possédées** (`tutoBuildRandomArmy` — surtout pas
`generateAIArmy`, qui ignore l'économie et produirait une armée injouable).
Sans cette armée, on sortirait du tutoriel dans une armurerie vide, incapable
de lancer un combat.

**Si vous déplacez ou renommez un élément d'interface**, vérifiez les
sélecteurs `at` et `click` de `TUTO_STEPS`. Une cible absente ne casse rien
(l'étape devient un simple « Suivant »), mais elle perd son intérêt. Le
bouton COMBAT est un cas à part : il n'est pas guetté par un listener, c'est
`cube-nav.js` qui appelle `tutoInterceptCombat()` avant sa propre navigation.

### 6. L'exercice de déplacement (`js/tuto-drill.js`)

À l'ouverture d'une créature inédite (dans le tutoriel comme dans n'importe
quel coffre, voir `chestCeremonyClose`), une page s'ouvre avec la pièce seule
sur l'échiquier et cinq repères à ramasser. Ni tour par tour, ni adversaire.

Le point délicat : **tous les déplacements ne vont pas partout** (la Fourmi ne
recule pas, l'Alpha ne quitte ni la couleur ni la parité de sa case). Cinq
repères tirés au hasard seraient souvent impossibles à prendre. Ils sont donc
posés le long d'une **promenade de la pièce** (`drillLayDots`) : un chemin qui
les ramasse tous existe par construction. Si le joueur s'écarte et se coince,
`drillAllReachable` le détecte et l'invite à recommencer.

Le projecteur est un rectangle avec une `box-shadow` de 9999px qui assombrit
tout le reste ; il porte `pointer-events:none`, ce qui est **la condition**
pour que les étapes interactives fonctionnent : sans cela, le voile
intercepterait le clic destiné au bouton mis en lumière.

### 7. Les retours à l'écran (`js/main.js::showNotif`)

`showNotif()` avait été vidée : c'était une fonction sans corps. Or c'est le
**seul** retour du jeu sur une trentaine de refus — « Pseudo : 2 à 20
caractères », « Les mots de passe ne correspondent pas », « 3 pièces max »,
« Dépasse 24 points », « Pièce verrouillée », « Composez d'abord une armée ».
Tous ces boutons ne faisaient donc rien du tout, sans un mot : le jeu
paraissait cassé là où il refusait simplement une action.

Le bandeau est de retour, en bas à droite (le haut de l'écran appartient à la
barre de compte et au bouton de réglages), trois messages au plus, effacé au
clic. `showNotif(msg, 'err' | 'ok' | 'info')`. **Ne la revidez pas** : un
refus muet est un bug, pas un choix de sobriété.

### 8. L'appariement en ligne (`js/multiplayer.js`)

L'ancien algorithme appariait **les deux plus anciens**, point final : un
joueur à 120 ELO tombait donc régulièrement contre un joueur à 2000, ce qui,
dans un jeu où perdre coûte l'armée engagée, est la pire rencontre possible
pour les deux. Il supposait en plus que les deux navigateurs aboutiraient au
même calcul au même moment, alors que leurs horloges ne sont pas synchronisées.

Le nouveau tient en quatre règles :

1. **Fenêtre de niveau qui s'élargit** : ±120 ELO au départ, +120 toutes les
   8 secondes, ouverte à tous au bout de 48 (`mpEloWindow`).
2. **Un seul décideur** : le joueur qui attend depuis le plus longtemps
   choisit, parmi les candidats de sa fenêtre, le plus proche en ELO. Les
   autres ne calculent rien, ils répondent — plus aucun accord d'horloge
   n'est nécessaire.
3. **Poignée de main en deux temps** : `pair` → `pair-ok`. Sans confirmation
   au bout de 3,5 s, la proposition est abandonnée et la recherche reprend.
4. **Battement de ré-évaluation** (1 s) : « presence » n'émet un événement
   que lorsque quelqu'un entre ou sort, alors que la fenêtre, elle, s'élargit
   avec le temps.

L'écran de recherche (`mpRenderSearch`) affiche le temps écoulé, le nombre de
joueurs en attente et la fenêtre courante, et propose l'Instructeur au bout
de 40 secondes. Le salon d'attente a changé de nom (`epichess-lobby-v2`) :
les anciens clients ne peuvent pas s'y tromper de protocole.

## Le multijoueur et la mise en veille de Supabase

Le jeu en ligne repose sur Supabase Realtime. Un projet du **plan gratuit
s'endort après 7 jours sans activité** : le WebSocket ne répond alors plus et
le multijoueur tombe, sans que rien dans le jeu ne l'explique.

Deux réponses sont en place :

- `.github/workflows/supabase-keepalive.yml` appelle l'API REST du projet une
  fois par jour pour réarmer le compteur. Il demande deux secrets de dépôt,
  `SUPABASE_URL` et `SUPABASE_KEY` (voir l'en-tête du fichier). C'est un
  contournement, pas une garantie ; seul le plan Pro supprime le risque.
- `mpDiagnose()` (js/multiplayer.js) interroge l'API REST quand Realtime
  échoue, et distingue : joueur hors ligne, serveur injoignable, projet en
  pause, clé refusée, ou panne du seul service Realtime. Le message affiché
  dit ce qui se passe au lieu d'accuser le réseau du joueur.

## SEO / GEO : ce qu'il ne faut pas casser

Le site est une SPA : toutes les pages sauf `#page-login` sont en
`display:none` tant que le joueur n'est pas connecté. **Un robot ne voit
donc que la page de connexion**, qui ne contient plus que le formulaire.
Tout le texte indexable (présentation + FAQ) vit désormais dans
**`info.html`**, servi sur `https://epichess.app/info` grâce à
`cleanUrls: true` dans `vercel.json`, et atteignable depuis le jeu par le
petit bouton « i » en bas à gauche de la page de connexion
(`.login-info-btn`). Supprimer `info.html` ramènerait le site indexable à
~40 mots et Google recommencerait à fabriquer sa propre description à
partir des libellés de navigation.

Trois points de vigilance :

- **Les réponses de la FAQ existent en double** : en HTML visible dans le
  bloc `.lore` d'`info.html`, et en JSON-LD (`FAQPage`) dans le `<head>` du
  même fichier. Google invalide le balisage si les deux textes divergent :
  modifier l'un, c'est modifier l'autre. Le `<head>` d'`index.html` ne porte
  plus que `VideoGame`/`WebSite`.
- **Les chiffres du JSON-LD et de `llms.txt`** (18 créatures, 5 classes,
  budget 24 points, 7 rangs, 6 raretés de coffre) proviennent de
  `js/data-pieces.js` et `js/builder.js`. Ajouter une pièce ou un rang veut
  dire mettre ces deux fichiers à jour, sinon les moteurs de réponse IA
  citeront des données fausses.
- **`llms.txt`** est destiné aux moteurs de réponse (ChatGPT, Perplexity,
  Claude, AI Overviews) : c'est un résumé factuel en Markdown, pas une page
  marketing. Rester descriptif et exact.

Le domaine `https://epichess.app/` est codé en dur dans le `canonical`, les
balises Open Graph, le JSON-LD, `robots.txt` et `sitemap.xml`. Un
changement de domaine impose donc un `grep epichess.app` global.

`og-image.png` (1200×630) et `apple-touch-icon.png` (180×180) sont générés
à partir de rendus HTML, aux couleurs du thème. Piège si vous les
régénérez au navigateur headless : **une fenêtre de moins de ~500 px est
silencieusement élargie**, et la capture ressort tronquée. Rendre en grand
puis réduire via le facteur d'échelle (par exemple une fenêtre de 360 px
avec un facteur 0,5 pour obtenir 180 px).

## Ordre de chargement (`index.html`, en bas de page)

L'ordre des `<script>` est important car il n'y a pas de système de modules :
chaque fichier suppose que les globals des fichiers précédents existent déjà.

```
data-pieces.js → piece-art.js → main.js → cube-nav.js → accounts.js
→ economy.js → ai-level-modal.js → builder.js → armies.js → combat-intro.js
→ rules-engine.js → combat-music.js → cinematics.js → game-render.js
→ ai-engine.js → game-flow.js → voie.js → economy-ui.js → tuto-drill.js
→ tutorial.js
→ tournoi.js → settings-admin.js → multiplayer.js → (script inline) initApp()
```

`economy.js` doit venir après `accounts.js` (il utilise `accGet`/`accSet`) et
avant tous les modules de page qui affichent des stocks. `piece-art.js` doit
venir juste après `data-pieces.js` : à peu près tous les rendus l'utilisent.

`cube-nav.js` est chargé juste après `main.js` : il étend `showPage()` (la
navigation devient un cube 3D en CSS) et déplace à l'exécution les pages
`#page-armies` / `#page-game` dans les faces du cube (face de droite = "Mes
armées", face du haut = la partie). Il ne connaît QUE la face courante, les
rotations et le verrouillage, aucune logique de jeu. Le builder (composition
d'armée, `#page-builder`) n'est PAS une face du cube : c'est une page
secondaire (overlay) ouverte depuis "Mes armées" via "Nouvelle armée" ou
"Modifier". Les autres pages secondaires (voie, tournoi, combat, login)
restent aussi des overlays plein écran classiques affichés au-dessus du cube.

Si tu ajoutes un nouveau fichier JS, insère-le dans cette chaîne à l'endroit
qui correspond à ses dépendances (voir l'en-tête de chaque fichier, qui liste
explicitement ses dépendances et qui l'utilise).

## Vérifier que le jeu démarre encore (`npm test`)

Il n'y a ni build ni dépendance : rien ne signalait donc qu'un fichier venait
d'être cassé. Or tout est chargé par une chaîne de `<script>` dans un espace
de noms global partagé — une faute de frappe dans n'importe lequel casse tous
les suivants, et on ne le découvre qu'en ouvrant la page à la main.

`tools/smoke-test.js` ouvre le vrai jeu dans un vrai navigateur et refait le
parcours : création de compte, refus expliqué, tutoriel, réglages conservés,
partie contre l'Instructeur (avec un coup joué et la réponse de l'IA),
pendule, orientation des tables position-carrés, destruction du Typhon dans
la simulation de coup, rendu de la Réserve et de la Voie. Il échoue au
premier message d'erreur de la console.

```
npm i -D playwright && npx playwright install chromium   # une seule fois
npm test
```

Il ne fait **pas** partie du jeu : rien dans `index.html` ne le charge, il n'y
a toujours aucune dépendance de production, et le jeu continue de s'ouvrir en
double-cliquant sur `index.html`. Si Chromium est déjà présent sur la machine
mais dans une version que Playwright refuse, le script le retrouve tout seul
(ou suit `CHROMIUM_PATH`).

## Où éditer selon ce qu'on te demande

| Demande | Fichier(s) à éditer |
|---|---|
| Changer une couleur, un style, l'apparence d'une page | `css/style.css` (cherche le tag `[NOM-DE-PAGE]` en commentaire) |
| Ajouter/modifier une pièce (valeur, emoji, description) | `js/data-pieces.js` (tableau `PIECES`) |
| Changer les règles de mouvement d'une pièce existante ou en ajouter une | `js/rules-engine.js` (fonction `generateMovesRaw`, + `isSquareAttackedSimple` si elle peut mettre en échec) |
| Changer le calcul d'ELO, les rangs, les paliers de déblocage | `js/voie.js` (calcul) + `js/data-pieces.js` (table `UNLOCK_TABLE`/`RANKS`) |
| Modifier le comportement de l'IA (force, style de jeu) | `js/ai-engine.js` (`evalBoard`, `evalPowers`, `minimax`) + `js/data-pieces.js` (`INSTRUCTOR`) |
| Changer le contenu ou la rareté des coffres | `js/data-pieces.js` (`CHESTS`, `DAILY_CHEST`) + `js/economy.js` (`chestRoll`) |
| Changer les perles (gains en coffre, prix en boutique) | `js/data-pieces.js` (`CHEST_PEARLS`) + `js/economy.js` (`chestRoll`, `pearlBuyChest`) + `renderPearlShop()` dans `js/economy-ui.js` |
| Changer la cadence des parties (temps, incrément) | `js/ai-level-modal.js` (`selectedTimeControl`, `selectedTimeIncrement`) ; l'incrément est crédité par `recordMove()` dans `js/rules-engine.js` |
| Changer ce qu'une partie fait risquer ou rapporter | `js/economy.js` (`economyCommit` / `economySettle`) |
| Ajouter un échiquier | `tools/gen-boards.js` (relancer `node tools/gen-boards.js`) + `BOARD_SKINS` dans `js/data-pieces.js` |
| Modifier le dessin d'une pièce | `js/piece-art.js` (`PIECE_ART`) |
| Modifier les cinématiques de combat | `js/cinematics.js` + section `[CINEMATIC]` de `css/style.css` |
| Modifier le tutoriel (textes, étapes, cibles) | `js/tutorial.js` (`TUTO_STEPS`) |
| Modifier les batailles du tutoriel (armées, couleurs, pendule) | `js/tutorial.js` (`TUTO_BATTLES`, `TUTO_EXTRA_COLS`) + `js/data-pieces.js` (`TUTO_INSTRUCTORS`) |
| Modifier l'exercice de déplacement (nombre de repères, règles) | `js/tuto-drill.js` (`DRILL_DOTS`, `drillLayDots`) |
| Changer les pièces d'un compte neuf | `js/data-pieces.js` (`UNLOCK_TABLE`, drapeau `coffre:true`) |
| Changer ce que lance le bouton COMBAT | `js/cube-nav.js` (`onCombat`/`onVsIa`) + `js/combat-intro.js` |
| Régler la vitesse de rotation du cube | `js/cube-nav.js` (`ROTATE_MS`) **et** la transition de `#cube` dans `css/style.css` |
| Modifier le mode tournoi (nombre de rounds, bonus ELO) | `js/tournoi.js` |
| Modifier le système de comptes/sauvegarde | `js/accounts.js` |
| Ajouter un nouveau réglage utilisateur | `index.html` (bloc `#settings-panel`) + `js/settings-admin.js` |
| Modifier la présentation ou la FAQ publiques | `info.html` (texte visible **et** JSON-LD `FAQPage`) |
| Changer les modes qui rapportent de l'ELO | `js/voie.js` (`vvNoEloReason`) |
| Changer ce que fait le mode admin | `js/settings-admin.js` + `renderAdminChests()` dans `js/economy-ui.js` |
| Ajouter une adresse au jeu (comme `/combat` ou `/test`) | `vercel.json` (`rewrites`) + `setAppPath`/`appHomePath` dans `js/main.js` |
| Changer un message de refus / d'information | l'appel `showNotif()` concerné ; l'apparence est dans `[NOTIF]` de `css/style.css` |
| Modifier l'emblème (logo) du jeu | `EMBLEM_SVG` dans `js/main.js` + `favicon.svg` (même tracé) + `[EMBLEM]` de `css/style.css` |
| Changer les règles d'appariement en ligne | `mpEloWindow` / `mpLobbyTick` dans `js/multiplayer.js` |
| Ajouter une icône d'interface | `js/main.js` (`PEN_ICON`, `TRASH_ICON`, `svgX`), en SVG et jamais en émoji |
| Modifier l'animation de déplacement des pièces | `animateLastMove()` dans `js/game-render.js` + `[BOARD-MOTION]` de `css/style.css` |
| Changer le HTML d'une page (structure, nouveaux boutons) | `index.html` (cherche `<!-- PAGE ... -->`) + le module JS de la page concernée pour les listeners |

## Conventions à connaître avant d'éditer un seul fichier

- **Style de code** : pas de point-virgule systématique après chaque
  instruction dans certains blocs, usage massif de fonctions fléchées et de
  templates strings concaténées avec `+`. Le style existant est délibérément
  dense : le conserver pour la cohérence plutôt que de reformatter.
- **État global partagé** (déclaré dans `main.js` et `rules-engine.js`) :
  - `army` : armée en cours de composition dans le builder
  - `GS` : état complet de la partie en cours (board, tours, historique...)
  - `currentArmyData` / `aiArmyData` : armées sélectionnées pour le combat
  - `VV_UNLOCKED` : `Set` des ids de pièces débloquées pour le compte courant
  - `CUR_ACC` : pseudo du compte actuellement connecté
  - `tournamentState` : état du tournoi en cours (dans `tournoi.js`)
- **Persistance** : tout passe par `accGet(clé, défaut)` / `accSet(clé,
  valeur)` (définis dans `accounts.js`), qui préfixent automatiquement la clé
  localStorage avec le pseudo du compte connecté. Ne jamais utiliser
  `localStorage` directement ailleurs que dans `accounts.js`.
- **Le Web Worker IA** (`js/ai-engine.js`, fonction `getWorkerCode`) sérialise
  du code JS existant (fonctions de `rules-engine.js` et `ai-engine.js`) en
  texte pour construire le script du Worker à la volée. Si tu modifies une
  fonction utilisée par l'IA (ex: `generateMovesRaw`), assure-toi qu'elle
  reste une fonction autonome sans dépendance à une variable globale non
  listée dans `getWorkerCode()`, sinon le Worker plantera silencieusement
  (il y a un fallback automatique sur le thread principal si le Worker
  échoue, donc le jeu reste jouable mais potentiellement plus lent).
- **Aucun émoji dans l'interface** : tout ce qui est dessiné l'est en SVG
  (pièces dans `piece-art.js`, emblème et icônes dans `main.js`, fiole /
  cadenas / coffre / perle en CSS pur). Un émoji change de dessin d'un système
  à l'autre et ne suit pas la couleur du thème. Les champs `emoji` de
  `PIECES` ne servent plus qu'aux données historiques des sauvegardes.
- **Accessibilité** : `@media (prefers-reduced-motion: reduce)` neutralise
  toutes les animations (le jeu en compte beaucoup : cube, cinématiques,
  particules, pulsations) et `:focus-visible` marque le focus clavier. Une
  nouvelle animation n'a rien à ajouter, la règle est globale ; un nouveau
  contrôle interactif, en revanche, doit rejoindre la liste des sélecteurs
  `:focus-visible` de la section `[A11Y]`.
- **Écrans tactiles** : il n'y a pas de clic droit. Tout ce qui ouvre une
  fiche au clic droit doit aussi être passé à `bindLongPress()`
  (`js/main.js`), et le gestionnaire de tap correspondant doit commencer par
  `if(longPressJustFired())return;`, sinon le doigt qui se relève déclenche
  l'action par-dessus la fiche qui vient de s'ouvrir.
- **Pas de build step** : n'introduis pas de syntaxe ES modules
  (`import`/`export`), de JSX, de TypeScript, ou de dépendance nécessitant
  npm/bundler. Le jeu doit continuer à fonctionner en ouvrant `index.html`
  directement dans un navigateur, sans serveur.

## Pour me redonner un seul fichier dans une future conversation

Il suffit de me coller le contenu du fichier concerné (ex: juste
`js/tournoi.js` ou juste `css/style.css`) et de me dire ce que tu veux
changer. Grâce à ce README et aux en-têtes de dépendances en haut de chaque
fichier, je peux éditer ce fichier isolément sans avoir besoin du reste du
code, sauf si ta demande touche une interaction entre modules (auquel cas
je te le signalerai et te demanderai le(s) fichier(s) complémentaire(s)
nécessaire(s)).