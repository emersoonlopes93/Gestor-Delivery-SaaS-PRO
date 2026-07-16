import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { MarketplaceConnectionService } from './marketplace-connection.service';

describe('MarketplaceConnectionService', () => {
  const makeService = () => {
    const prisma = {
      marketplaceConnection: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    return {
      prisma,
      credentials: { encrypt: jest.fn((value: string) => `encrypted:${value}`) },
      service: new MarketplaceConnectionService(
        prisma as never,
        { encrypt: jest.fn((value: string) => `encrypted:${value}`) } as never,
      ),
    };
  };

  it('creates a connection when none exists and reuses tenant/provider on update path', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValueOnce(null);
    prisma.marketplaceConnection.create.mockResolvedValueOnce({
      id: 'connection-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.IFOOD,
      status: MarketplaceConnectionStatus.CONNECTED,
    });

    const created = await service.connectManual('tenant-1', MarketplaceProvider.IFOOD, {
      externalMerchantId: 'merchant-1',
      externalStoreId: 'store-1',
      displayName: 'Loja iFood',
      settingsJson: { smokeTest: true },
    });

    expect(prisma.marketplaceConnection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        provider: MarketplaceProvider.IFOOD,
        status: MarketplaceConnectionStatus.CONNECTED,
      }),
    }));
    expect(created.id).toBe('connection-1');
  });

  it('updates an existing connection by id', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValueOnce({
      id: 'connection-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.IFOOD,
    });
    prisma.marketplaceConnection.update.mockResolvedValueOnce({
      id: 'connection-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.IFOOD,
      status: MarketplaceConnectionStatus.CONNECTED,
    });

    const updated = await service.connectManual('tenant-1', MarketplaceProvider.IFOOD, {
      externalMerchantId: 'merchant-1',
      externalStoreId: 'store-1',
      displayName: 'Loja iFood',
      settingsJson: { smokeTest: true },
    });

    expect(prisma.marketplaceConnection.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'connection-1', tenantId: 'tenant-1' },
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        provider: MarketplaceProvider.IFOOD,
      }),
    }));
    expect(updated.id).toBe('connection-1');
  });

  it('encrypts tokens before persistence', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValueOnce(null);
    prisma.marketplaceConnection.create.mockResolvedValueOnce({ id: 'connection-1' });

    await service.connectManual('tenant-1', MarketplaceProvider.IFOOD, {
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    });

    expect(prisma.marketplaceConnection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accessTokenEnc: 'encrypted:access-secret',
        refreshTokenEnc: 'encrypted:refresh-secret',
      }),
    }));
  });
});
