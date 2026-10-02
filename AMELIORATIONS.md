# Epic Chess — tout ce qui peut s'améliorer

Audit complet du jeu (le 2 octobre 2026) : chaque écran capturé en téléphone
(390 × 844) et en ordinateur (1440 × 900), chaque module relu. **Le jeu
lui-même — règles, pièces, pouvoirs, économie de base — n'est pas touché** :
tout ce qui suit porte sur ce qui l'entoure.

Légende : ✅ fait dans cette passe · 🟡 fait en partie · ⬜ reste à faire
(avec la raison) · ↩️ essayé puis retiré · ➖ relevé à l'audit, puis écarté à la vérification (la
raison est donnée : on ne corrige pas ce qui n'est pas cassé).

---

## 1. Défauts constatés

| | Défaut | Où | Statut |
|---|---|---|---|
| 1.1 | **La page « Guerre des clans » est vide.** C'est un des cinq onglets de la barre principale, et `renderReservePage()` ne fait rien : on y arrive sur un titre et un fond noir. Le plus gros trou du jeu. | `js/economy-ui.js`, `#page-reserve` | ✅ page complète (§ 2) |
| 1.2 | Le tutoriel décrit encore la récompense de **série** (« une victoire : un Coffre Pion, deux d'affilée : un Coffre Cavalier… ») supprimée depuis longtemps, et pointe `#rs-pearls`, qui n'existe plus. | `js/tutorial.js` | ✅ réécrit pour la Guerre des clans |
| 1.3 | L'interrupteur « Effets » fait 48 × 28 px : sous le seuil tactile de 36 px. | `[SETTINGS]` | ➖ sa zone de toucher est déjà agrandie à 56 × 46 par un `::after` invisible (`.sp-switch::after`) |
| 1.4 | En analyse du Cheval de Troie, le titre et la croix du panneau recouvrent les boutons « Historique » et « La règle » ; la croix fait 34 px. | `[GAME-PANEL]`, `[TROIE]` | ➖ voulu : un panneau ouvert couvre la rangée de boutons qui l'a ouvert (README, « La zone sous le plateau ») ; la croix touche sur 46 × 46 (`.gpanel-close::after`) |
| 1.5 | Sur ordinateur, le **haut du rail de navigation est vide** (300 px de rien au-dessus des onglets). | `[DESKTOP]` | ✅ carte d'identité du joueur |
| 1.6 | Le Magasin laisse les deux tiers de l'écran vides sous les coffres, et ne dit nulle part ce qu'un coffre contient vraiment. | `renderMagasinPage` | ✅ tableau des taux de butin |
| 1.7 | Le texte « Coffre Dame » / « Coffre Roi » : seuls coffres encore dessinés en CSS (planches manquantes). | `assets/chests/` | ⬜ assets (§ 8) |
| 1.8 | Onze créatures sur vingt-sept n'ont pas d'illustration de carte (SVG monochrome en repli). | `assets/pieces/` | ⬜ assets (§ 8) |
| 1.9 | Les douze adversaires n'ont qu'un sceau procédural, aucun portrait. | `assets/adversaires/` | ⬜ assets (§ 8) |

## 2. Fonctionnalités serveur

| | Amélioration | Statut |
|---|---|---|
| 2.1 | **La Guerre des clans.** Fonder un clan (nom, sigle, blason héraldique, devise), rejoindre (ouvert / sur demande / fermé, ELO minimum), rôles chef / officier / membre, exclusion, transfert de chef. | ✅ |
| 2.2 | **La guerre hebdomadaire.** Chaque partie classée d'un membre rapporte des **points de guerre** à son clan (victoire 10 + bonus d'exploit, nulle 4, défaite 1 ; ×1,5 contre un humain ; plafond quotidien). Classement des clans de la semaine, remise à zéro le lundi 00:00 UTC, compte à rebours. | ✅ |
| 2.3 | **Le butin de guerre.** À la fin de la semaine, chaque membre ayant combattu (≥ 10 points) réclame un coffre selon la place finale de son clan : 1er Tour, 2e–3e Fou, 4e–10e Cavalier, sinon Pion. Une seule fois par semaine, compté sur le clan pour lequel on a **réellement combattu** (pas de saut de clan le dimanche soir). | ✅ |
| 2.4 | **Le journal du clan** : arrivées, départs, promotions, victoires des membres, montées de niveau, et **cris de guerre** (phrases choisies dans un catalogue, jamais de texte libre — même modération par construction que le chat de partie). | ✅ |
| 2.5 | **Le niveau du clan** (Bois → Or Légendaire, sur les points cumulés) : il change le métal du cadre du blason. | ✅ |
| 2.6 | Le **sigle du clan** à côté des pseudos : classement, recherche, profil public, menu. | ✅ |
| 2.7 | Les points de guerre gagnés s'affichent dans le **verdict de fin de partie**. | ✅ |
| 2.8 | Migration idempotente **sans `DROP`** (`supabase/migrations/001-guerre-des-clans.sql`) + miroir exact dans le bac à sable `?mock`. Le test de fumée vérifie que migration et schéma disent la même chose. | ✅ |
| 2.9 | Notifications push (défi reçu, fin de guerre) : demande VAPID + Edge Function. | ⬜ hors de portée sans clés |
| 2.10 | Saisons classées (remise à zéro douce de l'ELO, récompenses de fin de saison). | ⬜ décision de game design |
| 2.11 | Spectateur en direct des parties en ligne. | ⬜ demande un relais Realtime dédié |
| 2.12 | Guerres de clan en tête-à-tête (clan contre clan, sur rendez-vous). | ⬜ suite naturelle de 2.2 |

## 3. Effets de combat

| | Amélioration | Statut |
|---|---|---|
| 3.1 | Un moteur de particules sur canvas (« la Forge ») : pièce prise en éclats, recul du plateau, comète, éclair d'échec, mat au ralenti, or et cendres, braises d'ambiance. | ↩️ essayé puis **retiré à la demande** : trop chargé et trop lourd en partie. Les effets de combat d'origine (`js/combat-fx.js`) sont revenus tels quels. |

## 4. Cinématiques

| | Amélioration | Statut |
|---|---|---|
| 4.1 | **Entrée en combat** : écran fendu en diagonale, deux blasons/sceaux face à face, lame de lumière qui traverse le VS, gerbe d'étincelles au choc. | ✅ |
| 4.2 | **Issue** : les points de guerre gagnés sont dans la fenêtre de verdict (2.7), pas dans la cinématique d'issue. | 🟡 |
| 4.3 | Cinématique d'arrivée dans un nouveau rang (aujourd'hui une ligne dans le modal). | ⬜ |

