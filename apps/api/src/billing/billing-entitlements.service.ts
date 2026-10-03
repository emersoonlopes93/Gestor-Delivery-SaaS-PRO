/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { BillingSettings, Prisma, TenantBillingSubscription, TenantSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingAddonService, AI_ADDON_KEY, TenantAddonSummary } from './billing-addon.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingUsagePreview, BillingUsageService } from './billing-usage.service';
import { TenantBillingResolverService } from './tenant-billing-resolver.service';

const ZERO = new Prisma.Decimal(0);

export type BillingPartnerLink = {
  key: string;
  title: string;
  description: string;
  ctaLabel: string;
  url: string;
};

export type TenantCommercialStatus =
  | 'free_controlled'
  | 'free_with_addons'
  | 'trial_pro'
  | 'paid'
  | 'paid_with_addons';

export type TenantFeatureEntitlements = {
  commercialStatus: TenantCommercialStatus;
  billableRevenue: Prisma.Decimal;
  estimatedBasePrice: Prisma.Decimal;
  addonsAmount: Prisma.Decimal;
  estimatedTotalPrice: Prisma.Decimal;
  activeAddons: TenantAddonSummary[];
  ai: {
    canUse: boolean;
    source: 'blocked' | 'free_quota' | 'trial' | 'paid_included' | 'addon' | 'manual_override';
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
  settings: BillingSettings;
  usagePreview: BillingUsagePreview;
  trialAvailable: boolean;
  featureOverrides: TenantFeatureOverrideView[];
};

export type TenantFeatureKey =
  | 'ai_agent'
  | 'campaigns'
  | 'ifood_integration'
  | 'advanced_reports'
  | 'custom_domain'
  | 'priority_support';

export type TenantFeatureOverrideView = {
  id: string;
  featureKey: TenantFeatureKey;
  enabled: boolean;
  source: string;
  reason: string;
  expiresAt: Date | null;
  createdByAdminId: string | null;
  updatedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isActiveNow: boolean;
};

const FEATURE_LABELS: Record<TenantFeatureKey, string> = {
  ai_agent: 'IA avançada',
  campaigns: 'Campanhas',
  ifood_integration: 'iFood',
  advanced_reports: 'Relatórios avançados',
  custom_domain: 'Domínio próprio',
  priority_support: 'Suporte prioritário',
};

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as TenantFeatureKey[];

@Injectable()
export class BillingEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingSettingsService: BillingSettingsService,
    private readonly billingUsageService: BillingUsageService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly billingAddonService: BillingAddonService,
  ) {}

  async resolveTenantEntitlements(tenantId: string): Promise<TenantFeatureEntitlements> {
    const settings = await this.billingSettingsService.ensureDefaultSettings();
    const billingState = await this.tenantBillingResolver.getTenantBillingState(tenantId);
    const subscription = billingState.subscription;
    const now = new Date();
    const periodStart = subscription?.currentCycleStartedAt ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = subscription?.currentCycleEndsAt ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const usagePreview = await this.billingUsageService.getBillableRevenuePreview({
      tenantId,
      periodStart,
      periodEnd,
      planId: billingState.plan?.id,
    });
    const activeAddons = await this.billingAddonService.listActiveTenantAddons(tenantId);
    const addonsAmount = activeAddons.reduce((sum, addon) => sum.plus(addon.price), ZERO);
    const estimatedBasePrice = usagePreview.rating?.currentMonthlyPrice ?? ZERO;
    const estimatedTotalPrice = estimatedBasePrice.plus(addonsAmount);
    const isTrialPro = subscription?.status === TenantSubscriptionStatus.trialing && settings.trialProEnabled;
    const isPaid = estimatedBasePrice.gt(ZERO);
    const hasActiveAddons = addonsAmount.gt(ZERO);
    const currentNow = new Date();
    const featureOverrides = await this.listTenantFeatureOverrides(tenantId, currentNow);
    const overrideMap = new Map(featureOverrides.filter((override) => override.isActiveNow).map((override) => [override.featureKey, override]));
    const commercialStatus: TenantCommercialStatus = isTrialPro
      ? 'trial_pro'
      : isPaid
        ? (hasActiveAddons ? 'paid_with_addons' : 'paid')
        : (hasActiveAddons ? 'free_with_addons' : 'free_controlled');

    const aiAddonActive = activeAddons.some((addon) => addon.addonKey === AI_ADDON_KEY && addon.status !== 'canceled');
    const aiOverride = overrideMap.get('ai_agent');
    const campaignOverride = overrideMap.get('campaigns');
    const ifoodOverride = overrideMap.get('ifood_integration');
    const reportsOverride = overrideMap.get('advanced_reports');
    const domainOverride = overrideMap.get('custom_domain');
    const supportOverride = overrideMap.get('priority_support');
    const monthlyLimit = this.resolveAiMonthlyLimit({
      settings,
      isTrialPro,
      isPaid,
      aiAddonActive,
      manualOverride: aiOverride?.enabled ?? null,
    });
    const usedThisMonth = monthlyLimit > 0 ? await this.countAiMessagesThisMonth(tenantId, periodStart, periodEnd) : 0;
    const remainingThisMonth = Math.max(0, monthlyLimit - usedThisMonth);
    const aiSource = aiOverride?.isActiveNow
      ? 'manual_override'
      : !monthlyLimit
      ? 'blocked'
      : aiAddonActive
        ? 'addon'
        : isTrialPro
          ? 'trial'
          : isPaid && settings.aiIncludedForPaidTenants
            ? 'paid_included'
            : 'free_quota';

    return {
      commercialStatus,
      billableRevenue: usagePreview.billableAmount,
      estimatedBasePrice,
      addonsAmount,
      estimatedTotalPrice,
      activeAddons,
      ai: {
        canUse: monthlyLimit > 0 && remainingThisMonth > 0,
        source: aiSource,
        monthlyLimit,
        usedThisMonth,
        remainingThisMonth,
      },
      flags: {
        canUseAiAgent: this.applyFeatureOverride(aiOverride, monthlyLimit > 0 && remainingThisMonth > 0),
        canUseIfoodIntegration: this.applyFeatureOverride(ifoodOverride, isTrialPro ? settings.trialIncludesIfood : settings.countMarketplaceIfoodOrders),
        canUseAdvancedReports: this.applyFeatureOverride(reportsOverride, isTrialPro ? settings.trialIncludesAdvancedReports : isPaid),
        canUseCampaigns: this.applyFeatureOverride(campaignOverride, isTrialPro ? settings.trialIncludesAdvancedReports : isPaid),
        canUseCustomDomain: this.applyFeatureOverride(domainOverride, isTrialPro || isPaid),
        canUsePrioritySupport: this.applyFeatureOverride(supportOverride, isTrialPro || isPaid),
      },
      channelsIncludedInBilling: usagePreview.includedChannels,
      settings,
      usagePreview,
      trialAvailable: settings.trialProEnabled && !isTrialPro,
      featureOverrides,
    };
  }

  async listTenantFeatureOverrides(tenantId: string, now = new Date()): Promise<TenantFeatureOverrideView[]> {
    const rows = await this.prisma.tenantFeatureEntitlementOverride.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      featureKey: this.requireFeatureKey(row.featureKey),
      enabled: row.enabled,
      source: row.source,
      reason: row.reason,
      expiresAt: row.expiresAt,
      createdByAdminId: row.createdByAdminId,
      updatedByAdminId: row.updatedByAdminId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isActiveNow: !row.expiresAt || row.expiresAt > now,
    }));
  }

  async upsertTenantFeatureOverride(input: {
    tenantId: string;
    featureKey: TenantFeatureKey;
    enabled: boolean;
    reason: string;
    expiresAt?: Date | null;
    adminId?: string | null;
  }): Promise<TenantFeatureOverrideView> {
    const override = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tenantFeatureEntitlementOverride.upsert({
        where: {
          tenantId_featureKey: {
            tenantId: input.tenantId,
            featureKey: input.featureKey,
          },
        },
        create: {
          tenantId: input.tenantId,
          featureKey: input.featureKey,
          enabled: input.enabled,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null,
          source: 'manual_override',
          createdByAdminId: input.adminId ?? null,
          updatedByAdminId: input.adminId ?? null,
        },
        update: {
          enabled: input.enabled,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null,
          source: 'manual_override',
          updatedByAdminId: input.adminId ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.adminId ?? null,
          userType: input.adminId ? 'admin' : 'system',
          action: 'admin.tenant_feature_override_upserted',
          resource: 'tenant',
          details: {
            featureKey: input.featureKey,
            enabled: input.enabled,
            reason: input.reason,
            expiresAt: input.expiresAt?.toISOString() ?? null,
            source: 'manual_override',
          },
        },
      });

      return row;
    });

    return {
      id: override.id,
      featureKey: this.requireFeatureKey(override.featureKey),
      enabled: override.enabled,
      source: override.source,
      reason: override.reason,
      expiresAt: override.expiresAt,
      createdByAdminId: override.createdByAdminId,
      updatedByAdminId: override.updatedByAdminId,
      createdAt: override.createdAt,
      updatedAt: override.updatedAt,
      isActiveNow: !override.expiresAt || override.expiresAt > new Date(),
    };
  }

  async deleteTenantFeatureOverride(input: {
    tenantId: string;
    featureKey: TenantFeatureKey;
    adminId?: string | null;
    reason?: string | null;
  }): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.tenantFeatureEntitlementOverride.findUnique({
      where: {
        tenantId_featureKey: {
          tenantId: input.tenantId,
          featureKey: input.featureKey,
        },
      },
    });

    if (!existing) {
      return { deleted: false };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantFeatureEntitlementOverride.delete({
        where: {
          tenantId_featureKey: {
            tenantId: input.tenantId,
            featureKey: input.featureKey,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.adminId ?? null,
          userType: input.adminId ? 'admin' : 'system',
          action: 'admin.tenant_feature_override_deleted',
          resource: 'tenant',
          details: {
            featureKey: input.featureKey,
            reason: input.reason ?? null,
            source: 'manual_override',
          },
        },
      });
    });

    return { deleted: true };
  }

  getPartnerLinks(settings: BillingSettings): BillingPartnerLink[] {
    if (!Array.isArray(settings.partnerLinksJson)) return [];
    return settings.partnerLinksJson
      .filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const link = item as Prisma.JsonObject;
        return {
          key: String(link.key ?? ''),
          title: String(link.title ?? ''),
          description: String(link.description ?? ''),
          ctaLabel: String(link.ctaLabel ?? 'Conhecer parceiro'),
          url: String(link.url ?? ''),
        };
      })
      .filter((item) => item.key && item.title);
  }

  private resolveAiMonthlyLimit(input: {
    settings: BillingSettings;
    isTrialPro: boolean;
    isPaid: boolean;
    aiAddonActive: boolean;
    manualOverride: boolean | null;
  }): number {
    if (input.manualOverride === false) return 0;
    if (input.manualOverride === true) return input.settings.aiHardLimitMonthlyMessages;
    if (input.aiAddonActive) return input.settings.aiHardLimitMonthlyMessages;
    if (input.isTrialPro && input.settings.trialIncludesAi) return input.settings.aiHardLimitMonthlyMessages;
    if (input.isPaid && input.settings.aiIncludedForPaidTenants) return input.settings.aiIncludedMonthlyMessages;
    return input.settings.aiFreeTrialMessages;
  }

  private applyFeatureOverride(override: TenantFeatureOverrideView | undefined, derivedValue: boolean): boolean {
    if (!override?.isActiveNow) return derivedValue;
    return override.enabled;
  }

  private requireFeatureKey(value: string): TenantFeatureKey {
    if ((FEATURE_KEYS as string[]).includes(value)) {
      return value as TenantFeatureKey;
    }
    throw new Error(`Feature key invalida: ${value}`);
  }

  private async countAiMessagesThisMonth(tenantId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    return this.prisma.chatMessage.count({
      where: {
        session: { tenantId },
        direction: 'outbound',
        senderType: 'ai',
        createdAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
    });
  }
}
