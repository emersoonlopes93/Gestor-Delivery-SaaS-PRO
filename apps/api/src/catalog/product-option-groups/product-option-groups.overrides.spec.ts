import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductOptionGroupsService } from './product-option-groups.service';

describe('ProductOptionGroupsService item override integrity', () => {
  const tenantId = 'tenant-a';
  const productId = 'product-a';
  const optionItemId = 'item-a';

  function makeService(options: {
    product?: { id: string } | null;
    item?: { id: string; optionGroupId: string; isActive: boolean; priceImpactValue: Prisma.Decimal } | null;
    link?: { id: string } | null;
    existing?: { id: string; isActive: boolean | null; price: Prisma.Decimal | null; costPrice: Prisma.Decimal | null } | null;
  } = {}) {
    const product = options.product === undefined ? { id: productId } : options.product;
    const item = options.item === undefined
      ? { id: optionItemId, optionGroupId: 'group-a', isActive: true, priceImpactValue: new Prisma.Decimal(10) }
      : options.item;
    const link = options.link === undefined ? { id: 'link-a' } : options.link;
    const tx = {
      product: { findFirst: jest.fn().mockResolvedValue(product) },
      optionItem: { findFirst: jest.fn().mockResolvedValue(item), update: jest.fn() },
      productOptionGroupLink: { findFirst: jest.fn().mockResolvedValue(link) },
      productOptionItemPrice: {
        findUnique: jest.fn().mockResolvedValue(options.existing ?? null),
        upsert: jest.fn().mockResolvedValue({
          id: 'override-a',
          isActive: null,
          price: new Prisma.Decimal(15),
          costPrice: null,
        }),
        delete: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-store' }) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const cacheManager = { del: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getTenantId: jest.fn().mockReturnValue(tenantId) };
    const service = Reflect.construct(ProductOptionGroupsService, [prisma, tenantContext, cacheManager]) as ProductOptionGroupsService;
    return { tx, prisma, cacheManager, service };
  }

  it('creates a local price override without changing OptionItem semantics', async () => {
    const { tx, service } = makeService();

    const result = await service.upsertItemOverride(productId, optionItemId, { price: 15 });

    expect(result.override).toEqual(expect.objectContaining({ price: 15, costPrice: null }));
    expect(tx.productOptionItemPrice.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ price: new Prisma.Decimal(15), isActive: null }),
    }));
    expect(tx.optionItem.update).not.toHaveBeenCalled();
  });

  it('resets an override by deleting it without changing the global item', async () => {
    const { tx, service } = makeService({
      existing: { id: 'override-a', isActive: null, price: new Prisma.Decimal(15), costPrice: null },
    });

    const result = await service.resetItemOverride(productId, optionItemId);

    expect(tx.productOptionItemPrice.deleteMany).toHaveBeenCalledWith({ where: { tenantId, productId, optionItemId } });
    expect(result).toEqual({ success: true, effectiveIsActive: true, override: null });
  });

  it('does not retain a price override equal to the global default', async () => {
    const { tx, service } = makeService();

    const result = await service.upsertItemOverride(productId, optionItemId, { price: 10 });

    expect(tx.productOptionItemPrice.upsert).not.toHaveBeenCalled();
    expect(tx.productOptionItemPrice.delete).not.toHaveBeenCalled();
    expect(result.override).toBeNull();
  });

  it('removes an existing override when it is changed back to the global default', async () => {
    const { tx, service } = makeService({
      existing: { id: 'override-a', isActive: null, price: new Prisma.Decimal(15), costPrice: null },
    });

    const result = await service.upsertItemOverride(productId, optionItemId, { price: 10 });

    expect(tx.productOptionItemPrice.delete).toHaveBeenCalledWith({
      where: { productId_optionItemId: { productId, optionItemId } },
    });
    expect(result.override).toBeNull();
  });

  it('allows future global price changes to be inherited after reset', async () => {
    const { tx, service } = makeService({
      existing: { id: 'override-a', isActive: null, price: new Prisma.Decimal(15), costPrice: null },
    });

    await service.resetItemOverride(productId, optionItemId);
    tx.optionItem.findFirst.mockResolvedValue({
      id: optionItemId,
      optionGroupId: 'group-a',
      isActive: true,
      priceImpactValue: new Prisma.Decimal(12),
    });
    tx.productOptionItemPrice.findUnique.mockResolvedValue(null);

    const result = await service.upsertItemOverride(productId, optionItemId, { price: 12 });

    expect(result.override).toBeNull();
    expect(tx.productOptionItemPrice.upsert).not.toHaveBeenCalled();
  });

  it('rejects an override for an item whose group is not linked to the product', async () => {
    const { tx, service } = makeService({ link: null });

    await expect(service.upsertItemOverride(productId, optionItemId, { price: 15 })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.productOptionItemPrice.upsert).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant product before writing an override', async () => {
    const { tx, service } = makeService({ product: null });

    await expect(service.upsertItemOverride(productId, optionItemId, { price: 15 })).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.productOptionItemPrice.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid override values before writing', async () => {
    const { tx, service } = makeService();

    await expect(service.upsertItemOverride(productId, optionItemId, { costPrice: -1 })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.productOptionItemPrice.upsert).not.toHaveBeenCalled();
  });

  it('does not publish audit or cache effects when override persistence fails', async () => {
    const { tx, prisma, cacheManager, service } = makeService();
    tx.productOptionItemPrice.upsert.mockRejectedValue(new Error('database unavailable'));

    await expect(service.upsertItemOverride(productId, optionItemId, { price: 15 })).rejects.toThrow('database unavailable');

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(cacheManager.del).not.toHaveBeenCalled();
  });
});
