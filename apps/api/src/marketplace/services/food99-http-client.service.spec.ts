import { MarketplaceProvider } from '@prisma/client';
import { Food99HttpClientService } from './food99-http-client.service';

describe('Food99HttpClientService native V1 actions', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  function makeService() {
    const tokens = { getAccessToken: jest.fn().mockResolvedValue('shop-token'), markAuthenticationFailed: jest.fn().mockResolvedValue(undefined) };
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

  it('refreshes once on native HTTP 401 without repeating a successful confirmation', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('{"errno":401}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"errno":0,"data":true}', { status: 200 }));
    const { service, connection, tokens } = makeService();
    tokens.getAccessToken.mockResolvedValueOnce('expired').mockResolvedValueOnce('refreshed');
    await expect(service.confirmOrder(connection, '5764656197621845665', 'correlation-1'))
      .resolves.toEqual({ accepted: true, httpStatus: 200 });
    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(2, connection, true);
    expect(String((global.fetch as jest.Mock).mock.calls[1][1].body)).toContain('"auth_token":"refreshed"');
    expect(tokens.markAuthenticationFailed).not.toHaveBeenCalled();
  });

  it('marks shop authentication failed only after a second native HTTP 401', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"errno":401}', { status: 401 }));
    const { service, connection, tokens } = makeService();
    await expect(service.confirmOrder(connection, '5764656197621845665', 'correlation-1'))
      .rejects.toMatchObject({ httpStatus: 401, retryable: false });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(tokens.markAuthenticationFailed).toHaveBeenCalledWith(connection);
  });

  it.each([
    [{ errno: 3, errmsg: 'rejected', data: true }, '99Food native request failed.'],
    [{ errno: 0, data: false }, '99Food did not confirm the order.'],
  ])('rejects confirm when the StandardResponse is not a provider success', async (payload, message) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const { service, connection } = makeService();
    await expect(service.confirmOrder(connection, '5764656197621845665', 'correlation-1')).rejects.toThrow(message);
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

  it('posts app_id as a decimal literal when requesting the native authorization URL', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ errno: 0, data: { url: 'https://auth.99food.test/start' } }), { status: 200 }));
    const tokens = { getAccessToken: jest.fn() };
    const service = new Food99HttpClientService({
      get: jest.fn((key: string) => ({
        MARKETPLACE_99FOOD_API_BASE_URL: 'https://food99.test',
        MARKETPLACE_99FOOD_APP_ID: '5764607584567296012',
      })[key]),
    } as never, tokens as never);

    await expect(service.getAuthorizationUrl('correlation-1', 'shop-1')).resolves.toBe('https://auth.99food.test/start');
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(String(request.body)).toContain('"app_id":5764607584567296012');
    expect(String(request.body)).not.toContain('"app_id":"5764607584567296012"');
  });
});
