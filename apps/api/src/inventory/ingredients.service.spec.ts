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
      findUnique: jest.fn(),
    },
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

describe('IngredientsService conversion factor', () => {
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
});
