import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { StorefrontPayload } from '@gestor/types';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class StorefrontCacheService {
  private readonly logger = new Logger(StorefrontCacheService.name);
  
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly prisma: PrismaService,
  ) {}

  private getCacheKey(slug: string, fulfillmentType: string): string {
    return `storefront:${slug}:${fulfillmentType}`;
  }

  async getPayload(slug: string, fulfillmentType: string): Promise<StorefrontPayload | null> {
    try {
      const cacheKey = this.getCacheKey(slug, fulfillmentType);
      const cached = await this.cacheManager.get<StorefrontPayload>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for ${cacheKey}`);
        return cached;
      }
      return null;
    } catch (error) {
      // Fallback seguro: se o Redis falhar, retornamos null e forçamos a busca no banco.
      this.logger.error(`Failed to get cache for storefront:${slug}:${fulfillmentType}`, error);
      return null;
    }
  }

  async setPayload(slug: string, fulfillmentType: string, payload: StorefrontPayload): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(slug, fulfillmentType);
      const cacheTtl = Number(process.env.STOREFRONT_CACHE_TTL || 60000);
      await this.cacheManager.set(cacheKey, payload, cacheTtl);
      this.logger.debug(`Cache set for ${cacheKey} with TTL ${cacheTtl}ms`);
    } catch (error) {
      this.logger.error(`Failed to set cache for storefront:${slug}:${fulfillmentType}`, error);
    }
  }

  async invalidateStorefront(slug: string): Promise<void> {
    try {
      const keys = [
        this.getCacheKey(slug, 'delivery'),
        this.getCacheKey(slug, 'pickup')
      ];
      await Promise.all(keys.map(k => this.cacheManager.del(k)));
      this.logger.log(`Cache invalidated for storefront:${slug}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate cache for storefront:${slug}`, error);
    }
  }

  @OnEvent('storefront.invalidate')
  async handleStorefrontInvalidation(payload: { tenantId: string }) {
    try {
      if (!payload.tenantId) return;
      const tenant = await this.prisma.tenantClient.tenant.findUnique({
        where: { id: payload.tenantId },
        select: { slug: true },
      });
      if (tenant?.slug) {
        await this.invalidateStorefront(tenant.slug);
      }
    } catch (err) {
      this.logger.error(`Failed to handle storefront invalidation for tenant ${payload.tenantId}`, err);
    }
  }
}
