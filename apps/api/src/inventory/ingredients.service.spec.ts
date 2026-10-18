import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { UnitType } from '@gestor/types';
import { UnitType as PrismaUnitType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IngredientsService } from './ingredients.service';

jest.mock('@gestor/types', () => ({
  UnitType: { UN: 'un', G: 'g', KG: 'kg', ML: 'ml', L: 'l' },
}), { virtual: true });

const ingredient = {
  id: 'ingredient-1',
  tenantId: 'tenant-1',
  name: 'Ingrediente de teste',
  sku: null,
  description: null,
  unit: PrismaUnitType.g,
  purchaseUnit: PrismaUnitType.kg,
  conversionFactor: 1,
  category: null,
  currentCost: 0,
  currentStock: 0,
  minStock: 0,
  isActive: true,
  createdAt: new Date('2026-09-07T00:00:00.000Z'),
  updatedAt: new Date('2026-09-07T00:00:00.000Z'),
};

async function setup() {
  const transaction = {
    ingredient: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    stockMovement: { create: jest.fn() },
    purchasePresentation: { createMany: jest.fn() },
  };
  const prisma = {
    ingredient: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  const module = await Test.createTestingModule({
    providers: [
      IngredientsService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { service: module.get(IngredientsService), prisma, transaction };
}

describe('IngredientsService purchase presentations and opening stock', () => {
  it.each([1, 10, 12, 1000, 0.5])('persists the valid conversion factor %s', async (conversionFactor) => {
    const { service, prisma, transaction } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue(null);
    transaction.ingredient.create.mockResolvedValue({ ...ingredient, conversionFactor });
    transaction.ingredient.findUnique.mockResolvedValue({ ...ingredient, conversionFactor });

    await service.create('tenant-1', {
      name: 'Ingrediente de teste',
      unit: 'g' as UnitType,
      purchaseUnit: 'kg' as UnitType,
      conversionFactor,
    });

    expect(transaction.ingredient.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ conversionFactor }),
    }));
  });

  it.each([0, -1])('rejects invalid conversion factor %s instead of silently replacing it', async (conversionFactor) => {
    const { service, prisma } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue(null);

    await expect(service.create('tenant-1', {
      name: 'Ingrediente de teste',
      unit: 'g' as UnitType,
      conversionFactor,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records opening stock in base units without a fake purchase or financial transaction', async () => {
    const { service, prisma, transaction } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue(null);
    transaction.ingredient.create.mockResolvedValue({ ...ingredient, unit: PrismaUnitType.un, conversionFactor: 50 });
    transaction.ingredient.findUnique.mockResolvedValue({ ...ingredient, unit: PrismaUnitType.un, currentStock: 50, currentCost: 0.2598 });

    await service.create('tenant-1', {
      name: 'Copo 330 ml', unit: 'un' as UnitType, conversionFactor: 50,
      initialPurchase: { quantity: 50, unit: 'un' as UnitType, totalCost: 12.99 },
    });

    const updateCall = transaction.ingredient.update.mock.calls[0][0];
    expect(updateCall.data.currentStock).toBe(50);
    expect(updateCall.data.currentCost).toBeCloseTo(0.2598, 8);
    const movementCall = transaction.stockMovement.create.mock.calls[0][0];
    expect(movementCall.data).toEqual(expect.objectContaining({ type: 'in', quantity: 50 }));
    expect(movementCall.data.unitCost).toBeCloseTo(0.2598, 8);
  });

  it('persists multiple purchase presentations with the ingredient in one transaction', async () => {
    const { service, prisma, transaction } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue(null);
    transaction.ingredient.create.mockResolvedValue(ingredient);
    transaction.ingredient.findUnique.mockResolvedValue(ingredient);

    await service.create('tenant-1', {
      name: 'Copo', unit: 'un' as UnitType,
      purchasePresentations: [
        { label: 'Pacote com 50', conversionFactor: 50 },
        { label: 'Caixa com 100', conversionFactor: 100 },
      ],
    });

    expect(transaction.purchasePresentation.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 'tenant-1', ingredientId: 'ingredient-1', label: 'Pacote com 50', conversionFactor: 50 },
        { tenantId: 'tenant-1', ingredientId: 'ingredient-1', label: 'Caixa com 100', conversionFactor: 100 },
      ],
    });
  });

  it.each([
    [[{ label: '', conversionFactor: 50 }]],
    [[{ label: 'Pacote', conversionFactor: 0 }]],
    [[{ label: 'Pacote', conversionFactor: -1 }]],
    [[{ label: 'Pacote', conversionFactor: 50 }, { label: ' pacote ', conversionFactor: 100 }]],
  ])('rejects invalid or duplicate purchase presentations before opening a transaction', async (purchasePresentations) => {
    const { service, prisma } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue(null);

    await expect(service.create('tenant-1', {
      name: 'Ingrediente de teste', unit: 'un' as UnitType, purchasePresentations,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not leave a completed transaction when presentation persistence fails', async () => {
    const { service, prisma, transaction } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue(null);
    transaction.ingredient.create.mockResolvedValue(ingredient);
    transaction.purchasePresentation.createMany.mockRejectedValue(new Error('database write failed'));

    await expect(service.create('tenant-1', {
      name: 'Ingrediente de teste', unit: 'un' as UnitType,
      purchasePresentations: [{ label: 'Pacote', conversionFactor: 50 }],
      initialPurchase: { quantity: 50, totalCost: 12.99 },
    })).rejects.toThrow('database write failed');

    expect(transaction.stockMovement.create).not.toHaveBeenCalled();
    expect(transaction.ingredient.update).not.toHaveBeenCalled();
  });

  it('preserves legacy purchase fields when an unrelated edit is saved', async () => {
    const { service, prisma } = await setup();
    prisma.ingredient.findFirst.mockResolvedValue({ ...ingredient, conversionFactor: 1000 });
    prisma.ingredient.update.mockResolvedValue({ ...ingredient, name: 'Novo nome', conversionFactor: 1000 });

    await service.update('tenant-1', 'ingredient-1', { name: 'Novo nome' });

    expect(prisma.ingredient.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purchaseUnit: undefined, conversionFactor: undefined }),
    }));
  });
});
