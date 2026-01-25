const CACHE_NAME = 'skin-moments-v8';
const ASSETS_TO_CACHE = [
  '../index.html',
  '../styles.css',
  '../print.css',
  '../app.js',
  '../scheduler.js',
  '../drag.js',
  '../i18n.js',
  '../strings.pt.json',
  '../strings.en.json',
  '../assets/medik8-logo.svg',
  '../assets/icon-192.png',
  '../assets/icon-512.png',
  'manifest.json'
];

// Install event - cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - cache-first strategy
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses or non-GET requests
        if (!response || response.status !== 200 || event.request.method !== 'GET') {
          return response;
        }
        // Clone and cache the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    }).catch(() => {
      // Fallback for offline - return cached index.html for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('../index.html');
      }
    })
  );
});
