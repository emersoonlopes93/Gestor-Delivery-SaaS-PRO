import { describe, expect, it, vi } from 'vitest';
import { announceWaitingServiceWorker, PWA_UPDATE_AVAILABLE_EVENT } from './pwa';

describe('PWA update lifecycle', () => {
  it('announces an update only when a waiting worker can replace a controller', () => {
    const listener = vi.fn();
    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, listener);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {} },
    });
    const registration = { waiting: {} } as ServiceWorkerRegistration;

    expect(announceWaitingServiceWorker(registration)).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, listener);
  });

  it('does not interrupt the first service worker installation', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    });
    expect(announceWaitingServiceWorker({ waiting: {} } as ServiceWorkerRegistration)).toBe(false);
  });
});
