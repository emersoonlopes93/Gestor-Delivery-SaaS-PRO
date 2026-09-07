import {
  FinancialProjectionSource,
  FinancialProjectionValueState,
  MarketplaceProvider,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { FinancialProjectionService } from './financial-projection.service';

type ProjectionWrite = {
  tenantId: string;
  orderId: string;
  source: FinancialProjectionSource;
  projectionVersion: number;
  saleGross: Prisma.Decimal | null;
  saleGrossState: FinancialProjectionValueState;
  discountTotal: Prisma.Decimal | null;
  discountTotalState: FinancialProjectionValueState;
  deliveryCharged: Prisma.Decimal | null;
  serviceCharged: Prisma.Decimal | null;
  customerPaid: Prisma.Decimal | null;
  customerPaidState: FinancialProjectionValueState;
  paymentMethod: PaymentMethod | null;
  paymentChannel: string | null;
  marketplaceFeeState: FinancialProjectionValueState;
  merchantReceivableState: FinancialProjectionValueState;
  refundState: FinancialProjectionValueState;
  cogsSnapshot: Prisma.Decimal | null;
  cogsState: FinancialProjectionValueState;
  sourceFieldProvenance: Prisma.JsonObject;
};

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    tenantId: 'tenant-1',
    sourceChannel: 'direct_online',
    status: OrderStatus.confirmed,
    createdAt: new Date('2026-09-07T12:00:00.000Z'),
    itemsSubtotal: decimal('100'),
    discountTotal: decimal('10'),
    deliveryFee: decimal('8'),
    serviceFee: decimal('2'),
    paymentMethod: PaymentMethod.pix,
    paymentTransactions: [],
    paymentAttempts: [],
    cashMovements: [],
    marketplaceOrders: [],
    stockMovements: [],
    timeline: [],
    ...overrides,
  };
}

