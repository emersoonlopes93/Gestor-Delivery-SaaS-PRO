import { MarketplaceProvider } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { Food99ApiError } from '../providers/food99-api.error';
import {
  Food99FinancialClientService,
  parseFood99FinancialJson,
  splitFood99FinancialBackfill,
  validateFood99FinancialRange,
} from './food99-financial-client.service';

describe('Food99FinancialClientService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeService() {
    const tokens = { getAccessToken: jest.fn().mockResolvedValue('finance-token'), invalidate: jest.fn() };
    const service = new Food99FinancialClientService({
      get: jest.fn((key: string) => ({
        MARKETPLACE_99FOOD_FINANCE_API_BASE_URL: 'https://food99-finance.test',
        MARKETPLACE_99FOOD_ENABLED: 'true',
      })[key]),
    } as never, tokens as never);
    const connection = {
      id: 'connection-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.FOOD_99,
      externalStoreId: '5764608924570091908',
    } as never;
    return { service, tokens, connection };
  }

  it('preserves all official identifiers and signed cents above the JS safe integer limit', () => {
    const parsed = parseFood99FinancialJson(
      '{"orderId":5764609487470920339,"dayPaymentId":1945389697417496990,'
      + '"weekPaymentId":9223372036854775001,"shopId":5764608924570091908,'
      + '"businessTs":1945389697417496991,"settlementAmount":-9223372036854775000,'
      + '"dayPaymentIDList":[1945389697417496990,"1945389697417496991"]}',
    );
    expect(parsed).toEqual({
      orderId: '5764609487470920339',
      dayPaymentId: '1945389697417496990',
      weekPaymentId: '9223372036854775001',
      shopId: '5764608924570091908',
      businessTs: '1945389697417496991',
      settlementAmount: '-9223372036854775000',
      dayPaymentIDList: ['1945389697417496990', '1945389697417496991'],
    });
    expect(JSON.stringify(parsed)).not.toContain('e+');
  });

  it('enforces 31-day request windows and splits a three-month backfill', () => {
    expect(validateFood99FinancialRange('2026-08-01', '2026-08-31')).toBeDefined();
    expect(() => validateFood99FinancialRange('2026-08-01', '2026-09-01')).toThrow('31 dias');
    expect(splitFood99FinancialBackfill('2026-06-12', '2026-09-12')).toEqual([
      { startDate: '2026-06-12', endDate: '2026-07-12' },
      { startDate: '2026-07-13', endDate: '2026-08-12' },
      { startDate: '2026-08-13', endDate: '2026-09-12' },
    ]);
    expect(() => splitFood99FinancialBackfill('2026-06-11', '2026-09-12')).toThrow('tres meses');
  });

  it('uses the finance endpoint, Bearer token, exact acceptor_code and page_size 200', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":0,"data":{"list":[],"total_page":1}}',
      { status: 200 },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).resolves.toEqual([]);

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://food99-finance.test/v3/finance/finance/getShopBillDetail');
    expect(request.headers).toMatchObject({ authorization: 'Bearer finance-token' });
    expect(JSON.parse(String(request.body))).toEqual({
      acceptor_code: '5764608924570091908',
      start_date: '20260901',
      end_date: '20260912',
      page_no: 1,
      page_size: 200,
    });
  });

  it('paginates until total_page and stops safely on an empty page', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(
        '{"errno":0,"data":{"list":[{"weekPaymentId":9007199254740993}],"total_page":3}}',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        '{"errno":0,"data":{"list":[],"total_page":3}}',
        { status: 200 },
      ));
    const { service, connection } = makeService();
    await expect(service.fetchSettlements(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).resolves.toEqual([{ weekPaymentId: '9007199254740993' }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((global.fetch as jest.Mock).mock.calls[1][1].body)).page_no).toBe(2);
  });

  it('accepts an official empty dataset with total_page zero', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":0,"data":{"list":[],"total_page":0}}',
      { status: 200 },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchSettlements(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired Bearer token once before accepting a financial page', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('{"errno":401}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"errno":0,"data":{"list":[],"total_page":1}}', { status: 200 }));
    const { service, connection, tokens } = makeService();
    tokens.getAccessToken.mockResolvedValueOnce('expired-token').mockResolvedValueOnce('fresh-token');
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).resolves.toEqual([]);
    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(2, true);
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers).toMatchObject({
      authorization: 'Bearer fresh-token',
    });
  });

  it('maps special access denial to FINANCE_ACCESS_NOT_ENABLED instead of an empty dataset', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":403,"errmsg":"shop is not in finance whitelist"}',
      { status: 403 },
    ));
    const { service, connection } = makeService();
    const promise = service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    );
    await expect(promise).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: 'FINANCE_ACCESS_NOT_ENABLED',
    });
  });

  it('accepts a successful financial envelope whose business code is a string', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"code":"0","data":{"records":[],"totalPage":"0"}}',
      { status: 200 },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchSettlements(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-string-code',
    )).resolves.toEqual([]);
  });

  it('rejects an HTTP 200 business error without exposing provider text or persisting an inferred result', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"code":"100401","message":"merchant-specific diagnostic","data":null}',
      { status: 200 },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-business-error',
    )).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: 'FINANCE_PROVIDER_BUSINESS_100401',
      httpStatus: 200,
    });
  });

  it('classifies the observed HTTP 200 error_code envelope as a provider business error', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"error_code":"40001","error_description":"provider diagnostic","Details":"provider details","request_id":"provider-request"}',
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-error-code-envelope',
    )).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: 'FINANCE_PROVIDER_BUSINESS_40001',
      httpStatus: 200,
    });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      message: 'food99_financial_provider_rejected',
      errorCode: 40001,
      hasErrorCode: true,
      hasProviderMessage: true,
      rootKeys: ['Details', 'error_code', 'error_description', 'request_id'],
    }));
    expect(warn.mock.calls.flat().join('')).not.toContain('provider diagnostic');
    expect(warn.mock.calls.flat().join('')).not.toContain('provider details');
  });

  it('keeps an HTTP 200 empty body distinct from a legitimate empty dataset', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const { service, connection } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-empty-body',
    )).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: 'FINANCE_EMPTY_RESPONSE',
      httpStatus: 502,
    });
  });

  it('reports an HTTP 200 envelope without contract markers as unrecognized without logging its body', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }));
    const { service, connection } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-unrecognized-envelope',
    )).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: 'FINANCE_RESPONSE_UNRECOGNIZED',
      httpStatus: 200,
    });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      message: 'food99_financial_provider_rejected',
      contentType: 'application/json',
      bodyBytes: 2,
      bodyPresent: true,
      rootType: 'object',
      rootKeys: [],
      dataType: null,
      dataKeys: null,
    }));
    expect(warn.mock.calls.flat().join('')).not.toContain('{}');
  });

  it('keeps a persistent 401 distinct from PedeHub RBAC and uncertain whitelist denial', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"errno":401}', { status: 401 }));
    const { service, connection, tokens } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).rejects.toMatchObject<Partial<Food99ApiError>>({
      httpStatus: 401,
      providerCode: 'FINANCE_PROVIDER_UNAUTHORIZED',
    });
    expect(tokens.getAccessToken).toHaveBeenNthCalledWith(2, true);
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
  });

  it('surfaces provider failures instead of returning an empty dataset', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":500,"errmsg":"provider unavailable"}',
      { status: 500 },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchSettlements(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).rejects.toMatchObject({ retryable: true, httpStatus: 500 });
  });

  it('preserves the global 99Food kill switch before any provider request', async () => {
    const service = new Food99FinancialClientService({ get: jest.fn().mockReturnValue('false') } as never, {
      getAccessToken: jest.fn(),
    } as never);
    await expect(service.fetchBillEntries(
      { externalStoreId: '5764608924570091908' } as never,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).rejects.toMatchObject({ providerCode: 'PROVIDER_DISABLED' });
    expect(global.fetch).toBe(originalFetch);
  });
});
