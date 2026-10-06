import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { MarketplaceConnectionService } from './marketplace-connection.service';

describe('MarketplaceConnectionService multi-merchant foundation', () => {
  const makeService = () => {
    const prisma = {
      marketplaceConnection: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    const credentials = { encrypt: jest.fn((value: string) => `encrypted:${value}`) };
    return {
      prisma,
      credentials,
      service: new MarketplaceConnectionService(prisma as never, credentials as never),
    };
  };

  const existingConnection = (id: string, tenantId: string, merchantId: string) => ({
    id,
    tenantId,
    provider: MarketplaceProvider.IFOOD,
    status: MarketplaceConnectionStatus.CONNECTED,
    externalMerchantId: merchantId,
    externalStoreId: `store-${id}`,
    displayName: `Loja ${id}`,
    authType: 'manual',
    accessTokenEnc: `access-${id}`,
    refreshTokenEnc: `refresh-${id}`,
    tokenExpiresAt: null,
    settingsJson: null,
  });

  it('creates two independently credentialed merchants for the same tenant', async () => {
    const { service, prisma, credentials } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValue(null);
    prisma.marketplaceConnection.create
      .mockResolvedValueOnce({ id: 'connection-a' })
      .mockResolvedValueOnce({ id: 'connection-b' });

    await service.connectManual('tenant-1', MarketplaceProvider.IFOOD, {
      externalMerchantId: 'merchant-a',
      accessToken: 'token-a',
    });
    await service.connectManual('tenant-1', MarketplaceProvider.IFOOD, {
      externalMerchantId: 'merchant-b',
      accessToken: 'token-b',
    });

    expect(prisma.marketplaceConnection.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', externalMerchantId: 'merchant-a', accessTokenEnc: 'encrypted:token-a' }),
    }));
    expect(prisma.marketplaceConnection.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', externalMerchantId: 'merchant-b', accessTokenEnc: 'encrypted:token-b' }),
    }));
    expect(credentials.encrypt).toHaveBeenCalledWith('token-a');
    expect(credentials.encrypt).toHaveBeenCalledWith('token-b');
  });

  it('rejects a merchant already associated with any tenant', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValue({ id: 'other-tenant-connection' });

    await expect(service.connectManual('tenant-2', MarketplaceProvider.IFOOD, {
      externalMerchantId: 'merchant-a',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.marketplaceConnection.create).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant get/update/disconnect without revealing the owner', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValue(null);

    await expect(service.getTenantConnection('tenant-2', 'connection-a')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateManual('tenant-2', 'connection-a', { displayName: 'Ataque' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.disconnectById('tenant-2', 'connection-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.marketplaceConnection.update).not.toHaveBeenCalled();
  });

  it('updates only the selected connection', async () => {
    const { service, prisma } = makeService();
    const connection = existingConnection('connection-a', 'tenant-1', 'merchant-a');
    prisma.marketplaceConnection.findFirst
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(null);
    prisma.marketplaceConnection.update.mockResolvedValue({ ...connection, displayName: 'Centro' });

    await service.updateManual('tenant-1', 'connection-a', { displayName: 'Centro' });

    expect(prisma.marketplaceConnection.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'connection-a', tenantId: 'tenant-1' },
      data: expect.objectContaining({ displayName: 'Centro', externalMerchantId: 'merchant-a' }),
    }));
  });

  it('disconnects one merchant without changing another connection', async () => {
    const { service, prisma } = makeService();
    const connection = existingConnection('connection-a', 'tenant-1', 'merchant-a');
    prisma.marketplaceConnection.findFirst.mockResolvedValue(connection);
    prisma.marketplaceConnection.update.mockResolvedValue({ ...connection, status: MarketplaceConnectionStatus.DISCONNECTED });

    await service.disconnectById('tenant-1', 'connection-a');

    expect(prisma.marketplaceConnection.update).toHaveBeenCalledTimes(1);
    expect(prisma.marketplaceConnection.update).toHaveBeenCalledWith({
      where: { id: 'connection-a', tenantId: 'tenant-1' },
      data: {
        status: MarketplaceConnectionStatus.DISCONNECTED,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
      },
    });
  });

  it('requires merchantId for a new iFood connection', async () => {
    const { service, prisma } = makeService();
    await expect(service.connectManual('tenant-1', MarketplaceProvider.IFOOD, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.marketplaceConnection.create).not.toHaveBeenCalled();
  });

  it('keeps a 99Food manual entry disconnected until its token is verified', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValue(null);
    prisma.marketplaceConnection.create.mockResolvedValue({ id: 'connection-99' });

    await service.connectManual('tenant-1', MarketplaceProvider.FOOD_99, {
      externalMerchantId: '5764687916991317793',
      externalStoreId: 'pedehub-store-1',
    });

    expect(prisma.marketplaceConnection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceConnectionStatus.DISCONNECTED }),
    }));
  });

  it('removes only an unbound, never-used 99Food self-service attempt', async () => {
    const { service, prisma } = makeService();
    const pending = {
      id: 'pending-99', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      status: MarketplaceConnectionStatus.DISCONNECTED, authType: 'food99_self_service_pending',
      externalMerchantId: null, accessTokenEnc: null, refreshTokenEnc: null,
    };
    prisma.marketplaceConnection.findFirst.mockResolvedValue(pending);
    prisma.marketplaceConnection.findUnique.mockResolvedValue({
      _count: { events: 0, orders: 0, operations: 0, billEntries: 0, settlements: 0, catalogMappings: 0 },
    });

    await service.removeUnboundPendingFood99SelfService('tenant-1', 'pending-99');

    expect(prisma.marketplaceConnection.delete).toHaveBeenCalledWith({ where: { id: 'pending-99' } });
  });

  it('does not blindly remove a connected or bound 99Food connection', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValue({
      id: 'bound-99', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      status: MarketplaceConnectionStatus.CONNECTED, authType: 'food99_self_service_pending',
      externalMerchantId: '5764687916991317793', accessTokenEnc: 'encrypted:token', refreshTokenEnc: null,
    });

    await expect(service.removeUnboundPendingFood99SelfService('tenant-1', 'bound-99'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.marketplaceConnection.delete).not.toHaveBeenCalled();
  });

  it('does not remove a pending attempt once it has operational records', async () => {
    const { service, prisma } = makeService();
    prisma.marketplaceConnection.findFirst.mockResolvedValue({
      id: 'pending-with-order', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      status: MarketplaceConnectionStatus.ERROR, authType: 'food99_self_service_pending',
      externalMerchantId: null, accessTokenEnc: null, refreshTokenEnc: null,
    });
    prisma.marketplaceConnection.findUnique.mockResolvedValue({
      _count: { events: 0, orders: 1, operations: 0, billEntries: 0, settlements: 0, catalogMappings: 0 },
    });

    await expect(service.removeUnboundPendingFood99SelfService('tenant-1', 'pending-with-order'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.marketplaceConnection.delete).not.toHaveBeenCalled();
  });

  it('never returns encrypted credential material to controllers', () => {
    const { service } = makeService();
    const result = service.maskConnection(existingConnection('connection-a', 'tenant-1', 'merchant-a') as never);
    expect(result).toMatchObject({ hasAccessToken: true, hasRefreshToken: true });
    expect(result).not.toHaveProperty('accessTokenEnc');
    expect(result).not.toHaveProperty('refreshTokenEnc');
  });
});
