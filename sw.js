const CACHE_NAME = "astro-chat-v1";
const OFFLINE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 1. Ignorar requisições que não sejam GET (POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. Ignorar APIs externas dinâmicas e Firebase
  // Isso evita que o SW tente cachear ou interceptar conexões de banco de dados/IA
  if (url.hostname.includes('firebaseio.com') || 
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('pollinations.ai')) {
      return;
  }

  // 3. Estratégia Stale-While-Revalidate para arquivos estáticos e App Shell
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Apenas cacheia se a resposta for válida (status 200) e do tipo basic/cors
        if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch((error) => {
        // Se a rede falhar, apenas loga e retorna o cache se disponível
        // console.warn('Fetch falhou no SW:', event.request.url);
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