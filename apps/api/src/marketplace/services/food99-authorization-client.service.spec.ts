import { Food99AuthorizationClient } from './food99-authorization-client.service';

describe('Food99AuthorizationClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  it('uses the dedicated V3 authorization host and signs scalar discovery fields', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: { shops: [{ shop_id: 'shop-1', shop_name: 'Loja', bound_flag: 0 }] } }), { status: 200 }));
    const service = new Food99AuthorizationClient({ get: jest.fn((key: string) => key === 'MARKETPLACE_99FOOD_AUTHORIZATION_API_BASE_URL' ? 'https://authorization.99food.test' : undefined) } as never, { getFood99AppCredentials: jest.fn().mockReturnValue({ appId: 'app-1', clientSecret: 'secret' }) } as never);
    await expect(service.getAuthorizedShops()).resolves.toEqual([{ shopId: 'shop-1', shopName: 'Loja', boundFlag: 0, appShopId: null }]);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://authorization.99food.test/v3/auth/authorization/getAuthorizedShops');
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({ app_id: 'app-1', page_no: 1, page_size: 30, sign: expect.any(String) }));
  });
});
