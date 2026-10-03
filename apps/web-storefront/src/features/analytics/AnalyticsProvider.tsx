import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useStorefrontConsent } from '../consent';
import { createAnalyticsRuntime, type AnalyticsRuntime } from './analytics-dispatcher';

const AnalyticsContext = createContext<AnalyticsRuntime | null>(null);

export function AnalyticsProvider({ tenantSlug, children }: { tenantSlug: string; children: ReactNode }) {
  const consent = useStorefrontConsent();
  const runtime = useMemo(() => createAnalyticsRuntime(tenantSlug, consent.getAnalyticsConsentSnapshot), [consent.getAnalyticsConsentSnapshot, tenantSlug]);
  const wasAllowed = useRef(consent.canUseAnalytics);

  useEffect(() => {
    if (wasAllowed.current && !consent.canUseAnalytics) runtime.revoke();
    wasAllowed.current = consent.canUseAnalytics;
  }, [consent.canUseAnalytics, runtime]);

  useEffect(() => () => runtime.revoke(), [runtime]);

  return <AnalyticsContext.Provider value={runtime}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsRuntime {
  const runtime = useContext(AnalyticsContext);
  if (!runtime) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return runtime;
}
