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

type TenantOverrideInput = {
  tenantId?: string;
  featureKey: string;
  mode: 'inherit' | 'enabled' | 'disabled';
  reason?: string | null;
  expiresAt?: Date | null;
  updatedBy?: string | null;
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
    legacyFeatureOverrides?: Array<{
      featureKey: string;
      enabled: boolean;
      isActiveNow?: boolean;
      source?: string;
      reason?: string;
    }>;
    tenantOverrides?: TenantOverrideInput[];
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
    const globalRows = (overrides?.globalSettings ?? []).map((item, index) => ({
      id: `global-${index}`,
      featureKey: item.featureKey,
      status: item.status,
      reason: item.reason ?? null,
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedAt: item.updatedAt ?? new Date('2026-06-30T00:00:00.000Z'),
      updatedBy: item.updatedBy ?? 'admin-1',
    }));

    const tenantOverrideRows = (overrides?.tenantOverrides ?? []).map((item, index) => ({
      id: `tenant-override-${index}`,
      tenantId: item.tenantId ?? 'tenant-1',
      featureKey: item.featureKey,
      mode: item.mode,
      reason: item.reason ?? 'Override de teste',
      expiresAt: item.expiresAt ?? null,
      updatedBy: item.updatedBy ?? 'admin-1',
      createdAt: new Date('2026-06-30T00:00:00.000Z'),
      updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    }));

    const featureGlobalSetting = {
      findMany: jest.fn().mockResolvedValue(globalRows),
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(globalRows.find((item) => item.featureKey === where.featureKey) ?? null),
      ),
      upsert: jest.fn(),
    };

    const featureTenantOverride = {
      findMany: jest.fn().mockResolvedValue(tenantOverrideRows),
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          tenantOverrideRows.find(
            (item) =>
              item.tenantId === where.tenantId_featureKey.tenantId &&
              item.featureKey === where.tenantId_featureKey.featureKey,
          ) ?? null,
        ),
      ),
      upsert: jest.fn().mockImplementation(({ where, create, update }) => {
        const current = tenantOverrideRows.find(
          (item) =>
            item.tenantId === where.tenantId_featureKey.tenantId &&
            item.featureKey === where.tenantId_featureKey.featureKey,
        );
        const row = current
          ? { ...current, ...update, updatedAt: new Date('2026-06-30T10:00:00.000Z') }
          : {
              id: `tenant-override-${tenantOverrideRows.length + 1}`,
              createdAt: new Date('2026-06-30T10:00:00.000Z'),
              updatedAt: new Date('2026-06-30T10:00:00.000Z'),
              ...create,
            };
        if (!current) {
          tenantOverrideRows.push(row);
        }
        return Promise.resolve(row);
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(overrides?.moduleAccessRows ?? []),
      featureGlobalSetting,
      featureTenantOverride,
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Tenant Teste', slug: 'tenant-teste' }),
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
        featureOverrides: (overrides?.legacyFeatureOverrides ?? []).map((override, index) => ({
          id: `legacy-override-${index}`,
          featureKey: override.featureKey,
          enabled: override.enabled,
          source: override.source ?? 'manual_override',
          reason: override.reason ?? 'Override legado',
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

  it('rejects unknown features', async () => {
    const { service } = makeService();

    await expect(service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'not_real_feature',
      userId: 'user-1',
    })).rejects.toBeInstanceOf(BadRequestException);
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

  it('returns tenant_disabled when an official tenant override disables the feature', async () => {
    const { service } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage'],
      tenantOverrides: [{ featureKey: 'delivery_radius', mode: 'disabled' }],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'delivery_radius',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'tenant_disabled',
      source: 'tenant_feature_override',
    });
  });

  it('returns tenant_enabled_override when an official tenant override enables the feature', async () => {
    const { service } = makeService({
      includedModules: [],
      permissions: ['crm.read'],
      tenantOverrides: [{ featureKey: 'crm_enterprise', mode: 'enabled' }],
    });

    const result = await service.resolveTenantFeature({
      tenantId: 'tenant-1',
      featureKey: 'crm_enterprise',
      userId: 'user-1',
    });

    expect(result).toEqual({
      enabled: true,
      reason: 'tenant_enabled_override',
      source: 'tenant_feature_override',
    });
  });

  it('keeps global disabled above tenant enabled override', async () => {
    const { service } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage'],
      globalSettings: [{ featureKey: 'delivery_radius', status: 'disabled' }],
      tenantOverrides: [{ featureKey: 'delivery_radius', mode: 'enabled' }],
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

  it('updates tenant override and writes audit log', async () => {
    const { service, prisma } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage'],
    });

    const result = await service.updateTenantFeatureOverride({
      tenantId: 'tenant-1',
      featureKey: 'delivery_radius',
      mode: 'disabled',
      reason: 'Tenant fora do escopo',
      adminId: 'admin-1',
      ip: '127.0.0.1',
    });

    expect(result.tenantOverride).toBe('disabled');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'feature.tenant_override.update',
        resource: 'feature_control',
        userId: 'admin-1',
      }),
    }));
  });

  it('rejects tenant override for essential features', async () => {
    const { service } = makeService();

    await expect(service.updateTenantFeatureOverride({
      tenantId: 'tenant-1',
      featureKey: 'catalog_core',
      mode: 'disabled',
      reason: 'Nao permitido',
      adminId: 'admin-1',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns preview diff and does not re-enable coming soon features', async () => {
    const { service } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage', 'catalog.read'],
    });

    const preview = await service.previewPreset({
      presetKey: 'full_platform',
      scope: 'tenant',
      tenantId: 'tenant-1',
    });

    const neighborhoodChange = preview.changes.find((item) => item.featureKey === 'delivery_neighborhood');

    expect(preview.scope).toBe('tenant');
    expect(preview.summary.total).toBeGreaterThan(0);
    expect(neighborhoodChange).toBeDefined();
    expect(neighborhoodChange?.effectiveEnabledAfter).toBe(false);
    expect(neighborhoodChange?.action).not.toBe('enable');
  });

  it('applies tenant preset and writes audit log', async () => {
    const { service, prisma } = makeService({
      includedModules: ['delivery'],
      permissions: ['delivery.manage', 'catalog.read'],
    });

    const result = await service.applyPresetTenant({
      presetKey: 'mvp_pizzaria',
      tenantId: 'tenant-1',
      reason: 'Preset MVP inicial',
      confirmation: 'APLICAR TENANT',
      adminId: 'admin-1',
      ip: '127.0.0.1',
    });

    expect(result.scope).toBe('tenant');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'feature.preset.apply_tenant',
        resource: 'feature_control',
        userId: 'admin-1',
      }),
    }));
  });
});
