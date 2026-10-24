import { MarketplaceProvider } from '@prisma/client';
import { Food99HttpClientService } from './food99-http-client.service';

describe('Food99HttpClientService native V1 actions', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  function makeService() {
    const tokens = { getAccessToken: jest.fn().mockResolvedValue('shop-token') };
    const service = new Food99HttpClientService({
      get: jest.fn((key: string) => key === 'MARKETPLACE_99FOOD_API_BASE_URL' ? 'https://food99.test' : undefined),
    } as never, tokens as never);
    const connection = { id: 'connection-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99, externalStoreId: 'shop-1' } as never;
    return { service, tokens, connection };
  }

  it('confirms with the Swagger endpoint and preserves a 64-bit order_id JSON integer', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: true, requestId: 'req-1' }), { status: 200 }));
    const { service, connection } = makeService();
    const orderId = '5764656197621845665';

    await expect(service.confirmOrder(connection, orderId, 'correlation-1')).resolves.toEqual({ accepted: true, httpStatus: 200 });

    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toBe('https://food99.test/v1/order/order/confirm');
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(String(request.body)).toContain(`"order_id":${orderId}`);
    expect(String(request.body)).not.toContain(`"order_id":"${orderId}"`);
  });

  it('confirms eligible cash payment through the native payConfirm endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: true }), { status: 200 }));
    const { service, connection } = makeService();
    await expect(service.confirmCashPayment(connection, '5764656197621845665', 'correlation-1')).resolves.toEqual({ accepted: true, httpStatus: 200 });
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toBe('https://food99.test/v1/order/order/payConfirm');
  });

  it.each([12013, 12014, 12015, 12016])('fails closed when payConfirm returns provider errno %i', async (errno) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno, errmsg: 'provider rejection', data: false }), { status: 200 }));
    const { service, connection } = makeService();

    await expect(service.confirmCashPayment(connection, '5764656197621845665', 'correlation-1'))
      .rejects.toThrow('99Food native request failed.');
  });

  it.each([
    [{ errno: 3, errmsg: 'rejected', data: true }, '99Food native request failed.'],
    [{ errno: 0, data: false }, '99Food did not confirm the order.'],
  ])('rejects confirm when the StandardResponse is not a provider success', async (payload, message) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const { service, connection } = makeService();
    await expect(service.confirmOrder(connection, '5764656197621845665', 'correlation-1')).rejects.toThrow(message);
  });

  it('obtains a fresh shop token and retries a native action once after errno 10100', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errno: 10100, errmsg: 'get auth token failed' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errno: 0, data: true }), { status: 200 }));
    const { service, tokens, connection } = makeService();
    tokens.getAccessToken.mockResolvedValueOnce('stale-shop-token').mockResolvedValueOnce('fresh-shop-token');

    await expect(service.confirmOrder(connection, '5764656197621845665', 'correlation-1'))
      .resolves.toEqual({ accepted: true, httpStatus: 200 });

    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(1, connection);
    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(2, connection, true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(String(((global.fetch as jest.Mock).mock.calls[1][1] as RequestInit).body)).toContain('fresh-shop-token');
  });

  it('does not retry a native business rejection other than errno 10100', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 12013, errmsg: 'rejected' }), { status: 200 }));
    const { service, tokens, connection } = makeService();

    await expect(service.confirmOrder(connection, '5764656197621845665', 'correlation-1'))
      .rejects.toThrow('99Food native request failed.');

    expect(tokens.getAccessToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('marks ready with the Swagger GET endpoint and exact decimal query id', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: true }), { status: 200 }));
    const { service, connection } = makeService();
    await expect(service.readyOrder(connection, '5764656197621845665', 'correlation-1')).resolves.toEqual({ accepted: true, httpStatus: 200 });
    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toBe('/v1/order/order/ready');
    expect(url.searchParams.get('order_id')).toBe('5764656197621845665');
    expect(url.searchParams.get('auth_token')).toBe('shop-token');
  });

  it('gets native detail with the exact decimal query id', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: { order_id: '5764656197621845665' } }), { status: 200 }));
    const { service, connection } = makeService();
    await expect(service.fetchOrderDetails(connection, '5764656197621845665', 'correlation-1'))
      .resolves.toEqual({ order_id: '5764656197621845665' });
    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toBe('/v1/order/order/detail');
    expect(url.searchParams.get('order_id')).toBe('5764656197621845665');
  });

  it('preserves an unquoted 64-bit order_id from the native detail response', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":0,"data":{"order_id":5764656197621845665,"order_items":[]}}',
      { status: 200 },
    ));
    const { service, connection } = makeService();

    await expect(service.fetchOrderDetails(connection, '5764656197621845665', 'correlation-1'))
      .resolves.toEqual({ order_id: '5764656197621845665', order_items: [] });
  });

  it('accepts the Swagger string response when requesting the native authorization URL', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: 'https://auth.99food.test/start' }), { status: 200 }));
    const tokens = { getAccessToken: jest.fn() };
    const service = new Food99HttpClientService({
      get: jest.fn((key: string) => ({
        MARKETPLACE_99FOOD_API_BASE_URL: 'https://food99.test',
        MARKETPLACE_99FOOD_APP_ID: '5764607584567296012',
      })[key]),
    } as never, tokens as never);

    await expect(service.getAuthorizationUrl('correlation-1')).resolves.toBe('https://auth.99food.test/start');
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toBe('https://food99.test/v1/auth/authorizationpage/getUrl');
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(String(request.body)).toContain('"app_id":5764607584567296012');
    expect(String(request.body)).not.toContain('"app_id":"5764607584567296012"');
    expect(String(request.body)).not.toContain('app_shop_id');
  });

  it('retains compatibility with a deployed authorization URL wrapper', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: { url: 'https://auth.99food.test/start' } }), { status: 200 }));
    const tokens = { getAccessToken: jest.fn() };
    const service = new Food99HttpClientService({
      get: jest.fn((key: string) => ({
        MARKETPLACE_99FOOD_API_BASE_URL: 'https://food99.test',
        MARKETPLACE_99FOOD_APP_ID: '5764607584567296012',
      })[key]),
    } as never, tokens as never);

    await expect(service.getAuthorizationUrl('correlation-1')).resolves.toBe('https://auth.99food.test/start');
  });
});
