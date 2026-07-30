import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  ANALYTICS_EVENT_NAMES_V1,
  type AnalyticsAggregateDimensionType,
  type AnalyticsRollupJobV1,
} from '@gestor/types';
import {
  type AnalyticsDailyAggregate,
  Prisma,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const OVERALL_KEY = '__all__';
const EVENT_PAGE_SIZE = 1_000;
const MAX_EVENTS_PER_DAY = 250_000;
export const MAX_ANALYTICS_BACKFILL_DAYS = 31;

const isAggregatePrimaryKeyConflict = (error: unknown): boolean => (
  error instanceof Prisma.PrismaClientKnownRequestError
  && error.code === 'P2002'
  && Array.isArray(error.meta?.target)
  && error.meta.target.includes('id')
);

type RollupEvent = {
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
};

type MutableAggregate = {
  eventName: string;
  dimensionType: AnalyticsAggregateDimensionType;
  dimensionKey: string;
  eventCount: number;
  sessions: Set<string>;
  valueSum: Prisma.Decimal;
  quantitySum: number;
  itemCountSum: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  sourceMaxReceivedAt: Date;
};

type MaterializedAggregate = Omit<MutableAggregate, 'sessions'> & {
  uniqueSessions: number;
};

export type AnalyticsRollupResult = {
  tenantId: string;
  fromDate: string;
  toDate: string;
  timezone: string;
  bucketCount: number;
  rawEventCount: number;
  aggregateRowCount: number;
  lateEventCount: number;
  dryRun: boolean;
};

@Injectable()
export class AnalyticsRollupService {
  private readonly logger = new Logger(AnalyticsRollupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantTimezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: { select: { timezone: true } } },
    });
    if (!tenant) throw new Error('analytics_rollup_tenant_not_found');
    return tenant.settings?.timezone?.trim() || DEFAULT_TIMEZONE;
  }

  async recomputeRange(
    input: AnalyticsRollupJobV1,
    options: { dryRun?: boolean } = {},
  ): Promise<AnalyticsRollupResult> {
    const startedAt = Date.now();
    const days = this.rangeDays(input.fromDate, input.toDate, input.timezone);
    let rawEventCount = 0;
    let aggregateRowCount = 0;
    let lateEventCount = 0;

    await this.assertTenant(input.tenantId);

    for (const day of days) {
      const result = options.dryRun
        ? await this.previewDay(input.tenantId, day, input.timezone)
        : await this.recomputeDay(input.tenantId, day, input.timezone);
      rawEventCount += result.rawEventCount;
      aggregateRowCount += result.aggregateRowCount;
      lateEventCount += result.lateEventCount;
    }

    const result: AnalyticsRollupResult = {
      tenantId: input.tenantId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      timezone: input.timezone,
      bucketCount: days.length,
      rawEventCount,
      aggregateRowCount,
      lateEventCount,
      dryRun: options.dryRun === true,
    };
    this.logger.log(
      `analytics_rollup_complete tenantId=${input.tenantId} from=${input.fromDate} to=${input.toDate}`
      + ` timezone=${input.timezone} reason=${input.reason} buckets=${days.length}`
      + ` rawEvents=${rawEventCount} aggregateRows=${aggregateRowCount} lateEvents=${lateEventCount}`
      + ` dryRun=${result.dryRun} durationMs=${Date.now() - startedAt}`,
    );
    return result;
  }

  private async assertTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new Error('analytics_rollup_tenant_not_found');
  }

  private rangeDays(fromDate: string, toDate: string, timezone: string): string[] {
    let cursor = DateTime.fromISO(fromDate, { zone: timezone });
    const end = DateTime.fromISO(toDate, { zone: timezone });
    if (!cursor.isValid || !end.isValid || cursor.toISODate() !== fromDate || end.toISODate() !== toDate) {
      throw new Error('analytics_rollup_invalid_date_or_timezone');
    }
    if (end < cursor) throw new Error('analytics_rollup_invalid_range');

    const days: string[] = [];
    while (cursor <= end) {
      if (days.length >= MAX_ANALYTICS_BACKFILL_DAYS) {
        throw new Error('analytics_rollup_range_too_large');
      }
      days.push(cursor.toISODate() as string);
      cursor = cursor.plus({ days: 1 });
    }
    return days;
  }

  private async previewDay(tenantId: string, bucketDate: string, timezone: string) {
    const bounds = this.dayBounds(bucketDate, timezone);
    const calculated = await this.calculateAggregates(this.prisma, tenantId, bounds.start, bounds.end);
    return {
      rawEventCount: calculated.rawEventCount,
      aggregateRowCount: calculated.rows.length,
      lateEventCount: calculated.lateEventCount,
    };
  }

  private async recomputeDay(tenantId: string, bucketDate: string, timezone: string) {
    const bounds = this.dayBounds(bucketDate, timezone);
    const storedBucketDate = new Date(`${bucketDate}T00:00:00.000Z`);

    return runSerializableTransactionWithRetry(
      this.prisma,
      async (tx) => {
        const lockKey = `analytics-rollup:${tenantId}:${bucketDate}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

        const existing = await tx.analyticsDailyAggregate.findMany({
          where: { tenantId, bucketDate: storedBucketDate },
        });
        const conflictingTimezone = existing.find((row) => row.timezone !== timezone);
        if (conflictingTimezone) throw new Error('analytics_rollup_timezone_change_requires_explicit_migration');

        const calculated = await this.calculateAggregates(tx, tenantId, bounds.start, bounds.end);
        await this.replaceChangedRows(
          tx,
          tenantId,
          storedBucketDate,
          timezone,
          existing,
          calculated.rows,
        );
        return {
          rawEventCount: calculated.rawEventCount,
          aggregateRowCount: calculated.rows.length,
          lateEventCount: calculated.lateEventCount,
        };
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
        isAdditionalRetryableError: isAggregatePrimaryKeyConflict,
        onRetry: (attempt, delayMs) => this.logger.warn(
          `analytics_rollup_transaction_retry tenantId=${tenantId} bucketDate=${bucketDate}`
          + ` attempt=${attempt + 1} delayMs=${delayMs}`,
        ),
      },
    );
  }

  private dayBounds(bucketDate: string, timezone: string): { start: Date; end: Date } {
    const localStart = DateTime.fromISO(bucketDate, { zone: timezone }).startOf('day');
    if (!localStart.isValid || localStart.toISODate() !== bucketDate) {
      throw new Error('analytics_rollup_invalid_date_or_timezone');
    }
    return {
      start: localStart.toUTC().toJSDate(),
      end: localStart.plus({ days: 1 }).toUTC().toJSDate(),
    };
  }

  private async calculateAggregates(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<{ rows: MaterializedAggregate[]; rawEventCount: number; lateEventCount: number }> {
    const aggregates = new Map<string, MutableAggregate>();
    let cursor: string | undefined;
    let rawEventCount = 0;
    let lateEventCount = 0;

    do {
      const events: RollupEvent[] = await client.analyticsEvent.findMany({
        where: {
          tenantId,
          eventName: { in: [...ANALYTICS_EVENT_NAMES_V1] },
          occurredAt: { gte: start, lt: end },
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: EVENT_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          eventName: true,
          occurredAt: true,
          receivedAt: true,
          sessionId: true,
          productId: true,
          categoryId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          value: true,
          quantity: true,
          itemCount: true,
        },
      });
      if (events.length === 0) break;
      rawEventCount += events.length;
      if (rawEventCount > MAX_EVENTS_PER_DAY) throw new Error('analytics_rollup_daily_event_limit_exceeded');

      for (const event of events) {
        if (event.receivedAt >= end) lateEventCount += 1;
        for (const dimension of this.dimensions(event)) {
          this.addEvent(aggregates, event, dimension.type, dimension.key);
        }
      }
      cursor = events.at(-1)?.id;
      if (events.length < EVENT_PAGE_SIZE) break;
    } while (cursor);

    const rows = [...aggregates.values()]
      .map(({ sessions, ...aggregate }) => ({ ...aggregate, uniqueSessions: sessions.size }))
      .sort((left, right) => (
        left.eventName.localeCompare(right.eventName)
        || left.dimensionType.localeCompare(right.dimensionType)
        || left.dimensionKey.localeCompare(right.dimensionKey)
      ));
    return { rows, rawEventCount, lateEventCount };
  }

  private dimensions(event: RollupEvent): Array<{ type: AnalyticsAggregateDimensionType; key: string }> {
    const dimensions: Array<{ type: AnalyticsAggregateDimensionType; key: string }> = [
      { type: 'overall', key: OVERALL_KEY },
    ];
    if (event.productId) dimensions.push({ type: 'product', key: event.productId });
    if (event.categoryId) dimensions.push({ type: 'category', key: event.categoryId });
    if (event.utmSource) dimensions.push({ type: 'utm_source', key: event.utmSource });
    if (event.utmMedium) dimensions.push({ type: 'utm_medium', key: event.utmMedium });
    if (event.utmCampaign) dimensions.push({ type: 'utm_campaign', key: event.utmCampaign });
    return dimensions;
  }

  private addEvent(
    aggregates: Map<string, MutableAggregate>,
    event: RollupEvent,
    dimensionType: AnalyticsAggregateDimensionType,
    dimensionKey: string,
  ): void {
    const key = JSON.stringify([event.eventName, dimensionType, dimensionKey]);
    const aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregates.set(key, {
        eventName: event.eventName,
        dimensionType,
        dimensionKey,
        eventCount: 1,
        sessions: new Set([event.sessionId]),
        valueSum: event.value ?? new Prisma.Decimal(0),
        quantitySum: event.quantity ?? 0,
        itemCountSum: event.itemCount ?? 0,
        firstOccurredAt: event.occurredAt,
        lastOccurredAt: event.occurredAt,
        sourceMaxReceivedAt: event.receivedAt,
      });
      return;
    }
    aggregate.eventCount += 1;
    aggregate.sessions.add(event.sessionId);
    aggregate.valueSum = aggregate.valueSum.plus(event.value ?? 0);
    aggregate.quantitySum += event.quantity ?? 0;
    aggregate.itemCountSum += event.itemCount ?? 0;
    if (event.occurredAt < aggregate.firstOccurredAt) aggregate.firstOccurredAt = event.occurredAt;
    if (event.occurredAt > aggregate.lastOccurredAt) aggregate.lastOccurredAt = event.occurredAt;
    if (event.receivedAt > aggregate.sourceMaxReceivedAt) aggregate.sourceMaxReceivedAt = event.receivedAt;
  }

  private async replaceChangedRows(
    tx: Prisma.TransactionClient,
    tenantId: string,
    bucketDate: Date,
    timezone: string,
    existing: AnalyticsDailyAggregate[],
    desired: MaterializedAggregate[],
  ): Promise<void> {
    const existingByKey = new Map(existing.map((row) => [this.rowKey(row), row]));
    const desiredKeys = new Set(desired.map((row) => this.rowKey(row)));
    const deleteIds = existing.filter((row) => !desiredKeys.has(this.rowKey(row))).map((row) => row.id);
    const changed = desired.filter((row) => {
      const current = existingByKey.get(this.rowKey(row));
      if (!current) return true;
      const unchanged = this.sameAggregate(current, row);
      if (!unchanged) deleteIds.push(current.id);
      return !unchanged;
    });

    if (deleteIds.length > 0) {
      await tx.analyticsDailyAggregate.deleteMany({
        where: { tenantId, bucketDate, id: { in: deleteIds } },
      });
    }
    if (changed.length === 0) return;

    const computedAt = new Date();
    await tx.analyticsDailyAggregate.createMany({
      data: changed.map((row) => {
        const logicalKey = this.rowKey(row);
        const previous = existingByKey.get(logicalKey);
        return {
          id: this.deterministicId(tenantId, bucketDate, logicalKey),
          tenantId,
          bucketDate,
          timezone,
          eventName: row.eventName,
          dimensionType: row.dimensionType,
          dimensionKey: row.dimensionKey,
          eventCount: row.eventCount,
          uniqueSessions: row.uniqueSessions,
          valueSum: row.valueSum,
          quantitySum: row.quantitySum,
          itemCountSum: row.itemCountSum,
          firstOccurredAt: row.firstOccurredAt,
          lastOccurredAt: row.lastOccurredAt,
          computedAt,
          sourceMaxReceivedAt: row.sourceMaxReceivedAt,
          createdAt: previous?.createdAt ?? computedAt,
          updatedAt: computedAt,
        };
      }),
    });
  }

  private rowKey(row: {
    eventName: string;
    dimensionType: string;
    dimensionKey: string;
  }): string {
    return JSON.stringify([row.eventName, row.dimensionType, row.dimensionKey]);
  }

  private deterministicId(tenantId: string, bucketDate: Date, logicalKey: string): string {
    return `ada_${createHash('sha256')
      .update(`${tenantId}:${bucketDate.toISOString().slice(0, 10)}:${logicalKey}`)
      .digest('hex')}`;
  }

  private sameAggregate(current: AnalyticsDailyAggregate, desired: MaterializedAggregate): boolean {
    return current.eventCount === desired.eventCount
      && current.uniqueSessions === desired.uniqueSessions
      && current.valueSum.equals(desired.valueSum)
      && current.quantitySum === desired.quantitySum
      && current.itemCountSum === desired.itemCountSum
      && current.firstOccurredAt.getTime() === desired.firstOccurredAt.getTime()
      && current.lastOccurredAt.getTime() === desired.lastOccurredAt.getTime()
      && current.sourceMaxReceivedAt.getTime() === desired.sourceMaxReceivedAt.getTime();
  }
}
