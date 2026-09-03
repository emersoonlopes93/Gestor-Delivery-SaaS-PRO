import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection, MarketplaceConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type Food99TokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  title?: unknown;
  status?: unknown;
};

@Injectable()
export class Food99TokenService {
  private readonly logger = new Logger(Food99TokenService.name);
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async getAccessToken(connection: MarketplaceConnection, forceRefresh = false): Promise<string> {
    const usableUntil = Date.now() + 60_000;
    if (!forceRefresh && connection.accessTokenEnc && connection.tokenExpiresAt?.getTime() > usableUntil) {
      return this.credentials.decrypt(connection.accessTokenEnc);
    }

    const running = this.refreshes.get(connection.id);
    if (running) return running;
    const refresh = this.requestAndPersistToken(connection).finally(() => this.refreshes.delete(connection.id));
    this.refreshes.set(connection.id, refresh);
    return refresh;
  }

  async markAuthenticationFailed(connection: MarketplaceConnection): Promise<void> {
    await this.prisma.marketplaceConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: { status: MarketplaceConnectionStatus.TOKEN_EXPIRED },
    });
  }

  private async requestAndPersistToken(connection: MarketplaceConnection): Promise<string> {
    const appShopId = connection.externalStoreId?.trim();
    if (!appShopId) {
      throw new Food99ApiError('99Food connection does not have an app shop ID.', false, 400, 'APP_SHOP_ID_REQUIRED');
    }
    const { appId, clientSecret } = this.credentials.getFood99AppCredentials();
    const body = new URLSearchParams({
      client_id: `${appId}_${appShopId}`,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });
    const baseUrl = this.baseUrl();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v4/opendelivery/oauth/token`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new Food99ApiError(`99Food authentication unavailable: ${message}`, true);
    }

    const payload = await this.readJson(response);
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : Number(payload.expires_in);
    if (!response.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      await this.prisma.marketplaceConnection.updateMany({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: { status: response.status === 401 ? MarketplaceConnectionStatus.TOKEN_EXPIRED : MarketplaceConnectionStatus.ERROR },
      });
      throw new Food99ApiError(
        '99Food authentication failed.',
        response.status === 429 || response.status >= 500,
        response.status,
        typeof payload.title === 'string' ? payload.title : undefined,
        this.retryAfterMs(response),
      );
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await this.prisma.marketplaceConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: {
        status: MarketplaceConnectionStatus.CONNECTED,
        accessTokenEnc: this.credentials.encrypt(accessToken),
        refreshTokenEnc: null,
        tokenExpiresAt: expiresAt,
        authType: 'oauth2_client_credentials',
      },
    });
    this.logger.log({
      message: 'food99_token_refreshed',
      provider: 'FOOD_99',
      tenantId: connection.tenantId,
      connectionId: connection.id,
      expiresAt,
    });
    return accessToken;
  }

  private baseUrl(): string {
    return (this.config.get<string>('MARKETPLACE_99FOOD_API_BASE_URL')?.trim() || 'https://openapi.99food.com').replace(/\/$/, '');
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000);
  }

  private retryAfterMs(response: Response): number | undefined {
    const seconds = Number(response.headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
  }

  private async readJson(response: Response): Promise<Food99TokenResponse> {
    try {
      return await response.json() as Food99TokenResponse;
    } catch {
      return {};
    }
  }
}
