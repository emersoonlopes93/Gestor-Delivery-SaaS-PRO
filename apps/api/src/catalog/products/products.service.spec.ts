import { UnitType } from '@prisma/client';
import { ProductsService } from './products.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';

const tenantId = 'tenant-1';

function sourceProduct(baseActive: boolean) {
  return {
    id: 'product-1',
    tenantId,
    name: 'Produto original',
    type: 'simple',
    comboMode: null,
    comboPricingType: null,
    comboPricingValue: null,
    categoryId: null,
    shortDescription: null,
    longDescription: null,
    basePrice: 10,
    costPrice: 3,
    image: null,
    mediaAssetId: null,
    isFeatured: false,
    isAvailable: true,
    sellableOnline: false,
    sku: 'SKU-1',
    order: 0,
    optionGroupLinks: [],
    comboBundleItems: [],
    publication: null,
    optionItemPrices: [],
    upsellLinks: [],
    recipeIngredients: [{ ingredientId: 'ingredient-1', inputQuantity: 2, inputUnit: UnitType.g, quantity: 2 }],
    recipeBases: [{ baseId: 'base-1', inputQuantity: 250, inputUnit: UnitType.ml, quantity: 250, base: { id: 'base-1', isActive: baseActive, name: 'Molho da casa' } }],
  };
}

describe('ProductsService.duplicate', () => {
  const findFirst = jest.fn();
  const create = jest.fn();
  const transaction = jest.fn();
  const tenantContext = { getTenantId: jest.fn(() => tenantId) };
  const prisma = Object.create(null) as PrismaService;
  Object.defineProperty(prisma, 'tenantClient', { value: { product: { findFirst } } });
  prisma.$transaction = transaction as never;
  const tenantContextService = Object.create(null) as TenantContextService;
  tenantContextService.getTenantId = tenantContext.getTenantId;
  const cacheManager = Object.create(null) as { del: jest.Mock };
  cacheManager.del = jest.fn();
  const service = new ProductsService(
    prisma,
    tenantContextService,
    undefined!,
    undefined!,
    undefined!,
    cacheManager as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      product: { create },
      productOptionGroupLink: { createMany: jest.fn() },
      productOptionItemPrice: { createMany: jest.fn() },
      productUpsell: { createMany: jest.fn() },
      comboBundleItem: { createMany: jest.fn() },
      catalogPublication: { create: jest.fn() },
    }));
  });

  it('copies active recipe-base and ingredient metadata unchanged', async () => {
    findFirst.mockResolvedValue(sourceProduct(true));
    create.mockResolvedValue({ id: 'duplicate-1' });

    await expect(service.duplicate('product-1')).resolves.toEqual({ id: 'duplicate-1' });

    const createData = create.mock.calls[0][0].data;
    expect(createData.recipeIngredients.create).toEqual([{
      tenantId,
      ingredientId: 'ingredient-1',
      inputQuantity: 2,
      inputUnit: UnitType.g,
      quantity: 2,
    }]);
    expect(createData.recipeBases.create).toEqual([{
      tenantId,
      baseId: 'base-1',
      inputQuantity: 250,
      inputUnit: UnitType.ml,
      quantity: 250,
    }]);
  });

  it('rejects an archived recipe-base before opening a clone transaction', async () => {
    findFirst.mockResolvedValue(sourceProduct(false));

    await expect(service.duplicate('product-1')).rejects.toThrow('preparação arquivada');
    expect(transaction).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
