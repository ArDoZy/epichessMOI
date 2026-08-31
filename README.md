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
├── sw.js                    # Service worker : coquille hors ligne (réseau
│                            # d'abord pour le code, cache d'abord pour les médias)
├── favicon.svg              # Icône d'onglet et d'écran d'accueil : le
│                            #  Monarque dressé dans le sceau d'alchimiste
├── assets/                  # TOUT y est FACULTATIF sauf boards/ : une image
│   │                        #  absente ne fait qu'un 404 silencieux, et le
│   │                        #  décor dessiné en CSS reprend la main. Le
│   │                        #  catalogue complet (chemins, dimensions et le
│   │                        #  prompt de chaque planche) est dans
│   │                        #  assets/PROMPTS.md ; le câblage est en un seul
│   │                        #  endroit, la section [ART] de css/style.css.
│   ├── PROMPTS.md           # Les ~60 planches du décor et leurs prompts
│   ├── adversaires/         # <id>.png, un portrait par adversaire.
│   │                        #  Absent = sceau SVG procédural.
│   ├── backgrounds/         # Un fond par écran (menu, faces du cube, pages,
│   │                        #  Lore, table sous le plateau). Affichés à
│   │                        #  26–44 %, centre éteint au masque radial.
│   ├── banners/             # Bandeaux de titre de page (le texte reste du
│   │                        #  texte : la planche ne porte aucun mot)
│   ├── ui/                  # Cadre du plateau, ornement d'angle, socle, et
│   │                        #  les deux textures de métal des boutons
│   ├── fx/                  # Halos, ondes, braises, éclats — TOUS sur fond
│   │                        #  noir, fondus en `screen` (transparence
│   │                        #  gratuite, cf. le halo des coffres)
│   ├── ranks/               # <id du rang>.png, sept médaillons, posés par
│   │                        #  rankMedalHTML() (js/main.js) : aucune liste
│   │                        #  à tenir à jour.
│   ├── chests/              # Les planches de destruction des coffres
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
│   ├── opt-images.js        # Convertit les planches du décor en .webp ET
│   │                        #  repointe les url() de css/style.css dessus
│   │                        #  (sans la seconde moitié, convertir éteindrait
│   │                        #  le décor en silence)
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
    ├── accounts.js           # Comptes locaux (localStorage) : plusieurs par
    │                          # appareil, création automatique au premier
    │                          # lancement, bascule/renommage/suppression
    ├── account-ui.js         # Page "Comptes" (#page-account) : sceau du compte
    │                          # courant, bascule entre comptes, création
    ├── economy.js            # Possession des pièces, mise en jeu, coffres
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
    ├── sfx.js                # Moteur de bruitages (couches, enveloppes, bruit
    │                          # filtré, variation, ducking) + retour haptique
    ├── combat-fx.js          # Effets spéciaux du plateau : impacts de prise,
    │                          # traînées, signatures de pouvoir, échec, mat
    ├── pwa.js                # Installation sur l'écran d'accueil + service worker
    ├── combat-music.js       # Musique de combat en boucle
    ├── cinematics.js         # Cinématiques d'entrée en combat et d'issue
    ├── game-render.js        # Rendu plateau, drag&drop, clics, historique
    ├── ai-engine.js          # Évaluation (dont les POUVOIRS), minimax, Worker IA
    ├── game-flow.js          # Démarrage partie, fin de partie, résultat
    ├── voie.js                # Page "Diagonale de la Puissance" (ex-"Voie des
    │                          # Victoires") : ELO, rangs, jalons
    ├── economy-ui.js         # Page "Armurerie" (échiquiers) + les six coffres
    │                          # du menu principal + le coffre quotidien, qui
    │                          # s'ouvre tout seul (dailyChestMaybeOpen)
    ├── rewards.js            # Les deux voies qui ne dépendent pas de l'ELO :
    │                          # colonne des victoires (30 paliers, un par
    │                          # victoire), rangée de la richesse (25 paliers
    │                          # de perles), quêtes du jour, tickets, jokers
    ├── rewards-ui.js         # Récompense journalière + page des deux voies
    │                          # et la fenêtre de conversion des jokers
    ├── tuto-drill.js         # Exercice de déplacement d'une créature débloquée
    ├── tutorial.js           # Tutoriel : 4 batailles scriptées + visite guidée
    ├── settings-admin.js     # Panneau réglages + mode test (/?test)
    └── multiplayer.js        # Parties en ligne (Supabase Realtime)
```

## Les systèmes à comprendre avant d'éditer

### 0. Le décor : la palette, et les planches qui s'y posent (`[THEME]`, `[ART]`)

Deux choses tiennent l'apparence du jeu, et elles sont chacune à UN seul
endroit de `css/style.css`.

**La palette, dans `[THEME]`.** Trois rôles étanches, et c'est ce qui rend
l'interface lisible d'un coup d'œil : des SURFACES froides et neutres
(ardoise) qui ne réclament aucune attention, une COULEUR VIVE unique
(`--accent2`, un vert-de-gris de cuivre oxydé) réservée à l'action en
cours, et un LAITON (`--gold`) réservé à ce qui se mérite. Ces trois rôles
ne se mélangent jamais.

La v3 avait raison sur les rôles et tort d'un cran sur la LUMIÈRE : le fond
descendait à `#0e1216`, à trois points du noir, et l'écart avec les
surfaces — neuf points — ne se voyait plus dès qu'un téléphone baissait sa
luminosité. Tout est remonté d'un cran, **sans changer un seul rôle** :
l'atelier passe de la nuit noire au soir éclairé à la lampe. C'est aussi ce
qui rend les images possibles — une illustration posée sur `#0e1216` doit
être éteinte à 30 % d'opacité pour ne pas trouer l'écran, autant ne pas la
dessiner.

**Les planches, dans `[ART]`.** Une soixantaine d'emplacements d'images
sont câblés — fonds d'écran, bannières de titre, cadre du plateau,
ornements, médaillons de rang, effets. **Aucun fichier n'est requis** :
c'est la règle des portraits d'adversaires, généralisée. Une image absente
ne produit qu'un 404 silencieux, la règle CSS retombe sur le décor dessiné
en dégradés, et il n'y a rien à décommenter ni aucune liste à tenir à jour
— déposer le fichier au bon chemin suffit à l'allumer.

D'où la contrainte qui gouverne toute la section : **on n'ajoute jamais une
image en `<img>`.** Une balise `<img>` dont le fichier manque affiche
l'icône d'image cassée du navigateur ; un `background-image` qui manque
n'affiche rien. Tout y est donc en `background-image`, en `border-image` ou
en `mask-image` — et c'est aussi pourquoi le cadre du plateau est posé en
surimpression plutôt qu'en `border-image` : cette dernière aurait exigé une
`border` de 14 px qui, elle, existe même sans le fichier.

Deux procédés valent d'être connus avant d'ajouter un effet :

- **le fond noir fondu en `screen`** — tous les effets de `assets/fx/` sont
  dessinés sur noir, et `mix-blend-mode:screen` fait disparaître ce noir. De
  la transparence gratuite : pas de canal alpha, pas de liseré autour du
  halo, un fichier trois fois plus léger. C'est déjà le procédé du halo des
  coffres ;
- **`z-index:-1` plutôt que `0`** pour les couches de fond — dans un
  contexte d'empilement, un enfant de z-index négatif se peint juste
  au-dessus du fond de l'élément qui ouvre le contexte, donc SOUS tout le
  contenu, sans qu'on ait à relever le z-index de quoi que ce soit.

Le catalogue des soixante planches — chemin, dimensions, format, et le
prompt à donner à un générateur d'images — est dans
**`assets/PROMPTS.md`**. `tools/opt-images.js` les convertit ensuite en
`.webp` et repointe les `url()` du CSS dessus.

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

**Le robinet et la fuite.** Une pièce ne se perd qu'à la défaite, et une par
une ; tout ce qui en distribue doit donc rester petit, sinon les stocks
saturent et un coffre ne change plus rien à ce qu'on peut aligner (on en était
à plus de 70 exemplaires par pièce). Trois chiffres tiennent l'équilibre, et
ils se lisent ensemble :

| Constante | Valeur | Rôle |
|---|---|---|
| `CHESTS[].total` (`data-pieces.js`) | Pion 1-3 → Roi 20-30 | ce qu'un coffre donne **en tout**, tous lots confondus. `chestRoll` tire ce total puis le découpe en lots (`chestSplit`) : le nombre de lots ne fait plus que rythmer la cérémonie. |
| `STARTER_STOCK` (`economy.js`) | 6 | la dotation d'un jalon de départ |
| `DAILY_CHEST` (`data-pieces.js`) | `perPiece:2`, `cap:10` | le coffre de réapprovisionnement ne remplit **que ce qui est vide** : au-dessus de `cap`, il ne verse rien. Sans ce seuil il versait 2 exemplaires par pièce et par jour indéfiniment, ce qui faisait de lui — et non des coffres — la première source de pièces du jeu. |

