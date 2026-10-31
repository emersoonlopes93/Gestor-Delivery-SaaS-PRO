import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnection, MarketplaceConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { IfoodApiError } from '../providers/ifood-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type TokenResponse = {
  accessToken?: unknown;
  refreshToken?: unknown;
  expiresIn?: unknown;
  error?: { code?: unknown; message?: unknown };
};

@Injectable()
export class IfoodTokenService {
  private readonly logger = new Logger(IfoodTokenService.name);
  private readonly refreshes = new Map<string, Promise<string>>();
  private centralizedToken?: { value: string; expiresAt: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async getAccessToken(connection: MarketplaceConnection, forceRefresh = false): Promise<string> {
    const usableUntil = Date.now() + 5 * 60 * 1000;
    if (!forceRefresh && !connection.refreshTokenEnc && this.centralizedToken && this.centralizedToken.expiresAt > usableUntil) {
      return this.centralizedToken.value;
    }
    if (!forceRefresh && connection.accessTokenEnc && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > usableUntil) {
      return this.credentials.decrypt(connection.accessTokenEnc);
    }

    const refreshKey = connection.refreshTokenEnc ? connection.id : 'ifood:centralized-application';
    const running = this.refreshes.get(refreshKey);
    if (running) return running;

    const refresh = this.requestAndPersistToken(connection).finally(() => this.refreshes.delete(refreshKey));
    this.refreshes.set(refreshKey, refresh);
    return refresh;
  }

  async markAuthenticationFailed(connection: MarketplaceConnection): Promise<void> {
    await this.prisma.marketplaceConnection.update({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: { status: MarketplaceConnectionStatus.TOKEN_EXPIRED },
    });
  }

  private async requestAndPersistToken(connection: MarketplaceConnection): Promise<string> {
    const { clientId, clientSecret } = this.credentials.getIfoodClientCredentials();
    const refreshToken = connection.refreshTokenEnc
      ? this.credentials.decrypt(connection.refreshTokenEnc)
      : null;
    const body = new URLSearchParams({
      grantType: refreshToken ? 'refresh_token' : 'client_credentials',
      clientId,
      clientSecret,
    });
    if (refreshToken) body.set('refreshToken', refreshToken);

    const baseUrl = this.config.get<string>('MARKETPLACE_IFOOD_API_BASE_URL')?.trim()
      || 'https://merchant-api.ifood.com.br';
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/authentication/v1.0/oauth/token`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new IfoodApiError(`iFood authentication unavailable: ${message}`, true);
    }

    const payload = await this.readJson(response);
    const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : null;
    const expiresIn = typeof payload.expiresIn === 'number' ? payload.expiresIn : Number(payload.expiresIn);
    if (!response.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      const providerCode = typeof payload.error?.code === 'string' ? payload.error.code : undefined;
      await this.prisma.marketplaceConnection.update({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: { status: response.status === 401 ? MarketplaceConnectionStatus.TOKEN_EXPIRED : MarketplaceConnectionStatus.ERROR },
      });
      throw new IfoodApiError('iFood authentication failed.', response.status >= 500 || response.status === 429, response.status, providerCode);
    }

    const nextRefreshToken = typeof payload.refreshToken === 'string' ? payload.refreshToken : null;
    const expiresAt = Date.now() + expiresIn * 1000;
    if (!refreshToken) this.centralizedToken = { value: accessToken, expiresAt };
    await this.prisma.marketplaceConnection.update({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: {
        status: MarketplaceConnectionStatus.CONNECTED,
        accessTokenEnc: this.credentials.encrypt(accessToken),
        refreshTokenEnc: nextRefreshToken ? this.credentials.encrypt(nextRefreshToken) : connection.refreshTokenEnc,
        tokenExpiresAt: new Date(expiresAt),
      },
    });
    this.logger.log({ message: 'ifood_token_refreshed', connectionId: connection.id, tenantId: connection.tenantId });
    return accessToken;
  }

  private getTimeoutMs(): number {
    return Number(this.config.get<string>('MARKETPLACE_IFOOD_HTTP_TIMEOUT_MS') || 10000);
  }

  private async readJson(response: Response): Promise<TokenResponse> {
    try {
      return await response.json() as TokenResponse;
    } catch {
      return {};
    }
  }
}
