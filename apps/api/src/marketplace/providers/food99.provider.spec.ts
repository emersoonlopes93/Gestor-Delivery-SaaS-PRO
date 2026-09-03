import { MarketplaceProvider } from '@prisma/client';
import { createHmac } from 'crypto';
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

  it('validates the official raw-body HMAC-SHA256 signature', async () => {
    const rawBody = Buffer.from('{"eventId":"evt-1"}');
    const signature = createHmac('sha256', 'secret').update(rawBody).digest('hex');
    await expect(provider.validateWebhook({
      headers: { 'x-app-signature': signature }, rawBody, body: {},
    })).resolves.toBe(true);
    await expect(provider.validateWebhook({
      headers: { 'x-app-signature': '0'.repeat(64) }, rawBody, body: {},
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
