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

### Fluidité

Mesuré avec `document.getAnimations()` : au menu, de ~40 animations en cours
à 8 ; en partie, plus aucune hors du plateau.

| | Constat | Statut |
|---|---|---|
| 9.5 | **La fenêtre de recherche d'adversaire tournait en permanence.** `#mp-modal` est caché par `visibility:hidden`, qui n'arrête pas une animation : ses 15 animations infinies (braises, dérive du fond, radar, barre de chasse) tournaient du démarrage à la fermeture de l'onglet, partie comprise. | ✅ en pause tant qu'elle est fermée (pseudo-éléments compris) |
| 9.6 | **Les pages hors cadre gardaient leurs animations infinies** (étoffe et reflet de la bannière de clan, rayons du butin, drapeaux du recrutement…), au menu comme en partie. | ✅ `#nav-track:not(.is-sliding) .nav-page:not(.is-front)` : en pause hors glissement ; pendant le glissement tout vit, la page qui arrive entre déjà animée |
| 9.7 | **Le menu principal, l'écran le plus chargé** : deux systèmes de particules qui montent (le canvas de braises et six bulles CSS `.ambient-bubbles`), et une orbite de lumière autour du coffre quotidien qui animait le `stroke-dashoffset` de sept ellipses floutées — une propriété de dessin, repeinte à chaque image. | ✅ les bulles sont retirées (les braises restent) ; l'orbite est un calque HTML qui tourne en `transform`, sur le compositeur, sans repeindre son flou |
| 9.8 | `menu-ambience.js` gardait un `setInterval` de 1,5 s pour toujours, partie comprise. | ✅ retiré : les braises se réveillent depuis `markFront` (js/pages-nav.js, qui dit aussi l'entrée et la sortie de partie) et `fxSetLevel` (l'interrupteur « Effets ») |
| 9.9 | Après chaque lecture du serveur, la carte du rail et le clan du menu étaient réécrits (blasons SVG neufs) même quand rien n'avait changé. | ✅ `identitySet` (js/accounts.js) : contenu réécrit seulement s'il change |
| 9.9 bis | Le **rail d'ordinateur** portait un `backdrop-filter:blur(18px)` : un flou toujours à l'écran, recalculé à chaque image où la rangée glisse dessous — la raison exacte pour laquelle la barre du téléphone l'avait déjà perdu. | ✅ fond opaque, sans flou |

### Interface

| | Constat | Statut |
|---|---|---|
| 9.10 | **Ordinateur : bande vide de 11 px à droite de tout le jeu** (`html{scrollbar-gutter:stable}` alors que la page racine ne défile jamais). | ✅ gouttière retirée |
| 9.11 | **Bannière de clan : la hampe dépassait** au-dessus de la carte et se faisait couper par l'arrondi. | ✅ rentrée dans la carte |
| 9.12 | **Barre d'onglets du téléphone** : « Guerre des clans » sur deux lignes quand les autres tiennent sur une ; le socle de l'onglet actif, levé de 2 px, mordait le haut de la barre. | ✅ l'onglet s'appelle « Clans » (le nom complet reste en `title` et `aria-label`) ; l'onglet actif ne se lève plus |
| 9.13 | **Couleurs de titre** : « Les Adversaires », « Composition d'armées », « Ce que contiennent les coffres » et l'onglet actif du Classement en vert d'eau, le reste en or. | ✅ tout en or (`.glow-text`, `.rs-sec-title`, `.lb-tab.on`) |
| 9.14 | **Adversaires** : dix cartes sur douze en rouge « Très au-dessus de vous » pour un nouveau joueur ; ruban « Conseillé » sur le coin et sur « Jamais affronté » ; « ← Retour » sur deux lignes. | ✅ « Très au-dessus » en cuivre ; ruban posé à cheval sur le bord haut ; « ← Retour » sur une ligne |
| 9.15 | **Classement** : titre « Classement » et onglet « Classement » l'un sous l'autre ; coins de plaque qui dépassaient du bouton OK. | ✅ l'onglet s'appelle « Mondial » ; la plaque suit l'arrondi du bouton |
| 9.16 | **Partie** : « Annuler coup » en pleine largeur, plus voyant que tout le panneau ; coordonnées du plateau presque illisibles sur les cases claires. Le vide entre « Historique » et « Abandonner » (et la colonne de droite sur ordinateur) est voulu : c'est la place où s'ouvrent le journal et la discussion. | ✅ « Annuler coup » centré à la taille de son libellé (cible de 44 px gardée) ; coordonnées pleine encre, un cran plus grosses, d'une teinte plus contrastée ; ➖ le vide reste |
| 9.17 | **Cinématique d'entrée** : « VS » coupé par la couture lumineuse, et la gerbe d'étincelles passait dessus. | ✅ disque d'ombre derrière le « VS », gerbe passée sous le texte |
| 9.18 | **Ordinateur, Magasin** : cartes étirées à 380 px, tableau des taux sur 1 180 px. | ✅ cartes à la largeur de leur image (six sur une rangée dès 1 320 px), tableau limité à 760 px |
| 9.19 | **Ordinateur, Guerre des clans** : onglets Front / Membres / Journal sur toute la largeur ; front vide réduit à une phrase ; 200 px de vide entre la carte du joueur et les onglets du rail. | ✅ onglets limités à 560 px ; le front vide est une carte qui mène au combat (« Le front est calme », bouton « Au combat », téléphone compris) ; les onglets du rail suivent la carte du joueur |
| 9.20 | **Composition d'armées, téléphone** : titre sur un rectangle plus sombre que son cadre ; cases vides Monarque / Général sur la moitié de l'écran. | ✅ le cartouche est teint jusqu'au milieu (`fill` du `border-image`) ; les deux cartes majeures prennent 76 % de leur demi-largeur (≈ 55 px rendus au catalogue, toujours plus grandes que celles du bas) |
| 9.21 | **Le titre « Epic Chess » et son cartouche d'or** en haut du menu principal. | ✅ retirés à la demande ; le nom reste pour les lecteurs d'écran (`<h1 class="sr-only">`) et `--menu-title-h` vaut zéro |
