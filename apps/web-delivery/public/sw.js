const CACHE_NAME = 'gestor-motoboy-v2';
const STATIC_ASSETS = [
  '/', '/index.html', '/offline.html', '/manifest.json', '/favicon.svg',
  '/icons/icon-72x72.png', '/icons/icon-192x192.png', '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png', '/icons/icon-maskable-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone)));
        }
        return response;
      }).catch(async () => (await caches.match('/index.html')) || caches.match('/offline.html')),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && ['script', 'style', 'image', 'font'].includes(event.request.destination)) {
      const clone = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
    }
    return response;
  })));
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Gestor Motoboy', body: event.data.text() };
  }
  const title = payload.title || 'Nova Entrega!';
  const options = {
    body: payload.body || 'Você recebeu uma nova corrida.',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-72x72.png',
    vibrate: [300, 100, 300, 100, 300],
    data: { ...(payload.data || {}), url: payload.url || payload.data?.url || '/' },
    requireInteraction: true,
    tag: payload.tag || 'delivery-alert',
    renotify: true,
  };
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleClient = clients.find((client) => client.visibilityState === 'visible');
    if (visibleClient && payload.data?.eventId) {
      visibleClient.postMessage({ type: 'DRIVER_DELIVERY_PUSH', payload: payload.data });
      return;
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.includes(url));
    if (existing && 'focus' in existing) return existing.focus();
    return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
  }));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
  }).then((subscription) => self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage({
      type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: subscription.toJSON(),
    }));
  })).catch(() => undefined));
});
