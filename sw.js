// ================================================================
// SW.JS : le service worker — la coquille du jeu, hors ligne
// ================================================================
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS.
//
// Il fait deux choses : le jeu s'ouvre instantanément à la deuxième visite,
// et il s'ouvre TOUT COURT dans le métro. C'est aussi ce qui autorise le
// navigateur à proposer l'installation sur l'écran d'accueil (voir
// js/pwa.js) : sans service worker, la proposition n'apparaît jamais.
//
// Il ne fait PAS de notifications : elles demandent un serveur (VAPID, un
// service de push, une base d'abonnements) que ce jeu n'a pas encore. Le
// jour où le backend existera, c'est ici qu'elles se brancheront.
//
// -- LA RÈGLE DE PRUDENCE ------------------------------------------------
// Un service worker mal écrit sert une version périmée du jeu À VIE, et le
// joueur n'a aucun moyen de s'en apercevoir ni de s'en sortir. Deux
// stratégies, et la plus prudente couvre le plus de choses :
//
//   · LE CODE ET LES PAGES (html, js, css, json) : LE RÉSEAU D'ABORD. On
//     sert toujours la version en ligne quand elle répond, et le cache ne
//     sert qu'en secours. Une correction poussée ce matin arrive donc ce
//     matin, comme sans service worker.
//   · LES IMAGES ET LE SON : LE CACHE D'ABORD, MIS À JOUR EN ARRIÈRE-PLAN.
//     Ce sont 8 Mo qui ne changent presque jamais : la copie gardée est
//     servie tout de suite, et le fichier est redemandé derrière (une réponse
//     304 de quelques octets s'il n'a pas changé). Une illustration retouchée
//     sous le même nom arrive donc à la visite suivante sans qu'on ait à
//     monter CACHE_VERSION — ce qui était, jusqu'à v8, la seule façon de la
//     faire voir (l'historique ci-dessous).
//
//     ATTENTION : `isMedia` attrape aussi les .svg de assets/. Les cinq
//     échiquiers et les onze planches d'orfèvrerie (assets/ui/) en font donc
//     partie, et ce sont des fichiers qu'on RETOUCHE, contrairement aux
//     illustrations. v3 marque leur arrivée et la nappe de marbre ajoutée aux
//     plateaux : sans ce numéro, un joueur déjà venu aurait gardé les anciens
//     plateaux et n'aurait jamais vu une seule des nouvelles planches.
//     v4 marque le menu principal repeint (voir [GRANDE-SALLE] dans
//     css/style.css) : le fond `backgrounds/main-page.webp` et les trois
//     emblèmes `ui/logo-{journaliere,victoires,richesse}.webp` ont changé
//     SOUS LE MÊME NOM. Sans ce numéro, un joueur déjà venu aurait gardé
//     l'ancien fond et les anciens emblèmes dans le neuf des autres
//     planches — c'est le seul cas où le cache ment.
//     v5 marque les médaillons de rang ramenés de 1254 à 288 px (ils ne
//     s'affichent jamais au-delà de 88 px : 2,3 Mo devenus 210 Ko) et la
//     table recomprimée, eux aussi SOUS LE MÊME NOM.
//     v8 marque la refonte « Nuit et Or » : les polices quittent Google Fonts
//     pour assets/fonts/ (des .woff2, donc servis cache d'abord), le favicon
//     est redessiné, et les plaques vectorielles d'orfèvrerie ne sont plus
//     posées. Monter le numéro purge ces planches orphelines des caches déjà
//     remplis au lieu de les y laisser dormir.
//     v9 marque l'économie tenue par le serveur, le SDK Supabase servi par
//     le jeu (js/vendor/) et le passage des médias en mise à jour d'arrière-
//     plan.
//
// -- METTRE À JOUR -------------------------------------------------------
// Monter CACHE_VERSION suffit : l'ancien cache est effacé à l'activation, et
// skipWaiting + clients.claim font que la nouvelle version prend la main
// immédiatement plutôt qu'au prochain lancement.
// ================================================================

const CACHE_VERSION = 'epicchess-v9';
const CACHE_MEDIA   = CACHE_VERSION + '-media';
const CACHE_SHELL   = CACHE_VERSION + '-shell';

// Ce qui est mis de côté dès l'installation : le strict nécessaire pour que
// le jeu s'ouvre sans réseau. On n'y met PAS les 8 Mo d'illustrations — une
// installation qui télécharge huit mégaoctets avant de rendre la main est
// une installation qu'on annule.
const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/favicon.svg?v=3',
  '/site.webmanifest',
];

// Le son et les images : gros, et quasi immuables.
const isMedia = url =>
  /^\/(assets|audio)\//.test(url.pathname) ||
  /\.(png|jpg|jpeg|webp|avif|svg|mp3|ogg|woff2?)$/i.test(url.pathname);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      // addAll échoue en bloc si UNE seule ressource manque, et laisse alors
      // le service worker sans rien. On ajoute donc pièce par pièce.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n.indexOf(CACHE_VERSION) !== 0).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // On ne se mêle QUE de ce qui vient de ce site. Supabase (le multijoueur)
  // et les polices doivent passer sans qu'on y touche : mettre en cache une
  // réponse de temps réel n'aurait aucun sens, et servir une réponse
  // périmée en aurait encore moins.
  if (url.origin !== self.location.origin) return;

  if (isMedia(url)) {
    // LE CACHE D'ABORD, ET LA MISE À JOUR EN ARRIÈRE-PLAN. L'image ou le son
    // gardé est servi tout de suite ; pendant ce temps on redemande le
    // fichier, et la réponse remplace la copie. Une planche retouchée SOUS LE
    // MÊME NOM arrive donc à la visite suivante, sans qu'il faille penser à
    // monter CACHE_VERSION — c'était le seul cas où le cache mentait. La
    // redemande passe par le cache HTTP du navigateur : pour un fichier qui
    // n'a pas changé, c'est une réponse 304 de quelques octets.
    e.respondWith(
      caches.open(CACHE_MEDIA).then(c => c.match(req).then(hit => {
        const frais = fetch(req).then(res => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        if (hit) { e.waitUntil(frais.catch(() => {})); return hit; }
        return frais;
      }))
    );
    return;
  }

  // LE RÉSEAU D'ABORD pour tout le reste : le code servi est toujours le
  // code en ligne. Le cache n'entre en jeu que si le réseau ne répond pas.
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copie = res.clone();
        caches.open(CACHE_SHELL).then(c => c.put(req, copie));
      }
      return res;
    }).catch(() => caches.match(req).then(hit =>
      // Hors ligne et jamais vue : pour une navigation, on rend la page
      // d'accueil plutôt qu'une erreur de navigateur — le jeu s'ouvre, et
      // c'est lui qui dira que le multijoueur est indisponible.
      hit || (req.mode === 'navigation' ? caches.match('/index.html') : undefined)
    ))
  );
});
