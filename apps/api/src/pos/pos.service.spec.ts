import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentMethod, PosFulfillmentType } from '@gestor/types';
import { PosService } from './pos.service';

describe('PosService atomic sale', () => {
  const makeHarness = (stockError?: Error, table: { id: string; tenantId: string; name: string } | null = null) => {
    let committed = false;
    const tx = {
      tenant: { update: jest.fn().mockResolvedValue({ orderSequence: 1 }) },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: '#0001', total: 20 }),
        update: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: '#0001', total: 20 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: { create: jest.fn() },
      orderDeliveryAddress: { upsert: jest.fn(), deleteMany: jest.fn() },
      dineInTable: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      coupon: { update: jest.fn() },
      orderTimeline: { create: jest.fn() },
    };
    const prisma = {
      cashSession: { findFirst: jest.fn().mockResolvedValue({ id: 'cash-1' }) },
      order: { findFirst: jest.fn().mockResolvedValue(null) },
      dineInTable: { findFirst: jest.fn().mockResolvedValue(table) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    };
    const checkoutValidator = {
      validateByTenantId: jest.fn().mockResolvedValue({
        lines: [{
          lineType: 'product', productId: 'product-1', quantity: 1, unitPrice: 20,
          lineTotal: 20, name: 'Produto', basePrice: 20, extrasTotal: 0,
        }],
        itemsSubtotal: 20,
        discountTotal: 0,
        couponId: 'coupon-1',
        cashbackUsed: 5,
      }),
    };
    const cashService = { registerSaleMovement: jest.fn() };
    const customerService = { syncCustomerOnOrderUpsert: jest.fn().mockResolvedValue({ id: 'customer-1' }) };
    const cashbackService = { createTransaction: jest.fn() };
    const stockService = {
      processOrderDepletionInTransaction: stockError
        ? jest.fn().mockRejectedValue(stockError)
        : jest.fn().mockResolvedValue(undefined),
    };
    const kdsService = { createProductionJobs: jest.fn() };
    const ordersService = {
      confirmPosOrderInTransaction: jest.fn().mockResolvedValue({ id: 'order-1', status: 'confirmed' }),
      runConfirmedOrderSideEffects: jest.fn(),
    };
    const service = new PosService(
      prisma as never,
      checkoutValidator as never,
      cashService as never,
      customerService as never,
      cashbackService as never,
      stockService as never,
      kdsService as never,
      ordersService as never,
      { calculateDeliveryFee: jest.fn() } as never,
    );
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: 'order-1', status: 'confirmed' } as never);

    return {
      service, prisma, tx, cashService, cashbackService, stockService, kdsService, ordersService,
      wasCommitted: () => committed,
    };
  };

  const sale = {
    idempotencyKey: 'sale-1',
    items: [{ lineType: 'product' as const, productId: 'product-1', quantity: 1 }],
    customerName: 'Cliente',
    customerPhone: '11999999999',
    fulfillmentType: PosFulfillmentType.PICKUP,
    paymentMethod: PaymentMethod.cash,
    useCashbackAmount: 5,
    couponCode: 'PROMO',
  };

  it('rolls back order, cash, cashback and coupon when stock is insufficient', async () => {
    const harness = makeHarness(new BadRequestException('Estoque insuficiente'));

    await expect(harness.service.createSale('tenant-a', 'operator-1', sale, true))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(harness.wasCommitted()).toBe(false);
    expect(harness.cashService.registerSaleMovement).toHaveBeenCalledWith(
      'tenant-a', 'cash-1', 'order-1', 20, PaymentMethod.cash, harness.tx,
    );
    expect(harness.cashbackService.createTransaction).toHaveBeenCalledWith(expect.any(Object), harness.tx);
    expect(harness.tx.coupon.update).toHaveBeenCalled();
    expect(harness.ordersService.confirmPosOrderInTransaction).not.toHaveBeenCalled();
    expect(harness.ordersService.runConfirmedOrderSideEffects).not.toHaveBeenCalled();
  });

  it('commits order, financial effects, stock and confirmation together on success', async () => {
    const harness = makeHarness();

    await harness.service.createSale('tenant-a', 'operator-1', sale, true);

    expect(harness.wasCommitted()).toBe(true);
    expect(harness.stockService.processOrderDepletionInTransaction).toHaveBeenCalledWith(
      harness.tx, 'tenant-a', 'order-1',
    );
    expect(harness.ordersService.confirmPosOrderInTransaction).toHaveBeenCalledWith(
      harness.tx, 'order-1', 'tenant-a', 'operator-1',
    );
    expect(harness.ordersService.runConfirmedOrderSideEffects).toHaveBeenCalledWith('order-1', 'tenant-a');
    expect(harness.kdsService.createProductionJobs).not.toHaveBeenCalled();
  });

  it('does not create kitchen production jobs while saving a POS draft', async () => {
    const harness = makeHarness();

    await harness.service.upsertDraftSale('tenant-a', 'operator-1', sale);

    expect(harness.kdsService.createProductionJobs).not.toHaveBeenCalled();
  });

  it('dual-writes the validated table id and its visual snapshot', async () => {
    const harness = makeHarness(undefined, { id: 'table-1', tenantId: 'tenant-a', name: 'Mesa 01' });

    await harness.service.createSale('tenant-a', 'operator-1', {
      ...sale,
      fulfillmentType: PosFulfillmentType.TABLE,
      tableId: 'table-1',
    }, true);

    expect(harness.prisma.dineInTable.findFirst).toHaveBeenCalledWith({
      where: { id: 'table-1', tenantId: 'tenant-a' },
    });
    expect(harness.tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tableId: 'table-1', tableNumber: 'Mesa 01' }),
    }));
  });

  it('rejects a missing or cross-tenant table id', async () => {
    const harness = makeHarness();

    await expect(harness.service.createSale('tenant-a', 'operator-1', {
      ...sale,
      fulfillmentType: PosFulfillmentType.TABLE,
      tableId: 'table-from-another-tenant',
    }, true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects conflicting tableId and tableNumber values', async () => {
    const harness = makeHarness(undefined, { id: 'table-1', tenantId: 'tenant-a', name: 'Mesa 01' });

    await expect(harness.service.createSale('tenant-a', 'operator-1', {
      ...sale,
      fulfillmentType: PosFulfillmentType.TABLE,
      tableId: 'table-1',
      tableNumber: 'Mesa 02',
    }, true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects finalization when the validated table becomes occupied', async () => {
    const harness = makeHarness(undefined, { id: 'table-1', tenantId: 'tenant-a', name: 'Mesa 01' });
    harness.tx.dineInTable.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(harness.service.createSale('tenant-a', 'operator-1', {
      ...sale,
      fulfillmentType: PosFulfillmentType.TABLE,
      tableId: 'table-1',
    }, true)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not transfer onto a table claimed concurrently', async () => {
    const harness = makeHarness();
    harness.prisma.dineInTable.findFirst
      .mockResolvedValueOnce({ id: 'source-1', tenantId: 'tenant-a', name: 'Mesa 01', status: 'occupied', activeOrderId: 'order-1' })
      .mockResolvedValueOnce({ id: 'target-1', tenantId: 'tenant-a', name: 'Mesa 02', status: 'free', activeOrderId: null });
    harness.tx.dineInTable.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(harness.service.transferTable('tenant-a', 'source-1', 'target-1', 'operator-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PosService cancellation refund method', () => {
  it('passes the persisted sale payment method to the idempotent refund movement', async () => {
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue({
        id: 'order-1', tenantId: 'tenant-a', sourceChannel: 'pos', status: 'confirmed',
        cashSessionId: 'session-1', paymentMethod: PaymentMethod.pix, total: 42, fulfillmentType: 'pickup',
      }) },
      dineInTable: { updateMany: jest.fn() },
    };
    const cashService = { registerRefundMovement: jest.fn() };
    const ordersService = { updateOrderStatus: jest.fn() };
    const service = new PosService(
      prisma as never,
      {} as never,
      cashService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ordersService as never,
      {} as never,
    );
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: 'order-1' } as never);

    await service.cancelPosSale('tenant-a', 'order-1', 'operator-1');

    expect(ordersService.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      'tenant-a',
      expect.objectContaining({ status: 'cancelled' }),
      'operator-1',
    );
    expect(cashService.registerRefundMovement).toHaveBeenCalledWith(
      'tenant-a', 'session-1', 'order-1', 42, PaymentMethod.pix,
    );
  });
});
