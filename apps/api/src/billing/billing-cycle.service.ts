import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingCycleRecord,
  BillingRevenueTier,
  Invoice,
  Prisma,
  TenantBillingSubscription,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingUsagePreview, BillingUsageService } from './billing-usage.service';
import { DraftInvoiceItemPreview, InvoiceService } from './invoice.service';

const ZERO = new Prisma.Decimal(0);

type BillingCycleWithSubscription = BillingCycleRecord & {
  subscription: TenantBillingSubscription;
};

export type MonthlyBillingPeriod = {
  periodStart: Date;
  periodEnd: Date;
};

export type BillingCycleInvoicePreview = {
  cycle: BillingCycleWithSubscription;
  usage: BillingUsagePreview;
  selectedTier: BillingRevenueTier | null;
  baseAmount: Prisma.Decimal;
  addonsAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  currency: string;
  invoiceItems: DraftInvoiceItemPreview[];
};

export type BillingCycleCloseResult = {
  cycle: BillingCycleRecord;
  invoice: Invoice;
  usageSnapshotId: string;
};

export function resolveMonthlyBillingPeriod(now: Date): MonthlyBillingPeriod {
  return {
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)),
  };
}

@Injectable()
export class BillingCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingUsageService: BillingUsageService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async getOrCreateCurrentCycle(input: {
    tenantId: string;
    subscriptionId: string;
    now?: Date;
  }): Promise<BillingCycleRecord> {
    const period = resolveMonthlyBillingPeriod(input.now ?? new Date());
    return this.getOrCreateCycleForPeriod({
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
  }

  async getOrCreateCycleForPeriod(input: {
    tenantId: string;
    subscriptionId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<BillingCycleRecord> {
    this.assertValidPeriod(input.periodStart, input.periodEnd);
    await this.assertSubscriptionBelongsToTenant(input.tenantId, input.subscriptionId);

    const existing = await this.prisma.billingCycleRecord.findFirst({
      where: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        startedAt: input.periodStart,
        endedAt: input.periodEnd,
      },
    });
    if (existing) return existing;

    return this.prisma.billingCycleRecord.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        startedAt: input.periodStart,
        endedAt: input.periodEnd,
        status: 'open',
      },
    });
  }

  async previewCloseCycle(input: {
    tenantId: string;
    cycleId: string;
    planId?: string;
  }): Promise<BillingCycleInvoicePreview> {
    const cycle = await this.getCycleForTenant(input.tenantId, input.cycleId);
    const planId = input.planId ?? cycle.subscription.billingPlanId;
    const periodEnd = this.requireCycleEnd(cycle);

    const usage = await this.billingUsageService.getBillableRevenuePreview({
      tenantId: input.tenantId,
      periodStart: cycle.startedAt,
      periodEnd,
      planId,
    });

    const selectedTier = usage.rating?.selectedTier ?? null;
    const baseAmount = usage.rating?.currentMonthlyPrice ?? ZERO;
    const addonsAmount = ZERO;
    const totalAmount = baseAmount.plus(addonsAmount);
    const currency = usage.rating?.currency ?? cycle.currency;
    const invoiceItems = await this.invoiceService.buildDraftInvoiceItemsPreview({
      planId,
      periodStart: cycle.startedAt,
      periodEnd,
      measuredRevenue: usage.grossOrdersAmount,
      billableRevenue: usage.billableAmount,
      baseAmount,
      selectedTier,
    });

    return {
      cycle,
      usage,
      selectedTier,
      baseAmount,
      addonsAmount,
      totalAmount,
      currency,
      invoiceItems,
    };
  }

  async closeCycle(input: {
    tenantId: string;
    cycleId: string;
    planId?: string;
    closeReason?: string;
  }): Promise<BillingCycleRecord> {
    const preview = await this.previewCloseCycle(input);
    if (preview.cycle.status !== 'open') {
      throw new BadRequestException('Ciclo já foi fechado ou faturado.');
    }

    const periodEnd = this.requireCycleEnd(preview.cycle);

    return this.prisma.$transaction(async (tx) => {
      await this.billingUsageService.getOrCreateUsageSnapshot({
        tenantId: input.tenantId,
        cycleId: input.cycleId,
        periodStart: preview.cycle.startedAt,
        periodEnd,
        planId: input.planId ?? preview.cycle.subscription.billingPlanId,
        tx,
      });

      return tx.billingCycleRecord.update({
        where: { id: input.cycleId },
        data: {
          status: 'closed',
          measuredRevenue: preview.usage.grossOrdersAmount,
          billableRevenue: preview.usage.billableAmount,
          selectedTierId: preview.selectedTier?.id ?? null,
          baseAmount: preview.baseAmount,
          addonsAmount: preview.addonsAmount,
          totalAmount: preview.totalAmount,
          currency: preview.currency,
        },
      });
    });
  }

  async previewCycleInvoice(input: {
    tenantId: string;
    subscriptionId: string;
    cycleId: string;
    planId: string;
  }): Promise<BillingCycleInvoicePreview> {
    await this.assertSubscriptionBelongsToTenant(input.tenantId, input.subscriptionId);
    return this.previewCloseCycle({
      tenantId: input.tenantId,
      cycleId: input.cycleId,
      planId: input.planId,
    });
  }

  async closeCycleAndCreateDraftInvoice(input: {
    tenantId: string;
    subscriptionId: string;
    cycleId: string;
    planId: string;
  }): Promise<BillingCycleCloseResult> {
    await this.assertSubscriptionBelongsToTenant(input.tenantId, input.subscriptionId);
    const preview = await this.previewCloseCycle({
      tenantId: input.tenantId,
      cycleId: input.cycleId,
      planId: input.planId,
    });
    const periodEnd = this.requireCycleEnd(preview.cycle);

    return this.prisma.$transaction(async (tx) => {
      const snapshot = await this.billingUsageService.getOrCreateUsageSnapshot({
        tenantId: input.tenantId,
        cycleId: input.cycleId,
        periodStart: preview.cycle.startedAt,
        periodEnd,
        planId: input.planId,
        tx,
      });

      if (preview.cycle.status === 'open') {
        await tx.billingCycleRecord.update({
          where: { id: input.cycleId },
          data: {
            status: 'closed',
            measuredRevenue: preview.usage.grossOrdersAmount,
            billableRevenue: preview.usage.billableAmount,
            selectedTierId: preview.selectedTier?.id ?? null,
            baseAmount: preview.baseAmount,
            addonsAmount: preview.addonsAmount,
            totalAmount: preview.totalAmount,
            currency: preview.currency,
          },
        });
      }

      if (!['open', 'closed', 'invoiced'].includes(preview.cycle.status)) {
        throw new BadRequestException('Ciclo não pode ser faturado neste status.');
      }

      const invoice = await this.invoiceService.getOrCreateDraftInvoiceForCycle({
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        cycleId: input.cycleId,
        planId: input.planId,
        usageSnapshotId: snapshot.id,
        tx,
      });

      const cycle = await tx.billingCycleRecord.findUnique({
        where: { id: input.cycleId },
      });
      if (!cycle) {
        throw new NotFoundException('Ciclo de billing não encontrado.');
      }

      return {
        cycle,
        invoice,
        usageSnapshotId: snapshot.id,
      };
    });
  }

  async getActiveSubscriptionForTenant(tenantId: string): Promise<TenantBillingSubscription> {
    const subscription = await this.prisma.tenantBillingSubscription.findFirst({
      where: {
        tenantId,
        status: { in: ['trialing', 'active'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException('Tenant não possui assinatura de billing ativa/trialing.');
    }
    return subscription;
  }

  private async getCycleForTenant(tenantId: string, cycleId: string) {
    const cycle = await this.prisma.billingCycleRecord.findFirst({
      where: { id: cycleId, tenantId },
      include: { subscription: true },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo de billing não encontrado.');
    }
    return cycle;
  }

  private async assertSubscriptionBelongsToTenant(
    tenantId: string,
    subscriptionId: string,
  ): Promise<void> {
    const subscription = await this.prisma.tenantBillingSubscription.findFirst({
      where: { id: subscriptionId, tenantId },
    });
    if (!subscription) {
      throw new NotFoundException('Assinatura de billing não encontrada para o tenant.');
    }
  }

  private requireCycleEnd(cycle: { endedAt: Date | null }): Date {
    if (!cycle.endedAt) {
      throw new BadRequestException('Ciclo sem data final não pode ser fechado.');
    }
    return cycle.endedAt;
  }

  private assertValidPeriod(periodStart: Date, periodEnd: Date): void {
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Período de billing inválido.');
    }
    if (periodStart >= periodEnd) {
      throw new BadRequestException('periodStart deve ser anterior a periodEnd.');
    }
  }
}
