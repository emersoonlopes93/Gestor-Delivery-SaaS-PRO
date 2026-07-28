import { createContext, useContext } from 'react';
import type {
  AnalyticsConsentSnapshotV1,
  StorefrontConsentCategoriesV1,
  StorefrontConsentDecisionSourceV1,
} from '@gestor/types';

export type ConsentStatus = 'undecided' | 'decided';
export type OptionalConsentCategory = 'analytics' | 'marketing';

export interface StorefrontConsentContextValue {
  status: ConsentStatus;
  policyVersion: string;
  categories: StorefrontConsentCategoriesV1;
  draftCategories: StorefrontConsentCategoriesV1;
  isPreferencesOpen: boolean;
  canUseAnalytics: boolean;
  canUseMarketing: boolean;
  acceptAll: (
    source: Extract<
      StorefrontConsentDecisionSourceV1,
      'banner_accept_all' | 'preferences_save'
    >,
  ) => void;
  acceptNecessaryOnly: (
    source: Extract<
      StorefrontConsentDecisionSourceV1,
      'banner_reject_optional' | 'preferences_save'
    >,
  ) => void;
  rejectOptional: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
  setDraftCategory: (
    category: OptionalConsentCategory,
    enabled: boolean,
  ) => void;
  savePreferences: () => void;
  revokeOptional: () => void;
  getAnalyticsConsentSnapshot: () => AnalyticsConsentSnapshotV1;
}

export const StorefrontConsentContext =
  createContext<StorefrontConsentContextValue | null>(null);

export function useStorefrontConsent() {
  const context = useContext(StorefrontConsentContext);

  if (!context) {
    throw new Error(
      'useStorefrontConsent must be used within StorefrontConsentProvider',
    );
  }

  return context;
}
