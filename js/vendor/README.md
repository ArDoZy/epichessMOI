# js/vendor

Bibliothèques tierces servies par le jeu lui-même.

| Fichier | Version | Licence | Origine |
|---|---|---|---|
| `supabase-2.117.2.js` | @supabase/supabase-js 2.117.2 (build UMD) | MIT | `npm pack @supabase/supabase-js@2.117.2` → `dist/umd/supabase.js` |

## Pourquoi une copie locale

Le SDK était chargé depuis jsDelivr en `@2` : une version qui pouvait changer
sous le jeu sans prévenir, sans empreinte d'intégrité (une copie altérée sur
le CDN aurait tourné avec la clé du jeu), et que le moindre bloqueur de
contenu ou réseau d'entreprise suffisait à couper — le jeu en ligne tombait
alors sans explication. Servi d'ici, il est figé, vérifié par Git, mis en
cache par le service worker, et autorisé par la politique de sécurité du site
(`script-src 'self'`, voir `vercel.json`).

## Mettre à jour

```sh
npm pack @supabase/supabase-js@<version>
tar xzf supabase-supabase-js-<version>.tgz
cp package/dist/umd/supabase.js js/vendor/supabase-<version>.js
```

puis changer la balise `<script>` dans `index.html`, supprimer l'ancien fichier
et monter `CACHE_VERSION` dans `sw.js`.