## 5. Interface, design, fluidité

| | Amélioration | Statut |
|---|---|---|
| 5.1 | Menu principal : **braises qui montent des braseros** en vacillant, sur canvas, éteintes en mouvement réduit, onglet caché ou réglage « Effets » coupé. | ✅ |
| 5.2 | Menu principal (ordinateur) : **parallaxe** légère du décor qui suit la souris. | ✅ |
| 5.3 | Rail d'ordinateur : **carte du joueur** (sceau, pseudo, sigle de clan, rang, ELO). | ✅ |
| 5.4 | Magasin : **taux de butin** des six coffres (exemplaires, chance de créature inédite, débris). | ✅ |
| 5.5 | Retour tactile **au toucher** de tous les boutons (enfoncement de 3 %), là où certains ne réagissaient qu'au survol. | ⬜ pas fait dans cette passe : demande de passer bouton par bouton (certains portent déjà un `transform` animé) |
| 5.6 | Cibles tactiles sous 36 px (interrupteur Effets, croix du panneau). | ➖ voir 1.3 et 1.4 |
| 5.7 | Écran de partie sur grand téléphone : la zone vide entre « Historique » et « Abandonner » pourrait porter les prises et l'avantage matériel en grand. | ⬜ à décider (le vide y est voulu par le README) |
| 5.8 | Thème clair : il existe en CSS (`body.light`) mais plus aucun réglage ne l'allume. | ⬜ à décider : le retirer ou le rendre |

## 6. Audio

