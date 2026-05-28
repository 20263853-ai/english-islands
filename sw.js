// English Islands SW v5.4 - Network Only, No Caching
// Fixes: old cached versions causing blank page on Android

var CACHE_NAME = 'english-islands-v5.4';
var CURRENT_VERSION = 'v5.4-2026052903';

// Install: clear ALL old caches immediately
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) { return caches.delete(k); })
      );
    }).then(function() { self.skipWaiting(); })
  );
});

// Activate: clear ALL caches, claim all clients immediately
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) { return caches.delete(k); })
      );
    }).then(function() { self.clients.claim(); })
  );
});

// Fetch: network-only, NO fallback to cache
self.addEventListener('fetch', function(e) {
  e.respondWith(
    fetch(e.request).catch(function() {
      // Offline: return a simple fallback page
      return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>English Islands</title><style>body{font-family:sans-serif;text-align:center;padding:40px;color:#666}h2{color:#4F46E5}</style></head><body><h2>Offline</h2><p>Please check your network connection.</p></body></html>', {
        headers: { 'Content-Type': 'text/html' }
      });
    })
  );
});

// Version check
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'CHECK_VERSION') {
    if (e.data.version !== CURRENT_VERSION) {
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'RELOAD_REQUIRED', version: CURRENT_VERSION });
        });
      });
    }
  }
});
