# Epic Chess : Architecture du projet

Ce projet est un jeu d'échecs variant ("Epic Chess") en HTML/CSS/JS pur,
**sans build step, sans modules ES, sans dépendance externe** (hors polices
Google Fonts). Il s'ouvre en double-cliquant sur `index.html`, aucun serveur
n'est nécessaire.

## Pourquoi cette architecture

Le fichier était à l'origine un unique `.html` de ~3000 lignes. Il a été
découpé en modules **par domaine fonctionnel** pour qu'on puisse te donner
(ou que tu puisses éditer) un seul fichier à la fois (par exemple
`css/style.css` ou `js/voie.js`) sans avoir besoin de relire tout le
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
├── favicon.svg              # Icône d'onglet et d'écran d'accueil : la
│                            #  pièce en fusion dans le ballon couronné
├── assets/
│   ├── adversaires/         # FACULTATIF : <id>.png, un portrait par
│   │                        #  adversaire. Absent = sceau SVG procédural.
│   ├── backgrounds/
│   │   ├── main-page.png    # FACULTATIF : fond du menu principal
│   │   └── duel-wait.png    # Toile de l'écran d'attente d'un duel en ligne.
│   │                        #  La remplacer suffit : rien à coder.
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
│   ├── ai-bench.js          # Autopartie entre adversaires : vérifie que
│   │                        #  l'échelle de force tient (voir plus bas)
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
    │                          # armées/partie/armurerie dans les faces (la face
    │                          # de gauche est libre, en attente de contenu).
    ├── accounts.js           # Comptes locaux (localStorage), connexion
    ├── economy.js            # Possession des pièces, mise en jeu, coffres, séries
    ├── ai-level-modal.js     # Réduit à selectedAILevel/selectedTimeControl
    ├── piece-card.js         # LA carte de pièce (format portrait : logo, nom,
    │                          # valeur, stock) + sa fiche en bottom sheet
    │                          # (déplacement, pouvoir). Composant partagé.
    ├── builder.js            # Page de composition d'armée
    ├── armies.js             # Pages "Mes armées" / "Armées IA" + génération IA
    ├── adversaires.js        # Galerie des douze adversaires (portraits/sceaux)
    ├── combat-intro.js       # Page d'intro combat (VS)
    ├── rules-engine.js       # Moteur de règles pur (coups, échecs, exécution)
    ├── piece-moves.js        # Schéma 9×9 du déplacement d'une pièce, déduit
    │                          # du moteur (il a remplacé les phrases de
    │                          # déplacement, supprimées de data-pieces.js)
    ├── combat-music.js       # Musique de combat en boucle
    ├── cinematics.js         # Cinématiques d'entrée en combat et d'issue
    ├── game-render.js        # Rendu plateau, drag&drop, clics, historique
    ├── ai-engine.js          # Évaluation (dont les POUVOIRS), minimax, Worker IA
    ├── game-flow.js          # Démarrage partie, fin de partie, résultat
    ├── voie.js                # Page "Voie des Victoires" (ELO, rangs, jalons)
    ├── economy-ui.js         # Page "Armurerie" (échiquiers) + les six coffres
    │                          # du menu principal + le coffre quotidien, qui
    │                          # s'ouvre tout seul (dailyChestMaybeOpen)
    ├── tuto-drill.js         # Exercice de déplacement d'une créature débloquée
    ├── tutorial.js           # Tutoriel : 4 batailles scriptées + visite guidée
    ├── settings-admin.js     # Panneau réglages + mode test (/?test)
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
- `'ia'` : bouton secondaire « Adversaires », qui ouvre d'abord la galerie
  (`showAdversairesPage`, js/adversaires.js) puis la sélection d'armée. La
  page montre les deux armées en présence, sous le nom et le portrait de
  l'adversaire choisi.

