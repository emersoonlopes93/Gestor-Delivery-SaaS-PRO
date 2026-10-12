import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { OrderStatus } from '@prisma/client';
import type { DashboardOperationalDTO } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const MAX_PERIOD_DAYS = 31;

export type DashboardOperationalQuery = {
  from?: string;
  to?: string;
};

const ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.confirmed,
  OrderStatus.preparing,
  OrderStatus.ready_for_pickup,
  OrderStatus.ready_for_delivery,
  OrderStatus.out_for_delivery,
  OrderStatus.completed,
  OrderStatus.cancelled,
  OrderStatus.draft,
];

@Injectable()
export class DashboardOperationalService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(tenantId: string, query: DashboardOperationalQuery): Promise<DashboardOperationalDTO> {
    const timezone = await this.resolveTimezone(tenantId);
    const period = this.resolvePeriod(query, timezone);
    const where = { tenantId, createdAt: { gte: period.start, lt: period.endExclusive } };

    const [groupedStatuses, completed] = await Promise.all([
      this.prisma.tenantClient.order.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.tenantClient.order.aggregate({
        where: { ...where, status: OrderStatus.completed },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    const byStatus = this.emptyStatusCounts();
    for (const row of groupedStatuses) {
      byStatus[row.status] = row._count._all;
    }

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
    const cancelled = byStatus.cancelled;
    const grossOrderTotal = Number(completed._sum.total ?? 0);
    const completedOrderCount = completed._count._all;

    return {
      period: { from: period.from, to: period.to, timezone },
      orders: {
        total,
        byStatus,
        cancelled,
        cancellationRate: total === 0 ? 0 : cancelled / total,
      },
      completedSales: {
        orderCount: completedOrderCount,
        grossOrderTotal,
        averageTicket: completedOrderCount === 0 ? 0 : grossOrderTotal / completedOrderCount,
      },
    };
  }

  private async resolveTimezone(tenantId: string): Promise<string> {
    const settings = await this.prisma.tenantClient.tenantSettings.findUnique({
      where: { tenantId },
      select: { timezone: true },
    });
    const candidate = settings?.timezone?.trim();
    return candidate && DateTime.now().setZone(candidate).isValid ? candidate : DEFAULT_TIMEZONE;
  }

  private resolvePeriod(query: DashboardOperationalQuery, timezone: string) {
    if ((query.from && !query.to) || (!query.from && query.to)) {
      throw new BadRequestException('from and to must be provided together');
    }

    const today = DateTime.now().setZone(timezone).startOf('day');
    const from = query.from ? this.parseDate(query.from, timezone) : today;
    const to = query.to ? this.parseDate(query.to, timezone) : today;
    const days = Math.floor(to.diff(from, 'days').days) + 1;

    if (days < 1 || days > MAX_PERIOD_DAYS) {
      throw new BadRequestException(`period must be between 1 and ${MAX_PERIOD_DAYS} days`);
    }

    return {
      from: from.toISODate() as string,
      to: to.toISODate() as string,
      start: from.toUTC().toJSDate(),
      endExclusive: to.plus({ days: 1 }).toUTC().toJSDate(),
    };
  }

  private parseDate(value: string, timezone: string): DateTime {
    const parsed = DateTime.fromISO(value, { zone: timezone }).startOf('day');
    if (!parsed.isValid || parsed.toISODate() !== value) {
      throw new BadRequestException('dates must use YYYY-MM-DD');
    }
    return parsed;
  }

  private emptyStatusCounts(): Record<OrderStatus, number> {
    return Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
  }
}