| | Amélioration | Statut |
|---|---|---|
| 6.1 | Bruitages des clans : le **cor de guerre** (`warhorn`, synthèse), joué à la fondation, au cri de guerre et au butin réclamé. | ✅ |
| 6.2 | Vrais échantillons enregistrés pour prise, échec, issue. Le moteur les accepte désormais : une recette de `SFX_RECIPES` peut porter `sample` (un chemin ou des variantes), chargé au premier appel, avec repli sur la synthèse tant que le fichier manque. | 🟡 le moteur est fait, restent les fichiers (§ 8) |
| 6.3 | Musique du menu (seule la musique de combat existe). | ⬜ le fichier **et** son branchement (fondu menu ↔ combat dans `combat-music.js`) |

## 7. Technique

| | Amélioration | Statut |
|---|---|---|
| 7.1 | Le test de fumée couvre les clans (création, sigle unique, adhésion, points de guerre sur une partie classée, butin unique par semaine) et le chargement des bruitages enregistrés. | ✅ |
| 7.2 | `README.md` (Guerre des clans, menu, ordre de chargement, « Où éditer »), `llms.txt`, `assets/PROMPTS.md` § 10. | ✅ |
| 7.3 | `sw.js` : monter `CACHE_VERSION` (nouveaux scripts). | ✅ |

---

## 8. Les assets à produire

Tous facultatifs : le jeu dessine un repli quand un fichier manque. Les prompts
détaillés sont dans `assets/PROMPTS.md` ; les nouveaux (clans) au § 10 de ce
même fichier.

### Déjà câblés, toujours manquants

| Priorité | Fichier(s) | Nombre | Format |
|---|---|---|---|
| ★★★ | `backgrounds/partie.png` — la salle de la partie | 1 | 1536 × 1024, opaque |
| ★★★ | `chests/dame/0[1-5]-*.png`, `chests/roi/0[1-5]-*.png` | 10 | 1024 × 1536, fond noir pur |
| ★★★ | `pieces/<id>.png` : matriarche, imperator, nyx, pegase, loup-geant, singe, infecte, ombre, illusion, berserk, boucher | 11 | 1024 × 1536 |
| ★★★ | `adversaires/<id>.png` : cendre, suie, bruyere, orpiment, vitriol, cinabre, antimoine, mercure, plombagine, salamandre, instructeur, athanor | 12 | 1024 × 1024 |
| ★★ | `variantes/fok.png`, `mirror.png`, `troie.png` | 3 | 1536 × 1024 |
| ★★ | `ranks/acier.png` | 1 | 1024 × 1024, transparent |
| ★★ | `voie/biome-<rang>.png` (bois → or) | 7 | 1024 × 1024, raccord haut/bas |
| ★★ | `banners/magasin.png`, `adversaires.png`, `voie.png`, `recompenses.png` | 4 | 1536 × 1024, fond noir |
| ★ | `backgrounds/chargement.png` | 1 | 1024 × 1536 |
| ★ | `ui/ornement-coin.png`, `ui/socle.png` | 2 | transparent |
| ★ | `ui/laiton.png`, `ui/vert-de-gris.png` | 2 | 1024², tuilable |

### Nouveaux emplacements (cette passe)

Deux seulement, et tous deux câblés (prompts : `assets/PROMPTS.md` § 10).

| Priorité | Fichier | Format | Où ça se voit |
|---|---|---|---|
| ★★★ | `backgrounds/guerre-clans.png` | 1536 × 1024, opaque | Fond de la page Guerre des clans (aujourd'hui : `armurerie.webp`, en repli) |
| ★★ | `ui/banniere-clan.png` | 1024 × 1536, étoffe **blanche à plis gris**, bord à bord | Les plis et la broderie du gonfanon derrière le blason, fondus en `multiply` sur les deux émaux du clan : une seule planche sert à tous les clans |

Deux idées de l'audit ont été écartées en chemin : une planche de « coffre de
guerre » (le butin EST un coffre Tour, Fou, Cavalier ou Pion, déjà illustré
— une planche de plus le ferait passer pour un septième coffre) et une
texture d'éclair (l'éclair d'échec est retracé à chaque image pour crépiter :
une image fixe le figerait). Le blason des clans, lui, n'a besoin d'aucune
image : il est dessiné (`js/blason.js`).

