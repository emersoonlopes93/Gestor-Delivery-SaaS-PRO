import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PurchaseStatus } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { PurchasesService } from './purchases.service';

describe('PurchasesService create lifecycle', () => {
  const detail = (paymentStatus = PaymentStatus.PENDING) => ({
    id: 'purchase-a', tenantId: 'tenant-a', supplierId: 'supplier-a', number: null,
    totalValue: new Prisma.Decimal(10), status: PurchaseStatus.RECEIVED, paymentStatus,
    purchaseDate: new Date('2026-09-07T12:00:00.000Z'), idempotencyKey: 'purchase-key-a',
    idempotencyFingerprint: 'fingerprint', cancelledAt: null, createdAt: new Date(), updatedAt: new Date(),
    supplier: null, items: [], settlement: null,
  });

  const makeHarness = (status = PaymentStatus.PENDING) => {
    const tx = {
      purchase: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'purchase-a' }),
      },
      purchaseItem: { create: jest.fn().mockResolvedValue({ id: 'item-a' }) },
      purchasePresentation: { findFirst: jest.fn().mockResolvedValue({ id: 'presentation-a', label: 'Pacote com 50 un', conversionFactor: new Prisma.Decimal(50) }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-a' }) },
      ingredient: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ingredient-a', currentStock: new Prisma.Decimal(3), currentCost: new Prisma.Decimal(4) }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: { create: jest.fn() },
      financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'transaction-a' }) },
      financialAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-a' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      purchaseSettlement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      purchase: {
        findFirst: jest.fn().mockResolvedValue(detail(status)),
        findUnique: jest.fn(),
      },
    };
    return { service: new PurchasesService(prisma as never), prisma, tx };
  };

  const createInput = (paymentStatus = PaymentStatus.PENDING) => ({
    supplierId: 'supplier-a', purchaseDate: '2026-09-07', idempotencyKey: 'purchase-key-a',
    items: [{ ingredientId: 'ingredient-a', quantity: 2, unitCost: 5 }], paymentStatus,
    ...(paymentStatus === PaymentStatus.PAID ? { accountId: 'account-a' } : {}),
  });

  it('receives stock once, creates a structured movement and rereads through the transaction result', async () => {
    const { service, tx, prisma } = makeHarness();
    await service.create('tenant-a', createInput());
    expect(tx.purchase.create.mock.calls[0][0].data.purchaseDate.toISOString()).toBe('2026-09-07T12:00:00.000Z');
    expect(tx.ingredient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ingredient-a', tenantId: 'tenant-a' }, data: expect.objectContaining({ currentStock: { increment: expect.anything() } }),
    }));
    expect(tx.ingredient.updateMany.mock.calls[0][0].data.currentStock.increment.toString()).toBe('2');
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purchaseId: 'purchase-a', purchaseItemId: 'item-a', type: 'purchase_entry', unitCost: expect.anything() }),
    }));
    expect(tx.stockMovement.create.mock.calls[0][0].data.unitCost.toString()).toBe('5');
    expect(prisma.purchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'purchase-a', tenantId: 'tenant-a' } }));
  });

  it.each(['', '2026-02-30', 'not-a-date'])('rejects invalid purchaseDate %p', async (purchaseDate) => {
    const { service, prisma } = makeHarness();
    await expect(service.create('tenant-a', { ...createInput(), purchaseDate })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps ISO timestamps compatible', async () => {
    const { service, tx } = makeHarness();
    await service.create('tenant-a', { ...createInput(), purchaseDate: '2026-09-07T15:30:00.000Z' });
    expect(tx.purchase.create.mock.calls[0][0].data.purchaseDate.toISOString()).toBe('2026-09-07T15:30:00.000Z');
  });

  it('creates a pending payable without changing an account balance', async () => {
    const { service, tx } = makeHarness();
    await service.create('tenant-a', createInput());
    expect(tx.financialTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'pending', accountId: null }) }));
    expect(tx.financialAccount.updateMany).not.toHaveBeenCalled();
  });

  it('atomically creates paid finance state and debits an active tenant account', async () => {
    const { service, tx } = makeHarness(PaymentStatus.PAID);
    await service.create('tenant-a', createInput(PaymentStatus.PAID));
    expect(tx.financialAccount.findFirst).toHaveBeenCalledWith({ where: { id: 'account-a', tenantId: 'tenant-a', active: true }, select: { id: true } });
    expect(tx.financialTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'paid', accountId: 'account-a' }) }));
    expect(tx.financialAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'account-a', tenantId: 'tenant-a', active: true }, data: { balance: { decrement: 10 } } }));
    expect(tx.purchaseSettlement.create).toHaveBeenCalledTimes(1);
  });

  it('rejects paid creation without an account', async () => {
    const { service } = makeHarness(PaymentStatus.PAID);
    await expect(service.create('tenant-a', { ...createInput(PaymentStatus.PAID), accountId: undefined })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive or cross-tenant accounts', async () => {
    const { service, tx } = makeHarness(PaymentStatus.PAID);
    tx.financialAccount.findFirst.mockResolvedValue(null);
    await expect(service.create('tenant-a', createInput(PaymentStatus.PAID))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the existing purchase for the same key and fingerprint, and conflicts on another payload', async () => {
    const same = makeHarness();
    await same.service.create('tenant-a', createInput());
    const fingerprint = same.tx.purchase.create.mock.calls[0][0].data.idempotencyFingerprint;
    same.tx.purchase.findUnique.mockResolvedValue({ id: 'purchase-a', idempotencyFingerprint: fingerprint });
    await same.service.create('tenant-a', createInput());
    expect(same.tx.purchase.create).toHaveBeenCalledTimes(1);
    expect(same.tx.stockMovement.create).toHaveBeenCalledTimes(1);

    same.tx.purchase.findUnique.mockResolvedValue({ id: 'purchase-a', idempotencyFingerprint: 'different' });
    await expect(same.service.create('tenant-a', createInput())).rejects.toBeInstanceOf(ConflictException);
  });

  it('tenant-scopes supplier and ingredient validation', async () => {
    const supplier = makeHarness();
    supplier.tx.supplier.findFirst.mockResolvedValue(null);
    await expect(supplier.service.create('tenant-a', createInput())).rejects.toBeInstanceOf(NotFoundException);
    expect(supplier.tx.supplier.findFirst).toHaveBeenCalledWith({ where: { id: 'supplier-a', tenantId: 'tenant-a' }, select: { id: true } });

    const ingredient = makeHarness();
    ingredient.tx.ingredient.findFirst.mockResolvedValue(null);
    await expect(ingredient.service.create('tenant-a', createInput())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives base quantity, base cost and historical snapshots from the persisted presentation', async () => {
    const { service, tx } = makeHarness();
    await service.create('tenant-a', {
      ...createInput(),
      items: [{ ingredientId: 'ingredient-a', purchasePresentationId: 'presentation-a', purchaseQuantity: 1, lineTotal: 12.99 }],
    });

    expect(tx.purchasePresentation.findFirst).toHaveBeenCalledWith({
      where: { id: 'presentation-a', tenantId: 'tenant-a', ingredientId: 'ingredient-a', isActive: true },
      select: { id: true, label: true, conversionFactor: true },
    });
    expect(tx.purchaseItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      quantity: expect.objectContaining({ toString: expect.any(Function) }),
      unitCost: expect.objectContaining({ toString: expect.any(Function) }),
      totalCost: expect.objectContaining({ toString: expect.any(Function) }),
      purchasePresentationId: 'presentation-a', purchaseQuantity: expect.anything(),
      purchasePresentationLabel: 'Pacote com 50 un', conversionFactorSnapshot: expect.anything(),
    }) }));
    const itemData = tx.purchaseItem.create.mock.calls[0][0].data;
    expect(itemData.quantity.toString()).toBe('50');
    expect(itemData.unitCost.toString()).toBe('0.2598');
    expect(itemData.totalCost.toString()).toBe('12.99');
    expect(itemData.conversionFactorSnapshot.toString()).toBe('50');
    expect(tx.ingredient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentStock: { increment: expect.anything() } }),
    }));
    expect(tx.ingredient.updateMany.mock.calls[0][0].data.currentStock.increment.toString()).toBe('50');
    expect(tx.financialTransaction.create.mock.calls[0][0].data.amount.toString()).toBe('12.99');
  });

  it('rejects a presentation that is inactive, cross-tenant, or belongs to another ingredient', async () => {
    const { service, tx } = makeHarness();
    tx.purchasePresentation.findFirst.mockResolvedValue(null);
    await expect(service.create('tenant-a', {
      ...createInput(),
      items: [{ ingredientId: 'ingredient-a', purchasePresentationId: 'presentation-a', purchaseQuantity: 1, lineTotal: 12.99 }],
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.purchaseItem.create).not.toHaveBeenCalled();
  });

  it('uses the same server-side factor for multiple packages and keeps direct base-unit purchases compatible', async () => {
    const packaged = makeHarness();
    await packaged.service.create('tenant-a', {
      ...createInput(),
      items: [{ ingredientId: 'ingredient-a', purchasePresentationId: 'presentation-a', purchaseQuantity: 4, lineTotal: 47.6 }],
    });
    const packagedData = packaged.tx.purchaseItem.create.mock.calls[0][0].data;
    expect(packagedData.quantity.toString()).toBe('200');
    expect(packagedData.unitCost.toString()).toBe('0.238');
    expect(packagedData.totalCost.toString()).toBe('47.6');

    const direct = makeHarness();
    await direct.service.create('tenant-a', {
      ...createInput(),
      items: [{ ingredientId: 'ingredient-a', purchaseQuantity: 2, lineTotal: 10 }],
    });
    const directData = direct.tx.purchaseItem.create.mock.calls[0][0].data;
    expect(directData.quantity.toString()).toBe('2');
    expect(directData.unitCost.toString()).toBe('5');
    expect(directData.conversionFactorSnapshot.toString()).toBe('1');
    expect(directData.purchasePresentationId).toBeUndefined();
  });
});
