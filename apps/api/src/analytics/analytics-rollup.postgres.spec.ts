import { Prisma, PrismaClient } from '@prisma/client';
import { AnalyticsRollupService } from './analytics-rollup.service';
import { AnalyticsRetentionService } from './analytics-retention.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);
const databaseUrl = process.env.DATABASE_URL;
const postgresEnabled = process.env.ANALYTICS_ROLLUP_POSTGRES_TEST === 'true'
  && Boolean(databaseUrl)
  && allowedDatabaseHosts.has(new URL(databaseUrl as string).hostname);
const describeWithPostgres = postgresEnabled ? describe : describe.skip;

describeWithPostgres('analytics daily rollup ephemeral PostgreSQL proof', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient();
  const rollup = new AnalyticsRollupService(prisma as never);
  const retention = new AnalyticsRetentionService(prisma as never);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantA = `analytics-a-${suffix}`;
  const tenantB = `analytics-b-${suffix}`;

  const job = (overrides: Partial<{
    tenantId: string;
    fromDate: string;
    toDate: string;
    timezone: string;
    reason: 'backfill' | 'late-event-recompute';
  }> = {}) => ({
    tenantId: tenantA,
    fromDate: '2026-07-29',
    toDate: '2026-07-29',
    timezone: 'America/Sao_Paulo',
    reason: 'backfill' as const,
    requestedAt: '2026-07-30T12:00:00.000Z',
    ...overrides,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Analytics A', slug: `analytics-a-${suffix}` },
        { id: tenantB, name: 'Analytics B', slug: `analytics-b-${suffix}` },
      ],
    });
    await prisma.tenantSettings.createMany({
      data: [
        { tenantId: tenantA, timezone: 'America/Sao_Paulo' },
        { tenantId: tenantB, timezone: 'America/Sao_Paulo' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS analytics_rollup_test_fail_trigger ON analytics_daily_aggregates',
    ).catch(() => undefined);
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS analytics_rollup_test_fail()')
      .catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('applies the table, complete unique key, indexes, checks, FK and defaults', async () => {
    const [table] = await prisma.$queryRaw<Array<{ name: string | null }>>`
      SELECT to_regclass('public.analytics_daily_aggregates')::text AS name
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_daily_aggregates'
    `;
    const constraints = await prisma.$queryRaw<Array<{ conname: string; contype: string }>>`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'analytics_daily_aggregates'::regclass
    `;
    const defaults = await prisma.$queryRaw<Array<{ column_name: string; column_default: string | null }>>`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'analytics_daily_aggregates'
        AND column_name IN ('value_sum', 'quantity_sum', 'item_count_sum', 'created_at', 'updated_at')
    `;

    expect(table?.name).toBe('analytics_daily_aggregates');
    expect(indexes.map((index) => index.indexname)).toEqual(expect.arrayContaining([
      'analytics_daily_aggregates_scope_key',
      'analytics_daily_aggregates_tenant_date_event_idx',
      'analytics_daily_aggregates_tenant_date_dimension_idx',
    ]));
    expect(constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ conname: 'analytics_daily_aggregates_tenant_id_fkey', contype: 'f' }),
      expect.objectContaining({ conname: 'analytics_daily_aggregates_event_name_check', contype: 'c' }),
      expect.objectContaining({ conname: 'analytics_daily_aggregates_dimension_check', contype: 'c' }),
      expect.objectContaining({ conname: 'analytics_daily_aggregates_overall_key_check', contype: 'c' }),
    ]));
    expect(defaults.every((column) => column.column_default !== null)).toBe(true);
  });

  it('proves tenant isolation, dimensions, sums, replay determinism and logical duplicate rejection', async () => {
    await prisma.analyticsEvent.createMany({
      data: [
        {
          tenantId: tenantA,
          eventId: `a-1-${suffix}`,
          schemaVersion: 1,
          eventName: 'add_to_cart',
          source: 'browser',
          occurredAt: new Date('2026-07-29T12:00:00.000Z'),
          receivedAt: new Date('2026-07-29T12:00:01.000Z'),
          sessionId: 'session-analytics-a',
          productId: 'shared-product',
          utmSource: 'google',
          utmMedium: 'cpc',
          utmCampaign: 'lunch',
          value: new Prisma.Decimal('10.25'),
          quantity: 2,
          itemCount: 3,
          consentAnalytics: true,
          consentMarketing: false,
        },
        {
          tenantId: tenantA,
          eventId: `a-2-${suffix}`,
          schemaVersion: 1,
          eventName: 'add_to_cart',
          source: 'browser',
          occurredAt: new Date('2026-07-29T13:00:00.000Z'),
          receivedAt: new Date('2026-07-29T13:00:01.000Z'),
          sessionId: 'session-analytics-a',
          productId: 'shared-product',
          utmSource: 'google',
          utmMedium: 'cpc',
          utmCampaign: 'lunch',
          value: new Prisma.Decimal('4.75'),
          quantity: 1,
          itemCount: 2,
          consentAnalytics: true,
          consentMarketing: false,
        },
        {
          tenantId: tenantA,
          eventId: `a-3-${suffix}`,
          schemaVersion: 1,
          eventName: 'category_viewed',
          source: 'browser',
          occurredAt: new Date('2026-07-29T14:00:00.000Z'),
          receivedAt: new Date('2026-07-29T14:00:01.000Z'),
          sessionId: 'session-analytics-b',
          categoryId: 'category-a',
          consentAnalytics: true,
          consentMarketing: false,
        },
        {
          tenantId: tenantB,
          eventId: `b-1-${suffix}`,
          schemaVersion: 1,
          eventName: 'add_to_cart',
          source: 'browser',
          occurredAt: new Date('2026-07-29T12:00:00.000Z'),
          receivedAt: new Date('2026-07-29T12:00:01.000Z'),
          sessionId: 'session-tenant-b',
          productId: 'shared-product',
          quantity: 99,
          consentAnalytics: true,
          consentMarketing: false,
        },
      ],
    });

    await rollup.recomputeRange(job());
    const firstState = await aggregateState(tenantA);
    const overall = firstState.find((row) => (
      row.eventName === 'add_to_cart' && row.dimensionType === 'overall'
    ));
    expect(overall).toMatchObject({
      dimensionKey: '__all__',
      eventCount: 2,
      uniqueSessions: 1,
      valueSum: '15',
      quantitySum: 3,
      itemCountSum: 5,
    });
    expect(new Set(firstState.map((row) => row.dimensionType))).toEqual(new Set([
      'overall', 'product', 'category', 'utm_source', 'utm_medium', 'utm_campaign',
    ]));
    expect(await prisma.analyticsDailyAggregate.count({ where: { tenantId: tenantB } })).toBe(0);

    await rollup.recomputeRange(job());
    expect(await aggregateState(tenantA)).toEqual(firstState);

    const duplicate = await prisma.analyticsDailyAggregate.findFirstOrThrow({
      where: { tenantId: tenantA },
    });
    await expect(prisma.analyticsDailyAggregate.create({
      data: {
        ...duplicate,
        id: `duplicate-${suffix}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('uses local-day boundaries, incorporates late events and serializes overlapping jobs', async () => {
    await prisma.analyticsEvent.createMany({
      data: [
        {
          tenantId: tenantA,
          eventId: `boundary-before-${suffix}`,
          schemaVersion: 1,
          eventName: 'menu_viewed',
          source: 'browser',
          occurredAt: new Date('2026-07-30T02:59:59.000Z'),
          receivedAt: new Date('2026-07-30T03:30:00.000Z'),
          sessionId: 'session-boundary-before',
          consentAnalytics: true,
          consentMarketing: false,
        },
        {
          tenantId: tenantA,
          eventId: `boundary-after-${suffix}`,
          schemaVersion: 1,
          eventName: 'menu_viewed',
          source: 'browser',
          occurredAt: new Date('2026-07-30T03:00:00.000Z'),
          receivedAt: new Date('2026-07-30T03:00:01.000Z'),
          sessionId: 'session-boundary-after',
          consentAnalytics: true,
          consentMarketing: false,
        },
      ],
    });

    await Promise.all([
      rollup.recomputeRange(job({ reason: 'late-event-recompute' })),
      rollup.recomputeRange(job({ reason: 'late-event-recompute' })),
    ]);
    const menu = await prisma.analyticsDailyAggregate.findFirstOrThrow({
      where: {
        tenantId: tenantA,
        bucketDate: new Date('2026-07-29T00:00:00.000Z'),
        eventName: 'menu_viewed',
        dimensionType: 'overall',
        dimensionKey: '__all__',
      },
    });
    expect(menu.eventCount).toBe(1);
    expect(menu.sourceMaxReceivedAt).toEqual(new Date('2026-07-30T03:30:00.000Z'));
  });

  it('rolls back the complete replace when aggregate insertion fails', async () => {
    const before = await aggregateState(tenantA);
    await prisma.analyticsEvent.create({
      data: {
        tenantId: tenantA,
        eventId: `rollback-${suffix}`,
        schemaVersion: 1,
        eventName: 'product_viewed',
        source: 'browser',
        occurredAt: new Date('2026-07-29T15:00:00.000Z'),
        receivedAt: new Date('2026-07-29T15:00:01.000Z'),
        sessionId: 'session-rollback',
        productId: 'rollback-product',
        utmCampaign: 'rollback-trigger',
        consentAnalytics: true,
        consentMarketing: false,
      },
    });
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION analytics_rollup_test_fail() RETURNS trigger AS $$
      BEGIN
        IF NEW.dimension_key = 'rollback-trigger' THEN
          RAISE EXCEPTION 'analytics rollback proof';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER analytics_rollup_test_fail_trigger
      BEFORE INSERT ON analytics_daily_aggregates
      FOR EACH ROW EXECUTE FUNCTION analytics_rollup_test_fail()
    `);

    try {
      await expect(rollup.recomputeRange(job())).rejects.toThrow('analytics rollback proof');
      expect(await aggregateState(tenantA)).toEqual(before);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER analytics_rollup_test_fail_trigger ON analytics_daily_aggregates',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION analytics_rollup_test_fail()');
    }
  });

  it('keeps dry-run read-only for an explicit backfill range', async () => {
    const before = await aggregateState(tenantB);
    await rollup.recomputeRange(job({ tenantId: tenantB }), { dryRun: true });
    expect(await aggregateState(tenantB)).toEqual(before);
  });

  it('purges only old raw events in chunks and preserves newer events and aggregates', async () => {
    await rollup.recomputeRange(job({ tenantId: tenantB }));
    const aggregateCount = await prisma.analyticsDailyAggregate.count({ where: { tenantId: tenantB } });
    await prisma.analyticsEvent.create({
      data: {
        tenantId: tenantB,
        eventId: `retention-old-${suffix}`,
        schemaVersion: 1,
        eventName: 'menu_viewed',
        source: 'browser',
        occurredAt: new Date('2026-01-01T12:00:00.000Z'),
        receivedAt: new Date('2026-01-01T12:00:01.000Z'),
        sessionId: 'session-retention-old',
        consentAnalytics: true,
        consentMarketing: false,
      },
    });
    const previous = process.env.ANALYTICS_RAW_RETENTION_ENABLED;
    process.env.ANALYTICS_RAW_RETENTION_ENABLED = 'true';
    try {
      await expect(retention.purgeTenantRawEvents({
        tenantId: tenantB,
        olderThan: new Date('2026-07-01T00:00:00.000Z'),
        batchSize: 1,
      })).resolves.toEqual({ deleted: 1 });
    } finally {
      if (previous === undefined) delete process.env.ANALYTICS_RAW_RETENTION_ENABLED;
      else process.env.ANALYTICS_RAW_RETENTION_ENABLED = previous;
    }
    expect(await prisma.analyticsEvent.count({
      where: { tenantId: tenantB, eventId: `retention-old-${suffix}` },
    })).toBe(0);
    expect(await prisma.analyticsEvent.count({ where: { tenantId: tenantB } })).toBe(1);
    expect(await prisma.analyticsDailyAggregate.count({ where: { tenantId: tenantB } }))
      .toBe(aggregateCount);
  });

  async function aggregateState(tenantId: string) {
    const rows = await prisma.analyticsDailyAggregate.findMany({
      where: { tenantId },
      orderBy: [
        { bucketDate: 'asc' },
        { eventName: 'asc' },
        { dimensionType: 'asc' },
        { dimensionKey: 'asc' },
      ],
    });
    return rows.map((row) => ({
      ...row,
      valueSum: row.valueSum.toString(),
    }));
  }
});
