import { MarketplaceProvider } from '@prisma/client';
import { Food99TokenService } from './food99-token.service';

describe('Food99TokenService', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('requests a per-shop token and persists only encrypted material', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'token-value', expires_in: 3600 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const prisma = { marketplaceConnection: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const credentials = {
      getFood99AppCredentials: jest.fn().mockReturnValue({ appId: 'app-id', clientSecret: 'client-secret' }),
      encrypt: jest.fn().mockReturnValue('encrypted-token'), decrypt: jest.fn(),
    };
    const service = new Food99TokenService(
      prisma as never,
      { get: jest.fn((key: string) => key === 'MARKETPLACE_99FOOD_API_BASE_URL' ? 'https://food99.test' : undefined) } as never,
      credentials as never,
    );
    const token = await service.getAccessToken({
      id: 'connection-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      externalStoreId: 'shop-1', accessTokenEnc: null, tokenExpiresAt: null,
    } as never);
    expect(token).toBe('token-value');
    expect(global.fetch).toHaveBeenCalledWith('https://food99.test/v4/opendelivery/oauth/token', expect.objectContaining({ method: 'POST' }));
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(String(request.body)).toContain('client_id=app-id_shop-1');
    expect(credentials.encrypt).toHaveBeenCalledWith('token-value');
    expect(prisma.marketplaceConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'connection-1', tenantId: 'tenant-1' },
      data: expect.objectContaining({ accessTokenEnc: 'encrypted-token' }),
    }));
  });
});
