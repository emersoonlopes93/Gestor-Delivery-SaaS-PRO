// PedeHub - Service Worker: Audio & Push Notifications
// This file is placed in /public/sw.js of the web-tenant app
// Enables background sound playback and push notifications

self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push event received:', event.data);
  
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.warn('[ServiceWorker] Failed to parse push JSON:', e);
    payload = {
      title: 'PedeHub',
      body: event.data.text(),
    };
  }

  const title = payload.title || 'PedeHub';
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: payload.actions || [],
    tag: payload.tag || 'default',
    renotify: !!payload.tag,
  };

  // Play sound if configured
  if (payload.soundUrl) {
    try {
      const audio = new Audio(payload.soundUrl);
      audio.volume = Math.max(0, Math.min(1, payload.volume || 1.0));
      audio.play().catch((err) => {
        console.warn('[ServiceWorker] Failed to play notification sound:', err);
      });
    } catch (err) {
      console.error('[ServiceWorker] Error playing audio:', err);
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked:', event.notification.tag);
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          console.log('[ServiceWorker] Focusing existing client');
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        console.log('[ServiceWorker] Opening new window');
        return self.clients.openWindow(url);
      }
    }),
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[ServiceWorker] Notification closed:', event.notification.tag);
});

// Keep service worker alive for background operations
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
