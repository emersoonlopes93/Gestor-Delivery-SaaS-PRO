import { Injectable, Logger } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  RevenueEvent,
  RevenueEventStatus,
  RevenueEventType,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { billingSourceChannelsFor, canonicalSourceChannel } from '../common/source-channel.util';

const ZERO = new Prisma.Decimal(0);
const DEFAULT_LEDGER_EVENT_TYPES: RevenueEventType[] = [
  RevenueEventType.order_completed,
  RevenueEventType.manual_adjustment,
  RevenueEventType.correction,
  RevenueEventType.order_refunded,
  RevenueEventType.order_cancelled,
];

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export type RevenueLedgerPreview = {
  source: 'ledger';
  ruleVersionId: string;
  ruleVersion: number;
  includedEventTypes: RevenueEventType[];
  eventsCount: number;
  totalOrders: number;
  totalRevenue: Prisma.Decimal;
  totalAdjustments: Prisma.Decimal;
  checksum: string;
};

@Injectable()
export class RevenueLedgerService {
  private readonly logger = new Logger(RevenueLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordOrderStatusEvent(input: {
    tenantId: string;
    orderId: string;
    orderStatus: OrderStatus;
    orderTotal: Prisma.Decimal | number | string;
    sourceChannel?: string | null;
    occurredAt?: Date;
    actorType?: string;
    actorId?: string | null;
    reason?: string | null;
    tx?: Prisma.TransactionClient;
  }): Promise<RevenueEvent[]> {
    const eventType = this.mapOrderStatusToEventType(input.orderStatus);
    if (!eventType) return [];

    const client = input.tx ?? this.prisma;
    const occurredAt = input.occurredAt ?? new Date();
    const actorType = input.actorType ?? 'system';
    const amount = new Prisma.Decimal(input.orderTotal);

    if (eventType === RevenueEventType.order_cancelled) {
      const positiveEvents = await client.revenueEvent.findMany({
        where: {
          tenantId: input.tenantId,
          orderId: input.orderId,
          status: RevenueEventStatus.posted,
          type: { in: [RevenueEventType.order_confirmed, RevenueEventType.order_completed] },
          amount: { gt: ZERO },
        },
        select: { amount: true },
      });
      const compensation = positiveEvents.reduce(
        (sum, event) => sum.plus(event.amount),
        ZERO,
      );

      return [
        await this.createEvent({
          tenantId: input.tenantId,
          orderId: input.orderId,
          idempotencyKey: `order:${input.orderId}:status:${input.orderStatus}:compensation`,
          source: String(canonicalSourceChannel(input.sourceChannel ?? 'orders')),
          type: eventType,
          amount: compensation.gt(ZERO) ? compensation.negated() : ZERO,
          occurredAt,
          actorType,
          actorId: input.actorId ?? null,
          reason: input.reason ?? 'order_cancelled',
          metadata: {
            orderStatus: input.orderStatus,
            compensatedPositiveEvents: positiveEvents.length,
          },
          tx: client,
        }),
      ];
    }

    return [
      await this.createEvent({
        tenantId: input.tenantId,
        orderId: input.orderId,
        idempotencyKey: `order:${input.orderId}:status:${input.orderStatus}`,
        source: String(canonicalSourceChannel(input.sourceChannel ?? 'orders')),
        type: eventType,
        amount,
        occurredAt,
        actorType,
        actorId: input.actorId ?? null,
        reason: input.reason ?? `order_${input.orderStatus}`,
        metadata: {
          orderStatus: input.orderStatus,
        },
        tx: client,
      }),
    ];
  }

  async createManualAdjustment(input: {
    tenantId: string;
    amount: Prisma.Decimal | number | string;
    occurredAt?: Date;
    reason: string;
    actorType: string;
    actorId?: string | null;
    idempotencyKey: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<RevenueEvent> {
    return this.createEvent({
      tenantId: input.tenantId,
      orderId: null,
      idempotencyKey: input.idempotencyKey,
      source: 'admin',
      type: RevenueEventType.manual_adjustment,
      amount: new Prisma.Decimal(input.amount),
      occurredAt: input.occurredAt ?? new Date(),
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      reason: input.reason,
      metadata: input.metadata,
    });
  }

  async getLedgerPreview(input: {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date;
    includedChannels?: string[];
    ruleVersionId?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<RevenueLedgerPreview> {
    const client = input.tx ?? this.prisma;
    const rule = input.ruleVersionId
      ? await client.billingRuleVersion.findUnique({ where: { id: input.ruleVersionId } })
      : await this.ensureActiveRuleVersion(client);

    if (!rule) {
      throw new Error('Nenhuma regra de billing ledger ativa encontrada.');
    }

    const includedEventTypes = this.parseRevenueEventTypes(rule.revenueEventTypes);
    const where: Prisma.RevenueEventWhereInput = {
      tenantId: input.tenantId,
      status: RevenueEventStatus.posted,
      type: { in: includedEventTypes },
      ...(input.includedChannels?.length ? { source: { in: input.includedChannels } } : {}),
      occurredAt: {
        gte: input.periodStart,
        lt: input.periodEnd,
      },
    };

    const [aggregate, events] = await Promise.all([
      client.revenueEvent.aggregate({
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      client.revenueEvent.findMany({
        where,
        select: { id: true, orderId: true, type: true, amount: true, occurredAt: true },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const totalRevenue = aggregate._sum.amount ?? ZERO;
    const totalOrders = new Set(
      events
        .filter((event) => event.orderId && event.amount.gt(ZERO))
        .map((event) => event.orderId),
    ).size;
    const totalAdjustments = events
      .filter((event) => !event.orderId || event.amount.lt(ZERO))
      .reduce((sum, event) => sum.plus(event.amount), ZERO);

    return {
      source: 'ledger',
      ruleVersionId: rule.id,
      ruleVersion: rule.version,
      includedEventTypes,
      eventsCount: aggregate._count._all,
      totalOrders,
      totalRevenue,
      totalAdjustments,
      checksum: this.buildChecksum({
        tenantId: input.tenantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        includedChannels: input.includedChannels ?? [],
        ruleVersionId: rule.id,
        events,
      }),
    };
  }

  async listEvents(input: {
    tenantId: string;
    periodStart?: Date;
    periodEnd?: Date;
    take?: number;
  }): Promise<RevenueEvent[]> {
    return this.prisma.revenueEvent.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.periodStart || input.periodEnd
          ? {
              occurredAt: {
                ...(input.periodStart ? { gte: input.periodStart } : {}),
                ...(input.periodEnd ? { lt: input.periodEnd } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(input.take ?? 100, 500),
    });
  }

  async ensureActiveRuleVersion(client: PrismaClientLike = this.prisma) {
    const now = new Date();
    const active = await client.billingRuleVersion.findFirst({
      where: {
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ version: 'desc' }],
    });
    if (active) return active;

    this.logger.warn('Nenhuma BillingRuleVersion ativa encontrada; criando regra padrao.');
    const latest = await client.billingRuleVersion.findFirst({
      orderBy: [{ version: 'desc' }],
      select: { version: true },
    });
    return client.billingRuleVersion.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        name: 'Default revenue ledger rule',
        description: 'Conta eventos completed e ajustes para billing por faturamento.',
        includedOrderStatuses: [OrderStatus.completed],
        includedChannels: [
          ...billingSourceChannelsFor('direct_online'),
          'pos',
          'whatsapp_ai',
          'manual',
        ],
        revenueEventTypes: DEFAULT_LEDGER_EVENT_TYPES,
        tierConfig: {},
        effectiveFrom: new Date(Date.UTC(2026, 5, 10, 0, 0, 0, 0)),
      },
    });
  }

  private async createEvent(input: {
    tenantId: string;
    orderId?: string | null;
    idempotencyKey: string;
    source: string;
    type: RevenueEventType;
    amount: Prisma.Decimal;
    occurredAt: Date;
    actorType: string;
    actorId?: string | null;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
    tx?: PrismaClientLike;
  }): Promise<RevenueEvent> {
    const client = input.tx ?? this.prisma;
    const period = this.resolveBillingPeriod(input.occurredAt);
    const findExistingEvent = () =>
      this.prisma.revenueEvent.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

    try {
      return await client.revenueEvent.create({
        data: {
          tenantId: input.tenantId,
          orderId: input.orderId ?? null,
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          type: input.type,
          amount: input.amount,
          occurredAt: input.occurredAt,
          billingPeriodYear: period.year,
          billingPeriodMonth: period.month,
          reason: input.reason ?? null,
          metadata: input.metadata ?? Prisma.JsonNull,
          createdByType: input.actorType,
          createdById: input.actorId ?? null,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await findExistingEvent();
        if (existing) return existing;
      }
      throw error;
    }
  }

  private mapOrderStatusToEventType(status: OrderStatus): RevenueEventType | null {
    if (status === OrderStatus.confirmed) return RevenueEventType.order_confirmed;
    if (status === OrderStatus.completed) return RevenueEventType.order_completed;
    if (status === OrderStatus.cancelled) return RevenueEventType.order_cancelled;
    return null;
  }

  private resolveBillingPeriod(date: Date): { year: number; month: number } {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
    };
  }

  private parseRevenueEventTypes(value: Prisma.JsonValue): RevenueEventType[] {
    if (!Array.isArray(value)) return DEFAULT_LEDGER_EVENT_TYPES;
    const allowed = new Set(Object.values(RevenueEventType));
    const parsed = value.filter((item): item is RevenueEventType => typeof item === 'string' && allowed.has(item as RevenueEventType));
    return parsed.length ? parsed : DEFAULT_LEDGER_EVENT_TYPES;
  }

  private buildChecksum(input: {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date;
    includedChannels: string[];
    ruleVersionId: string;
    events: Array<{ id: string; type: RevenueEventType; amount: Prisma.Decimal; occurredAt: Date }>;
  }): string {
    const payload = {
      tenantId: input.tenantId,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      includedChannels: input.includedChannels,
      ruleVersionId: input.ruleVersionId,
      events: input.events.map((event) => ({
        id: event.id,
        type: event.type,
        amount: event.amount.toFixed(2),
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
