import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  StorefrontConsentRecordV1Schema,
  toAnalyticsConsentSnapshotV1,
  type StorefrontConsentRecordV1,
} from '@gestor/types';

const validRecord: StorefrontConsentRecordV1 = {
  schemaVersion: 1,
  policyVersion: '1.0.0',
  tenantKey: 'tenant-a',
  categories: {
    necessary: true,
    analytics: true,
    marketing: false,
  },
  decidedAt: '2026-07-28T12:00:00.000Z',
  updatedAt: '2026-07-28T12:00:00.000Z',
  source: 'preferences_save',
};

describe('StorefrontConsentRecordV1', () => {
  it('accepts the strict, versioned tenant-scoped record', () => {
    expect(StorefrontConsentRecordV1Schema.parse(validRecord)).toEqual(validRecord);
  });

  it.each([
    ['necessary false', { categories: { ...validRecord.categories, necessary: false } }],
    ['unknown schema', { schemaVersion: 2 }],
    ['invalid decidedAt', { decidedAt: 'today' }],
    ['invalid updatedAt', { updatedAt: 'tomorrow' }],
    ['empty tenant key', { tenantKey: '' }],
    ['unknown source', { source: 'external_provider' }],
    ['extra field', { metadata: { email: 'not-allowed@example.com' } }],
  ])('rejects %s', (_caseName, override) => {
    expect(
      StorefrontConsentRecordV1Schema.safeParse({
        ...validRecord,
        ...override,
      }).success,
    ).toBe(false);
  });

  it('converts explicitly to the PR 0A analytics snapshot', () => {
    expect(toAnalyticsConsentSnapshotV1(validRecord)).toEqual({
      analytics: true,
      marketing: false,
      version: '1.0.0',
    });
  });
});
