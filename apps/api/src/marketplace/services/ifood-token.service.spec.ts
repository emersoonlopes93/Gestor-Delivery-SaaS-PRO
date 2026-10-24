import { ConfigService } from '@nestjs/config';
import { MarketplaceProvider } from '@prisma/client';
import { IfoodTokenService } from './ifood-token.service';

describe('IfoodTokenService', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('coalesces concurrent token renewals for the same connection', async () => {
    const prisma = { marketplaceConnection: { update: jest.fn().mockResolvedValue({}) } };
    const credentials = {
      getIfoodClientCredentials: jest.fn().mockReturnValue({ clientId: 'client', clientSecret: 'secret' }),
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) => value),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'new-token',
      expiresIn: 21600,
    }), { status: 200 }));
    const service = new IfoodTokenService(
      prisma as never,
      new ConfigService({ MARKETPLACE_IFOOD_API_BASE_URL: 'https://ifood.test' }),
      credentials as never,
    );
    const connection = {
      id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.IFOOD,
      accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null,
    } as never;

    await expect(Promise.all([
      service.getAccessToken(connection),
      service.getAccessToken(connection),
    ])).resolves.toEqual(['new-token', 'new-token']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(prisma.marketplaceConnection.update).toHaveBeenCalledTimes(1);
  });

  it('reuses a still-valid encrypted token without network access', async () => {
    const prisma = { marketplaceConnection: { update: jest.fn() } };
    const credentials = {
      decrypt: jest.fn().mockReturnValue('valid-token'),
      getIfoodClientCredentials: jest.fn(),
      encrypt: jest.fn(),
    };
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new IfoodTokenService(prisma as never, new ConfigService({}), credentials as never);
    const connection = {
      id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.IFOOD,
      accessTokenEnc: 'encrypted-token', refreshTokenEnc: null,
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never;

    await expect(service.getAccessToken(connection)).resolves.toBe('valid-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
