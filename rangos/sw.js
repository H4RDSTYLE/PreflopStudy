const CACHE_NAME = 'ps-rangos-v21';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css?v=20',
  './js/hands.js?v=20',
  './js/ranges.js?v=20',
  './js/sizings.js?v=20',
  './js/data.js?v=20',
  './js/scenario.js?v=20',
  './js/modes.js?v=20',
  './js/editor.js?v=20',
  './js/study.js?v=20',
  './js/stats.js?v=20',
  './js/app.js?v=20',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.allSettled(
      FILES_TO_CACHE.map((f) =>
        caches.open(CACHE_NAME).then((c) => fetch(f).then((r) => c.put(f, r)).catch(() => {}))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => keys.filter((k) => k !== CACHE_NAME))
      .then((old) => Promise.all(old.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Navegaciones (SPA): siempre responder con el shell cacheado,
  // y actualizar el shell en segundo plano cuando la app se reinstala.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((shell) => shell || fetch(e.request))
    );
    return;
  }

  const url = e.request.urlopera;

  // Assets (JS/CSS/img con ?v=XX o sin): cache-first + revalidación en background.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
          return res;
        })
        .catch(() => null);
      return cached || network;
    })
  );
});
