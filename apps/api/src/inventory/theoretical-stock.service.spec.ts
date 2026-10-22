import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TheoreticalStockService } from './theoretical-stock.service';

const decimal = (value: string | number) => new Prisma.Decimal(String(value));

function makeDb() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    stockMovement: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'reversal-1' }),
    },
    ingredient: {
      findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-1', currentCost: decimal('2.5') }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: { findFirst: jest.fn() },
  };
  return {
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    tx,
  };
}

function createService(
  db: ReturnType<typeof makeDb>,
  compositionOverrides: Partial<{ resolveProductComposition: jest.Mock }> = {},
  eligibilityOverrides: Partial<{
    assertEligibleProductIds: jest.Mock;
    getProductConfigurationRoutes: jest.Mock;
  }> = {},
) {
  const composition = { resolveProductComposition: jest.fn(), ...compositionOverrides };
  const eligibility = {
    assertEligibleProductIds: jest.fn().mockResolvedValue(undefined),
    getProductConfigurationRoutes: jest.fn().mockResolvedValue(new Map([['product-1', 'direct']])),
    ...eligibilityOverrides,
  };
  return new TheoreticalStockService(db as never, composition as never, eligibility as never);
}

describe('TheoreticalStockService', () => {
  it('does not deplete stock twice when an order already has theoretical movements', async () => {
    const db = makeDb();
    db.tx.stockMovement.count.mockResolvedValue(1);
    await createService(db).processOrderDepletion('tenant-a', 'order-1');
    expect(db.tx.order.findFirst).not.toHaveBeenCalled();
  });

  it('uses canonical composition and preserves six-decimal physical quantities', async () => {
    const db = makeDb();
    db.tx.order.findFirst.mockResolvedValue({
      items: [{ lineType: 'product', productId: 'product-1', quantity: 2, snapshotCatalogV2Json: null }],
    });
    const composition = {
      resolveProductComposition: jest.fn().mockImplementation(async (_tenantId: string, input: { productQuantity: Prisma.Decimal }) =>
        new Map([['ingredient-1', decimal('0.000333').mul(input.productQuantity)]]),
      ),
    };
    await createService(db, composition).processOrderDepletion('tenant-a', 'order-1');

    expect(composition.resolveProductComposition).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ productId: 'product-1', productQuantity: decimal('2'), selections: [] }),
      db.tx,
    );
    expect(db.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-1', tenantId: 'tenant-a', currentStock: { gte: decimal('0.000666') } },
      data: { currentStock: { decrement: decimal('0.000666') } },
    });
    expect(db.tx.stockMovement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quantity: decimal('0.000666'), unitCost: decimal('2.5') })],
    });
  });

  it('scales a simple combo component by slot quantity and combo quantity', async () => {
    const db = makeDb();
    db.tx.order.findFirst.mockResolvedValue({
      items: [{
        lineType: 'combo',
        quantity: 2,
        snapshotCatalogV2Json: { slots: [{ slotId: 'slot-1', items: [{ productId: 'product-1', qty: 3 }] }] },
      }],
    });
    const composition = { resolveProductComposition: jest.fn().mockResolvedValue(new Map([['ingredient-1', decimal('1')]])) };
    const eligibility = { assertEligibleProductIds: jest.fn().mockResolvedValue(undefined) };
    await createService(db, composition, eligibility).processOrderDepletion('tenant-a', 'order-1');

    expect(eligibility.assertEligibleProductIds).toHaveBeenCalledWith('tenant-a', ['product-1']);
    expect(composition.resolveProductComposition).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ productId: 'product-1', productQuantity: decimal('6') }),
      db.tx,
    );
  });

  it('fails closed before stock mutation for a legacy combo snapshot without component IDs', async () => {
    const db = makeDb();
    db.tx.order.findFirst.mockResolvedValue({
      items: [{ lineType: 'combo', quantity: 1, snapshotCatalogV2Json: { slots: [{ items: [{ name: 'Pizza' }] }] } }],
    });
    await expect(createService(db).processOrderDepletion('tenant-a', 'order-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx.ingredient.updateMany).not.toHaveBeenCalled();
    expect(db.tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('fails closed before stock mutation when a configurable product has no authoritative selection snapshot', async () => {
    const db = makeDb();
    db.tx.order.findFirst.mockResolvedValue({
      items: [{ lineType: 'product', productId: 'product-1', quantity: 1, snapshotCatalogV2Json: null }],
    });
    const eligibility = {
      assertEligibleProductIds: jest.fn().mockResolvedValue(undefined),
      getProductConfigurationRoutes: jest.fn().mockResolvedValue(new Map([['product-1', 'generic']])),
    };
    await expect(createService(db, {}, eligibility).processOrderDepletion('tenant-a', 'order-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx.ingredient.updateMany).not.toHaveBeenCalled();
    expect(db.tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('rolls back before movements when stock is insufficient', async () => {
    const db = makeDb();
    db.tx.order.findFirst.mockResolvedValue({ items: [{ lineType: 'product', productId: 'product-1', quantity: 1, snapshotCatalogV2Json: null }] });
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 0 });
    const composition = { resolveProductComposition: jest.fn().mockResolvedValue(new Map([['ingredient-1', decimal('1')]])) };
    await expect(createService(db, composition).processOrderDepletion('tenant-a', 'order-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('reverses only persisted movements using their original quantity and cost', async () => {
    const db = makeDb();
    db.tx.stockMovement.findMany.mockResolvedValue([{
      id: 'depletion-1', ingredientId: 'ingredient-1', quantity: decimal('0.000333'), unitCost: decimal('2.5'), orderId: 'order-1', reversal: null,
    }]);
    await createService(db).reverseOrderDepletion('tenant-a', 'order-1');
    expect(db.tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'theoretical_reversal', quantity: decimal('0.000333'), unitCost: decimal('2.5'), reversalOfMovementId: 'depletion-1',
    }) });
    expect(db.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-1', tenantId: 'tenant-a' },
      data: { currentStock: { increment: decimal('0.000333') } },
    });
  });
});
