import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection, MarketplaceConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type StandardResponse = { errno?: unknown; errmsg?: unknown; data?: unknown; request_id?: unknown };
type CachedToken = { token: string; expiresAt: Date };

const AUTH_TOKEN_REQUEST_INTERVAL_MS = 30_000;

@Injectable()
export class Food99TokenService {
  private readonly logger = new Logger(Food99TokenService.name);
  private readonly refreshes = new Map<string, Promise<string>>();
  private readonly cache = new Map<string, CachedToken>();
  private readonly nextGetAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async getAccessToken(connection: MarketplaceConnection, bypassCache = false): Promise<string> {
    const usableUntil = Date.now() + 60_000;
    const cached = this.cache.get(connection.id);
    if (!bypassCache && cached && cached.expiresAt.getTime() > usableUntil) return cached.token;
    if (!bypassCache && connection.accessTokenEnc && connection.tokenExpiresAt?.getTime() > usableUntil) {
      const token = this.credentials.decrypt(connection.accessTokenEnc);
      this.cache.set(connection.id, { token, expiresAt: connection.tokenExpiresAt });
      return token;
    }
    const retryAt = this.nextGetAt.get(connection.id);
    if (retryAt && retryAt > Date.now()) {
      throw new Food99ApiError(
        '99Food refreshed the shop token. Wait before verifying again.',
        false,
        409,
        'AUTH_TOKEN_REFRESHED_WAIT_RETRY',
        retryAt - Date.now(),
      );
    }
    this.nextGetAt.delete(connection.id);
    const running = this.refreshes.get(connection.id);
    if (running) return running;
    const refresh = this.getOrRefreshExpiredToken(connection).finally(() => this.refreshes.delete(connection.id));
    this.refreshes.set(connection.id, refresh);
    return refresh;
  }

  async markAuthenticationFailed(connection: MarketplaceConnection): Promise<void> {
    this.cache.delete(connection.id);
    if (connection.status === MarketplaceConnectionStatus.DISCONNECTED && !connection.accessTokenEnc) return;
    await this.prisma.marketplaceConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: { status: MarketplaceConnectionStatus.TOKEN_EXPIRED },
    });
  }

  private async getOrRefreshExpiredToken(connection: MarketplaceConnection): Promise<string> {
    let payload: StandardResponse;
    try {
      payload = await this.callAuth(connection, '/v1/auth/authtoken/get');
    } catch (error) {
      if (!(error instanceof Food99ApiError) || error.providerCode !== 'AUTH_TOKEN_EXPIRED') throw error;

      await this.callAuth(connection, '/v1/auth/authtoken/refresh');
      const retryAt = Date.now() + AUTH_TOKEN_REQUEST_INTERVAL_MS;
      this.nextGetAt.set(connection.id, retryAt);
      throw new Food99ApiError(
        '99Food refreshed the shop token. Wait before verifying again.',
        false,
        409,
        'AUTH_TOKEN_REFRESHED_WAIT_RETRY',
        AUTH_TOKEN_REQUEST_INTERVAL_MS,
      );
    }

    const data = this.asRecord(payload.data);
    const token = typeof data?.auth_token === 'string' ? data.auth_token : null;
    const expiration = this.toExpiration(data?.token_expiration_time);
    if (!token || !expiration) throw new Food99ApiError('99Food returned an invalid shop auth token.', false, 502, 'INVALID_AUTH_TOKEN_RESPONSE');

    this.cache.set(connection.id, { token, expiresAt: expiration });
    await this.prisma.marketplaceConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: {
        status: MarketplaceConnectionStatus.CONNECTED,
        accessTokenEnc: this.credentials.encrypt(token),
        refreshTokenEnc: null,
        tokenExpiresAt: expiration,
        authType: 'food99_shop_auth_token',
      },
    });
    this.logger.log({ message: 'food99_shop_auth_token_ready', provider: 'FOOD_99', tenantId: connection.tenantId, connectionId: connection.id, expiresAt: expiration });
    return token;
  }

  private async callAuth(connection: MarketplaceConnection, path: string): Promise<StandardResponse> {
    const appShopId = connection.externalStoreId?.trim();
    if (!appShopId) throw new Food99ApiError('99Food connection does not have an app shop ID.', false, 400, 'APP_SHOP_ID_REQUIRED');
    const { appId, clientSecret } = this.credentials.getFood99AppCredentials();
    const url = new URL(`${this.baseUrl()}${path}`);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('app_secret', clientSecret);
    url.searchParams.set('app_shop_id', appShopId);
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs()) });
    } catch (error) {
      throw new Food99ApiError(`99Food authentication unavailable: ${error instanceof Error ? error.message : 'network error'}`, true);
    }
    const payload = await this.readJson(response);
    if (!response.ok || payload.errno !== 0) {
      const providerCode = this.providerCode(payload);
      if (providerCode === 'AUTH_TOKEN_NOT_AVAILABLE' || providerCode === 'AUTH_TOKEN_EXPIRED') {
        await this.markAuthenticationFailed(connection);
      }
      this.logger.warn({
        message: 'food99_shop_auth_rejected',
        tenantId: connection.tenantId,
        connectionId: connection.id,
        operation: path.endsWith('/refresh') ? 'refresh_auth_token' : 'get_auth_token',
        endpoint: path,
        providerErrno: this.providerErrno(payload),
        providerRequestId: this.providerRequestId(payload),
        appShopId: this.maskAppShopId(appShopId),
        providerCode,
      });
      throw new Food99ApiError('99Food shop authentication failed.', this.isRetryable(response.status, providerCode), response.status, providerCode);
    }
    return payload;
  }

  private toExpiration(value: unknown): Date | null {
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000);
    if (typeof value === 'string' && /^\d+$/.test(value)) return this.toExpiration(Number(value));
    return null;
  }
  private providerCode(payload: StandardResponse): string | undefined {
    switch (this.providerErrno(payload)) {
      case 10001: return 'PROVIDER_SYSTEM_ERROR';
      case 10002: return 'PROVIDER_PARAMETER_ERROR';
      case 10101: return 'AUTH_TOKEN_NOT_AVAILABLE';
      case 10102: return 'AUTH_TOKEN_EXPIRED';
      case 10103: return 'TOKEN_REFRESH_FAILED';
      case 14105: return 'APP_ID_INVALID';
      case 14106: return 'APP_SECRET_INVALID';
      default: return undefined;
    }
  }
  private providerErrno(payload: StandardResponse): number | null {
    return typeof payload.errno === 'number' && Number.isInteger(payload.errno) ? payload.errno : null;
  }
  private providerRequestId(payload: StandardResponse): string | undefined {
    return typeof payload.request_id === 'string' && payload.request_id.trim() ? payload.request_id : undefined;
  }
  private isRetryable(httpStatus: number, providerCode?: string): boolean {
    return httpStatus === 429 || httpStatus >= 500 || providerCode === 'PROVIDER_SYSTEM_ERROR';
  }
  private maskAppShopId(value: string): string {
    return value.length <= 6 ? '***' : `${value.slice(0, 3)}***${value.slice(-3)}`;
  }
  private baseUrl(): string { return (this.config.get<string>('MARKETPLACE_99FOOD_API_BASE_URL')?.trim() || 'https://openapi.didi-food.com').replace(/\/$/, ''); }
  private timeoutMs(): number { return Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000); }
  private async readJson(response: Response): Promise<StandardResponse> { try { return await response.json() as StandardResponse; } catch { return {}; } }
  private asRecord(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
}