`renderCombatPage(armee, mode)` est le point d'entrée unique : tout appelant
doit passer le mode, sinon on retombe sur `'ia'`. Les deux rangées de boutons
existent dans le HTML et s'excluent (`#cactions-online` / `#cactions-ia`).

### 4. Les adversaires (`js/data-pieces.js`, `js/adversaires.js`)

**C'est le système qui a rouvert le jeu solo.** Il n'y avait qu'un adversaire,
l'Instructeur, à 2000 ELO et à pleine puissance — et l'affronter n'était pas
classé. Un joueur seul sortait donc du tutoriel (dont le dernier instructeur
laisse passer un coup sur trois) face à un mur, et ne pouvait gagner **aucun
point d'ELO** : ni le Preux Chevalier (50), ni la Méduse (210), ni le Typhon
(1000), ni le Grand Maître (1700), ni un seul échiquier ne lui étaient
accessibles. La moitié du contenu était injouable sans trouver un humain.

`AI_OPPONENTS` (data-pieces.js) décrit maintenant **douze adversaires**, de
Cendre (150 ELO) à l'Athanor (2300). Aucun n'est verrouillé, et **tous les
duels sont classés** (`vvNoEloReason`, js/voie.js) : seuls le mode test et le
tutoriel restent hors classement.

Quatre champs font la force d'un adversaire, et il faut les distinguer :

- `timeMs` / `depthCap` : ce qu'il **voit**. À 0, la position est jugée à un
  demi-coup — il voit la pièce à prendre, pas le mat en deux.
- `slack` : ce qu'il **tolère**. Il tire au sort parmi tous les coups qui ne
  perdent pas plus que ce nombre de centipions par rapport au meilleur. C'est
  le cœur du modèle : un joueur faible ne joue pas au hasard, il joue des
  coups plausibles mais imprécis. L'ancien réglage (`noise`, jusqu'à 95 % de
  coups tirés uniformément parmi tous les coups légaux) produisait un
  charabia que personne ne prenait pour un adversaire.
- `blunder` : la probabilité de **lâcher franchement** la position. Les vrais
  débutants accrochent des pièces ; sans ce terme, un adversaire à `slack`
  élevé reste bizarrement solide et ne perd jamais bêtement.
- `style` : ce qu'il **cherche**. `STYLE_W` (ai-engine.js) repondère les
  termes que `evalBoard` calcule déjà — aucun parcours de plateau
  supplémentaire, donc aucun coût de recherche — et `ARMY_STYLE_CLASS`
  (armies.js) penche la composition de son armée vers une classe de créature.

Un mat trouvé n'est jamais gâché : au-delà de 40000, `aiPickMove` ferme la
fenêtre. Un adversaire faible ne voit pas le mat, mais s'il le voit, il le
joue — sinon il aurait l'air de se moquer du joueur.

Deux garde-fous contre le farm du bas de l'échelle : la formule Elo elle-même
(battre beaucoup plus faible que soi ne rapporte quasiment rien, donc aucun
palier de déblocage), et le **verrou quotidien** de la série de coffres
(`streakLockedToday`/`streakEnsureToday`, js/economy.js) — une seule série par
jour, six victoires d'affilée pour toucher le Coffre Roi.

Il y a eu un troisième garde-fou, un **plafond de coffre** par palier
d'adversaire, retiré : il ramenait tout coffre au Coffre Pion contre Cendre ou
Suie, c'est-à-dire contre les deux adversaires que la galerie conseille à un
compte neuf. Un débutant enchaînait six victoires et ne voyait jamais autre
chose qu'un Coffre Pion, pendant que la fenêtre « Série du jour » lui promettait
le Coffre Roi. Le `tier` d'`AI_OPPONENTS` ne sert plus qu'à situer l'adversaire
sur l'échelle des douze.

`tools/ai-bench.js` fait s'affronter les adversaires en autopartie et vérifie
que l'échelle tient dans le bon sens. Il ne fait pas partie de `npm test` (une
passe prend plusieurs minutes) :

