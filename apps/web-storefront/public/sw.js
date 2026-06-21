// PedeHub - PWA shell, offline fallback and Web Push Notifications.

const CACHE_VERSION = 'gestor-storefront-v11.1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/app-icon.svg',
  '/icons/app-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (request.method !== 'GET') return;

  const bypassPrefixes = [
    '/api',
    '/auth',
    '/checkout',
    '/orders',
    '/payments',
    '/customer',
    '/customers',
    '/mercadopago',
    '/webhooks',
  ];

  if (bypassPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    return;
  }

  const safeCachePut = async (cacheKey, response) => {
    try {
      if (response && response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(cacheKey, response.clone());
      }
    } catch (error) {
      console.warn('[SW] cache put skipped', {
        url: request.url,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          safeCachePut('/', clone);
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && ['style', 'script', 'image', 'font'].includes(request.destination)) {
          safeCachePut(request, response);
        }
        return response;
      });
    }),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'PedeHub',
      body: event.data.text(),
    };
  }

  const type = payload.type || payload.data?.type || 'default';
  const tag = payload.tag || type;
  const url = payload.url || payload.data?.url || '/';
  const title = payload.title || 'PedeHub';
  const options = {
    body: payload.body || '',
    icon: '/icons/app-icon.svg',
    badge: '/icons/app-maskable.svg',
    vibrate: [200, 100, 200],
    data: { ...(payload.data || {}), url, type },
    actions: payload.actions || [{ action: 'open', title: 'Abrir' }],
    tag,
    renotify: tag !== 'default',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
