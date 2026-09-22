import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type FinancialTokenResponse = { accessToken?: unknown; expiresIn?: unknown };

/** Application-scoped token. It must never be reused from the shop order API. */
@Injectable()
export class Food99FinancialTokenService {
  private cached: { value: string; usableUntil: number } | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cached && this.cached.usableUntil > Date.now()) return this.cached.value;
    if (this.refreshing) return this.refreshing;
    const request = this.signIn().finally(() => { this.refreshing = null; });
    this.refreshing = request;
    return request;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async signIn(): Promise<string> {
    const { appId, clientSecret } = this.credentials.getFood99AppCredentials();
    const baseUrl = (this.config.get<string>('MARKETPLACE_99FOOD_FINANCE_API_BASE_URL')?.trim()
      || 'https://openapi.99food.com').replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v3/auth/authtoken/signIn`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ retailer: appId, secret: clientSecret }),
        signal: AbortSignal.timeout(Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000)),
      });
    } catch {
      throw new Food99ApiError('A autenticação financeira da 99Food está indisponível.', true, 503, 'FINANCE_AUTH_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new Food99ApiError(
        'A 99Food não autorizou o acesso financeiro do aplicativo.',
        response.status === 429 || response.status >= 500,
        response.status,
        'FINANCE_AUTH_REJECTED',
      );
    }
    const payload: unknown = await response.json().catch(() => null);
    const tokenResponse = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? payload as FinancialTokenResponse : null;
    const accessToken = tokenResponse?.accessToken;
    const expiresIn = tokenResponse?.expiresIn;
    if (typeof accessToken !== 'string' || !accessToken.trim()
      || typeof expiresIn !== 'number' || !Number.isSafeInteger(expiresIn)
      || !Number.isSafeInteger(expiresIn * 1000) || expiresIn <= 0) {
      throw new Food99ApiError('A 99Food retornou um token financeiro inválido.', false, 502, 'INVALID_FINANCE_AUTH_RESPONSE');
    }
    const ttlMs = expiresIn * 1000;
    this.cached = { value: accessToken, usableUntil: Date.now() + ttlMs - Math.min(60_000, ttlMs / 10) };
    return accessToken;
  }
}
