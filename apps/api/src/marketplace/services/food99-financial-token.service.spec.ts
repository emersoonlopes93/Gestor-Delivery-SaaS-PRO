import { Food99FinancialTokenService } from './food99-financial-token.service';

describe('Food99FinancialTokenService', () => {
  const originalFetch = global.fetch;

  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  function setup() {
    const config = { get: jest.fn((key: string) => ({ MARKETPLACE_99FOOD_FINANCE_API_BASE_URL: 'https://finance.99food.test', MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS: '10000' })[key]) };
    const credentials = { getFood99AppCredentials: jest.fn().mockReturnValue({ appId: 'app-1', clientSecret: 'secret-1' }) };
    return { service: new Food99FinancialTokenService(config as never, credentials as never), credentials };
  }

  it('signs in with the official financial body and never writes a shop token', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: 'finance-token', expiresIn: 21600 }), { status: 200 }));
    const { service } = setup();
    await expect(service.getAccessToken()).resolves.toBe('finance-token');
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://finance.99food.test/v3/auth/authtoken/signIn');
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toEqual({ retailer: 'app-1', secret: 'secret-1' });
  });

  it('shares one sign-in across concurrent callers and caches until expiry', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: 'finance-token', expiresIn: 21600 }), { status: 200 }));
    const { service } = setup();
    await expect(Promise.all([service.getAccessToken(), service.getAccessToken(), service.getAccessToken()])).resolves.toEqual(['finance-token', 'finance-token', 'finance-token']);
    await expect(service.getAccessToken()).resolves.toBe('finance-token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed for an invalid financial auth response', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: '' }), { status: 200 }));
    const { service } = setup();
    await expect(service.getAccessToken()).rejects.toMatchObject({ providerCode: 'FINANCIAL_AUTH_FAILED' });
  });
});
