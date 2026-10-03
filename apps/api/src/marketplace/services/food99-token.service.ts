import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection, MarketplaceConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type StandardResponse = { errno?: unknown; errmsg?: unknown; data?: unknown };
type CachedToken = { token: string; expiresAt: Date };

@Injectable()
export class Food99TokenService {
  private readonly logger = new Logger(Food99TokenService.name);
  private readonly refreshes = new Map<string, Promise<string>>();
  private readonly cache = new Map<string, CachedToken>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async getAccessToken(connection: MarketplaceConnection, forceRefresh = false): Promise<string> {
    const usableUntil = Date.now() + 60_000;
    const cached = this.cache.get(connection.id);
    if (!forceRefresh && cached && cached.expiresAt.getTime() > usableUntil) return cached.token;
    if (!forceRefresh && connection.accessTokenEnc && connection.tokenExpiresAt?.getTime() > usableUntil) {
      const token = this.credentials.decrypt(connection.accessTokenEnc);
      this.cache.set(connection.id, { token, expiresAt: connection.tokenExpiresAt });
      return token;
    }
    const running = this.refreshes.get(connection.id);
    if (running) return running;
    const refresh = this.refreshAndGet(connection, forceRefresh).finally(() => this.refreshes.delete(connection.id));
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

  private async refreshAndGet(connection: MarketplaceConnection, forceRefresh: boolean): Promise<string> {
    if (forceRefresh) await this.callAuth(connection, '/v1/auth/authtoken/refresh');
    const payload = await this.callAuth(connection, '/v1/auth/authtoken/get');
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
    this.logger.log({ message: 'food99_shop_auth_token_refreshed', provider: 'FOOD_99', tenantId: connection.tenantId, connectionId: connection.id, expiresAt: expiration });
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
      await this.markAuthenticationFailed(connection);
      throw new Food99ApiError('99Food shop authentication failed.', response.status === 429 || response.status >= 500, response.status, this.providerCode(payload));
    }
    return payload;
  }

  private toExpiration(value: unknown): Date | null {
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000);
    if (typeof value === 'string' && /^\d+$/.test(value)) return this.toExpiration(Number(value));
    return null;
  }
  private providerCode(payload: StandardResponse): string | undefined { return typeof payload.errmsg === 'string' ? payload.errmsg : undefined; }
  private baseUrl(): string { return (this.config.get<string>('MARKETPLACE_99FOOD_API_BASE_URL')?.trim() || 'https://openapi.didi-food.com').replace(/\/$/, ''); }
  private timeoutMs(): number { return Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000); }
  private async readJson(response: Response): Promise<StandardResponse> { try { return await response.json() as StandardResponse; } catch { return {}; } }
  private asRecord(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
}
