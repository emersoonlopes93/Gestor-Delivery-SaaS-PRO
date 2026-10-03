import { MarketplaceConnectionStatus, MarketplaceDeliveryOwnership, MarketplacePollingStatus, MarketplaceProvider } from '@prisma/client';
import { IfoodProvider } from './ifood.provider';
import { createHmac } from 'crypto';

describe('IfoodProvider', () => {
  const client = {
    confirmOrder: jest.fn().mockResolvedValue({ accepted: true, httpStatus: 202 }),
    cancelOrder: jest.fn().mockResolvedValue({ accepted: true, httpStatus: 202 }),
  };
  const credentials = {
    getIfoodClientCredentials: jest.fn().mockReturnValue({ clientId: 'client', clientSecret: 'secret' }),
  };
  const config = { get: jest.fn().mockReturnValue('test') };
  const provider = new IfoodProvider(client as never, credentials as never, config as never);

  it('parses webhook payload into a normalized event envelope', async () => {
    const parsed = await provider.parseWebhookEvent({
      headers: {},
      body: {
        id: 'evt-1',
        topic: 'ORDER_PLACED',
        merchantId: 'merchant-1',
        storeId: 'store-1',
        order: {
          id: 'ext-order-1',
        },
      },
    });

    expect(parsed.provider).toBe(MarketplaceProvider.IFOOD);
    expect(parsed.eventId).toBe('evt-1');
    expect(parsed.externalMerchantId).toBe('merchant-1');
    expect(parsed.externalStoreId).toBe('store-1');
    expect(parsed.externalOrderId).toBe('ext-order-1');
  });

  it('normalizes a marketplace order into the internal ingestion shape', async () => {
    const normalized = await provider.normalizeOrder({
      connection: {
        id: 'conn-1',
        tenantId: 'tenant-1',
        provider: MarketplaceProvider.IFOOD,
        status: MarketplaceConnectionStatus.CONNECTED,
        externalMerchantId: 'merchant-1',
        externalStoreId: 'store-1',
        displayName: 'Loja iFood',
        authType: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        scopesJson: null,
        settingsJson: { importAsStatus: 'pending' },
        lastSyncAt: null,
        pollingStatus: MarketplacePollingStatus.DISABLED,
        pollingLastAttemptAt: null,
        pollingLastSuccessAt: null,
        pollingLastFailureAt: null,
        pollingNextAttemptAt: null,
        pollingLastError: null,
        pollingBlockedReason: null,
        pollingConsecutiveFailures: 0,
        pollingCycles: 0,
        pollingEventsReceived: 0,
        pollingEventsPersisted: 0,
        pollingDuplicateEvents: 0,
        pollingAcknowledgedEvents: 0,
        pollingAcknowledgmentFailures: 0,
        settlementFinancialAccountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      externalOrder: {
        id: 'ext-order-1',
        status: 'PLACED',
        customer: {
          name: 'Maria',
          phone: '5511999999999',
          email: 'maria@example.com',
        },
        deliveryAddress: {
          street: 'Rua A',
          number: '10',
          neighborhood: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
          zipCode: '01001000',
        },
        items: [
          {
            id: 'item-1',
            sku: 'PDV-PIZZA-01',
            name: 'Pizza',
            quantity: 2,
            unitPrice: 30,
            totalPrice: 60,
          },
        ],
      },
    });

    expect(normalized.externalOrderId).toBe('ext-order-1');
    expect(normalized.items[0]).toMatchObject({ externalItemId: 'item-1', catalogIdentity: 'PDV-PIZZA-01' });
    expect(normalized.customerName).toBe('Maria');
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0].totalPrice).toBe(60);
    expect(normalized.fulfillmentType).toBe('delivery');
    expect(normalized.deliveryOwnership).toBe(MarketplaceDeliveryOwnership.UNKNOWN);
  });

  it.each([
    ['MERCHANT', MarketplaceDeliveryOwnership.MERCHANT],
    ['IFOOD', MarketplaceDeliveryOwnership.PROVIDER],
    ['THIRD_PARTY', MarketplaceDeliveryOwnership.UNKNOWN],
  ])('maps explicit deliveredBy %s without heuristics', async (deliveredBy, expected) => {
    const normalized = await provider.normalizeOrder({
      connection: { id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.IFOOD } as never,
      externalOrder: { id: 'order-1', delivery: { deliveredBy }, items: [] },
    });
    expect(normalized.deliveryOwnership).toBe(expected);
  });

  it('maps pickup-like fulfillment aliases to pickup', async () => {
    const normalized = await provider.normalizeOrder({
      connection: {
        id: 'conn-1',
        tenantId: 'tenant-1',
        provider: MarketplaceProvider.IFOOD,
        status: MarketplaceConnectionStatus.CONNECTED,
        externalMerchantId: 'merchant-1',
        externalStoreId: 'store-1',
        displayName: 'Loja iFood',
        authType: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        scopesJson: null,
        settingsJson: { importAsStatus: 'pending' },
        lastSyncAt: null,
        pollingStatus: MarketplacePollingStatus.DISABLED,
        pollingLastAttemptAt: null,
        pollingLastSuccessAt: null,
        pollingLastFailureAt: null,
        pollingNextAttemptAt: null,
        pollingLastError: null,
        pollingBlockedReason: null,
        pollingConsecutiveFailures: 0,
        pollingCycles: 0,
        pollingEventsReceived: 0,
        pollingEventsPersisted: 0,
        pollingDuplicateEvents: 0,
        pollingAcknowledgedEvents: 0,
        pollingAcknowledgmentFailures: 0,
        settlementFinancialAccountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      externalOrder: {
        id: 'ext-order-2',
        fulfillmentType: 'takeaway',
        customer: {
          name: 'Joao',
          phone: '5511988888888',
        },
        items: [],
      },
    });

    expect(normalized.fulfillmentType).toBe('pickup');
  });

  it('delegates confirmation and cancellation to the authenticated HTTP client', async () => {
    const connection = {
      id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.IFOOD,
    } as never;
    await provider.confirmOrder({ connection, externalOrderId: 'order-1', correlationId: 'corr-1' });
    await provider.cancelOrder({ connection, externalOrderId: 'order-1', reason: '503', correlationId: 'corr-2' });
    expect(client.confirmOrder).toHaveBeenCalledWith(connection, 'order-1', 'corr-1');
    expect(client.cancelOrder).toHaveBeenCalledWith(connection, 'order-1', '503', 'corr-2');
  });

  it('validates the official HMAC-SHA256 webhook signature against the raw body', async () => {
    const rawBody = Buffer.from(JSON.stringify({ id: 'evt-1' }));
    const signature = createHmac('sha256', 'secret').update(rawBody).digest('hex');
    await expect(provider.validateWebhook({
      headers: { 'x-ifood-signature': signature },
      rawBody,
      body: { id: 'evt-1' },
    })).resolves.toBe(true);
    await expect(provider.validateWebhook({
      headers: { 'x-ifood-signature': '0'.repeat(64) },
      rawBody,
      body: { id: 'evt-1' },
    })).resolves.toBe(false);
  });
});