`CHEST_PEARLS` suit la même échelle (Pion 1-3 perles, Roi 20-30), prix compris,
et un coffre ne doit **jamais** pouvoir se racheter avec ses propres perles :
le haut de sa fourchette reste sous la moitié de son prix. Toucher à l'une de
ces fourchettes, c'est refaire ce calcul — le test de fumée le vérifie.

### 1 bis. Les trois voies de progression (`js/voie.js`, `js/rewards.js`)

Elles portent le nom des trois lignes de l'échiquier, et ce n'est pas
décoratif : chacune se lit dans le sens de la sienne, ce qui évite d'avoir à
lire le titre pour savoir où l'on est.

| Voie | Ce qui la fait avancer | Ce qu'elle donne | Où |
|---|---|---|---|
| **Récompense Journalière** | revenir, une fois par jour | cycle sans fin de 30 lots : coffres, perles, jokers | `DAILY_REWARDS`, `js/rewards.js` |
| **Diagonale de la Puissance** | l'ELO (parties classées) | créatures, échiquiers, petits lots | `js/voie.js`, `UNLOCK_TABLE` |
| **Colonne des Victoires** | une victoire = un palier | 30 paliers : coffres et jokers | `VICTORY_COLUMN`, `js/rewards.js` |
| **Rangée de la Richesse** | les tickets des quêtes du jour | 25 paliers de perles (2→6) | `WEALTH_TIERS`, `js/rewards.js` |

La « Voie des Victoires » S'APPELLE MAINTENANT la Diagonale de la Puissance.
Seuls les libellés ont changé : les identifiants (`page-voie`, `voie-*`,
`vv*`) sont les clés du CSS, du tutoriel, des sauvegardes de compte et du test
de fumée — les renommer ne changerait rien à l'écran.

**UNE PAGE PAR VOIE, ET UN SEUL GESTE POUR PRENDRE.** `#page-rewards` a porté
deux onglets en tête, qui faisaient passer de la colonne à la rangée : une
barre de navigation permanente sur un écran où l'on vient faire UNE chose, et
que le menu principal — un bouton par voie — ouvrait déjà sur la bonne. Il ne
reste qu'un titre (`#rw-title`, posé par `rewardsSetVoie`), et « OK » ramène au
menu : c'est le seul chemin de l'une à l'autre.

Le bandeau « Récupérer » posé au-dessus des deux voies est parti avec eux : une
rangée entière d'écran pour une action dont la cible — le palier qui pulse, à
deux doigts de là — était déjà sous les yeux. **On touche ce qu'on prend**
(`.rw-step.rw-due` et `.rw-row-card.rw-due` portent le clic).

La rangée, elle, ne montre plus qu'**une récompense à la fois**, dans une carte
qui prend toute la place libre au-dessus des quêtes du jour. On la parcourt par
les deux flèches ou en balayant du doigt (`rwWireSwipe`) : la flèche s'apprend
en la voyant, le balayage est plus rapide une fois qu'on sait. `_rwRowIdx` est
le palier REGARDÉ — il part de celui qu'on peut prendre et ne bouge qu'à la
demande, mais il est remis à zéro à chaque `openRewardsPage()` : on ne revient
jamais sur une page ouverte au milieu de nulle part.

Trois règles à ne pas casser :

- **Le cycle journalier avance par lot pris, pas par jour écoulé.**
  `dr_idx` compte les récompenses encaissées et `dr_day` verrouille la
  journée : un joueur qui saute trois jours ne saute pas trois lots, il
  reprend là où il s'était arrêté. Le cycle recommence indéfiniment
  (`dailyRewardStep` indexe modulo `DAILY_REWARDS.length`).
  Il a remplacé la « série du jour », qui exigeait six victoires d'affilée
  dans la journée et qu'une seule défaite refermait jusqu'au lendemain :
  elle ne donnait rien à qui passe faire une partie et punissait qui en fait
  dix. `win_streak` survit, mais uniquement comme statistique (« Meilleure
  série » sur la fiche de compte) : plus de coffre, plus de verrou, plus de
  remise à zéro à minuit.
- **La colonne avance dans `economySettle()`**, une seule fois par partie
  gagnée, et jamais en tutoriel ni en mode test. Toute nouvelle façon de
  terminer une partie qui passerait à côté d'`economySettle` la laisserait
  sur place.
- **Les quêtes se remplissent par de vrais faits de jeu**, posés au seul
  endroit par lequel ces faits passent : `recordMove()` (déplacements et
  prises), `updateStatus()` (échec et mat), `economyOnPromotion()` (promotion)
  et `economySettle()` (victoire). Les coups de l'ADVERSAIRE passent par les
  mêmes fonctions : le filtre sur la couleur du joueur est indispensable.

### 1 ter. La courbe d'ascension : l'ELO (`js/voie.js::vvCalcNewElo`)

**Epic Chess n'est pas un tournoi, c'est une aventure.** Un compte neuf part
de 0 et doit pouvoir atteindre **1000 ELO** sans être un joueur d'échecs :
c'est là que se trouvent la plupart des créatures et des échiquiers, donc là
que se trouve le jeu. Un Elo pur ne fait pas ça — il place chacun autour de sa
vraie force et y laisse la moitié des joueurs sous 800 à vie.

Trois mécanismes s'en chargent, tous dans `vvCalcNewElo` :

1. **K dégressif** (`VV_K_STEPS`). Le K-facteur mesure de combien une partie
   déplace le classement : 60 pour les **cinq parties de placement**, puis 48,
   40, 32, 24 en régime de croisière, et 16 au-dessus de 2000 ELO — un
   classement de haut de tableau doit être stable, sinon il ne veut plus rien
   dire.
2. **La courbe d'ascension** (`VV_CLIMB_*`). Sous 1000 ELO, les gains sont
   majorés et les pertes amorties, d'autant plus fortement qu'on est bas : à
   0 ELO une victoire vaut **triple** et une défaite ne coûte que **15 %** ; à
   1000 les deux multiplicateurs valent 1 et l'Elo redevient l'Elo. La
   décroissance est en `t^0.6` et non linéaire — linéairement, le bonus
   s'évaporait dès 300 ELO et la montée s'arrêtait là.
3. **Le rang est acquis, l'ELO est vivant** — deux nombres, deux rôles :
   - `elo` **monte et descend**. Une défaite coûte **toujours** au moins un
     point, à n'importe quel niveau. Seul le zéro absolu l'arrête.
   - `elo_peak`, le plus haut ELO jamais atteint, **ne descend jamais**. C'est
     lui, et lui seul, qui décide du rang affiché (`vvRank()`) et de tout ce
     qui se débloque : créatures, échiquiers, jalons. Un joueur qui a touché
     Bronze reste Bronze pour toujours et ne reperd jamais une créature, même
     si son classement retombe à 400.

   ⚠️ **La version précédente posait le plancher sur l'ELO lui-même**, au
   minimum du rang courant. Elle tenait la même promesse, mais un joueur assis
   exactement sur un plancher (500, 800, 1200…) **ne perdait plus rien** en cas
   de défaite : un point de stationnement à risque zéro, avec des essais
   illimités pour remonter — la pire chose qu'on puisse mettre dans un
   classement. Ne pas y revenir.

**L'écart avec l'adversaire décide de tout, comme dans un Elo ordinaire** : la
courbe d'ascension multiplie le résultat de la formule, elle ne le remplace
pas. À 500 ELO, une victoire vaut **+7** contre un adversaire 400 points plus
faible, **+37** à niveau égal, **+67** contre un adversaire 400 points plus
fort ; une défaite coûte **−13**, **−7** et **−1** dans les mêmes cas. Le test
de fumée vérifie cet ordre à cinq niveaux différents.

**Ces constantes sont le réglage principal du jeu et ont été choisies par
simulation** (400 tirages par point, adversaires tirés à ±200 ELO) :

| Taux de victoires | Atteignent 1000 ELO | Parties (médiane) |
|---|---|---|
| 35 % | 100 % | 310 |
| 45 % | 100 % | 106 |
| 50 % | 100 % | 73 |
| 55 % | 100 % | 55 |

C'est la promesse : le mur n'existe pas, seule la durée change. Toucher à
`VV_CLIMB_GAIN_MAX`, `VV_CLIMB_LOSS_MIN` ou `VV_CLIMB_EASE` la déplace :
refaire la simulation avant. Quatre étapes du test de fumée la gardent
(`l'ascension paie plus qu'elle ne coûte sous 1000 ELO`, `une défaite coûte
toujours des points`, `l'écart avec l'adversaire décide du gain et de la
perte`, `le rang et les déblocages sont acquis pour toujours`).

