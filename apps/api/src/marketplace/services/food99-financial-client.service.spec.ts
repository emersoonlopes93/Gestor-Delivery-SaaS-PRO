import { MarketplaceProvider } from '@prisma/client';
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
    const tokens = { getAccessToken: jest.fn().mockResolvedValue('shop-token') };
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
      '{"errno":0,"data":{"data":[],"total_page":1}}',
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
    expect(request.headers).toMatchObject({ authorization: 'Bearer shop-token' });
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
        '{"errno":0,"data":{"data":[{"weekPaymentId":9007199254740993}],"total_page":3}}',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        '{"errno":0,"data":{"data":[],"total_page":3}}',
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

  it('keeps settlement money as integer numbers while preserving large identifiers losslessly', () => {
    const parsed = parseFood99FinancialJson(
      '{"weekPaymentId":9223372036854775001,"shopId":5764608924570091908,"contractorId":5764608924570091909,'
      + '"dayPaymentIDList":[1945389697417496990],"withdrawAmount":144842,'
      + '"cnpjWithdrawAmount":144842,"cercAmount":0}',
    );

    expect(parsed).toEqual({
      weekPaymentId: '9223372036854775001',
      shopId: '5764608924570091908',
      contractorId: '5764608924570091909',
      dayPaymentIDList: ['1945389697417496990'],
      withdrawAmount: 144842,
      cnpjWithdrawAmount: 144842,
      cercAmount: 0,
    });
  });

  it('accepts an official empty dataset with total_page zero', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":0,"data":{"data":[],"total_page":0}}',
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
      .mockResolvedValueOnce(new Response('{"errno":0,"data":{"data":[],"total_page":1}}', { status: 200 }));
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

  it('surfaces a business errno without converting it to a whitelist assumption', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"errno":10050,"errmsg":"provider business rejection"}',
      { status: 200 },
    ));
    const { service, connection } = makeService();
    const promise = service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    );
    await expect(promise).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: 'provider business rejection',
    });
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

  it('rejects an explicit non-JSON financial response before interpreting it as an empty result', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('<html>upstream error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    const { service, connection } = makeService();
    await expect(service.fetchSettlements(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).rejects.toMatchObject({ providerCode: 'UNEXPECTED_CONTENT_TYPE' });
  });

  it('retains an alternate provider error description as diagnostics without treating it as success', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(
      '{"error_code":10050,"error_description":"provider business rejection"}',
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const { service, connection } = makeService();
    await expect(service.fetchBillEntries(
      connection,
      { startDate: '2026-09-01', endDate: '2026-09-12' },
      'correlation-1',
    )).rejects.toMatchObject<Partial<Food99ApiError>>({
      providerCode: '10050',
    });
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
