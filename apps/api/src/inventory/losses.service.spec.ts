import { NotFoundException } from '@nestjs/common';
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
      where: { id: 'ingredient-1', tenantId: 'tenant-a' },
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
});
