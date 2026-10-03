import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockMovementType } from '@gestor/types';
import { LossesService } from './losses.service';

describe('LossesService', () => {
  const makeDb = () => ({
    ingredient: { findFirst: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    $transaction: jest.fn(),
  });

  it('lists only tenant-scoped waste movements with the cost snapshot', async () => {
    const db = makeDb();
    db.stockMovement.findMany.mockResolvedValue([{
      id: 'loss-1',
      quantity: 2.5,
      unitCost: 4,
      notes: 'Perda: expiration',
      createdAt: new Date('2026-09-07T12:00:00.000Z'),
      ingredient: { name: 'Tomate', unit: 'kg', currentCost: 5 },
    }]);

    await expect(new LossesService(db as never).findAll('tenant-a')).resolves.toEqual([{
      id: 'loss-1',
      ingredient: { name: 'Tomate', unit: 'kg' },
      quantity: 2.5,
      reason: 'expiration',
      createdAt: new Date('2026-09-07T12:00:00.000Z'),
      costImpact: 10,
    }]);
    expect(db.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', type: StockMovementType.WASTE },
      take: 100,
    }));
  });

  it('does not create a loss for an ingredient outside the tenant', async () => {
    const db = makeDb();
    db.ingredient.findFirst.mockResolvedValue(null);

    await expect(new LossesService(db as never).create('tenant-a', 'ingredient-b', 1, 'other'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN])('rejects invalid loss quantity %s before any write', async (quantity) => {
    const db = makeDb();

    await expect(new LossesService(db as never).create('tenant-a', 'ingredient-1', quantity, 'other'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.ingredient.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('records a tenant-scoped waste movement and decrements the same ingredient', async () => {
    const db = makeDb();
    const tx = {
      ingredient: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: 'loss-1' }) },
    };
    db.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1', currentCost: 4 });
    db.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(new LossesService(db as never).create('tenant-a', 'ingredient-1', 2.5, 'expiration'))
      .resolves.toEqual({ id: 'loss-1' });
    expect(tx.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ingredient-1', tenantId: 'tenant-a', currentStock: { gte: 2.5 } },
      data: { currentStock: { decrement: 2.5 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        ingredientId: 'ingredient-1',
        type: StockMovementType.WASTE,
        quantity: 2.5,
        unitCost: 4,
        notes: 'Perda: expiration',
      }),
    });
  });

  it('accepts a loss equal to the available stock', async () => {
    const db = makeDb();
    const tx = {
      ingredient: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: 'loss-1' }) },
    };
    db.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1', currentCost: 4 });
    db.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(new LossesService(db as never).create('tenant-a', 'ingredient-1', 10, 'other'))
      .resolves.toEqual({ id: 'loss-1' });
    expect(tx.ingredient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ currentStock: { gte: 10 } }),
    }));
  });

  it('rejects a loss when the conditional stock decrement finds insufficient stock', async () => {
    const db = makeDb();
    const tx = {
      ingredient: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      stockMovement: { create: jest.fn() },
    };
    db.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1', currentCost: 4 });
    db.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(new LossesService(db as never).create('tenant-a', 'ingredient-1', 11, 'other'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rolls back the stock decrement when waste movement creation fails', async () => {
    const db = makeDb();
    let stock = 10;
    const movements: Array<{ quantity: number }> = [];
    const tx = {
      ingredient: {
        updateMany: jest.fn(async ({ where, data }: {
          where: { currentStock: { gte: number } };
          data: { currentStock: { decrement: number } };
        }) => {
          if (stock < where.currentStock.gte) return { count: 0 };
          stock -= data.currentStock.decrement;
          return { count: 1 };
        }),
      },
      stockMovement: {
        create: jest.fn(async () => {
          throw new Error('movement write failed');
        }),
      },
    };
    db.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1', currentCost: 4 });
    db.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const stockBefore = stock;
      const movementsBefore = movements.length;
      try {
        return await callback(tx);
      } catch (error) {
        stock = stockBefore;
        movements.splice(movementsBefore);
        throw error;
      }
    });

    await expect(new LossesService(db as never).create('tenant-a', 'ingredient-1', 7, 'other'))
      .rejects.toThrow('movement write failed');
    expect(stock).toBe(10);
    expect(movements).toHaveLength(0);
  });

  it('prevents concurrent losses from oversubscribing the same ingredient', async () => {
    const db = makeDb();
    let stock = 10;
    const movements: Array<{ quantity: number }> = [];
    const tx = {
      ingredient: {
        updateMany: jest.fn(async ({ where, data }: {
          where: { currentStock: { gte: number } };
          data: { currentStock: { decrement: number } };
        }) => {
          if (stock < where.currentStock.gte) return { count: 0 };
          stock -= data.currentStock.decrement;
          return { count: 1 };
        }),
      },
      stockMovement: {
        create: jest.fn(async ({ data }: { data: { quantity: number } }) => {
          movements.push({ quantity: data.quantity });
          return { id: `loss-${movements.length}` };
        }),
      },
    };
    db.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-1', currentCost: 4 });
    db.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    const service = new LossesService(db as never);

    const results = await Promise.allSettled([
      service.create('tenant-a', 'ingredient-1', 7, 'other'),
      service.create('tenant-a', 'ingredient-1', 7, 'other'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(stock).toBe(3);
    expect(stock).toBeGreaterThanOrEqual(0);
    expect(movements).toEqual([{ quantity: 7 }]);
  });
});