### Son

Aucun n'est obligatoire. Pour brancher un bruitage, déposer le fichier puis
ajouter `sample:'audio/sfx/<nom>.ogg'` (ou une liste de variantes) à sa
recette dans `SFX_RECIPES` (`js/sfx.js`) — rien d'autre à toucher.

| Fichier | Recette | Rôle |
|---|---|---|
| `audio/sfx/capture-1.ogg` … `capture-3.ogg` | `capture` | Prise : bois qui éclate + métal (trois variantes, tirées au hasard) |
| `audio/sfx/check.ogg` | `check` | Échec : gong court |
| `audio/sfx/win.ogg`, `loss.ogg` | `win`, `loss` | Issue : impact grave + chœur pour la victoire, glas pour la défaite |
| `audio/sfx/war-horn.ogg` | `warhorn` | Cor de guerre (fondation, cri de clan, butin) |
| `audio/menu-music.mp3` | — | Boucle d'ambiance du menu (2 à 3 min, −18 LUFS) : demande aussi un branchement (6.3) |

---

## 9. Second regard : ce qui pâtit encore à l'œil ou à la fluidité

Relevé après les retours sur ArDoZy/epichessMOI#114 : chaque page capturée en
téléphone (390 × 844) et en ordinateur (1440 × 900) dans le bac à sable
`?mock`, et les animations encore actives comptées avec
`document.getAnimations()`.

### Corrigé dans cette passe

