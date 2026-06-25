import { api } from '../../lib/api-client';

export type TenantFeatureKey =
  | 'ai_agent'
  | 'campaigns'
  | 'ifood_integration'
  | 'advanced_reports'
  | 'custom_domain'
  | 'priority_support';

export type TenantFeatureOverride = {
  id: string;
  featureKey: TenantFeatureKey;
  enabled: boolean;
  source: string;
  reason: string;
  expiresAt: string | null;
  createdByAdminId: string | null;
  updatedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  isActiveNow: boolean;
};

export type TenantEntitlements = {
  commercialStatus: string;
  billableRevenue: string | number;
  estimatedBasePrice: string | number;
  addonsAmount: string | number;
  estimatedTotalPrice: string | number;
  activeAddons: Array<{
    addonKey: string;
    price: string | number;
    status: string;
  }>;
  ai: {
    canUse: boolean;
    source: string;
    monthlyLimit: number;
    usedThisMonth: number;
    remainingThisMonth: number;
  };
  flags: {
    canUseAiAgent: boolean;
    canUseIfoodIntegration: boolean;
    canUseAdvancedReports: boolean;
    canUseCampaigns: boolean;
    canUseCustomDomain: boolean;
    canUsePrioritySupport: boolean;
  };
  channelsIncludedInBilling: string[];
  settings: Record<string, unknown>;
  usagePreview: Record<string, unknown>;
  trialAvailable: boolean;
  featureOverrides: TenantFeatureOverride[];
};

export const adminTenantsApi = {
  getTenant: async (tenantId: string) => {
    const res = await api.get(`/admin/tenants/${tenantId}`);
    return res.data;
  },
  getEntitlements: async (tenantId: string) => {
    const res = await api.get<TenantEntitlements>(`/admin/tenants/${tenantId}/entitlements`);
    return res.data;
  },
  upsertFeatureOverride: async (
    tenantId: string,
    featureKey: TenantFeatureKey,
    body: { enabled: boolean; reason: string; expiresAt?: string | null },
  ) => {
    const res = await api.put<TenantEntitlements>(`/admin/tenants/${tenantId}/entitlements/${featureKey}`, body);
    return res.data;
  },
  deleteFeatureOverride: async (
    tenantId: string,
    featureKey: TenantFeatureKey,
    reason: string,
  ) => {
    const res = await api.delete<TenantEntitlements>(`/admin/tenants/${tenantId}/entitlements/${featureKey}`, {
      reason,
    });
    return res.data;
  },
};
