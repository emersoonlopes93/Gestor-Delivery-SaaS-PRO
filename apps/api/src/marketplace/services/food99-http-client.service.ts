import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection } from '@prisma/client';
import type { MarketplacePollAcknowledgment } from '../marketplace.types';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99TokenService } from './food99-token.service';

type Food99ErrorPayload = { title?: unknown; status?: unknown; cancellationStatus?: unknown };

const FOOD99_EVENT_TYPES = [
  'CREATED', 'CONFIRMED', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'CONCLUDED',
  'CANCELLATION_REQUESTED', 'CANCELLATION_REQUEST_DENIED', 'CANCELLED',
  'ORDER_CANCELLATION_REQUEST', 'CANCELLED_DENIED',
] as const;

@Injectable()
export class Food99HttpClientService {
  private readonly logger = new Logger(Food99HttpClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: Food99TokenService,
  ) {}

  fetchOrderDetails(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    return this.requestStandard<Record<string, unknown>>(connection, {
      method: 'GET', path: '/v1/order/order/detail', externalOrderId, correlationId,
    });
  }

  async pollEvents(connection: MarketplaceConnection, correlationId: string): Promise<Record<string, unknown>[]> {
    const query = new URLSearchParams();
    for (const eventType of FOOD99_EVENT_TYPES) query.append('eventType', eventType);
    const fromTime = connection.pollingLastSuccessAt
      ?? new Date(Date.now() - this.pollingLookbackMs());
    query.set('fromTime', fromTime.toISOString());
    const response = await this.request(connection, {
      method: 'GET',
      path: `/v4/opendelivery/v1/events:polling?${query.toString()}`,
      correlationId,
    });
    if (response.status === 204) return [];
    if (!response.ok) throw await this.toError(response);
    const payload = await this.readUnknown(response);
    if (!Array.isArray(payload)) {
      throw new Food99ApiError('99Food polling response is not an event array.', false, response.status, 'INVALID_RESPONSE');
    }
    return payload.filter((event): event is Record<string, unknown> => (
      typeof event === 'object' && event !== null && !Array.isArray(event)
    ));
  }

  async acknowledgeEvents(
    connection: MarketplaceConnection,
    events: MarketplacePollAcknowledgment[],
    correlationId: string,
  ): Promise<{ accepted: true; httpStatus: number }> {
    if (events.length === 0) {
      throw new Food99ApiError('99Food acknowledgment requires at least one event.', false, 400, 'INVALID_ACK_BATCH');
    }
    const response = await this.request(connection, {
      method: 'POST',
      path: '/v4/opendelivery/v1/events/acknowledgment',
      correlationId,
      body: events,
    });
    if (response.status !== 202) throw await this.toError(response);
    return { accepted: true, httpStatus: response.status };
  }

