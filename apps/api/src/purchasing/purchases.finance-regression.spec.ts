import { FinancialStatus, PaymentStatus, PurchaseStatus } from '@gestor/types';
import { PurchasesService } from './purchases.service';

describe('PurchasesService financial transaction regression', () => {
  it('keeps unpaid purchases as pending expenses without applying an account balance', async () => {
    const tx = {
      purchase: { create: jest.fn().mockResolvedValue({ id: 'purchase-1', items: [] }) },
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) },
      ingredient: { findFirst: jest.fn().mockResolvedValue({ currentStock: 0, currentCost: 0 }), update: jest.fn() },
      stockMovement: { create: jest.fn() },
      financialTransaction: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      purchase: { findFirst: jest.fn().mockResolvedValue({
        id: 'purchase-1', tenantId: 'tenant-a', supplierId: null, number: null, totalValue: 10,
        status: PurchaseStatus.RECEIVED, paymentStatus: PaymentStatus.PENDING, purchaseDate: new Date(),
        notes: null, createdAt: new Date(), updatedAt: new Date(), supplier: null, items: [],
      }) },
    };
    const service = new PurchasesService(prisma as never);

    await service.create('tenant-a', {
      supplierId: 'supplier-1',
      items: [{ ingredientId: 'ingredient-1', quantity: 2, unitCost: 5 }],
      paymentStatus: PaymentStatus.PENDING,
    });

    expect(tx.financialTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: FinancialStatus.PENDING }),
    }));
  });
});
