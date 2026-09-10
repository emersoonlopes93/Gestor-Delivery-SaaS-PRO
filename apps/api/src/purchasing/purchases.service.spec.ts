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
      where: { id: 'ingredient-a', tenantId: 'tenant-a' }, data: expect.objectContaining({ currentStock: { increment: 2 } }),
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purchaseId: 'purchase-a', purchaseItemId: 'item-a', type: 'purchase_entry', unitCost: 5 }),
    }));
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
});
