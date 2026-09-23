const CACHE_NAME = 'ps-rangos-v17';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css?v=16',
  './js/hands.js?v=16',
  './js/ranges.js?v=16',
  './js/sizings.js?v=16',
  './js/data.js?v=16',
  './js/scenario.js?v=16',
  './js/modes.js?v=16',
  './js/editor.js?v=16',
  './js/study.js?v=16',
  './js/stats.js?v=16',
  './js/app.js?v=16',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('?v=')) {
    // assets versionados: red -> cache (nunca quedarse con copia vieja)
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || fetch(e.request)))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
