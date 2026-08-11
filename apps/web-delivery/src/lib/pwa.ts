export const PWA_UPDATE_AVAILABLE_EVENT = 'pwa:update-available';

export function announceWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  if (!registration.waiting || !navigator.serviceWorker.controller) return false;
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT, { detail: registration }));
  return true;
}

export function registerDriverServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      announceWaitingServiceWorker(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') announceWaitingServiceWorker(registration);
        });
      });
      window.setInterval(() => void registration.update().catch(() => undefined), 60_000);
    }).catch((error: unknown) => {
      console.error('[SW] Registration failed:', error);
    });
  });
}
