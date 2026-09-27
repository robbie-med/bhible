const CACHE_NAME = 'bhible-v8';
// Bible text lives in its own cache so app updates don't evict downloaded translations.
// Keep in sync with TEXT_CACHE in js/text.js; bump only when data/text/ is rebuilt.
const TEXT_CACHE = 'bhible-text-v1';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './data/bible.js',
  './js/storage.js',
  './js/text.js',
  './js/i18n.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => (k.startsWith('bhible-v') && k !== CACHE_NAME) || (k.startsWith('bhible-text-') && k !== TEXT_CACHE))
        .map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Bible text never changes within a TEXT_CACHE version: cache-first, fill on first read
  if (url.pathname.includes('/data/text/')) {
    e.respondWith(
      caches.open(TEXT_CACHE).then(cache =>
        cache.match(e.request).then(hit => hit || fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    // Network first for the page, falling back to the cached shell offline
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Stale-while-revalidate: answer from cache instantly, refresh the cache in the background
  // so a deploy reaches installed clients on the next launch even without a CACHE_NAME bump.
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        });
        if (cached) {
          e.waitUntil(network.catch(() => {}));
          return cached;
        }
        return network;
      })
    )
  );
});
