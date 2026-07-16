import { ConfigService } from '@nestjs/config';
import { MarketplaceProvider } from '@prisma/client';
import { IfoodApiError } from '../providers/ifood-api.error';
import { IfoodHttpClientService } from './ifood-http-client.service';

describe('IfoodHttpClientService', () => {
  const connection = { id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.IFOOD } as never;
  const tokens = { getAccessToken: jest.fn().mockResolvedValue('token') };
  const service = new IfoodHttpClientService(
    new ConfigService({ MARKETPLACE_IFOOD_API_BASE_URL: 'https://ifood.test', MARKETPLACE_IFOOD_HTTP_TIMEOUT_MS: '1000' }),
    tokens as never,
  );

  beforeEach(() => {
    jest.restoreAllMocks();
    tokens.getAccessToken.mockReset().mockResolvedValue('token');
  });

  it('queries order details before submitting an asynchronous confirmation', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'order-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ACCEPTED' }), { status: 202 }));

    await expect(service.confirmOrder(connection, 'order-1', 'corr-1')).resolves.toEqual({
      accepted: true,
      httpStatus: 202,
      providerCode: null,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://ifood.test/order/v1.0/orders/order-1');
    expect(fetchMock.mock.calls[1][0]).toBe('https://ifood.test/order/v1.0/orders/order-1/confirm');
  });

  it('validates a cancellation code against the order-specific reason list', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'order-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reasons: [{ code: '503' }] }), { status: 200 }));

    await expect(service.cancelOrder(connection, 'order-1', '999', 'corr-2')).rejects.toMatchObject({
      retryable: false,
      providerCode: 'INVALID_CANCELLATION_REASON',
    });
  });

  it('classifies 429 as retryable and respects Retry-After', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', {
      status: 429,
      headers: { 'retry-after': '7' },
    }));

    const error = await service.fetchOrderDetails(connection, 'order-1', 'corr-3').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(IfoodApiError);
    expect(error).toMatchObject({ retryable: true, httpStatus: 429, retryAfterMs: 7000 });
  });

  it('polls a single merchant and accepts a 204 empty cycle', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(service.pollEvents(connection, 'merchant-1', 'corr-poll')).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ifood.test/events/v1.0/events:polling');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-polling-merchants')).toBe('merchant-1');
  });

  it('sends unique acknowledgment IDs using the official endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 202 }));
    await expect(service.acknowledgeEvents(connection, ['evt-1', 'evt-1', 'evt-2'], 'corr-ack')).resolves.toEqual({
      accepted: true,
      httpStatus: 202,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://ifood.test/events/v1.0/events/acknowledgment');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([{ id: 'evt-1' }, { id: 'evt-2' }]);
  });
});
