import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TenantCapabilitiesResponse } from '@gestor/types';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

const SERVER_AUTHORITATIVE_FEATURES = new Set(['order_manager_v2']);

const ENV_FLAG_TO_FEATURE_KEY: Record<string, string> = {
  VITE_FEATURE_UPSELLS: 'upsells',
  VITE_FEATURE_INVENTORY_ADVANCED: 'inventory_advanced',
  VITE_FEATURE_DELIVERY_LIVE_MAP: 'delivery_live_map',
  VITE_FEATURE_FINANCE_ADVANCED: 'finance_advanced',
  VITE_FEATURE_CRM_ADVANCED: 'crm_enterprise',
  VITE_FEATURE_CAMPAIGNS: 'campaigns',
  VITE_FEATURE_BI_ADVANCED: 'bi_advanced',
  VITE_FEATURE_GOALS: 'goals',
  VITE_FEATURE_WHATSAPP_ADVANCED: 'whatsapp_advanced',
  VITE_FEATURE_WHATSAPP_CONNECT: 'whatsapp_connect',
  VITE_FEATURE_AI_AGENT: 'ai_agent',
  VITE_FEATURE_FRANCHISE: 'franchise',
  VITE_FEATURE_ADMIN_INTEGRATIONS: 'admin_integrations',
  VITE_FEATURE_ORDER_MANAGER_V2: 'order_manager_v2',
};

const FEATURE_KEY_TO_ENV_FLAG: Record<string, string> = Object.fromEntries(
  Object.entries(ENV_FLAG_TO_FEATURE_KEY).map(([flag, featureKey]) => [featureKey, flag]),
);

function readEnvFlag(flag?: string): boolean {
  if (!flag) return true;
  const rawValue = import.meta.env[flag];
  if (rawValue === undefined) {
    return false;
  }
  return String(rawValue).toLowerCase() === 'true';
}

export function resolveFeatureVisibility(
  featureKey: string | undefined,
  flag: string | undefined,
  capabilities: Pick<TenantCapabilitiesResponse, 'features'> | undefined,
): boolean {
  const resolvedFeatureKey = featureKey ?? (flag ? ENV_FLAG_TO_FEATURE_KEY[flag] : undefined);
  const capabilityDecision = resolvedFeatureKey ? capabilities?.features?.[resolvedFeatureKey] : undefined;

  if (capabilityDecision) {
    return capabilityDecision.enabled;
  }

  // Order Manager V2 is a tenant opt-in release. Its availability is never
  // inferred from a browser build flag when the server decision is missing.
  if (resolvedFeatureKey && SERVER_AUTHORITATIVE_FEATURES.has(resolvedFeatureKey)) {
    return false;
  }

  if (flag) {
    return readEnvFlag(flag);
  }

  if (resolvedFeatureKey) {
    const fallbackFlag = FEATURE_KEY_TO_ENV_FLAG[resolvedFeatureKey];
    if (fallbackFlag) {
      return readEnvFlag(fallbackFlag);
    }
  }

  return !resolvedFeatureKey;
}

export function useTenantCapabilities() {
  const { user } = useAuthStore();

  const query = useQuery({
    queryKey: ['tenant-capabilities', user?.tenantId],
    queryFn: async () => {
      const response = await api.get<TenantCapabilitiesResponse>('/tenant/capabilities');
      return response.data;
    },
    enabled: Boolean(user?.tenantId),
    staleTime: 1000 * 60 * 5,
  });

  const featureVisibility = useMemo(() => {
    return (flag?: string, featureKey?: string) => resolveFeatureVisibility(featureKey, flag, query.data);
  }, [query.data]);

  const getFeatureDecision = useMemo(() => {
    return (featureKey: string) => query.data?.features?.[featureKey];
  }, [query.data]);

  return {
    ...query,
    capabilities: query.data,
    isFeatureVisible: featureVisibility,
    isFeatureEnabled: (featureKey: string) => featureVisibility(undefined, featureKey),
    getFeatureDecision,
  };
}