```
node tools/ai-bench.js               # paires voisines + deux paires éloignées
node tools/ai-bench.js --pair cendre,athanor --games 6
```

Entre paliers **voisins** (150 à 250 points d'écart), quatre parties ne
prouvent rien : c'est l'écart entre paliers **éloignés** qui doit être net, et
il l'est (Orpiment 620 contre la Salamandre 1750 : 0–4).

**Les portraits sont facultatifs.** Chaque adversaire cherche
`assets/adversaires/<id>.png` ; sans le fichier, `advSealSVG()` dessine un
sceau d'alchimiste déterministe à partir de son id. Le jeu est donc complet
sans un seul octet d'image, et déposer un portrait suffit à le faire
apparaître — il n'y a aucune liste à tenir à jour. Même principe pour
`assets/backgrounds/main-page.png`, le fond du menu. Leur 404 est un comportement voulu, et
`tools/smoke-test.js` l'ignore explicitement (`OPTIONAL_ASSET`).

### 4 bis. Le moteur (`js/ai-engine.js`)

`evalBoard()` combine l'évaluation classique (matériel, tables
position-carrés, mobilité, structure de pions) et `evalPowers()`, qui note
les **capacités spéciales** : paralysie de la Méduse, protection du Prêtre,
zone de destruction du Typhon, charge de l'Éléphant de guerre, domination du Grand
Maître, ancrage du Garde de Pierre.

`aiSearchRoot()` et `aiPickMove()` sont partagées **mot pour mot** par le
Worker et par le repli sur le thread principal. La boucle d'approfondissement
itératif existait en double, à soixante lignes d'écart, et les deux copies
avaient déjà divergé. `aiSearchRoot` renvoie **tous** les coups avec leur
score, et non le seul meilleur : c'est ce dont `aiPickMove` a besoin.

Une itération d'approfondissement **interrompue par la pendule** est jetée :
elle n'a évalué qu'une partie des coups, ses scores ne sont pas comparables
entre eux et fausseraient le tirage de `aiPickMove`.

**La quiescence doit connaître les pouvoirs destructeurs.** Elle ne prolonge
que les coups violents, pour ne pas s'arrêter au milieu d'un échange — et elle
ne retenait que les prises « classiques », celles qui atterrissent sur une
pièce ennemie. Or les coups les plus violents de ce jeu n'en sont pas : un
Typhon posé sur une case VIDE efface jusqu'à huit voisines, et la charge de
l'Éléphant de guerre écrase ce qu'elle traverse. La recherche évaluait donc tranquillement
une position à un demi-coup d'être balayée, ce qui est exactement l'effet
d'horizon que la quiescence existe pour supprimer. Toute nouvelle pièce
capable de détruire sans capturer doit rejoindre ce filtre.

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
`AI_INSTRUCTORS` **après** les douze adversaires — d'où
`tutoInstructorLevel(i) = AI_OPPONENTS.length + i`), avec **la même armée des deux
côtés, posée en dur** (`tutoBuildBoard`) : personne ne perd parce qu'il a mal
composé. Une victoire ouvre un coffre au contenu **imposé** qui débloque une
créature (Peureux, Fourmi, Éléphant de guerre), suivie de son exercice de
déplacement. Une défaite ne fait pas avancer : le savant propose la revanche,
autant de fois qu'il le faut.

Ces batailles passent par `startGame(true,false,tutoCfg)` : le troisième
argument impose le plateau et la couleur, **saute l'économie** (rien n'est
prélevé sur l'Armurerie, une promotion ne crédite rien) et court-circuite la
cinématique d'entrée. `triggerEndOfGame` les détourne vers `tutoOnBattleEnd` :
ni ELO, ni coffre de série, ni règlement d'Armurerie. **Aucune des quatre
batailles n'a de pendule** (`clockMin:0` partout) : le chronomètre arrive avec
les vraies parties.

