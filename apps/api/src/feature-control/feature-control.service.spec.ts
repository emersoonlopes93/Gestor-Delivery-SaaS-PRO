// @ts-nocheck
/// <reference types="jest" />
/// <reference types="node" />
import { BadRequestException } from '@nestjs/common';
import { FeatureControlService } from './feature-control.service';

type GlobalSettingOverride = {
  featureKey: string;
  status: 'enabled' | 'disabled' | 'beta' | 'internal' | 'coming_soon';
  reason?: string | null;
  updatedBy?: string | null;
  updatedAt?: Date;
};

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
    globalSettings?: GlobalSettingOverride[];
  }) => {
    const featureGlobalSetting = {
      findMany: jest.fn().mockResolvedValue(
        (overrides?.globalSettings ?? []).map((item, index) => ({
          id: `global-${index}`,
          featureKey: item.featureKey,
          status: item.status,
          reason: item.reason ?? null,
          createdAt: new Date('2026-06-30T00:00:00.000Z'),
          updatedAt: item.updatedAt ?? new Date('2026-06-30T00:00:00.000Z'),
          updatedBy: item.updatedBy ?? 'admin-1',
        })),
      ),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(overrides?.moduleAccessRows ?? []),
      featureGlobalSetting,
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      tenant: {
        upsert: jest.fn().mockResolvedValue({ id: 'platform-audit-tenant' }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));

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

    const service = new FeatureControlService(
      prisma as never,
      tenantBillingResolver as never,
      billingEntitlementsService as never,
      rbacService as never,
    );

    return { service, prisma };
  };

  it('returns essential for mandatory core features', async () => {
    const { service } = makeService();

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

  it('uses catalog defaults when no global record exists', async () => {
    const { service } = makeService();

    const catalog = await service.getAdminFeatureCatalog();
    const deliveryRadius = catalog.find((item) => item.featureKey === 'delivery_radius');

    expect(deliveryRadius).toMatchObject({
      featureKey: 'delivery_radius',
      globalStatus: 'enabled',
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('returns unknown_feature for unmapped keys', async () => {
    const { service } = makeService();

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

  it('returns global_disabled when the feature is disabled globally', async () => {
    const { service } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage'],
      globalSettings: [{ featureKey: 'delivery_radius', status: 'disabled' }],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'delivery_radius',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'global_disabled',
      source: 'feature_global_setting',
    });
  });

  it('returns global_beta for enabled beta features after global resolution', async () => {
    const { service } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage'],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'delivery_zones_advanced',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: true,
      reason: 'global_beta',
      source: 'feature_catalog',
    });
  });

  it('returns coming_soon for catalog features not yet released', async () => {
    const { service } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage'],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'delivery_neighborhood',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'coming_soon',
      source: 'feature_catalog',
    });
  });

  it('returns tenant_enabled_override when an active override enables the feature', async () => {
    const { service } = makeService({
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

  it('returns env_disabled when the env fallback explicitly disables the feature', async () => {
    process.env.VITE_FEATURE_CRM_ADVANCED = 'false';

    const { service } = makeService({
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

  it('updates optional feature status and writes audit log', async () => {
    const { service, prisma } = makeService();
    prisma.featureGlobalSetting.findUnique.mockResolvedValue({
      id: 'setting-1',
      featureKey: 'delivery_radius',
      status: 'enabled',
      reason: 'Default',
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedBy: 'admin-0',
    });
    prisma.featureGlobalSetting.upsert.mockResolvedValue({
      id: 'setting-1',
      featureKey: 'delivery_radius',
      status: 'disabled',
      reason: 'Freeze operacional',
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedAt: new Date('2026-06-30T10:00:00.000Z'),
      updatedBy: 'admin-1',
    });

    const result = await service.updateGlobalFeatureStatus({
      featureKey: 'delivery_radius',
      status: 'disabled',
      reason: 'Freeze operacional',
      adminId: 'admin-1',
      ip: '127.0.0.1',
    });

    expect(result.globalStatus).toBe('disabled');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'feature.global_status.update',
        resource: 'feature_control',
        userId: 'admin-1',
      }),
    }));
  });

  it('rejects updates for essential features', async () => {
    const { service } = makeService();

    await expect(service.updateGlobalFeatureStatus({
      featureKey: 'catalog_core',
      status: 'disabled',
      reason: 'Nao deve desligar',
      adminId: 'admin-1',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown features on update', async () => {
    const { service } = makeService();

    await expect(service.updateGlobalFeatureStatus({
      featureKey: 'ghost_feature',
      status: 'enabled',
      reason: 'Invalida',
      adminId: 'admin-1',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
