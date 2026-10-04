import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

export type Food99AuthorizedShop = { shopId: string; shopName: string; boundFlag: 0 | 1; appShopId: string | null };

@Injectable()
export class Food99AuthorizationClient {
  constructor(private readonly config: ConfigService, private readonly credentials: MarketplaceCredentialService) {}

  async getAuthorizedShops(): Promise<Food99AuthorizedShop[]> {
    const { appId, clientSecret } = this.credentials.getFood99AppCredentials();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const parameters = { app_id: appId, page_no: '1', page_size: '30', timestamp };
    const sign = this.sign(parameters, clientSecret);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/v3/auth/authorization/getAuthorizedShops`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ ...parameters, page_no: 1, page_size: 30, timestamp: Number(timestamp), sign }),
        signal: AbortSignal.timeout(Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000)),
      });
    } catch (error) { throw new Food99ApiError(`99Food authorization discovery unavailable: ${error instanceof Error ? error.message : 'network error'}`, true); }
    const payload = await this.read(response);
    const data = this.record(payload?.data);
    const shops = data?.shops;
    if (!response.ok || payload?.errno !== 0 || !Array.isArray(shops)) throw new Food99ApiError('99Food authorized-shop response is invalid.', response.status >= 500 || response.status === 429, response.status, 'PROVIDER_AUTHORIZATION_UNAVAILABLE');
    return shops.map((value) => this.shop(value));
  }

  private shop(value: unknown): Food99AuthorizedShop {
    const row = this.record(value); const shopId = typeof row?.shop_id === 'string' || typeof row?.shop_id === 'number' ? String(row.shop_id) : null;
    const shopName = typeof row?.shop_name === 'string' ? row.shop_name.trim() : '';
    const boundFlag = row?.bound_flag === 0 || row?.bound_flag === 1 ? row.bound_flag : null;
    const appShopId = typeof row?.app_shop_id === 'string' && row.app_shop_id.trim() ? row.app_shop_id : null;
    if (!shopId || !shopName || boundFlag === null) throw new Food99ApiError('99Food authorized-shop record is invalid.', false, 502, 'INVALID_AUTHORIZED_SHOP_RESPONSE');
    return { shopId, shopName, boundFlag, appShopId };
  }
  private sign(parameters: Record<string, string>, secret: string): string { return createHash('md5').update(`${Object.keys(parameters).filter((key) => parameters[key]).sort().map((key) => `${key}=${parameters[key]}`).join('&')}${secret}`, 'utf8').digest('hex'); }
  private baseUrl(): string { return (this.config.get<string>('MARKETPLACE_99FOOD_AUTHORIZATION_API_BASE_URL')?.trim() || 'https://openapi.99food.com').replace(/\/$/, ''); }
  private async read(response: Response): Promise<Record<string, unknown> | null> { try { return this.record(await response.json()); } catch { return null; } }
  private record(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
}