**La visite du laboratoire.** Les étapes qui portent un `click` attendent un
vrai clic sur le vrai bouton : à la fin, le joueur a réellement tourné le
cube, composé une armée et ouvert son Armurerie.

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
Sans cette armée, on sortirait du tutoriel sans une seule armée jouable, incapable
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
recule pas, le Peureux ne sort jamais de son camp). Cinq
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

Le bandeau est de retour, en bas à droite (le haut de l'écran appartient au
titre de la page, et au bouton de réglages sur le seul menu principal), trois
messages au plus, effacé au
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
joueurs en attente et la fenêtre courante, et propose un adversaire du
laboratoire au bout de 40 secondes. Le salon d'attente a changé de nom (`epichess-lobby-v2`) :
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

Il n'y a **aucune image de partage** (`og:image`) ni d'`apple-touch-icon` :
c'étaient deux rendus figés à régénérer à chaque retouche de l'identité, pour
une vignette que le jeu n'utilisait nulle part. `favicon.svg` sert seul
d'icône d'onglet, d'écran d'accueil et de manifeste, et la carte Twitter est
en `summary` (la variante `summary_large_image` exige une image).

Le tracé de `favicon.svg` est **le même** que celui de `EMBLEM_SVG`
(`js/main.js`), à l'échelle 0,64 près : retoucher l'un sans l'autre fait
diverger l'onglet et l'écran d'accueil.

## Ordre de chargement (`index.html`, en bas de page)

L'ordre des `<script>` est important car il n'y a pas de système de modules :
chaque fichier suppose que les globals des fichiers précédents existent déjà.

```
data-pieces.js → piece-art.js → main.js → cube-nav.js → accounts.js
→ economy.js → ai-level-modal.js → piece-card.js → builder.js → armies.js
→ adversaires.js
→ combat-intro.js
→ rules-engine.js → piece-moves.js → combat-music.js → cinematics.js
→ game-render.js
→ ai-engine.js → game-flow.js → voie.js → economy-ui.js → tuto-drill.js
→ tutorial.js
→ settings-admin.js → multiplayer.js → (script inline) initApp()
```

`economy.js` doit venir après `accounts.js` (il utilise `accGet`/`accSet`) et
avant tous les modules de page qui affichent des stocks. `piece-art.js` doit
venir juste après `data-pieces.js` : à peu près tous les rendus l'utilisent.
`piece-card.js` doit venir avant `builder.js`, qui appelle `pieceCardHTML()` /
`wirePieceCards()`. Il référence `pieceMoveDiagramHTML` (`piece-moves.js`,
chargé plus loin), mais seulement à l'ouverture d'une fiche : jamais au
chargement.
`piece-moves.js` doit venir après `rules-engine.js` : il fabrique ses schémas
en interrogeant `generateMovesRaw()`.

