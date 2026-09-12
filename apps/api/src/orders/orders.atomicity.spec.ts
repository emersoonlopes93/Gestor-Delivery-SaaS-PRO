import { BadRequestException, ConflictException } from '@nestjs/common';
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
      resolvedDeliveryCoordinates: { lat: -23.56, lng: -46.64 },
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
    const gateway = { emitOrderCancelled: jest.fn(), emitOrderChanged: jest.fn() };
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
      {} as never,
    );

    await expect(service.createOrder('loja', {
      idempotencyKey: 'checkout-1',
      customerName: 'Cliente',
      customerPhone: '11999999999',
      customerEmail: 'cliente@example.com',
      fulfillmentType: 'delivery',
      sourceChannel: 'direct_online',
      deliveryAddress: {
        street: 'Rua Teste',
        number: '10',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001000',
      },
      items: [{ lineType: 'product', productId: 'product-1', quantity: 1 }],
      payment: { method: PaymentMethod.cash },
      useCashbackAmount: 5,
      couponCode: 'PROMO',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(committed).toBe(false);
    expect(inventoryService.processOrderDepletionInTransaction).toHaveBeenCalledWith(tx, 'tenant-a', 'order-1');
    expect(tx.orderDeliveryAddress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-a', lat: -23.56, lng: -46.64 }),
    });
    expect(cashbackService.createTransaction).not.toHaveBeenCalled();
    expect(tx.coupon.update).not.toHaveBeenCalled();
  });
});

describe('OrdersService cancellation stock reversal atomicity', () => {
  const makeCancellationHarness = (inventoryFailure?: Error) => {
    let committed = false;
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dineInTable: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      orderTimeline: { create: jest.fn() },
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue({
        id: 'order-1', tenantId: 'tenant-a', status: 'pending', total: 20,
        sourceChannel: 'direct_online', orderNumber: '#0001', fulfillmentType: 'pickup',
        deliveryDriverId: null, isScheduled: false, publicTrackingToken: null, customerPhone: null,
      }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    };
    const inventoryService = {
      reverseOrderDepletionInTransaction: jest.fn().mockImplementation(async () => {
        if (inventoryFailure) throw inventoryFailure;
      }),
    };
    const gateway = { emitOrderCancelled: jest.fn(), emitOrderChanged: jest.fn() };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      inventoryService as never,
      {} as never,
      {} as never,
      {} as never,
      gateway as never,
      {} as never,
      {} as never,
      { recordOrderStatusEvent: jest.fn() } as never,
      { handleInternalStatusChanged: jest.fn().mockResolvedValue({ deferred: false }) } as never,
      {} as never,
    );
    return { service, tx, inventoryService, gateway, get committed() { return committed; } };
  };

  it('runs own-checkout cancellation and stock reversal through the same transaction', async () => {
    const harness = makeCancellationHarness();

    await harness.service.updateOrderStatus('order-1', 'tenant-a', { status: 'cancelled' });

    expect(harness.inventoryService.reverseOrderDepletionInTransaction).toHaveBeenCalledWith(
      harness.tx, 'tenant-a', 'order-1',
    );
    expect(harness.committed).toBe(true);
  });

  it('does not commit the cancelled status when stock reversal fails', async () => {
    const harness = makeCancellationHarness(new BadRequestException('stock reversal failed'));

    await expect(
      harness.service.updateOrderStatus('order-1', 'tenant-a', { status: 'cancelled' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.committed).toBe(false);
  });

  it('returns a controlled conflict when the canonical status changed before the write', async () => {
    const harness = makeCancellationHarness();
    harness.tx.order.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(harness.service.updateOrderStatus('order-1', 'tenant-a', { status: 'cancelled' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(harness.committed).toBe(false);
  });

  it('keeps a committed transition successful when realtime notification throws', async () => {
    const harness = makeCancellationHarness();
    harness.gateway.emitOrderChanged.mockImplementation(() => { throw new Error('socket unavailable'); });

    await expect(harness.service.updateOrderStatus('order-1', 'tenant-a', { status: 'cancelled' })).resolves.toMatchObject({ status: 'cancelled' });
    expect(harness.committed).toBe(true);
  });
});
