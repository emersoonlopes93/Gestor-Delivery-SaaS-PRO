import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
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
    );

    await expect(service.reprocessMarketplaceOrder('mp-order-1', 'tenant-1')).resolves.toEqual({
      success: true,
      skipped: true,
      reason: 'already_imported',
      internalOrderId: 'order-1',
    });
  });
});
