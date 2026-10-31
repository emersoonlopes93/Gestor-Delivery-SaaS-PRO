import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { createConsentRecord } from './consent-record';

describe('createConsentRecord', () => {
  it.each([
    ['accept all', true, true, 'banner_accept_all'],
    ['reject optional', false, false, 'banner_reject_optional'],
    ['customize', true, false, 'preferences_save'],
    ['revoke', false, false, 'preferences_revoke'],
  ] as const)(
    'creates %s with necessary always enabled',
    (_caseName, analytics, marketing, source) => {
      const result = createConsentRecord({
        tenantKey: 'tenant-a',
        categories: { necessary: true, analytics, marketing },
        source,
        now: '2026-07-28T12:00:00.000Z',
      });

      expect(result.categories).toEqual({
        necessary: true,
        analytics,
        marketing,
      });
      expect(result.source).toBe(source);
      expect(result.policyVersion).toBe('1.0.0');
    },
  );

  it('preserves decidedAt and updates updatedAt on later changes', () => {
    const first = createConsentRecord({
      tenantKey: 'tenant-a',
      categories: { necessary: true, analytics: true, marketing: true },
      source: 'banner_accept_all',
      now: '2026-07-28T12:00:00.000Z',
    });
    const revoked = createConsentRecord({
      tenantKey: 'tenant-a',
      categories: { necessary: true, analytics: false, marketing: false },
      source: 'preferences_revoke',
      previousRecord: first,
      now: '2026-07-28T13:00:00.000Z',
    });

    expect(revoked.decidedAt).toBe(first.decidedAt);
    expect(revoked.updatedAt).toBe('2026-07-28T13:00:00.000Z');
  });
});
