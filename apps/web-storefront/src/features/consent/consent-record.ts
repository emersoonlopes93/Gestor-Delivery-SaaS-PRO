import {
  STOREFRONT_CONSENT_SCHEMA_VERSION_V1,
  type StorefrontConsentCategoriesV1,
  type StorefrontConsentDecisionSourceV1,
  type StorefrontConsentRecordV1,
} from '@gestor/types';
import { STOREFRONT_CONSENT_POLICY_VERSION } from './consent.constants';

interface CreateConsentRecordInput {
  tenantKey: string;
  categories: StorefrontConsentCategoriesV1;
  source: StorefrontConsentDecisionSourceV1;
  previousRecord?: StorefrontConsentRecordV1 | null;
  now?: string;
}

export function createConsentRecord({
  tenantKey,
  categories,
  source,
  previousRecord = null,
  now = new Date().toISOString(),
}: CreateConsentRecordInput): StorefrontConsentRecordV1 {
  return {
    schemaVersion: STOREFRONT_CONSENT_SCHEMA_VERSION_V1,
    policyVersion: STOREFRONT_CONSENT_POLICY_VERSION,
    tenantKey,
    categories: {
      necessary: true,
      analytics: categories.analytics,
      marketing: categories.marketing,
    },
    decidedAt: previousRecord?.decidedAt ?? now,
    updatedAt: now,
    source,
  };
}