async function setup(order = orderFixture()) {
  const upsert = jest.fn(({ create }: { create: ProjectionWrite }) => Promise.resolve(create));
  const findFirstProjection = jest.fn();
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue(order) },
    financialProjection: {
      upsert,
      findFirst: findFirstProjection,
    },
  };
  const module = await Test.createTestingModule({
    providers: [
      FinancialProjectionService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  const service = module.get(FinancialProjectionService);
  return { service, prisma, upsert, findFirstProjection };
}

function writeFrom(upsert: jest.Mock): ProjectionWrite {
  const call = upsert.mock.calls[0][0] as { create: ProjectionWrite };
  return call.create;
}

describe('FinancialProjectionService', () => {
  it('projects own-order facts without treating a declared payment method as a payment', async () => {
    const { service, upsert } = await setup();

    await service.projectOrder('tenant-1', 'order-1');

    const write = writeFrom(upsert);
    expect(write.source).toBe(FinancialProjectionSource.PEDEHUB);
    expect(write.saleGross?.toString()).toBe('100');
    expect(write.saleGrossState).toBe(FinancialProjectionValueState.KNOWN);
    expect(write.discountTotal?.toString()).toBe('10');
    expect(write.customerPaid).toBeNull();
    expect(write.customerPaidState).toBe(FinancialProjectionValueState.UNKNOWN);
    expect(write.paymentMethod).toBeNull();
    expect(write.marketplaceFeeState).toBe(FinancialProjectionValueState.NOT_APPLICABLE);
    expect(write.merchantReceivableState).toBe(FinancialProjectionValueState.NOT_APPLICABLE);
  });

  it('uses an existing POS sale movement as payment evidence without mutating Cash', async () => {
    const { service, upsert, prisma } = await setup(orderFixture({
      sourceChannel: 'pos',
      cashMovements: [{
        amount: decimal('120'),
        paymentMethod: PaymentMethod.debit_card,
        createdAt: new Date('2026-09-07T12:05:00.000Z'),
      }],
    }));

    await service.projectOrder('tenant-1', 'order-1');

    const write = writeFrom(upsert);
    expect(write.source).toBe(FinancialProjectionSource.POS);
    expect(write.customerPaid?.toString()).toBe('120');
    expect(write.customerPaidState).toBe(FinancialProjectionValueState.KNOWN);
    expect(write.paymentMethod).toBe(PaymentMethod.debit_card);
    expect(write.paymentChannel).toBe('POS_CASH_MOVEMENT_SALE');
    expect(Object.keys(prisma)).toEqual(['order', 'financialProjection']);
  });

  it('keeps iFood fee, receivable, and payment facts unknown when they are not persisted', async () => {
    const { service, upsert } = await setup(orderFixture({
      marketplaceOrders: [{
        id: 'marketplace-ifood-1',
        provider: MarketplaceProvider.IFOOD,
        normalizedPayload: { orderCode: 'ifood-1' },
      }],
    }));

    await service.projectOrder('tenant-1', 'order-1');

    const write = writeFrom(upsert);
    expect(write.source).toBe(FinancialProjectionSource.IFOOD);
    expect(write.saleGross?.toString()).toBe('100');
    expect(write.customerPaidState).toBe(FinancialProjectionValueState.UNKNOWN);
    expect(write.marketplaceFeeState).toBe(FinancialProjectionValueState.UNKNOWN);
    expect(write.merchantReceivableState).toBe(FinancialProjectionValueState.UNKNOWN);
  });

  it('keeps 99Food order price distinct from prepaid customer payment', async () => {
    const { service, upsert } = await setup(orderFixture({
      marketplaceOrders: [{
        id: 'marketplace-99-1',
        provider: MarketplaceProvider.FOOD_99,
        normalizedPayload: {
          itemsSubtotal: 100,
          total: 90,
          isPrepaid: true,
          discountTotal: 10,
          externalOrderId: '9223372036854775807',
        },
      }],
    }));

    await service.projectOrder('tenant-1', 'order-1');

    const write = writeFrom(upsert);
    expect(write.source).toBe(FinancialProjectionSource.FOOD_99);
    expect(write.saleGross?.toString()).toBe('100');
    expect(write.customerPaid?.toString()).toBe('90');
    expect(write.discountTotal?.toString()).toBe('10');
    expect(write.customerPaidState).toBe(FinancialProjectionValueState.KNOWN);
    expect(write.marketplaceFeeState).toBe(FinancialProjectionValueState.UNKNOWN);
    expect(write.merchantReceivableState).toBe(FinancialProjectionValueState.UNKNOWN);
    expect(write.sourceFieldProvenance.customerPaid).toEqual({
      source: '99food.customer_need_paying_money via marketplace.normalizedPayload.total',
    });
  });

  it('records COGS only from persisted theoretical movements and never infers a cancellation refund', async () => {
    const { service, upsert } = await setup(orderFixture({
      status: OrderStatus.cancelled,
      stockMovements: [{ quantity: decimal('2'), unitCost: decimal('3') }],
    }));

    await service.projectOrder('tenant-1', 'order-1');

    const write = writeFrom(upsert);
    expect(write.cogsSnapshot?.toString()).toBe('6');
    expect(write.cogsState).toBe(FinancialProjectionValueState.KNOWN);
    expect(write.refundState).toBe(FinancialProjectionValueState.UNKNOWN);
  });

  it('is idempotent for a tenant/order/version and scopes lookup by tenant', async () => {
    const { service, upsert, prisma, findFirstProjection } = await setup();

    await service.projectOrder('tenant-1', 'order-1');
    await service.reprojectOrder('tenant-1', 'order-1');
    await service.getProjection('tenant-1', 'order-1');

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(writeFrom(upsert).projectionVersion).toBe(1);
    expect(findFirstProjection).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', orderId: 'order-1', projectionVersion: 1 },
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1', tenantId: 'tenant-1' },
    }));
  });

  it('fails closed when the order is outside the tenant scope', async () => {
    const { service } = await setup(null);

    await expect(service.projectOrder('tenant-1', 'order-from-another-tenant')).rejects.toBeInstanceOf(NotFoundException);
  });
});
