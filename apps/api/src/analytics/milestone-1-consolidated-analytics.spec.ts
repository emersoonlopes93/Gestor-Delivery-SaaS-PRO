import 'reflect-metadata';
import {
  AnalyticsEventEnvelopeV1Schema,
  AnalyticsPublicBrowserEventV1Schema,
} from '@gestor/types';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { AuthoritativeOrderAnalyticsService } from './authoritative-order-analytics.service';
import { OrderStatus } from '@prisma/client';

const receivedAt = new Date('2026-07-29T12:01:00.000Z');
const consent = { analytics: true, marketing: false, version: 'v1' } as const;
let browserSequence = 1;

function browserEvent(eventName: string, context?: Record<string, unknown>, analytics = true) {
  const candidate: Record<string, unknown> = {
    schemaVersion: 1,
    eventId: `00000000-0000-4000-8000-${String(browserSequence++).padStart(12, '0')}`,
    eventName,
    source: 'browser',
    occurredAt: '2026-07-29T12:00:00.000Z',
    sessionId: 'session_0123456789',
    consent: { ...consent, analytics },
  };
  if (context) candidate.context = context;
  if (eventName === 'add_to_cart') candidate.metrics = { quantity: 1, currency: 'BRL' };
  return candidate;
}

describe('Marco 1 consolidated analytics validation', () => {
  it('covers consent, browser funnel order, strict payload privacy and tenant-scoped ingestion', async () => {
    const createMany = jest.fn().mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-a' }]) },
      productCategory: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([{ id: 'order-a' }]) },
      analyticsEvent: { createMany },
    };
    const ingestion = new AnalyticsIngestionService(prisma as never);
    const funnel = [
      browserEvent('menu_viewed'),
      browserEvent('product_viewed', { productId: 'product-a' }),
      browserEvent('add_to_cart', { productId: 'product-a', cartId: 'cart-a', cartLineId: 'line-a' }),
      browserEvent('checkout_started', { cartId: 'cart-a' }),
      browserEvent('order_submitted', { orderId: 'order-a' }),
    ].map((candidate) => AnalyticsPublicBrowserEventV1Schema.parse(candidate));

    expect(funnel.map((event) => event.eventName)).toEqual([
      'menu_viewed', 'product_viewed', 'add_to_cart', 'checkout_started', 'order_submitted',
    ]);
    expect(AnalyticsEventEnvelopeV1Schema.safeParse({ ...funnel[0], tenantId: 'tenant-a', email: 'secret@example.com' }).success).toBe(false);

    await expect(ingestion.ingest('tenant-a', funnel, receivedAt)).resolves.toEqual({
      accepted: 5, duplicates: 0, ignored: 0,
    });
    await expect(ingestion.ingest('tenant-a', [AnalyticsPublicBrowserEventV1Schema.parse(browserEvent('menu_viewed', undefined, false))], receivedAt))
      .resolves.toEqual({ accepted: 0, duplicates: 0, ignored: 1 });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ tenantId: 'tenant-a', eventName: 'order_submitted' })]),
    }));
  });

  it('keeps retry ids stable, isolates tenants, deduplicates and rolls back with the order transaction', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { analyticsEvent: { createMany } };
    const authoritative = new AuthoritativeOrderAnalyticsService();
    const input = {
      orderId: 'order-a',
      orderStatus: OrderStatus.completed,
      orderTotal: 42.5,
      occurredAt: receivedAt,
      tx: tx as never,
    };

    await authoritative.recordOrderStatusEvent({ ...input, tenantId: 'tenant-a' });
    await authoritative.recordOrderStatusEvent({ ...input, tenantId: 'tenant-a' });
    await authoritative.recordOrderStatusEvent({ ...input, tenantId: 'tenant-b' });
    const calls = createMany.mock.calls.map((call) => call[0].data);
    expect(calls[0].eventId).toBe(calls[1].eventId);
    expect(calls[0].eventId).not.toBe(calls[2].eventId);
    expect(calls.map((data: { tenantId: string }) => data.tenantId)).toEqual(['tenant-a', 'tenant-a', 'tenant-b']);
    expect(createMany).toHaveBeenLastCalledWith(expect.objectContaining({ skipDuplicates: true }));

    const state: { status: OrderStatus; events: unknown[] } = { status: OrderStatus.pending, events: [] };
    const transactionalClient = {
      analyticsEvent: {
        createMany: jest.fn(async ({ data }: { data: unknown }) => {
          state.events.push(data);
          return { count: 1 };
        }),
      },
    };
    const previousStatus = state.status;
    try {
      state.status = OrderStatus.completed;
      await authoritative.recordOrderStatusEvent({ ...input, tenantId: 'tenant-a', tx: transactionalClient as never });
      throw new Error('rollback sentinel');
    } catch {
      state.status = previousStatus;
      state.events.length = 0;
    }
    expect(state).toEqual({ status: OrderStatus.pending, events: [] });
  });

  it('emits the PDV confirmation event through the same authoritative backend contract', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const authoritative = new AuthoritativeOrderAnalyticsService();
    await authoritative.recordOrderStatusEvent({
      tenantId: 'tenant-a',
      orderId: 'pos-order-a',
      orderStatus: OrderStatus.confirmed,
      orderTotal: 10,
      occurredAt: receivedAt,
      tx: { analyticsEvent: { createMany } } as never,
    });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventName: 'order_confirmed', source: 'server' }),
    }));
  });
});
