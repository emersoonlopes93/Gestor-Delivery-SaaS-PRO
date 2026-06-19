import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { IfoodProvider } from './ifood.provider';

describe('IfoodProvider', () => {
  const provider = new IfoodProvider();

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
            name: 'Pizza',
            quantity: 2,
            unitPrice: 30,
            totalPrice: 60,
          },
        ],
      },
    });

    expect(normalized.externalOrderId).toBe('ext-order-1');
    expect(normalized.customerName).toBe('Maria');
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0].totalPrice).toBe(60);
    expect(normalized.fulfillmentType).toBe('delivery');
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
});
