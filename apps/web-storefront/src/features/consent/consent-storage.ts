import {
  StorefrontConsentRecordV1Schema,
  type StorefrontConsentRecordV1,
} from '@gestor/types';
import {
  STOREFRONT_CONSENT_POLICY_VERSION,
  STOREFRONT_CONSENT_STORAGE_PREFIX,
} from './consent.constants';

export function getConsentStorageKey(tenantKey: string) {
  return `${STOREFRONT_CONSENT_STORAGE_PREFIX}:${encodeURIComponent(tenantKey)}`;
}

export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): ConsentStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredConsent(
  tenantKey: string,
  storage: ConsentStorage | null = getBrowserStorage(),
): StorefrontConsentRecordV1 | null {
  if (!storage) {
    return null;
  }

  try {
    const serialized = storage.getItem(
      getConsentStorageKey(tenantKey),
    );

    if (!serialized) {
      return null;
    }

    const result = StorefrontConsentRecordV1Schema.safeParse(
      JSON.parse(serialized),
    );

    if (
      !result.success ||
      result.data.tenantKey !== tenantKey ||
      result.data.policyVersion !== STOREFRONT_CONSENT_POLICY_VERSION
    ) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

export function writeStoredConsent(
  record: StorefrontConsentRecordV1,
  storage: ConsentStorage | null = getBrowserStorage(),
) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      getConsentStorageKey(record.tenantKey),
      JSON.stringify(record),
    );
    return true;
  } catch {
    // Consent remains valid for the current page even when storage is unavailable.
    return false;
  }
}
