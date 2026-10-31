import { BadRequestException } from '@nestjs/common';
import type { CreateOrderItemDTO } from '@gestor/types';
import { CheckoutValidatorService } from './checkout-validator.service';

type ProductLineValidator = {
  validateProductLine(
    tenantId: string,
    item: CreateOrderItemDTO,
    checkSellableOnline?: boolean,
    channel?: 'storefront_delivery' | 'storefront_pickup' | 'pos',
  ): Promise<unknown>;
};

describe('CheckoutValidatorService pizza composition guard', () => {
  it('rejects pizzaComposition for a normal configurable product before invoking Pizza Engine', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'acai',
          name: 'Copo de Açaí',
          basePrice: 15,
          isActive: true,
          isAvailable: true,
          sellableOnline: true,
          type: 'configurable',
          optionItemPrices: [],
          optionGroupLinks: [],
          category: { id: 'normal-category', templateType: 'none', templateConfig: null },
        }),
      },
    };
    const availability = { assertCanSell: jest.fn() };
    const pizzaEngine = { calculatePrice: jest.fn() };
    const service: CheckoutValidatorService = Reflect.construct(CheckoutValidatorService, [
      prisma,
      {},
      {},
      {},
      availability,
      pizzaEngine,
      {},
      {},
    ]);
    const validateProductLine: ProductLineValidator['validateProductLine'] = Reflect.get(service, 'validateProductLine');
    const item: CreateOrderItemDTO = {
      lineType: 'product',
      productId: 'acai',
      quantity: 1,
      pizzaComposition: {
        sizeId: 'size-500',
        flavors: [{ productId: 'acai', fraction: 1 }],
      },
    };

    await expect(validateProductLine.call(service, 'tenant-a', item)).rejects.toBeInstanceOf(BadRequestException);
    expect(pizzaEngine.calculatePrice).not.toHaveBeenCalled();
  });
});
