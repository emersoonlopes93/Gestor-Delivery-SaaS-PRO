import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection } from '@prisma/client';
import { IfoodApiError } from '../providers/ifood-api.error';
import { IfoodTokenService } from './ifood-token.service';
import type { MarketplaceCancellationReason } from '../marketplace.types';

type IfoodErrorPayload = {
  code?: unknown;
  message?: unknown;
  error?: { code?: unknown; message?: unknown };
};

type CancellationReasonResponse = {
  reasons?: Array<{ code?: unknown; description?: unknown }>;
};

export type IfoodPollingFilters = {
  categories?: string;
  types?: string;
  groups?: string;
};

@Injectable()
export class IfoodHttpClientService {
  private readonly logger = new Logger(IfoodHttpClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: IfoodTokenService,
  ) {}

  async fetchOrderDetails(connection: MarketplaceConnection, externalOrderId: string, correlationId: string): Promise<Record<string, unknown>> {
    return this.requestJson<Record<string, unknown>>(connection, {
      method: 'GET',
      path: `/order/v1.0/orders/${encodeURIComponent(externalOrderId)}`,
      correlationId,
    });
  }

  async pollEvents(
    connection: MarketplaceConnection,
    merchantIds: string[],
    correlationId: string,
    filters: IfoodPollingFilters = {},
  ): Promise<Record<string, unknown>[]> {
    const uniqueMerchantIds = [...new Set(merchantIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueMerchantIds.length === 0 || uniqueMerchantIds.length > 100) {
      throw new IfoodApiError('iFood polling request must contain between 1 and 100 unique merchants.', false, 400, 'INVALID_MERCHANT_BATCH');
    }
    const query = new URLSearchParams();
    if (filters.categories) query.set('categories', filters.categories);
    if (filters.types) query.set('types', filters.types);
    if (filters.groups) query.set('groups', filters.groups);
    const suffix = query.size ? `?${query.toString()}` : '';
    const response = await this.request(connection, {
      method: 'GET',
      path: `/events/v1.0/events:polling${suffix}`,
      correlationId,
      headers: { 'x-polling-merchants': uniqueMerchantIds.join(',') },
    });
    if (response.status === 204) return [];
    if (!response.ok) throw await this.toError(response);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new IfoodApiError('iFood returned an invalid polling response.', false, response.status, 'INVALID_RESPONSE');
    }
    if (!Array.isArray(payload)) {
      throw new IfoodApiError('iFood polling response is not an event array.', false, response.status, 'INVALID_RESPONSE');
    }
    return payload.filter((event): event is Record<string, unknown> => (
      typeof event === 'object' && event !== null && !Array.isArray(event)
    ));
  }

