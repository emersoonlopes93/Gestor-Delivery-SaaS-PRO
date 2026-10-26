import { ConflictException } from '@nestjs/common';

jest.mock('@gestor/utils', () => ({
  getProductConfigurationRoute: jest.fn(),
}), { virtual: true });

import { OrdersService } from './orders.service';

const tenantId = 'tenant-a';
const orderId = 'order-a';
const updatedAt = new Date('2026-10-25T12:00:00.000Z');

type EconomicOperation = {
  type: 'add_item' | 'remove_item' | 'update_quantity';
  orderItemId?: string;
  quantity?: number;
  payload?: { lineType: 'product'; productId: string; quantity: number };
};

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    tenantId,
    status: 'pending',
    updatedAt,
    customerId: null,
    paymentMethod: 'cash',
    changeFor: null,
    fulfillmentType: 'pickup',
    deliveryAddress: null,
    paymentTransactions: [],
    items: [{
      id: 'item-a',
      tenantId,
      orderId,
      lineType: 'product',
      productId: 'product-a',
      comboId: null,
      quantity: 1,
      notes: null,
      snapshotName: 'Produto A',
      snapshotImage: null,
      snapshotBasePrice: 10,
      snapshotExtrasTotal: 0,
      snapshotComposition: null,
      snapshotCatalogV2Json: {
        version: 'catalog_v2_snapshot_v1',
        lineType: 'product',
        selections: [],
      },
    }],
    ...overrides,
  };
}

function makeHarness(input: {
  historicalDepletionCount?: number;
  lockedOrder?: { status: string; updatedAt: Date };
} = {}) {
  const order = orderFixture();
  const tx = {
    order: {
      findFirst: jest.fn().mockResolvedValue(input.lockedOrder ?? {
        id: order.id,
        status: order.status,
        updatedAt: order.updatedAt,
      }),
      update: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    stockMovement: {
      count: jest.fn().mockResolvedValue(input.historicalDepletionCount ?? 0),
    },
    orderItem: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderTimeline: { create: jest.fn() },
  };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: tenantId, slug: 'loja' }) },
    order: { findFirst: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const checkoutValidator = {
    validate: jest.fn().mockResolvedValue({
      lines: [{
        lineType: 'product',
        productId: 'product-a',
        quantity: 1,
        unitPrice: 10,
        lineTotal: 10,
        name: 'Produto A',
        image: null,
        basePrice: 10,
        extrasTotal: 0,
        composition: null,
        snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] },
      }],
      itemsSubtotal: 10,
      discountTotal: 0,
      deliveryFee: 0,
      total: 10,
    }),
  };
  const inventoryService = { lockOrderInTransaction: jest.fn().mockResolvedValue(undefined) };
  const gateway = { emitOrderChanged: jest.fn() };
  const service = new OrdersService(
    prisma as never,
    checkoutValidator as never,
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
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: orderId } as never);
  return { service, tx, checkoutValidator, inventoryService, gateway };
}

function conflictCode(error: unknown): string | undefined {
  if (!(error instanceof ConflictException)) return undefined;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String(response.code)
    : undefined;
}

describe('OrdersService post-depletion economic edit guard', () => {
  const economicOperations: Array<[string, EconomicOperation[]]> = [
    ['add_item', [{ type: 'add_item', payload: { lineType: 'product', productId: 'product-b', quantity: 1 } }]],
    ['remove_item', [{ type: 'remove_item', orderItemId: 'item-a' }]],
    ['update_quantity', [{ type: 'update_quantity', orderItemId: 'item-a', quantity: 2 }]],
  ];

  it.each(economicOperations)('rejects %s after a historical theoretical depletion without side effects', async (_name, operations) => {
    const harness = makeHarness({ historicalDepletionCount: 1 });

    const error = await harness.service.editOrder(orderId, tenantId, { operations }).catch((caught: unknown) => caught);

    expect(conflictCode(error)).toBe('ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION');
    expect(harness.inventoryService.lockOrderInTransaction).toHaveBeenCalledWith(expect.anything(), tenantId, orderId);
    expect(harness.tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(harness.tx.orderItem.create).not.toHaveBeenCalled();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.orderTimeline.create).not.toHaveBeenCalled();
    expect(harness.gateway.emitOrderChanged).not.toHaveBeenCalled();
  });

  it('rejects a full item replacement and a mixed note/economic request atomically', async () => {
    const fullReplacement = makeHarness({ historicalDepletionCount: 1 });
    const replacementError = await fullReplacement.service.editOrder(orderId, tenantId, {
      items: [{ lineType: 'product', productId: 'product-b', quantity: 1 }],
    }).catch((caught: unknown) => caught);
    expect(conflictCode(replacementError)).toBe('ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION');
    expect(fullReplacement.tx.orderItem.deleteMany).not.toHaveBeenCalled();

    const mixed = makeHarness({ historicalDepletionCount: 1 });
    const mixedError = await mixed.service.editOrder(orderId, tenantId, {
      operations: [
        { type: 'update_order_notes', notes: 'não aplicar' },
        { type: 'update_quantity', orderItemId: 'item-a', quantity: 2 },
      ],
    }).catch((caught: unknown) => caught);
    expect(conflictCode(mixedError)).toBe('ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION');
    expect(mixed.tx.order.update).not.toHaveBeenCalled();
    expect(mixed.tx.order.updateMany).not.toHaveBeenCalled();
    expect(mixed.tx.orderItem.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps note-only edits targeted without checkout recalculation or item replacement', async () => {
    const harness = makeHarness({ historicalDepletionCount: 1 });

    await harness.service.editOrder(orderId, tenantId, {
      operations: [
        { type: 'update_order_notes', notes: 'portaria' },
        { type: 'update_item_notes', orderItemId: 'item-a', notes: 'sem cebola' },
      ],
    });

    expect(harness.checkoutValidator.validate).not.toHaveBeenCalled();
    expect(harness.tx.stockMovement.count).not.toHaveBeenCalled();
    expect(harness.tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { notes: 'portaria' },
    });
    expect(harness.tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-a', orderId, tenantId },
      data: { notes: 'sem cebola' },
    });
    expect(harness.tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(harness.tx.orderItem.create).not.toHaveBeenCalled();
  });

  it('fails closed when the locked order changed before an economic edit can write', async () => {
    const harness = makeHarness({
      historicalDepletionCount: 0,
      lockedOrder: { status: 'cancelled', updatedAt: new Date(updatedAt.getTime() + 1) },
    });

    const error = await harness.service.editOrder(orderId, tenantId, {
      operations: [{ type: 'update_quantity', orderItemId: 'item-a', quantity: 2 }],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(harness.tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });
});
