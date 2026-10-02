# Epic Chess — tout ce qui peut s'améliorer

Audit complet du jeu (le 2 octobre 2026) : chaque écran capturé en téléphone
(390 × 844) et en ordinateur (1440 × 900), chaque module relu. **Le jeu
lui-même — règles, pièces, pouvoirs, économie de base — n'est pas touché** :
tout ce qui suit porte sur ce qui l'entoure.

Légende : ✅ fait dans cette passe · 🟡 fait en partie · ⬜ reste à faire
(avec la raison).

---

## 1. Défauts constatés

| | Défaut | Où | Statut |
|---|---|---|---|
| 1.1 | **La page « Guerre des clans » est vide.** C'est un des cinq onglets de la barre principale, et `renderReservePage()` ne fait rien : on y arrive sur un titre et un fond noir. Le plus gros trou du jeu. | `js/economy-ui.js`, `#page-reserve` | ✅ page complète (§ 2) |
| 1.2 | Le tutoriel décrit encore la récompense de **série** (« une victoire : un Coffre Pion, deux d'affilée : un Coffre Cavalier… ») supprimée depuis longtemps, et pointe `#rs-pearls`, qui n'existe plus. | `js/tutorial.js` | ✅ réécrit pour la Guerre des clans |
| 1.3 | L'interrupteur « Effets » fait 48 × 28 px : sous le seuil tactile de 36 px. | `[SETTINGS]` | ✅ |
| 1.4 | En analyse du Cheval de Troie, le titre et la croix du panneau recouvrent les boutons « Historique » et « La règle » ; la croix fait 34 px. | `[GAME-PANEL]`, `[TROIE]` | ✅ |
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
| 3.1 | **Un moteur de particules sur canvas** (« la Forge ») posé dans le plateau, en plus des effets DOM : des centaines de particules additives pour le coût d'un seul élément, endormi quand rien ne brûle. | ✅ |
| 3.2 | **La pièce prise VOLE EN ÉCLATS** : son propre dessin est découpé en fragments qui s'envolent, tournent et retombent — au lieu de se ratatiner. | ✅ |
| 3.3 | **L'onde traverse les cases** : sur une prise lourde, les cases s'allument en anneaux depuis l'impact. | ✅ |
| 3.4 | **Le plateau encaisse** : recul dans l'axe de l'attaque et micro-arrêt (« hit-stop ») proportionnels à la valeur prise. | ✅ |
| 3.5 | **La valeur prise s'affiche** et monte de la case (« +13 » en or pour vous, en rouge pour l'adversaire). | ✅ |
| 3.6 | **L'échec a son éclair** : un arc électrique crépite de la pièce qui donne échec jusqu'au roi — on voit QUI menace. | ✅ |
| 3.7 | **Le mat au ralenti** : le roi tombé explose en éclats, onde géante sur tout le plateau. | ✅ |
| 3.8 | **La victoire en poussière d'or** : la dissolution dorée passe de 46 nœuds DOM à un essaim de particules turbulentes. | ✅ |
| 3.9 | **Comète de déplacement** : une tête lumineuse suit la pièce, sa traînée d'étincelles teintées de sa classe. | ✅ |
| 3.10 | Étincelles de canvas sur les grands pouvoirs (Typhon qui aspire, Banshee, charge de l'Éléphant, promotion). | ✅ |
| 3.11 | **Braises d'ambiance** qui montent lentement du plateau pendant la partie, et s'attisent quand la pendule brûle. | ✅ |
| 3.12 | Banc d'essai `tools/combat-fx-preview.html` : les nouveaux effets y sont jouables à la main. | ✅ |

## 4. Cinématiques

| | Amélioration | Statut |
|---|---|---|
| 4.1 | **Entrée en combat** : écran fendu en diagonale, deux blasons/sceaux face à face, lame de lumière qui traverse le VS, gerbe d'étincelles au choc. | ✅ |
| 4.2 | **Issue** : les braises de la cinématique passent au canvas, et la case « Points de guerre » rejoint le décompte. | ✅ |
| 4.3 | Cinématique d'arrivée dans un nouveau rang (aujourd'hui une ligne dans le modal). | ⬜ |

## 5. Interface, design, fluidité

| | Amélioration | Statut |
|---|---|---|
| 5.1 | Menu principal : **braises qui montent des torches** et lueur qui vacille, sur canvas, éteintes en mouvement réduit et onglet caché. | ✅ |
| 5.2 | Menu principal (ordinateur) : **parallaxe** légère du décor qui suit la souris. | ✅ |
| 5.3 | Rail d'ordinateur : **carte du joueur** (sceau, pseudo, sigle de clan, rang, ELO). | ✅ |
| 5.4 | Magasin : **taux de butin** des six coffres (exemplaires, chance de créature inédite, débris). | ✅ |
| 5.5 | Retour tactile **au toucher** de tous les boutons (enfoncement de 3 %), là où certains ne réagissaient qu'au survol. | ✅ |
| 5.6 | Cibles tactiles sous 36 px (interrupteur Effets, croix du panneau). | ✅ |
| 5.7 | Écran de partie sur grand téléphone : la zone vide entre « Historique » et « Abandonner » pourrait porter les prises et l'avantage matériel en grand. | ⬜ à décider (le vide y est voulu par le README) |
| 5.8 | Thème clair : il existe en CSS (`body.light`) mais plus aucun réglage ne l'allume. | ⬜ à décider : le retirer ou le rendre |

## 6. Audio

| | Amélioration | Statut |
|---|---|---|
| 6.1 | Bruitages des clans (cri de guerre, butin réclamé). | ✅ (recettes de synthèse) |
| 6.2 | Vrais échantillons enregistrés pour prise, échec, mat (le moteur `sfx.js` est prêt à les recevoir). | ⬜ assets (§ 8) |
| 6.3 | Musique du menu (seule la musique de combat existe). | ⬜ asset (§ 8) |

## 7. Technique

| | Amélioration | Statut |
|---|---|---|
| 7.1 | Le test de fumée couvre les clans (création, sigle unique, adhésion, points de guerre sur une partie classée, butin unique par semaine) et la Forge. | ✅ |
| 7.2 | `README.md`, `llms.txt` : sections Guerre des clans et Forge. | ✅ |
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

| Priorité | Fichier | Format | Où ça se voit |
|---|---|---|---|
| ★★★ | `backgrounds/guerre-clans.png` | 1536 × 1024, opaque | Fond de la page Guerre des clans (aujourd'hui : `armurerie.webp`) |
| ★★ | `ui/banniere-clan.png` | 1024 × 1536, fond transparent | Hampe et étoffe derrière le blason du clan |
| ★★ | `chests/guerre.png` | 1024 × 1024, fond noir pur | Le butin de guerre hebdomadaire |
| ★ | `fx/eclair.png` | 1024 × 1024, fond noir pur | Texture de l'éclair d'échec (repli : tracé procédural) |

### Son

| Fichier | Rôle |
|---|---|
| `audio/menu-music.mp3` | Boucle d'ambiance du menu (2 à 3 min, −18 LUFS) |
| `audio/sfx/capture-*.ogg` (3 variantes) | Prise : bois qui éclate + métal |
| `audio/sfx/check.ogg`, `mate.ogg` | Échec (gong court), mat (impact grave + chœur) |
| `audio/sfx/war-horn.ogg` | Cor de guerre (cri de clan, début de semaine) |
