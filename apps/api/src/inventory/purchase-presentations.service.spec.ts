import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PurchasePresentationsService } from './purchase-presentations.service';

describe('PurchasePresentationsService', () => {
  const presentation = {
    id: 'presentation-a', tenantId: 'tenant-a', ingredientId: 'ingredient-a', label: 'Pacote com 50 un',
    conversionFactor: new Prisma.Decimal(50), isActive: true, createdAt: new Date(), updatedAt: new Date(),
  };

  const makeService = () => {
    const prisma = {
      ingredient: { findFirst: jest.fn().mockResolvedValue({ id: 'ingredient-a' }) },
      purchasePresentation: {
        findMany: jest.fn().mockResolvedValue([presentation]),
        findFirst: jest.fn().mockResolvedValue(presentation),
        create: jest.fn().mockResolvedValue(presentation),
        update: jest.fn().mockResolvedValue(presentation),
      },
    };
    return { service: new PurchasePresentationsService(prisma as never), prisma };
  };

  it('creates a tenant-scoped presentation with a positive conversion factor', async () => {
    const { service, prisma } = makeService();
    await expect(service.create('tenant-a', 'ingredient-a', { label: ' Pacote com 50 un ', conversionFactor: 50 }))
      .resolves.toMatchObject({ label: 'Pacote com 50 un', conversionFactor: 50 });
    expect(prisma.purchasePresentation.create).toHaveBeenCalledWith({
      data: {
        label: 'Pacote com 50 un', conversionFactor: 50,
        tenantId: 'tenant-a',
        ingredientId: 'ingredient-a',
      },
    });
  });

  it.each([0, -1])('rejects an invalid conversion factor %p', async (conversionFactor) => {
    const { service, prisma } = makeService();
    await expect(service.create('tenant-a', 'ingredient-a', { label: 'Pacote', conversionFactor })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.purchasePresentation.create).not.toHaveBeenCalled();
  });

  it('does not create or update presentations for an ingredient outside the tenant', async () => {
    const { service, prisma } = makeService();
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(service.create('tenant-a', 'ingredient-other', { label: 'Pacote', conversionFactor: 50 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.purchasePresentation.create).not.toHaveBeenCalled();
  });
});
