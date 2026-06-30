import type {
  AdminTenantFeatureItem,
  AdminTenantFeaturesResponse,
  FeaturePresetPreviewResponse,
  FeatureTenantOverrideMode,
} from '@gestor/types';
import { api } from '../../lib/api-client';

export type TenantFeatureOverride = {
  id: string;
  featureKey: string;
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

export type TenantFeaturePreset = {
  key: string;
  name: string;
  description: string;
  enabledCount: number;
  disabledCount: number;
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
  getFeatures: async (tenantId: string) => {
    const res = await api.get<AdminTenantFeaturesResponse>(`/admin/tenants/${tenantId}/features`);
    return res.data;
  },
  listPresets: async () => {
    const res = await api.get<TenantFeaturePreset[]>('/admin/features/presets');
    return res.data;
  },
  updateFeatureOverride: async (
    tenantId: string,
    featureKey: string,
    body: { mode: FeatureTenantOverrideMode; reason?: string; expiresAt?: string | null },
  ) => {
    const res = await api.patch<AdminTenantFeatureItem>(`/admin/tenants/${tenantId}/features/${featureKey}/override`, body);
    return res.data;
  },
  previewPreset: async (tenantId: string, presetKey: string) => {
    const res = await api.post<FeaturePresetPreviewResponse>(`/admin/tenants/${tenantId}/features/presets/${presetKey}/preview`);
    return res.data;
  },
  applyPreset: async (
    tenantId: string,
    presetKey: string,
    body: { reason: string; confirmation: string },
  ) => {
    const res = await api.post<FeaturePresetPreviewResponse>(`/admin/tenants/${tenantId}/features/presets/${presetKey}/apply`, body);
    return res.data;
  },
};
