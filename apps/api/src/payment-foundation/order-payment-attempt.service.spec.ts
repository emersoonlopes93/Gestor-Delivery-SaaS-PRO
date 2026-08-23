import { ConflictException } from '@nestjs/common';
import {
  OrderPaymentAttempt,
  OrderPaymentAttemptStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { OrderPaymentAttemptService } from './order-payment-attempt.service';

function attempt(overrides: Partial<OrderPaymentAttempt> = {}): OrderPaymentAttempt {
  return {
    id: 'attempt-a',
    tenantId: 'tenant-a',
    orderId: 'order-a',
    provider: PaymentProvider.mercado_pago,
    providerConnectionId: 'connection-a',
    status: OrderPaymentAttemptStatus.CREATED,
    amount: new Prisma.Decimal('42.50'),
    currency: 'BRL',
    externalPaymentId: null,
    idempotencyKey: 'checkout-attempt-a',
    expiresAt: null,
    paidAt: null,
    failedAt: null,
    failureCode: null,
    failureReason: null,
    metadataJson: null,
    platformFeePolicyId: 'policy-free-v1',
    platformFeePolicyVersion: 1,
    platformFeeType: 'FIXED',
    platformFeeExpectedAmount: new Prisma.Decimal('0.38'),
    platformFeeCurrency: 'BRL',
    tenantPlanSnapshot: 'free:no-active-billing-plan',
    createdAt: new Date('2026-08-20T12:00:00.000Z'),
    updatedAt: new Date('2026-08-20T12:00:00.000Z'),
    ...overrides,
  };
}

describe('OrderPaymentAttemptService', () => {
  const tx = {
    order: { findFirst: jest.fn() },
    paymentProviderConnection: { findFirst: jest.fn() },
    onlinePaymentActivation: { findUnique: jest.fn() },
    orderPaymentAttempt: { create: jest.fn(), findFirst: jest.fn(), findFirstOrThrow: jest.fn(), updateMany: jest.fn() },
    platformFeeEntry: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    orderPaymentAttempt: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const platformFeePolicyService = {
    resolveForTenant: jest.fn().mockResolvedValue({
      policy: {
        id: 'policy-free-v1', selectorKey: 'FREE', scope: 'FREE_TENANT', billingPlanId: null,
        feeType: 'FIXED', fixedAmount: new Prisma.Decimal('0.38'), currency: 'BRL', version: 1,
        effectiveFrom: new Date('2026-08-23T00:00:00.000Z'), effectiveUntil: null, active: true,
        createdAt: new Date('2026-08-23T00:00:00.000Z'), updatedAt: new Date('2026-08-23T00:00:00.000Z'),
      },
      amount: new Prisma.Decimal('0.38'),
      tenantPlanSnapshot: 'free:no-active-billing-plan',
    }),
  };
  const service = new OrderPaymentAttemptService(prisma as never, platformFeePolicyService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    tx.order.findFirst.mockResolvedValue({
      id: 'order-a',
      total: new Prisma.Decimal('42.50'),
      tenant: { settings: { currency: 'BRL' } },
    });
    tx.paymentProviderConnection.findFirst.mockResolvedValue({ id: 'connection-a' });
  });

  it('creates a tenant-scoped attempt with the order amount and provider', async () => {
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue(null);
    tx.orderPaymentAttempt.create.mockResolvedValue(attempt());

    const result = await service.createAttempt({
      tenantId: 'tenant-a',
      orderId: 'order-a',
      provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a',
      idempotencyKey: 'checkout-attempt-a',
    });

    expect(result.id).toBe('attempt-a');
    expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-a', tenantId: 'tenant-a' },
    }));
    expect(tx.paymentProviderConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', provider: PaymentProvider.mercado_pago }),
    }));
    expect(tx.orderPaymentAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platformFeePolicyId: 'policy-free-v1',
        platformFeePolicyVersion: 1,
        platformFeeExpectedAmount: new Prisma.Decimal('0.38'),
        tenantPlanSnapshot: 'free:no-active-billing-plan',
      }),
    }));
  });

  it('requires explicit activation only for flows that opt into the R2 activation gate', async () => {
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue(null);
    tx.onlinePaymentActivation.findUnique.mockResolvedValue(null);

    await expect(service.createAttempt({
      tenantId: 'tenant-a', orderId: 'order-a', provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a', idempotencyKey: 'activation-gated',
      requireOnlinePaymentActivation: true,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.orderPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it('reuses the same logical attempt for the same tenant, order and key', async () => {
    const existing = attempt();
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue(existing);

    await expect(service.createAttempt({
      tenantId: 'tenant-a',
      orderId: 'order-a',
      provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a',
      idempotencyKey: 'checkout-attempt-a',
    })).resolves.toBe(existing);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.orderPaymentAttempt.create).not.toHaveBeenCalled();
  });

  it('namespaces the same idempotency key by tenant', async () => {
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue(null);
    tx.orderPaymentAttempt.create
      .mockResolvedValueOnce(attempt())
      .mockResolvedValueOnce(attempt({ id: 'attempt-b', tenantId: 'tenant-b', orderId: 'order-b' }));
    tx.order.findFirst
      .mockResolvedValueOnce({ id: 'order-a', total: new Prisma.Decimal('42.50'), tenant: { settings: null } })
      .mockResolvedValueOnce({ id: 'order-b', total: new Prisma.Decimal('42.50'), tenant: { settings: null } });

    await service.createAttempt({
      tenantId: 'tenant-a', orderId: 'order-a', provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a', idempotencyKey: 'same-key',
    });
    await service.createAttempt({
      tenantId: 'tenant-b', orderId: 'order-b', provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-b', idempotencyKey: 'same-key',
    });

    expect(prisma.orderPaymentAttempt.findFirst).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-a', orderId: 'order-a', idempotencyKey: 'same-key' },
    });
    expect(prisma.orderPaymentAttempt.findFirst).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 'tenant-b', orderId: 'order-b', idempotencyKey: 'same-key' },
    });
  });

  it('rejects provider mutation through idempotency key reuse', async () => {
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue(attempt());

    await expect(service.createAttempt({
      tenantId: 'tenant-a',
      orderId: 'order-a',
      provider: PaymentProvider.asaas,
      providerConnectionId: 'connection-a',
      idempotencyKey: 'checkout-attempt-a',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves an expired attempt and creates a second attempt with a new key', async () => {
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue(null);
    tx.orderPaymentAttempt.create
      .mockResolvedValueOnce(attempt({ status: OrderPaymentAttemptStatus.EXPIRED }))
      .mockResolvedValueOnce(attempt({ id: 'attempt-b', idempotencyKey: 'checkout-attempt-b' }));

    const first = await service.createAttempt({
      tenantId: 'tenant-a', orderId: 'order-a', provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a', idempotencyKey: 'checkout-attempt-a',
    });
    const second = await service.createAttempt({
      tenantId: 'tenant-a', orderId: 'order-a', provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a', idempotencyKey: 'checkout-attempt-b',
    });

    expect(first.status).toBe(OrderPaymentAttemptStatus.EXPIRED);
    expect(second.id).toBe('attempt-b');
    expect(tx.orderPaymentAttempt.create).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent unique-constraint races into one logical attempt', async () => {
    const existing = attempt();
    prisma.orderPaymentAttempt.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    prisma.$transaction
      .mockResolvedValueOnce(existing)
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }));

    const input = {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a',
      idempotencyKey: 'checkout-attempt-a',
    };
    const [first, second] = await Promise.all([
      service.createAttempt(input),
      service.createAttempt(input),
    ]);

    expect(first.id).toBe('attempt-a');
    expect(second.id).toBe('attempt-a');
  });

  it('earns the snapshotted Platform Fee atomically when payment becomes paid', async () => {
    const pending = attempt({ status: OrderPaymentAttemptStatus.PENDING });
    const paid = attempt({ status: OrderPaymentAttemptStatus.PAID, paidAt: new Date() });
    tx.orderPaymentAttempt.findFirst.mockResolvedValue(pending);
    tx.orderPaymentAttempt.updateMany.mockResolvedValue({ count: 1 });
    tx.orderPaymentAttempt.findFirstOrThrow.mockResolvedValue(paid);
    tx.platformFeeEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.transitionStatusOnce({
      tenantId: 'tenant-a', attemptId: 'attempt-a', status: OrderPaymentAttemptStatus.PAID,
    });

    expect(result.transitioned).toBe(true);
    expect(tx.platformFeeEntry.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', orderPaymentAttemptId: 'attempt-a', state: 'PENDING' },
      data: { state: 'EARNED', earnedAt: expect.any(Date) },
    });
  });
});
