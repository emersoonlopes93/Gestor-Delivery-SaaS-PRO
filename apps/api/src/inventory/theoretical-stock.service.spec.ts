import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TheoreticalStockService } from './theoretical-stock.service';

describe('TheoreticalStockService processOrderDepletion', () => {
  const makeDb = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      stockMovement: {
        count: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
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

describe('TheoreticalStockService reverseOrderDepletion', () => {
  const makeDb = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      stockMovement: {
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      ingredient: { updateMany: jest.fn() },
      order: { findFirst: jest.fn() },
      productRecipeIngredient: { findMany: jest.fn() },
    };

    return {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
      tx,
    };
  };

  const originalMovement = (overrides: Partial<{
    id: string;
    ingredientId: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal | null;
    orderId: string | null;
    reversal: { id: string } | null;
  }> = {}) => ({
    id: 'depletion-1',
    ingredientId: 'ingredient-a',
    quantity: new Prisma.Decimal('2.5000'),
    unitCost: new Prisma.Decimal('2.0000'),
    orderId: 'order-1',
    reversal: null,
    ...overrides,
  });

  it('preserves the original and creates one linked compensating movement with its historical cost', async () => {
    const db = makeDb();
    const original = originalMovement();
    db.tx.stockMovement.findMany.mockResolvedValue([original]);
    db.tx.stockMovement.create.mockResolvedValue({ id: 'reversal-1' });
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 1 });

    await new TheoreticalStockService(db as never).reverseOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.stockMovement.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        orderId: 'order-1',
        type: 'theoretical_depletion',
      },
      include: { reversal: true },
    });
    expect(db.tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        ingredientId: 'ingredient-a',
        type: 'theoretical_reversal',
        quantity: original.quantity,
        unitCost: original.unitCost,
        orderId: 'order-1',
        reversalOfMovementId: 'depletion-1',
      }),
    });
    expect(db.tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-a', tenantId: 'tenant-a' },
      data: { currentStock: { increment: original.quantity } },
    });
    expect(db.tx.stockMovement.delete).not.toHaveBeenCalled();
  });

  it('is idempotent when the original already has its canonical reversal', async () => {
    const db = makeDb();
    db.tx.stockMovement.findMany.mockResolvedValue([
      originalMovement({ reversal: { id: 'reversal-1' } }),
    ]);

    await new TheoreticalStockService(db as never).reverseOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.stockMovement.create).not.toHaveBeenCalled();
    expect(db.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('uses persisted movements only, ignoring the current recipe and ingredient cost', async () => {
    const db = makeDb();
    const original = originalMovement({ unitCost: new Prisma.Decimal('2.0000') });
    db.tx.stockMovement.findMany.mockResolvedValue([original]);
    db.tx.stockMovement.create.mockResolvedValue({ id: 'reversal-1' });
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 1 });

    await new TheoreticalStockService(db as never).reverseOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.order.findFirst).not.toHaveBeenCalled();
    expect(db.tx.productRecipeIngredient.findMany).not.toHaveBeenCalled();
    expect(db.tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'ingredient-a',
        quantity: new Prisma.Decimal('2.5000'),
        unitCost: new Prisma.Decimal('2.0000'),
      }),
    });
  });

  it('reverses every persisted ingredient of a multi-item order', async () => {
    const db = makeDb();
    db.tx.stockMovement.findMany.mockResolvedValue([
      originalMovement(),
      originalMovement({
        id: 'depletion-2', ingredientId: 'ingredient-b', quantity: new Prisma.Decimal('1.2500'), unitCost: new Prisma.Decimal('4.0000'),
      }),
    ]);
    db.tx.stockMovement.create.mockResolvedValue({ id: 'reversal' });
    db.tx.ingredient.updateMany.mockResolvedValue({ count: 1 });

    await new TheoreticalStockService(db as never).reverseOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(db.tx.ingredient.updateMany).toHaveBeenCalledTimes(2);
    expect(db.tx.stockMovement.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        ingredientId: 'ingredient-b',
        reversalOfMovementId: 'depletion-2',
        quantity: new Prisma.Decimal('1.2500'),
        unitCost: new Prisma.Decimal('4.0000'),
      }),
    });
  });

  it('does not cross tenant scope when there is no depletion for the requested tenant', async () => {
    const db = makeDb();
    db.tx.stockMovement.findMany.mockResolvedValue([]);

    await new TheoreticalStockService(db as never).reverseOrderDepletion('tenant-a', 'order-1');

    expect(db.tx.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', orderId: 'order-1' }),
    }));
    expect(db.tx.stockMovement.create).not.toHaveBeenCalled();
    expect(db.tx.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('serializes concurrent reversals so stock is restored once per original', async () => {
    const db = makeDb();
    let reversed = false;
    let currentStock = 7.5;
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
    db.tx.stockMovement.findMany.mockImplementation(async () => [
      originalMovement({ reversal: reversed ? { id: 'reversal-1' } : null }),
    ]);
    db.tx.stockMovement.create.mockImplementation(async () => {
      reversed = true;
      return { id: 'reversal-1' };
    });
    db.tx.ingredient.updateMany.mockImplementation(async () => {
      currentStock += 2.5;
      return { count: 1 };
    });

    const service = new TheoreticalStockService(db as never);
    await Promise.all([
      service.reverseOrderDepletion('tenant-a', 'order-1'),
      service.reverseOrderDepletion('tenant-a', 'order-1'),
    ]);

    expect(db.tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(db.tx.ingredient.updateMany).toHaveBeenCalledTimes(1);
    expect(currentStock).toBe(10);
  });
});
