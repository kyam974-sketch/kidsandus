self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network passthrough only: no app/data caching, so Planner updates stay fresh.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
