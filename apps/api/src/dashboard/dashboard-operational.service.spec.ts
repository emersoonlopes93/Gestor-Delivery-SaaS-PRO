import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { DashboardOperationalService } from './dashboard-operational.service';

describe('DashboardOperationalService', () => {
  const createPrisma = () => ({
    tenantClient: {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
      },
      order: {
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
    },
  });

  it('uses tenant-scoped, completed-order-only commercial queries and preserves operational status counts', async () => {
    const prisma = createPrisma();
    prisma.tenantClient.order.groupBy.mockResolvedValue([
      { status: OrderStatus.pending, _count: { _all: 2 } },
      { status: OrderStatus.completed, _count: { _all: 3 } },
      { status: OrderStatus.cancelled, _count: { _all: 1 } },
    ]);
    prisma.tenantClient.order.aggregate.mockResolvedValue({ _count: { _all: 3 }, _sum: { total: '75.50' } });
    const service = new DashboardOperationalService(prisma as never);

    await expect(service.getSnapshot('tenant-a', { from: '2026-10-01', to: '2026-10-02' })).resolves.toEqual({
      period: { from: '2026-10-01', to: '2026-10-02', timezone: 'America/Sao_Paulo' },
      orders: {
        total: 6,
        byStatus: {
          pending: 2,
          confirmed: 0,
          preparing: 0,
          ready_for_pickup: 0,
          ready_for_delivery: 0,
          out_for_delivery: 0,
          completed: 3,
          cancelled: 1,
          draft: 0,
        },
        cancelled: 1,
        cancellationRate: 1 / 6,
      },
      completedSales: { orderCount: 3, grossOrderTotal: 75.5, averageTicket: 75.5 / 3 },
    });

    expect(prisma.tenantClient.order.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a' }),
    }));
    expect(prisma.tenantClient.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', status: OrderStatus.completed }),
    }));
  });

  it('keeps tenant queries separate and returns zero, not an invented commercial value, for an empty period', async () => {
    const prisma = createPrisma();
    prisma.tenantClient.order.groupBy.mockResolvedValue([]);
    prisma.tenantClient.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null } });
    const service = new DashboardOperationalService(prisma as never);

    const result = await service.getSnapshot('tenant-b', { from: '2026-10-03', to: '2026-10-03' });

    expect(result.orders.total).toBe(0);
    expect(result.orders.cancellationRate).toBe(0);
    expect(result.completedSales).toEqual({ orderCount: 0, grossOrderTotal: 0, averageTicket: 0 });
    expect(prisma.tenantClient.order.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-b' }),
    }));
  });

  it.each([
    [{ from: '2026-10-01' }],
    [{ to: '2026-10-01' }],
    [{ from: '2026-10-02', to: '2026-10-01' }],
    [{ from: '2026-10-01', to: '2026-11-01' }],
    [{ from: '2026-10-1', to: '2026-10-02' }],
  ])('rejects an invalid or overly broad operational period: %o', async (query) => {
    const service = new DashboardOperationalService(createPrisma() as never);

    await expect(service.getSnapshot('tenant-a', query)).rejects.toBeInstanceOf(BadRequestException);
  });
});
