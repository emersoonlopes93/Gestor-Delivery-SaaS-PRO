import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AnalyticsPublicBrowserEventV1 } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export interface AnalyticsIngestionResult {
  accepted: number;
  duplicates: number;
  ignored: number;
}

@Injectable()
export class AnalyticsIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveTenant(slug: string): Promise<{ id: string }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: 'active' },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Loja não encontrada');
    return tenant;
  }

  async ingest(
    tenantId: string,
    events: AnalyticsPublicBrowserEventV1[],
    receivedAt = new Date(),
  ): Promise<AnalyticsIngestionResult> {
    this.validateTimestamps(events, receivedAt);

    const consented = events.filter((event) => event.consent.analytics);
    if (consented.length === 0) {
      return { accepted: 0, duplicates: 0, ignored: events.length };
    }

    await this.validateReferences(tenantId, consented);
    const created = await this.prisma.analyticsEvent.createMany({
      data: consented.map((event) => this.toPersistenceInput(tenantId, event, receivedAt)),
      skipDuplicates: true,
    });

    return {
      accepted: created.count,
      duplicates: consented.length - created.count,
      ignored: events.length - consented.length,
    };
  }

  private validateTimestamps(events: AnalyticsPublicBrowserEventV1[], receivedAt: Date): void {
    for (const event of events) {
      const occurredAt = new Date(event.occurredAt);
      if (
        occurredAt.getTime() > receivedAt.getTime() + MAX_FUTURE_SKEW_MS ||
        occurredAt.getTime() < receivedAt.getTime() - MAX_EVENT_AGE_MS
      ) {
        throw new BadRequestException('invalid event timestamp');
      }
    }
  }

  private async validateReferences(tenantId: string, events: AnalyticsPublicBrowserEventV1[]): Promise<void> {
    const productIds = new Set<string>();
    const categoryIds = new Set<string>();
    const orderIds = new Set<string>();

    for (const event of events) {
      switch (event.eventName) {
        case 'category_viewed':
          categoryIds.add(event.context.categoryId);
          break;
        case 'product_viewed':
        case 'product_selected':
        case 'add_to_cart':
        case 'remove_from_cart':
          productIds.add(event.context.productId);
          break;
        case 'order_submitted':
          orderIds.add(event.context.orderId);
          break;
      }
    }

    const [products, categories, orders] = await Promise.all([
      productIds.size
        ? this.prisma.product.findMany({ where: { tenantId, id: { in: [...productIds] } }, select: { id: true } })
        : [],
      categoryIds.size
        ? this.prisma.productCategory.findMany({ where: { tenantId, id: { in: [...categoryIds] } }, select: { id: true } })
        : [],
      orderIds.size
        ? this.prisma.order.findMany({ where: { tenantId, id: { in: [...orderIds] } }, select: { id: true } })
        : [],
    ]);

    if (products.length !== productIds.size || categories.length !== categoryIds.size || orders.length !== orderIds.size) {
      throw new BadRequestException('invalid event reference');
    }
  }

  private toPersistenceInput(tenantId: string, event: AnalyticsPublicBrowserEventV1, receivedAt: Date) {
    const page = event.page;
    const attribution = event.attribution;
    const metrics = 'metrics' in event ? event.metrics : undefined;
    return {
      tenantId,
      eventId: event.eventId,
      schemaVersion: event.schemaVersion,
      eventName: event.eventName,
      source: event.source,
      occurredAt: new Date(event.occurredAt),
      receivedAt,
      sessionId: event.sessionId,
      visitorId: event.visitorId,
      categoryId: event.eventName === 'category_viewed' ? event.context.categoryId : undefined,
      productId:
        event.eventName === 'product_viewed' || event.eventName === 'product_selected' ||
        event.eventName === 'add_to_cart' || event.eventName === 'remove_from_cart'
          ? event.context.productId
          : undefined,
      orderId: event.eventName === 'order_submitted' ? event.context.orderId : undefined,
      pagePath: page?.path,
      landingPath: page?.landingPath,
      referrerHost: page?.referrerHost,
      utmSource: attribution?.source,
      utmMedium: attribution?.medium,
      utmCampaign: attribution?.campaign,
      utmContent: attribution?.content,
      utmTerm: attribution?.term,
      quantity: metrics && 'quantity' in metrics ? metrics.quantity : undefined,
      itemCount: metrics && 'itemCount' in metrics ? metrics.itemCount : undefined,
      unitPrice: metrics && 'unitPrice' in metrics ? metrics.unitPrice : undefined,
      value: metrics && 'value' in metrics ? metrics.value : undefined,
      currency: metrics && 'currency' in metrics ? metrics.currency : undefined,
      consentAnalytics: event.consent.analytics,
      consentMarketing: event.consent.marketing,
    };
  }
}