| | Retour | Statut |
|---|---|---|
| 9.1 | Les **étincelles** projetées quand on brise un coffre (`.pb-spark`). | ✅ retirées : restent les fissures, la gerbe de lumière, le halo et le voile blanc |
| 9.2 | La note sous le tableau des taux du Magasin (« Une créature ne sort qu'à partir de son arène… dont le pouvoir dort »). | ✅ retirée |
| 9.3 | **Double sursaut** à l'arrivée sur la Guerre des clans. `renderReservePage` est appelée deux fois par visite (départ et fin du glissement, `js/pages-nav.js`) et `clanPaint` réécrivait toute la page à chaque appel : chaque carte recréée rejouait son entrée. Même chose une troisième fois quand le serveur répondait. | ✅ le rendu est idempotent (un rendu identique ne touche pas au document), l'entrée ne se joue qu'à l'arrivée, et une mise à jour ultérieure remplace le contenu sans rien rejouer (`.clan-root.is-settled`) |
| 9.4 | Les **points rouges qui montent** derrière les chiffres de la guerre de la semaine (`.clan-war::before`). | ✅ retirés |

### Fluidité — reste à faire

| | Constat | Où | Piste |
|---|---|---|---|
| 9.5 | **La fenêtre de recherche d'adversaire tourne en permanence.** `#mp-modal` est caché par `visibility:hidden`, pas `display:none` : ses 15 animations infinies (braises, dérive du fond, radar, barre de chasse) tournent du démarrage à la fermeture de l'onglet, partie comprise. | `#mp-modal` (css/style.css) | `#mp-modal:not(.show) *{animation-play-state:paused}` |
| 9.6 | **Les pages hors cadre gardent leurs animations infinies** : l'étoffe et le reflet de la bannière de clan, les rayons et la lévitation du butin, les drapeaux du recrutement tournent pendant qu'on est au menu ou en partie. La rangée pose déjà `inert` sur ces pages. | `js/pages-nav.js` (`markFront`) | `.nav-page:not(.is-front) *{animation-play-state:paused}` |
| 9.7 | **Le menu principal est l'écran le plus chargé**, et celui où l'on revient le plus : canvas de braises à 30 i/s, parallaxe, et ~21 animations CSS — dont deux systèmes de particules qui montent (le canvas et `.ambient-bubbles`) et 7 `jtfOrbit` qui animent `stroke-dashoffset`, une propriété qui repeint à chaque image (rien n'est confié au compositeur). | `js/menu-ambience.js`, `.ambient-bubbles`, `jtfOrbit` | garder un seul système de particules ; orbites en `transform: rotate` |
| 9.8 | `menu-ambience.js` garde un `setInterval` de 1,5 s pour toujours (re-câbler la parallaxe, réveiller la boucle), même en partie. | `js/menu-ambience.js` | réveiller depuis `markFront` (js/pages-nav.js) et la fin de partie plutôt que par un battement |
| 9.9 | Après chaque lecture du serveur, `clanPaintRail` réécrit la carte du rail et le clan du menu (blasons SVG neufs) même quand rien n'a changé. | `js/clans.js`, `renderRailIdentity` | même garde que `clanPaint` |

### Interface — reste à faire

| | Constat | Où |
|---|---|---|
| 9.10 | **Ordinateur : bande vide de 11 px à droite de tout le jeu.** `html{scrollbar-gutter:stable}` réserve la place d'une barre de défilement alors que la page racine ne défile jamais (900/900) : le décor du menu, le plateau et chaque page s'arrêtent avant le bord. | `[THEME]` |
| 9.11 | **Bannière de clan : la hampe dépasse.** Le trait de métal du gonfanon (`.clan-hero-cloth::before`) sort au-dessus de la carte et se fait couper par son bord arrondi : un trait brun mal coupé en haut à gauche, téléphone et ordinateur. | `[CLANS]` |
| 9.12 | **Barre d'onglets du téléphone** : « Guerre des clans » passe sur deux lignes, les quatre autres sur une, et le socle de l'onglet actif déborde au-dessus de la barre. Un libellé court (« Clans ») réglerait les deux. | `.nav-tabbar` |
| 9.13 | **Couleurs de titre** : « Les Adversaires », « Ce que contiennent les coffres » et l'onglet actif du Classement sont en vert d'eau, Magasin, Guerre des clans et Classement en or. Un seul accent pour les titres. | `.adv-page-title`, `.rs-sec-title`, onglets du Classement |
| 9.14 | **Adversaires** : pour un nouveau joueur, 10 cartes sur 12 disent « Très au-dessus de vous » en rouge, et la page entière se lit comme une alerte. Le ruban « Conseillé » mord le coin de sa carte et la mention « Jamais affronté » ; « ← Retour » passe sur deux lignes au téléphone. | `js/adversaires.js` |
| 9.15 | **Classement** : le titre « Classement » et, juste dessous, l'onglet « Classement ». Le bouton OK du bas porte des coins décoratifs qui se lisent comme un cadre de focus. | `#page-classement` |
| 9.16 | **Partie, téléphone** : un grand vide entre « Historique » et « Abandonner », et « Annuler coup » en pleine largeur, plus visible que tout le reste du panneau. **Ordinateur** : la colonne de droite reste vide aux deux tiers ; les lettres de colonnes posées sur les cases claires (b, d, f, h) et les chiffres de rangées sont presque illisibles. | `[GAME-PANEL]`, coordonnées du plateau |
| 9.17 | **Cinématique d'entrée** : « VS » tombe exactement sur la couture lumineuse, et la gerbe d'étincelles passe dessus : il se lit mal au moment où il devrait claquer. | `js/cinematics.js`, `.cine-split` |
| 9.18 | **Ordinateur, Magasin** : chaque carte de coffre s'étire sur 380 px autour d'une illustration de 130 px, et le tableau des taux s'étale sur 1 180 px — les colonnes sont trop loin pour suivre une ligne. Une largeur maximale (~760 px) pour le tableau. | `.shop-chest`, `[SHOP-ODDS]` |
| 9.19 | **Ordinateur, Guerre des clans** : la barre Front / Membres / Journal fait toute la largeur, et le front vide n'est qu'une phrase au milieu de 300 px de rien. Dans le rail, 200 px de vide séparent la carte du joueur des onglets. | `[CLANS]`, `[RAIL-ID]` |
| 9.20 | **Composition d'armées, téléphone** : le titre est posé sur un rectangle sombre plus étroit que son cadre doré, et les deux cases vides Monarque / Général occupent la moitié de l'écran avant la collection. | `[ARMIES]` |
