const CACHE_NAME = "astro-chat-v2"; // Mudei para v2 para forçar atualização
const OFFLINE_URLS = [
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./state.js",
  "./dom.js",
  "./utils.js",
  "./services.js",
  "./chat.js",
  "./room.js",
  "./modals.js",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll falha se qualquer um desses arquivos não existir ou der erro de rede
      return cache.addAll(OFFLINE_URLS);
    }).catch(error => {
      console.error("Falha ao cachear arquivos no SW:", error);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 1. Ignorar requisições que não sejam GET
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. Ignorar APIs externas dinâmicas e Firebase
  if (url.hostname.includes('firebaseio.com') || 
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('pollinations.ai')) {
      return;
  }

  // 3. Estratégia Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse; 
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Listener de Notificação Push
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window'}).then( windowClients => {
        for (var i = 0; i < windowClients.length; i++) {
            var client = windowClients[i];
            if (client.url === '/' && 'focus' in client) {
                return client.focus();
            }
        }
        if (clients.openWindow) {
            return clients.openWindow('./index.html');
        }
    })
  );
});