  async acknowledgeEvents(
    connection: MarketplaceConnection,
    eventIds: string[],
    correlationId: string,
  ): Promise<{ accepted: true; httpStatus: number }> {
    const uniqueIds = [...new Set(eventIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0 || uniqueIds.length > 2000) {
      throw new IfoodApiError('iFood acknowledgment batch must contain between 1 and 2000 unique IDs.', false, 400, 'INVALID_ACK_BATCH');
    }
    const response = await this.request(connection, {
      method: 'POST',
      path: '/events/v1.0/events/acknowledgment',
      correlationId,
      body: uniqueIds.map((id) => ({ id })),
    });
    if (!response.ok) throw await this.toError(response);
    return { accepted: true, httpStatus: response.status };
  }

  async confirmOrder(connection: MarketplaceConnection, externalOrderId: string, correlationId: string) {
    await this.fetchOrderDetails(connection, externalOrderId, correlationId);
    return this.requestAccepted(connection, {
      path: `/order/v1.0/orders/${encodeURIComponent(externalOrderId)}/confirm`,
      correlationId,
    });
  }

  async cancelOrder(connection: MarketplaceConnection, externalOrderId: string, reason: string, correlationId: string) {
    const reasons = await this.getCancellationReasons(connection, externalOrderId, correlationId);
    const acceptedCodes = reasons.map((item) => item.code);
    if (!acceptedCodes.includes(reason)) {
      throw new IfoodApiError('Cancellation reason is not valid for this iFood order.', false, 422, 'INVALID_CANCELLATION_REASON');
    }

    return this.requestAccepted(connection, {
      path: `/order/v1.0/orders/${encodeURIComponent(externalOrderId)}/requestCancellation`,
      correlationId,
      body: { reason },
    });
  }

  async getCancellationReasons(
    connection: MarketplaceConnection,
    externalOrderId: string,
    correlationId: string,
  ): Promise<MarketplaceCancellationReason[]> {
    await this.fetchOrderDetails(connection, externalOrderId, correlationId);
    const response = await this.requestJson<CancellationReasonResponse>(connection, {
      method: 'GET',
      path: `/order/v1.0/orders/${encodeURIComponent(externalOrderId)}/cancellationReasons`,
      correlationId,
    });
    return (response.reasons ?? []).flatMap((item) => {
      const code = typeof item.code === 'string' ? item.code.trim() : '';
      if (!code) return [];
      return [{ code, description: typeof item.description === 'string' ? item.description : '' }];
    });
  }

  private async requestAccepted(
    connection: MarketplaceConnection,
    input: { path: string; correlationId: string; body?: unknown },
  ) {
    const response = await this.request(connection, {
      method: 'POST',
      path: input.path,
      correlationId: input.correlationId,
      body: input.body,
    });
    if (response.status !== 202) {
      throw await this.toError(response);
    }
    const payload = await this.tryReadJson(response);
    return {
      accepted: true as const,
      httpStatus: response.status,
      providerCode: this.readProviderCode(payload),
    };
  }

  private async requestJson<T>(
    connection: MarketplaceConnection,
    input: { method: 'GET' | 'POST'; path: string; correlationId: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<T> {
    const response = await this.request(connection, input);
    if (!response.ok) throw await this.toError(response);
    try {
      return await response.json() as T;
    } catch {
      throw new IfoodApiError('iFood returned an invalid JSON response.', false, response.status, 'INVALID_RESPONSE');
    }
  }

  private async request(
    connection: MarketplaceConnection,
    input: { method: 'GET' | 'POST'; path: string; correlationId: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response> {
    let token = await this.tokens.getAccessToken(connection);
    let response = await this.execute(connection, token, input);
    if (response.status === 401) {
      token = await this.tokens.getAccessToken(connection, true);
      response = await this.execute(connection, token, input);
      if (response.status === 401) {
        await this.tokens.markAuthenticationFailed(connection);
      }
    }
    return response;
  }

  private async execute(
    connection: MarketplaceConnection,
    token: string,
    input: { method: 'GET' | 'POST'; path: string; correlationId: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response> {
    const startedAt = Date.now();
    const baseUrl = this.config.get<string>('MARKETPLACE_IFOOD_API_BASE_URL')?.trim()
      || 'https://merchant-api.ifood.com.br';
    try {
      const response = await fetch(`${baseUrl}${input.path}`, {
        method: input.method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-correlation-id': input.correlationId,
          ...input.headers,
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(Number(this.config.get<string>('MARKETPLACE_IFOOD_HTTP_TIMEOUT_MS') || 10000)),
      });
      this.logger.log({
        message: 'ifood_http_request_completed',
        path: input.path,
        method: input.method,
        correlationId: input.correlationId,
        tenantId: connection.tenantId,
        connectionId: connection.id,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new IfoodApiError(`iFood request unavailable: ${message}`, true);
    }
  }

  private async toError(response: Response): Promise<IfoodApiError> {
    const payload = await this.tryReadJson(response);
    const providerCode = this.readProviderCode(payload);
    const retryAfter = response.headers.get('retry-after');
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    const retryable = response.status === 429 || response.status >= 500;
    return new IfoodApiError(
      `iFood request failed with HTTP ${response.status}.`,
      retryable,
      response.status,
      providerCode ?? undefined,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined,
    );
  }

  private async tryReadJson(response: Response): Promise<IfoodErrorPayload> {
    try {
      return await response.json() as IfoodErrorPayload;
    } catch {
      return {};
    }
  }

  private readProviderCode(payload: IfoodErrorPayload): string | null {
    if (typeof payload.code === 'string') return payload.code;
    if (typeof payload.error?.code === 'string') return payload.error.code;
    return null;
  }
}
