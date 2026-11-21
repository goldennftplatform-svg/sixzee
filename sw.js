/* SIXZEE - installable app shell. API/relay traffic is never cached. */
const CACHE = 'sixzee-v20261121-club';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/sixzee-club.svg',
  './club.css',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/safari-knights-reference.jpg',
  './styles.css?v=20261119-scoring-shell',
  './app-layout.css?v=4',
  './wallet-dropdown.css?v=20261118-metamask-network',
  './app-shell.css?v=20261119-glossy-shell',
  './sixzee.css?v=20261121a',
  './config.js',
  './player-profile.js',
  './sixzee-engine.js?v=20261119b',
  './network.js?v=20261119g',
  './game.js?v=20261119g',
  './main.js?v=20261121a',
  './wallet.js',
  './metamask.js',
  './pwa.js?v=20261121b'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function cacheResponse(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      // Bypass the HTTP cache so a deployed index.html reaches installed PWAs
      // on the next navigation instead of serving last launch's shell.
      fetch(request.url, { cache: 'reload', credentials: 'same-origin' })
        .then(response => cacheResponse(request, response))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => cacheResponse(request, response))
        .catch(() => caches.match('./index.html'));
    })
  );
});