  async getAuthorizationUrl(correlationId: string, appShopId: string): Promise<string> {
    const baseUrl = this.baseUrl();
    const appId = this.config.get<string>('MARKETPLACE_99FOOD_APP_ID')?.trim();
    if (!appId) throw new Food99ApiError('99Food application ID is not configured.', false, 503, 'APP_ID_REQUIRED');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/auth/authorizationpage/getUrl`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-correlation-id': correlationId },
        body: this.losslessAuthorizationBody(appId, appShopId),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new Food99ApiError(`99Food authorization page unavailable: ${message}`, true);
    }
    const payload = await this.readUnknown(response);
    const record = this.asRecord(payload);
    const data = this.asRecord(record?.data);
    const url = typeof data?.url === 'string' ? data.url : null;
    if (response.status !== 200 || record?.errno !== 0 || !url) {
      this.logNativeRejection({ endpoint: '/v1/auth/authorizationpage/getUrl', correlationId, httpStatus: response.status, payload: record });
      throw new Food99ApiError('99Food authorization page request failed.', response.status === 429 || response.status >= 500, response.status, typeof record?.errmsg === 'string' ? record.errmsg : undefined);
    }
    return url;
  }

  async confirmOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    const data = await this.requestStandard<boolean>(connection, {
      method: 'POST', path: '/v1/order/order/confirm', externalOrderId, correlationId,
    });
    if (data !== true) throw new Food99ApiError('99Food did not confirm the order.', false, 200, 'CONFIRM_NOT_ACCEPTED');
    return { accepted: true as const, httpStatus: 200 };
  }

  async readyOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    await this.requestStandard(connection, { method: 'GET', path: '/v1/order/order/ready', externalOrderId, correlationId });
    return { accepted: true as const, httpStatus: 200 };
  }

  async dispatchOrder(_connection: MarketplaceConnection, _externalOrderId: string, _correlationId: string): Promise<{ accepted: true; httpStatus: number }> {
    throw new Food99ApiError('99Food dispatch is not supported by the native order contract.', false, 501, 'UNSUPPORTED_OPERATION');
  }

  async deliverOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    await this.requestStandard(connection, { method: 'GET', path: '/v1/order/order/delivered', externalOrderId, correlationId });
    return { accepted: true as const, httpStatus: 200 };
  }

  async pickUpOrder(_connection: MarketplaceConnection, _externalOrderId: string, _correlationId: string): Promise<{ accepted: true; httpStatus: number }> {
    throw new Food99ApiError('99Food pickup is not supported by the native order contract.', false, 501, 'UNSUPPORTED_OPERATION');
  }

  async requestCancellation(_connection: MarketplaceConnection, _externalOrderId: string, _reason: string, _correlationId: string): Promise<{ accepted: true; httpStatus: number }> {
    throw new Food99ApiError('99Food cancellation reasons are unavailable.', false, 501, 'CANCEL_REASON_UNAVAILABLE');
  }

  private async requestAccepted(
    connection: MarketplaceConnection,
    input: { path: string; correlationId: string; body?: unknown },
  ) {
    const response = await this.request(connection, { method: 'POST', ...input });
    if (response.status !== 202) throw await this.toError(response);
    return { accepted: true as const, httpStatus: response.status };
  }

  private async requestStandard<T = unknown>(
    connection: MarketplaceConnection,
    input: { method: 'GET' | 'POST'; path: string; externalOrderId: string; correlationId: string },
  ): Promise<T> {
    this.assertDecimalIdentifier(input.externalOrderId);
    const token = await this.tokens.getAccessToken(connection);
    const url = new URL(`${this.baseUrl()}${input.path}`);
    if (input.method === 'GET') {
      url.searchParams.set('auth_token', token);
      url.searchParams.set('order_id', input.externalOrderId);
    }
    const body = input.method === 'POST' ? this.losslessOrderBody(token, input.externalOrderId) : undefined;
    const response = await this.executeNative(connection, url, input.method, body, input);
    const payload = this.asRecord(await this.readUnknown(response));
    if (response.status !== 200 || payload?.errno !== 0) {
      this.logNativeRejection({ endpoint: input.path, correlationId: input.correlationId, httpStatus: response.status, payload });
      throw new Food99ApiError('99Food native request failed.', response.status === 429 || response.status >= 500, response.status, typeof payload?.errmsg === 'string' ? payload.errmsg : undefined);
    }
    return payload?.data as T;
  }

  private losslessOrderBody(authToken: string, orderId: string): string {
    this.assertDecimalIdentifier(orderId);
    return `{"auth_token":${JSON.stringify(authToken)},"order_id":${orderId}}`;
  }

  private losslessAuthorizationBody(appId: string, appShopId: string): string {
    this.assertDecimalIdentifier(appId);
    return `{"app_id":${appId},"app_shop_id":${JSON.stringify(appShopId)}}`;
  }

  private logNativeRejection(input: { endpoint: string; correlationId: string; httpStatus: number; payload: Record<string, unknown> | null }): void {
    this.logger.warn({
      message: 'food99_native_response_rejected',
      provider: 'FOOD_99',
      endpoint: input.endpoint,
      httpStatus: input.httpStatus,
      errno: typeof input.payload?.errno === 'number' ? input.payload.errno : null,
      requestId: typeof input.payload?.requestId === 'string' ? input.payload.requestId : null,
      correlationId: input.correlationId,
    });
  }

  private async executeNative(
    connection: MarketplaceConnection,
    url: URL,
    method: 'GET' | 'POST',
    body: string | undefined,
    input: { path: string; externalOrderId: string; correlationId: string },
  ): Promise<Response> {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { method, headers: { accept: 'application/json', 'content-type': 'application/json', 'x-correlation-id': input.correlationId }, body, signal: AbortSignal.timeout(this.timeoutMs()) });
      this.logger.log({ message: 'food99_http_request_completed', provider: 'FOOD_99', tenantId: connection.tenantId, connectionId: connection.id, endpoint: input.path, externalOrderId: input.externalOrderId, httpStatus: response.status, correlationId: input.correlationId, durationMs: Date.now() - startedAt });
      return response;
    } catch (error) {
      throw new Food99ApiError(`99Food request unavailable: ${error instanceof Error ? error.message : 'network error'}`, true);
    }
  }

  private async requestNoContent(
    connection: MarketplaceConnection,
    path: string,
    correlationId: string,
    body?: unknown,
  ) {
    const response = await this.request(connection, { method: 'POST', path, correlationId, body });
    if (response.status !== 204 && response.status !== 200) throw await this.toError(response);
    return { accepted: true as const, httpStatus: response.status };
  }

  private async requestJson<T>(
    connection: MarketplaceConnection,
    input: { method: 'GET' | 'POST'; path: string; correlationId: string; body?: unknown },
  ): Promise<T> {
    const response = await this.request(connection, input);
    if (!response.ok) throw await this.toError(response);
    try {
      return await response.json() as T;
    } catch {
      throw new Food99ApiError('99Food returned invalid JSON.', false, response.status, 'INVALID_RESPONSE');
    }
  }

  private async request(
    connection: MarketplaceConnection,
    input: { method: 'GET' | 'POST'; path: string; correlationId: string; body?: unknown },
  ): Promise<Response> {
    let token = await this.tokens.getAccessToken(connection);
    let response = await this.execute(connection, token, input);
    if (response.status === 401) {
      token = await this.tokens.getAccessToken(connection, true);
      response = await this.execute(connection, token, input);
      if (response.status === 401) await this.tokens.markAuthenticationFailed(connection);
    }
    return response;
  }

  private async execute(
    connection: MarketplaceConnection,
    token: string,
    input: { method: 'GET' | 'POST'; path: string; correlationId: string; body?: unknown },
  ): Promise<Response> {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${this.baseUrl()}${input.path}`, {
        method: input.method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-correlation-id': input.correlationId,
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      this.logger.log({
        message: 'food99_http_request_completed',
        provider: 'FOOD_99',
        tenantId: connection.tenantId,
        connectionId: connection.id,
        externalStoreId: this.maskIdentifier(connection.externalStoreId),
        operation: input.path.split('/').at(-1),
        httpStatus: response.status,
        correlationId: input.correlationId,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new Food99ApiError(`99Food request unavailable: ${message}`, true);
    }
  }

  private async toError(response: Response, knownPayload?: unknown): Promise<Food99ApiError> {
    const payload = this.asRecord(knownPayload ?? await this.readUnknown(response)) as Food99ErrorPayload | null;
    const retryAfter = Number(response.headers.get('retry-after'));
    return new Food99ApiError(
      `99Food request failed with HTTP ${response.status}.`,
      response.status === 429 || response.status >= 500,
      response.status,
      typeof payload?.title === 'string' ? payload.title : undefined,
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : undefined,
    );
  }

  private async readUnknown(response: Response): Promise<unknown> {
    try { return await response.json() as unknown; } catch { return {}; }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private baseUrl(): string {
    return (this.config.get<string>('MARKETPLACE_99FOOD_API_BASE_URL')?.trim() || 'https://openapi.didi-food.com').replace(/\/$/, '');
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000);
  }

  private pollingLookbackMs(): number {
    return Number(this.config.get<string>('MARKETPLACE_99FOOD_POLLING_LOOKBACK_MS') || 300_000);
  }

  private maskIdentifier(value: string | null): string | null {
    if (!value) return null;
    return value.length <= 6 ? `${value.slice(0, 2)}***` : `${value.slice(0, 3)}***${value.slice(-3)}`;
  }

  private assertDecimalIdentifier(value: string): void {
    if (!/^\d+$/.test(value)) throw new Food99ApiError('99Food order ID must be a decimal string.', false, 400, 'INVALID_ORDER_ID');
  }
}
