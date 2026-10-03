import { MercadoPagoRefundClient } from './mercadopago-refund.client';

describe('MercadoPagoRefundClient', () => {
  const connectionService = {
    resolveMercadoPagoCredentials: jest.fn().mockResolvedValue({ accessToken: 'token-a' }),
  };
  const client = new MercadoPagoRefundClient(connectionService as never);
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    connectionService.resolveMercadoPagoCredentials.mockResolvedValue({ accessToken: 'token-a' });
  });

  it('uses Mercado Pago full-refund route and a stable idempotency key', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({ id: 'refund-a', status: 'approved' }),
    }) as typeof fetch;

    await expect(client.refundPayment({
      tenantId: 'tenant-a', providerPaymentId: 'payment/a', idempotencyKey: 'refund-key-a',
    })).resolves.toEqual(expect.objectContaining({ outcome: 'SUCCEEDED', providerRefundId: 'refund-a' }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/payment%2Fa/refunds',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Idempotency-Key': 'refund-key-a' }) }),
    );
  });

  it('keeps timeout/network failures unknown for later reconciliation', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as typeof fetch;

    await expect(client.refundPayment({
      tenantId: 'tenant-a', providerPaymentId: 'payment-a', idempotencyKey: 'refund-key-a',
    })).resolves.toEqual(expect.objectContaining({ outcome: 'UNKNOWN' }));
  });

  it('queries a specific refund using the documented payment/refund identity', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: 'refund-a', status: 'in_process' }),
    }) as typeof fetch;

    await expect(client.getRefundStatus({
      tenantId: 'tenant-a', providerPaymentId: 'payment-a', providerRefundId: 'refund-a',
    })).resolves.toEqual(expect.objectContaining({ outcome: 'PROCESSING' }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/payment-a/refunds/refund-a',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
