import { Food99AuthorizationClient } from './food99-authorization-client.service';
import { createHash } from 'crypto';

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

  it('uses the documented Array literal when signing shopBind and preserves decimal identifiers', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      errno: 0,
      data: { success_list: [{ shop_id: '5764687916991317793', auth_token: 'shop-token', token_expiration_time: '1893456000' }] },
    }), { status: 200 }));
    const service = new Food99AuthorizationClient({ get: jest.fn() } as never, { getFood99AppCredentials: jest.fn().mockReturnValue({ appId: '3458764610605350993', clientSecret: 'secret' }) } as never);

    await expect(service.bindShop('connection-1', '5764687916991317793')).resolves.toMatchObject({ shopId: '5764687916991317793', authToken: 'shop-token' });

    const [, request] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const body = String(request.body);
    expect(body).toContain('"shop_id":5764687916991317793');
    const sign = JSON.parse(body).sign as string;
    expect(sign).toBe(createHash('md5').update(`app_id=3458764610605350993&shop_infos=Array&timestamp=${JSON.parse(body).timestamp}secret`, 'utf8').digest('hex'));
  });

  it('preserves a numeric 64-bit shop_id from the provider response before parsing JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"errno":0,"data":{"shops":[{"shop_id":5764687916991317793,"shop_name":"Loja","bound_flag":0}]}}', { status: 200 }));
    const service = new Food99AuthorizationClient({ get: jest.fn() } as never, { getFood99AppCredentials: jest.fn().mockReturnValue({ appId: '3458764610605350993', clientSecret: 'secret' }) } as never);

    await expect(service.getAuthorizedShops()).resolves.toEqual([{ shopId: '5764687916991317793', shopName: 'Loja', boundFlag: 0, appShopId: null }]);
  });
});
