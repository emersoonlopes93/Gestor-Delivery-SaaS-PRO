import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketplaceProvider } from '@prisma/client';
import { MarketplaceTenantController } from './marketplace-tenant.controller';

describe('MarketplaceTenantController connection tenancy', () => {
  const makeController = () => {
    const connectionService = {
      listTenantConnections: jest.fn(),
      getTenantConnection: jest.fn(),
      updateManual: jest.fn(),
      disconnectById: jest.fn(),
      connectManual: jest.fn(),
      maskConnection: jest.fn((value: unknown) => value),
    };
    const food99Client = { getAuthorizationUrl: jest.fn() };
    const featureControl = { resolveTenantFeature: jest.fn().mockResolvedValue({ enabled: true }) };
    const providerRegistry = { parseProvider: jest.fn().mockReturnValue(MarketplaceProvider.IFOOD) };
    const controller = new MarketplaceTenantController(
      providerRegistry as never,
      connectionService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      food99Client as never,
      featureControl as never,
    );
    const request = { user: { tenantId: 'tenant-1' } } as never;
    return { controller, connectionService, food99Client, featureControl, providerRegistry, request };
  };

  it('lists only connections from the authenticated tenant', async () => {
    const { controller, connectionService, request } = makeController();
    connectionService.listTenantConnections.mockResolvedValue([
      { id: 'connection-a', tenantId: 'tenant-1' },
      { id: 'connection-b', tenantId: 'tenant-1' },
    ]);

    await expect(controller.listConnections(request)).resolves.toHaveLength(2);
    expect(connectionService.listTenantConnections).toHaveBeenCalledWith('tenant-1');
  });

  it.each([
    ['get', (controller: MarketplaceTenantController, request: never) => controller.getConnection(request, 'foreign-connection')],
    ['update', (controller: MarketplaceTenantController, request: never) => controller.updateConnection(request, 'foreign-connection', { displayName: 'X' })],
    ['delete', (controller: MarketplaceTenantController, request: never) => controller.removeConnection(request, 'foreign-connection')],
  ])('propagates tenant-scoped not-found for cross-tenant %s', async (_operation, invoke) => {
    const { controller, connectionService, request } = makeController();
    connectionService.getTenantConnection.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));
    connectionService.updateManual.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));
    connectionService.disconnectById.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));

    await expect(invoke(controller, request)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns conflict when a create reuses a merchant from another tenant', async () => {
    const { controller, connectionService, request } = makeController();
    connectionService.connectManual.mockRejectedValue(new ConflictException('Marketplace merchant or store is already connected.'));

    await expect(controller.connectManual(request, 'ifood', {
      externalMerchantId: 'merchant-a',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the 99Food app shop id before requesting an authorization URL', async () => {
    const { controller } = makeController();
    await expect(controller.getFood99AuthorizationUrl({})).rejects.toThrow('app shop ID is required');
  });

  it('passes the exact 99Food app shop id to the native authorization client', async () => {
    const { controller, food99Client } = makeController();
    food99Client.getAuthorizationUrl.mockResolvedValue('https://auth.99food.test/start');
    await expect(controller.getFood99AuthorizationUrl({ appShopId: 'shop-99' })).resolves.toEqual({ url: 'https://auth.99food.test/start' });
    expect(food99Client.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String), 'shop-99');
  });

  it('blocks direct iFood administration when the tenant lacks ifood_marketplace', async () => {
    const { controller, connectionService, featureControl, request } = makeController();
    featureControl.resolveTenantFeature.mockResolvedValue({ enabled: false });

    await expect(controller.connectManual(request, 'ifood', { externalMerchantId: 'merchant-a' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(connectionService.connectManual).not.toHaveBeenCalled();
  });

  it('keeps 99Food administration independent from ifood_marketplace', async () => {
    const { controller, connectionService, featureControl, providerRegistry, request } = makeController();
    featureControl.resolveTenantFeature.mockResolvedValue({ enabled: false });
    providerRegistry.parseProvider.mockReturnValue(MarketplaceProvider.FOOD_99);
    connectionService.connectManual.mockResolvedValue({ id: 'food99-a', provider: MarketplaceProvider.FOOD_99 });

    await expect(controller.connectManual(request, '99food', { externalMerchantId: 'merchant-99', externalStoreId: 'shop-99' }))
      .resolves.toEqual({ id: 'food99-a', provider: MarketplaceProvider.FOOD_99 });
    expect(connectionService.connectManual).toHaveBeenCalledWith('tenant-1', MarketplaceProvider.FOOD_99, expect.any(Object));
  });
});
