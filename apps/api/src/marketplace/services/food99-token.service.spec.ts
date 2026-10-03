import { MarketplaceProvider } from '@prisma/client';
import { Food99TokenService } from './food99-token.service';

describe('Food99TokenService', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  function makeService() {
    const prisma = { marketplaceConnection: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const credentials = {
      getFood99AppCredentials: jest.fn().mockReturnValue({ appId: '5764607523034234881', clientSecret: 'secret-value' }),
      encrypt: jest.fn().mockReturnValue('encrypted-token'), decrypt: jest.fn(),
    };
    const service = new Food99TokenService(prisma as never, {
      get: jest.fn((key: string) => key === 'MARKETPLACE_99FOOD_API_BASE_URL' ? 'https://food99.test' : undefined),
    } as never, credentials as never);
    const connection = {
      id: 'connection-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      externalStoreId: '5764607523034234882', accessTokenEnc: null, tokenExpiresAt: null,
    } as never;
    return { service, prisma, credentials, connection };
  }

  it('gets and persists a native per-shop auth token without exposing secrets in logs', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      errno: 0,
      data: { auth_token: 'token-value', token_expiration_time: 1_900_000_000, app_id: '5764607523034234881', app_shop_id: '5764607523034234882' },
    }), { status: 200 }));
    const { service, prisma, credentials, connection } = makeService();

    await expect(service.getAccessToken(connection)).resolves.toBe('token-value');
    const requestedUrl = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe('/v1/auth/authtoken/get');
    expect(requestedUrl.searchParams.get('app_id')).toBe('5764607523034234881');
    expect(requestedUrl.searchParams.get('app_shop_id')).toBe('5764607523034234882');
    expect(credentials.encrypt).toHaveBeenCalledWith('token-value');
    expect(prisma.marketplaceConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authType: 'food99_shop_auth_token' }),
    }));
  });

  it('refreshes then gets a new token and shares one concurrent refresh per connection', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errno: 0, data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errno: 0, data: { auth_token: 'token-next', token_expiration_time: 1_900_000_000 } }), { status: 200 }));
    const { service, connection } = makeService();
    await expect(Promise.all([
      service.getAccessToken(connection, true),
      service.getAccessToken(connection, true),
    ])).resolves.toEqual(['token-next', 'token-next']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String((global.fetch as jest.Mock).mock.calls[0][0])).pathname).toBe('/v1/auth/authtoken/refresh');
    expect(new URL(String((global.fetch as jest.Mock).mock.calls[1][0])).pathname).toBe('/v1/auth/authtoken/get');
  });

  it('keeps a new self-service connection pending when the shop has not authorized it yet', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 401, errmsg: 'not authorized' }), { status: 200 }));
    const { service, prisma } = makeService();
    const pendingConnection = {
      id: 'connection-pending', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      externalStoreId: '5764607523034234882', accessTokenEnc: null, tokenExpiresAt: null,
      status: 'DISCONNECTED',
    } as never;

    await expect(service.getAccessToken(pendingConnection)).rejects.toThrow('99Food shop authentication failed.');
    expect(prisma.marketplaceConnection.updateMany).not.toHaveBeenCalled();
  });
});
