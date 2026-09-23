'use strict';
var CACHE_VERSION = 'v1';
var CACHE_PREFIX = 'ps-tablas-';
var CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
var PRECACHE = ['./', './index.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    Promise.allSettled(
      PRECACHE.map(function (f) {
        return caches.open(CACHE_NAME).then(function (c) {
          return fetch(f).then(function (r) { return c.put(f, r); }).catch(function () {});
        });
      })
    ).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // SOLO borrar cachés hermanas de TABLAS (prefijo ps-tablas-).
      // JAMÁS tocar ps-rangos-* ni la del SW de rangos (quizzes offline intactos).
      return Promise.all(
        keys.filter(function (k) {
          return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME;
        }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;

  // No interceptar la PWA de rangos (tiene su propio SW con caché ps-rangos-v21).
  if (url.indexOf('/rangos/') !== -1) return;

  // Navegación (<!DOCTYPE> shell): servir siempre el index cacheado.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (r) { return r || fetch(req); })
    );
    return;
  }

  // Assets (tabla/*.jpg, js/css): cache-first + revalidación en background.
  // Así la imagen que YA se vio online queda guardada para el offline.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var update = fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (c) { return c.put(req, clone); }).catch(function () {});
        }
        return res;
      }).catch(function () { return cached; });
      return cached || update;
    })
  );
});
