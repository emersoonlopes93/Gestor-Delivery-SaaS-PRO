import { OrdersService } from './orders.service';

describe('OrdersService operation board', () => {
  it('queries only active statuses, excluding completed and cancelled 99Food orders', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );

    await expect(service.getBoardOrders('tenant-1')).resolves.toEqual([]);

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        status: {
          in: expect.not.arrayContaining(['completed', 'cancelled']),
        },
      }),
    }));
  });
});
