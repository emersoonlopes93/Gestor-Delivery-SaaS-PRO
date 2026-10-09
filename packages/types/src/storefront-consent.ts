import { z } from 'zod';
import {
  AnalyticsConsentSnapshotV1Schema,
  type AnalyticsConsentSnapshotV1,
} from './marketing-analytics';

export const STOREFRONT_CONSENT_SCHEMA_VERSION_V1 = 1 as const;

export const StorefrontConsentPolicyVersionSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/);

export type StorefrontConsentPolicyVersion = z.infer<
  typeof StorefrontConsentPolicyVersionSchema
>;

export const StorefrontConsentCategoriesV1Schema = z
  .object({
    necessary: z.literal(true),
    analytics: z.boolean(),
    marketing: z.boolean(),
  })
  .strict();

export type StorefrontConsentCategoriesV1 = z.infer<
  typeof StorefrontConsentCategoriesV1Schema
>;

export const StorefrontConsentDecisionSourceV1Schema = z.enum([
  'banner_accept_all',
  'banner_reject_optional',
  'preferences_save',
  'preferences_revoke',
]);

export type StorefrontConsentDecisionSourceV1 = z.infer<
  typeof StorefrontConsentDecisionSourceV1Schema
>;

export const StorefrontConsentRecordV1Schema = z
  .object({
    schemaVersion: z.literal(STOREFRONT_CONSENT_SCHEMA_VERSION_V1),
    policyVersion: StorefrontConsentPolicyVersionSchema,
    tenantKey: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
    categories: StorefrontConsentCategoriesV1Schema,
    decidedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    source: StorefrontConsentDecisionSourceV1Schema,
  })
  .strict();

export type StorefrontConsentRecordV1 = z.infer<
  typeof StorefrontConsentRecordV1Schema
>;

export function toAnalyticsConsentSnapshotV1(
  record: StorefrontConsentRecordV1,
): AnalyticsConsentSnapshotV1 {
  return AnalyticsConsentSnapshotV1Schema.parse({
    analytics: record.categories.analytics,
    marketing: record.categories.marketing,
    version: record.policyVersion,
  });
}