Dernier point : un écart inhabituel **doit s'expliquer au joueur**. Un `+48`
suivi d'un `−2` passe pour un bug si personne ne dit pourquoi, et une chute
sous le seuil de son propre rang fait croire qu'on vient de perdre ses
créatures. C'est le rôle de `vvEloExplain()`, dont la phrase s'affiche sous
l'écart dans le modal de fin de partie — et qui reste **vide** en régime
ordinaire, où le chiffre se suffit.

**Toute lecture de rang ou de déblocage passe par le sommet, jamais par
`vvLoadElo()`.** Les points concernés : `vvRank()` / `vvRankIdx()`
(js/accounts.js), `boardSkinUnlocked()` et `menuNextMilestoneHTML()`
(js/economy-ui.js), `loadAccountGlobals()` (js/accounts.js),
`renderVoiePage()` (js/voie.js), `accountSummary()` (js/account-ui.js) et le
modal de résultat (js/game-flow.js). Un nouvel écran qui afficherait un rang
doit s'ajouter à cette liste, sinon il rétrograde le joueur tout seul.

### 1 quater. Les comptes (`js/accounts.js`, `js/account-ui.js`)

**Il n'y a plus aucun écran avant le jeu.** Le jeu s'est ouvert successivement
sur une page de connexion puis sur un voile « Choisissez votre pseudo » :
dans les deux cas un formulaire posé entre quelqu'un qui vient de cliquer sur
un lien et le jeu qu'il est venu voir — c'est-à-dire le moment exact où l'on
perd un visiteur, pour une information qui ne sert à rien tant qu'on n'a pas
joué. La **première ouverture crée elle-même un compte** au nom d'Alchimiste
tiré au sort (`accountsGuestName`) et entre directement dans le Lore puis le
tutoriel.

Le joueur gère ensuite son identité depuis la **page Comptes**
(`#page-account`), ouverte par la ligne « Compte » du panneau de réglages :
se renommer, créer un autre compte, basculer entre eux, en supprimer un.

Trois choses à savoir avant d'y toucher :

- **Le stockage était déjà multi-comptes.** Toutes les données de jeu sont
  préfixées par le pseudo (`accGet`/`accSet` → `mc_p_<pseudo>_<clé>`) :
  plusieurs comptes cohabitent sans qu'une seule ligne du reste du jeu ait à
  le savoir. `accGetFor(pseudo, clé)` lit un **autre** compte que le courant,
  en lecture seule — c'est ce qui permet à la page Comptes d'afficher le rang
  et l'ELO de chaque compte sans s'y connecter.
- **Changer de compte recharge la page**, délibérément. Une trentaine de
  variables globales (`savedArmies`, `VV_UNLOCKED`, l'inventaire, l'état du
  tutoriel, les récompenses, le cube…) portent l'état du compte courant : les
  remettre à zéro une par une, c'est se condamner à en oublier une le jour où
  l'on en ajoutera une trente-et-unième. Renommer, en revanche, ne recharge
  pas : seul le préfixe de stockage bouge, rien en mémoire ne change.
- **On ne devine pas un compte en balayant les clés.** Les clés de jeu
  contiennent elles-mêmes des tirets bas (`unlocked_pieces`, `win_streak`,
  `match_history`…) : il est impossible de savoir où finit le pseudo et où
  commence la clé. Un tel balayage inventerait des comptes fantômes. La liste
  fait autorité (`ec_accounts_v2`).

**« Se déconnecter » n'existe pas, et c'est volontaire.** Il n'y a pas de
connexion : rien à oublier, aucun mot de passe, aucune session. Le bouton a
existé (`accountLogout()`) ; il posait le joueur sur une autre identité, faute
d'écran de connexion où le renvoyer. Il est parti : quitter un compte n'est
rien d'autre que passer sur un autre, ce que la liste « Changer de compte »
fait déjà d'un geste — et mieux, puisqu'on y choisit lequel.

**ON NE FAIT CONFIRMER QUE CE QUI SE PERD.** Changer de compte ne détruit rien
et se défait en touchant la ligne d'à côté : `accountAskSwitch()` bascule
directement. Supprimer, oui — et la confirmation ne récite plus l'inventaire du
compte (« ses 13 parties classées, ses créatures et ses 903 perles ») : trois
chiffres à lire au moment où l'on veut juste savoir si on appuie.
« Définitivement » et « irréversible » suffisent à décider. Le seul refus qui
reste sur la bascule est `accountBusy()`, en pleine partie : celui-là
abandonnerait vraiment quelque chose.

Un compte créé depuis la page Comptes doit recevoir le Lore et le tutoriel
comme un premier lancement — mais après le rechargement, plus rien ne le
distingue d'un compte ordinaire. D'où le drapeau `ec_fresh_account_v1`, posé
par `accountCreate` et consommé par `accountsBoot`.

### 1 quinquies. Le son et l'haptique (`js/sfx.js`)

**Avant, chaque son du jeu était un bip.** Un déplacement, c'était une
sinusoïde à 440 Hz pendant 70 ms ; une capture, deux dents de scie. Un
oscillateur nu n'a pas d'attaque, pas de corps, pas de queue, et il sonne
*exactement* pareil à la centième capture qu'à la première. C'était le plus
grand écart perceptif entre ce jeu et une production de studio.

