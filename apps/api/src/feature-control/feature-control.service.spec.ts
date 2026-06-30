import { FeatureControlService } from './feature-control.service';

describe('FeatureControlService', () => {
  const originalEnv = process.env.VITE_FEATURE_CRM_ADVANCED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VITE_FEATURE_CRM_ADVANCED;
    } else {
      process.env.VITE_FEATURE_CRM_ADVANCED = originalEnv;
    }
  });

  const makeService = (overrides?: {
    includedModules?: string[];
    allowAllModules?: boolean;
    permissions?: string[];
    moduleAccessRows?: Array<{ module: string; enabled: boolean }>;
    featureOverrides?: Array<{
      featureKey: string;
      enabled: boolean;
      isActiveNow?: boolean;
      source?: string;
      reason?: string;
    }>;
    flags?: Partial<{
      canUseAiAgent: boolean;
      canUseIfoodIntegration: boolean;
      canUseAdvancedReports: boolean;
      canUseCampaigns: boolean;
      canUseCustomDomain: boolean;
      canUsePrioritySupport: boolean;
    }>;
  }) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(overrides?.moduleAccessRows ?? []),
    };
    const tenantBillingResolver = {
      getTenantBillingState: jest.fn().mockResolvedValue({
        allowAllModules: overrides?.allowAllModules ?? false,
        includedModules: overrides?.includedModules ?? [],
        source: 'billing_v2',
        plan: {
          id: 'plan-1',
          name: 'Plano Teste',
          slug: 'plano-teste',
        },
      }),
    };
    const billingEntitlementsService = {
      resolveTenantEntitlements: jest.fn().mockResolvedValue({
        flags: {
          canUseAiAgent: false,
          canUseIfoodIntegration: false,
          canUseAdvancedReports: false,
          canUseCampaigns: false,
          canUseCustomDomain: false,
          canUsePrioritySupport: false,
          ...(overrides?.flags ?? {}),
        },
        featureOverrides: (overrides?.featureOverrides ?? []).map((override, index) => ({
          id: `override-${index}`,
          featureKey: override.featureKey,
          enabled: override.enabled,
          source: override.source ?? 'manual_override',
          reason: override.reason ?? 'Override de teste',
          expiresAt: null,
          createdByAdminId: null,
          updatedByAdminId: null,
          createdAt: new Date('2026-06-30T00:00:00.000Z'),
          updatedAt: new Date('2026-06-30T00:00:00.000Z'),
          isActiveNow: override.isActiveNow ?? true,
        })),
      }),
    };
    const rbacService = {
      getUserPermissions: jest.fn().mockResolvedValue(overrides?.permissions ?? []),
    };

    return new FeatureControlService(
      prisma as never,
      tenantBillingResolver as never,
      billingEntitlementsService as never,
      rbacService as never,
    );
  };

  it('returns essential for mandatory core features', async () => {
    const service = makeService();

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'catalog_core',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: true,
      reason: 'essential',
      source: 'feature_catalog',
    });
  });

  it('returns unknown_feature for unmapped keys', async () => {
    const service = makeService();

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'not_real_feature',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'unknown_feature',
    });
  });

  it('returns plan_not_allowed when the module is not included in the plan', async () => {
    const service = makeService({
      includedModules: [],
      permissions: ['finance.read'],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'finance_advanced',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'plan_not_allowed',
      source: 'billing_v2',
    });
  });

  it('returns tenant_disabled when there is an active disabled override', async () => {
    const service = makeService({
      includedModules: ['campaigns'],
      permissions: ['crm.read'],
      flags: { canUseCampaigns: true },
      featureOverrides: [{ featureKey: 'campaigns', enabled: false }],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'campaigns',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'tenant_disabled',
      source: 'manual_override',
    });
  });

  it('returns tenant_enabled_override when an active override enables the feature', async () => {
    const service = makeService({
      includedModules: [],
      permissions: ['crm.read'],
      flags: { canUseCampaigns: false },
      featureOverrides: [{ featureKey: 'campaigns', enabled: true }],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'campaigns',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: true,
      reason: 'tenant_enabled_override',
      source: 'manual_override',
    });
  });

  it('returns missing_permission when the user lacks the required RBAC permission', async () => {
    const service = makeService({
      includedModules: ['finance'],
      permissions: [],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'finance_advanced',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'missing_permission',
      source: 'rbac',
    });
  });

  it('returns env_disabled when the env fallback explicitly disables the feature', async () => {
    process.env.VITE_FEATURE_CRM_ADVANCED = 'false';

    const service = makeService({
      includedModules: ['crm'],
      permissions: ['crm.read'],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'crm_enterprise',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'env_disabled',
      source: 'VITE_FEATURE_CRM_ADVANCED',
    });
  });
});
