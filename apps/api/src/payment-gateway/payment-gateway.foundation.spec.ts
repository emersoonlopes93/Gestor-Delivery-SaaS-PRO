import { ServiceUnavailableException } from '@nestjs/common';
import {
  OrderPaymentAttemptStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentTxStatus,
  Prisma,
} from '@prisma/client';
import { PaymentGatewayService } from './payment-gateway.service';

describe('PaymentGatewayService payment foundation compatibility', () => {
  const order = {
    id: 'order-a',
    tenantId: 'tenant-a',
    orderNumber: '1001',
    idempotencyKey: 'checkout-a',
    paymentMethod: PaymentMethod.pix,
    status: 'pending',
    total: new Prisma.Decimal('42.50'),
    customer: null,
  };
  const transaction = {
    id: 'transaction-a',
    tenantId: 'tenant-a',
    orderId: 'order-a',
    orderPaymentAttemptId: 'attempt-a',
    gatewayName: 'mercadopago',
    gatewayTxId: '',
    method: PaymentMethod.pix,
    amount: new Prisma.Decimal('42.50'),
    status: PaymentTxStatus.pending,
    metadata: null,
    confirmedAt: null,
    createdAt: new Date('2026-08-20T12:00:00.000Z'),
  };
  const prisma = {
    tenantClient: {
      order: { findUnique: jest.fn() },
      paymentTransaction: { update: jest.fn() },
    },
    tenantSettings: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
    paymentTransaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const tenantContext = { getTenantId: jest.fn().mockReturnValue('tenant-a') };
  const config = { get: jest.fn((key: string) => key === 'MERCADO_PAGO_WEBHOOK_URL' ? 'https://example.test/webhook' : undefined) };
  const connectionService = {
    resolveMercadoPagoCredentials: jest.fn().mockResolvedValue({
      connectionId: 'connection-a',
      accessToken: 'known-access-token',
      publicKey: 'public-key',
      webhookSecret: 'webhook-secret',
      legacyStorage: false,
    }),
  };
  const paymentAttemptService = {
    createAttempt: jest.fn().mockResolvedValue({
      id: 'attempt-a',
      provider: PaymentProvider.mercado_pago,
      status: OrderPaymentAttemptStatus.CREATED,
    }),
    transitionStatus: jest.fn().mockResolvedValue({ id: 'attempt-a' }),
    attachExternalPayment: jest.fn().mockResolvedValue({ id: 'attempt-a' }),
    transitionStatusOnce: jest.fn().mockResolvedValue({ transitioned: true }),
  };
  const paymentRefundService = {
    confirmFullRefundFromPaymentWebhook: jest.fn().mockResolvedValue(true),
  };
  const service = new PaymentGatewayService(
    prisma as never,
    tenantContext as never,
    config as never,
    { get: jest.fn() } as never,
    connectionService as never,
    {} as never,
    paymentAttemptService as never,
    paymentRefundService as never,
  );
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantContext.getTenantId.mockReturnValue('tenant-a');
    connectionService.resolveMercadoPagoCredentials.mockResolvedValue({
      connectionId: 'connection-a',
      accessToken: 'known-access-token',
      publicKey: 'public-key',
      webhookSecret: 'webhook-secret',
      legacyStorage: false,
    });
    prisma.tenantClient.order.findUnique.mockResolvedValue(order);
    prisma.tenantSettings.findUnique.mockResolvedValue({
      pixKey: 'manual-key-must-not-be-used',
      razaoSocial: 'Loja A',
      city: 'Sao Paulo',
    });
    prisma.tenant.findUnique.mockResolvedValue({ name: 'Loja A' });
    prisma.paymentTransaction.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...transaction, order: { id: 'order-a', orderNumber: '1001', publicTrackingToken: 'public-token' } });
    prisma.paymentTransaction.create.mockResolvedValue(transaction);
    paymentAttemptService.createAttempt.mockResolvedValue({
      id: 'attempt-a',
      provider: PaymentProvider.mercado_pago,
      status: OrderPaymentAttemptStatus.CREATED,
    });
    paymentRefundService.confirmFullRefundFromPaymentWebhook.mockResolvedValue(true);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses one OrderPaymentAttempt as the Mercado Pago idempotency identity', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: 'mp-payment-a',
        status: 'pending',
        status_detail: 'pending_waiting_transfer',
        point_of_interaction: {
          transaction_data: {
            qr_code: 'provider-qr',
            qr_code_base64: 'provider-qr-base64',
            ticket_url: 'https://example.test/ticket',
          },
        },
      }),
    }) as typeof fetch;

    const result = await service.createPixPayment('order-a', 'buyer@example.test', 'Buyer');

    expect(paymentAttemptService.createAttempt).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      orderId: 'order-a',
      provider: PaymentProvider.mercado_pago,
      providerConnectionId: 'connection-a',
      idempotencyKey: 'order:order-a:pix:mercado_pago',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Idempotency-Key': 'attempt-a' }),
      }),
    );
    expect(paymentAttemptService.attachExternalPayment).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a',
      attemptId: 'attempt-a',
      externalPaymentId: 'mp-payment-a',
    }));
    expect(result.qrCode).toBe('provider-qr');
  });

  it('fails closed after an ambiguous provider timeout instead of creating manual Pix', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('provider timeout')) as typeof fetch;

    await expect(service.createPixPayment('order-a', 'buyer@example.test', 'Buyer'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(paymentAttemptService.transitionStatus).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      attemptId: 'attempt-a',
      status: OrderPaymentAttemptStatus.PENDING,
    });
    expect(paymentAttemptService.attachExternalPayment).not.toHaveBeenCalled();
    expect(prisma.tenantClient.paymentTransaction.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gatewayName: 'manual_pix' }) }),
    );
  });

  it('maps a refunded webhook to the persisted refund lifecycle without cancelling the order', async () => {
    const webhookUpdate: (transaction: object, payment: object) => Promise<void> = Reflect.get(
      service,
      'updateTransactionRecord',
    );
    const webhookTransaction = {
      ...transaction,
      gatewayTxId: 'mp-payment-a',
      order: { id: 'order-a', status: 'cancelled' },
    };

    await webhookUpdate.call(service, webhookTransaction, {
      id: 'mp-payment-a',
      status: 'refunded',
    });

    expect(paymentRefundService.confirmFullRefundFromPaymentWebhook).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      paymentTransactionId: 'transaction-a',
      providerPaymentId: 'mp-payment-a',
    });
    expect(paymentAttemptService.transitionStatusOnce).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      attemptId: 'attempt-a',
      status: OrderPaymentAttemptStatus.REFUNDED,
    });
    expect(prisma.paymentTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'transaction-a' },
    }));
  });
});
