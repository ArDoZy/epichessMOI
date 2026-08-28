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
//   · LES IMAGES ET LE SON : LE CACHE D'ABORD. Ce sont 8 Mo qui ne changent
//     presque jamais, et les recharger à chaque visite est exactement ce
//     qu'on veut éviter. Un changement d'illustration demande de monter
//     CACHE_VERSION ci-dessous — c'est le prix, et il est assumé.
//
// -- METTRE À JOUR -------------------------------------------------------
// Monter CACHE_VERSION suffit : l'ancien cache est effacé à l'activation, et
// skipWaiting + clients.claim font que la nouvelle version prend la main
// immédiatement plutôt qu'au prochain lancement.
// ================================================================

const CACHE_VERSION = 'epicchess-v1';
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
  '/favicon.svg?v=2',
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
    // LE CACHE D'ABORD, le réseau ensuite — et on garde ce qu'on reçoit.
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) {
          const copie = res.clone();
          caches.open(CACHE_MEDIA).then(c => c.put(req, copie));
        }
        return res;
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
