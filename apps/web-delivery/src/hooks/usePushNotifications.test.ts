import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { cleanupDriverPushForLogout } from './usePushNotifications';

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }));

describe('driver push logout cleanup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes all server subscriptions and the browser subscription', async () => {
    vi.mocked(api.post).mockResolvedValue({} as never);
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const registration = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe }) },
    } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(registration) },
    });

    await cleanupDriverPushForLogout(registration);

    expect(api.post).toHaveBeenCalledWith('/notifications/push/unsubscribe-all');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not block logout when server cleanup fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('offline'));
    const registration = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    } as unknown as ServiceWorkerRegistration;
    await expect(cleanupDriverPushForLogout(registration)).resolves.toBeUndefined();
  });
});
