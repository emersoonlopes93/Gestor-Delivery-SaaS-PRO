import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService MAIN printing producer', () => {
  it('creates the MAIN receipt through PrintingService after confirmed POS side effects', async () => {
    const order = {
      id: 'order-a',
      tenantId: 'tenant-a',
      status: OrderStatus.confirmed,
      orderNumber: 42,
      publicTrackingToken: null,
      customerPhone: null,
    };
    const orderDetail = { ...order, items: [] };
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue(order) },
      printJob: { count: jest.fn() },
      tenant: { findUnique: jest.fn() },
    };
    const kdsService = { createProductionJobs: jest.fn().mockResolvedValue([{ id: 'kds-job' }]) };
    const printingService = { createMainReceiptJobForOrder: jest.fn().mockResolvedValue({ id: 'main-job' }) };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { notifyOrderStatus: jest.fn() } as never,
      { emitOrderStatusUpdated: jest.fn() } as never,
      kdsService as never,
      printingService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue(orderDetail as never);

    await service.runConfirmedOrderSideEffects('order-a', 'tenant-a');

    expect(kdsService.createProductionJobs).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(printingService.createMainReceiptJobForOrder).toHaveBeenCalledWith('tenant-a', 'order-a', orderDetail);
  });
});