`cube-nav.js` est chargé juste après `main.js` : il étend `showPage()` (la
navigation devient un cube 3D en CSS) et déplace à l'exécution les pages
`#page-armies` / `#page-game` dans les faces du cube (face de droite = "Mes
armées", face du haut = la partie, face de gauche **libre**). Il ne connaît
QUE la face courante, les
rotations et le verrouillage, aucune logique de jeu. Le builder (composition
d'armée, `#page-builder`) n'est PAS une face du cube : c'est une page
secondaire (overlay) ouverte depuis "Mes armées" via "Nouvelle armée" ou
"Modifier". Les autres pages secondaires (voie, combat, login)
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
galerie des douze adversaires, partie CLASSÉE contre l'un d'eux (avec un coup
joué et la réponse de l'IA), pendule, orientation des tables position-carrés,
destruction du Typhon dans la simulation de coup, rendu de l'Armurerie et de
la Voie. Il échoue au
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
| Ajouter/modifier une pièce (valeur, emoji, pouvoir) | `js/data-pieces.js` (tableau `PIECES`) — le déplacement, lui, ne s'y écrit plus : il est dessiné par `js/piece-moves.js` à partir du moteur |
| Changer les règles de mouvement d'une pièce existante ou en ajouter une | `js/rules-engine.js` (fonction `generateMovesRaw`, + `isSquareAttackedSimple` si elle peut mettre en échec). Le schéma affiché sur les cartes et les fiches suit tout seul |
| Changer le calcul d'ELO, les rangs, les paliers de déblocage | `js/voie.js` (calcul) + `js/data-pieces.js` (table `UNLOCK_TABLE`/`RANKS`) |
| Ajouter / régler un adversaire (niveau, style, lore) | `js/data-pieces.js` (`AI_OPPONENTS`), puis `node tools/ai-bench.js` pour vérifier l'échelle |
| Modifier le moteur lui-même (évaluation, recherche) | `js/ai-engine.js` (`evalBoard`, `evalPowers`, `minimax`, `aiSearchRoot`, `aiPickMove`) |
| Changer la façon dont un style se joue | `STYLE_W` dans `js/ai-engine.js` (évaluation) + `ARMY_STYLE_CLASS` dans `js/armies.js` (composition) |
| Ajouter un portrait d'adversaire | déposer `assets/adversaires/<id>.png` — rien à déclarer |
| Changer le contenu ou la rareté des coffres | `js/data-pieces.js` (`CHESTS`, `DAILY_CHEST`) + `js/economy.js` (`chestRoll`) |
| Changer les perles (gains en coffre, prix d'achat) | `js/data-pieces.js` (`CHEST_PEARLS`) + `js/economy.js` (`chestRoll`, `pearlBuyChest`) + `renderMenuChests()` dans `js/economy-ui.js` |
| Changer la cadence des parties (temps, incrément) | `js/ai-level-modal.js` (`selectedTimeControl`, `selectedTimeIncrement`) ; l'incrément est crédité par `recordMove()` dans `js/rules-engine.js` |
| Changer ce qu'une partie fait risquer ou rapporter | `js/economy.js` (`economyCommit` / `economySettle`) |
| Ajouter un échiquier | `tools/gen-boards.js` (relancer `node tools/gen-boards.js`) + `BOARD_SKINS` dans `js/data-pieces.js` |
| Modifier le dessin d'une pièce | `js/piece-art.js` (`PIECE_ART`) |
| Modifier la carte d'une pièce (ce qui s'y affiche, les deux boutons) | `pieceCardHTML()` / `wirePieceCards()` dans `js/piece-card.js` + section `[PCARD]` de `css/style.css` |
| Modifier la fiche d'une pièce (bottom sheet : déplacement, pouvoir) | `openPieceSheet()` / `piecePowerHTML()` dans `js/piece-card.js` + le balisage `#piece-sheet` dans `index.html` + section `[PSHEET]` de `css/style.css` |
| Ajouter l'icône d'un nouveau pouvoir | `POWER_ICONS` dans `js/piece-card.js` (clé = id de la pièce) |
| Changer quand le coffre de réapprovisionnement s'ouvre | `dailyChestMaybeOpen()` / `dailyChestBusy()` dans `js/economy-ui.js` |
| Ajuster la mise en page téléphone d'un écran | section `[MOBILE-APP]` de `css/style.css` (en dernier dans le fichier, elle l'emporte sur les sections d'origine) |
| Modifier les pictogrammes du schéma de déplacement (patte, ailes, couteau…) | `PMV_ICONS` / `PMV_LABELS` dans `js/piece-moves.js` + section `[PMV]` de `css/style.css` |
| Modifier les cinématiques de combat | `js/cinematics.js` + section `[CINEMATIC]` de `css/style.css` |
| Modifier le tutoriel (textes, étapes, cibles) | `js/tutorial.js` (`TUTO_STEPS`) |
| Modifier les batailles du tutoriel (armées, couleurs, pendule) | `js/tutorial.js` (`TUTO_BATTLES`, `TUTO_EXTRA_COLS`) + `js/data-pieces.js` (`TUTO_INSTRUCTORS`) |
| Modifier l'exercice de déplacement (nombre de repères, règles) | `js/tuto-drill.js` (`DRILL_DOTS`, `drillLayDots`) |
| Changer les pièces d'un compte neuf | `js/data-pieces.js` (`UNLOCK_TABLE`, drapeau `coffre:true`) |
| Changer ce que lance le bouton COMBAT | `js/cube-nav.js` (`onCombat`/`onVsIa`) + `js/combat-intro.js` |
| Modifier la galerie des adversaires (cartes, sceaux, palmarès) | `js/adversaires.js` + section `[ADVERSAIRES]` de `css/style.css` |
| Changer le fond du menu principal | `assets/backgrounds/main-page.png` + section `[LAB-BG]` de `css/style.css` |
| Modifier le bloc pseudo/rang/ELO du menu principal | `renderMenuIdentity()` dans `js/accounts.js` + `[MENU]` de `css/style.css` |
| Régler la vitesse de rotation du cube | `js/cube-nav.js` (`ROTATE_MS`) **et** la transition de `#cube` dans `css/style.css` |
| Modifier le système de comptes/sauvegarde | `js/accounts.js` |
| Ajouter un nouveau réglage utilisateur | `index.html` (bloc `#settings-panel`) + `js/settings-admin.js` |
| Modifier la présentation ou la FAQ publiques | `info.html` (texte visible **et** JSON-LD `FAQPage`) |
| Changer les modes qui rapportent de l'ELO | `js/voie.js` (`vvNoEloReason`) |
| Changer le coffre gagné par série de victoires | `CHESTS`/`chestForStreak` dans `js/data-pieces.js` + `economySettle` dans `js/economy.js` |
| Changer la remise à zéro quotidienne de la série | `streakEnsureToday`/`streakLockedToday` dans `js/economy.js` |
| Changer les écrans qui portent le bouton de réglages | `updateMainMenuFlag` dans `js/cube-nav.js` + `body.main-menu` dans `[SETTINGS]` de `css/style.css` |
| Changer le retrait haut des pages (sous l'encoche) | `--page-top` / `--menu-top` en tête de `css/style.css` |
| Changer ce que donne le mode test | `economyAdmin`/`invAll`/`pearlBalance` dans `js/economy.js` + `vvLoadElo`/`loadAccountGlobals` dans `js/accounts.js` |
| Ajouter un tips d'attente en ligne | `MP_TIPS` dans `js/multiplayer.js` (une ligne de plus dans le tableau) |
| Ajouter une adresse au jeu (comme `/combat`) | `vercel.json` (`rewrites`) + `appPath`/`setAppPath`/`appHomePath` dans `js/main.js` |
| Changer l'adresse du mode test | `ADMIN_QUERY` + `pathHasAdmin()` dans `js/main.js` (paramètre `?test`, pas un chemin : un chemin inexistant dépend d'une réécriture d'hébergeur et répondait 404) |
| Changer ce que contient un coffre | `CHESTS`/`CHEST_PEARLS` dans `js/data-pieces.js` + `chestRoll`/`chestLuckyChance` dans `js/economy.js` |
| Changer le fond de l'écran d'attente en ligne | remplacer `assets/backgrounds/duel-wait.png` (rien à coder) |
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
`js/voie.js` ou juste `css/style.css`) et de me dire ce que tu veux
changer. Grâce à ce README et aux en-têtes de dépendances en haut de chaque
fichier, je peux éditer ce fichier isolément sans avoir besoin du reste du
code, sauf si ta demande touche une interaction entre modules (auquel cas
je te le signalerai et te demanderai le(s) fichier(s) complémentaire(s)
nécessaire(s)).