import { ConflictException, ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
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
    const food99SelfService = { start: jest.fn(), verify: jest.fn(), bind: jest.fn() };
    const featureControl = { resolveTenantFeature: jest.fn().mockResolvedValue({ enabled: true }) };
    const providerRegistry = { parseProvider: jest.fn().mockReturnValue(MarketplaceProvider.IFOOD) };
    const controller = new MarketplaceTenantController(
      providerRegistry as never,
      connectionService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      featureControl as never,
      {} as never,
      {} as never,
      food99SelfService as never,
    );
    const request = { user: { tenantId: 'tenant-1' } } as never;
    return { controller, connectionService, food99SelfService, featureControl, providerRegistry, request };
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

  it('starts 99Food self-service authorization without accepting tenant-provided store identifiers', async () => {
    const { controller, food99SelfService, connectionService, request } = makeController();
    food99SelfService.start.mockResolvedValue({ connection: { id: 'connection-99' }, authorizationUrl: 'https://auth.99food.test/start' });

    await expect(controller.startFood99SelfServiceAuthorization(request, {})).resolves.toEqual({
      authorizationUrl: 'https://auth.99food.test/start',
      connection: { id: 'connection-99' },
    });
    expect(food99SelfService.start).toHaveBeenCalledWith('tenant-1', undefined);
    expect(connectionService.maskConnection).toHaveBeenCalledWith({ id: 'connection-99' });
  });

  it('verifies only the tenant-owned 99Food self-service connection', async () => {
    const { controller, food99SelfService, request } = makeController();
    food99SelfService.verify.mockResolvedValue({ authorized: true, connection: { id: 'connection-99', status: 'CONNECTED' } });

    await expect(controller.verifyFood99SelfServiceAuthorization(request, { connectionId: 'connection-99' })).resolves.toEqual({
      authorized: true,
      connection: { id: 'connection-99', status: 'CONNECTED' },
    });
    expect(food99SelfService.verify).toHaveBeenCalledWith('tenant-1', 'connection-99');
  });

  it('declares verify as POST, so GET is not a supported client contract', () => {
    const handler = MarketplaceTenantController.prototype.verifyFood99SelfServiceAuthorization;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('99food/self-service/verify');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });

  it('binds only the selected shop through the tenant-scoped self-service flow', async () => {
    const { controller, food99SelfService, request } = makeController();
    food99SelfService.bind.mockResolvedValue({ authorized: true, connection: { id: 'connection-99', status: 'CONNECTED' } });

    await expect(controller.bindFood99SelfServiceAuthorization(request, { connectionId: 'connection-99', shopId: '5764687916991317793' })).resolves.toMatchObject({ authorized: true });
    expect(food99SelfService.bind).toHaveBeenCalledWith('tenant-1', 'connection-99', '5764687916991317793');
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
