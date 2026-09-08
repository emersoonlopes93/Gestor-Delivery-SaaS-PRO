import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PurchaseStatus } from '@gestor/types';
import { PurchasesService } from './purchases.service';

describe('PurchasesService purchase date contract', () => {
  const makeHarness = () => {
    const tx = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-a' }) },
      purchase: {
        create: jest.fn().mockImplementation(async ({ data }: { data: { paymentStatus: PaymentStatus } }) => ({
          id: 'purchase-a', items: [], paymentStatus: data.paymentStatus,
        })),
        findFirst: jest.fn().mockResolvedValue({
          id: 'purchase-a', tenantId: 'tenant-a', supplierId: 'supplier-a', number: null, totalValue: 10,
          status: PurchaseStatus.RECEIVED, paymentStatus: PaymentStatus.PAID,
          purchaseDate: new Date('2026-09-07T12:00:00.000Z'), notes: null,
          createdAt: new Date(), updatedAt: new Date(), supplier: null, items: [],
        }),
      },
      ingredient: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ingredient-a', currentStock: 3, currentCost: 4 }),
        update: jest.fn(),
      },
      stockMovement: { create: jest.fn() },
      financialTransaction: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      purchase: { findFirst: jest.fn().mockResolvedValue({
        id: 'purchase-a', tenantId: 'tenant-a', supplierId: 'supplier-a', number: null, totalValue: 10,
        status: PurchaseStatus.RECEIVED, paymentStatus: PaymentStatus.PAID,
        purchaseDate: new Date('2026-09-07T12:00:00.000Z'), notes: null,
        createdAt: new Date(), updatedAt: new Date(), supplier: null, items: [],
      }) },
    };
    return { service: new PurchasesService(prisma as never), prisma, tx };
  };

  const createInput = () => ({
    supplierId: 'supplier-a',
    purchaseDate: '2026-09-07',
    items: [{ ingredientId: 'ingredient-a', quantity: 2, unitCost: 5 }],
    paymentStatus: PaymentStatus.PAID,
  });

  it('accepts the date-only browser contract at a timezone-stable business-day anchor', async () => {
    const { service, prisma, tx } = makeHarness();

    await service.create('tenant-a', createInput());

    const createData = tx.purchase.create.mock.calls[0][0].data;
    expect(createData.purchaseDate).toBeInstanceOf(Date);
    expect(createData.purchaseDate.toISOString()).toBe('2026-09-07T12:00:00.000Z');
    expect(createData.purchaseDate.getUTCDate()).toBe(7);
    expect(tx.ingredient.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ingredient-a' },
      data: expect.objectContaining({ currentStock: { increment: 2 } }),
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    expect(tx.purchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'purchase-a', tenantId: 'tenant-a' },
    }));
    expect(prisma.purchase.findFirst).not.toHaveBeenCalled();
  });

  it.each(['', '2026-02-30', 'not-a-date'])('rejects invalid purchaseDate %p as a domain validation error', async (purchaseDate) => {
    const { service, prisma } = makeHarness();

    await expect(service.create('tenant-a', { ...createInput(), purchaseDate })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps a valid ISO timestamp compatible with the existing API contract', async () => {
    const { service, tx } = makeHarness();

    await service.create('tenant-a', { ...createInput(), purchaseDate: '2026-09-07T15:30:00.000Z' });

    expect(tx.purchase.create.mock.calls[0][0].data.purchaseDate.toISOString()).toBe('2026-09-07T15:30:00.000Z');
  });

  it('keeps unpaid purchase finance behavior unchanged', async () => {
    const { service, tx } = makeHarness();

    await service.create('tenant-a', { ...createInput(), paymentStatus: PaymentStatus.PENDING });

    expect(tx.financialTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'pending', referenceType: 'purchase' }),
    }));
  });

  it('does not allow a tenant to create a purchase with another tenant supplier or ingredient', async () => {
    const supplierHarness = makeHarness();
    supplierHarness.tx.supplier.findFirst.mockResolvedValue(null);

    await expect(supplierHarness.service.create('tenant-a', createInput())).rejects.toBeInstanceOf(NotFoundException);
    expect(supplierHarness.tx.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-a', tenantId: 'tenant-a' },
      select: { id: true },
    });

    const ingredientHarness = makeHarness();
    ingredientHarness.tx.ingredient.findFirst.mockResolvedValue(null);
    await expect(ingredientHarness.service.create('tenant-a', createInput())).rejects.toBeInstanceOf(NotFoundException);
    expect(ingredientHarness.tx.ingredient.findFirst).toHaveBeenCalledWith({
      where: { id: 'ingredient-a', tenantId: 'tenant-a' },
    });
  });
});
