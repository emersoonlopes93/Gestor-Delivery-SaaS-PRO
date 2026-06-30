import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TenantCapabilitiesResponse } from '@gestor/types';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

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
};

function readEnvFlag(flag?: string): boolean {
  if (!flag) return true;
  const rawValue = import.meta.env[flag];
  if (rawValue === undefined) {
    return false;
  }
  return String(rawValue).toLowerCase() === 'true';
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
    return (flag?: string) => {
      if (!flag) return true;

      const featureKey = ENV_FLAG_TO_FEATURE_KEY[flag];
      const capabilityDecision = featureKey ? query.data?.features?.[featureKey] : undefined;

      if (capabilityDecision) {
        return capabilityDecision.enabled;
      }

      return readEnvFlag(flag);
    };
  }, [query.data]);

  return {
    ...query,
    capabilities: query.data,
    isFeatureVisible: featureVisibility,
  };
}
