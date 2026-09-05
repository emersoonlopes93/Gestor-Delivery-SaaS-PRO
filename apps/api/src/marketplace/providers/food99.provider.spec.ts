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

  it('parses the official single orderNew callback and preserves 64-bit identifiers', async () => {
    const rawBody = Buffer.from('{"app_id":5764607584567296012,"app_shop_id":"kigula_delivery_01","timestamp":1615432308,"type":"orderNew","data":{"order_id":1152921547153933576,"order_info":{"shop":{"shop_id":5764607688097661019}}}}');
    const parsed = await provider.parseWebhookEvent({
      headers: {},
      rawBody,
      body: JSON.parse(rawBody.toString('utf8')),
    });
    expect(parsed).toMatchObject({
      provider: MarketplaceProvider.FOOD_99,
      eventId: expect.stringMatching(/^food99:[a-f0-9]{64}$/),
      topic: 'orderNew',
      externalMerchantId: '5764607688097661019',
      externalStoreId: 'kigula_delivery_01',
      externalOrderId: '1152921547153933576',
      eventCreatedAt: new Date('2021-03-11T03:11:48.000Z'),
      orderPayload: null,
    });
    expect((parsed.rawPayload.data as Record<string, unknown>).order_id)
      .toBe('1152921547153933576');
    const duplicate = await provider.parseWebhookEvent({ headers: {}, rawBody, body: {} });
    expect(duplicate.eventId).toBe(parsed.eventId);
  });

  it('parses lifecycle callbacks by app_shop_id without inventing an internal shop id', async () => {
    const rawBody = Buffer.from('{"app_id":5764607772295955723,"app_shop_id":"kigula_delivery_01","type":"orderReady","timestamp":1768815260,"data":{"order_id":5764656197621845665}}');
    const parsed = await provider.parseWebhookEvent({ headers: {}, rawBody, body: {} });
    expect(parsed).toMatchObject({
      eventId: expect.stringMatching(/^food99:[a-f0-9]{64}$/),
      topic: 'orderReady',
      externalMerchantId: null,
      externalStoreId: 'kigula_delivery_01',
      externalOrderId: '5764656197621845665',
    });
  });

  it('leaves mandatory identifiers null for an unsupported or incomplete payload', async () => {
    const parsed = await provider.parseWebhookEvent({
      headers: {}, rawBody: Buffer.from('{"type":"orderNew","data":{}}'), body: {},
    });
    expect(parsed).toMatchObject({
      eventId: null,
      externalMerchantId: null,
      externalStoreId: null,
      externalOrderId: null,
    });
  });

  it('keeps the existing Open Delivery polling event parser unchanged', async () => {
    await expect(provider.parsePollingEvent({
      eventId: 'poll-event-1',
      eventType: 'CREATED',
      orderId: 'poll-order-1',
      createdAt: '2026-09-04T12:00:00Z',
    })).resolves.toMatchObject({
      eventId: 'poll-event-1',
      topic: 'CREATED',
      externalOrderId: 'poll-order-1',
      eventCreatedAt: new Date('2026-09-04T12:00:00Z'),
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
      externalOrderId: 'order-1', deliveryOwnership: 'UNKNOWN', isPrepaid: true,
      paymentMethod: 'pix', itemsSubtotal: 35, total: 35,
    });
    expect(normalized.items[0].options).toHaveLength(1);
  });

  it('normalizes native order items, nested complements, remarks and cent values', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        data: {
          order_info: {
            order_id: '5764656197621845665', order_index: 42, status: 100,
            create_time: 1768815200, delivery_type: 2, remark: 'Sem cebola',
            price: {
              order_price: 3599, customer_need_paying_money: 618,
              items_discount: 3000, delivery_discount: 500, delivery_price: 699,
              others_fees: { coupon_discount: 279, service_price: 99 },
            },
            receive_address: { name: 'JoÃ£o', phone: '5511999999999', city: 'SÃ£o Paulo', district: 'Centro', poi_address: 'Rua A' },
            order_items: [{
              app_item_id: 'burger', name: 'HambÃºrguer', amount: 1, sku_price: 3000, total_price: 3599, remark: 'Bem passado',
              sub_item_list: [
                { app_item_id: 'cheese', name: 'Queijo', amount: 2, sku_price: 150, total_price: 300 },
                { app_item_id: 'sauce', name: 'Molho especial', amount: 1, sku_price: 0, total_price: 0, sub_item_list: [{ app_item_id: 'pepper', name: 'Pimenta', amount: 1, sku_price: 0, total_price: 0 }] },
              ],
            }],
          },
        },
      },
    });
    expect(normalized).toMatchObject({
      externalOrderId: '5764656197621845665', itemsSubtotal: 35.99, total: 6.18,
      discountTotal: 37.79, deliveryFee: 6.99, serviceFee: 0.99,
      notes: 'Sem cebola', deliveryOwnership: 'UNKNOWN', isPrepaid: true,
    });
    expect(normalized.items[0]).toMatchObject({ name: 'HambÃºrguer', notes: 'Bem passado', totalPrice: 35.99 });
    expect(normalized.items[0].options).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Queijo', quantity: 2, totalPrice: 3 }),
      expect.objectContaining({ name: 'Molho especial' }),
      expect.objectContaining({ name: 'Pimenta' }),
    ]));
  });
});
