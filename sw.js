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
  // Estratégia Stale-While-Revalidate para conteúdo principal
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => {
             // Cache apenas requests válidos e do mesmo domínio ou CDNs conhecidos
             if (networkResponse.status === 200) {
                 cache.put(event.request, networkResponse.clone());
             }
        });
        return networkResponse;
      }).catch(() => cachedResponse); // Retorna cache se falhar a rede

      return cachedResponse || fetchPromise;
    })
  );
});

// Listener de Notificação Push (fallback se enviado pelo servidor, 
// embora neste caso usamos o envio local via registration.showNotification)
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window'}).then( windowClients => {
        // Foca na janela se já estiver aberta
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