import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UnitType as SharedUnitType } from '@gestor/types';
import { Prisma, UnitType } from '@prisma/client';
import { PurchasePresentationsService } from './purchase-presentations.service';

describe('PurchasePresentationsService', () => {
  const ingredient = { id: 'ingredient-a', unit: UnitType.ml };
  const presentation = {
    id: 'presentation-a', tenantId: 'tenant-a', ingredientId: 'ingredient-a', label: 'Caixa',
    conversionFactor: new Prisma.Decimal(10000), contentQuantity: new Prisma.Decimal(10), contentUnit: UnitType.l,
    isActive: true, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };

  const makeService = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: ingredient.id }]),
      ingredient: { findFirst: jest.fn().mockResolvedValue(ingredient) },
      purchasePresentation: {
        findMany: jest.fn().mockResolvedValue([presentation]),
        findFirst: jest.fn().mockResolvedValue(presentation),
        create: jest.fn().mockResolvedValue(presentation),
        update: jest.fn().mockResolvedValue(presentation),
        delete: jest.fn(),
      },
      purchaseItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      ingredient: { findFirst: jest.fn().mockResolvedValue(ingredient) },
      purchasePresentation: {
        findMany: jest.fn().mockResolvedValue([presentation]),
        findFirst: jest.fn().mockResolvedValue(presentation),
        update: jest.fn().mockResolvedValue(presentation),
      },
    };
    return { service: new PurchasePresentationsService(prisma as never), prisma, tx };
  };

  it('derives the normalized factor from canonical commercial content', async () => {
    const { service, tx } = makeService();
    tx.purchasePresentation.create.mockImplementation(async ({ data }: { data: typeof presentation }) => ({ ...presentation, ...data }));
    await expect(service.create('tenant-a', 'ingredient-a', { label: ' Caixa com 10 litros ', contentQuantity: 10, contentUnit: SharedUnitType.L }))
      .resolves.toMatchObject({ label: 'Caixa com 10 litros', conversionFactor: 10000, status: 'CANONICAL' });
    expect(tx.purchasePresentation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ label: 'Caixa com 10 litros', contentQuantity: expect.anything(), contentUnit: UnitType.l, conversionFactor: expect.anything(), tenantId: 'tenant-a', ingredientId: 'ingredient-a' }),
    });
    expect(tx.purchasePresentation.create.mock.calls[0][0].data.conversionFactor.toString()).toBe('10000');
  });

  it('rejects cross-dimension content before persisting', async () => {
    const { service, tx } = makeService();
    await expect(service.create('tenant-a', 'ingredient-a', { label: 'Peso', contentQuantity: 1, contentUnit: SharedUnitType.KG }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.purchasePresentation.create).not.toHaveBeenCalled();
  });

  it('does not accept a partial canonicalization payload', async () => {
    const { service, tx } = makeService();
    await expect(service.update('tenant-a', 'ingredient-a', 'presentation-a', { contentQuantity: 10 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.purchasePresentation.update).not.toHaveBeenCalled();
  });

  it('canonicalizes a legacy presentation only after explicit content is supplied', async () => {
    const { service, tx } = makeService();
    tx.purchasePresentation.findFirst.mockResolvedValue({ ...presentation, contentQuantity: null, contentUnit: null, conversionFactor: new Prisma.Decimal(50) });
    await service.update('tenant-a', 'ingredient-a', 'presentation-a', { contentQuantity: 10, contentUnit: SharedUnitType.L });
    expect(tx.purchasePresentation.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ contentUnit: UnitType.l }));
    expect(tx.purchasePresentation.update.mock.calls[0][0].data.conversionFactor.toString()).toBe('10000');
  });

  it('maps legacy records without guessing their commercial content', async () => {
    const { service, prisma } = makeService();
    prisma.purchasePresentation.findMany.mockResolvedValue([{ ...presentation, contentQuantity: null, contentUnit: null, conversionFactor: new Prisma.Decimal(50) }]);
    await expect(service.findAll('tenant-a', 'ingredient-a')).resolves.toEqual([expect.objectContaining({
      contentQuantity: null, contentUnit: null, status: 'LEGACY_REQUIRES_REVIEW', conversionFactor: 50,
    })]);
  });

  it('archives and restores idempotently without deleting history', async () => {
    const { service, prisma } = makeService();
    await service.archive('tenant-a', 'ingredient-a', 'presentation-a');
    expect(prisma.purchasePresentation.update).toHaveBeenCalledWith({ where: { id: 'presentation-a' }, data: { isActive: false, archivedAt: expect.any(Date) } });
    prisma.purchasePresentation.findFirst.mockResolvedValue({ ...presentation, isActive: false, archivedAt: new Date() });
    await service.archive('tenant-a', 'ingredient-a', 'presentation-a');
    expect(prisma.purchasePresentation.update).toHaveBeenCalledTimes(1);
    await service.restore('tenant-a', 'ingredient-a', 'presentation-a');
    expect(prisma.purchasePresentation.update).toHaveBeenLastCalledWith({ where: { id: 'presentation-a' }, data: { isActive: true, archivedAt: null } });
  });

  it('hard deletes only an unused tenant-scoped presentation', async () => {
    const { service, tx } = makeService();
    await service.remove('tenant-a', 'ingredient-a', 'presentation-a');
    expect(tx.purchasePresentation.delete).toHaveBeenCalledWith({ where: { id: 'presentation-a' } });
    tx.purchaseItem.findFirst.mockResolvedValue({ id: 'purchase-item-a' });
    await expect(service.remove('tenant-a', 'ingredient-a', 'presentation-a')).rejects.toBeInstanceOf(ConflictException);
    tx.purchasePresentation.findFirst.mockResolvedValue(null);
    await expect(service.remove('tenant-a', 'ingredient-a', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
  });
});
