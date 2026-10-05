import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceCredentialService } from './marketplace-credential.service';

export type Food99AuthorizedShop = { shopId: string; shopName: string; boundFlag: 0 | 1; appShopId: string | null };
export type Food99ShopBindResult = { shopId: string; shopName: string | null; authToken: string; tokenExpiresAt: Date };

@Injectable()
export class Food99AuthorizationClient {
  private readonly logger = new Logger(Food99AuthorizationClient.name);
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
        body: this.discoveryBody(appId, timestamp, sign),
        signal: AbortSignal.timeout(Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000)),
      });
    } catch (error) { throw new Food99ApiError(`99Food authorization discovery unavailable: ${error instanceof Error ? error.message : 'network error'}`, true); }
    const payload = await this.read(response);
    const data = this.record(payload?.data);
    const nestedData = this.record(data?.data);
    const shops = Array.isArray(data?.shops)
      ? data.shops
      : Array.isArray(nestedData?.shops)
        ? nestedData.shops
        : Array.isArray(payload?.data)
          ? payload.data
          : null;
    if (!response.ok || !this.success(payload?.errno) || !shops) {
      this.logger.warn({
        message: 'food99_authorized_shops_response_unrecognized',
        httpStatus: response.status,
        errno: this.errorNumber(payload?.errno),
        rootKeys: payload ? Object.keys(payload).sort() : null,
        dataKeys: data ? Object.keys(data).sort() : null,
        nestedDataKeys: nestedData ? Object.keys(nestedData).sort() : null,
        dataType: Array.isArray(payload?.data) ? 'array' : typeof payload?.data,
      });
      throw new Food99ApiError('99Food authorized-shop response is invalid.', response.status >= 500 || response.status === 429, response.status, 'PROVIDER_AUTHORIZATION_UNAVAILABLE');
    }
    return shops.map((value) => this.shop(value));
  }

  async bindShop(appShopId: string, shopId: string): Promise<Food99ShopBindResult> {
    const { appId, clientSecret } = this.credentials.getFood99AppCredentials();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const parameters: Record<string, unknown> = { app_id: appId, shop_infos: [{ shop_id: shopId, app_shop_id: appShopId }], timestamp };
    const sign = this.sign(parameters, clientSecret);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/v3/auth/authorization/shopBind`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: this.bindBody(appId, timestamp, sign, shopId, appShopId),
        signal: AbortSignal.timeout(Number(this.config.get<string>('MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS') || 10_000)),
      });
    } catch (error) {
      throw new Food99ApiError(`99Food shop bind unavailable: ${error instanceof Error ? error.message : 'network error'}`, true);
    }
    const payload = await this.read(response);
    const data = this.record(payload?.data);
    const successList = data?.success_list;
    if (!response.ok || !this.success(payload?.errno) || !Array.isArray(successList)) {
      throw new Food99ApiError('99Food shop bind was not confirmed.', response.status >= 500 || response.status === 429, response.status, 'SHOP_BIND_FAILED');
    }
    const result = successList.map((value) => this.boundShop(value)).find((value) => value.shopId === shopId);
    if (!result) throw new Food99ApiError('99Food shop bind returned no usable shop token.', false, 502, 'INVALID_SHOP_BIND_RESPONSE');
    return result;
  }

  private shop(value: unknown): Food99AuthorizedShop {
    const row = this.record(value); const shopId = this.identifier(row?.shop_id);
    const shopName = typeof row?.shop_name === 'string' ? row.shop_name.trim() : '';
    const boundFlag = row?.bound_flag === 0 || row?.bound_flag === 1 ? row.bound_flag : null;
    const appShopId = typeof row?.app_shop_id === 'string' && row.app_shop_id.trim() ? row.app_shop_id : null;
    if (!shopId || !shopName || boundFlag === null) throw new Food99ApiError('99Food authorized-shop record is invalid.', false, 502, 'INVALID_AUTHORIZED_SHOP_RESPONSE');
    return { shopId, shopName, boundFlag, appShopId };
  }
  private boundShop(value: unknown): Food99ShopBindResult {
    const row = this.record(value);
    const shopId = this.identifier(row?.shop_id);
    const authToken = typeof row?.auth_token === 'string' ? row.auth_token.trim() : '';
    const tokenExpiresAt = this.expiration(row?.token_expiration_time);
    const shopName = typeof row?.shop_name === 'string' && row.shop_name.trim() ? row.shop_name.trim() : null;
    if (!shopId || !authToken || !tokenExpiresAt) throw new Food99ApiError('99Food shop bind record is invalid.', false, 502, 'INVALID_SHOP_BIND_RESPONSE');
    return { shopId, shopName, authToken, tokenExpiresAt };
  }
  private sign(parameters: Record<string, unknown>, secret: string): string {
    const serialized = Object.keys(parameters)
      .filter((key) => !this.empty(parameters[key]))
      .sort()
      .map((key) => `${key}=${Array.isArray(parameters[key]) || this.record(parameters[key]) ? 'Array' : String(parameters[key])}`)
      .join('&');
    return createHash('md5').update(`${serialized}${secret}`, 'utf8').digest('hex');
  }
  private discoveryBody(appId: string, timestamp: string, sign: string): string {
    return `{"app_id":${this.jsonIdentifier(appId)},"page_no":1,"page_size":30,"timestamp":${timestamp},"sign":${JSON.stringify(sign)}}`;
  }
  private bindBody(appId: string, timestamp: string, sign: string, shopId: string, appShopId: string): string {
    return `{"app_id":${this.jsonIdentifier(appId)},"timestamp":${timestamp},"sign":${JSON.stringify(sign)},"shop_infos":[{"shop_id":${this.jsonIdentifier(shopId)},"app_shop_id":${JSON.stringify(appShopId)}}]}`;
  }
  private jsonIdentifier(value: string): string { return /^\d+$/.test(value) ? value : JSON.stringify(value); }
  private identifier(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null; }
  private expiration(value: unknown): Date | null {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
    if (numeric === null) return null;
    const date = new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  private empty(value: unknown): boolean { return value === undefined || value === null || value === ''; }
  private success(value: unknown): boolean { return value === 0 || value === '0'; }
  private errorNumber(value: unknown): number | string | null {
    return typeof value === 'number' || typeof value === 'string' ? value : null;
  }
  private baseUrl(): string { return (this.config.get<string>('MARKETPLACE_99FOOD_AUTHORIZATION_API_BASE_URL')?.trim() || 'https://openapi.99food.com').replace(/\/$/, ''); }
  private async read(response: Response): Promise<Record<string, unknown> | null> {
    try {
      const raw = await response.text();
      if (!raw.trim()) return null;
      // 99Food documents shop_id as a numeric 64-bit identifier. Preserve its
      // decimal source before JSON.parse so it is never rounded by JavaScript.
      const losslessShopIds = raw.replace(/("shop_id"\s*:\s*)(-?\d{16,})(?=\s*[,}])/g, '$1"$2"');
      return this.record(JSON.parse(losslessShopIds) as unknown);
    } catch { return null; }
  }
  private record(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
}
