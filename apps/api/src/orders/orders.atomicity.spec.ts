import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@gestor/types';
import { OrdersService } from './orders.service';

describe('OrdersService public checkout atomicity', () => {
  it('propagates stock integrity failure and does not commit order or commercial effects', async () => {
    let committed = false;
    const tx = {
      tenant: { update: jest.fn().mockResolvedValue({ orderSequence: 1 }) },
      order: { create: jest.fn().mockResolvedValue({
        id: 'order-1', orderNumber: '#0001', status: 'pending', sourceChannel: 'direct_online', paymentMethod: 'cash',
      }) },
      orderItem: { create: jest.fn() },
      orderTimeline: { create: jest.fn() },
      orderDeliveryAddress: { create: jest.fn() },
      dineInTable: { update: jest.fn() },
      coupon: { update: jest.fn() },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-a', slug: 'loja', settings: {} }) },
      order: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    };
    const customerService = { syncCustomerOnOrderUpsert: jest.fn().mockResolvedValue({ id: 'customer-1' }) };
    const checkoutValidator = { validate: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      lines: [{
        lineType: 'product', productId: 'product-1', quantity: 1, unitPrice: 20,
        lineTotal: 20, name: 'Produto', basePrice: 20, extrasTotal: 0,
      }],
      itemsSubtotal: 20,
      discountTotal: 0,
      deliveryFee: 0,
      total: 20,
      couponId: 'coupon-1',
      cashbackUsed: 5,
    }) };
    const inventoryService = {
      processOrderDepletionInTransaction: jest.fn().mockRejectedValue(
        new BadRequestException('Estoque insuficiente'),
      ),
    };
    const cashbackService = { createTransaction: jest.fn() };
    const service = new OrdersService(
      prisma as never,
      checkoutValidator as never,
      customerService as never,
      cashbackService as never,
      {} as never,
      inventoryService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.createOrder('loja', {
      idempotencyKey: 'checkout-1',
      customerName: 'Cliente',
      customerPhone: '11999999999',
      customerEmail: 'cliente@example.com',
      fulfillmentType: 'pickup',
      sourceChannel: 'direct_online',
      items: [{ lineType: 'product', productId: 'product-1', quantity: 1 }],
      payment: { method: PaymentMethod.cash },
      useCashbackAmount: 5,
      couponCode: 'PROMO',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(committed).toBe(false);
    expect(inventoryService.processOrderDepletionInTransaction).toHaveBeenCalledWith(tx, 'tenant-a', 'order-1');
    expect(cashbackService.createTransaction).not.toHaveBeenCalled();
    expect(tx.coupon.update).not.toHaveBeenCalled();
  });
});
