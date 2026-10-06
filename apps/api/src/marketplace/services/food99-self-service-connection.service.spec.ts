import { BadGatewayException, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99SelfServiceConnectionService } from './food99-self-service-connection.service';

describe('Food99SelfServiceConnectionService', () => {
  const makeService = () => {
    const prisma = { marketplaceConnection: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const connections = { getTenantConnection: jest.fn() };
    const food99Client = { getAuthorizationUrl: jest.fn() };
    const tokens = { getAccessToken: jest.fn(), persistBoundShopToken: jest.fn() };
    const authorization = { getAuthorizedShops: jest.fn(), bindShop: jest.fn() };
    authorization.getAuthorizedShops.mockResolvedValue([]);
    return {
      prisma,
      connections,
      food99Client,
      tokens,
      authorization,
      service: new Food99SelfServiceConnectionService(prisma as never, connections as never, food99Client as never, tokens as never, authorization as never),
    };
  };

  it('creates an opaque, stable app_shop_id from the persisted connection identity', async () => {
    const { service, prisma, food99Client } = makeService();
    prisma.marketplaceConnection.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    food99Client.getAuthorizationUrl.mockResolvedValue('https://auth.99food.test/start');

    const started = await service.start('tenant-a');

    expect(started.connection.id).toBe(started.connection.externalStoreId);
    expect(started.connection.provider).toBe(MarketplaceProvider.FOOD_99);
    expect(started.connection.status).toBe(MarketplaceConnectionStatus.DISCONNECTED);
    expect(started.connection.externalMerchantId).toBeUndefined();
    expect(food99Client.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String));
  });

  it('reuses an unbound pending self-service connection unless a new store is explicitly requested', async () => {
    const { service, prisma, food99Client } = makeService();
    const pending = { id: 'connection-pending', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-pending', authType: 'food99_self_service_pending', status: MarketplaceConnectionStatus.DISCONNECTED };
    prisma.marketplaceConnection.findFirst.mockResolvedValue(pending);
    food99Client.getAuthorizationUrl.mockResolvedValue('https://auth.99food.test/start');

    await expect(service.start('tenant-a')).resolves.toMatchObject({ connection: pending });
    expect(prisma.marketplaceConnection.create).not.toHaveBeenCalled();
    expect(prisma.marketplaceConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ authType: 'food99_self_service_pending' }) }));
  });

  it('starts discovery before token lookup for an unbound self-service connection', async () => {
    const { service, connections, tokens, authorization } = makeService();
    const pending = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99', authType: 'food99_self_service_pending', externalMerchantId: null, accessTokenEnc: null, refreshTokenEnc: null };
    connections.getTenantConnection.mockResolvedValue(pending);
    authorization.getAuthorizedShops.mockResolvedValue([]);

    await expect(service.verify('tenant-a', 'connection-99')).rejects.toBeInstanceOf(ConflictException);
    expect(tokens.getAccessToken).not.toHaveBeenCalled();
  });

  it('never selects the first authorized shop when multiple unbound shops are returned', async () => {
    const { service, connections, tokens, authorization } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' });
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('missing', false, 200, 'AUTH_TOKEN_NOT_AVAILABLE'));
    authorization.getAuthorizedShops.mockResolvedValue([{ shopId: 'a', shopName: 'A', boundFlag: 0 }, { shopId: 'b', shopName: 'B', boundFlag: 0 }]);
    await expect(service.verify('tenant-a', 'connection-99')).resolves.toMatchObject({ authorized: false, state: 'AUTHORIZED_SHOP_SELECTION_REQUIRED', candidates: [{ shopId: 'a', shopName: 'A' }, { shopId: 'b', shopName: 'B' }] });
    expect(authorization.bindShop).not.toHaveBeenCalled();
  });

  it('binds the single revalidated shop exactly once and persists its returned token', async () => {
    const { service, connections, tokens, authorization } = makeService();
    const pending = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' };
    const connected = { ...pending, status: MarketplaceConnectionStatus.CONNECTED, externalMerchantId: 'shop-a' };
    connections.getTenantConnection.mockResolvedValueOnce(pending).mockResolvedValueOnce(connected);
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('missing', false, 200, 'AUTH_TOKEN_NOT_AVAILABLE'));
    authorization.getAuthorizedShops.mockResolvedValue([{ shopId: 'shop-a', shopName: 'A', boundFlag: 0 }]);
    authorization.bindShop.mockResolvedValue({ shopId: 'shop-a', shopName: 'A', authToken: 'token-a', tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z') });

    await expect(service.verify('tenant-a', 'connection-99')).resolves.toEqual({ authorized: true, connection: connected });
    expect(authorization.bindShop).toHaveBeenCalledWith('connection-99', 'shop-a');
    expect(tokens.persistBoundShopToken).toHaveBeenCalledWith(pending, 'token-a', expect.any(Date), {
      externalMerchantId: 'shop-a',
      displayName: 'A',
    });
  });

  it('binds a single documented-minimum candidate without legacy binding fields', async () => {
    const { service, connections, tokens, authorization } = makeService();
    const pending = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' };
    const connected = { ...pending, status: MarketplaceConnectionStatus.CONNECTED, externalMerchantId: '1152921645439779073' };
    connections.getTenantConnection.mockResolvedValueOnce(pending).mockResolvedValueOnce(connected);
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('missing', false, 200, 'AUTH_TOKEN_NOT_AVAILABLE'));
    authorization.getAuthorizedShops.mockResolvedValue([{ shopId: '1152921645439779073', shopName: null, boundFlag: null, appShopId: null }]);
    authorization.bindShop.mockResolvedValue({ shopId: '1152921645439779073', shopName: null, authToken: 'token-a', tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z') });

    await expect(service.verify('tenant-a', 'connection-99')).resolves.toEqual({ authorized: true, connection: connected });
    expect(authorization.bindShop).toHaveBeenCalledWith('connection-99', '1152921645439779073');
  });

  it('does not report SHOP_ALREADY_BOUND without provider bound evidence for another app_shop_id', async () => {
    const { service, connections, authorization } = makeService();
    const pending = {
      id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99,
      externalStoreId: 'connection-99', authType: 'food99_self_service_pending',
      externalMerchantId: null, accessTokenEnc: null, refreshTokenEnc: null,
    };
    const connected = { ...pending, status: MarketplaceConnectionStatus.CONNECTED, externalMerchantId: 'shop-a' };
    connections.getTenantConnection.mockResolvedValueOnce(pending).mockResolvedValueOnce(connected);
    authorization.getAuthorizedShops.mockResolvedValue([{ shopId: 'shop-a', shopName: 'A', boundFlag: null, appShopId: null }]);
    authorization.bindShop.mockResolvedValue({ shopId: 'shop-a', shopName: 'A', authToken: 'token-a', tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z') });

    await expect(service.verify('tenant-a', 'connection-99')).resolves.toEqual({ authorized: true, connection: connected });
    expect(authorization.bindShop).toHaveBeenCalledWith('connection-99', 'shop-a');
  });

  it('validates a manual app_shop_id without discovering or binding a shop', async () => {
    const { service, connections, tokens, authorization } = makeService();
    const connection = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'manual-app-shop' };
    const connected = { ...connection, status: MarketplaceConnectionStatus.CONNECTED };
    connections.getTenantConnection.mockResolvedValueOnce(connection).mockResolvedValueOnce(connected);
    tokens.getAccessToken.mockResolvedValue('token-a');

    await expect(service.verifyExistingToken('tenant-a', 'connection-99')).resolves.toEqual(connected);
    expect(authorization.getAuthorizedShops).not.toHaveBeenCalled();
    expect(authorization.bindShop).not.toHaveBeenCalled();
  });

  it('revalidates a selected shop before binding and never binds a shop from another response', async () => {
    const { service, connections, authorization } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' });
    authorization.getAuthorizedShops.mockResolvedValue([{ shopId: 'shop-b', shopName: 'B', boundFlag: 0 }]);

    await expect(service.bind('tenant-a', 'connection-99', 'shop-a')).rejects.toMatchObject({ response: expect.objectContaining({ error: 'AUTHORIZED_SHOP_NOT_FOUND' }) });
    expect(authorization.bindShop).not.toHaveBeenCalled();
  });

  it('coalesces concurrent verification attempts so shopBind runs once', async () => {
    const { service, connections, tokens, authorization } = makeService();
    const pending = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' };
    connections.getTenantConnection.mockResolvedValue(pending);
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('missing', false, 200, 'AUTH_TOKEN_NOT_AVAILABLE'));
    authorization.getAuthorizedShops.mockResolvedValue([{ shopId: 'shop-a', shopName: 'A', boundFlag: 0 }]);
    authorization.bindShop.mockResolvedValue({ shopId: 'shop-a', shopName: 'A', authToken: 'token-a', tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z') });

    await Promise.all([service.verify('tenant-a', 'connection-99'), service.verify('tenant-a', 'connection-99')]);
    expect(authorization.bindShop).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing 99Food connection identity for reauthorization', async () => {
    const { service, connections, food99Client, prisma } = makeService();
    const existing = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' };
    connections.getTenantConnection.mockResolvedValue(existing);
    food99Client.getAuthorizationUrl.mockResolvedValue('https://auth.99food.test/start');

    await expect(service.start('tenant-a', 'connection-99')).resolves.toMatchObject({ connection: existing });
    expect(prisma.marketplaceConnection.create).not.toHaveBeenCalled();
    expect(food99Client.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String));
  });

  it('does not reveal or reuse another tenant connection during reauthorization', async () => {
    const { service, connections, food99Client } = makeService();
    connections.getTenantConnection.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));

    await expect(service.start('tenant-b', 'connection-99')).rejects.toBeInstanceOf(NotFoundException);
    expect(food99Client.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('rejects a non-99Food connection instead of overwriting it', async () => {
    const { service, connections } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'ifood-1', tenantId: 'tenant-a', provider: MarketplaceProvider.IFOOD, externalStoreId: 'merchant-1' });

    await expect(service.start('tenant-a', 'ifood-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies authorization through the operational token and reloads the canonical connection', async () => {
    const { service, connections, tokens } = makeService();
    const pending = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99', accessTokenEnc: null, tokenExpiresAt: null };
    const connected = { ...pending, status: MarketplaceConnectionStatus.CONNECTED };
    connections.getTenantConnection.mockResolvedValueOnce(pending).mockResolvedValueOnce(connected);

    await expect(service.verify('tenant-a', 'connection-99')).resolves.toEqual({ authorized: true, connection: connected });
    expect(tokens.getAccessToken).toHaveBeenCalledWith(pending);
  });

  it('keeps an unconfirmed authorization actionable instead of surfacing a generic server error', async () => {
    const { service, connections, tokens } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' });
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('99Food shop authentication failed.', false, 200));

    await expect(service.verify('tenant-a', 'connection-99')).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports a transient 99Food authorization outage without claiming the shop rejected it', async () => {
    const { service, connections, tokens } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' });
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('99Food authentication unavailable.', true));

    await expect(service.verify('tenant-a', 'connection-99')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    ['AUTH_TOKEN_NOT_AVAILABLE', ConflictException],
    ['AUTH_TOKEN_REFRESHED_WAIT_RETRY', ConflictException],
    ['APP_ID_INVALID', ServiceUnavailableException],
    ['APP_SECRET_INVALID', ServiceUnavailableException],
    ['TOKEN_REFRESH_FAILED', ServiceUnavailableException],
  ])('maps %s to an actionable semantic verification response', async (providerCode, exception) => {
    const { service, connections, tokens } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' });
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('99Food shop authentication failed.', false, 200, providerCode));

    await expect(service.verify('tenant-a', 'connection-99')).rejects.toBeInstanceOf(exception);
  });

  it('reports a provider business rejection separately from an unavailable authorization response', async () => {
    const { service, connections, tokens } = makeService();
    connections.getTenantConnection.mockResolvedValue({ id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' });
    tokens.getAccessToken.mockRejectedValue(new Food99ApiError('provider rejected discovery', false, 200, 'PROVIDER_AUTHORIZATION_REJECTED'));

    await expect(service.verify('tenant-a', 'connection-99')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
