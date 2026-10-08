import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection } from '@prisma/client';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99FinancialTokenService } from './food99-financial-token.service';

export type Food99FinancialRecord = Record<string, unknown>;

export type Food99FinancialWindow = {
  startDate: string;
  endDate: string;
};

const FINANCIAL_IDENTIFIER_FIELDS = [
  'orderId',
  'orderIndex',
  'dayPaymentId',
  'weekPaymentId',
  'shopId',
  'contractorId',
  'acceptor_code',
  'businessTs',
  'businessDateTime',
] as const;

const FINANCIAL_MONEY_FIELDS = [
  'commissionAmount',
  'mealOriginalAmount',
  'shopDeliveryAmount',
  'shopPreTips',
  'freeDeliveryOutcome',
  'freeDeliverySubsidy',
  'commissionBaseAmount',
  'commissionSubsidyAmount',
  'b2pDeliveryAmount',
  'payCommissionAmount',
  'minValueDifferenceAmount',
  'mealLossDeductAmount',
  'vatAmount',
  'merchantAppealAmount',
  'monthlyServicePrice',
  'gmv',
  'monthlyServiceBasePrice',
  'settlementAmount',
  'orderAmount',
  'shopActivityOutcome',
  'shopActivitySubsidy',
] as const;

const DAY_MS = 86_400_000;

export function parseFood99FinancialJson(raw: string): unknown {
  const fields = [...FINANCIAL_IDENTIFIER_FIELDS, ...FINANCIAL_MONEY_FIELDS]
    .join('|');
  const keyedIntegersPreserved = raw.replace(
    new RegExp(`("(?:${fields})"\\s*:\\s*)(-?\\d+)`, 'g'),
    '$1"$2"',
  );
  const listIntegersPreserved = keyedIntegersPreserved.replace(
    /("dayPaymentIDList"\s*:\s*\[)([^\]]*)(\])/g,
    (_match, prefix: string, list: string, suffix: string) => (
      `${prefix}${list.replace(/(^|[\s,])(-?\d+)(?=\s*(?:,|$))/g, '$1"$2"')}${suffix}`
    ),
  );
  return JSON.parse(listIntegersPreserved) as unknown;
}

export function validateFood99FinancialRange(
  startDate: string,
  endDate: string,
): { start: Date; end: Date } {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start.getTime() > end.getTime()) {
    throw new BadRequestException('A data inicial deve ser anterior ou igual a data final.');
  }
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (inclusiveDays > 31) {
    throw new BadRequestException('A 99Food aceita no maximo 31 dias por consulta financeira.');
  }
  return { start, end };
}

export function splitFood99FinancialBackfill(
  startDate: string,
  endDate: string,
): Food99FinancialWindow[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start.getTime() > end.getTime()) {
    throw new BadRequestException('A data inicial deve ser anterior ou igual a data final.');
  }
  const retentionBoundary = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth() - 3,
    end.getUTCDate(),
  ));
  if (start.getTime() < retentionBoundary.getTime()) {
    throw new BadRequestException('O backfill financeiro da 99Food e limitado a tres meses.');
  }

  const windows: Food99FinancialWindow[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const candidateEnd = new Date(cursor.getTime() + 30 * DAY_MS);
    const windowEnd = candidateEnd.getTime() < end.getTime() ? candidateEnd : end;
    windows.push({
      startDate: formatIsoDate(cursor),
      endDate: formatIsoDate(windowEnd),
    });
    cursor = new Date(windowEnd.getTime() + DAY_MS);
  }
  return windows;
}

