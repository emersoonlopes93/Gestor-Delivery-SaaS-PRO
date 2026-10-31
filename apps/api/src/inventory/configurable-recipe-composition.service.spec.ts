import { Prisma } from '@prisma/client';
import { ConfigurableRecipeCompositionService } from './configurable-recipe-composition.service';

const decimal = (value: string) => new Prisma.Decimal(value);

function createService() {
  const prisma = {
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-a', category: { id: 'category-a', templateType: 'none' } }) },
    productOptionGroupLink: { findFirst: jest.fn().mockResolvedValue({ id: 'link-a' }) },
    optionItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item-a', allowQuantity: true }) },
    productOptionItemPrice: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const expansion = {
    expandProductRecipeToIngredients: jest.fn().mockResolvedValue(new Map([['sugar', decimal('10')]])),
    expandProductOptionItemRecipeToIngredients: jest.fn().mockImplementation(async (_tenant: string, _product: string, item: string, qty: Prisma.Decimal) =>
      new Map([[item === 'item-a' ? 'milk' : 'box', decimal('2').mul(qty)]])),
    calculateExpandedIngredientCost: jest.fn(),
  };
  const pizza = { calculatePrice: jest.fn().mockResolvedValue({}) };
  return { service: new ConfigurableRecipeCompositionService(prisma as never, expansion as never, pizza as never), expansion, pizza, prisma };
}

describe('ConfigurableRecipeCompositionService', () => {
  it('adds fixed and selected contextual recipes and applies option and product quantities with Decimal arithmetic', async () => {
    const { service } = createService();
    const result = await service.resolveProductComposition('tenant-a', {
      productId: 'product-a', productQuantity: '2',
      selections: [{ optionGroupId: 'group-a', items: [{ optionItemId: 'item-a', qty: 2 }] }],
    });
    expect(result.get('sugar')?.toString()).toBe('20');
    expect(result.get('milk')?.toString()).toBe('8');
  });

  it('allows a valid option with no contextual recipe as zero contribution', async () => {
    const { service, expansion } = createService();
    expansion.expandProductOptionItemRecipeToIngredients.mockResolvedValueOnce(new Map());
    const result = await service.resolveProductComposition('tenant-a', {
      productId: 'product-a', productQuantity: 1,
      selections: [{ optionGroupId: 'group-a', items: [{ optionItemId: 'item-a' }] }],
    });
    expect(result.get('sugar')?.toString()).toBe('10');
    expect(result.has('milk')).toBe(false);
  });

  it('does not double count the pizza root and weights flavor recipes by fractions', async () => {
    const { service, expansion, pizza, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: 'pizza-root', category: { id: 'pizza-category', templateType: 'pizza' } });
    expansion.expandProductRecipeToIngredients.mockImplementation(async (_tenant: string, flavor: string) => new Map([[flavor, decimal('300')]]));
    expansion.expandProductOptionItemRecipeToIngredients.mockImplementation(async (_tenant: string, flavor: string) => new Map([[`${flavor}-box`, decimal('1')]]));
    const result = await service.resolveProductComposition('tenant-a', {
      productId: 'pizza-root', productQuantity: 2,
      pizzaComposition: { sizeId: 'large', flavors: [{ productId: 'flavor-a', fraction: 0.5 }, { productId: 'flavor-b', fraction: 0.5 }] },
    });
    expect(pizza.calculatePrice).toHaveBeenCalledWith('pizza-category', 'large', expect.any(Array));
    expect(result.get('flavor-a')?.toString()).toBe('300');
    expect(result.get('flavor-b')?.toString()).toBe('300');
    expect(result.get('flavor-a-box')?.toString()).toBe('1');
    expect(result.get('flavor-b-box')?.toString()).toBe('1');
    expect(expansion.expandProductRecipeToIngredients).not.toHaveBeenCalledWith('tenant-a', 'pizza-root', expect.anything(), undefined);
  });
});
