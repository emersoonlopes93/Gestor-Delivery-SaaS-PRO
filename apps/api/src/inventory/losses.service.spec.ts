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
});
