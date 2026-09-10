import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FinancialProjectionSource,
  FinancialProjectionValueState,
  MarketplaceProvider,
  OrderPaymentAttemptStatus,
  OrderStatus,
  PaymentMethod,
  PaymentTxStatus,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const FINANCIAL_PROJECTION_VERSION = 1;

type MoneyFact = {
  value: Prisma.Decimal | null;
  state: FinancialProjectionValueState;
  provenance?: string;
};

type NormalizedMarketplacePayload = Prisma.JsonObject;

@Injectable()
export class FinancialProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  async projectOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        paymentTransactions: {
          where: { tenantId, status: PaymentTxStatus.confirmed },
          orderBy: { confirmedAt: 'desc' },
        },
        paymentAttempts: {
          where: { tenantId, status: OrderPaymentAttemptStatus.PAID },
          orderBy: { paidAt: 'desc' },
        },
        cashMovements: {
          where: { tenantId, type: 'sale' },
          orderBy: { createdAt: 'desc' },
        },
        marketplaceOrders: {
          where: { tenantId },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            provider: true,
            normalizedPayload: true,
          },
        },
        stockMovements: {
          where: { tenantId, type: StockMovementType.theoretical_depletion },
          select: { quantity: true, unitCost: true },
        },
        timeline: {
          where: { status: OrderStatus.completed },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found for tenant');
    }

    const marketplaceOrder = order.marketplaceOrders[0];
    const source = this.resolveSource(order.sourceChannel, marketplaceOrder?.provider);
    const normalizedPayload = this.asNormalizedMarketplacePayload(
      marketplaceOrder?.normalizedPayload,
    );
    const provenance: Prisma.JsonObject = {};

    const saleGross = this.resolveSaleGross(source, order.itemsSubtotal, normalizedPayload);
    const discountTotal = this.resolveDiscountTotal(source, order.discountTotal, normalizedPayload);
    const deliveryCharged = this.resolveOrderCharge(
      source,
      order.deliveryFee,
      normalizedPayload,
      'deliveryFee',
    );
    const serviceCharged = this.resolveOrderCharge(
      source,
      order.serviceFee,
      normalizedPayload,
      'serviceFee',
    );
    const customerPayment = this.resolveCustomerPayment(order, source, normalizedPayload);
    const cogsSnapshot = this.resolveCogs(order.stockMovements);
    const discountMerchant = this.resolveMerchantFundedDiscount(source, normalizedPayload);
    const discountPlatform = this.unknown();
    const refund = this.unknown();
    const marketplaceFact = source === FinancialProjectionSource.PEDEHUB || source === FinancialProjectionSource.POS
      ? this.notApplicable()
      : this.unknown();

    this.addProvenance(provenance, 'saleGross', saleGross);
    this.addProvenance(provenance, 'discountTotal', discountTotal);
    this.addProvenance(provenance, 'deliveryCharged', deliveryCharged);
    this.addProvenance(provenance, 'serviceCharged', serviceCharged);
    this.addProvenance(provenance, 'customerPaid', customerPayment);
    this.addProvenance(provenance, 'discountMerchant', discountMerchant);
    this.addProvenance(provenance, 'discountPlatform', discountPlatform);
    this.addProvenance(provenance, 'marketplaceFee', marketplaceFact);
    this.addProvenance(provenance, 'merchantReceivable', marketplaceFact);
    this.addProvenance(provenance, 'refundAmount', refund);
    this.addProvenance(provenance, 'cogsSnapshot', cogsSnapshot);

    const data: Prisma.FinancialProjectionUncheckedCreateInput = {
      tenantId,
      orderId,
      source,
      projectionVersion: FINANCIAL_PROJECTION_VERSION,
      occurredAt: order.createdAt,
      recognizedAt: order.status === OrderStatus.completed ? order.timeline[0]?.createdAt ?? null : null,
      paymentObservedAt: customerPayment.observedAt,
      saleGross: saleGross.value,
      saleGrossState: saleGross.state,
      discountTotal: discountTotal.value,
      discountTotalState: discountTotal.state,
      discountMerchant: discountMerchant.value,
      discountMerchantState: discountMerchant.state,
      discountPlatform: discountPlatform.value,
      discountPlatformState: discountPlatform.state,
      deliveryCharged: deliveryCharged.value,
      deliveryChargedState: deliveryCharged.state,
      serviceCharged: serviceCharged.value,
      serviceChargedState: serviceCharged.state,
      customerPaid: customerPayment.value,
      customerPaidState: customerPayment.state,
      paymentMethod: customerPayment.paymentMethod,
      paymentChannel: customerPayment.paymentChannel,
      marketplaceFee: marketplaceFact.value,
      marketplaceFeeState: marketplaceFact.state,
      merchantReceivable: marketplaceFact.value,
      merchantReceivableState: marketplaceFact.state,
      refundAmount: refund.value,
      refundState: refund.state,
      cogsSnapshot: cogsSnapshot.value,
      cogsState: cogsSnapshot.state,
      sourceFieldProvenance: provenance,
      sourcePayloadReference: marketplaceOrder ? `marketplace_order:${marketplaceOrder.id}` : null,
    };

    return this.prisma.financialProjection.upsert({
      where: {
        tenantId_orderId_projectionVersion: {
          tenantId,
          orderId,
          projectionVersion: FINANCIAL_PROJECTION_VERSION,
        },
      },
      create: data,
      update: data,
    });
  }

  async reprojectOrder(tenantId: string, orderId: string) {
    return this.projectOrder(tenantId, orderId);
  }

  async getProjection(tenantId: string, orderId: string, projectionVersion = FINANCIAL_PROJECTION_VERSION) {
    return this.prisma.financialProjection.findFirst({
      where: { tenantId, orderId, projectionVersion },
    });
  }

  private resolveSource(
    sourceChannel: string,
    marketplaceProvider: MarketplaceProvider | undefined,
  ): FinancialProjectionSource {
    if (marketplaceProvider === MarketplaceProvider.IFOOD) return FinancialProjectionSource.IFOOD;
    if (marketplaceProvider === MarketplaceProvider.FOOD_99) return FinancialProjectionSource.FOOD_99;
    if (sourceChannel === 'pos') return FinancialProjectionSource.POS;
    return FinancialProjectionSource.PEDEHUB;
  }

  private resolveSaleGross(
    source: FinancialProjectionSource,
    itemsSubtotal: Prisma.Decimal,
    normalizedPayload: NormalizedMarketplacePayload | null,
  ): MoneyFact {
    if (source === FinancialProjectionSource.FOOD_99) {
      const value = this.readNumber(normalizedPayload, 'itemsSubtotal');
      return value === null
        ? this.unknown()
        : this.known(value, '99food.order_price via marketplace.normalizedPayload.itemsSubtotal');
    }

    if (source === FinancialProjectionSource.IFOOD) {
      return this.known(itemsSubtotal, 'order.itemsSubtotal persisted from normalized marketplace order');
    }

    return this.known(itemsSubtotal, 'order.itemsSubtotal');
  }

  private resolveDiscountTotal(
    source: FinancialProjectionSource,
    discountTotal: Prisma.Decimal,
    normalizedPayload: NormalizedMarketplacePayload | null,
  ): MoneyFact {
    if (source === FinancialProjectionSource.IFOOD) return this.unknown();
    if (source === FinancialProjectionSource.FOOD_99) {
      const value = this.readNumber(normalizedPayload, 'discountTotal');
      return value === null
        ? this.unknown()
        : this.known(value, 'marketplace.normalizedPayload.discountTotal');
    }
    return this.known(discountTotal, 'order.discountTotal');
  }

  private resolveMerchantFundedDiscount(
    source: FinancialProjectionSource,
    normalizedPayload: NormalizedMarketplacePayload | null,
  ): MoneyFact {
    if (source !== FinancialProjectionSource.FOOD_99) return this.unknown();
    const value = this.readNumber(normalizedPayload, 'merchantFundedDiscount');
    return value === null
      ? this.unknown()
      : this.known(value, '99food.promotions[].shop_subside_price (order-level only)');
  }

  private resolveOrderCharge(
    source: FinancialProjectionSource,
    orderValue: Prisma.Decimal,
    normalizedPayload: NormalizedMarketplacePayload | null,
    normalizedField: 'deliveryFee' | 'serviceFee',
  ): MoneyFact {
    if (source === FinancialProjectionSource.IFOOD) return this.unknown();
    if (source === FinancialProjectionSource.FOOD_99) {
      const value = this.readNumber(normalizedPayload, normalizedField);
      return value === null
        ? this.unknown()
        : this.known(value, `marketplace.normalizedPayload.${normalizedField}`);
    }
    return this.known(orderValue, `order.${normalizedField}`);
  }

  private resolveCustomerPayment(
    order: {
      paymentMethod: PaymentMethod | null;
      paymentTransactions: Array<{
        amount: Prisma.Decimal;
        method: PaymentMethod;
        confirmedAt: Date | null;
        createdAt: Date;
      }>;
      paymentAttempts: Array<{
        amount: Prisma.Decimal;
        paidAt: Date | null;
      }>;
      cashMovements: Array<{
        amount: Prisma.Decimal;
        paymentMethod: PaymentMethod | null;
        createdAt: Date;
      }>;
    },
    source: FinancialProjectionSource,
    normalizedPayload: NormalizedMarketplacePayload | null,
  ): MoneyFact & { paymentMethod: PaymentMethod | null; paymentChannel: string | null; observedAt: Date | null } {
    if (source === FinancialProjectionSource.FOOD_99) {
      const value = this.readNumber(normalizedPayload, 'customerPaidAmount');
      const paymentStatus = normalizedPayload?.paymentStatus;
      const collectionResponsibility = normalizedPayload?.collectionResponsibility;
      if (paymentStatus === 'PAID' && value !== null) {
        return {
          ...this.known(value, '99food.customer_need_paying_money confirmed by native online payment mode'),
          paymentMethod: order.paymentMethod,
          paymentChannel: 'MARKETPLACE_99FOOD',
          observedAt: null,
        };
      }
      return {
        ...this.unknown(),
        paymentMethod: order.paymentMethod,
        paymentChannel: collectionResponsibility === 'DRIVER' ? 'DRIVER_COLLECTION_PENDING' : null,
        observedAt: null,
      };
    }

    if (source === FinancialProjectionSource.IFOOD) {
      return { ...this.unknown(), paymentMethod: null, paymentChannel: null, observedAt: null };
    }

    const transaction = order.paymentTransactions[0];
    if (transaction) {
      return {
        ...this.known(transaction.amount, 'paymentTransaction.confirmed amount'),
        paymentMethod: transaction.method,
        paymentChannel: 'ONLINE_PAYMENT_TRANSACTION',
        observedAt: transaction.confirmedAt ?? transaction.createdAt,
      };
    }

    const attempt = order.paymentAttempts[0];
    if (attempt) {
      return {
        ...this.known(attempt.amount, 'orderPaymentAttempt.paid amount'),
        paymentMethod: order.paymentMethod,
        paymentChannel: 'ONLINE_PAYMENT_ATTEMPT',
        observedAt: attempt.paidAt,
      };
    }

    if (source === FinancialProjectionSource.POS) {
      const movement = order.cashMovements[0];
      if (movement) {
        return {
          ...this.known(movement.amount, 'cashMovement.sale amount'),
          paymentMethod: movement.paymentMethod ?? order.paymentMethod,
          paymentChannel: 'POS_CASH_MOVEMENT_SALE',
          observedAt: movement.createdAt,
        };
      }
    }

    return { ...this.unknown(), paymentMethod: null, paymentChannel: null, observedAt: null };
  }

  private resolveCogs(
    movements: Array<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null }>,
  ): MoneyFact {
    if (movements.length === 0 || movements.some((movement) => movement.unitCost === null)) {
      return this.unknown();
    }

    const value = movements.reduce(
      (total, movement) => movement.unitCost === null
        ? total
        : total.plus(movement.quantity.mul(movement.unitCost)),
      new Prisma.Decimal(0),
    );
    return this.known(value, 'stockMovement.theoretical_depletion unitCost snapshot');
  }

  private asNormalizedMarketplacePayload(value: Prisma.JsonValue | null | undefined): NormalizedMarketplacePayload | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  private readNumber(payload: NormalizedMarketplacePayload | null, field: string): Prisma.Decimal | null {
    const value = payload?.[field];
    return typeof value === 'number' && Number.isFinite(value) ? new Prisma.Decimal(value) : null;
  }

  private known(value: Prisma.Decimal, provenance: string): MoneyFact {
    return { value, state: FinancialProjectionValueState.KNOWN, provenance };
  }

  private unknown(): MoneyFact {
    return { value: null, state: FinancialProjectionValueState.UNKNOWN };
  }

  private notApplicable(): MoneyFact {
    return { value: null, state: FinancialProjectionValueState.NOT_APPLICABLE };
  }

  private addProvenance(provenance: Prisma.JsonObject, field: string, fact: MoneyFact): void {
    provenance[field] = { source: fact.provenance ?? 'not_available' };
  }
}