@Injectable()
export class Food99FinancialClientService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: Food99FinancialTokenService,
  ) {}

  fetchBillEntries(
    connection: MarketplaceConnection,
    window: Food99FinancialWindow,
    correlationId: string,
  ): Promise<Food99FinancialRecord[]> {
    return this.fetchPaged(
      connection,
      '/v3/finance/finance/getShopBillDetail',
      window,
      correlationId,
    );
  }

  fetchSettlements(
    connection: MarketplaceConnection,
    window: Food99FinancialWindow,
    correlationId: string,
  ): Promise<Food99FinancialRecord[]> {
    return this.fetchPaged(
      connection,
      '/v3/finance/finance/getShopBillWeek',
      window,
      correlationId,
    );
  }

  private async fetchPaged(
    connection: MarketplaceConnection,
    path: string,
    window: Food99FinancialWindow,
    correlationId: string,
  ): Promise<Food99FinancialRecord[]> {
    const { start, end } = validateFood99FinancialRange(window.startDate, window.endDate);
    if (this.config.get<string>('MARKETPLACE_99FOOD_ENABLED') !== 'true') {
      throw new Food99ApiError(
        '99Food integration is disabled by the global provider switch.',
        false,
        503,
        'PROVIDER_DISABLED',
      );
    }
    const appShopId = connection.externalStoreId?.trim();
    if (!appShopId) {
      throw new Food99ApiError(
        '99Food connection does not have an app shop ID.',
        false,
        400,
        'APP_SHOP_ID_REQUIRED',
      );
    }

    let token = await this.tokens.getAccessToken();
    const all: Food99FinancialRecord[] = [];
    let pageNo = 1;
    let totalPages = 1;
    do {
      const body = {
        acceptor_code: appShopId,
        start_date: formatCompactDate(start),
        end_date: formatCompactDate(end),
        page_no: pageNo,
        page_size: 200,
      };
      let response = await this.execute(connection, token, path, correlationId, body);
      if (response.status === 401) {
        token = await this.tokens.getAccessToken(true);
        response = await this.execute(connection, token, path, correlationId, body);
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (contentType.includes('text/html') || contentType.includes('application/xml') || contentType.includes('text/xml')) {
        throw new Food99ApiError(
          '99Food financial API returned an unexpected content type.',
          false,
          502,
          'UNEXPECTED_CONTENT_TYPE',
        );
      }
      const raw = await response.text();
      const payload = this.asRecord(this.tryParse(raw));
      if (!response.ok || !this.isProviderSuccess(payload)) {
        throw this.toFinancialError(response.status, payload);
      }
      const data = this.asRecord(payload?.data);
      const rows = this.readRows(data);
      totalPages = this.readTotalPages(data, pageNo, rows.length === 0);
      all.push(...rows);
      if (rows.length === 0) break;
      pageNo += 1;
    } while (pageNo <= totalPages);
    return all;
  }

  private async execute(
    connection: MarketplaceConnection,
    token: string,
    path: string,
    correlationId: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch (error) {
      throw new Food99ApiError(
        `99Food financial API unavailable: ${error instanceof Error ? error.message : 'network error'}`,
        true,
      );
    }
  }

  private tryParse(raw: string): unknown {
    try {
      return parseFood99FinancialJson(raw);
    } catch {
      throw new Food99ApiError(
        '99Food financial API returned invalid JSON.',
        false,
        502,
        'INVALID_RESPONSE',
      );
    }
  }

  private isProviderSuccess(payload: Record<string, unknown> | null): boolean {
    if (!payload) return false;
    return typeof payload.errno === 'number' && payload.errno === 0 && payload.data !== undefined;
  }

  private readRows(data: Record<string, unknown> | null): Food99FinancialRecord[] {
    const candidate = data?.data ?? data?.list ?? data?.records ?? data?.items;
    if (!Array.isArray(candidate)) {
      throw new Food99ApiError(
        '99Food financial response does not contain a paged record list.',
        false,
        502,
        'INVALID_RESPONSE',
      );
    }
    return candidate.map((row) => {
      const record = this.asRecord(row);
      if (!record) {
        throw new Food99ApiError(
          '99Food financial response contains an invalid record.',
          false,
          502,
          'INVALID_RESPONSE',
        );
      }
      return record;
    });
  }

  private readTotalPages(
    data: Record<string, unknown> | null,
    currentPage: number,
    emptyPage: boolean,
  ): number {
    const candidate = data?.total_page ?? data?.totalPage;
    const value = typeof candidate === 'string' ? Number(candidate) : candidate;
    const validEmptyDataset = emptyPage && currentPage === 1 && value === 0;
    if (typeof value !== 'number'
      || !Number.isInteger(value)
      || value < 0
      || (value < currentPage && !validEmptyDataset)) {
      throw new Food99ApiError(
        '99Food financial response contains invalid pagination metadata.',
        false,
        502,
        'INVALID_RESPONSE',
      );
    }
    return value;
  }

  private toFinancialError(
    httpStatus: number,
    payload: Record<string, unknown> | null,
  ): Food99ApiError {
    const providerMessage = [payload?.errmsg, payload?.message, payload?.error_description]
      .find((value): value is string => typeof value === 'string');
    const errno = typeof payload?.errno === 'number' ? payload.errno : null;
    const providerCode = typeof payload?.error_code === 'number' ? String(payload.error_code) : null;
    return new Food99ApiError(
      errno !== null
        ? `99Food financial request was rejected (errno ${errno}).`
        : providerCode
          ? `99Food financial request was rejected (code ${providerCode}).`
          : `99Food financial request failed with HTTP ${httpStatus}.`,
      httpStatus === 429 || httpStatus >= 500,
      httpStatus,
      providerCode ?? providerMessage ?? undefined,
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private baseUrl(): string {
    return (this.config.get<string>('MARKETPLACE_99FOOD_FINANCE_API_BASE_URL')?.trim()
      || 'https://openapi.99food.com').replace(/\/$/, '');
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000);
  }
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Datas financeiras devem usar o formato YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatIsoDate(date) !== value) {
    throw new BadRequestException('Data financeira invalida.');
  }
  return date;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatCompactDate(value: Date): string {
  return formatIsoDate(value).replace(/-/g, '');
}
