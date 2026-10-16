import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PurchaseStatus } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { PurchasesService } from './purchases.service';

describe('PurchasesService settlement and cancellation', () => {
  const detail = (paymentStatus: PaymentStatus, status = PurchaseStatus.RECEIVED) => ({
    id: 'purchase-a', tenantId: 'tenant-a', supplierId: 'supplier-a', number: null,
    totalValue: new Prisma.Decimal(100), status, paymentStatus,
    purchaseDate: new Date(), idempotencyKey: 'purchase-key-a', idempotencyFingerprint: 'fingerprint',
    cancelledAt: status === PurchaseStatus.CANCELLED ? new Date() : null,
    createdAt: new Date(), updatedAt: new Date(), supplier: null, items: [], settlement: null,
  });

  const makeHarness = () => {
    const tx = {
      $executeRaw: jest.fn(),
      purchase: {
        findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(),
      },
      purchaseSettlement: { create: jest.fn(), update: jest.fn() },
      financialAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-a' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialTransaction: {
        findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'reversal-a' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(),
      },
      ingredient: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stockMovement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      purchase: { findFirst: jest.fn() },
    };
    return { service: new PurchasesService(prisma as never), prisma, tx };
  };

  it('settles one canonical pending payable and debits one active account', async () => {
    const { service, prisma, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.PENDING), settlement: null });
    tx.financialTransaction.findMany.mockResolvedValue([{ id: 'payable-a', status: 'pending' }]);
    prisma.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.PAID), settlement: {
      id: 'settlement-a', purchaseId: 'purchase-a', accountId: 'account-a', amount: new Prisma.Decimal(100),
      financialTransactionId: 'payable-a', paidAt: new Date(), reversedAt: null, reversalTransactionId: null,
      tenantId: 'tenant-a', createdAt: new Date(), updatedAt: new Date(),
    } });
    await service.pay('tenant-a', 'purchase-a', { accountId: 'account-a' }, 'actor-a');
    expect(tx.financialTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payable-a', tenantId: 'tenant-a', status: 'pending' },
      data: expect.objectContaining({ accountId: 'account-a', status: 'paid' }),
    }));
    expect(tx.financialAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { balance: { decrement: 100 } } }));
    expect(tx.purchaseSettlement.create).toHaveBeenCalledTimes(1);
    expect(tx.purchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: 'paid' } }));
  });

  it('is idempotent when a settlement already exists', async () => {
    const { service, prisma, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.PAID), settlement: { id: 'settlement-a' } });
    prisma.purchase.findFirst.mockResolvedValue(detail(PaymentStatus.PAID));
    await service.pay('tenant-a', 'purchase-a', { accountId: 'account-a' });
    expect(tx.financialAccount.updateMany).not.toHaveBeenCalled();
    expect(tx.purchaseSettlement.create).not.toHaveBeenCalled();
  });

  it('rejects inactive and cross-tenant accounts before any debit', async () => {
    const { service, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.PENDING), settlement: null });
    tx.financialAccount.findFirst.mockResolvedValue(null);
    await expect(service.pay('tenant-a', 'purchase-a', { accountId: 'account-b' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.financialAccount.updateMany).not.toHaveBeenCalled();
  });

  it('rejects ambiguous legacy payables', async () => {
    const { service, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.PENDING), settlement: null });
    tx.financialTransaction.findMany.mockResolvedValue([{ id: 'one', status: 'pending' }, { id: 'two', status: 'pending' }]);
    await expect(service.pay('tenant-a', 'purchase-a', { accountId: 'account-a' })).rejects.toBeInstanceOf(ConflictException);
  });

  const stockMovement = {
    id: 'movement-a', tenantId: 'tenant-a', ingredientId: 'ingredient-a', purchaseId: 'purchase-a',
    purchaseItemId: 'item-a', type: 'purchase_entry', quantity: new Prisma.Decimal(10),
    unitCost: new Prisma.Decimal(4), orderId: null, reversalOfMovementId: null, userId: null, notes: null,
    createdAt: new Date(), reversal: null,
  };

  it('cancels an unpaid purchase with immutable stock reversal and voided payable', async () => {
    const { service, prisma, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({
      ...detail(PaymentStatus.PENDING), items: [{ id: 'item-a' }], stockMovements: [stockMovement], settlement: null,
    });
    tx.ingredient.findFirst.mockResolvedValue({ currentStock: new Prisma.Decimal(10) });
    tx.financialTransaction.findMany.mockResolvedValue([{ id: 'payable-a', status: 'pending' }]);
    prisma.purchase.findFirst.mockResolvedValue(detail(PaymentStatus.CANCELLED, PurchaseStatus.CANCELLED));
    await service.cancel('tenant-a', 'purchase-a');
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      type: 'purchase_reversal', reversalOfMovementId: 'movement-a', unitCost: new Prisma.Decimal(4),
    }) }));
    expect(tx.ingredient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', currentStock: { gte: new Prisma.Decimal(10) } }),
      data: { currentStock: { decrement: new Prisma.Decimal(10) } },
    }));
    expect(tx.financialTransaction.update).toHaveBeenCalledWith({ where: { id: 'payable-a' }, data: { status: 'cancelled' } });
    expect(tx.purchase.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled', paymentStatus: 'cancelled' }) }));
  });

  it('cancels a paid purchase with one compensating immutable transaction', async () => {
    const { service, prisma, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({
      ...detail(PaymentStatus.PAID), items: [{ id: 'item-a' }], stockMovements: [stockMovement],
      settlement: {
        id: 'settlement-a', accountId: 'account-a', financialTransactionId: 'expense-a',
        reversedAt: null, reversalTransactionId: null,
      },
    });
    tx.ingredient.findFirst.mockResolvedValue({ currentStock: new Prisma.Decimal(10) });
    tx.financialTransaction.findFirst.mockResolvedValue({
      id: 'expense-a', tenantId: 'tenant-a', accountId: 'account-a', status: 'paid', amount: new Prisma.Decimal(100),
    });
    prisma.purchase.findFirst.mockResolvedValue(detail(PaymentStatus.CANCELLED, PurchaseStatus.CANCELLED));
    await service.cancel('tenant-a', 'purchase-a');
    expect(tx.financialTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      type: 'income', status: 'paid', reversalOfTransactionId: 'expense-a', accountId: 'account-a', amount: new Prisma.Decimal(100),
    }) }));
    expect(tx.financialAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { balance: { increment: new Prisma.Decimal(100) } } }));
    expect(tx.purchaseSettlement.update).toHaveBeenCalledWith(expect.objectContaining({ where: { purchaseId: 'purchase-a' } }));
  });

  it('blocks legacy unlinked purchase cancellation without parsing notes', async () => {
    const { service, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.PENDING), items: [{ id: 'item-a' }], stockMovements: [], settlement: null });
    await expect(service.cancel('tenant-a', 'purchase-a')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('blocks insufficient stock before stock or financial effects', async () => {
    const { service, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({
      ...detail(PaymentStatus.PAID), items: [{ id: 'item-a' }], stockMovements: [stockMovement], settlement: { id: 'settlement-a' },
    });
    tx.ingredient.findFirst.mockResolvedValue({ currentStock: new Prisma.Decimal(2) });
    await expect(service.cancel('tenant-a', 'purchase-a')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    expect(tx.purchase.update).not.toHaveBeenCalled();
  });

  it('returns an already cancelled purchase without duplicate reversals', async () => {
    const { service, prisma, tx } = makeHarness();
    tx.purchase.findFirst.mockResolvedValue({ ...detail(PaymentStatus.CANCELLED, PurchaseStatus.CANCELLED), items: [], stockMovements: [], settlement: null });
    prisma.purchase.findFirst.mockResolvedValue(detail(PaymentStatus.CANCELLED, PurchaseStatus.CANCELLED));
    await service.cancel('tenant-a', 'purchase-a');
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
