import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FulfillmentType, OrderLineType, PrismaClient, StockMovementType, UnitType } from '@prisma/client';
import { OrdersService } from './orders.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { ConfigurableRecipeCompositionService } from '../inventory/configurable-recipe-composition.service';
import { RecipeExpansionService } from '../inventory/recipe-expansion.service';
import { ComboComponentEligibilityService } from '../catalog/combo-component-eligibility.service';

jest.mock('@gestor/utils', () => ({
  getProductConfigurationRoute: jest.fn(),
}), { virtual: true });

jest.setTimeout(30_000);

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname)) {
    throw new Error('Order edit PostgreSQL test refused a non-local database host.');
  }
  if (database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

describe('post-depletion order edit guard with ephemeral PostgreSQL', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId: string;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
    tenantId = (await prisma.tenant.create({ data: { name: `Order guard ${suffix}`, slug: `order-guard-${suffix}` } })).id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  function createService(checkoutValidator: { validate: jest.Mock }) {
    const expansion = new RecipeExpansionService(prisma as never);
    const composition = new ConfigurableRecipeCompositionService(
      prisma as never,
      expansion,
      { calculatePrice: jest.fn() } as never,
    );
    const inventory = new TheoreticalStockService(
      prisma as never,
      composition,
      new ComboComponentEligibilityService(prisma as never),
    );
    const service = new OrdersService(
      prisma as never, checkoutValidator as never, {} as never, {} as never, {} as never,
      inventory,
      {} as never,
      {} as never,
      { notifyOrderStatus: jest.fn().mockResolvedValue(undefined) } as never,
      {
        emitOrderChanged: jest.fn(),
        emitOrderCancelled: jest.fn(),
        emitOrderStatusUpdated: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      { recordOrderStatusEvent: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
    );
    return { service, inventory };
  }

  it('rejects an economic edit after active and reversed historical depletion without changing order items, totals, or movements', async () => {
    const [ingredient, product] = await Promise.all([
      prisma.ingredient.create({ data: { tenantId, name: `Ingredient ${suffix}`, sku: `ingredient-${suffix}`, unit: UnitType.un, currentStock: 8, currentCost: 2 } }),
      prisma.product.create({ data: { tenantId, name: `Product ${suffix}`, slug: `product-${suffix}`, basePrice: 10 } }),
    ]);
    const order = await prisma.order.create({
      data: {
        tenantId, orderNumber: `GUARD-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup,
        customerName: 'Guard test', customerPhone: `119${Date.now().toString().slice(-8)}`,
        itemsSubtotal: 10, total: 10, idempotencyKey: `guard-${suffix}`, publicTrackingToken: `guard-${suffix}`,
      },
    });
    const item = await prisma.orderItem.create({
      data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 10, lineTotal: 10, snapshotName: 'Original', snapshotBasePrice: 10, snapshotExtrasTotal: 0 },
    });
    const depletion = await prisma.stockMovement.create({
      data: { tenantId, ingredientId: ingredient.id, orderId: order.id, type: StockMovementType.theoretical_depletion, quantity: 1, unitCost: 2 },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        ingredientId: ingredient.id,
        orderId: order.id,
        type: StockMovementType.theoretical_reversal,
        quantity: 1,
        unitCost: 2,
        reversalOfMovementId: depletion.id,
      },
    });

    const checkoutValidator = {
      validate: jest.fn().mockResolvedValue({
        lines: [{ lineType: 'product', productId: product.id, quantity: 2, unitPrice: 10, lineTotal: 20, name: 'Changed', image: null, basePrice: 10, extrasTotal: 0, composition: null, snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] } }],
        itemsSubtotal: 20, discountTotal: 0, deliveryFee: 0, total: 20,
      }),
    };
    const { service } = createService(checkoutValidator);

    const error = await service.editOrder(order.id, tenantId, {
      operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION' });
    const [persistedOrder, persistedItems, persistedMovements, editTimeline] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.orderItem.findMany({ where: { tenantId, orderId: order.id } }),
      prisma.stockMovement.findMany({ where: { tenantId, orderId: order.id } }),
      prisma.orderTimeline.count({ where: { tenantId, orderId: order.id, note: { startsWith: 'Pedido editado:' } } }),
    ]);
    expect(Number(persistedOrder.total)).toBe(10);
    expect(persistedItems).toHaveLength(1);
    expect(persistedItems[0]?.id).toBe(item.id);
    expect(Number(persistedItems[0]?.quantity)).toBe(1);
    expect(persistedMovements).toHaveLength(2);
    expect(editTimeline).toBe(0);
  });

  it('allows a pre-depletion economic edit and persists its replacement only once', async () => {
    const product = await prisma.product.create({
      data: { tenantId, name: `Pre depletion ${suffix}`, slug: `pre-depletion-${suffix}`, basePrice: 10 },
    });
    const order = await prisma.order.create({
      data: {
        tenantId, orderNumber: `PRE-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup,
        customerName: 'Pre depletion', customerPhone: `118${Date.now().toString().slice(-8)}`,
        itemsSubtotal: 10, total: 10, idempotencyKey: `pre-${suffix}`, publicTrackingToken: `pre-${suffix}`,
      },
    });
    const item = await prisma.orderItem.create({
      data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 10, lineTotal: 10, snapshotName: 'Original', snapshotBasePrice: 10, snapshotExtrasTotal: 0 },
    });
    const checkoutValidator = {
      validate: jest.fn().mockResolvedValue({
        lines: [{ lineType: 'product', productId: product.id, quantity: 2, unitPrice: 10, lineTotal: 20, name: 'Changed', image: null, basePrice: 10, extrasTotal: 0, composition: null, snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] } }],
        itemsSubtotal: 20, discountTotal: 0, deliveryFee: 0, total: 20,
      }),
    };
    const { service } = createService(checkoutValidator);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: order.id } as never);

    await service.editOrder(order.id, tenantId, {
      operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }],
    });

    const [persistedOrder, items, movements] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.orderItem.findMany({ where: { tenantId, orderId: order.id } }),
      prisma.stockMovement.count({ where: { tenantId, orderId: order.id, type: StockMovementType.theoretical_depletion } }),
    ]);
    expect(Number(persistedOrder.total)).toBe(20);
    expect(items).toHaveLength(1);
    expect(Number(items[0]?.quantity)).toBe(2);
    expect(movements).toBe(0);
  });

  it('updates order and item notes without replacing lines or touching historical depletion', async () => {
    const ingredient = await prisma.ingredient.create({ data: { tenantId, name: `Notes ingredient ${suffix}`, sku: `notes-ingredient-${suffix}`, unit: UnitType.un, currentStock: 3, currentCost: 1 } });
    const product = await prisma.product.create({ data: { tenantId, name: `Notes product ${suffix}`, slug: `notes-product-${suffix}`, basePrice: 8 } });
    const order = await prisma.order.create({ data: { tenantId, orderNumber: `NOTES-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup, customerName: 'Notes', customerPhone: `117${Date.now().toString().slice(-8)}`, itemsSubtotal: 8, total: 8, idempotencyKey: `notes-${suffix}`, publicTrackingToken: `notes-${suffix}` } });
    const item = await prisma.orderItem.create({ data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 8, lineTotal: 8, snapshotName: 'Original', snapshotBasePrice: 8, snapshotExtrasTotal: 0 } });
    await prisma.stockMovement.create({ data: { tenantId, ingredientId: ingredient.id, orderId: order.id, type: StockMovementType.theoretical_depletion, quantity: 1, unitCost: 1 } });
    const checkoutValidator = { validate: jest.fn() };
    const { service } = createService(checkoutValidator);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: order.id } as never);

    await service.editOrder(order.id, tenantId, { operations: [
      { type: 'update_order_notes', notes: 'Portaria' },
      { type: 'update_item_notes', orderItemId: item.id, notes: 'Sem gelo' },
    ] });

    const [persistedOrder, persistedItem, movements] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } }),
      prisma.stockMovement.count({ where: { tenantId, orderId: order.id } }),
    ]);
    expect(persistedOrder.notes).toBe('Portaria');
    expect(persistedItem.notes).toBe('Sem gelo');
    expect(Number(persistedOrder.total)).toBe(8);
    expect(movements).toBe(1);
    expect(checkoutValidator.validate).not.toHaveBeenCalled();
  });

  it('rejects a stale economic replacement after a real item-note edit and preserves the note', async () => {
    const product = await prisma.product.create({ data: { tenantId, name: `Note race ${suffix}`, slug: `note-race-${suffix}`, basePrice: 8 } });
    const order = await prisma.order.create({ data: { tenantId, orderNumber: `NOTE-RACE-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup, customerName: 'Note race', customerPhone: `113${Date.now().toString().slice(-8)}`, itemsSubtotal: 8, total: 8, idempotencyKey: `note-race-${suffix}`, publicTrackingToken: `note-race-${suffix}` } });
    const item = await prisma.orderItem.create({ data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 8, lineTotal: 8, snapshotName: 'Original', snapshotBasePrice: 8, snapshotExtrasTotal: 0 } });
    const validationStarted = deferred<void>();
    const validationResult = deferred<{
      lines: Array<{ lineType: 'product'; productId: string; quantity: number; unitPrice: number; lineTotal: number; name: string; image: null; basePrice: number; extrasTotal: number; composition: null; snapshotCatalogV2Json: { version: string; lineType: string; selections: never[] } }>;
      itemsSubtotal: number; discountTotal: number; deliveryFee: number; total: number;
    }>();
    const checkoutValidator = {
      validate: jest.fn(async () => {
        validationStarted.resolve();
        return validationResult.promise;
      }),
    };
    const { service } = createService(checkoutValidator);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: order.id } as never);

    const economicEdit = service.editOrder(order.id, tenantId, {
      operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }],
    }).catch((error: unknown) => error);
    await validationStarted.promise;

    await service.editOrder(order.id, tenantId, {
      operations: [{ type: 'update_item_notes', orderItemId: item.id, notes: 'Sem gelo' }],
    });

    validationResult.resolve({
      lines: [{ lineType: 'product', productId: product.id, quantity: 2, unitPrice: 8, lineTotal: 16, name: 'Changed', image: null, basePrice: 8, extrasTotal: 0, composition: null, snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] } }],
      itemsSubtotal: 16, discountTotal: 0, deliveryFee: 0, total: 16,
    });

    const error = await economicEdit;
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ORDER_EDIT_STALE' });
    const [persistedOrder, persistedItem, items, movements, editTimelines] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } }),
      prisma.orderItem.findMany({ where: { tenantId, orderId: order.id } }),
      prisma.stockMovement.count({ where: { tenantId, orderId: order.id } }),
      prisma.orderTimeline.count({ where: { tenantId, orderId: order.id, note: { startsWith: 'Pedido editado:' } } }),
    ]);
    expect(persistedItem.notes).toBe('Sem gelo');
    expect(persistedOrder.updatedAt.getTime()).toBeGreaterThan(order.updatedAt.getTime());
    expect(Number(persistedOrder.total)).toBe(8);
    expect(items).toHaveLength(1);
    expect(Number(items[0]?.quantity)).toBe(1);
    expect(movements).toBe(0);
    expect(editTimelines).toBe(0);
  });

  it('serializes an edit behind cancellation so no replacement persists after the terminal status', async () => {
    const product = await prisma.product.create({ data: { tenantId, name: `Cancel race ${suffix}`, slug: `cancel-race-${suffix}`, basePrice: 9 } });
    const order = await prisma.order.create({ data: { tenantId, orderNumber: `CANCEL-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup, customerName: 'Cancel race', customerPhone: `116${Date.now().toString().slice(-8)}`, itemsSubtotal: 9, total: 9, idempotencyKey: `cancel-race-${suffix}`, publicTrackingToken: `cancel-race-${suffix}` } });
    const item = await prisma.orderItem.create({ data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 9, lineTotal: 9, snapshotName: 'Original', snapshotBasePrice: 9, snapshotExtrasTotal: 0 } });
    const validationStarted = deferred<void>();
    const validationResult = deferred<{
      lines: Array<{ lineType: 'product'; productId: string; quantity: number; unitPrice: number; lineTotal: number; name: string; image: null; basePrice: number; extrasTotal: number; composition: null; snapshotCatalogV2Json: { version: string; lineType: string; selections: never[] } }>;
      itemsSubtotal: number; discountTotal: number; deliveryFee: number; total: number;
    }>();
    const checkoutValidator = { validate: jest.fn(() => { validationStarted.resolve(); return validationResult.promise; }) };
    const { service } = createService(checkoutValidator);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: order.id } as never);

    const edit = service.editOrder(order.id, tenantId, { operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }] }).catch((error: unknown) => error);
    await validationStarted.promise;
    await service.updateOrderStatus(
      order.id,
      tenantId,
      { status: 'cancelled', note: 'Corrida de cancelamento real' },
      undefined,
      { marketplaceEvent: true },
    );
    validationResult.resolve({ lines: [{ lineType: 'product', productId: product.id, quantity: 2, unitPrice: 9, lineTotal: 18, name: 'Changed', image: null, basePrice: 9, extrasTotal: 0, composition: null, snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] } }], itemsSubtotal: 18, discountTotal: 0, deliveryFee: 0, total: 18 });

    const result = await edit;
    expect(result).toBeInstanceOf(ConflictException);
    const [persistedOrder, persistedItems] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.orderItem.findMany({ where: { tenantId, orderId: order.id } }),
    ]);
    expect(persistedOrder.status).toBe('cancelled');
    expect(Number(persistedOrder.total)).toBe(9);
    expect(persistedItems).toHaveLength(1);
    expect(Number(persistedItems[0]?.quantity)).toBe(1);
  });

  it('serializes an edit behind a theoretical depletion and rejects the stale economic replacement', async () => {
    const [ingredient, product] = await Promise.all([
      prisma.ingredient.create({ data: { tenantId, name: `Depletion race ingredient ${suffix}`, sku: `depletion-race-${suffix}`, unit: UnitType.un, currentStock: 4, currentCost: 3 } }),
      prisma.product.create({ data: { tenantId, name: `Depletion race ${suffix}`, slug: `depletion-race-${suffix}`, basePrice: 11 } }),
    ]);
    const order = await prisma.order.create({ data: { tenantId, orderNumber: `DEPLETE-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup, customerName: 'Depletion race', customerPhone: `115${Date.now().toString().slice(-8)}`, itemsSubtotal: 11, total: 11, idempotencyKey: `depletion-race-${suffix}`, publicTrackingToken: `depletion-race-${suffix}` } });
    const item = await prisma.orderItem.create({ data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 11, lineTotal: 11, snapshotName: 'Original', snapshotBasePrice: 11, snapshotExtrasTotal: 0 } });
    await prisma.productRecipeIngredient.create({
      data: {
        tenantId,
        productId: product.id,
        ingredientId: ingredient.id,
        quantity: 1,
        inputQuantity: 1,
        inputUnit: UnitType.un,
      },
    });
    const validationStarted = deferred<void>();
    const validationResult = deferred<{
      lines: Array<{ lineType: 'product'; productId: string; quantity: number; unitPrice: number; lineTotal: number; name: string; image: null; basePrice: number; extrasTotal: number; composition: null; snapshotCatalogV2Json: { version: string; lineType: string; selections: never[] } }>;
      itemsSubtotal: number; discountTotal: number; deliveryFee: number; total: number;
    }>();
    const checkoutValidator = { validate: jest.fn(() => { validationStarted.resolve(); return validationResult.promise; }) };
    const { service, inventory } = createService(checkoutValidator);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: order.id } as never);

    const edit = service.editOrder(order.id, tenantId, { operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }] }).catch((error: unknown) => error);
    await validationStarted.promise;
    await inventory.processOrderDepletion(tenantId, order.id);
    validationResult.resolve({ lines: [{ lineType: 'product', productId: product.id, quantity: 2, unitPrice: 11, lineTotal: 22, name: 'Changed', image: null, basePrice: 11, extrasTotal: 0, composition: null, snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] } }], itemsSubtotal: 22, discountTotal: 0, deliveryFee: 0, total: 22 });

    const result = await edit;
    expect(result).toBeInstanceOf(ConflictException);
    expect((result as ConflictException).getResponse()).toMatchObject({ code: 'ORDER_ECONOMIC_EDIT_REQUIRES_RECONCILIATION' });
    const [persistedOrder, persistedItems, movements] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.orderItem.findMany({ where: { tenantId, orderId: order.id } }),
      prisma.stockMovement.count({ where: { tenantId, orderId: order.id, type: StockMovementType.theoretical_depletion } }),
    ]);
    expect(Number(persistedOrder.total)).toBe(11);
    expect(persistedItems).toHaveLength(1);
    expect(Number(persistedItems[0]?.quantity)).toBe(1);
    expect(movements).toBe(1);
  });

  it('keeps retries single-writer and rejects an adversarial tenant without leaking an order', async () => {
    const product = await prisma.product.create({ data: { tenantId, name: `Retry product ${suffix}`, slug: `retry-product-${suffix}`, basePrice: 7 } });
    const order = await prisma.order.create({ data: { tenantId, orderNumber: `RETRY-${suffix}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup, customerName: 'Retry', customerPhone: `114${Date.now().toString().slice(-8)}`, itemsSubtotal: 7, total: 7, idempotencyKey: `retry-${suffix}`, publicTrackingToken: `retry-${suffix}` } });
    const item = await prisma.orderItem.create({ data: { tenantId, orderId: order.id, lineType: OrderLineType.product, productId: product.id, quantity: 1, unitPrice: 7, lineTotal: 7, snapshotName: 'Original', snapshotBasePrice: 7, snapshotExtrasTotal: 0 } });
    const checkoutValidator = { validate: jest.fn().mockResolvedValue({ lines: [{ lineType: 'product', productId: product.id, quantity: 2, unitPrice: 7, lineTotal: 14, name: 'Changed', image: null, basePrice: 7, extrasTotal: 0, composition: null, snapshotCatalogV2Json: { version: 'catalog_v2_snapshot_v1', lineType: 'product', selections: [] } }], itemsSubtotal: 14, discountTotal: 0, deliveryFee: 0, total: 14 }) };
    const { service } = createService(checkoutValidator);
    jest.spyOn(service, 'getOrderDetail').mockResolvedValue({ id: order.id } as never);

    const results = await Promise.allSettled([
      service.editOrder(order.id, tenantId, { operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }] }),
      service.editOrder(order.id, tenantId, { operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 2 }] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')?.status).toBe('rejected');
    const persistedItems = await prisma.orderItem.findMany({ where: { tenantId, orderId: order.id } });
    expect(persistedItems).toHaveLength(1);
    expect(Number(persistedItems[0]?.quantity)).toBe(2);

    const otherTenant = await prisma.tenant.create({ data: { name: `Other ${suffix}`, slug: `other-order-guard-${suffix}` } });
    await expect(service.editOrder(order.id, otherTenant.id, { operations: [{ type: 'update_quantity', orderItemId: item.id, quantity: 3 }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.orderItem.count({ where: { tenantId, orderId: order.id } })).toBe(1);
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
