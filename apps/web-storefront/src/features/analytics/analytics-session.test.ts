import { describe, expect, it } from 'vitest';
import { clearAnalyticsSession, getAnalyticsSessionId } from './analytics-session';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('analytics session', () => {
  it('isolates tenants and rotates after inactivity', () => {
    const store = storage();
    const a = getAnalyticsSessionId('tenant-a', 0, store);
    const b = getAnalyticsSessionId('tenant-b', 0, store);
    expect(a).not.toBe(b);
    expect(getAnalyticsSessionId('tenant-a', 1_000, store)).toBe(a);
    expect(getAnalyticsSessionId('tenant-a', 1_801_001, store)).not.toBe(a);
  });

  it('falls back to memory when storage is unavailable and clears only the tenant', () => {
    const a = getAnalyticsSessionId('tenant-a', 10);
    const b = getAnalyticsSessionId('tenant-b', 10);
    clearAnalyticsSession('tenant-a', null);
    expect(getAnalyticsSessionId('tenant-b', 11)).toBe(b);
    expect(getAnalyticsSessionId('tenant-a', 11)).not.toBe(a);
  });
});
