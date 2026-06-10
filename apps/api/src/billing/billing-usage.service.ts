import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  BillingRevenueTier,
  BillingSettings,
  BillingUsageSnapshot,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { BillingSettingsService } from './billing-settings.service';
import { BillingRatingService } from './billing-rating.service';

const ZERO = new Prisma.Decimal(0);

export type BillingUsageRatingPreview = {
  planId: string;
  selectedTier: BillingRevenueTier | null;
  currentMonthlyPrice: Prisma.Decimal;
  nextTier: BillingRevenueTier | null;
  revenueUntilNextTier: Prisma.Decimal | null;
  currency: string;
};

export type BillingUsagePreview = {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  includedChannels: string[];
  includedStatuses: OrderStatus[];
  ordersCount: number;
  excludedOrdersCount: number;
  grossOrdersAmount: Prisma.Decimal;
  itemsSubtotalAmount: Prisma.Decimal;
  discountsAmount: Prisma.Decimal;
  deliveryFeeAmount: Prisma.Decimal;
  serviceFeeAmount: Prisma.Decimal;
  billableAmount: Prisma.Decimal;
  calculatedAt: Date;
  rating?: BillingUsageRatingPreview;
};

@Injectable()
export class BillingUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingSettingsService: BillingSettingsService,
    private readonly billingRatingService: BillingRatingService,
  ) {}

  async getBillableRevenuePreview(input: {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date;
    settings?: BillingSettings;
    planId?: string;
  }): Promise<BillingUsagePreview> {
    this.assertValidPreviewInput(input.tenantId, input.periodStart, input.periodEnd);

    const settings = input.settings ?? await this.billingSettingsService.ensureDefaultSettings();
    const includedChannels = this.resolveIncludedChannels(settings);
    const includedStatuses = this.resolveIncludedStatuses(settings);
    const includedWhere = this.buildOrderWhereForBilling({
      tenantId: input.tenantId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      includedChannels,
      includedStatuses,
    });

    const periodWhere: Prisma.OrderWhereInput = {
      tenantId: input.tenantId,
      createdAt: {
        gte: input.periodStart,
        lt: input.periodEnd,
      },
    };

    const [aggregate, totalOrdersInPeriod] = await Promise.all([
      this.prisma.order.aggregate({
        where: includedWhere,
        _count: { _all: true },
        _sum: {
          total: true,
          itemsSubtotal: true,
          discountTotal: true,
          deliveryFee: true,
          serviceFee: true,
        },
      }),
      this.prisma.order.count({ where: periodWhere }),
    ]);

    const ordersCount = aggregate._count._all;
    const grossOrdersAmount = this.decimalOrZero(aggregate._sum.total);
    const itemsSubtotalAmount = this.decimalOrZero(aggregate._sum.itemsSubtotal);
    const discountsAmount = this.decimalOrZero(aggregate._sum.discountTotal);
    const deliveryFeeAmount = this.decimalOrZero(aggregate._sum.deliveryFee);
    const serviceFeeAmount = this.decimalOrZero(aggregate._sum.serviceFee);
    const billableAmount = this.calculateBillableAmount({
      itemsSubtotalAmount,
      discountsAmount,
      deliveryFeeAmount,
      serviceFeeAmount,
      settings,
    });

    const preview: BillingUsagePreview = {
      tenantId: input.tenantId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      includedChannels,
      includedStatuses,
      ordersCount,
      excludedOrdersCount: Math.max(0, totalOrdersInPeriod - ordersCount),
      grossOrdersAmount,
      itemsSubtotalAmount,
      discountsAmount,
      deliveryFeeAmount,
      serviceFeeAmount,
      billableAmount,
      calculatedAt: new Date(),
    };

    if (!input.planId) {
      return preview;
    }

    return {
      ...preview,
      rating: await this.buildRatingPreview(input.planId, billableAmount),
    };
  }

  async createUsageSnapshot(input: {
    tenantId: string;
    cycleId?: string;
    periodStart: Date;
    periodEnd: Date;
    planId?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<BillingUsageSnapshot> {
    return this.getOrCreateUsageSnapshot(input);
  }

  async getOrCreateUsageSnapshot(input: {
    tenantId: string;
    cycleId?: string;
    periodStart: Date;
    periodEnd: Date;
    planId?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<BillingUsageSnapshot> {
    const preview = await this.getBillableRevenuePreview({
      tenantId: input.tenantId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      planId: input.planId,
    });

    const client = input.tx ?? this.prisma;
    const existing = await client.billingUsageSnapshot.findFirst({
      where: {
        tenantId: input.tenantId,
        cycleId: input.cycleId ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    });

    const data = {
      sourceChannel: preview.includedChannels.join(','),
      ordersCount: preview.ordersCount,
      grossOrdersAmount: preview.grossOrdersAmount,
      discountsAmount: preview.discountsAmount,
      deliveryFeeAmount: preview.deliveryFeeAmount,
      serviceFeeAmount: preview.serviceFeeAmount,
      billableAmount: preview.billableAmount,
    };

    if (existing) {
      if (input.cycleId) {
        const cycle = await client.billingCycleRecord.findUnique({
          where: { id: input.cycleId },
          select: { status: true },
        });
        if (cycle && cycle.status !== 'open') {
          return existing;
        }
      }

      return client.billingUsageSnapshot.update({
        where: { id: existing.id },
        data,
      });
    }

    return client.billingUsageSnapshot.create({
      data: {
        tenantId: preview.tenantId,
        cycleId: input.cycleId,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        ...data,
      },
    });
  }

  private resolveIncludedChannels(settings: BillingSettings): string[] {
    const channels: string[] = [];

    if (settings.countStorefrontOrders) channels.push('storefront');
    if (settings.countPosOrders) channels.push('pos');
    if (settings.countWhatsappAiOrders) channels.push('whatsapp_ai');
    if (settings.countManualOrders) channels.push('manual');

    return channels;
  }

  private resolveIncludedStatuses(settings: BillingSettings): OrderStatus[] {
    const statuses: OrderStatus[] = [];

    if (settings.countConfirmedOrders) statuses.push(OrderStatus.confirmed);
    if (settings.countCompletedOrders) statuses.push(OrderStatus.completed);

    return settings.excludeCancelledOrders
      ? statuses.filter((status) => status !== OrderStatus.cancelled)
      : statuses;
  }

  private buildOrderWhereForBilling(input: {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date;
    includedChannels: string[];
    includedStatuses: OrderStatus[];
  }): Prisma.OrderWhereInput {
    return {
      tenantId: input.tenantId,
      createdAt: {
        gte: input.periodStart,
        lt: input.periodEnd,
      },
      sourceChannel: { in: input.includedChannels },
      status: { in: input.includedStatuses },
    };
  }

  private calculateBillableAmount(input: {
    itemsSubtotalAmount: Prisma.Decimal;
    discountsAmount: Prisma.Decimal;
    deliveryFeeAmount: Prisma.Decimal;
    serviceFeeAmount: Prisma.Decimal;
    settings: BillingSettings;
  }): Prisma.Decimal {
    let amount = input.itemsSubtotalAmount;

    if (input.settings.discountReducesRevenue) {
      amount = amount.minus(input.discountsAmount);
    }

    if (input.settings.includeDeliveryFeeByDefault) {
      amount = amount.plus(input.deliveryFeeAmount);
    }

    if (input.settings.includeServiceFeeByDefault) {
      amount = amount.plus(input.serviceFeeAmount);
    }

    return amount.lt(ZERO) ? ZERO : amount;
  }

  private async buildRatingPreview(
    planId: string,
    billableAmount: Prisma.Decimal,
  ): Promise<BillingUsageRatingPreview> {
    const plan = await this.prisma.billingPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Billing plan não encontrado.');
    }

    const [selectedTier, currentMonthlyPrice, tiers] = await Promise.all([
      this.billingRatingService.selectRevenueTier(planId, billableAmount),
      this.billingRatingService.calculateBaseAmountFromTier(planId, billableAmount),
      this.prisma.billingRevenueTier.findMany({
        where: { planId },
        orderBy: [{ sortOrder: 'asc' }],
      }),
    ]);

    const nextTier = tiers.find((tier) => new Prisma.Decimal(tier.minRevenue).gt(billableAmount)) ?? null;
    const revenueUntilNextTier = nextTier
      ? Prisma.Decimal.max(new Prisma.Decimal(nextTier.minRevenue).minus(billableAmount), ZERO)
      : null;

    return {
      planId,
      selectedTier,
      currentMonthlyPrice,
      nextTier,
      revenueUntilNextTier,
      currency: plan.currency,
    };
  }

  private decimalOrZero(value: Prisma.Decimal | null): Prisma.Decimal {
    return value ?? ZERO;
  }

  private assertValidPreviewInput(tenantId: string, periodStart: Date, periodEnd: Date): void {
    if (!tenantId.trim()) {
      throw new BadRequestException('tenantId é obrigatório.');
    }

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new BadRequestException('periodStart e periodEnd devem ser datas válidas.');
    }

    if (periodStart >= periodEnd) {
      throw new BadRequestException('periodStart deve ser anterior a periodEnd.');
    }
  }
}
