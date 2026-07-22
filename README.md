# Epic Chess — Architecture du projet

Ce projet est un jeu d'échecs variant ("Epic Chess") en HTML/CSS/JS pur,
**sans build step, sans modules ES, sans dépendance externe** (hors polices
Google Fonts). Il s'ouvre en double-cliquant sur `index.html`, aucun serveur
n'est nécessaire.

## Pourquoi cette architecture

Le fichier était à l'origine un unique `.html` de ~3000 lignes. Il a été
découpé en modules **par domaine fonctionnel** pour qu'on puisse te donner
(ou que tu puisses éditer) un seul fichier à la fois — par exemple
`css/style.css` ou `js/tournoi.js` — sans avoir besoin de relire tout le
reste, du moment que la structure ci-dessous est connue.

Tous les scripts sont chargés via des balises `<script src="...">`
classiques (pas de `import`/`export`, pas de bundler). Toutes les variables
et fonctions sont donc dans un espace de noms global partagé — c'est
volontaire et c'est ce qui permet au moteur de jeu, au rendu, et à l'IA de
se parler directement.

## Arborescence

```
epic-chess/
├── index.html              # Coquille HTML légère : tout le markup des pages
│                            # + chargement ordonné des <script src="...">
├── README.md                # Ce fichier
├── css/
│   └── style.css            # Tout le CSS, organisé en sections [TAG] commentées
└── js/
    ├── data-pieces.js       # Données pures (pièces, rangs, IA, déblocages)
    ├── main.js               # État global partagé + helpers (showPage, showNotif...)
    ├── cube-nav.js           # Navigation principale par cube 3D (CSS). Déplace
    │                          # builder/partie dans les faces ; showPage y délègue.
    ├── accounts.js           # Comptes locaux (localStorage), connexion
    ├── ai-level-modal.js     # Modal de choix de l'instructeur IA
    ├── builder.js            # Page de composition d'armée
    ├── armies.js             # Pages "Mes armées" / "Armées IA" + génération IA
    ├── combat-intro.js       # Page d'intro combat (VS)
    ├── rules-engine.js       # Moteur de règles pur (coups, échecs, exécution)
    ├── game-render.js        # Rendu plateau, drag&drop, clics, historique
    ├── ai-engine.js          # Évaluation, minimax, Web Worker IA
    ├── game-flow.js          # Démarrage partie, fin de partie, résultat
    ├── voie.js                # Page "Voie des Victoires" (ELO, rangs, jalons)
    ├── tournoi.js             # Mode Tournoi + modal d'analyse replay
    └── settings-admin.js     # Panneau réglages + mode Administrateur
```

## Ordre de chargement (`index.html`, en bas de page)

L'ordre des `<script>` est important car il n'y a pas de système de modules :
chaque fichier suppose que les globals des fichiers précédents existent déjà.

```
data-pieces.js → main.js → cube-nav.js → accounts.js → ai-level-modal.js
→ builder.js → armies.js → combat-intro.js → rules-engine.js
→ game-render.js → ai-engine.js → game-flow.js → voie.js → tournoi.js
→ settings-admin.js → (script inline) initApp()
```

`cube-nav.js` est chargé juste après `main.js` : il étend `showPage()` (la
navigation devient un cube 3D en CSS) et déplace à l'exécution les pages
`#page-builder` / `#page-game` dans les faces du cube. Il ne connaît QUE la
face courante, les rotations et le verrouillage — aucune logique de jeu.
Les pages secondaires (armées, voie, tournoi, combat, login) restent des
overlays plein écran classiques affichés au-dessus du cube.

Si tu ajoutes un nouveau fichier JS, insère-le dans cette chaîne à l'endroit
qui correspond à ses dépendances (voir l'en-tête de chaque fichier, qui liste
explicitement ses dépendances et qui l'utilise).

## Où éditer selon ce qu'on te demande

| Demande | Fichier(s) à éditer |
|---|---|
| Changer une couleur, un style, l'apparence d'une page | `css/style.css` (cherche le tag `[NOM-DE-PAGE]` en commentaire) |
| Ajouter/modifier une pièce (valeur, emoji, description) | `js/data-pieces.js` (tableau `PIECES`) |
| Changer les règles de mouvement d'une pièce existante ou en ajouter une | `js/rules-engine.js` (fonction `generateMovesRaw`, + `isSquareAttackedSimple` si elle peut mettre en échec) |
| Changer le calcul d'ELO, les rangs, les paliers de déblocage | `js/voie.js` (calcul) + `js/data-pieces.js` (table `UNLOCK_TABLE`/`RANKS`) |
| Modifier le comportement de l'IA (force, style de jeu) | `js/ai-engine.js` (`evalBoard`, `minimax`) + `js/data-pieces.js` (`AI_INSTRUCTORS`) |
| Modifier le mode tournoi (nombre de rounds, bonus ELO) | `js/tournoi.js` |
| Modifier le système de comptes/sauvegarde | `js/accounts.js` |
| Ajouter un nouveau réglage utilisateur | `index.html` (bloc `#settings-panel`) + `js/settings-admin.js` |
| Changer le HTML d'une page (structure, nouveaux boutons) | `index.html` (cherche `<!-- PAGE ... -->`) + le module JS de la page concernée pour les listeners |

## Conventions à connaître avant d'éditer un seul fichier

- **Style de code** : pas de point-virgule systématique après chaque
  instruction dans certains blocs, usage massif de fonctions fléchées et de
  templates strings concaténées avec `+`. Le style existant est délibérément
  dense — le conserver pour la cohérence plutôt que de reformatter.
- **État global partagé** (déclaré dans `main.js` et `rules-engine.js`) :
  - `army` — armée en cours de composition dans le builder
  - `GS` — état complet de la partie en cours (board, tours, historique...)
  - `currentArmyData` / `aiArmyData` — armées sélectionnées pour le combat
  - `VV_UNLOCKED` — `Set` des ids de pièces débloquées pour le compte courant
  - `CUR_ACC` — pseudo du compte actuellement connecté
  - `tournamentState` — état du tournoi en cours (dans `tournoi.js`)
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
- **Pas de build step** : n'introduis pas de syntaxe ES modules
  (`import`/`export`), de JSX, de TypeScript, ou de dépendance nécessitant
  npm/bundler. Le jeu doit continuer à fonctionner en ouvrant `index.html`
  directement dans un navigateur, sans serveur.

## Pour me redonner un seul fichier dans une future conversation

Il suffit de me coller le contenu du fichier concerné (ex: juste
`js/tournoi.js` ou juste `css/style.css`) et de me dire ce que tu veux
changer. Grâce à ce README et aux en-têtes de dépendances en haut de chaque
fichier, je peux éditer ce fichier isolément sans avoir besoin du reste du
code — sauf si ta demande touche une interaction entre modules (auquel cas
je te le signalerai et te demanderai le(s) fichier(s) complémentaire(s)
nécessaire(s)).