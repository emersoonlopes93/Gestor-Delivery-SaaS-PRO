import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BillingPlan,
  BillingRevenueTier,
  PaymentProvider,
  Prisma,
  TenantBillingSubscription,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';

export type TenantBillingStateSource = 'billing_v2' | 'legacy_fallback' | 'none';

export type TenantBillingState = {
  hasBillingV2: boolean;
  subscriptionStatus: string | null;
  plan: (BillingPlan & { revenueTiers: BillingRevenueTier[] }) | null;
  trialEndsAt: Date | null;
  allowAllModules: boolean;
  includedModules: string[];
  source: TenantBillingStateSource;
  subscription: TenantBillingSubscription | null;
  legacySubscriptionId: string | null;
  warning: string | null;
};

export type TenantEntitlements = {
  allowAllModules: boolean;
  includedModules: string[];
  source: TenantBillingStateSource;
};

type LegacySubscriptionWithPlan = TenantSubscription & {
  plan: {
    features: Prisma.JsonValue | null;
  };
};

const DEFAULT_BILLING_PLAN_SLUG = 'revenue-growth';

const CORE_MODULES = [
  'catalog',
  'orders',
  'delivery',
  'pos',
  'cash',
  'crm',
  'promotions',
  'inventory',
  'reports',
  'goals',
  'whatsapp',
  'ai_agent',
] as const;

@Injectable()
export class TenantBillingResolverService {
  private readonly logger = new Logger(TenantBillingResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingPaymentGatewayService: BillingPaymentGatewayService,
  ) {}

  async getDefaultBillingPlan(): Promise<BillingPlan & { revenueTiers: BillingRevenueTier[]; modules: { moduleKey: string; isIncluded: boolean }[] }> {
    const plan = await this.prisma.billingPlan.findFirst({
      where: { slug: DEFAULT_BILLING_PLAN_SLUG, isActive: true },
      include: {
        revenueTiers: { orderBy: [{ sortOrder: 'asc' }] },
        modules: true,
      },
    }) ?? await this.prisma.billingPlan.findFirst({
      where: { isActive: true, isPublic: true },
      include: {
        revenueTiers: { orderBy: [{ sortOrder: 'asc' }] },
        modules: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (!plan) {
      throw new NotFoundException('Nenhum plano Billing V2 ativo encontrado.');
    }

    return plan;
  }

  async getTenantBillingState(tenantId: string): Promise<TenantBillingState> {
    const subscription = await this.findLatestBillingV2Subscription(tenantId);
    if (subscription) {
      const includedModules = this.resolveBillingPlanModules(subscription.billingPlan);
      return {
        hasBillingV2: true,
        subscriptionStatus: subscription.status,
        plan: subscription.billingPlan,
        trialEndsAt: subscription.trialEndsAt,
        allowAllModules: subscription.billingPlan.allowAllModules,
        includedModules,
        source: 'billing_v2',
        subscription,
        legacySubscriptionId: subscription.legacyTenantSubscriptionId,
        warning: subscription.requiresPaymentMethod
          ? 'Método de pagamento configurado como obrigatório, mas cobrança automática ainda não está ativa.'
          : null,
      };
    }

    const legacySubscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (legacySubscription) {
      this.logger.warn(`Tenant ${tenantId} usando fallback legado de billing; nenhuma TenantBillingSubscription V2 encontrada.`);
      return {
        hasBillingV2: false,
        subscriptionStatus: legacySubscription.status,
        plan: null,
        trialEndsAt: legacySubscription.trialEndsAt,
        allowAllModules: false,
        includedModules: this.resolveLegacyModules(legacySubscription),
        source: 'legacy_fallback',
        subscription: null,
        legacySubscriptionId: legacySubscription.id,
        warning: 'Tenant ainda usa assinatura legada como fallback temporário.',
      };
    }

    return {
      hasBillingV2: false,
      subscriptionStatus: null,
      plan: null,
      trialEndsAt: null,
      allowAllModules: false,
      includedModules: [],
      source: 'none',
      subscription: null,
      legacySubscriptionId: null,
      warning: 'Tenant sem assinatura Billing V2 e sem fallback legado.',
    };
  }

  async getOrCreateTenantBillingSubscription(tenantId: string, planId?: string): Promise<TenantBillingSubscription> {
    const existing = await this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (existing) return existing;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    const plan = planId
      ? await this.prisma.billingPlan.findUnique({ where: { id: planId }, include: { revenueTiers: true, modules: true } })
      : await this.getDefaultBillingPlan();
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plano Billing V2 ativo não encontrado.');
    }

    const legacySubscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      select: { id: true },
    });

    const now = new Date();
    const trialDays = Math.max(0, plan.trialDays);
    const cycleEnd = new Date(now);
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);
    const trialEndsAt = trialDays > 0 ? this.addDays(now, trialDays) : null;
    const runtimeConfig = this.billingPaymentGatewayService.getRuntimeConfig();
    const provider = runtimeConfig.provider ?? PaymentProvider.manual;

    const subscription = await this.prisma.tenantBillingSubscription.create({
      data: {
        tenantId,
        billingPlanId: plan.id,
        status: trialDays > 0 ? TenantSubscriptionStatus.trialing : TenantSubscriptionStatus.active,
        startedAt: now,
        trialStartedAt: trialDays > 0 ? now : null,
        trialEndsAt,
        currentCycleStartedAt: now,
        currentCycleEndsAt: cycleEnd,
        requiresPaymentMethod: plan.requiresPaymentMethod,
        provider,
        legacyTenantSubscriptionId: legacySubscription?.id ?? null,
      },
    });

    this.logger.log(`TenantBillingSubscription V2 criada para tenant ${tenantId} com plano ${plan.slug}; provider=${provider}; sem gateway.`);
    return subscription;
  }

  async resolveTenantEntitlements(tenantId: string): Promise<TenantEntitlements> {
    const state = await this.getTenantBillingState(tenantId);
    return {
      allowAllModules: state.allowAllModules,
      includedModules: state.includedModules,
      source: state.source,
    };
  }

  private async findLatestBillingV2Subscription(tenantId: string) {
    return this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId },
      include: {
        billingPlan: {
          include: {
            revenueTiers: { orderBy: [{ sortOrder: 'asc' }] },
            modules: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  private resolveBillingPlanModules(plan: BillingPlan & { modules: { moduleKey: string; isIncluded: boolean }[] }): string[] {
    if (plan.allowAllModules) return [...CORE_MODULES];
    return plan.modules.filter((module) => module.isIncluded).map((module) => module.moduleKey);
  }

  private resolveLegacyModules(subscription: LegacySubscriptionWithPlan): string[] {
    const features = subscription.plan.features;
    if (!features || typeof features !== 'object' || Array.isArray(features)) return [];
    return Object.entries(features)
      .filter(([, enabled]) => enabled === true)
      .map(([feature]) => feature);
  }

  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }
}
