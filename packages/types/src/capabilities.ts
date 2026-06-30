export type TenantCapabilityFeatureKey = string;

export type FeatureDecisionReason =
  | 'essential'
  | 'unknown_feature'
  | 'global_disabled'
  | 'plan_not_allowed'
  | 'tenant_disabled'
  | 'tenant_enabled_override'
  | 'missing_permission'
  | 'beta_disabled'
  | 'env_disabled'
  | 'enabled';

export type TenantCapabilityDecision = {
  enabled: boolean;
  reason: FeatureDecisionReason;
  source?: string;
};

export type TenantCapabilitiesResponse = {
  features: Record<TenantCapabilityFeatureKey, TenantCapabilityDecision>;
  modules: Record<string, TenantCapabilityDecision>;
  plan: {
    id: string | null;
    name: string | null;
    slug: string | null;
    source: string | null;
  };
  permissions: string[];
};
