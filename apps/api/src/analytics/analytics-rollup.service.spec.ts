import { Prisma } from '@prisma/client';
import { AnalyticsRollupService } from './analytics-rollup.service';

const tenantId = 'tenant-a';

function event(overrides: Partial<{
  id: string;
  eventName: string;
  occurredAt: Date;
  receivedAt: Date;
  sessionId: string;
  productId: string | null;
  categoryId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  value: Prisma.Decimal | null;
  quantity: number | null;
  itemCount: number | null;
}> = {}) {
  return {
    id: 'event-a',
    eventName: 'add_to_cart',
    occurredAt: new Date('2026-07-29T12:00:00.000Z'),
    receivedAt: new Date('2026-07-29T12:00:01.000Z'),
    sessionId: 'session-00000001',
    productId: 'product-a',
    categoryId: null,
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'lunch',
    value: new Prisma.Decimal('10.25'),
    quantity: 2,
    itemCount: 3,
    ...overrides,
  };
}

function harness(events: ReturnType<typeof event>[]) {
  const rows: Array<Record<string, unknown>> = [];
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    analyticsEvent: {
      findMany: jest.fn().mockImplementation(async () => events),
    },
    analyticsDailyAggregate: {
      findMany: jest.fn().mockImplementation(async () => [...rows]),
      deleteMany: jest.fn().mockImplementation(async ({ where }: {
        where: { id: { in: string[] } };
      }) => {
        const ids = new Set(where.id.in);
        const before = rows.length;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (ids.has(rows[index].id as string)) rows.splice(index, 1);
        }
        return { count: before - rows.length };
      }),
      createMany: jest.fn().mockImplementation(async ({ data }: {
        data: Array<Record<string, unknown>>;
      }) => {
        rows.push(...data);
        return { count: data.length };
      }),
    },
  };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: tenantId }) },
    analyticsEvent: tx.analyticsEvent,
    $transaction: jest.fn().mockImplementation(async (
      operation: (client: typeof tx) => Promise<unknown>,
    ) => operation(tx)),
  };
  return { rows, tx, prisma, service: new AnalyticsRollupService(prisma as never) };
}

function job(overrides: Partial<{
  tenantId: string;
  fromDate: string;
  toDate: string;
  timezone: string;
}> = {}) {
  return {
    tenantId,
    fromDate: '2026-07-29',
    toDate: '2026-07-29',
    timezone: 'America/Sao_Paulo',
    reason: 'backfill' as const,
    requestedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function stableRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    bucketDate: row.bucketDate,
    timezone: row.timezone,
    eventName: row.eventName,
    dimensionType: row.dimensionType,
    dimensionKey: row.dimensionKey,
    eventCount: row.eventCount,
    uniqueSessions: row.uniqueSessions,
    valueSum: String(row.valueSum),
    quantitySum: row.quantitySum,
    itemCountSum: row.itemCountSum,
    firstOccurredAt: row.firstOccurredAt,
    lastOccurredAt: row.lastOccurredAt,
    sourceMaxReceivedAt: row.sourceMaxReceivedAt,
  }));
}

describe('AnalyticsRollupService', () => {
  it('materializes all canonical dimensions and exact session/value/quantity/item sums', async () => {
    const fixture = harness([
      event(),
      event({
        id: 'event-b',
        occurredAt: new Date('2026-07-29T13:00:00.000Z'),
        receivedAt: new Date('2026-07-29T13:00:01.000Z'),
        value: new Prisma.Decimal('4.75'),
        quantity: 1,
        itemCount: 2,
      }),
      event({
        id: 'event-c',
        eventName: 'category_viewed',
        sessionId: 'session-00000002',
        productId: null,
        categoryId: 'category-a',
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        value: null,
        quantity: null,
        itemCount: null,
      }),
    ]);

    await fixture.service.recomputeRange(job());

    const overall = fixture.rows.find((row) => (
      row.eventName === 'add_to_cart' && row.dimensionType === 'overall'
    ));
    expect(overall).toMatchObject({
      dimensionKey: '__all__',
      eventCount: 2,
      uniqueSessions: 1,
      quantitySum: 3,
      itemCountSum: 5,
    });
    expect(String(overall?.valueSum)).toBe('15');
    expect(new Set(fixture.rows.map((row) => row.dimensionType))).toEqual(new Set([
      'overall', 'product', 'category', 'utm_source', 'utm_medium', 'utm_campaign',
    ]));
  });

  it('is replay and input-order deterministic and does not rewrite identical rows', async () => {
    const events = [
      event({ id: 'event-b', value: new Prisma.Decimal('0.20') }),
      event({ id: 'event-a', value: new Prisma.Decimal('0.10') }),
    ];
    const fixture = harness(events);
    await fixture.service.recomputeRange(job());
    const first = stableRows(fixture.rows);
    const firstUpdatedAt = fixture.rows.map((row) => row.updatedAt);

    events.reverse();
    await fixture.service.recomputeRange(job());

    expect(stableRows(fixture.rows)).toEqual(first);
    expect(fixture.rows.map((row) => row.updatedAt)).toEqual(firstUpdatedAt);
    expect(fixture.tx.analyticsDailyAggregate.createMany).toHaveBeenCalledTimes(1);
  });

  it('uses tenant-scoped boundaries for the local day and rejects silent timezone rewrites', async () => {
    const fixture = harness([event()]);
    await fixture.service.recomputeRange(job());

    expect(fixture.tx.analyticsEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        occurredAt: {
          gte: new Date('2026-07-29T03:00:00.000Z'),
          lt: new Date('2026-07-30T03:00:00.000Z'),
        },
      }),
    }));
    await expect(fixture.service.recomputeRange(job({ timezone: 'UTC' })))
      .rejects.toThrow('analytics_rollup_timezone_change_requires_explicit_migration');
  });

  it('enforces a bounded, valid range and keeps dry-run free of aggregate writes', async () => {
    const fixture = harness([event()]);
    await expect(fixture.service.recomputeRange(job({ fromDate: '2026-07-30', toDate: '2026-07-29' })))
      .rejects.toThrow('analytics_rollup_invalid_range');
    await expect(fixture.service.recomputeRange(job({ toDate: '2026-09-01' })))
      .rejects.toThrow('analytics_rollup_range_too_large');

    await fixture.service.recomputeRange(job(), { dryRun: true });
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
    expect(fixture.tx.analyticsDailyAggregate.createMany).not.toHaveBeenCalled();
  });
});
