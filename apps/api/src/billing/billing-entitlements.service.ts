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
    source: 'blocked' | 'free_quota' | 'trial' | 'paid_included' | 'addon';
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
};

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
    const commercialStatus: TenantCommercialStatus = isTrialPro
      ? 'trial_pro'
      : isPaid
        ? (hasActiveAddons ? 'paid_with_addons' : 'paid')
        : (hasActiveAddons ? 'free_with_addons' : 'free_controlled');

    const aiAddonActive = activeAddons.some((addon) => addon.addonKey === AI_ADDON_KEY && addon.status !== 'canceled');
    const monthlyLimit = this.resolveAiMonthlyLimit({
      settings,
      isTrialPro,
      isPaid,
      aiAddonActive,
    });
    const usedThisMonth = monthlyLimit > 0 ? await this.countAiMessagesThisMonth(tenantId, periodStart, periodEnd) : 0;
    const remainingThisMonth = Math.max(0, monthlyLimit - usedThisMonth);
    const aiSource = !monthlyLimit
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
        canUseAiAgent: monthlyLimit > 0 && remainingThisMonth > 0,
        canUseIfoodIntegration: isTrialPro ? settings.trialIncludesIfood : settings.countMarketplaceIfoodOrders,
        canUseAdvancedReports: isTrialPro ? settings.trialIncludesAdvancedReports : isPaid,
        canUseCampaigns: isTrialPro ? settings.trialIncludesAdvancedReports : isPaid,
        canUseCustomDomain: isTrialPro || isPaid,
        canUsePrioritySupport: isTrialPro || isPaid,
      },
      channelsIncludedInBilling: usagePreview.includedChannels,
      settings,
      usagePreview,
      trialAvailable: settings.trialProEnabled && !isTrialPro,
    };
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
  }): number {
    if (input.aiAddonActive) return input.settings.aiHardLimitMonthlyMessages;
    if (input.isTrialPro && input.settings.trialIncludesAi) return input.settings.aiHardLimitMonthlyMessages;
    if (input.isPaid && input.settings.aiIncludedForPaidTenants) return input.settings.aiIncludedMonthlyMessages;
    return input.settings.aiFreeTrialMessages;
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
