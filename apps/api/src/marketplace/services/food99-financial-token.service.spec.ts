import { Food99FinancialTokenService } from './food99-financial-token.service';

describe('Food99FinancialTokenService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeService() {
    const credentials = {
      getFood99AppCredentials: jest.fn().mockReturnValue({ appId: 'application-123', clientSecret: 'private-secret' }),
    };
    const config = { get: jest.fn((key: string) => ({
      MARKETPLACE_99FOOD_FINANCE_API_BASE_URL: 'https://finance.test',
      MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS: '10000',
    })[key]) };
    return { service: new Food99FinancialTokenService(config as never, credentials as never), credentials };
  }

  it('signs in with app credentials and caches the finance-only token', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"accessToken":"finance-token","expiresIn":21600}', { status: 200 }));
    const { service } = makeService();
    await expect(service.getAccessToken()).resolves.toBe('finance-token');
    await expect(service.getAccessToken()).resolves.toBe('finance-token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://finance.test/v3/auth/authtoken/signIn');
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toEqual({ retailer: 'application-123', secret: 'private-secret' });
  });

  it('shares concurrent sign-ins and forces a new token after financial HTTP 401', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('{"accessToken":"first","expiresIn":21600}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"accessToken":"second","expiresIn":21600}', { status: 200 }));
    const { service } = makeService();
    await expect(Promise.all([service.getAccessToken(), service.getAccessToken()])).resolves.toEqual(['first', 'first']);
    await expect(service.getAccessToken(true)).resolves.toBe('second');
    service.invalidate();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache invalid or denied financial sign-in responses', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('{"accessToken":"missing-expiry"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"message":"denied"}', { status: 401 }));
    const { service } = makeService();
    await expect(service.getAccessToken()).rejects.toMatchObject({ providerCode: 'INVALID_FINANCE_AUTH_RESPONSE' });
    await expect(service.getAccessToken()).rejects.toMatchObject({ providerCode: 'FINANCE_AUTH_REJECTED', httpStatus: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
