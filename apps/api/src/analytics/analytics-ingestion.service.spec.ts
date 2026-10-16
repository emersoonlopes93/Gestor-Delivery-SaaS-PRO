import { BadRequestException } from '@nestjs/common';
import { AnalyticsIngestionService } from './analytics-ingestion.service';

const event = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  eventId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  eventName: 'product_viewed' as const,
  source: 'browser' as const,
  occurredAt: '2026-07-29T12:00:00.000Z',
  sessionId: 'session_0123456789',
  consent: { analytics: true, marketing: false, version: 'v1' },
  context: { productId: 'product-a' },
  ...overrides,
});

describe('AnalyticsIngestionService', () => {
  const prisma = {
    tenant: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
    productCategory: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
    analyticsEvent: { createMany: jest.fn() },
  };
  const service = new AnalyticsIngestionService(prisma as never);
  const receivedAt = new Date('2026-07-29T12:01:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.findMany.mockResolvedValue([{ id: 'product-a' }]);
    prisma.productCategory.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.analyticsEvent.createMany.mockResolvedValue({ count: 1 });
  });

  it('stores only consented browser events and records server receivedAt', async () => {
    await expect(service.ingest('tenant-a', [event()], receivedAt)).resolves.toEqual({
      accepted: 1, duplicates: 0, ignored: 0,
    });
    expect(prisma.analyticsEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({ tenantId: 'tenant-a', receivedAt, consentAnalytics: true })],
    }));
  });

  it('does not persist analytics=false and returns a stable ignored count', async () => {
    await expect(service.ingest('tenant-a', [event({ consent: { analytics: false, marketing: true, version: 'v1' } })], receivedAt))
      .resolves.toEqual({ accepted: 0, duplicates: 0, ignored: 1 });
    expect(prisma.analyticsEvent.createMany).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant or unknown references without persisting', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await expect(service.ingest('tenant-a', [event()], receivedAt)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.analyticsEvent.createMany).not.toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', id: { in: ['product-a'] } },
    }));
  });

  it('reports database-protected duplicates without a unique violation', async () => {
    prisma.analyticsEvent.createMany.mockResolvedValue({ count: 0 });
    await expect(service.ingest('tenant-a', [event()], receivedAt)).resolves.toEqual({
      accepted: 0, duplicates: 1, ignored: 0,
    });
  });

  it('rejects stale and future timestamps before reference lookups', async () => {
    await expect(service.ingest('tenant-a', [event({ occurredAt: '2026-07-28T11:00:00.000Z' })], receivedAt))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.ingest('tenant-a', [event({ occurredAt: '2026-07-29T12:07:00.000Z' })], receivedAt))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});
