import { OrdersService } from './orders.service';

describe('OrdersService listOrders', () => {
  it('keeps the query tenant-scoped and projects the shared operational policy', async () => {
    const createdAt = new Date('2026-09-06T12:00:00.000Z');
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'order-1',
          orderNumber: '1042',
          status: 'pending',
          fulfillmentType: 'delivery',
          customerName: 'Cliente Teste',
          customerPhone: '11999990000',
          total: 52.9,
          itemsSubtotal: 48,
          paymentMethod: 'pix',
          scheduledFor: null,
          isScheduled: false,
          sourceChannel: 'marketplace_ifood',
          createdAt,
          _count: { items: 2 },
          deliveryDriver: { name: 'Ana Motoboy' },
          marketplaceOrders: [{
            provider: 'IFOOD',
            deliveryOwnership: 'MERCHANT',
            operations: [{ operation: 'CONFIRM', status: 'QUEUED' }],
          }],
        }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );

    const result = await service.listOrders(
      'tenant-1', 1, 20, undefined, undefined, undefined, undefined,
      ' Ana ', 'delivery', 'IFOOD', 'MERCHANT',
    );

    const expectedWhere = expect.objectContaining({
      tenantId: 'tenant-1',
      fulfillmentType: 'delivery',
      AND: [
        { marketplaceOrders: { some: { provider: 'IFOOD' } } },
        {
          OR: [
            { marketplaceOrders: { none: {} } },
            { marketplaceOrders: { some: { deliveryOwnership: 'MERCHANT' } } },
          ],
        },
      ],
      OR: expect.arrayContaining([
        { orderNumber: { contains: 'Ana', mode: 'insensitive' } },
        { deliveryDriver: { name: { contains: 'Ana', mode: 'insensitive' } } },
      ]),
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(prisma.order.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result.items[0]?.operational).toMatchObject({
      origin: 'IFOOD',
      deliveryOwnership: 'MERCHANT',
      syncState: 'PENDING',
      financialSummary: { operationalValue: 52.9 },
    });
  });
});
