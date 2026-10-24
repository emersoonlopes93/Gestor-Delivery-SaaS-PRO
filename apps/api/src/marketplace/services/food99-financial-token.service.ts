import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type FinancialToken = { value: string; expiresAt: number };
type FinancialSignInResponse = { accessToken?: unknown; expiresIn?: unknown };

/** The Financial API token is application-scoped and must never replace shop auth. */
@Injectable()
export class Food99FinancialTokenService {
  private cached: FinancialToken | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async getAccessToken(forceRefresh = false): Promise<string> {
    const usableUntil = Date.now() + 60_000;
    if (!forceRefresh && this.cached && this.cached.expiresAt > usableUntil) return this.cached.value;
    if (!this.refreshing) {
      this.refreshing = this.signIn().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  private async signIn(): Promise<string> {
    const { appId, clientSecret } = this.credentials.getFood99AppCredentials();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/v3/auth/authtoken/signIn`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ retailer: appId, secret: clientSecret }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch (error) {
      throw new Food99ApiError(`99Food financial authentication unavailable: ${error instanceof Error ? error.message : 'network error'}`, true);
    }
    let payload: FinancialSignInResponse | null = null;
    try { payload = await response.json() as FinancialSignInResponse; } catch { /* normalized below */ }
    const token = typeof payload?.accessToken === 'string' ? payload.accessToken : null;
    const expiresIn = typeof payload?.expiresIn === 'number' && Number.isFinite(payload.expiresIn)
      ? payload.expiresIn
      : null;
    if (!response.ok || !token || !expiresIn || expiresIn <= 0) {
      throw new Food99ApiError('99Food financial authentication failed.', response.status === 429 || response.status >= 500, response.status, 'FINANCIAL_AUTH_FAILED');
    }
    this.cached = { value: token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  }

  private baseUrl(): string {
    return (this.config.get<string>('MARKETPLACE_99FOOD_FINANCE_API_BASE_URL')?.trim() || 'https://openapi.99food.com').replace(/\/$/, '');
  }

  private timeoutMs(): number { return Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000); }
}
