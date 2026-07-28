import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  toAnalyticsConsentSnapshotV1,
  type AnalyticsConsentSnapshotV1,
  type StorefrontConsentCategoriesV1,
  type StorefrontConsentDecisionSourceV1,
  type StorefrontConsentRecordV1,
} from '@gestor/types';
import {
  StorefrontConsentContext,
  type OptionalConsentCategory,
  type StorefrontConsentContextValue,
} from './consent-context';
import { STOREFRONT_CONSENT_POLICY_VERSION } from './consent.constants';
import {
  readStoredConsent,
  writeStoredConsent,
} from './consent-storage';
import { createConsentRecord } from './consent-record';

interface StorefrontConsentProviderProps {
  tenantKey: string;
  children: ReactNode;
}

const DEFAULT_CATEGORIES: StorefrontConsentCategoriesV1 = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export function StorefrontConsentProvider({
  tenantKey,
  children,
}: StorefrontConsentProviderProps) {
  const [record, setRecord] = useState<StorefrontConsentRecordV1 | null>(() =>
    readStoredConsent(tenantKey),
  );
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [draftCategories, setDraftCategories] =
    useState<StorefrontConsentCategoriesV1>(
      record?.categories ?? DEFAULT_CATEGORIES,
    );
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const categories = record?.categories ?? DEFAULT_CATEGORIES;

  const restoreFocus = useCallback(() => {
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, []);

  const commitDecision = useCallback(
    (
      nextCategories: StorefrontConsentCategoriesV1,
      source: StorefrontConsentDecisionSourceV1,
    ) => {
      const nextRecord = createConsentRecord({
        tenantKey,
        categories: nextCategories,
        source,
        previousRecord: record,
      });

      setRecord(nextRecord);
      setDraftCategories(nextCategories);
      setIsPreferencesOpen(false);
      writeStoredConsent(nextRecord);
      restoreFocus();
    },
    [record, restoreFocus, tenantKey],
  );

  const acceptAll = useCallback(
    (
      source: Extract<
        StorefrontConsentDecisionSourceV1,
        'banner_accept_all' | 'preferences_save'
      >,
    ) => {
      commitDecision(
        { necessary: true, analytics: true, marketing: true },
        source,
      );
    },
    [commitDecision],
  );

  const acceptNecessaryOnly = useCallback(
    (
      source: Extract<
        StorefrontConsentDecisionSourceV1,
        'banner_reject_optional' | 'preferences_save'
      >,
    ) => {
      commitDecision(DEFAULT_CATEGORIES, source);
    },
    [commitDecision],
  );

  const openPreferences = useCallback(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDraftCategories(categories);
    setIsPreferencesOpen(true);
  }, [categories]);

  const closePreferences = useCallback(() => {
    setIsPreferencesOpen(false);
    restoreFocus();
  }, [restoreFocus]);

  const setDraftCategory = useCallback(
    (category: OptionalConsentCategory, enabled: boolean) => {
      setDraftCategories(current => ({
        ...current,
        necessary: true,
        [category]: enabled,
      }));
    },
    [],
  );

  const savePreferences = useCallback(() => {
    commitDecision(
      { ...draftCategories, necessary: true },
      'preferences_save',
    );
  }, [commitDecision, draftCategories]);

  const revokeOptional = useCallback(() => {
    commitDecision(DEFAULT_CATEGORIES, 'preferences_revoke');
  }, [commitDecision]);

  const rejectOptional = useCallback(() => {
    acceptNecessaryOnly('preferences_save');
  }, [acceptNecessaryOnly]);

  const getAnalyticsConsentSnapshot = useCallback(
    (): AnalyticsConsentSnapshotV1 =>
      record
        ? toAnalyticsConsentSnapshotV1(record)
        : {
            analytics: false,
            marketing: false,
            version: STOREFRONT_CONSENT_POLICY_VERSION,
          },
    [record],
  );

  const value = useMemo<StorefrontConsentContextValue>(
    () => ({
      status: record ? 'decided' : 'undecided',
      policyVersion: STOREFRONT_CONSENT_POLICY_VERSION,
      categories,
      draftCategories,
      isPreferencesOpen,
      canUseAnalytics: record?.categories.analytics === true,
      canUseMarketing: record?.categories.marketing === true,
      acceptAll,
      acceptNecessaryOnly,
      rejectOptional,
      openPreferences,
      closePreferences,
      setDraftCategory,
      savePreferences,
      revokeOptional,
      getAnalyticsConsentSnapshot,
    }),
    [
      acceptAll,
      acceptNecessaryOnly,
      categories,
      closePreferences,
      draftCategories,
      getAnalyticsConsentSnapshot,
      isPreferencesOpen,
      openPreferences,
      record,
      rejectOptional,
      revokeOptional,
      savePreferences,
      setDraftCategory,
    ],
  );

  return (
    <StorefrontConsentContext.Provider value={value}>
      {children}
    </StorefrontConsentContext.Provider>
  );
}
