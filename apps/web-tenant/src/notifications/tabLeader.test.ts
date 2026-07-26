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
});
