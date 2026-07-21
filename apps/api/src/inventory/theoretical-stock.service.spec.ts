import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TheoreticalStockService } from './theoretical-stock.service';

describe('TheoreticalStockService processOrderDepletion', () => {
  const makeDb = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      stockMovement: { count: jest.fn(), createMany: jest.fn() },
      ingredient: { findMany: jest.fn(), updateMany: jest.fn() },
      order: { findFirst: jest.fn() },
      productRecipeIngredient: { findMany: jest.fn() },
    };

    return {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
      tx,
    };
  };

  const configureSingleRecipe = (db: ReturnType<typeof makeDb>, currentStock = 10) => {
    db.tx.stockMovement.count.mockResolvedValue(0);
    db.tx.order.findFirst.mockResolvedValue({
      items: [{ productId: 'product-1', quantity: 2, snapshotCatalogV2Json: null }],
    });
    db.tx.productRecipeIngredient.findMany.mockResolvedValue([{ ingredientId: 'ingredient-1', quantity: 1 }]);
    db.tx.ingredient.findMany.mockResolvedValue([{ id: 'ingredient-1', currentCost: 3, currentStock }]);
  };

  it('does not deplete stock twice when an order already has theoretical movements', async () => {
    const db = makeDb();
    db.tx.stockMovement.count.mockResolvedValue(1);

    await new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.order.findFirst).not.toHaveBeenCalled();
    expect(db.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('rejects insufficient stock without creating partial movements', async () => {
    const db = makeDb();
    configureSingleRecipe(db);
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('aggregates recipe consumption and records one tenant-scoped movement per ingredient', async () => {
    const db = makeDb();
    configureSingleRecipe(db);
    db.tx.order.findFirst.mockResolvedValue({
      items: [
        { productId: 'product-1', quantity: 1, snapshotCatalogV2Json: null },
        { productId: 'product-1', quantity: 2, snapshotCatalogV2Json: null },
      ],
    });
    db.tx.productRecipeIngredient.findMany.mockResolvedValue([{ ingredientId: 'ingredient-1', quantity: 1.5 }]);
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 1 });

    await new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-1', tenantId: 'tenant-a', currentStock: { gte: 4.5 } },
      data: { currentStock: { decrement: 4.5 } },
    });
    expect(db.tx.stockMovement.createMany).toHaveBeenCalledTimes(1);
  });

  it('serializes two genuinely concurrent deductions and applies stock once', async () => {
    const db = makeDb();
    let movementCount = 0;
    let currentStock = 10;
    let lockTail = Promise.resolve();

    db.$transaction.mockImplementation(async (callback: (transaction: typeof db.tx) => Promise<void>) => {
      const previous = lockTail;
      let releaseLock: () => void = () => undefined;
      lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
      await previous;
      try {
        return await callback(db.tx);
      } finally {
        releaseLock();
      }
    });
    db.tx.stockMovement.count.mockImplementation(async () => movementCount);
    db.tx.order.findFirst.mockResolvedValue({
      items: [{ productId: 'product-1', quantity: 2, snapshotCatalogV2Json: null }],
    });
    db.tx.productRecipeIngredient.findMany.mockResolvedValue([{ ingredientId: 'ingredient-1', quantity: 1 }]);
    db.tx.ingredient.findMany.mockResolvedValue([{ id: 'ingredient-1', currentCost: 3 }]);
    db.tx.ingredient.updateMany.mockImplementation(async () => {
      if (currentStock < 2) return { count: 0 };
      currentStock -= 2;
      return { count: 1 };
    });
    db.tx.stockMovement.createMany.mockImplementation(async () => {
      movementCount += 1;
      return { count: 1 };
    });

    const service = new TheoreticalStockService(db as never);
    await Promise.all([
      service.processOrderDepletion('tenant-a', 'order-1'),
      service.processOrderDepletion('tenant-a', 'order-1'),
    ]);

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.tx.stockMovement.createMany).toHaveBeenCalledTimes(1);
    expect(currentStock).toBe(8);
  });

  it('retries P2034 conflicts at most three times', async () => {
    const db = makeDb();
    const conflict = new Prisma.PrismaClientKnownRequestError('serialization conflict', {
      code: 'P2034',
      clientVersion: '5.22.0',
    });
    db.$transaction
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (transaction: typeof db.tx) => Promise<void>) => callback(db.tx));
    db.tx.stockMovement.count.mockResolvedValue(1);

    await new TheoreticalStockService(db as never).processOrderDepletion('tenant-a', 'order-1');

    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
});
