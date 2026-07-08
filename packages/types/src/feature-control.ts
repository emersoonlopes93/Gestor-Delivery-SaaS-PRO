import type { FeatureDecisionReason as CapabilityFeatureDecisionReason } from './capabilities';

export type FeatureStatus = 'stable' | 'beta' | 'internal' | 'coming_soon' | 'legacy';
export type FeatureOperationalStatus = 'enabled' | 'disabled' | 'beta' | 'internal' | 'coming_soon';
export type FeaturePresetKey =
  | 'mvp_minimo'
  | 'mvp_pizzaria'
  | 'mvp_restaurante'
  | 'interno_teste'
  | 'full_platform';

export type FeatureTenantOverrideMode = 'inherit' | 'enabled' | 'disabled';

export type AdminFeatureCatalogItem = {
  featureKey: string;
  name: string;
  description?: string;
  category: string;
  essential: boolean;
  canDisable: boolean;
  catalogStatus: FeatureStatus;
  globalStatus: FeatureOperationalStatus;
  envFallbackKey?: string;
  moduleKey?: string;
  requiredPermission?: string[];
  updatedAt: string | Date | null;
  updatedBy: string | null;
};

export type AdminTenantFeatureItem = {
  featureKey: string;
  name: string;
  description?: string;
  category: string;
  essential: boolean;
  canDisable: boolean;
  catalogStatus: FeatureStatus;
  globalStatus: FeatureOperationalStatus;
  tenantOverride: FeatureTenantOverrideMode;
  overrideReason: string | null;
  overrideExpiresAt: string | Date | null;
  effectiveEnabled: boolean;
  reason: CapabilityFeatureDecisionReason;
  source?: string;
  moduleKey?: string;
  requiredPermission?: string[];
};

export type AdminTenantFeaturesResponse = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  features: AdminTenantFeatureItem[];
};

export type FeaturePresetPreviewResponse = {
  preset: {
    key: FeaturePresetKey;
    name: string;
    description: string;
  };
  scope: 'global' | 'tenant';
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  summary: {
    total: number;
    willEnable: number;
    willDisable: number;
    ignoredEssential: number;
    blocked: number;
    unchanged: number;
  };
  changes: Array<{
    featureKey: string;
    name: string;
    targetStatus: FeatureOperationalStatus | null;
    targetOverrideMode: FeatureTenantOverrideMode | null;
    currentGlobalStatus: FeatureOperationalStatus;
    currentTenantOverride?: FeatureTenantOverrideMode;
    effectiveEnabledBefore: boolean;
    effectiveEnabledAfter: boolean;
    action: 'enable' | 'disable' | 'inherit' | 'ignored' | 'blocked' | 'unchanged';
    reason: string;
  }>;
};
