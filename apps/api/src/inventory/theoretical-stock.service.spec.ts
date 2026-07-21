import { BadRequestException } from '@nestjs/common';
import { TheoreticalStockService } from './theoretical-stock.service';

describe('TheoreticalStockService processOrderDepletion', () => {
  const makeDb = () => {
    const tx = {
      stockMovement: { count: jest.fn(), createMany: jest.fn() },
      ingredient: { findMany: jest.fn(), updateMany: jest.fn() },
    };

    return {
      stockMovement: { count: jest.fn(), createMany: jest.fn() },
      order: { findFirst: jest.fn() },
      productRecipeIngredient: { findMany: jest.fn() },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
      tx,
    };
  };

  it('does not deplete stock twice when an order already has theoretical movements', async () => {
    const db = makeDb();
    db.stockMovement.count.mockResolvedValue(1);

    await new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1');

    expect(db.order.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an order when the available stock cannot cover its recipe', async () => {
    const db = makeDb();
    db.stockMovement.count.mockResolvedValue(0);
    db.order.findFirst.mockResolvedValue({
      items: [{ productId: 'product-1', quantity: 2, snapshotCatalogV2Json: null }],
    });
    db.productRecipeIngredient.findMany.mockResolvedValue([{ ingredientId: 'ingredient-1', quantity: 2 }]);
    db.tx.stockMovement.count.mockResolvedValue(0);
    db.tx.ingredient.findMany.mockResolvedValue([{ id: 'ingredient-1', currentCost: 3 }]);
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('aggregates recipe consumption and records one tenant-scoped movement per ingredient', async () => {
    const db = makeDb();
    db.stockMovement.count.mockResolvedValue(0);
    db.order.findFirst.mockResolvedValue({
      items: [
        { productId: 'product-1', quantity: 1, snapshotCatalogV2Json: null },
        { productId: 'product-1', quantity: 2, snapshotCatalogV2Json: null },
      ],
    });
    db.productRecipeIngredient.findMany.mockResolvedValue([{ ingredientId: 'ingredient-1', quantity: 1.5 }]);
    db.tx.stockMovement.count.mockResolvedValue(0);
    db.tx.ingredient.findMany.mockResolvedValue([{ id: 'ingredient-1', currentCost: 4 }]);
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 1 });

    await new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-1', tenantId: 'tenant-a', currentStock: { gte: 4.5 } },
      data: { currentStock: { decrement: 4.5 } },
    });
    expect(db.tx.stockMovement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-a',
        ingredientId: 'ingredient-1',
        orderId: 'order-1',
        quantity: 4.5,
      })],
    });
  });
});
