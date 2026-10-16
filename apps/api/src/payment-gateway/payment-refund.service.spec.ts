import { NotFoundException } from '@nestjs/common';
import { PaymentRefundStatus, PaymentTxStatus, Prisma } from '@prisma/client';
import { PaymentRefundService } from './payment-refund.service';

const transaction = {
  id: 'payment-a',
  tenantId: 'tenant-a',
  orderId: 'order-a',
  gatewayTxId: 'mp-payment-a',
  amount: new Prisma.Decimal('42.50'),
  status: PaymentTxStatus.confirmed,
};

const requestedRefund = {
  id: 'refund-a',
  tenantId: 'tenant-a',
  orderId: 'order-a',
  paymentTransactionId: 'payment-a',
  provider: 'mercadopago',
  providerPaymentId: 'mp-payment-a',
  providerRefundId: null,
  amount: new Prisma.Decimal('42.50'),
  currency: 'BRL',
  status: PaymentRefundStatus.REQUESTED,
  idempotencyKey: 'refund:order-a:payment-a',
  requestedAt: new Date(),
  processedAt: null,
  confirmedAt: null,
  failedAt: null,
  failureCode: null,
  failureMessage: null,
  providerStatus: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PaymentRefundService', () => {
  const prisma = {
    paymentTransaction: { findFirst: jest.fn() },
    paymentRefund: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const client = {
    refundPayment: jest.fn(),
    getRefundStatus: jest.fn(),
  };
  const service = new PaymentRefundService(prisma as never, client as never);
  const input = {
    tenantId: 'tenant-a',
    orderId: 'order-a',
    paymentTransactionId: 'payment-a',
    idempotencyKey: 'refund:order-a:payment-a',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.paymentTransaction.findFirst.mockResolvedValue(transaction);
    prisma.paymentRefund.findFirst.mockResolvedValue(null);
    prisma.paymentRefund.findUnique.mockResolvedValue(null);
    prisma.paymentRefund.create.mockResolvedValue(requestedRefund);
    prisma.paymentRefund.updateMany.mockResolvedValue({ count: 1 });
    client.refundPayment.mockResolvedValue({
      outcome: 'SUCCEEDED',
      providerRefundId: 'mp-refund-a',
      providerStatus: 'approved',
      failureCode: null,
      failureMessage: null,
    });
  });

  it('persists a successful full refund only after an authoritative provider response', async () => {
    const succeeded = { ...requestedRefund, status: PaymentRefundStatus.SUCCEEDED, providerRefundId: 'mp-refund-a' };
    prisma.paymentRefund.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(succeeded);

    const result = await service.requestFullRefund(input);

    expect(prisma.paymentRefund.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        orderId: 'order-a',
        paymentTransactionId: 'payment-a',
        amount: transaction.amount,
        idempotencyKey: input.idempotencyKey,
      }),
    }));
    expect(client.refundPayment).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      providerPaymentId: 'mp-payment-a',
      idempotencyKey: input.idempotencyKey,
    });
    expect(prisma.paymentRefund.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: PaymentRefundStatus.SUCCEEDED,
        providerRefundId: 'mp-refund-a',
      }),
    }));
    expect(result.status).toBe(PaymentRefundStatus.SUCCEEDED);
  });

  it.each([
    ['PROCESSING', PaymentRefundStatus.PROCESSING],
    ['UNKNOWN', PaymentRefundStatus.UNKNOWN],
    ['FAILED', PaymentRefundStatus.FAILED],
  ] as const)('maps provider %s without inventing refund success', async (outcome, status) => {
    const expected = { ...requestedRefund, status };
    prisma.paymentRefund.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(expected);
    client.refundPayment.mockResolvedValue({
      outcome,
      providerRefundId: outcome === 'UNKNOWN' ? null : 'mp-refund-a',
      providerStatus: outcome === 'PROCESSING' ? 'in_process' : null,
      failureCode: outcome === 'FAILED' ? 'mercado_pago_http_400' : null,
      failureMessage: outcome === 'FAILED' ? 'Mercado Pago rejected the refund request.' : null,
    });

    const result = await service.requestFullRefund(input);

    expect(result.status).toBe(status);
  });

  it('does not repeat a provider call for an already succeeded payment refund', async () => {
    const succeeded = { ...requestedRefund, status: PaymentRefundStatus.SUCCEEDED };
    prisma.paymentRefund.findFirst.mockResolvedValue(succeeded);

    const result = await service.requestFullRefund({ ...input, idempotencyKey: 'another-key' });

    expect(result).toBe(succeeded);
    expect(client.refundPayment).not.toHaveBeenCalled();
    expect(prisma.paymentRefund.create).not.toHaveBeenCalled();
  });

  it('returns an in-flight refund without calling Mercado Pago twice', async () => {
    const processing = { ...requestedRefund, status: PaymentRefundStatus.PROCESSING };
    prisma.paymentRefund.findUnique.mockResolvedValue(processing);
    prisma.paymentRefund.updateMany.mockResolvedValue({ count: 0 });
    prisma.paymentRefund.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(processing);

    const result = await service.requestFullRefund(input);

    expect(result).toBe(processing);
    expect(client.refundPayment).not.toHaveBeenCalled();
  });

  it('rejects a payment that belongs to a different order or tenant', async () => {
    prisma.paymentTransaction.findFirst.mockResolvedValue(null);

    await expect(service.requestFullRefund(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.paymentRefund.create).not.toHaveBeenCalled();
    expect(client.refundPayment).not.toHaveBeenCalled();
  });

  it('reconciles processing refunds only through provider refund identity', async () => {
    const processing = { ...requestedRefund, status: PaymentRefundStatus.PROCESSING, providerRefundId: 'mp-refund-a' };
    const succeeded = { ...processing, status: PaymentRefundStatus.SUCCEEDED };
    prisma.paymentRefund.findFirst.mockResolvedValueOnce(processing).mockResolvedValueOnce(succeeded);
    client.getRefundStatus.mockResolvedValue({
      outcome: 'SUCCEEDED',
      providerRefundId: 'mp-refund-a',
      providerStatus: 'approved',
      failureCode: null,
      failureMessage: null,
    });

    const result = await service.reconcileRefund('tenant-a', 'refund-a');

    expect(client.getRefundStatus).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      providerPaymentId: 'mp-payment-a',
      providerRefundId: 'mp-refund-a',
    });
    expect(result.status).toBe(PaymentRefundStatus.SUCCEEDED);
  });

  it('makes duplicate and out-of-order refund webhooks terminally idempotent', async () => {
    prisma.paymentRefund.findFirst.mockResolvedValue(requestedRefund);
    prisma.paymentRefund.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(service.confirmFullRefundFromPaymentWebhook({
      tenantId: 'tenant-a', paymentTransactionId: 'payment-a', providerPaymentId: 'mp-payment-a',
    })).resolves.toBe(true);
    await expect(service.confirmFullRefundFromPaymentWebhook({
      tenantId: 'tenant-a', paymentTransactionId: 'payment-a', providerPaymentId: 'mp-payment-a',
    })).resolves.toBe(false);
  });
});
