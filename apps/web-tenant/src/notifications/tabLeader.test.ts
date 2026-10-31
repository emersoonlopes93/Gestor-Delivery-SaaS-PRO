import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTabLeader } from './tabLeader';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true });

describe('tabLeader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // Mock global.navigator to ensure 'locks' is completely absent for fallback tests
  // since Node environment doesn't have Web Locks API.
  beforeEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
  });

  it('can acquire leadership initially', async () => {
    const leader1 = createTabLeader('tenant-1');

    // Na nossa implementacao atual, Web Locks API ou LocalStorage assumem a lideranca sincrona ou muito rapido.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(leader1.isLeader()).toBe(true);
    leader1.destroy();
  });

  it('tracks played events via BroadcastChannel/internal map', () => {
    const leader = createTabLeader('tenant-1');
    leader.markEventPlayed('event-123');
    expect(leader.wasEventPlayed('event-123')).toBe(true);
    expect(leader.wasEventPlayed('event-456')).toBe(false);
    leader.destroy();
  });

  it('isolates leadership by tenantId', async () => {
    const leader1 = createTabLeader('tenant-A');
    const leader2 = createTabLeader('tenant-B');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(leader1.isLeader()).toBe(true);
    expect(leader2.isLeader()).toBe(true);

    leader1.destroy();
    leader2.destroy();
  });

  it('falls back to a single localStorage leader when Web Locks reject', async () => {
    Object.defineProperty(global, 'navigator', {
      value: { locks: { request: vi.fn().mockRejectedValue(new Error('Web Locks unavailable')) } },
      configurable: true,
      writable: true,
    });

    const leader1 = createTabLeader('tenant-1');
    const leader2 = createTabLeader('tenant-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(Number(leader1.isLeader()) + Number(leader2.isLeader())).toBe(1);

    leader1.destroy();
    leader2.destroy();
  });

  it('keeps a Web Locks follower as a follower when the lock is unavailable', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        locks: {
          request: vi.fn((_name: string, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null)),
        },
      },
      configurable: true,
      writable: true,
    });

    const follower = createTabLeader('tenant-1');
    await Promise.resolve();

    expect(follower.isLeader()).toBe(false);
    follower.destroy();
  });

  it('acquires a Web Lock with an abortable queued request', async () => {
    const request = vi.fn((_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => {
      void callback({});
      return Promise.resolve();
    });
    Object.defineProperty(global, 'navigator', {
      value: { locks: { request } },
      configurable: true,
      writable: true,
    });

    const leader = createTabLeader('tenant-1');
    await Promise.resolve();

    expect(leader.isLeader()).toBe(true);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ mode: 'exclusive' });
    expect(request.mock.calls[0]?.[1]).toHaveProperty('signal');
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('ifAvailable');
    leader.destroy();
  });

  it('promotes a queued follower after the Web Locks leader is destroyed', async () => {
    type LockCallback = (lock: object) => Promise<void>;
    const queue: Array<() => void> = [];
    let lockHeld = false;
    const request = vi.fn((_name: string, _options: unknown, callback: LockCallback) => new Promise<void>((resolve) => {
      const run = () => {
        lockHeld = true;
        void callback({}).then(() => {
          lockHeld = false;
          queue.shift()?.();
          resolve();
        });
      };
      if (lockHeld) queue.push(run);
      else run();
    }));
    Object.defineProperty(global, 'navigator', {
      value: { locks: { request } },
      configurable: true,
      writable: true,
    });

    const first = createTabLeader('tenant-1');
    const second = createTabLeader('tenant-1');
    await Promise.resolve();

    expect(first.isLeader()).toBe(true);
    expect(second.isLeader()).toBe(false);

    first.destroy();
    await Promise.resolve();

    expect(second.isLeader()).toBe(true);
    second.destroy();
  });
});
