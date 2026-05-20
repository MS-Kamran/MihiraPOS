const CACHE_NAME = 'mihira-pos-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/pos.html',
  '/inventory.html',
  '/orders.html',
  '/analytics.html',
  '/customers.html',
  '/style.css',
  '/shared.js',
  '/app.js',
  '/pos.js',
  '/inventory.js',
  '/orders.js',
  '/analytics.js',
  '/customers.js',
  '/Logo/MihiraLogo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Don't fail install if a file is missing
      return Promise.allSettled(ASSETS.map(asset => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests and skip API calls
  if (event.request.method !== 'GET' || 
      event.request.url.includes('script.google') || 
      event.request.url.includes('googleusercontent') ||
      event.request.url.includes('action=') || 
      event.request.url.includes('_t=')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    })
  );
});

// Handle push notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/orders.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/orders.html');
      }
    })
  );
});
