import { MarketplaceConnectionStatus, MarketplaceEventStatus, MarketplaceProvider } from '@prisma/client';
import { MarketplaceOrderIngestionService } from './marketplace-order-ingestion.service';

describe('MarketplaceOrderIngestionService', () => {
  it('rejects reprocess for marketplace orders from another tenant', async () => {
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.reprocessMarketplaceOrder('marketplace-order-1', 'tenant-other')).rejects.toThrow(
      'Marketplace order not found.',
    );
  });

  it('does not duplicate the internal order on reprocess when internalOrderId already exists', async () => {
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mp-order-1',
          tenantId: 'tenant-1',
          internalOrderId: 'order-1',
          provider: MarketplaceProvider.IFOOD,
          rawPayload: {},
          connection: {
            id: 'conn-1',
            tenantId: 'tenant-1',
            provider: MarketplaceProvider.IFOOD,
            status: MarketplaceConnectionStatus.CONNECTED,
            externalMerchantId: null,
            externalStoreId: null,
            displayName: null,
            authType: null,
            accessTokenEnc: null,
            refreshTokenEnc: null,
            tokenExpiresAt: null,
            scopesJson: null,
            settingsJson: null,
            lastSyncAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      },
    };

    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.reprocessMarketplaceOrder('mp-order-1', 'tenant-1')).resolves.toEqual({
      success: true,
      skipped: true,
      reason: 'already_imported',
      internalOrderId: 'order-1',
    });
  });

  it('suppresses an out-of-order event before provider or order effects', async () => {
    const connection = {
      id: 'conn-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.IFOOD,
      externalMerchantId: 'merchant-1',
    };
    const prisma = {
      marketplaceEventInbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-1',
          provider: MarketplaceProvider.IFOOD,
          status: MarketplaceEventStatus.QUEUED,
          connection,
          externalOrderId: 'external-1',
          eventId: 'event-old',
          eventCreatedAt: new Date('2026-07-16T10:00:00.000Z'),
          correlationId: 'correlation-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({ lastExternalEventAt: new Date('2026-07-16T11:00:00.000Z') }),
      },
    };
    const provider = { fetchOrderDetails: jest.fn() };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      { get: jest.fn().mockReturnValue(provider) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processInboxEvent('inbox-1')).resolves.toEqual({
      processed: true,
      ignored: true,
      reason: 'out_of_order',
    });
    expect(provider.fetchOrderDetails).not.toHaveBeenCalled();
    expect(prisma.marketplaceEventInbox.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceEventStatus.IGNORED }),
    }));
  });

  it('keeps an event retryable when the merchant mapping is unknown', async () => {
    const prisma = {
      marketplaceEventInbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-1',
          provider: MarketplaceProvider.IFOOD,
          status: MarketplaceEventStatus.QUEUED,
          connection: null,
          externalMerchantId: 'unknown-merchant',
          externalStoreId: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      { resolveConnection: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processInboxEvent('inbox-1')).rejects.toThrow('Marketplace connection not found for event.');
    expect(prisma.marketplaceEventInbox.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceEventStatus.FAILED }),
    }));
  });
});
