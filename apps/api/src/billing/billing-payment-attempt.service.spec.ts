import {
  BillingGatewayMode,
  InvoiceStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';

describe('BillingPaymentAttemptService', () => {
  const invoice = {
    id: 'invoice-1',
    tenantId: 'tenant-1',
    subscriptionId: 'subscription-1',
    status: InvoiceStatus.draft,
    total: new Prisma.Decimal(25),
    openedAt: null,
    subscription: { id: 'subscription-1', providerCustomerId: null },
  };

  function createHarness() {
    let transactionActive = false;
    const tx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        update: jest.fn().mockResolvedValue({ ...invoice, status: InvoiceStatus.open }),
      },
      paymentAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 'attempt-1',
          ...invoice,
          invoice,
          status: PaymentAttemptStatus.processing,
          providerPaymentId: null,
        }),
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
        update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: PaymentAttemptStatus.pending }),
        count: jest.fn().mockResolvedValue(1),
      },
      tenantBillingSubscription: { update: jest.fn() },
      auditLog: { create: jest.fn() },
      subscriptionStatusHistory: { create: jest.fn() },
      tenant: { update: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        transactionActive = true;
        try {
          return await callback(tx);
        } finally {
          transactionActive = false;
        }
      }),
      paymentAttempt: {
        findUnique: jest.fn().mockResolvedValue({ metadataJson: null }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
      },
    };
    const gateway = {
      assertPaymentsEnabled: jest.fn(),
      createPaymentForInvoice: jest.fn(async () => {
        expect(transactionActive).toBe(false);
        return {
          provider: PaymentProvider.mock,
          mode: BillingGatewayMode.sandbox,
          status: PaymentAttemptStatus.pending,
          providerPaymentId: 'provider-payment-1',
          providerPaymentUrl: 'https://example.test/pay',
          providerCustomerId: null,
          errorCode: null,
          errorMessage: null,
          metadataJson: {},
          requestJson: {},
          responseJson: {},
        };
      }),
    };
    return { tx, prisma, gateway };
  }

  const input = {
    invoiceId: 'invoice-1',
    tenantId: 'tenant-1',
    provider: PaymentProvider.mock,
    mode: BillingGatewayMode.sandbox,
    idempotencyKey: 'payment-key-1',
  };

  it('reserves before calling the provider and finalizes after the provider response', async () => {
    const { prisma, gateway, tx } = createHarness();
    const service = new BillingPaymentAttemptService(prisma as never, gateway as never);

    await service.createAttemptForInvoice(input);

    expect(tx.paymentAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: PaymentAttemptStatus.processing,
        idempotencyKey: input.idempotencyKey,
      }),
    }));
    expect(gateway.createPaymentForInvoice).toHaveBeenCalledTimes(1);
    expect(tx.paymentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerPaymentId: 'provider-payment-1' }),
    }));
  });

  it('returns the durable reservation without submitting a second provider charge', async () => {
    const { prisma, gateway, tx } = createHarness();
    tx.paymentAttempt.findFirst.mockResolvedValue({ id: 'attempt-existing' });
    const service = new BillingPaymentAttemptService(prisma as never, gateway as never);

    const result = await service.createAttemptForInvoice(input);

    expect(result.id).toBe('attempt-existing');
    expect(gateway.createPaymentForInvoice).not.toHaveBeenCalled();
  });

  it('reuses an in-progress reservation even when a retry uses a different key', async () => {
    const { prisma, gateway, tx } = createHarness();
    tx.paymentAttempt.findFirst.mockResolvedValue({ id: 'attempt-processing', status: PaymentAttemptStatus.processing });
    const service = new BillingPaymentAttemptService(prisma as never, gateway as never);

    const result = await service.createAttemptForInvoice({ ...input, idempotencyKey: 'different-key' });

    expect(result.id).toBe('attempt-processing');
    expect(gateway.createPaymentForInvoice).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps a timeout reservation processing so a retry cannot create another charge', async () => {
    const { prisma, gateway } = createHarness();
    gateway.createPaymentForInvoice.mockRejectedValue(new Error('gateway timeout'));
    const service = new BillingPaymentAttemptService(prisma as never, gateway as never);

    await expect(service.createAttemptForInvoice(input)).rejects.toThrow('gateway timeout');

    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'attempt-1' },
      data: expect.objectContaining({
        metadataJson: expect.objectContaining({ gatewaySubmission: 'unknown_outcome' }),
      }),
    }));
  });

  it('recovers a P2002 only through the root client after the transaction has rolled back', async () => {
    const { prisma, gateway, tx } = createHarness();
    const uniqueError = new Prisma.PrismaClientKnownRequestError('duplicate reservation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    tx.paymentAttempt.create.mockRejectedValueOnce(uniqueError);
    prisma.paymentAttempt.findFirst.mockImplementation(async () => {
      expect(tx.paymentAttempt.findFirst).toHaveBeenCalled();
      return { id: 'attempt-winner', status: PaymentAttemptStatus.processing };
    });
    const service = new BillingPaymentAttemptService(prisma as never, gateway as never);

    const result = await service.createAttemptForInvoice(input);

    expect(result.id).toBe('attempt-winner');
    expect(prisma.paymentAttempt.findFirst).toHaveBeenCalledTimes(1);
    expect(gateway.createPaymentForInvoice).not.toHaveBeenCalled();
  });
});
