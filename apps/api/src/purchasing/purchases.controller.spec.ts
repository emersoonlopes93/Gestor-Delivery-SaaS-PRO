import { CreatePurchaseDTO } from '@gestor/types';
import { PurchasesController } from './purchases.controller';

describe('PurchasesController', () => {
  it('forwards the browser date-only payload to the purchasing service', async () => {
    const purchasesService = {
      create: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
    };
    const controller = Reflect.construct(PurchasesController, [purchasesService]);
    const dto: CreatePurchaseDTO = {
      supplierId: 'supplier-1',
      idempotencyKey: 'purchase-key-1',
      purchaseDate: '2026-09-07',
      items: [
        {
          ingredientId: 'ingredient-1',
          quantity: 1,
          unitCost: 10,
        },
      ],
    };

    await controller.create('tenant-1', dto, 'actor-1');

    expect(purchasesService.create).toHaveBeenCalledWith('tenant-1', dto, 'actor-1');
  });

  it('forwards pay and cancel commands with the tenant actor', async () => {
    const purchasesService = {
      pay: jest.fn(),
      cancel: jest.fn(),
    };
    const controller = Reflect.construct(PurchasesController, [purchasesService]);
    await controller.pay('tenant-1', 'purchase-1', { accountId: 'account-1' }, 'actor-1');
    await controller.cancel('tenant-1', 'purchase-1', 'actor-1');
    expect(purchasesService.pay).toHaveBeenCalledWith('tenant-1', 'purchase-1', { accountId: 'account-1' }, 'actor-1');
    expect(purchasesService.cancel).toHaveBeenCalledWith('tenant-1', 'purchase-1', 'actor-1');
  });
});
