import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99SelfServiceConnectionService } from './food99-self-service-connection.service';

describe('Food99SelfServiceConnectionService', () => {
  const makeService = () => {
    const prisma = { marketplaceConnection: { create: jest.fn() } };
    const connections = { getTenantConnection: jest.fn() };
    const food99Client = { getAuthorizationUrl: jest.fn() };
    const tokens = { getAccessToken: jest.fn() };
    return {
      prisma,
      connections,
      food99Client,
      tokens,
      service: new Food99SelfServiceConnectionService(prisma as never, connections as never, food99Client as never, tokens as never),
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
    expect(food99Client.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String), started.connection.id);
  });

  it('reuses the existing 99Food connection identity for reauthorization', async () => {
    const { service, connections, food99Client, prisma } = makeService();
    const existing = { id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'connection-99' };
    connections.getTenantConnection.mockResolvedValue(existing);
    food99Client.getAuthorizationUrl.mockResolvedValue('https://auth.99food.test/start');

    await expect(service.start('tenant-a', 'connection-99')).resolves.toMatchObject({ connection: existing });
    expect(prisma.marketplaceConnection.create).not.toHaveBeenCalled();
    expect(food99Client.getAuthorizationUrl).toHaveBeenCalledWith(expect.any(String), 'connection-99');
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
    expect(tokens.getAccessToken).toHaveBeenCalledWith(pending, true);
  });

  it('does not refresh a still-usable token when a verified connection is checked again', async () => {
    const { service, connections, tokens } = makeService();
    const connected = {
      id: 'connection-99', tenantId: 'tenant-a', provider: MarketplaceProvider.FOOD_99,
      externalStoreId: 'connection-99', accessTokenEnc: 'encrypted',
      tokenExpiresAt: new Date(Date.now() + 120_000), status: MarketplaceConnectionStatus.CONNECTED,
    };
    connections.getTenantConnection.mockResolvedValue(connected);

    await service.verify('tenant-a', 'connection-99');

    expect(tokens.getAccessToken).toHaveBeenCalledWith(connected, false);
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
});
