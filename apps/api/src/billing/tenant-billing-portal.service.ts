import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingCycleRecord,
  BillingGatewayMode,
  BillingRevenueTier,
  BillingUsageSnapshot,
  Invoice,
  InvoiceItem,
  PaymentAttempt,
  PaymentProvider,
  Prisma,
  TenantBillingSubscription,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingPaymentGatewayService, BillingPaymentRuntimeConfig } from './billing-payment-gateway.service';
import { BillingUsagePreview, BillingUsageService } from './billing-usage.service';
import { TenantBillingResolverService, TenantBillingStateSource } from './tenant-billing-resolver.service';
import { BillingEntitlementsService, BillingPartnerLink, TenantFeatureEntitlements } from './billing-entitlements.service';

type BillingPlanForPortal = Prisma.BillingPlanGetPayload<{
  include: {
    revenueTiers: true;
  };
}>;

export type TenantBillingPortalPaymentModeInfo = BillingPaymentRuntimeConfig & {
  automaticBillingActive: false;
  message: string;
};

export type TenantBillingInvoiceSummary = Pick<
  Invoice,
  'id' | 'number' | 'status' | 'total' | 'dueDate' | 'paidAt' | 'provider' | 'providerPaymentUrl' | 'createdAt'
>;

export type TenantBillingCycle = BillingCycleRecord & {
  selectedTier: BillingRevenueTier | null;
};

export type TenantBillingInvoiceDetails = {
  invoice: Invoice;
  items: InvoiceItem[];
  cycle: TenantBillingCycle | null;
  snapshot: BillingUsageSnapshot | null;
  paymentAttempts: PaymentAttempt[];
  providerPaymentUrl: string | null;
};

export type TenantBillingOverview = {
  subscription: TenantBillingSubscription | null;
  plan: BillingPlanForPortal | null;
  currentCycle: TenantBillingCycle | null;
  usagePreview: BillingUsagePreview | null;
  selectedTier: BillingRevenueTier | null;
  nextTier: BillingRevenueTier | null;
  estimatedMonthlyPrice: Prisma.Decimal | null;
  revenueUntilNextTier: Prisma.Decimal | null;
  latestInvoice: TenantBillingInvoiceSummary | null;
  paymentModeInfo: TenantBillingPortalPaymentModeInfo;
  source: TenantBillingStateSource;
  warning: string | null;
  entitlements: TenantFeatureEntitlements;
  partners: BillingPartnerLink[];
};

