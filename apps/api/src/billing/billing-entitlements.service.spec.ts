import { Prisma, TenantSubscriptionStatus } from '@prisma/client';
import { BillingEntitlementsService } from './billing-entitlements.service';

describe('BillingEntitlementsService', () => {
  const settings = {
    trialProEnabled: true,
    trialIncludesAi: true,
    trialIncludesIfood: true,
    trialIncludesAdvancedReports: true,
    trialAutoConvertToBilling: true,
    aiIncludedForPaidTenants: true,
    aiIncludedMonthlyMessages: 200,
    aiFreeTrialMessages: 0,
    aiHardLimitMonthlyMessages: 1000,
    countMarketplaceIfoodOrders: true,
    partnerLinksJson: [],
  };

  const makeService = (overrides?: {
    subscriptionStatus?: TenantSubscriptionStatus;
    basePrice?: number;
    addons?: Array<{ addonKey: string; price: number; status?: string }>;
    aiUsed?: number;
    featureOverrides?: Array<{
      id: string;
      tenantId: string;
      featureKey: string;
      enabled: boolean;
      source?: string;
      reason: string;
      expiresAt?: Date | null;
      createdByAdminId?: string | null;
      updatedByAdminId?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    }>;
  }) => {
    const prisma = {
      chatMessage: {
        count: jest.fn().mockResolvedValue(overrides?.aiUsed ?? 0),
      },
      tenantFeatureEntitlementOverride: {
        findMany: jest.fn().mockResolvedValue(
          (overrides?.featureOverrides ?? []).map((override) => ({
            id: override.id,
            tenantId: override.tenantId,
            featureKey: override.featureKey,
            enabled: override.enabled,
            source: override.source ?? 'manual_override',
            reason: override.reason,
            expiresAt: override.expiresAt ?? null,
            createdByAdminId: override.createdByAdminId ?? null,
            updatedByAdminId: override.updatedByAdminId ?? null,
            createdAt: override.createdAt ?? new Date('2026-06-01T00:00:00.000Z'),
            updatedAt: override.updatedAt ?? new Date('2026-06-01T00:00:00.000Z'),
          })),
        ),
      },
    };
    const billingSettingsService = {
      ensureDefaultSettings: jest.fn().mockResolvedValue(settings),
    };
    const billingUsageService = {
      getBillableRevenuePreview: jest.fn().mockResolvedValue({
        billableAmount: new Prisma.Decimal(2500),
        includedChannels: ['direct_online', 'storefront', 'marketplace_ifood'],
        rating: {
          currentMonthlyPrice: new Prisma.Decimal(overrides?.basePrice ?? 100),
        },
      }),
    };
    const tenantBillingResolver = {
      getTenantBillingState: jest.fn().mockResolvedValue({
        subscription: {
          status: overrides?.subscriptionStatus ?? TenantSubscriptionStatus.active,
          currentCycleStartedAt: new Date('2026-06-01T00:00:00.000Z'),
          currentCycleEndsAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        plan: { id: 'plan-1' },
      }),
    };
    const billingAddonService = {
      listActiveTenantAddons: jest.fn().mockResolvedValue(
        (overrides?.addons ?? []).map((addon, index) => ({
          id: `addon-${index}`,
          addonKey: addon.addonKey,
          status: addon.status ?? 'active',
          price: new Prisma.Decimal(addon.price),
          billingAddon: { name: 'Addon' },
        })),
      ),
    };

    return new BillingEntitlementsService(
      prisma as never,
      billingSettingsService as never,
      billingUsageService as never,
      tenantBillingResolver as never,
      billingAddonService as never,
    );
  };

  it('treats trial pro as AI-enabled with trial quota', async () => {
    const service = makeService({
      subscriptionStatus: TenantSubscriptionStatus.trialing,
      basePrice: 0,
      aiUsed: 25,
    });

    const result = await service.resolveTenantEntitlements('tenant-1');

    expect(result.commercialStatus).toBe('trial_pro');
    expect(result.flags.canUseAiAgent).toBe(true);
    expect(result.ai.source).toBe('trial');
    expect(result.ai.remainingThisMonth).toBe(975);
  });

  it('enables AI via addon for a free tenant', async () => {
    const service = makeService({
      basePrice: 0,
      addons: [{ addonKey: 'ai_agent', price: 70 }],
      aiUsed: 10,
    });

    const result = await service.resolveTenantEntitlements('tenant-1');

    expect(result.commercialStatus).toBe('free_with_addons');
    expect(result.flags.canUseAiAgent).toBe(true);
    expect(result.estimatedTotalPrice).toEqual(new Prisma.Decimal(70));
    expect(result.ai.source).toBe('addon');
  });

  it('keeps AI blocked for a free tenant without addon', async () => {
    const service = makeService({
      basePrice: 0,
      aiUsed: 0,
    });

    const result = await service.resolveTenantEntitlements('tenant-1');

    expect(result.commercialStatus).toBe('free_controlled');
    expect(result.flags.canUseAiAgent).toBe(false);
    expect(result.ai.source).toBe('blocked');
  });

  it('parses partner links from billing settings', async () => {
    const prisma = {
      chatMessage: {
        count: jest.fn().mockResolvedValue(0),
      },
      tenantFeatureEntitlementOverride: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const billingSettingsService = {
      ensureDefaultSettings: jest.fn().mockResolvedValue({
        ...settings,
        partnerLinksJson: [
          {
            key: 'marketing',
            title: 'Marketing',
            description: 'Parceiro comercial',
            ctaLabel: 'Conhecer parceiro',
            url: 'https://example.com/marketing',
          },
        ],
      }),
    };
    const billingUsageService = {
      getBillableRevenuePreview: jest.fn().mockResolvedValue({
        billableAmount: new Prisma.Decimal(0),
        includedChannels: ['direct_online'],
        rating: {
          currentMonthlyPrice: new Prisma.Decimal(0),
        },
      }),
    };
    const tenantBillingResolver = {
      getTenantBillingState: jest.fn().mockResolvedValue({
        subscription: null,
        plan: null,
      }),
    };
    const billingAddonService = {
      listActiveTenantAddons: jest.fn().mockResolvedValue([]),
    };

    const service = new BillingEntitlementsService(
      prisma as never,
      billingSettingsService as never,
      billingUsageService as never,
      tenantBillingResolver as never,
      billingAddonService as never,
    );

    const entitlements = await service.resolveTenantEntitlements('tenant-1');
    const partners = service.getPartnerLinks(entitlements.settings);

    expect(partners).toEqual([
      expect.objectContaining({
        key: 'marketing',
        title: 'Marketing',
        url: 'https://example.com/marketing',
      }),
    ]);
  });

  it('applies manual feature overrides and exposes them in the entitlement payload', async () => {
    const service = makeService({
      basePrice: 0,
      aiUsed: 0,
      featureOverrides: [
        {
          id: 'override-1',
          tenantId: 'tenant-1',
          featureKey: 'campaigns',
          enabled: true,
          reason: 'Liberacao comercial assistida',
          expiresAt: null,
        },
        {
          id: 'override-2',
          tenantId: 'tenant-1',
          featureKey: 'ifood_integration',
          enabled: false,
          reason: 'Bloqueio temporario',
          expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await service.resolveTenantEntitlements('tenant-1');

    expect(result.flags.canUseCampaigns).toBe(true);
    expect(result.flags.canUseIfoodIntegration).toBe(true);
    expect(result.ai.source).toBe('blocked');
    expect(result.featureOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureKey: 'campaigns',
          enabled: true,
          isActiveNow: true,
        }),
        expect.objectContaining({
          featureKey: 'ifood_integration',
          enabled: false,
          isActiveNow: false,
        }),
      ]),
    );
  });
});
