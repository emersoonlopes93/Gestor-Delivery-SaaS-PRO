import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, PosFulfillmentType } from '@gestor/types';
import { PosService } from './pos.service';

describe('PosService atomic sale', () => {
  const makeHarness = (stockError?: Error) => {
    let committed = false;
    const tx = {
      tenant: { update: jest.fn().mockResolvedValue({ orderSequence: 1 }) },
      order: { create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: '#0001', total: 20 }) },
      orderItem: { create: jest.fn() },
      orderDeliveryAddress: { upsert: jest.fn(), deleteMany: jest.fn() },
      dineInTable: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      coupon: { update: jest.fn() },
    };
    const prisma = {
      cashSession: { findFirst: jest.fn().mockResolvedValue({ id: 'cash-1' }) },
      order: { findFirst: jest.fn().mockResolvedValue(null) },
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
      {} as never,
      ordersService as never,
      { calculateDeliveryFee: jest.fn() } as never,
    );
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: 'order-1', status: 'confirmed' } as never);

    return {
      service, prisma, tx, cashService, cashbackService, stockService, ordersService,
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
  });
});
