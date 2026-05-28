var CACHE_NAME = 'english-islands-v5.2';
var ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/data.js',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
var CURRENT_VERSION = 'v5.2-20260528';

/* Install: cache all static assets */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

/* Activate: clean old caches */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

/* Fetch: network-first for all (ensures fresh content) */
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* Version check: if client reports a newer version, force reload */
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'CHECK_VERSION') {
    if (e.data.version !== CURRENT_VERSION) {
      /* Version mismatch detected, tell client to reload */
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'RELOAD_REQUIRED', version: CURRENT_VERSION });
        });
      });
    }
  }
});
