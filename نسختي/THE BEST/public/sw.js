const CACHE_NAME = 'uni-game-cache-v1';
const ASSETS = [
  '/',
  '/index_mobile.html',
  '/index.html',
  '/manifest.json',
  '/Logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
