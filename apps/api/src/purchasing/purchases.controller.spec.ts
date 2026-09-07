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
      purchaseDate: '2026-09-07',
      items: [
        {
          ingredientId: 'ingredient-1',
          quantity: 1,
          unitCost: 10,
        },
      ],
    };

    await controller.create('tenant-1', dto);

    expect(purchasesService.create).toHaveBeenCalledWith('tenant-1', dto);
  });
});
