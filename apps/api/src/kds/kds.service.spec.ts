import { NotFoundException } from '@nestjs/common';
import { OrderStatus, PrintType } from '@prisma/client';
import { KdsService } from './kds.service';

describe('KdsService getPrintJob', () => {
  const makeDb = () => ({
    order: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    productCategory: {
      findMany: jest.fn(),
    },
    printJob: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    printerDevice: {
      findFirst: jest.fn(),
    },
    printStation: {
      findMany: jest.fn(),
    },
  });

  const makeService = (db: ReturnType<typeof makeDb>, tenantId = 'tenant-a') =>
    new KdsService(
      db as never,
      { getTenantId: () => tenantId } as never,
      {} as never,
      { updateOrderStatus: jest.fn() } as never,
    );

  it('returns a job only from the active tenant', async () => {
    const db = makeDb();
    const printJob = { id: 'job-1', tenantId: 'tenant-a', order: { items: [], customer: null } };
    db.printJob.findFirst.mockResolvedValue(printJob);

    await expect(makeService(db).getPrintJob('job-1')).resolves.toBe(printJob);
    expect(db.printJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', tenantId: 'tenant-a' },
      include: { order: { include: { items: true, customer: true } } },
    });
  });

  it('does not disclose a job that is not visible to the active tenant', async () => {
    const db = makeDb();
    db.printJob.findFirst.mockResolvedValue(null);

    await expect(makeService(db).getPrintJob('job-from-other-tenant')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a print job only after validating the order tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue({ id: 'order-1' });
    db.printJob.create.mockResolvedValue({ id: 'job-1' });

    await makeService(db).createPrintJob({ orderId: 'order-1', station: 'GERAL', content: 'ticket' });

    expect(db.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(db.printJob.create).toHaveBeenCalled();
  });

  it('does not create a print job for an order from another tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      makeService(db).createPrintJob({ orderId: 'foreign-order', station: 'GERAL', content: 'ticket' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.create).not.toHaveBeenCalled();
  });

  it('does not create an incremental job for an order from another tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      makeService(db).createIncrementalPrintJob({ orderId: 'foreign-order', station: 'GERAL', content: 'ticket' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.upsert).not.toHaveBeenCalled();
  });

  it('does not create batch jobs for an order from another tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      makeService(db).createIncrementalPrintJobsForOrder({
        orderId: 'foreign-order',
        station: 'GERAL',
        items: [{ content: 'ticket' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.upsert).not.toHaveBeenCalled();
  });

  it('cleans up old jobs only from the requested tenant', async () => {
    const db = makeDb();
    db.printJob.deleteMany.mockResolvedValue({ count: 1 });

    await makeService(db).cleanupOldJobs('tenant-a', 7);

    expect(db.printJob.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        createdAt: { lt: expect.any(Date) },
        status: { in: expect.any(Array) },
      },
    });
  });

  it('uses the kitchen type filter without excluding a legitimate MAIN kitchen station', async () => {
    const db = makeDb();
    db.productCategory.findMany.mockResolvedValue([]);
    db.printJob.groupBy.mockResolvedValue([{ station: 'MAIN' }]);
    db.printJob.findMany.mockResolvedValue([]);
    db.printJob.count.mockResolvedValue(0);
    db.printStation.findMany.mockResolvedValue([]);
    const service = makeService(db);

    await expect(service.getAvailableStations()).resolves.toEqual(['GERAL', 'MAIN']);
    await service.getPendingPrintJobs('MAIN');
    await service.getAllPrintJobs('MAIN');

    expect(db.printJob.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: PrintType.kitchen }),
    }));
    expect(db.printJob.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ station: 'MAIN', type: PrintType.kitchen }),
    }));
    expect(db.printJob.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ station: 'MAIN', type: PrintType.kitchen }),
    }));
  });

  it('does not create production jobs for a confirmed order', async () => {
    const db = makeDb();
    db.printJob.count.mockResolvedValue(0);
    db.order.findUnique.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-a',
      status: OrderStatus.confirmed,
      items: [],
    });

    await expect(makeService(db).createProductionJobs('order-1')).resolves.toEqual([]);

    expect(db.printJob.upsert).not.toHaveBeenCalled();
    expect(db.printerDevice.findFirst).not.toHaveBeenCalled();
  });

  it('creates kitchen production jobs once when an order is preparing, even after a retry', async () => {
    const db = makeDb();
    db.printJob.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    db.printStation.findMany.mockResolvedValue([]);
    db.order.findUnique.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-a',
      status: OrderStatus.preparing,
      orderNumber: '#0001',
      fulfillmentType: 'pickup',
      customerName: 'Cliente',
      customerPhone: '11999999999',
      customerEmail: null,
      tableNumber: null,
      notes: null,
      total: 10,
      itemsSubtotal: 10,
      discountTotal: 0,
      deliveryFee: 0,
      serviceFee: 0,
      sourceChannel: 'pos',
      paymentMethod: 'cash',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [{
        id: 'item-1',
        lineType: 'product',
        productId: 'product-1',
        comboId: null,
        quantity: 1,
        unitPrice: 10,
        lineTotal: 10,
        notes: null,
        snapshotName: 'Produto',
        snapshotImage: null,
        snapshotBasePrice: 10,
        snapshotExtrasTotal: 0,
        snapshotComposition: null,
        snapshotCatalogV2Json: null,
        product: { category: null },
      }],
    });
    db.printerDevice.findFirst.mockResolvedValue(null);
    db.printJob.upsert.mockResolvedValue({ id: 'kitchen-job' });
    const service = new KdsService(
      db as never,
      { getTenantId: () => 'tenant-a' } as never,
      { formatTicket: jest.fn().mockResolvedValue('ticket') } as never,
      { updateOrderStatus: jest.fn() } as never,
    );

    await expect(service.createProductionJobs('order-1')).resolves.toHaveLength(1);
    await expect(service.createProductionJobs('order-1')).resolves.toEqual([]);

    expect(db.printJob.upsert).toHaveBeenCalledTimes(1);
    expect(db.printJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'auto_print_order-1_kitchen_GERAL' },
      create: expect.objectContaining({ type: PrintType.kitchen }),
    }));
  });

  it('skips an inactive KDS station and marks an order ready when it has no active station tickets', async () => {
    const db = makeDb();
    db.printJob.count.mockResolvedValue(0);
    db.printStation.findMany.mockResolvedValue([{ name: 'Bebidas', slug: 'bebidas' }]);
    db.order.findUnique.mockResolvedValue({
      id: 'order-1', tenantId: 'tenant-a', status: OrderStatus.preparing, fulfillmentType: 'delivery', items: [{
        id: 'item-1', lineType: 'product', snapshotName: 'Suco',
        product: { category: { name: 'Bebidas', templateConfig: { station: 'Bebidas' } } },
      }],
    });

    const ordersService = { updateOrderStatus: jest.fn().mockResolvedValue({ status: 'ready_for_delivery' }) };
    const service = new KdsService(
      db as never,
      { getTenantId: () => 'tenant-a' } as never,
      { formatTicket: jest.fn() } as never,
      ordersService as never,
    );

    await expect(service.createProductionJobs('order-1')).resolves.toEqual([]);
    expect(db.printJob.upsert).not.toHaveBeenCalled();
    expect(ordersService.updateOrderStatus).toHaveBeenCalledWith('order-1', 'tenant-a', { status: 'ready_for_delivery' });
  });

  it('moves an order to ready only after the final kitchen station is completed', async () => {
    const db = makeDb();
    const ordersService = { updateOrderStatus: jest.fn().mockResolvedValue({ status: 'ready_for_delivery' }) };
    db.printJob.findFirst.mockResolvedValue({
      id: 'job-bebidas', tenantId: 'tenant-a', orderId: 'order-1', status: 'pending',
      order: { id: 'order-1', status: 'preparing', fulfillmentType: 'delivery' },
    });
    db.printJob.update.mockResolvedValue({ id: 'job-bebidas', orderId: 'order-1', status: 'completed' });
    db.printJob.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const service = new KdsService(db as never, { getTenantId: () => 'tenant-a' } as never, {} as never, ordersService as never);

    await service.markAsCompleted('job-bebidas');
    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();

    await service.markAsCompleted('job-bebidas');
    expect(ordersService.updateOrderStatus).toHaveBeenCalledWith('order-1', 'tenant-a', { status: 'ready_for_delivery' });
  });

  it('persists KDS-ready locally while the marketplace ready action is deferred', async () => {
    const db = makeDb();
    const ordersService = { updateOrderStatus: jest.fn().mockResolvedValue({ status: 'ready_for_delivery' }) };
    const marketplaceSync = { handleInternalStatusChanged: jest.fn().mockResolvedValue({ deferred: true, operationId: 'operation-1' }) };
    db.printJob.findFirst.mockResolvedValue({
      id: 'job-final', tenantId: 'tenant-a', orderId: 'order-1', status: 'pending',
      order: { id: 'order-1', status: 'preparing', fulfillmentType: 'delivery' },
    });
    db.printJob.update.mockResolvedValue({ id: 'job-final', orderId: 'order-1', status: 'completed' });
    db.printJob.count.mockResolvedValue(0);
    const service = new KdsService(
      db as never,
      { getTenantId: () => 'tenant-a' } as never,
      {} as never,
      ordersService as never,
      marketplaceSync as never,
    );

    await service.markAsCompleted('job-final');

    expect(marketplaceSync.handleInternalStatusChanged).toHaveBeenCalledWith({
      tenantId: 'tenant-a', orderId: 'order-1', status: 'ready_for_delivery',
    });
    expect(ordersService.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      'tenant-a',
      { status: 'ready_for_delivery' },
      undefined,
      { marketplaceEvent: true },
    );
  });
});
