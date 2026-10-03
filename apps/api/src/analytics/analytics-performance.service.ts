import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AnalyticsAcquisitionResponse, AnalyticsFunnelResponse, AnalyticsOverviewResponse, AnalyticsPerformancePeriod, AnalyticsProductsResponse } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const MAX_DAYS = 90;
const EVENTS = ['menu_viewed', 'product_viewed', 'add_to_cart', 'checkout_started', 'order_submitted', 'order_confirmed', 'order_completed'] as const;
export type PerformanceQuery = { from?: string; to?: string; compare: boolean };
export type ProductsQuery = PerformanceQuery & { limit: number; page: number; sort: 'views' | 'addToCart' | 'ordersCompleted' | 'quantityCompleted' | 'realizedRevenue' };
export type AcquisitionQuery = PerformanceQuery & { limit: number; page: number; sort: 'sessions' | 'menuViews' | 'ordersSubmitted' | 'ordersCompleted' | 'conversionRate' };
type Range = { start: Date; end: Date };

@Injectable()
export class AnalyticsPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, query: PerformanceQuery): Promise<AnalyticsOverviewResponse> {
    const context = await this.context(tenantId, query);
    const current = await this.overviewMetrics(tenantId, context.current, context.period.timezone);
    const previous = context.previous ? await this.overviewMetrics(tenantId, context.previous, context.period.timezone) : null;
    return { period: context.period, current, previous, delta: previous ? this.overviewDelta(current, previous) : null };
  }

  async funnel(tenantId: string, query: PerformanceQuery): Promise<AnalyticsFunnelResponse> {
    const context = await this.context(tenantId, query);
    const current = await this.funnelMetrics(tenantId, context.current, context.period.timezone);
    const previous = context.previous ? await this.funnelMetrics(tenantId, context.previous, context.period.timezone) : null;
    return { period: context.period, current, previous, delta: previous ? current.map((row, index) => ({ eventName: row.eventName, eventCount: this.delta(row.eventCount, previous[index].eventCount), uniqueSessions: this.delta(row.uniqueSessions, previous[index].uniqueSessions) })) : null };
  }

  async products(tenantId: string, query: ProductsQuery): Promise<AnalyticsProductsResponse> {
    const context = await this.context(tenantId, query);
    const current = await this.productMetrics(tenantId, context.current, context.period.timezone, query);
    const previous = context.previous ? await this.productMetrics(tenantId, context.previous, context.period.timezone, query) : null;
    return { period: context.period, current, previous, delta: null };
  }

  async acquisition(tenantId: string, query: AcquisitionQuery): Promise<AnalyticsAcquisitionResponse> {
    const context = await this.context(tenantId, query);
    const current = await this.acquisitionMetrics(tenantId, context.current, context.period.timezone, query);
    const previous = context.previous ? await this.acquisitionMetrics(tenantId, context.previous, context.period.timezone, query) : null;
    return { period: context.period, attribution: { attributionStatus: 'partial', coverage: 'utm_tagged_only', directUnknownAvailable: false, revenueAttributionAvailable: false }, current, previous, delta: null };
  }

  private async context(tenantId: string, query: PerformanceQuery): Promise<{ period: AnalyticsPerformancePeriod; current: Range; previous: Range | null }> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { timezone: true } });
    const requested = settings?.timezone?.trim();
    const timezone = requested && DateTime.now().setZone(requested).isValid ? requested : DEFAULT_TIMEZONE;
    const today = DateTime.now().setZone(timezone).startOf('day');
    const from = query.from ? this.date(query.from, timezone) : today.minus({ days: 29 });
    const to = query.to ? this.date(query.to, timezone) : today;
    if (to < from) throw new BadRequestException('from must be on or before to');
    const days = Math.floor(to.diff(from, 'days').days) + 1;
    if (days > MAX_DAYS) throw new BadRequestException('range must not exceed 90 days');
    const current = this.range(from, to);
    return { period: { from: from.toISODate() as string, to: to.toISODate() as string, timezone }, current, previous: query.compare ? this.range(from.minus({ days }), from.minus({ days: 1 })) : null };
  }

  private date(value: string, timezone: string): DateTime { const parsed = DateTime.fromISO(value, { zone: timezone }).startOf('day'); if (!parsed.isValid || parsed.toISODate() !== value) throw new BadRequestException('dates must use YYYY-MM-DD'); return parsed; }
  private range(from: DateTime, to: DateTime): Range { return { start: new Date(`${from.toISODate()}T00:00:00.000Z`), end: new Date(`${to.toISODate()}T23:59:59.999Z`) }; }

  private async behavioral(tenantId: string, range: Range, timezone: string, dimensionType = 'overall') {
    return this.prisma.analyticsDailyAggregate.findMany({ where: { tenantId, timezone, bucketDate: { gte: range.start, lte: range.end }, dimensionType, ...(dimensionType === 'overall' ? { dimensionKey: '__all__' } : {}), eventName: { in: [...EVENTS] } }, select: { eventName: true, eventCount: true, uniqueSessions: true } });
  }
  private async overviewMetrics(tenantId: string, range: Range, timezone: string): Promise<AnalyticsOverviewResponse['current']> {
    const [rows, completed, cancelled] = await Promise.all([this.behavioral(tenantId, range, timezone), this.prisma.order.aggregate({ where: { tenantId, status: 'completed', createdAt: { gte: range.start, lte: range.end } }, _sum: { total: true }, _count: { _all: true } }), this.prisma.order.count({ where: { tenantId, status: 'cancelled', createdAt: { gte: range.start, lte: range.end } } })]);
    const event = (name: string, field: 'eventCount' | 'uniqueSessions' = 'eventCount') => rows.filter((row) => row.eventName === name).reduce((total, row) => total + row[field], 0);
    const revenue = this.number(completed._sum.total); const completedCount = completed._count._all; const submitted = event('order_submitted');
    return { sessions: event('menu_viewed', 'uniqueSessions'), menuViews: event('menu_viewed'), productViews: event('product_viewed'), addToCart: event('add_to_cart'), checkoutStarted: event('checkout_started'), ordersSubmitted: submitted, ordersConfirmed: event('order_confirmed'), ordersCompleted: completedCount, ordersCancelled: cancelled, storefrontConversionRate: this.rate(event('order_submitted', 'uniqueSessions'), event('menu_viewed', 'uniqueSessions')), acceptanceRate: this.rate(event('order_confirmed'), submitted), completionRate: this.rate(completedCount, submitted), realizedRevenue: revenue, averageOrderValue: this.rate(revenue, completedCount), currency: 'BRL' };
  }
  private async funnelMetrics(tenantId: string, range: Range, timezone: string): Promise<AnalyticsFunnelResponse['current']> {
    const rows = await this.behavioral(tenantId, range, timezone); const names = ['menu_viewed', 'product_viewed', 'add_to_cart', 'checkout_started', 'order_submitted', 'order_completed'] as const;
    const value = (name: string, key: 'eventCount' | 'uniqueSessions') => rows.filter((row) => row.eventName === name).reduce((total, row) => total + row[key], 0);
    const start = value(names[0], 'uniqueSessions');
    return names.map((eventName, index) => { const sessions = value(eventName, 'uniqueSessions'); const previous = index ? value(names[index - 1], 'uniqueSessions') : sessions; return { eventName, eventCount: value(eventName, 'eventCount'), uniqueSessions: sessions, conversionFromPrevious: index ? this.rate(sessions, previous) : 1, conversionFromStart: this.rate(sessions, start), dropOffFromPrevious: index ? 1 - this.rate(sessions, previous) : 0 }; });
  }
  private async productMetrics(tenantId: string, range: Range, timezone: string, query: ProductsQuery): Promise<AnalyticsProductsResponse['current']> {
    const [analytics, completed] = await Promise.all([this.prisma.analyticsDailyAggregate.findMany({ where: { tenantId, timezone, bucketDate: { gte: range.start, lte: range.end }, dimensionType: 'product', eventName: { in: ['product_viewed', 'product_selected', 'add_to_cart'] } }, select: { dimensionKey: true, eventName: true, eventCount: true } }), this.prisma.orderItem.groupBy({ by: ['productId'], where: { tenantId, productId: { not: null }, order: { tenantId, status: 'completed', createdAt: { gte: range.start, lte: range.end } } }, _count: { _all: true }, _sum: { quantity: true, lineTotal: true } })]);
    const ids = new Set<string>(analytics.map((row) => row.dimensionKey)); for (const row of completed) if (row.productId) ids.add(row.productId); const productIds = [...ids];
    const products = await this.prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, name: true, categoryId: true, category: { select: { name: true } } } }); const catalog = new Map(products.map((product) => [product.id, product]));
    const items = productIds.map((productId) => { const catalogProduct = catalog.get(productId); const count = (name: string) => analytics.filter((row) => row.dimensionKey === productId && row.eventName === name).reduce((total, row) => total + row.eventCount, 0); const order = completed.find((row) => row.productId === productId); const views = count('product_viewed'); const addToCart = count('add_to_cart'); return { productId, productName: catalogProduct?.name ?? 'Produto removido', categoryId: catalogProduct?.categoryId ?? null, categoryName: catalogProduct?.category?.name ?? null, views, selections: count('product_selected'), addToCart, ordersSubmitted: 0, ordersCompleted: order?._count._all ?? 0, quantityCompleted: order?._sum.quantity ?? 0, realizedRevenue: this.number(order?._sum.lineTotal), viewToCartRate: this.rate(addToCart, views), cartToOrderRate: 0, currency: 'BRL' as const }; });
    const ordered = this.sort(items, query.sort); return { items: ordered.slice((query.page - 1) * query.limit, query.page * query.limit), page: query.page, limit: query.limit, total: ordered.length };
  }
  private async acquisitionMetrics(tenantId: string, range: Range, timezone: string, query: AcquisitionQuery): Promise<AnalyticsAcquisitionResponse['current']> {
    const rows = await this.prisma.analyticsDailyAggregate.findMany({ where: { tenantId, timezone, bucketDate: { gte: range.start, lte: range.end }, dimensionType: { in: ['utm_source', 'utm_medium', 'utm_campaign'] }, eventName: { in: ['menu_viewed', 'order_submitted', 'order_completed'] } }, select: { dimensionType: true, dimensionKey: true, eventName: true, eventCount: true, uniqueSessions: true } }); const map = new Map<string, { dimensionType: 'utm_source' | 'utm_medium' | 'utm_campaign'; dimensionKey: string; sessions: number; menuViews: number; ordersSubmitted: number; ordersCompleted: number }>();
    for (const row of rows) { const key = `${row.dimensionType}:${row.dimensionKey}`; const entry = map.get(key) ?? { dimensionType: row.dimensionType as 'utm_source' | 'utm_medium' | 'utm_campaign', dimensionKey: row.dimensionKey, sessions: 0, menuViews: 0, ordersSubmitted: 0, ordersCompleted: 0 }; if (row.eventName === 'menu_viewed') { entry.menuViews += row.eventCount; entry.sessions += row.uniqueSessions; } else if (row.eventName === 'order_submitted') entry.ordersSubmitted += row.eventCount; else entry.ordersCompleted += row.eventCount; map.set(key, entry); }
    const ordered = this.sort([...map.values()].map((entry) => ({ ...entry, conversionRate: this.rate(entry.ordersSubmitted, entry.sessions), realizedRevenue: null })), query.sort); return { items: ordered.slice((query.page - 1) * query.limit, query.page * query.limit), page: query.page, limit: query.limit, total: ordered.length };
  }
  private number(value: Prisma.Decimal | number | null | undefined): number { return value === null || value === undefined ? 0 : Number(value.toString()); }
  private rate(numerator: number, denominator: number): number { return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6)); }
  private delta(current: number, previous: number) { return { absolute: Number((current - previous).toFixed(6)), percentage: previous === 0 ? (current === 0 ? 0 : null) : Number((((current - previous) / previous) * 100).toFixed(6)), direction: current === previous ? 'flat' as const : current > previous ? 'up' as const : 'down' as const }; }
  private overviewDelta(current: AnalyticsOverviewResponse['current'], previous: AnalyticsOverviewResponse['current']) { return Object.fromEntries(Object.keys(current).filter((key) => key !== 'currency').map((key) => [key, this.delta(current[key as keyof typeof current] as number, previous[key as keyof typeof previous] as number)])); }
  private sort<T extends Record<string, unknown>>(items: T[], field: string): T[] { return [...items].sort((left, right) => Number(right[field] ?? 0) - Number(left[field] ?? 0) || String(left.productId ?? `${left.dimensionType}:${left.dimensionKey}`).localeCompare(String(right.productId ?? `${right.dimensionType}:${right.dimensionKey}`))); }
}