Un son court se fabrique en **empilant des couches**, et c'est ce que fait
`sfxPlay()` : une **attaque** (le transitoire, presque toujours du bruit
filtré — c'est lui qui donne l'impression de matière), un **corps** (les voix
accordées, avec une enveloppe ADSR réelle et non une coupure sèche, qui
produit un clic audible), une **queue** (la résonance dont l'absence
s'entend).

Trois principes font le reste :

| Principe | Ce qu'il fait | Pourquoi |
|---|---|---|
| **Variation** | ±3 à 6 % de hauteur et de volume à chaque déclenchement | Dix captures d'affilée ne sonnent jamais identiques. C'est *le* détail qui sépare un jeu qui bipe d'un jeu qui répond. |
| **Intensité** | `{force: 0..1}` déplace ensemble volume, hauteur et ouverture du filtre | Prendre un pion et prendre le Grand Maître (13 pts) ne peuvent pas produire le même bruit. Un simple changement de volume ne fait jamais « plus fort ». |
| **Ducking** | Un événement fort baisse la musique de 200 ms | Sans ça, la couche musicale mange l'attaque : on entend le son, on ne le *reçoit* pas. |

**Ajouter un son, c'est ajouter une entrée dans `SFX_RECIPES`, rien d'autre.**
Le reste du jeu appelle `playSound('capture')` et n'a jamais à savoir ce que
ça produit — c'est aussi ce qui permettra de brancher de vrais échantillons
plus tard sans réécrire une ligne ailleurs.

`playSound()` **garde son nom et sa signature** : une centaine d'appels y
mènent depuis tout le jeu, et aucun n'a eu à changer. Le second argument est
nouveau et facultatif. Son repli sur `playTone()` n'est pas décoratif : si
`sfx.js` ne se charge pas, le jeu reste jouable avec du son plutôt que muet.

**L'haptique n'existait nulle part** — aucun appel à `navigator.vibrate` dans
tout le projet, sur un jeu pensé téléphone d'abord. `haptic()` ajoute **cinq
motifs, pas un de plus** : au-delà, la vibration devient du bruit et le joueur
coupe tout, ce qui fait perdre les cinq qui comptaient. Deux garde-fous :
`prefers-reduced-motion` couvre aussi le vestibulaire (quelqu'un qui a demandé
moins de mouvement n'a pas demandé qu'on lui secoue l'appareil), et **iOS
Safari n'expose pas `navigator.vibrate`** — sur la moitié du parc mobile
l'haptique n'existe donc pas, d'où `sfxShake()`, un tremblement bref du
plateau qui rend l'impact perceptible autrement. Le réglage est **séparé du
son** : jouer en silence en gardant la vibration est un usage courant, et
l'inverse aussi.

`sfxFeel(nom, opts)` déclenche les trois ensemble (son + vibration +
secousse) : les appeler séparément partout, c'est se garantir qu'un jour l'un
des trois manquera quelque part.

### 1 quinquies ter. Les effets de combat (`js/combat-fx.js`)

**C'est la moitié visuelle du geste dont `sfx.js` est la moitié sonore.** Tout
le travail décrit ci-dessus avait été fait sur l'oreille — couches, enveloppes,
intensité liée à la valeur de la pièce prise, ducking — et rien de tout ça
n'avait d'équivalent à l'écran : la prise la plus violente d'une partie et la
plus anodine se ressemblaient, un dessin qui se ratatine dans les deux cas.

Le module pose des éléments **jetables** sur **deux couches** posées dans le
plateau, et c'est ce partage qui décide de tout :

| Couche | `z-index` | Ce qu'elle porte | Pourquoi de ce côté |
|---|---|---|---|
| `.fx-under` | 1 | traînées de déplacement, vortex, cercles de promotion | Une traînée par-dessus la pièce cacherait celle qu'on regarde. |
| `.fx-over` | 5 | éclats de prise, ondes, voiles d'écran, alarmes | Un impact doit couvrir la meurtrière. |

(La couche des pièces est en 2, les repères de rangée en 3, le cadre du
plateau en 6 : les effets se glissent entre.)

**Ce que chaque moment produit :**

| Moment | Effet | Ce qu'il dit |
|---|---|---|
| Prise en main | un halo qui respire **sous** la pièce, et un anneau qui s'ouvre sur chaque case jouable, en cascade depuis la main | Les pastilles disent l'état ; ceci dit que le plateau a entendu le doigt. Le retard de chaque anneau suit la **distance**, pas le rang dans une liste : l'onde part de la pièce. |
| Coup joué | une traînée du départ vers l'arrivée, teintée de la **classe** de la pièce | D'où ça vient. Sur 64 cases, un coup joué à l'autre bout de l'écran passait inaperçu — le premier reproche d'une partie en ligne. |
| Prise | noyau + anneaux + éclats projetés, dimensionnés par `sfxCaptureForce()` | Ce qui vient d'être brisé, et **combien ça valait**. |
| Prise majeure (force > 0,72) | un voile d'ardeur sur tout le plateau | Le pendant visuel du ducking de la musique. |
| Pièce qui disparaît | une bouffée de poussière et des motes qui montent | Posé par `syncPieces` pour **toute** pièce qui quitte le plateau — donc aussi les victimes collatérales du Typhon, sans que le module connaisse un seul pouvoir. |
| Typhon / Banshee / Méduse / Dresseur | vortex, ondes de hurlement, éclat de pierre, anneau de poussière | Un pouvoir avait sa règle et son texte de fiche, aucun n'avait de geste. C'est le geste qui l'explique. |
| Promotion | colonne de lumière, cercles runiques, poussière d'or qui monte | Le nœud de la pièce survit à la promotion : il n'y a rien à faire disparaître, seulement à célébrer. |
| Échec | alarme sur la case du roi + cerne rouge | `.gc-check` dit l'**état** en permanence ; ceci dit l'**instant**. |
| Mat | détonation sur le roi tombé, rais, plateau désaturé | Entre le coup qui mate et la cinématique d'issue, le plateau ne disait rien. |
| Victoire | le plateau **se dissout dans l'or** : un voile opaque monte pendant qu'une pluie de motes s'élève | Le seul effet du jeu autorisé à faire disparaître ce qu'il recouvre, et il ne sert qu'une fois par partie gagnée. C'est une **transition** : la cinématique d'issue se lève sur l'or au lieu de tomber sur un échiquier encore là. |

**Le mat parle avant la fenêtre, et la fenêtre l'attend.** `updateStatus`
allume l'effet **avant** `triggerEndOfGame()`, sinon la cinématique d'issue —
un voile plein écran — le recouvrirait avant qu'on en voie une image ; et
`settleAndCelebrate()` (`js/economy-ui.js`) demande à `fxOutcomeDelay()`
combien de temps attendre. Ce délai n'est **pas** une constante : il ne
répond que si un mat vient réellement d'être joué, dans les 300 dernières
millisecondes. Une nulle par répétition, un abandon ou une pendule à zéro
passent par le même chemin sans avoir rien allumé — et ne doivent rien
attendre, sous peine d'un écran qui a l'air figé.

**Le moteur ne connaît qu'un seul point d'entrée.** `executeGameMove()` appelle
`fxPlayMove({from, to, capAt, pieceId, captured, castle, rook, power})` et rien
d'autre : il n'a aucune notion de traînée ni de vortex, et le module aucune
notion de règle. Retirer la balise `<script>` d'`index.html` laisse le jeu
entier fonctionnel, en plus terne — tous les appels passent par un
`typeof …==='function'`.

**Trois interrupteurs**, dans cet ordre : `prefers-reduced-motion` (plus un
seul nœud posé), le curseur **« Effets »** du panneau de réglages (il pilote le
nombre de particules ; à 0, rien), et un plafond de nœuds vivants
(`FX_MAX_LIVE`) — une rafale de prises en partie rapide ne doit pas laisser
trois cents éléments animés à l'écran.

**Le piège à connaître avant de toucher à la section `[COMBAT-FX]` du CSS :**
les deux couches ne portent **ni `z-index` ni `opacity`**. L'un comme l'autre
ouvre un contexte d'empilement, et `mix-blend-mode` ne se fond alors plus que
dans un groupe vide : le noir des planches dessinées y resterait du noir, en
gros rectangle sur le plateau. La profondeur est donc portée par les effets
eux-mêmes, un cran plus bas. C'est aussi pourquoi le curseur « Effets » enlève
des étincelles au lieu de les rendre pâles.

Le banc d'essai **`tools/combat-fx-preview.html`** joue chaque effet sur
commande, sur un plateau nu, avec le vrai module et le vrai CSS : c'est là
qu'on règle une durée ou une couleur, sans avoir à provoquer la position
correspondante dans une partie.

### 1 quinquies bis. La notation du journal (`js/rules-engine.js`)

Le journal disait les deux cases, « ♞e1–f3 ». C'est une redondance qu'aucune
notation d'échecs n'écrit : la case de départ ne sert à rien tant qu'une seule
pièce peut atteindre l'arrivée. On note donc **la pièce puis la case
d'arrivée**, la LETTRE de la pièce étant remplacée par son **logo** — sur un
jeu où les pièces sont des créatures, « M » ou « G » ne désignerait rien
(Méduse, Grand Maître ? Garde d'Eau, de Feu, de Pierre ?).

La case de départ revient **quand, et seulement quand**, deux créatures du même
logo pouvaient aller sur la même case : colonne si elle suffit, sinon rangée,
sinon les deux (`mlDisambiguation`). Un pion qui capture garde toujours sa
colonne, comme le veut la règle officielle. Deux pièces sont « du même logo »
au sens de `PIECE_ART_ALIAS` : une Dame de départ et une Dame de promotion ont
deux identifiants et un seul dessin.

**Le piège** : `recordMove()` est appelée APRÈS la mutation du plateau —
chercher les rivales sur `gs.board` échouerait, la case d'arrivée étant
désormais occupée. `executeGameMove()` empile juste avant de jouer un
instantané complet dans `gs.history` : c'est lui qu'on interroge, avec ses
états spéciaux (paralysie, protection) recalculés dessus, pour que la question
posée soit bien « qui POUVAIT y aller ? ».

### 1 sexies. Le plateau persistant (`js/game-render.js`)

**Avant, chaque coup reconstruisait les 64 cases.** `renderGame()` assemblait
une chaîne de HTML et l'affectait d'un bloc à `boardEl.innerHTML` : tous les
nœuds — cases, pièces, repères — étaient détruits et recréés à chaque
demi-coup, à chaque sélection, à chaque retour d'historique. Trois
conséquences, et c'étaient les trois murs du game feel :

1. **Aucune animation continue n'était possible.** Une transition CSS a besoin
   que l'élément *survive* au changement pour interpoler. Un nœud détruit
   n'interpole rien : la pièce disparaissait d'une case et réapparaissait sur
   l'autre. L'ancien `animateLastMove()` contournait ça en injectant un
   décalage en pixels pour faire glisser la pièce *depuis* sa position
   d'arrivée — un trompe-l'œil qui ne marchait que pour **une** pièce, **une**
   fois, et jamais pour un roque (deux pièces bougent), une capture (la pièce
   prise devait mourir), une paralysie qui pulse ou une zone du Typhon.
2. **Le tactile en souffrait.** Un événement tactile reste attaché à l'élément
   d'origine pendant tout le geste. Comme toucher une pièce redessinait le
   plateau, la case touchée était détachée de l'arbre *avant* le relâchement
   du doigt : son `touchend` ne remontait plus jusqu'à `document`. Il a fallu
   tout un contournement pour qu'un seul appui suffise à jouer un coup.
3. **C'était cher.** 64 cases, 32 SVG et ~256 écouteurs reposés à chaque
   rendu, sur un téléphone d'entrée de gamme.

**Ce qu'on fait maintenant** — trois fonctions, et l'architecture tient dedans :

| Fonction | Rôle |
|---|---|
| `ensureBoardCells()` | Construit les 64 `.gc` **une fois**, avec leurs écouteurs. Ne recommence que si l'orientation change (le joueur passe aux Noirs). |
| `paintBoardCells()` | Met à jour les **classes** des cases : sélection, cases jouables, dernier coup, échec, curseur. Aucune n'est recréée. |
| `syncPieces()` | Le **diff** de la couche des pièces : créer, déplacer, retirer. Déplacer, c'est changer un `transform` ; la transition CSS fait le reste. |

Quatre points à ne pas casser :

- **Tout repose sur `cell.id`**, posé par `buildGameBoard`. Une promotion
  remplace l'objet par `{...p, pieceId, type}` : l'id survit, donc le nœud
  aussi — le pion **devient** une créature au lieu de disparaître pour lui
  laisser la place. `cloneBoard()` conserve l'id (c'est un spread), ce qui
  fait que la relecture d'historique *anime* les positions. Une pièce sans id
  s'en voit attribuer un dans `syncPieces` : mieux vaut une identité inventée
  qu'un diff qui recycle deux pièces l'une pour l'autre.
- **`.gc-layer` est en `pointer-events:none`.** Tout le hit-testing reste sur
  les 64 cases, qui ne bougent jamais — c'est ce qui fait disparaître le
  problème (2), et pourquoi le glissé-déposé démarre depuis la **case** et non
  depuis la pièce.
- **Les écouteurs des cases lisent `GS`, pas une partie capturée.** Les cases
  survivent d'une partie à l'autre : une référence figée dans une fermeture
  piloterait le plateau d'hier.
- **`.gc-piece` réserve son `transform` à sa position.** Tout effet visuel
  (survol, agonie, promotion) passe par l'enfant `.gc-art`, sinon il écrase la
  position de la pièce.

Ce que ça débloque, et qui n'existait pas : les pièces prises **meurent** au
lieu de s'évanouir, le roque anime ses deux pièces gratuitement, une promotion
se voit, et `boardResetPieces()` vide la couche entre deux parties (les
identifiants repartent de `p0` à chaque `buildGameBoard`, un nœud survivant
serait recyclé pour une pièce qui n'a rien à voir).

### 1 septies. Ce que le jeu montre du joueur, et ce qu'il refuse de croire

Quatre chantiers distincts, réunis ici parce qu'ils répondent tous à la même
question : **le jeu en sait long et n'en montrait rien — ou croyait ce qu'on
lui disait sans vérifier.**

**Le profil (`js/account-ui.js`, `js/accounts.js`).** L'ELO était un nombre
nu : le jeu enregistrait le résultat de chaque partie depuis toujours et n'en
affichait aucune synthèse. La page Comptes montre désormais le taux de
victoire, la meilleure série, la bande des **dix dernières parties** (une
pastille par partie, la plus récente à gauche — c'est la réponse la plus dense
à « est-ce que je monte ou est-ce que je coule ? ») et la **créature
fétiche**, avec son taux de victoire réel.

Deux agrégats nouveaux le permettent, et ils ne se déduisent **pas** de
`match_history`, qui ne garde que les 30 dernières parties : une statistique
de carrière lue sur un mois de jeu serait fausse et changerait de valeur toute
seule.

| Clé | Ce qu'elle garde |
|---|---|
| `piece_stats` | `{pieceId:{g,w}}` — parties et victoires par créature alignée. Une créature en double dans la même armée compte **une** partie : on mesure les parties jouées avec elle, pas les exemplaires posés. |
| `best_streak` | La plus longue série de victoires, à vie. **Relevée après `settleAndCelebrate`** : c'est `economySettle` qui incrémente `win_streak`, la lire avant enregistrerait toujours la série de la partie précédente. `win_streak` ne commande plus aucune récompense : cette ligne est sa seule raison d'exister. |

Un seuil de 5 parties protège la créature fétiche : « 100 % de victoires » sur
une seule partie n'apprend rien et se lit comme une promesse fausse.

**Les emotes (`js/multiplayer.js`).** Pendant une partie en ligne, l'adversaire
était muet : un pseudo, un ELO, rien d'autre. Dans un jeu qui n'a plus que des
adversaires humains, c'est la seule présence humaine qu'il restait à donner.
Six pictogrammes, **aucun texte libre** — un champ de saisie dans un jeu
compétitif demande une modération, un signalement et un blocage, trois
systèmes qui n'existent pas ici. Le canal est celui des coups : une emote est
un évènement de plus, pas une infrastructure de plus.

Deux garde-fous, tous deux nécessaires : une **sourdine** (sans elle, un
joueur qui subit un spam n'a que l'abandon comme recours) et un **débit
maximal des deux côtés** — on limite l'envoi *et* la réception, parce qu'un
client modifié n'a que faire de sa propre limite.

⚠️ Les pictogrammes hors du plan de base s'écrivent `\u{1F62C}` et **pas**
`ὢC` : un `\u` ne prend que quatre chiffres, et la seconde forme produit
deux caractères parasites au lieu de l'emoji. Le test de fumée le vérifie en
comptant les points de code.

**L'armée adverse est vérifiée (`mpArmyProblem`).** Chaque camp envoyait la
sienne par broadcast et l'autre l'installait telle quelle : rien ne contrôlait
le budget de 24 points, la limite d'une seule Primordiale, ni même que les
pièces existent. Un joueur qui modifiait son client pouvait se présenter avec
cinq Grands Maîtres, et son adversaire jouait sans jamais savoir pourquoi il
perdait. Le contraste était frappant avec les **coups**, eux revalidés
proprement depuis toujours (`mpApplyRemoteMove` cherche le coup reçu parmi
ceux que *notre* moteur a calculés) : la rigueur manquait à l'endroit où l'on
peut tricher une fois pour toute la partie plutôt qu'un coup à la fois.

La vérification est **locale**, donc contournable par deux clients complices —
seul un serveur qui compose la partie fermerait vraiment la porte. Mais elle
arrête le cas réel : un joueur seul qui trafique son navigateur contre un
adversaire honnête.

**Le plateau au clavier (`js/game-render.js`).** Un jeu au tour par tour est
l'un des rares genres réellement jouables sans souris et sans voir
parfaitement ; celui-ci ne l'était pas du tout. Le plateau est maintenant une
`grid` annoncée, chaque case porte son nom parlé (« e4, Cavalier Primordial
blanc »), les flèches déplacent un curseur, Entrée joue, Échap désélectionne.
Une **seule case est tabulable à la fois** (*roving tabindex*) : sans cela, il
faudrait soixante-quatre tabulations pour traverser le plateau. La barre de
statut est une région `aria-live="polite"` — `polite` et non `assertive`,
parce qu'une annonce de partie ne doit pas couper la lecture d'un coup.

### 1 octies. L'installation sur l'écran d'accueil (`js/pwa.js`, `sw.js`)

Le jeu vit dans un onglet, et un onglet se ferme : le lendemain, il n'existe
plus nulle part dans la journée du joueur. Une icône sur l'écran d'accueil est
le levier de rétention le moins intrusif qui existe, et le seul qui ne demande
pas de serveur. Le manifeste existait déjà mais **n'était référencé nulle
part** : le navigateur ne pouvait donc jamais rien proposer.

**Le moment de la proposition compte plus que la proposition.** Pas à
l'arrivée — un bandeau « installez-nous » sur le premier écran est le meilleur
moyen de se faire fermer. Après **trois victoires**, une seule fois, refus
définitif : la ligne reste dans les réglages pour qui change d'avis.

**Le service worker est écrit pour ne jamais servir une version périmée**, ce
qui est le seul vrai danger de cette technique :

| Ce qui est demandé | Stratégie | Pourquoi |
|---|---|---|
| html, js, css, json | **Réseau d'abord**, cache en secours | Une correction poussée ce matin arrive ce matin, comme sans service worker. |
| assets/, audio/, polices | **Cache d'abord** | 8 Mo qui ne changent presque jamais. Un changement demande de monter `CACHE_VERSION` — c'est le prix, il est assumé. |
| Tout autre domaine | **On ne s'en mêle pas** | Mettre en cache une réponse de temps réel Supabase n'aurait aucun sens. |

Il ne fait **pas** de notifications : elles demandent un serveur (VAPID, un
service de push, une base d'abonnements). Le jour où le backend existera,
c'est là qu'elles se brancheront.

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

**Un bot ne peut aligner que des pièces que le joueur possède déjà.**
`generateAIArmy` puisait dans TOUT le catalogue (option `full`), au motif
qu'un adversaire à 1750 ELO devait pouvoir montrer un Typhon avant qu'on le
débloque. En pratique, on perdait au sixième coup contre une créature dont on
n'avait jamais lu le pouvoir, sans aucun moyen d'en aligner l'équivalent en
face. Le vivier est maintenant `aiPiecePool()` (js/armies.js) : les pièces
**débloquées sur la Voie ou présentes en stock**, exactement la définition
d'`invOwnedIds()` (js/economy.js). Les Primordiales, qui échappaient à la
règle par une exception explicite, y sont soumises comme les autres. Le
catalogue adverse s'ouvre donc au rythme où le joueur débloque le sien.

Deux filets de sécurité, sans quoi un compte neuf (un Monarque, un Général,
zéro pièce d'appoint) ne pourrait plus lancer une seule partie : tant que le
joueur possède moins de trois pièces d'appoint, le vivier est complété par les
moins chères du catalogue ; et `opts.full` existe toujours, réservé à
`tools/ai-bench.js`, qui mesure la force du moteur hors de toute progression
de compte. Le jeu, lui, ne le passe plus. La règle est vérifiée par
`npm test` (« un adversaire ne compose son armée qu'avec des pièces que le
joueur possède »), sur un compte réduit à cinq pièces pour que le filet de
sécurité ne masque pas la règle.

Un mat trouvé n'est jamais gâché : au-delà de 40000, `aiPickMove` ferme la
fenêtre. Un adversaire faible ne voit pas le mat, mais s'il le voit, il le
joue — sinon il aurait l'air de se moquer du joueur.

Deux garde-fous contre le farm du bas de l'échelle : la formule Elo elle-même
(battre beaucoup plus faible que soi ne rapporte quasiment rien, donc aucun
palier de déblocage), et le fait qu'une victoire ne donne plus de coffre du
tout au règlement : elle fait avancer la **Colonne des Victoires**, qui a
trente paliers et une seule vie par compte.

Il y a eu deux autres garde-fous, tous deux retirés. Un **plafond de coffre**
par palier d'adversaire ramenait tout coffre au Coffre Pion contre Cendre ou
Suie, c'est-à-dire contre les deux adversaires que la galerie conseille à un
compte neuf : un débutant enchaînait six victoires et ne voyait jamais autre
chose qu'un Coffre Pion. Puis le **verrou quotidien** de la série est parti
avec la série elle-même. Le `tier` d'`AI_OPPONENTS` ne sert plus qu'à situer
l'adversaire sur l'échelle des douze.

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
apparaître — il n'y a aucune liste à tenir à jour. Même principe pour tout
`assets/backgrounds/`, `assets/banners/`, `assets/ui/`, `assets/fx/` et
`assets/ranks/` (voir `assets/PROMPTS.md`). Leur 404 est un comportement
voulu, et `tools/smoke-test.js` l'ignore explicitement (`OPTIONAL_ASSET`).

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
créature, suivie de son exercice de déplacement. Une défaite ne fait pas
avancer : le savant propose la revanche, autant de fois qu'il le faut.

**Les trois premières créatures sont les trois Gardes**, et c'est un choix :
la Garde d'Eau ne va que tout droit (une case), la Garde de Feu qu'en biais
(une case), la Garde de Pierre dans les huit directions. Elles enseignent le
vocabulaire du plateau — orthogonal, diagonal, les deux — au lieu d'ouvrir sur
trois pouvoirs à retenir, et les deux premières n'ont volontairement **aucun**
pouvoir. Elles portent le drapeau `starter` dans `UNLOCK_TABLE` ; la Fourmi et
l'Éléphant de guerre, qui tenaient ce rôle avant elles, sont devenus les deux
premiers déblocages par l'ELO (30 et 75). Le Peureux, lui, a été retiré du
catalogue.

Ces batailles passent par `startGame(true,false,tutoCfg)` : le troisième
argument impose le plateau et la couleur, **saute l'économie** (rien n'est
prélevé sur l'Armurerie, une promotion ne crédite rien) et court-circuite la
cinématique d'entrée. `triggerEndOfGame` les détourne vers `tutoOnBattleEnd` :
ni ELO, ni avancée des voies, ni règlement d'Armurerie. **Aucune des quatre
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
recule pas, la Garde de Feu ne quitte jamais sa couleur de case). Cinq
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

### 7 ter. Le mode bureau (`js/main.js::watchDeskMode`, `[DESKTOP]`)

Le jeu est pensé **téléphone d'abord**, et c'est le bon choix. Mais les 22
règles adaptatives de la feuille de style étaient **toutes** des `max-width` :
il n'existait pas une seule règle « à partir de tant de pixels ». Sur un écran
d'ordinateur, le jeu ne s'adaptait donc pas — il restait une colonne de
téléphone posée au milieu du vide, avec une barre des faces (une barre de
**pouce**) qui flottait par-dessus le contenu et en masquait une partie.

**Il n'y a pas de « version ordinateur ».** Même balisage, mêmes scripts, mêmes
gestionnaires d'évènements : seule la mise en page change, sous une classe.
Deux fichiers auraient divergé au troisième changement.

`body.desk` est l'interrupteur unique, posé par `watchDeskMode()` à partir
d'une requête écrite **une seule fois, en JS** :
`(min-width:1024px) and (hover:hover) and (pointer:fine)`. Le JS doit prendre
les mêmes décisions que le CSS, et deux seuils écrits à deux endroits finissent
toujours par se désaccorder — la feuille de style ne raisonne donc que sur la
classe. Une tablette tactile large reste en mise en page tactile : on y joue au
doigt.

Le principe qui guide tout le bloc : **le téléphone cache, l'ordinateur
montre.** Rien n'est inventé pour l'ordinateur, on y déplie ce que le petit
écran est obligé d'enfermer derrière un bouton.

| Ce qui change | Pourquoi |
|---|---|
| La barre des faces devient un **rail vertical** à gauche, libellés à droite du blason | Sur téléphone c'est une barre d'onglets pleine largeur collée en bas ; sur 1400 px elle masquerait le contenu. Le rail ne recouvre rien : la zone utile de chaque face recule d'autant |
| Les deux flèches de rotation disparaissent | Sur 1500 px elles se retrouvaient à 1400 px l'une de l'autre, sans lien visible avec le cube. Le rail nomme les quatre faces ; ← et → tournent toujours |
| Le menu principal passe en **deux colonnes** | La colonne de droite (`#menu-side`) déplie le cycle de la récompense journalière, le résumé des deux voies de récompenses et le prochain palier de la Diagonale |
| Les largeurs de contenu montent à `--content-max` (1280 px) | Les plafonds (980, 1000, 860…) étaient des plafonds de lisibilité inutiles sur téléphone et un plafond de gâchis sur grand écran |
| Le catalogue passe de 6 à ~8 colonnes, avec des cartes plus grandes | Les 19 pièces tiennent alors sur un écran, sans défilement |
| Le **survol** d'une carte ouvre ses deux boutons | L'appui qui déplie la carte ne sert plus à rien quand un pointeur la désigne déjà : composer une armée passe de deux clics par pièce à un seul |

Deux pièges à connaître avant d'y toucher :

- **`body.rail-on`** (posé par `updateArrows`, js/cube-nav.js) reflète la
  visibilité de la barre des faces. Le retrait de la zone utile y est
  conditionné, parce qu'il doit disparaître **exactement** quand le rail
  disparaît — pendant une partie, par exemple, où le cube est verrouillé. Sans
  ce drapeau, le plateau jouerait avec une bande vide de 200 px à sa gauche.
- **Le rail est posé dans le repère des faces**, pas dans celui de la fenêtre :
  `left:calc((100% - 100vw) / 2)`. `html` réserve en permanence la place d'une
  barre de défilement (`scrollbar-gutter:stable`), donc le bloc conteneur d'un
  élément `fixed` fait 11 px de moins que `100vw`, alors que les faces sont
  dimensionnées en `vmax`/`vw`. Sans ce calcul, le rail mordait de 5,5 px sur
  le contenu. Là où aucune place n'est réservée (téléphone), le calcul vaut 0.

`Échap` (`wireEscape`, js/main.js) ferme le panneau de réglages, la fenêtre de
la récompense journalière et les pages en surimpression. La liste est **courte et volontaire** :
sont exclus la cérémonie d'un coffre (fermer applique le lot), la fenêtre de
fin de partie (elle règle l'ELO et la mise), la promotion d'un pion (il faut
choisir) et la recherche en ligne (partir sans annuler laisse une entrée dans
le salon). Une touche ne doit pas engager ce qu'un clic n'engage pas.

### 7 bis. Le verrou de portrait (`js/main.js::lockPortrait`)

Le jeu se joue **en hauteur, et seulement en hauteur** : plateau au centre,
journal en feuille glissante sous le pouce, barre des faces collée en bas.
Couché, un téléphone n'offre plus que ~400 px de haut, que le plateau devrait
partager avec la barre de compte, la barre d'état et le journal — il ne reste
qu'un échiquier de la taille d'une vignette entre deux bandes vides.

Trois verrous, du plus fort au plus faible, parce qu'**aucun ne suffit seul** :

1. `site.webmanifest` déclare `"orientation": "portrait"` — le seul vrai
   verrou, mais il ne vaut que pour une application **installée** sur l'écran
   d'accueil ;
2. `lockPortrait()` appelle `screen.orientation.lock('portrait')`. Les
   navigateurs ne l'accordent qu'en plein écran ou en application installée,
   et le refusent partout ailleurs ; sur iOS l'API n'existe pas. Le refus est
   donc le cas **normal**, d'où le `try/catch` **et** le `.catch()` sur la
   promesse — sans quoi la console se remplirait à chaque ouverture ;
3. le voile `#rotate-gate` (`index.html` + `[PORTRAIT-LOCK]` de
   `css/style.css`) prend le relais dans un onglet ordinaire : il recouvre
   tout dès que l'écran bascule et disparaît dès qu'on le redresse.

Le media query du voile décrit « un téléphone couché », et rien d'autre :
`(hover:none) and (pointer:coarse)` (un écran tactile), `(orientation:landscape)`
(couché) et `(max-height:560px)` (un téléphone — une tablette couchée dépasse
les 700 px de haut et garde le droit de jouer en paysage).

### 8. L'appariement en ligne (`js/multiplayer.js`)

L'ancien algorithme appariait **les deux plus anciens**, point final : un
joueur à 120 ELO tombait donc régulièrement contre un joueur à 2000, ce qui,
dans un jeu où perdre coûte l'armée engagée, est la pire rencontre possible
pour les deux. Il supposait en plus que les deux navigateurs aboutiraient au
même calcul au même moment, alors que leurs horloges ne sont pas synchronisées.

Le nouveau tient en quatre règles :

1. **Fenêtre de niveau qui s'élargit vite, et se referme sur ±600** :
   ±200 ELO au départ, +200 toutes les 2 secondes, plafonnée à **±600**
   atteints au bout de 4 secondes (`mpEloWindow`). Elle ne devient **jamais**
   infinie : personne n'attend dix secondes sur un écran de recherche, et
   dans un jeu où perdre coûte l'armée engagée, jeter un débutant contre un
   joueur de 1800 est pire que ne pas trouver de partie. Avec la courbe
   d'ascension, la quasi-totalité des comptes vit entre 0 et 1000 ELO :
   ±600 y couvre presque tout le monde. Le jour où la population s'étale,
   c'est `MP_ELO_MAX` qu'il faudra revoir.
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
- **Les chiffres du JSON-LD et de `llms.txt`** (19 créatures, 5 classes,
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

L'adresse de l'icône est **versionnée** (`/favicon.svg?v=2`) dans
`index.html`, `info.html` et `site.webmanifest`. Ce n'est pas décoratif : les
navigateurs gardent l'icône d'onglet en cache bien plus longtemps que le reste
du site, souvent sans la relire à un rechargement ordinaire. Après une refonte
de l'emblème, l'ancienne image restait dans l'onglet de tous ceux qui avaient
déjà ouvert le jeu ; changer l'adresse est le seul moyen sûr de la faire
abandonner. **Incrémentez le numéro aux trois endroits à chaque fois que le
tracé change** — `npm test` vérifie que le manifeste pointe bien la même
adresse que le `<link rel="icon">`.

### Où l'emblème s'affiche

Le crochet est la classe **`.game-emblem`** : `mountEmblems()` (js/main.js)
remplit tout élément qui la porte, et les classes qui l'accompagnent ne
règlent que la taille et l'encre.

**Aucun écran du jeu n'en porte actuellement.** Le dernier emplacement était le
menu principal (`menu-emblem`, au-dessus du pseudo) ; il est parti, parce qu'un
sceau de 52 px demandait de connaître le jeu pour le reconnaître. Le menu écrit
maintenant **« Epic Chess »** en toutes lettres (`.menu-title`), et c'est sa
hauteur — `--menu-title-h` — dont dépend le retrait de `.jouer-menu`.

`EMBLEM_SVG` reste malgré tout la référence du tracé : `favicon.svg` en reprend
exactement les chemins, et c'est lui qu'on voit dans l'onglet et sur l'écran
d'accueil. Reposer le sceau quelque part ne demande donc qu'une `<div
class="game-emblem …">`.

`/info` (info.html) n'exécute **aucun** script : son emblème est une `<img>`
sur `favicon.svg`, pour qu'il ne puisse pas diverger d'une copie de tracé.

Ajouter un emplacement, c'est poser une `<div class="game-emblem …">` — rien
d'autre. L'emblème n'a longtemps vécu que dans le voile de choix du pseudo,
c'est-à-dire sur un écran qu'un joueur ayant déjà un compte ne revoyait jamais :
le refondre ne se voyait alors nulle part. Ce voile a disparu (voir la section
sur les comptes) et l'emblème est passé sur le menu principal, où il est vu à
chaque ouverture.

## Ordre de chargement (`index.html`, en bas de page)

L'ordre des `<script>` est important car il n'y a pas de système de modules :
chaque fichier suppose que les globals des fichiers précédents existent déjà.

```
data-pieces.js → piece-art.js → main.js → cube-nav.js → accounts.js
→ economy.js → ai-level-modal.js → piece-card.js → builder.js → armies.js
→ adversaires.js
→ combat-intro.js
→ sfx.js → combat-fx.js → rules-engine.js → piece-moves.js → combat-music.js
→ cinematics.js
→ game-render.js
→ ai-engine.js → game-flow.js → voie.js → economy-ui.js
→ rewards.js → rewards-ui.js → tuto-drill.js
→ tutorial.js
→ pwa.js → account-ui.js → settings-admin.js → multiplayer.js → (script inline) initApp()
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
`rewards.js` doit venir après `economy.js` (inventaire, perles, `todayKey`) et
`rewards-ui.js` après `economy-ui.js` (il réutilise `chestVisual`,
`chestOpenNow` et `pearlAmountHTML`). Aucun des deux n'est appelé au
chargement : tous les autres modules les invoquent par `typeof … === 'function'`,
si bien qu'un jeu privé de ces deux fichiers continuerait de tourner sans ses
deux voies de récompenses.

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
la Diagonale de la Puissance, cycle de la récompense journalière (ordre des
trente lots, reprise au premier après le trentième), fourchettes de contenu des
six coffres, colonne des victoires (ordre des trente paliers, encaissement d'un
coffre, conversion des jokers), rangée de la richesse et quêtes du jour. Il échoue au
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
| Changer la notation du journal des coups | `recordMove` / `mlDisambiguation` dans `js/rules-engine.js` (+ `.ml-*` dans `css/style.css`) |
| Changer ce qui se promeut en arrivant au bout | `PROMOTING_IDS` dans `js/data-pieces.js` — `showPromoModal`, l'IA et le multijoueur excluent tous les trois ces pièces de la LISTE des promotions possibles |
| Changer le calcul d'ELO, les rangs, les paliers de déblocage | `js/voie.js` (calcul) + `js/data-pieces.js` (table `UNLOCK_TABLE`/`RANKS`) |
| Ajouter / régler un adversaire (niveau, style, lore) | `js/data-pieces.js` (`AI_OPPONENTS`), puis `node tools/ai-bench.js` pour vérifier l'échelle |
| Modifier le moteur lui-même (évaluation, recherche) | `js/ai-engine.js` (`evalBoard`, `evalPowers`, `minimax`, `aiSearchRoot`, `aiPickMove`) |
| Changer la façon dont un style se joue | `STYLE_W` dans `js/ai-engine.js` (évaluation) + `ARMY_STYLE_CLASS` dans `js/armies.js` (composition) |
| Ajouter un portrait d'adversaire | déposer `assets/adversaires/<id>.png` — rien à déclarer |
| Ajouter une image de décor (fond, bannière, effet, médaillon de rang) | déposer le fichier au chemin que donne `assets/PROMPTS.md` — rien à déclarer. L'emplacement est déjà câblé dans la section `[ART]` de `css/style.css` |
| Câbler un NOUVEL emplacement d'image | section `[ART]` de `css/style.css`, en `background-image` (jamais en `<img>` : une image manquante y afficherait l'icône de fichier cassé), puis décrire la planche dans `assets/PROMPTS.md` |
| Éclaircir ou assombrir tout le jeu | le bloc `:root` de `[THEME]` dans `css/style.css` — les trois rôles (surface / accent / laiton) ne doivent pas s'y mélanger |
| Changer le contenu ou la rareté des coffres | `js/data-pieces.js` (`CHESTS`, `DAILY_CHEST`) + `js/economy.js` (`chestRoll`) |
| Changer à quoi ressemble un coffre (partout : journalière, colonne, Magasin) | `chestVisual()` dans `js/economy-ui.js` — il rend la **statuette** (première planche de la séquence de bris) dès qu'un coffre en a une, sinon le coffre à couvercle dessiné en CSS |
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
| Ajuster la mise en page ordinateur d'un écran | section `[DESKTOP]` de `css/style.css` (tout à la fin, après `[MOBILE-APP]`), sous `body.desk` |
| Changer le seuil du mode bureau | `DESK_QUERY` dans `js/main.js` — **et nulle part ailleurs** : le CSS ne raisonne que sur `body.desk` |
| Changer ce que montre la colonne de droite du menu | `renderMenuSidePanel()` / `menuNextMilestoneHTML()` dans `js/economy-ui.js` + `#menu-side` dans `index.html` |
| Ajouter un raccourci clavier global | `wireEscape()` dans `js/main.js` (Échap) ou l'écouteur `keydown` d'`init()` dans `js/cube-nav.js` (← →) |
| Modifier les pictogrammes du schéma de déplacement (patte, ailes, couteau…) | `PMV_ICONS` / `PMV_LABELS` dans `js/piece-moves.js` + section `[PMV]` de `css/style.css` |
| Modifier les cinématiques de combat | `js/cinematics.js` + section `[CINEMATIC]` de `css/style.css` |
| Régler un effet de combat (durée, couleur, densité) | `js/combat-fx.js` + section `[COMBAT-FX]` de `css/style.css` ; banc d'essai : `tools/combat-fx-preview.html` |
| Modifier le tutoriel (textes, étapes, cibles) | `js/tutorial.js` (`TUTO_STEPS`) |
| Modifier les batailles du tutoriel (armées, couleurs, pendule) | `js/tutorial.js` (`TUTO_BATTLES`, `TUTO_EXTRA_COLS`) + `js/data-pieces.js` (`TUTO_INSTRUCTORS`) |
| Modifier l'exercice de déplacement (nombre de repères, règles) | `js/tuto-drill.js` (`DRILL_DOTS`, `drillLayDots`) |
| Changer les pièces d'un compte neuf | `js/data-pieces.js` (`UNLOCK_TABLE`, drapeau `coffre:true`) |
| Changer ce que lance le bouton COMBAT | `js/cube-nav.js` (`onCombat`/`onVsIa`) + `js/combat-intro.js` |
| Modifier la galerie des adversaires (cartes, sceaux, palmarès) | `js/adversaires.js` + section `[ADVERSAIRES]` de `css/style.css` |
| Changer le fond du menu principal | `assets/backgrounds/main-page.webp` (ou `.png`, voir `tools/opt-images.js`) + section `[LAB-BG]` de `css/style.css` |
| Modifier le bloc pseudo/rang/ELO du menu principal | `renderMenuIdentity()` dans `js/accounts.js` + `[MENU]` de `css/style.css` |
| Régler la vitesse de rotation du cube | `js/cube-nav.js` (`ROTATE_MS`) **et** la transition de `#cube` dans `css/style.css` |
| Modifier le système de comptes/sauvegarde | `js/accounts.js` |
| Modifier la page Comptes (sceau, bascule, création) | `js/account-ui.js` + `[ACCOUNT-PAGE]` de `css/style.css` |
| Ajouter ou retoucher un bruitage | `SFX_RECIPES` dans `js/sfx.js` (rien d'autre à toucher) |
| Changer le rendu du plateau, l'animation des pièces | `syncPieces()` / `paintBoardCells()` dans `js/game-render.js` + `[BOARD-MOTION]` de `css/style.css` |
| Changer une vibration | `HAPTIC_PATTERNS` / `SFX_FEEL` dans `js/sfx.js` |
| Ajouter une emote, changer la sourdine | `MP_EMOTES` dans `js/multiplayer.js` |
| Ajouter une statistique au profil | `accountSummary()` / `accountSealHTML()` dans `js/account-ui.js` |
| Changer la stratégie de cache hors ligne | `sw.js` (et monter `CACHE_VERSION`) |
| Vérifier l'UI à toutes les tailles d'écran | `node tools/ui-shots.js` |
| Changer la vitesse de montée en ELO | `VV_CLIMB_*` et `VV_K_STEPS` dans `js/voie.js` (relire « La courbe d'ascension ») |
| Changer la largeur de la fenêtre d'appariement | `MP_ELO_*` dans `js/multiplayer.js` |
| Ajouter un nouveau réglage utilisateur | `index.html` (bloc `#settings-panel`, sous les deux boutons « Compte » / « Installer ») + `js/settings-admin.js` |
| Changer ce que dit la barre de statut d'une partie | `updateStatus()` dans `js/game-render.js` (+ `.status-bar` dans `css/style.css`) |
| Modifier la présentation ou la FAQ publiques | `info.html` (texte visible **et** JSON-LD `FAQPage`) |
| Changer les modes qui rapportent de l'ELO | `js/voie.js` (`vvNoEloReason`) |
| Changer ce que contient un coffre | `CHESTS` (`total`) et `CHEST_PEARLS` dans `js/data-pieces.js` + `chestRoll` dans `js/economy.js` |
| Changer le cycle des lots journaliers | `DAILY_REWARDS` dans `js/data-pieces.js` (l'affichage suit tout seul) |
| Changer les récompenses de la colonne des victoires | `VICTORY_COLUMN` dans `js/rewards.js` (l'affichage suit tout seul) |
| Changer les paliers ou le prix en tickets de la rangée | `WEALTH_TIERS` dans `js/rewards.js` |
| Ajouter / modifier une quête | `QUEST_POOL` dans `js/rewards.js` ; si elle demande un fait de jeu inédit, poser l'appel `questNote()` là où ce fait se produit |
| Changer ce que valent les jokers ou ce qu'ils peuvent devenir | `jokerChoices`/`jokerConvert` dans `js/rewards.js` + `renderJokerModal` dans `js/rewards-ui.js` |
| Modifier la page des deux voies | `js/rewards-ui.js` + `#page-rewards` dans `index.html` + `[REWARDS]` de `css/style.css` |
| Modifier la récompense journalière | `DAILY_REWARDS` dans `js/data-pieces.js` + `dailyReward*` dans `js/rewards.js` + `renderDailyModal` dans `js/rewards-ui.js` |
| Changer les écrans qui portent le bouton de réglages | `updateMainMenuFlag` dans `js/cube-nav.js` + `body.main-menu` dans `[SETTINGS]` de `css/style.css` |
| Changer le retrait haut des pages (sous l'encoche) | `--page-top` / `--menu-top` en tête de `css/style.css` |
| Changer ce que donne le mode test | `economyAdmin`/`invAll`/`pearlBalance` dans `js/economy.js` + `vvLoadElo`/`loadAccountGlobals` dans `js/accounts.js` |
| Ajouter un tips d'attente en ligne | `MP_TIPS` dans `js/multiplayer.js` (une ligne de plus dans le tableau) |
| Ajouter une adresse au jeu (comme `/combat`) | `vercel.json` (`rewrites`) + `appPath`/`setAppPath`/`appHomePath` dans `js/main.js` |
| Changer l'adresse du mode test | `ADMIN_QUERY` + `pathHasAdmin()` dans `js/main.js` (paramètre `?test`, pas un chemin : un chemin inexistant dépend d'une réécriture d'hébergeur et répondait 404) |
| Changer ce que contient un coffre | `CHESTS`/`CHEST_PEARLS` dans `js/data-pieces.js` + `chestRoll`/`chestLuckyChance` dans `js/economy.js` |
| Changer le fond de l'écran d'attente en ligne | remplacer `assets/backgrounds/duel-wait.webp` (rien à coder) |
| Changer un message de refus / d'information | l'appel `showNotif()` concerné ; l'apparence est dans `[NOTIF]` de `css/style.css` |
| Modifier l'emblème (logo) du jeu | `EMBLEM_SVG` dans `js/main.js` + `favicon.svg` (même tracé) + `[EMBLEM]` de `css/style.css` — **et incrémenter le `?v=` de l'icône** dans `index.html`, `info.html` et `site.webmanifest`, sinon l'onglet garde l'ancienne en cache |
| Ajouter un endroit qui affiche l'emblème | poser une `<div class="game-emblem …">` dans `index.html` : `mountEmblems()` (js/main.js) la remplit toute seule |
| Modifier les blasons ou les onglets de la barre du bas | les quatre `<svg>` et `.cfb-label` de `#cube-facebar` dans `index.html` + `.cube-facebar` / `.cube-facebar-btn` dans `[CUBE]` de `css/style.css` (et `--facebar-h` dans `[THEME]`, que `--page-bottom` réserve) |
| Changer ce qu'un bot peut aligner | `aiPiecePool()` / `generateAIArmy()` dans `js/armies.js` |
| Changer le verrou d'orientation (téléphone) | `lockPortrait()` dans `js/main.js` + `orientation` dans `site.webmanifest` + `[PORTRAIT-LOCK]` de `css/style.css` (voile `#rotate-gate`) |
| Changer le bandeau « à qui de jouer » | `updateStatus()` dans `js/game-render.js` (constantes `TURN_YOU` / `TURN_OPP`) |
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