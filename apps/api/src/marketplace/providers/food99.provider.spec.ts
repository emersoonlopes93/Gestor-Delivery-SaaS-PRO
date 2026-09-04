import { MarketplaceProvider } from '@prisma/client';
import { createHash } from 'crypto';
import { Food99Provider } from './food99.provider';

describe('Food99Provider', () => {
  const client = {
    pollEvents: jest.fn(), acknowledgeEvents: jest.fn(), fetchOrderDetails: jest.fn(),
    confirmOrder: jest.fn(), readyOrder: jest.fn(), dispatchOrder: jest.fn(), deliverOrder: jest.fn(),
    pickUpOrder: jest.fn(), requestCancellation: jest.fn(), acceptCancellation: jest.fn(), denyCancellation: jest.fn(),
  };
  const credentials = {
    getFood99AppCredentials: jest.fn().mockReturnValue({ appId: 'app', clientSecret: 'secret' }),
  };
  const provider = new Food99Provider(client as never, credentials as never);
  const signWebhook = (rawBody: Buffer) => createHash('md5')
    .update(rawBody)
    .update('secret', 'utf8')
    .digest('hex');

  it('accepts the official MD5 signature of raw body plus app secret', async () => {
    const rawBody = Buffer.from('{"eventId":"evt-1"}');
    await expect(provider.validateWebhook({
      headers: { 'DiDi-HeAdEr-SiGn': signWebhook(rawBody) }, rawBody, body: {},
    })).resolves.toBe(true);
  });

  it('rejects an invalid or missing signature', async () => {
    const rawBody = Buffer.from('{"eventId":"evt-1"}');
    await expect(provider.validateWebhook({
      headers: { 'didi-header-sign': '0'.repeat(32) }, rawBody, body: {},
    })).resolves.toBe(false);
    await expect(provider.validateWebhook({
      headers: {}, rawBody, body: {},
    })).resolves.toBe(false);
  });

  it('rejects a signature after any raw-body byte changes', async () => {
    const signedBody = Buffer.from('{"eventId":"evt-1","orderId":"order-1"}');
    const equivalentParsedBody = Buffer.from('{ "orderId": "order-1", "eventId": "evt-1" }');
    await expect(provider.validateWebhook({
      headers: { 'didi-header-sign': signWebhook(signedBody) },
      rawBody: equivalentParsedBody,
      body: { eventId: 'evt-1', orderId: 'order-1' },
    })).resolves.toBe(false);
  });

  it('signs UTF-8 accents and a trailing newline as their original bytes', async () => {
    const rawBody = Buffer.from('{"customer":"João","note":"ação"}\n', 'utf8');
    await expect(provider.validateWebhook({
      headers: { 'didi-header-sign': signWebhook(rawBody).toUpperCase() },
      rawBody,
      body: { customer: 'João', note: 'ação' },
    })).resolves.toBe(true);
    await expect(provider.validateWebhook({
      headers: { 'didi-header-sign': signWebhook(rawBody) },
      rawBody: Buffer.from('{"customer":"João","note":"ação"}', 'utf8'),
      body: { customer: 'João', note: 'ação' },
    })).resolves.toBe(false);
  });

  it('parses webhook identity without trusting an order snapshot from the event', async () => {
    const parsed = await provider.parseWebhookEvent({
      headers: { 'x-app-merchantid': 'merchant-1' },
      body: { eventId: 'evt-1', eventType: 'CREATED', orderId: 'order-1', createdAt: '2026-09-03T12:00:00Z' },
    });
    expect(parsed).toMatchObject({
      provider: MarketplaceProvider.FOOD_99,
      eventId: 'evt-1', externalMerchantId: 'merchant-1', externalOrderId: 'order-1', orderPayload: null,
    });
  });

  it('normalizes authoritative totals, options and provider logistics ownership', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        id: 'order-1', displayId: '991', type: 'DELIVERY', createdAt: '2026-09-03T12:00:00Z',
        customer: { name: 'Ana', phone: { number: '5511999999999' } },
        delivery: {
          deliveredBy: 'MARKETPLACE',
          deliveryAddress: { street: 'Rua A', number: '10', district: 'Centro', city: 'Sao Paulo', state: 'SP', postalCode: '01001000' },
        },
        items: [{ id: 'i-1', name: 'Pizza', quantity: 1, unitPrice: { value: 30 }, totalPrice: { value: 35 }, options: [{ id: 'o-1', name: 'Extra', quantity: 1, unitPrice: { value: 5 } }] }],
        payments: { pending: { value: 0 }, methods: [{ method: 'PIX', type: 'PREPAID', value: { value: 35 } }] },
        total: { itemsPrice: { value: 35 }, orderAmount: { value: 35 } },
      },
    });
    expect(normalized).toMatchObject({
      provider: MarketplaceProvider.FOOD_99,
      externalOrderId: 'order-1', logisticsOwnership: 'provider', isPrepaid: true,
      paymentMethod: 'pix', itemsSubtotal: 35, total: 35,
    });
    expect(normalized.items[0].options).toHaveLength(1);
  });
});
