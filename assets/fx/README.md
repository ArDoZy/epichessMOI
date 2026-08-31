# Les effets

Halos, ondes de choc, braises, éclats, flammes, cercles d'alchimie.

**Toutes ces planches sont dessinées sur fond parfaitement noir**, et le
jeu les fond en `mix-blend-mode:screen` : le noir disparaît, seule la
lumière reste. C'est de la transparence gratuite — pas de canal alpha à
produire, pas de liseré autour du halo, et le fichier pèse trois fois moins
qu'un PNG transparent. C'est déjà le procédé du halo des coffres
(`assets/chests/README.md`). Un fond gris foncé au lieu de noir laisserait
un rectangle visible à l'écran.

Dossier facultatif : sans image, les effets dessinés en CSS (dégradés
radiaux, anneaux, motes) jouent seuls, comme aujourd'hui. Chemins,
dimensions et prompts : **`assets/PROMPTS.md`, § 6**. Câblage : `[ART]`
dans `css/style.css`.

## Statut actuel

**Les six effets du catalogue sont posés**, convertis en `.webp` par
`tools/opt-images.js` : `halo-victoire`, `onde-choc`, `braises`,
`eclat-capture`, `flamme-echec`, `cercle-runique`.
