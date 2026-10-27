/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BillingPlan,
  BillingRevenueTier,
  PaymentProvider,
  TenantBillingSubscription,
  TenantStatus,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';

export type TenantBillingStateSource = 'billing_v2' | 'none';

export type TenantBillingState = {
  hasBillingV2: boolean;
  subscriptionStatus: string | null;
  plan: (BillingPlan & { revenueTiers: BillingRevenueTier[] }) | null;
  trialEndsAt: Date | null;
  allowAllModules: boolean;
  includedModules: string[];
  source: TenantBillingStateSource;
  subscription: TenantBillingSubscription | null;
  warning: string | null;
};

export type TenantEntitlements = {
  allowAllModules: boolean;
  includedModules: string[];
  source: TenantBillingStateSource;
};

export type CommercialSignupState = 'legacy' | 'contract_required' | 'payment_pending' | 'eligible';

export type CommercialReentryResolution = {
  state: CommercialSignupState;
  nextStep: '/billing/contract' | '/billing' | '/onboarding' | '/dashboard';
};



const DEFAULT_BILLING_PLAN_SLUG = 'revenue-growth';
export const COMMERCIAL_OFFER_TERMS_VERSION = 'commercial-offer-v1';

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

  async listPublicCommercialPlans() {
    const plans = await this.prisma.billingPlan.findMany({
      where: { isActive: true, isPublic: true, type: 'revenue_tiered' },
      include: {
        revenueTiers: { orderBy: [{ sortOrder: 'asc' }] },
        modules: { where: { isIncluded: true }, select: { moduleKey: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      type: plan.type,
      cycleInterval: plan.cycleInterval,
      currency: plan.currency,
      trialDays: plan.trialDays,
      requiresPaymentMethod: plan.requiresPaymentMethod,
      includedModules: plan.modules.map((module) => module.moduleKey),
      revenueTiers: plan.revenueTiers.map((tier) => ({
        id: tier.id,
        minRevenue: tier.minRevenue.toString(),
        maxRevenue: tier.maxRevenue?.toString() ?? null,
        price: tier.price.toString(),
        label: tier.label,
        sortOrder: tier.sortOrder,
      })),
    }));
  }

  async subscribeToPublicCommercialPlan(input: {
    tenantId: string;
    actorId: string;
    planId: string;
    termsVersion: string;
  }) {
    if (input.termsVersion !== COMMERCIAL_OFFER_TERMS_VERSION) {
      throw new BadRequestException('A versão apresentada da oferta comercial não é mais válida. Atualize a página e confira novamente.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Serializes self-service retries for this tenant without changing global
      // billing behaviour or relying on a client-provided idempotency key.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}))`;

      const existing = await tx.tenantBillingSubscription.findFirst({
        where: { tenantId: input.tenantId },
        orderBy: [{ createdAt: 'desc' }],
      });
      if (existing) {
        if (existing.billingPlanId !== input.planId) {
          throw new ConflictException('Este tenant já possui uma assinatura. A troca de plano deve ser feita no portal de faturamento autorizado.');
        }
        return { subscription: existing, created: false };
      }

      const now = new Date();
      const [tenant, plan, billingRule] = await Promise.all([
        tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } }),
        tx.billingPlan.findFirst({
          where: { id: input.planId, isActive: true, isPublic: true, type: 'revenue_tiered' },
          include: { revenueTiers: { orderBy: [{ sortOrder: 'asc' }] } },
        }),
        tx.billingRuleVersion.findFirst({
          where: {
            isActive: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
          orderBy: [{ effectiveFrom: 'desc' }],
          select: { id: true, version: true, name: true },
        }),
      ]);

      if (!tenant) throw new NotFoundException('Tenant não encontrado.');
      if (!plan) throw new NotFoundException('O plano selecionado não está disponível para contratação.');
      if (!billingRule) {
        throw new ConflictException('A regra de faturamento desta oferta não está disponível para contratação.');
      }

      const trialDays = Math.max(0, plan.trialDays);
      const canStartTrial = trialDays > 0 && !plan.requiresPaymentMethod;
      const cycleEnd = new Date(now);
      cycleEnd.setMonth(cycleEnd.getMonth() + 1);
      const trialEndsAt = canStartTrial ? this.addDays(now, trialDays) : null;
      const status = plan.requiresPaymentMethod
        ? TenantSubscriptionStatus.past_due
        : canStartTrial ? TenantSubscriptionStatus.trialing : TenantSubscriptionStatus.active;

      const subscription = await tx.tenantBillingSubscription.create({
        data: {
          tenantId: input.tenantId,
          billingPlanId: plan.id,
          status,
          startedAt: now,
          trialStartedAt: canStartTrial ? now : null,
          trialEndsAt,
          currentCycleStartedAt: now,
          currentCycleEndsAt: cycleEnd,
          requiresPaymentMethod: plan.requiresPaymentMethod,
          provider: PaymentProvider.manual,
        },
      });

      await tx.subscriptionStatusHistory.create({
        data: {
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          previousStatus: null,
          nextStatus: status,
          reason: 'commercial_offer_accepted',
          source: 'commercial_self_service',
          actorType: 'tenant_user',
          actorId: input.actorId,
          metadata: {
            termsVersion: input.termsVersion,
            acceptedAt: now.toISOString(),
            plan: {
              id: plan.id,
              slug: plan.slug,
              name: plan.name,
              type: plan.type,
              cycleInterval: plan.cycleInterval,
              currency: plan.currency,
              trialDays: plan.trialDays,
              requiresPaymentMethod: plan.requiresPaymentMethod,
            },
            revenueTiers: plan.revenueTiers.map((tier) => ({
              id: tier.id,
              minRevenue: tier.minRevenue.toString(),
              maxRevenue: tier.maxRevenue?.toString() ?? null,
              price: tier.price.toString(),
              label: tier.label,
              sortOrder: tier.sortOrder,
            })),
            billingRuleVersion: billingRule,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorId,
          userType: 'tenant_user',
          action: 'billing.commercial_offer_accepted',
          resource: 'tenant_billing_subscription',
          details: { subscriptionId: subscription.id, billingPlanId: plan.id, termsVersion: input.termsVersion },
        },
      });

      return { subscription, created: true };
    });

    return {
      subscriptionId: result.subscription.id,
      status: result.subscription.status,
      created: result.created,
      requiresPaymentMethod: result.subscription.requiresPaymentMethod,
      canProceedToOnboarding: result.subscription.status === TenantSubscriptionStatus.trialing
        || result.subscription.status === TenantSubscriptionStatus.active,
    };
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
        warning: subscription.requiresPaymentMethod
          ? 'Método de pagamento configurado como obrigatório, mas cobrança automática ainda não está ativa.'
          : null,
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
      warning: 'Tenant sem assinatura Billing V2 ativa.',
    };
  }

  /**
   * Resolves the next authenticated screen for the opt-in Commercial V1 signup
   * flow. This deliberately does not alter billing entitlements or legacy
   * tenants: the nullable tenant marker is written only by that public flow.
   */
  async resolveCommercialReentry(
    tenantId: string,
    commercialSignupStartedAt: Date | null,
    onboardingCompletedAt: Date | null,
  ): Promise<CommercialReentryResolution> {
    const normalNextStep = onboardingCompletedAt ? '/dashboard' : '/onboarding';
    if (!commercialSignupStartedAt) {
      return { state: 'legacy', nextStep: normalNextStep };
    }

    const billingState = await this.getTenantBillingState(tenantId);
    const subscription = billingState.subscription;
    if (!subscription) {
      return { state: 'contract_required', nextStep: '/billing/contract' };
    }

    const trialIsCurrent = subscription.status === TenantSubscriptionStatus.trialing
      && (!subscription.trialEndsAt || subscription.trialEndsAt >= new Date());
    if (subscription.status === TenantSubscriptionStatus.active || trialIsCurrent) {
      return { state: 'eligible', nextStep: normalNextStep };
    }

    return { state: 'payment_pending', nextStep: '/billing' };
  }

  async reconcileTenantBillingStatus(tenantId: string, now = new Date()): Promise<TenantBillingState> {
    const subscription = await this.findLatestBillingV2Subscription(tenantId);
    if (!subscription) {
      return this.getTenantBillingState(tenantId);
    }

    const next = this.resolveNextStatus(subscription, now);
    if (!next) {
      return this.getTenantBillingState(tenantId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantBillingSubscription.update({
        where: { id: subscription.id },
        data: {
          status: next.status,
          gracePeriodEndsAt: next.gracePeriodEndsAt ?? subscription.gracePeriodEndsAt,
          suspendedAt: next.status === TenantSubscriptionStatus.suspended ? now : subscription.suspendedAt,
        },
      });

      await tx.subscriptionStatusHistory.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          previousStatus: subscription.status,
          nextStatus: next.status,
          reason: next.reason,
          source: 'billing_reconciler',
          actorType: 'system',
          actorId: null,
          metadata: {
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            gracePeriodEndsAt: (next.gracePeriodEndsAt ?? subscription.gracePeriodEndsAt)?.toISOString() ?? null,
            reconciledAt: now.toISOString(),
          },
        },
      });

      if (next.status === TenantSubscriptionStatus.suspended) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { status: TenantStatus.suspended },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: null,
          userType: 'system',
          action: 'billing.subscription_status_reconciled',
          resource: 'billing',
          details: {
            subscriptionId: subscription.id,
            previousStatus: subscription.status,
            nextStatus: next.status,
            reason: next.reason,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            gracePeriodEndsAt: (next.gracePeriodEndsAt ?? subscription.gracePeriodEndsAt)?.toISOString() ?? null,
            reconciledAt: now.toISOString(),
          },
        },
      });
    });

    this.logger.warn({
      message: 'billing_subscription_status_reconciled',
      tenantId,
      subscriptionId: subscription.id,
      previousStatus: subscription.status,
      nextStatus: next.status,
      reason: next.reason,
    });

    return this.getTenantBillingState(tenantId);
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
      },
    });

    await this.prisma.subscriptionStatusHistory.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        previousStatus: null,
        nextStatus: subscription.status,
        reason: 'subscription_created',
        source: 'billing_resolver',
        actorType: 'system',
        actorId: null,
        metadata: {
          billingPlanId: plan.id,
          provider,
          trialEndsAt: trialEndsAt?.toISOString() ?? null,
        },
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

  private resolveNextStatus(
    subscription: TenantBillingSubscription,
    now: Date,
  ): { status: TenantSubscriptionStatus; gracePeriodEndsAt?: Date; reason: string } | null {
    if (subscription.status === TenantSubscriptionStatus.trialing && subscription.trialEndsAt && subscription.trialEndsAt < now) {
      return {
        status: TenantSubscriptionStatus.grace_period,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt ?? this.addDays(now, 7),
        reason: 'trial_expired',
      };
    }

    if (
      (subscription.status === TenantSubscriptionStatus.grace_period || subscription.status === TenantSubscriptionStatus.past_due) &&
      subscription.gracePeriodEndsAt &&
      subscription.gracePeriodEndsAt < now
    ) {
      return {
        status: TenantSubscriptionStatus.suspended,
        reason: 'grace_period_expired',
      };
    }

    return null;
  }

  private resolveBillingPlanModules(plan: BillingPlan & { modules: { moduleKey: string; isIncluded: boolean }[] }): string[] {
    if (plan.allowAllModules) return [...CORE_MODULES];
    return plan.modules.filter((module) => module.isIncluded).map((module) => module.moduleKey);
  }



  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }
}
