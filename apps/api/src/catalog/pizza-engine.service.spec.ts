import { BadRequestException } from '@nestjs/common';
import { PizzaEngineService } from './pizza-engine.service';

function createEngine(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  const tenantClient = {
    productCategory: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pizza-category',
        tenantId: 'tenant-a',
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest' },
      }),
    },
    optionItem: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pizza-size',
        tenantId: 'tenant-a',
        optionGroupId: 'pizza-size-group',
        name: 'Grande',
        isActive: true,
        optionGroup: { isActive: true },
      }),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([{ id: 'flavor-a' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'flavor-a',
        name: 'Calabresa',
        basePrice: 30,
        categoryId: 'pizza-category',
      }),
    },
    productOptionGroupLink: {
      findMany: jest.fn().mockResolvedValue([{ productId: 'flavor-a' }]),
    },
    productOptionItemPrice: {
      findUnique: jest.fn().mockResolvedValue({ price: 35 }),
    },
  };

  for (const [model, methods] of Object.entries(overrides)) {
    const target = tenantClient[model as keyof typeof tenantClient] as Record<string, jest.Mock>;
    Object.assign(target, methods);
  }

  return {
    engine: Reflect.construct(PizzaEngineService, [{ tenantClient }]) as PizzaEngineService,
    tenantClient,
  };
}

describe('PizzaEngineService', () => {
  it('calculates a valid pizza using the structurally linked primary size', async () => {
    const { engine } = createEngine();

    await expect(engine.calculatePrice('pizza-category', 'pizza-size', [
      { productId: 'flavor-a', fraction: 1 },
    ])).resolves.toMatchObject({
      sizeId: 'pizza-size',
      calculatedPrice: 35,
      flavors: [{ productId: 'flavor-a', priceAtSize: 35 }],
    });
  });

  it('rejects a category that is not a pizza template', async () => {
    const { engine } = createEngine({
      productCategory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'normal-category',
          tenantId: 'tenant-a',
          templateType: 'none',
          templateConfig: null,
        }),
      },
    });

    await expect(engine.calculatePrice('normal-category', 'pizza-size', [
      { productId: 'flavor-a', fraction: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a size from another tenant', async () => {
    const { engine } = createEngine({
      optionItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'foreign-size',
          tenantId: 'tenant-b',
          optionGroupId: 'foreign-group',
          name: '500 ml',
          isActive: true,
          optionGroup: { isActive: true },
        }),
      },
    });

    await expect(engine.calculatePrice('pizza-category', 'foreign-size', [
      { productId: 'flavor-a', fraction: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an active option item that is not linked as the flavor primary size group', async () => {
    const { engine } = createEngine({
      productOptionGroupLink: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await expect(engine.calculatePrice('pizza-category', 'generic-bacon-option', [
      { productId: 'flavor-a', fraction: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a flavor that is no longer active and available in the pizza category', async () => {
    const { engine } = createEngine({
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
    });

    await expect(engine.calculatePrice('pizza-category', 'pizza-size', [
      { productId: 'inactive-flavor', fraction: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fractions that do not total one hundred percent', async () => {
    const { engine } = createEngine();

    await expect(engine.calculatePrice('pizza-category', 'pizza-size', [
      { productId: 'flavor-a', fraction: 0.4 },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });
});
