// PedeHub - PWA shell, offline fallback and Web Push Notifications.

const SW_VERSION = 'storefront-sw-2026-06-21-fix2';
const CACHE_VERSION = 'storefront-sw-2026-06-21-fix2';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/app-icon.svg',
  '/icons/app-maskable.svg',
];

console.info('[SW] loaded', SW_VERSION);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener('activate', (event) => {
  console.info('[SW] activated', SW_VERSION);
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

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

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

  event.respondWith(handleSafeGetRequest(request, url));
});

async function safeCachePut(cacheKey, request, url, response) {
  try {
    if (
      response &&
      response.ok &&
      request.method === 'GET' &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    ) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put(cacheKey, response.clone());
    }
  } catch (cacheError) {
    console.warn('[SW] cache put skipped', {
      version: SW_VERSION,
      url: request.url,
      reason: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
  }
}

async function handleSafeGetRequest(request, url) {
  if (request.mode === 'navigate') {
    try {
      const response = await fetch(request);
      await safeCachePut('/', request, url, response);
      return response;
    } catch (networkError) {
      const cached = await caches.match('/');
      if (cached) return cached;

      console.warn('[SW] network failed, no cache fallback', {
        version: SW_VERSION,
        url: request.url,
        reason: networkError instanceof Error ? networkError.message : String(networkError),
      });

      throw networkError;
    }
  }

  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (['style', 'script', 'image', 'font'].includes(request.destination)) {
      await safeCachePut(request, request, url, response);
    }

    return response;
  } catch (networkError) {
    const fallback = await caches.match(request);
    if (fallback) return fallback;

    console.warn('[SW] network failed, no cache fallback', {
      version: SW_VERSION,
      url: request.url,
      reason: networkError instanceof Error ? networkError.message : String(networkError),
    });

    throw networkError;
  }
}

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
