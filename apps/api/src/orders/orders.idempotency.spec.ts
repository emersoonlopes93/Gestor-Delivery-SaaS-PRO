import 'reflect-metadata';
import { PaymentMethod, type CreateOrderDTO, type OrderResponseDTO } from '@gestor/types';
import { OrdersService } from './orders.service';
import { fingerprintOrderSubmission } from './order-idempotency.util';

function versionedPayload(): CreateOrderDTO {
  const payload: CreateOrderDTO = {
    idempotencyKey: '',
    customerName: 'Cliente',
    customerPhone: '11999999999',
    fulfillmentType: 'pickup',
    sourceChannel: 'direct_online',
    items: [{ lineType: 'product', productId: 'product-1', quantity: 1 }],
    payment: { method: PaymentMethod.cash, changeFor: 0 },
  };
  payload.idempotencyKey = `v1.attempt-1.${fingerprintOrderSubmission(payload)}`;
  return payload;
}

function createService(prisma: Record<string, unknown>) {
  const checkoutValidator = {
    validate: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      lines: [],
      itemsSubtotal: 20,
      discountTotal: 0,
      deliveryFee: 0,
      total: 20,
      couponId: null,
      cashbackUsed: null,
    }),
  };
  const customerService = {
    syncCustomerOnOrderUpsert: jest.fn().mockResolvedValue({ id: 'customer-1' }),
  };
  const service = new OrdersService(
    prisma as never,
    checkoutValidator as never,
    customerService as never,
    {} as never,
    {} as never,
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
  return { service, checkoutValidator, customerService };
}

describe('OrdersService public checkout idempotency', () => {
  const existingOrder = { id: 'order-existing' };
  const existingResponse = { id: existingOrder.id } as OrderResponseDTO;

  it('returns the existing order for the same key and payload without a write transaction', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-a', slug: 'loja', settings: {} }) },
      order: { findUnique: jest.fn().mockResolvedValue(existingOrder) },
      $transaction: jest.fn(),
    };
    const { service } = createService(prisma);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue(existingResponse);

    await expect(service.createOrder('loja', versionedPayload())).resolves.toBe(existingResponse);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('recovers a concurrent unique-key race by returning the committed order', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-a', slug: 'loja', settings: {} }) },
      order: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingOrder),
      },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
    };
    const { service } = createService(prisma);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue(existingResponse);

    await expect(service.createOrder('loja', versionedPayload())).resolves.toBe(existingResponse);

    expect(prisma.order.findUnique).toHaveBeenCalledTimes(2);
  });
});
