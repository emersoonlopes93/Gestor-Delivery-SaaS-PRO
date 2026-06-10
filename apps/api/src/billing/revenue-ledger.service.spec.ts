import { OrderStatus, Prisma, RevenueEventStatus, RevenueEventType } from '@prisma/client';
import { RevenueLedgerService } from './revenue-ledger.service';

describe('RevenueLedgerService', () => {
  const makePrisma = () => ({
    revenueEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    billingRuleVersion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  });

  it('records an idempotent completed order revenue event', async () => {
    const prisma = makePrisma();
    const existing = {
      id: 'event-1',
      tenantId: 'tenant-1',
      idempotencyKey: 'order:order-1:status:completed',
      type: RevenueEventType.order_completed,
      amount: new Prisma.Decimal(42),
    };
    prisma.revenueEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.revenueEvent.findUnique.mockResolvedValue(existing);

    const service = new RevenueLedgerService(prisma as never);
    const events = await service.recordOrderStatusEvent({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      orderStatus: OrderStatus.completed,
      orderTotal: new Prisma.Decimal(42),
      sourceChannel: 'storefront',
      occurredAt: new Date('2026-06-10T12:00:00.000Z'),
      actorType: 'tenant_user',
      actorId: 'user-1',
    });

    expect(events).toEqual([existing]);
    expect(prisma.revenueEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        orderId: 'order-1',
        idempotencyKey: 'order:order-1:status:completed',
        type: RevenueEventType.order_completed,
        amount: new Prisma.Decimal(42),
        billingPeriodYear: 2026,
        billingPeriodMonth: 6,
      }),
    }));
  });

  it('builds a ledger preview with revenue, order count and checksum', async () => {
    const prisma = makePrisma();
    const events = [
      {
        id: 'event-1',
        orderId: 'order-1',
        type: RevenueEventType.order_completed,
        amount: new Prisma.Decimal(100),
        occurredAt: new Date('2026-06-10T10:00:00.000Z'),
      },
      {
        id: 'event-2',
        orderId: null,
        type: RevenueEventType.manual_adjustment,
        amount: new Prisma.Decimal(-10),
        occurredAt: new Date('2026-06-10T11:00:00.000Z'),
      },
    ];
    prisma.billingRuleVersion.findFirst.mockResolvedValue({
      id: 'rule-1',
      version: 1,
      revenueEventTypes: [RevenueEventType.order_completed, RevenueEventType.manual_adjustment],
    });
    prisma.revenueEvent.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { amount: new Prisma.Decimal(90) },
    });
    prisma.revenueEvent.findMany.mockResolvedValue(events);

    const service = new RevenueLedgerService(prisma as never);
    const preview = await service.getLedgerPreview({
      tenantId: 'tenant-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(preview).toEqual(expect.objectContaining({
      source: 'ledger',
      ruleVersionId: 'rule-1',
      ruleVersion: 1,
      eventsCount: 2,
      totalOrders: 1,
      totalRevenue: new Prisma.Decimal(90),
      totalAdjustments: new Prisma.Decimal(-10),
    }));
    expect(preview.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.revenueEvent.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        status: RevenueEventStatus.posted,
        type: { in: [RevenueEventType.order_completed, RevenueEventType.manual_adjustment] },
      }),
    }));
  });

  it('creates a negative compensation when an order is cancelled after positive events', async () => {
    const prisma = makePrisma();
    prisma.revenueEvent.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(100) },
      { amount: new Prisma.Decimal(25) },
    ]);
    prisma.revenueEvent.create.mockImplementation(({ data }) => Promise.resolve({
      id: 'event-cancel',
      ...data,
    }));

    const service = new RevenueLedgerService(prisma as never);
    const events = await service.recordOrderStatusEvent({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      orderStatus: OrderStatus.cancelled,
      orderTotal: new Prisma.Decimal(125),
      sourceChannel: 'storefront',
      occurredAt: new Date('2026-06-10T12:00:00.000Z'),
    });

    expect(events[0]).toEqual(expect.objectContaining({
      type: RevenueEventType.order_cancelled,
      amount: new Prisma.Decimal(-125),
      idempotencyKey: 'order:order-1:status:cancelled:compensation',
    }));
  });

  it('ignores non-financial order status changes', async () => {
    const prisma = makePrisma();
    const service = new RevenueLedgerService(prisma as never);

    const events = await service.recordOrderStatusEvent({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      orderStatus: OrderStatus.preparing,
      orderTotal: new Prisma.Decimal(100),
    });

    expect(events).toEqual([]);
    expect(prisma.revenueEvent.create).not.toHaveBeenCalled();
  });
});