@Injectable()
export class TenantBillingPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly billingUsageService: BillingUsageService,
    private readonly billingPaymentGatewayService: BillingPaymentGatewayService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
  ) {}

  async getMyBillingOverview(tenantId: string): Promise<TenantBillingOverview> {
    const state = await this.tenantBillingResolver.getTenantBillingState(tenantId);
    const paymentModeInfo = this.buildPaymentModeInfo();
    const entitlements = await this.billingEntitlementsService.resolveTenantEntitlements(tenantId);
    const partners = this.billingEntitlementsService.getPartnerLinks(entitlements.settings);

    if (!state.subscription || !state.plan) {
      return {
        subscription: null,
        plan: null,
        currentCycle: null,
        usagePreview: null,
        selectedTier: null,
        nextTier: null,
        estimatedMonthlyPrice: null,
        revenueUntilNextTier: null,
        latestInvoice: await this.findLatestInvoice(tenantId),
        paymentModeInfo,
        source: state.source,
        warning: this.resolvePortalWarning(state.source, state.subscription?.requiresPaymentMethod ?? false),
        entitlements,
        partners,
      };
    }

    const currentCycle = await this.findCurrentCycle(tenantId, state.subscription.id);
    const { periodStart, periodEnd } = this.resolvePreviewPeriod(state.subscription, currentCycle);
    const usagePreview = await this.billingUsageService.getBillableRevenuePreview({
      tenantId,
      periodStart,
      periodEnd,
      planId: state.plan.id,
    });

    return {
      subscription: state.subscription,
      plan: state.plan,
      currentCycle,
      usagePreview,
      selectedTier: usagePreview.rating?.selectedTier ?? currentCycle?.selectedTier ?? null,
      nextTier: usagePreview.rating?.nextTier ?? null,
      estimatedMonthlyPrice: usagePreview.rating?.currentMonthlyPrice ?? null,
      revenueUntilNextTier: usagePreview.rating?.revenueUntilNextTier ?? null,
      latestInvoice: await this.findLatestInvoice(tenantId, state.subscription.id),
      paymentModeInfo,
      source: state.source,
      warning: this.resolvePortalWarning(state.source, state.subscription.requiresPaymentMethod),
      entitlements,
      partners,
    };
  }

  async listMyInvoices(tenantId: string): Promise<TenantBillingInvoiceSummary[]> {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        dueDate: true,
        paidAt: true,
        provider: true,
        providerPaymentUrl: true,
        createdAt: true,
      },
    });
  }

  async getMyInvoiceDetails(tenantId: string, invoiceId: string): Promise<TenantBillingInvoiceDetails> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items: { orderBy: [{ createdAt: 'asc' }] },
        cycle: {
          include: {
            selectedTier: true,
            usageSnapshots: {
              where: { tenantId },
              orderBy: [{ createdAt: 'desc' }],
              take: 1,
            },
          },
        },
        paymentAttempts: {
          where: { tenantId },
          orderBy: [{ attemptedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura não encontrada para este tenant.');
    }

    const cycle = invoice.cycle
      ? {
          ...invoice.cycle,
          usageSnapshots: undefined,
        }
      : null;

    return {
      invoice,
      items: invoice.items,
      cycle,
      snapshot: invoice.cycle?.usageSnapshots[0] ?? null,
      paymentAttempts: invoice.paymentAttempts,
      providerPaymentUrl: invoice.providerPaymentUrl,
    };
  }

  private async findCurrentCycle(
    tenantId: string,
    subscriptionId: string,
  ): Promise<TenantBillingCycle | null> {
    return this.prisma.billingCycleRecord.findFirst({
      where: { tenantId, subscriptionId },
      include: { selectedTier: true },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async findLatestInvoice(
    tenantId: string,
    subscriptionId?: string,
  ): Promise<TenantBillingInvoiceSummary | null> {
    return this.prisma.invoice.findFirst({
      where: {
        tenantId,
        ...(subscriptionId ? { subscriptionId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        dueDate: true,
        paidAt: true,
        provider: true,
        providerPaymentUrl: true,
        createdAt: true,
      },
    });
  }

  private resolvePreviewPeriod(
    subscription: TenantBillingSubscription,
    currentCycle: BillingCycleRecord | null,
  ): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    return {
      periodStart: subscription.currentCycleStartedAt
        ?? currentCycle?.startedAt
        ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      periodEnd: subscription.currentCycleEndsAt
        ?? currentCycle?.endedAt
        ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }

  private buildPaymentModeInfo(): TenantBillingPortalPaymentModeInfo {
    const runtime = this.billingPaymentGatewayService.getRuntimeConfig();
    return {
      ...runtime,
      paymentsEnabled: false,
      mode: this.resolveDisplayedMode(runtime.mode),
      provider: this.resolveDisplayedProvider(runtime.provider),
      automaticBillingActive: false,
      message: 'Cobrança automática ainda não está ativa. Nenhum gateway será chamado nesta fase.',
    };
  }

  private resolveDisplayedMode(mode: BillingPaymentRuntimeConfig['mode']): BillingGatewayMode | 'disabled' {
    return process.env.BILLING_PAYMENTS_ENABLED === 'true' ? mode : 'disabled';
  }

  private resolveDisplayedProvider(provider: PaymentProvider): PaymentProvider {
    return process.env.BILLING_PAYMENTS_ENABLED === 'true' ? provider : PaymentProvider.manual;
  }

  private resolvePortalWarning(source: TenantBillingStateSource, requiresPaymentMethod: boolean): string | null {
    if (source === 'billing_v2' && requiresPaymentMethod) {
      return 'Método de pagamento configurado como obrigatório, mas cobrança automática ainda não está ativa.';
    }

    if (source === 'none') {
      return 'Tenant sem assinatura Billing V2 e sem fallback legado.';
    }
    return null;
  }
}
