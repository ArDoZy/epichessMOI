# assets/voie/ — les sept paysages de la Diagonale de la Puissance

Une planche par rang, nommée `biome-<id du rang>.webp` :

    biome-bois.webp  biome-pierre.webp  biome-bronze.webp  biome-acier.webp
    biome-obsidienne.webp  biome-argent.webp  biome-or.webp

Les identifiants sont ceux de `RANKS` (js/data-pieces.js) : ajouter un rang
au tableau suffit à ce que la Voie cherche `biome-<son id>.webp`, il n'y a
pas de liste à tenir ici.

**Tout est facultatif.** La planche est posée en `background-image` sur la
bande de terrain (`.vm-land::before`, section `[VOIE]` de `css/style.css`) :
un fichier manquant ne produit qu'un 404 silencieux, et le teint calculé sur
la couleur du rang reste seul. La Voie garde exactement la même mise en page.

**Comment elles doivent être peintes** : vues du dessus à la verticale, avec
une bande de terre battue qui traverse l'image du bord haut au bord bas en
passant par le milieu — les bandes d'un même rang se répètent bout à bout, il
faut donc que la planche se raccorde à elle-même. Le prompt complet de
chacune est dans `assets/PROMPTS.md`, § 3 ter.

`.png` accepté aussi : `tools/opt-images.js` les convertit en `.webp`.
