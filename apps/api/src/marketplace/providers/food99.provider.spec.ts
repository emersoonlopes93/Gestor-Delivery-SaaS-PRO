import { MarketplaceProvider } from '@prisma/client';
import { createHash } from 'crypto';
import { Food99Provider } from './food99.provider';

describe('Food99Provider', () => {
  const client = {
    pollEvents: jest.fn(), acknowledgeEvents: jest.fn(), fetchOrderDetails: jest.fn(),
    confirmOrder: jest.fn(), readyOrder: jest.fn(), dispatchOrder: jest.fn(), deliverOrder: jest.fn(),
    pickUpOrder: jest.fn(), requestCancellation: jest.fn(),
  };
  const credentials = {
    getFood99AppCredentials: jest.fn().mockReturnValue({ appId: 'app', clientSecret: 'secret' }),
  };
  const provider = new Food99Provider(client as never, credentials as never);
  beforeEach(() => jest.clearAllMocks());
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

  it('preserves 64-bit deliveryStatus identifiers without Number conversion', async () => {
    const rawBody = Buffer.from('{"app_id":5764608647577512345,"app_shop_id":"store-99","type":"deliveryStatus","timestamp":1768815260,"data":{"order_id":5764607618872501234,"delivery_status":130,"rider_name":"Rider"}}');
    const parsed = await provider.parseWebhookEvent({ headers: {}, rawBody, body: {} });

    expect(parsed).toMatchObject({
      topic: 'deliveryStatus',
      externalStoreId: 'store-99',
      externalOrderId: '5764607618872501234',
    });
    expect((parsed.rawPayload.data as Record<string, unknown>).order_id).toBe('5764607618872501234');
    expect((parsed.rawPayload.data as Record<string, unknown>).delivery_status).toBe(130);
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
            create_time: 1768815200, delivery_type: 2, pay_channel: 153, remark: 'Sem cebola',
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
      notes: 'Sem cebola', deliveryOwnership: 'MERCHANT', isPrepaid: false, paymentMethod: 'cash',
      customerPaidAmount: null, amountToCollect: 6.18, paymentStatus: 'PENDING',
      collectionResponsibility: 'DRIVER', merchantReceivable: null,
      merchantFundedDiscount: null, platformFundedDiscount: null, platformFees: null,
    });
    expect(normalized.items[0]).toMatchObject({ name: 'HambÃºrguer', notes: 'Bem passado', totalPrice: 35.99 });
    expect(normalized.items[0].options).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Queijo', quantity: 2, totalPrice: 3 }),
      expect.objectContaining({ name: 'Molho especial' }),
      expect.objectContaining({ name: 'Pimenta', hierarchyDepth: 1 }),
    ]));
  });

  it('preserves a realistic acai composition for the operational detail instead of reducing it to the base item', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', delivery_type: 2, pay_channel: 153,
        receive_address: { name: 'Cliente de teste', phone: '5511999999999', poi_address: 'Rua do Acai', street_number: '42', district: 'Centro', city: 'Sao Paulo', state: 'SP', reference: 'Portao azul' },
        price: { order_price: 2400, customer_need_paying_money: 2400 },
        order_items: [{
          app_item_id: 'acai-330', name: 'Copo Acai', amount: 1, sku_price: 2400, total_price: 2400, remark: 'Sem gelo',
          sub_item_list: [
            { app_item_id: 'creme', name: 'Creme', amount: 1, sku_price: 0, total_price: 0 },
            { app_item_id: 'banana', name: 'Banana', amount: 1, sku_price: 0, total_price: 0 },
            { app_item_id: 'sucrilhos', name: 'Sucrilhos', amount: 1, sku_price: 0, total_price: 0 },
          ],
        }],
      },
    });

    expect(normalized).toMatchObject({ customerPhone: '5511999999999', amountToCollect: 24, paymentStatus: 'PENDING' });
    expect(normalized.deliveryAddress).toMatchObject({ street: 'Rua do Acai', number: '42', reference: 'Portao azul' });
    expect(normalized.items[0]).toMatchObject({ name: 'Copo Acai', notes: 'Sem gelo' });
    expect(normalized.items[0].options).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Creme' }),
      expect.objectContaining({ name: 'Banana' }),
      expect.objectContaining({ name: 'Sucrilhos' }),
    ]));
  });

  it('normalizes the direct OrderModel returned by the official detail endpoint', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', order_index: 23, status: 100, create_time: 1768815200,
        price: { order_price: 3599, customer_need_paying_money: 3599 },
        receive_address: { name: 'Marina', phone: '5511999999999', poi_address: 'Rua A', city: 'Sao Paulo', district: 'Centro' },
        order_items: [{ app_item_id: 'pizza', name: 'Pizza', amount: 1, sku_price: 3599, total_price: 3599 }],
      },
    });

    expect(normalized).toMatchObject({
      externalOrderId: '5764656197621845665', externalDisplayId: '23', customerName: 'Marina', total: 35.99,
    });
    expect(normalized.items).toEqual([expect.objectContaining({ name: 'Pizza', totalPrice: 35.99 })]);
  });

  it('keeps the observed gross and customer-paid totals separate and preserves provider price facts', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764607801871631353', order_index: 210007, pay_channel: 212, delivery_type: 2,
        price: {
          order_price: 6899,
          real_price: 4289,
          real_pay_price: 4076,
          customer_need_paying_money: 4076,
          shop_paid_money: 0,
          items_discount: 3635,
        },
        promotions: [
          { promo_type: 1, save_price: 2000, shop_subside_price: 500 },
          { promo_type: 2, save_price: 1635, shop_subside_price: 135 },
        ],
        order_items: [{
          app_item_id: 'item-1', name: 'Pedido observado', amount: 1, sku_price: 6899, total_price: 6899,
          promotion_detail: { save_price: 2000, shop_subside_price: 500 },
          promo_list: [{ save_price: 2000, shop_subside_price: 500 }],
        }],
      },
    });

    expect(normalized).toMatchObject({
      externalOrderId: '5764607801871631353',
      externalDisplayId: '210007',
      itemsSubtotal: 68.99,
      grossOrderValue: 68.99,
      customerActuallyPaid: 40.76,
      customerNeedsToPay: 40.76,
      merchantEstimatedReceivable: 42.89,
      customerPaidAmount: 40.76,
      amountToCollect: 0,
      paymentStatus: 'PAID',
      merchantFundedDiscount: 6.35,
      platformFundedDiscount: null,
      merchantReceivable: null,
      providerPriceFields: { realPrice: 42.89, realPayPrice: 40.76, shopPaidMoney: 0 },
    });
  });

  it('replaces the 99Food privacy placeholder with documented name parts when available', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665',
        receive_address: {
          name: 'privacy protection', first_name: 'Marina', last_name: 'Silva', phone: '5511999999999',
        },
        price: { order_price: 3599 },
        order_items: [{ app_item_id: 'pizza', name: 'Pizza', amount: 1, sku_price: 3599, total_price: 3599 }],
      },
    });

    expect(normalized.customerName).toBe('Marina Silva');
  });

  it('uses a neutral customer label when 99Food masks every available name field', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665',
        receive_address: { name: 'privacy protection', first_name: 'privacy protected' },
        price: { order_price: 3599 },
        order_items: [{ app_item_id: 'pizza', name: 'Pizza', amount: 1, sku_price: 3599, total_price: 3599 }],
      },
    });

    expect(normalized.customerName).toBe('Cliente 99Food');
  });

  it('merges a sparse detail response with the complete order_info from orderNew', async () => {
    client.fetchOrderDetails.mockResolvedValueOnce({
      order: { order_id: '5764656197621845665', status: 100, order_items: [] },
    });
    const fetched = await provider.fetchOrderDetails({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrderId: '5764656197621845665',
      eventPayload: {
        data: {
          order_info: {
            order_id: '5764656197621845665',
            receive_address: { name: 'Marina', phone: '5511999999999' },
            price: { order_price: 3599 },
            order_items: [{ app_item_id: 'pizza', name: 'Pizza', amount: 1, sku_price: 3599, total_price: 3599 }],
          },
        },
      },
    });
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: fetched,
    });

    expect(normalized).toMatchObject({ externalOrderId: '5764656197621845665', customerName: 'Marina' });
    expect(normalized.items).toEqual([expect.objectContaining({ name: 'Pizza', totalPrice: 35.99 })]);
  });

  it.each([
    [1, 'PROVIDER'],
    [2, 'MERCHANT'],
    [9, 'UNKNOWN'],
    [undefined, 'UNKNOWN'],
  ])('maps native delivery_type %s to %s', async (deliveryType, deliveryOwnership) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: { data: { order_id: '5764656197621845665', delivery_type: deliveryType, order_items: [], price: {} } },
    });
    expect(normalized.deliveryOwnership).toBe(deliveryOwnership);
  });

  it.each([
    [153, 'cash'],
    [212, 'pix'],
    [280, 'pix'],
    [262, 'credit_card'],
    [263, 'debit_card'],
    [154, 'card_on_delivery'],
  ])('maps documented native pay_channel %s to %s', async (payChannel, paymentMethod) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', pay_channel: payChannel, pay_type: 1,
        order_items: [], price: {},
      },
    });

    expect(normalized).toMatchObject({
      externalOrderId: '5764656197621845665',
      paymentMethod,
    });
  });

  it.each([
    [2, 'cash'],
    [3, 'card_on_delivery'],
  ])('falls back to documented legacy pay_type %s when pay_channel is missing', async (payType, paymentMethod) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', pay_type: payType,
        order_items: [], price: {},
      },
    });

    expect(normalized.paymentMethod).toBe(paymentMethod);
  });

  it.each([
    { pay_channel: 999, pay_type: 2 },
    { pay_channel: 150, pay_type: 1 },
    {},
  ])('keeps unknown, ambiguous, or missing native payment data as other', async (paymentFields) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', ...paymentFields,
        order_items: [], price: {},
      },
    });

    expect(normalized).toMatchObject({
      externalOrderId: '5764656197621845665',
      paymentMethod: 'other',
    });
  });

  it.each([
    [1, 212, 'PROVIDER'],
    [2, 280, 'MERCHANT'],
  ])('marks online payment as paid by the marketplace for delivery_type %s', async (deliveryType, payChannel, ownership) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', delivery_type: deliveryType,
        pay_channel: payChannel, pay_type: 1,
        price: { order_price: 5000, customer_need_paying_money: 4200 },
        order_items: [],
      },
    });

    expect(normalized).toMatchObject({
      deliveryOwnership: ownership,
      paymentMethod: 'pix',
      paymentStatus: 'PAID',
      collectionResponsibility: 'MARKETPLACE',
      customerPaidAmount: 42,
      amountToCollect: 0,
      isPrepaid: true,
      merchantReceivable: null,
    });
  });

  it('uses documented legacy online pay_type only when pay_channel is absent', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', delivery_type: 2, pay_type: 1,
        price: { order_price: 5000, customer_need_paying_money: 4200 },
        order_items: [],
      },
    });

    expect(normalized).toMatchObject({
      paymentStatus: 'PAID', collectionResponsibility: 'MARKETPLACE',
      customerPaidAmount: 42, amountToCollect: 0,
    });
  });

  it('keeps an online channel financially known when its card method is intentionally ambiguous', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', pay_channel: 150, pay_type: 2,
        price: { customer_need_paying_money: 4200 }, order_items: [],
      },
    });

    expect(normalized).toMatchObject({
      paymentMethod: 'other', paymentStatus: 'PAID', collectionResponsibility: 'MARKETPLACE',
      customerPaidAmount: 42, amountToCollect: 0,
    });
  });

  it.each([
    [153, 'cash'],
    [154, 'card_on_delivery'],
    [262, 'credit_card'],
    [263, 'debit_card'],
  ])('keeps native pay-on-delivery channel %s pending for driver collection', async (payChannel, paymentMethod) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', delivery_type: 2,
        pay_channel: payChannel, pay_type: 1,
        price: { order_price: 5000, customer_need_paying_money: 4200 },
        order_items: [],
      },
    });

    expect(normalized).toMatchObject({
      paymentMethod,
      paymentStatus: 'PENDING',
      collectionResponsibility: 'DRIVER',
      customerPaidAmount: null,
      amountToCollect: 42,
      isPrepaid: false,
    });
  });

  it('keeps discount funding, platform fees and merchant receivable unknown', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', pay_channel: 212,
        price: {
          order_price: 5000,
          customer_need_paying_money: 4200,
          items_discount: 500,
          delivery_discount: 200,
          delivery_price: 600,
          others_fees: { coupon_discount: 100, service_price: 100 },
        },
        order_items: [],
      },
    });

    expect(normalized).toMatchObject({
      itemsSubtotal: 50,
      discountTotal: 8,
      deliveryFee: 6,
      serviceFee: 1,
      merchantFundedDiscount: null,
      platformFundedDiscount: null,
      platformFees: null,
      merchantReceivable: null,
    });
  });

  it('does not turn absent financial values into zero', async () => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'connection-1', tenantId: 'tenant-1' } as never,
      externalOrder: {
        order_id: '5764656197621845665', pay_channel: 999,
        price: {}, order_items: [],
      },
    });

    expect(normalized).toMatchObject({
      paymentStatus: 'UNKNOWN',
      collectionResponsibility: 'UNKNOWN',
      customerPaidAmount: null,
      amountToCollect: null,
      merchantReceivable: null,
      platformFees: null,
    });
    expect(normalized.discountTotal).toBeUndefined();
    expect(normalized.deliveryFee).toBeUndefined();
    expect(normalized.serviceFee).toBeUndefined();
  });
});
