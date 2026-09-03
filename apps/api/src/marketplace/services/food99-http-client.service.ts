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
    return this.requestJson<Record<string, unknown>>(connection, {
      method: 'GET',
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}`,
      correlationId,
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

  async getAuthorizationUrl(correlationId: string): Promise<string> {
    const baseUrl = this.baseUrl();
    const appId = this.config.get<string>('MARKETPLACE_99FOOD_APP_ID')?.trim();
    if (!appId) throw new Food99ApiError('99Food application ID is not configured.', false, 503, 'APP_ID_REQUIRED');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/auth/authorizationpage/getUrl`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-correlation-id': correlationId },
        body: JSON.stringify({ app_id: appId }),
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
    if (!response.ok || !url) throw await this.toError(response, payload);
    return url;
  }

  async confirmOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    const order = await this.fetchOrderDetails(connection, externalOrderId, correlationId);
    const createdAt = typeof order.createdAt === 'string' ? order.createdAt : null;
    if (!createdAt) throw new Food99ApiError('99Food order snapshot has no createdAt.', false, 422, 'ORDER_CREATED_AT_REQUIRED');
    return this.requestAccepted(connection, {
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/confirm`,
      correlationId,
      body: { createdAt, orderExternalCode: `PedeHub-${externalOrderId}` },
    });
  }

  readyOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    return this.requestAccepted(connection, {
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/readyForPickup`, correlationId,
    });
  }

  dispatchOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    return this.requestAccepted(connection, {
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/dispatch`, correlationId,
    });
  }

  deliverOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    return this.requestAccepted(connection, {
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/delivered`, correlationId,
    });
  }

  pickUpOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    return this.requestAccepted(connection, {
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/pickedUp`, correlationId,
    });
  }

  requestCancellation(connection: MarketplaceConnection, externalOrderId: string, reason: string, correlationId: string) {
    const [code, ...description] = reason.split(':');
    return this.requestAccepted(connection, {
      path: `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/requestCancellation`,
      correlationId,
      body: { code: code.trim(), reason: description.join(':').trim() || code.trim(), mode: 'MANUAL' },
    });
  }

  acceptCancellation(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    return this.requestNoContent(connection, `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/acceptCancellation`, correlationId);
  }

  denyCancellation(connection: MarketplaceConnection, externalOrderId: string, reason: string, correlationId: string) {
    const [code, ...description] = reason.split(':');
    return this.requestNoContent(
      connection,
      `/v4/opendelivery/v1/orders/${encodeURIComponent(externalOrderId)}/denyCancellation`,
      correlationId,
      { code: code.trim(), reason: description.join(':').trim() || code.trim() },
    );
  }

  private async requestAccepted(
    connection: MarketplaceConnection,
    input: { path: string; correlationId: string; body?: unknown },
  ) {
    const response = await this.request(connection, { method: 'POST', ...input });
    if (response.status !== 202) throw await this.toError(response);
    return { accepted: true as const, httpStatus: response.status };
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
    return (this.config.get<string>('MARKETPLACE_99FOOD_API_BASE_URL')?.trim() || 'https://openapi.99food.com').replace(/\/$/, '');
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
}
