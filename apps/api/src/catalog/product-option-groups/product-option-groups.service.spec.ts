import { BadRequestException } from '@nestjs/common';
import { ProductOptionGroupsService } from './product-option-groups.service';

describe('ProductOptionGroupsService atomic link mutations', () => {
  const tenantId = 'tenant-a';
  const actorId = 'user-a';
  const dto = { productId: 'product-a', optionGroupId: 'group-a', pricingAxis: 'primary' as const };

  function makeService(options: {
    productType?: 'simple' | 'configurable' | 'combo';
    primaryLinks?: Array<{ optionGroupId: string }>;
    replaceItems?: Array<{ id: string }>;
  } = {}) {
    const productType = options.productType ?? 'simple';
    const tx = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: dto.productId, type: productType }),
        updateMany: jest.fn().mockResolvedValue({ count: productType === 'simple' ? 1 : 0 }),
      },
      optionGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: dto.optionGroupId,
          selectionType: 'single',
          isRequired: false,
          minSelect: 0,
          maxSelect: 1,
        }),
      },
      optionItem: { findMany: jest.fn().mockResolvedValue(options.replaceItems ?? []) },
      productOptionGroupLink: {
        create: jest.fn().mockResolvedValue({ id: 'link-a' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'link-a', productId: dto.productId, optionGroupId: dto.optionGroupId }),
        findMany: jest.fn().mockResolvedValue(options.primaryLinks ?? []),
        update: jest.fn().mockResolvedValue({ id: 'link-a', pricingAxis: 'primary' }),
        delete: jest.fn().mockResolvedValue({ id: 'link-a' }),
      },
      productOptionItemPrice: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-store' }) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const cacheManager = { del: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getTenantId: jest.fn().mockReturnValue(tenantId) };
    const service = Reflect.construct(ProductOptionGroupsService, [prisma, tenantContext, cacheManager]) as ProductOptionGroupsService;
    return { prisma, tx, cacheManager, service };
  }

  it('commits a valid link and promotion in one serializable transaction', async () => {
    const { prisma, tx, service } = makeService();

    await service.link(dto, actorId);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    expect(tx.productOptionGroupLink.create).toHaveBeenCalled();
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: dto.productId, tenantId, type: 'simple', deletedAt: null },
      data: { type: 'configurable' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: expect.objectContaining({ promotedToConfigurable: true }) }),
    }));
  });

  it('does not publish audit or cache changes when an invalid link rolls back', async () => {
    const { prisma, tx, cacheManager, service } = makeService({
      primaryLinks: [{ optionGroupId: 'group-a' }, { optionGroupId: 'group-b' }],
      replaceItems: [{ id: 'replace-a' }],
    });

    await expect(service.link(dto, actorId)).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(cacheManager.del).not.toHaveBeenCalled();
  });

  it('does not publish audit or cache changes when an invalid axis update rolls back', async () => {
    const { prisma, tx, cacheManager, service } = makeService({
      primaryLinks: [{ optionGroupId: 'group-a' }, { optionGroupId: 'group-b' }],
      replaceItems: [{ id: 'replace-a' }],
    });

    await expect(service.update('link-a', { pricingAxis: 'primary' }, actorId)).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.productOptionGroupLink.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(cacheManager.del).not.toHaveBeenCalled();
  });

  it('removes overrides for active and archived items together with the link', async () => {
    const { tx, service } = makeService();
    tx.optionItem.findMany.mockResolvedValue([{ id: 'active-item' }, { id: 'archived-item' }]);

    await service.unlink('link-a', actorId);

    expect(tx.productOptionItemPrice.deleteMany).toHaveBeenCalledWith({
      where: { tenantId, productId: dto.productId, optionItemId: { in: ['active-item', 'archived-item'] } },
    });
    expect(tx.productOptionGroupLink.delete).toHaveBeenCalledWith({ where: { id: 'link-a' } });
  });

  it('does not delete the link or publish side effects when override cleanup fails', async () => {
    const { prisma, tx, cacheManager, service } = makeService();
    tx.optionItem.findMany.mockResolvedValue([{ id: 'archived-item' }]);
    tx.productOptionItemPrice.deleteMany.mockRejectedValue(new Error('database unavailable'));

    await expect(service.unlink('link-a', actorId)).rejects.toThrow('database unavailable');

    expect(tx.productOptionGroupLink.delete).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(cacheManager.del).not.toHaveBeenCalled();
  });

  it.each(['configurable', 'combo'] as const)('does not promote an already %s product', async (type) => {
    const { tx, service } = makeService({ productType: type });

    await service.link(dto, actorId);

    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
