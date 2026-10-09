import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { StorefrontConsentRecordV1 } from '@gestor/types';
import {
  getConsentStorageKey,
  readStoredConsent,
  writeStoredConsent,
  type ConsentStorage,
} from './consent-storage';

class MemoryStorage implements ConsentStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const record: StorefrontConsentRecordV1 = {
  schemaVersion: 1,
  policyVersion: '1.0.0',
  tenantKey: 'tenant-a',
  categories: {
    necessary: true,
    analytics: false,
    marketing: false,
  },
  decidedAt: '2026-07-28T12:00:00.000Z',
  updatedAt: '2026-07-28T12:00:00.000Z',
  source: 'banner_reject_optional',
};

describe('storefront consent storage', () => {
  it('serializes and reads a valid tenant-scoped decision', () => {
    const storage = new MemoryStorage();

    expect(writeStoredConsent(record, storage)).toBe(true);
    expect(readStoredConsent('tenant-a', storage)).toEqual(record);
  });

  it('uses a namespaced and encoded key per tenant', () => {
    expect(getConsentStorageKey('tenant/a')).toBe(
      'gestor:storefront-consent:v1:tenant%2Fa',
    );
  });

  it('keeps tenant A isolated from tenant B', () => {
    const storage = new MemoryStorage();
    writeStoredConsent(record, storage);

    expect(readStoredConsent('tenant-b', storage)).toBeNull();
    expect(readStoredConsent('tenant-a', storage)).toEqual(record);
  });

  it.each([
    ['invalid JSON', '{'],
    ['old policy', JSON.stringify({ ...record, policyVersion: '0.9.0' })],
    ['unknown schema', JSON.stringify({ ...record, schemaVersion: 2 })],
    ['tenant mismatch', JSON.stringify({ ...record, tenantKey: 'tenant-b' })],
    ['invalid timestamp', JSON.stringify({ ...record, decidedAt: 'today' })],
    [
      'unknown field',
      JSON.stringify({ ...record, metadata: { phone: 'not-allowed' } }),
    ],
    [
      'malicious necessary false',
      JSON.stringify({
        ...record,
        categories: { ...record.categories, necessary: false },
      }),
    ],
  ])('returns default-deny signal for %s', (_caseName, serialized) => {
    const storage = new MemoryStorage();
    storage.values.set(getConsentStorageKey('tenant-a'), serialized);

    expect(readStoredConsent('tenant-a', storage)).toBeNull();
  });

  it('fails closed when storage is absent or blocked', () => {
    const blockedStorage: ConsentStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
    };

    expect(readStoredConsent('tenant-a', null)).toBeNull();
    expect(readStoredConsent('tenant-a', blockedStorage)).toBeNull();
    expect(writeStoredConsent(record, null)).toBe(false);
    expect(writeStoredConsent(record, blockedStorage)).toBe(false);
  });
});
