import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProductOptionGroupsService } from './product-option-groups.service';

describe('ProductOptionGroupsService product type authoring guardrails', () => {
  const tenantId = 'tenant-a';
  const actorId = 'user-a';
  const dto = { productId: 'product-a', optionGroupId: 'group-a' };

  function makeService(type: 'simple' | 'configurable' | 'combo') {
    const prisma = {
      tenantClient: {
        product: {
          findFirst: jest.fn().mockResolvedValue({ id: dto.productId, type }),
          updateMany: jest.fn().mockResolvedValue({ count: type === 'simple' ? 1 : 0 }),
        },
        optionGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: dto.optionGroupId,
            selectionType: 'single',
            isRequired: false,
            minSelect: 0,
            maxSelect: 1,
            isActive: true,
          }),
        },
        productOptionGroupLink: {
          create: jest.fn().mockResolvedValue({ id: 'link-a' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-store' }) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const cacheManager = { del: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getTenantId: jest.fn().mockReturnValue(tenantId) };
    const service = Reflect.construct(ProductOptionGroupsService, [prisma, tenantContext, cacheManager]) as ProductOptionGroupsService;
    return { prisma, service };
  }

  it('promotes simple to configurable after linking its first option group', async () => {
    const { prisma, service } = makeService('simple');

    await service.link(dto, actorId);

    expect(prisma.tenantClient.product.updateMany).toHaveBeenCalledWith({
      where: { id: dto.productId, tenantId, type: 'simple', deletedAt: null },
      data: { type: 'configurable' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: expect.objectContaining({ promotedToConfigurable: true }) }),
    }));
  });

  it.each(['configurable', 'combo'] as const)('does not promote an already %s product', async (type) => {
    const { prisma, service } = makeService(type);

    await service.link(dto, actorId);

    expect(prisma.tenantClient.product.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: expect.objectContaining({ promotedToConfigurable: false }) }),
    }));
  });

  it('keeps unlink free of an automatic configurable-to-simple downgrade', () => {
    const source = readFileSync(resolve(__dirname, 'product-option-groups.service.ts'), 'utf8');
    const unlinkSource = source.slice(source.indexOf('async unlink'), source.indexOf('async update'));

    expect(unlinkSource).not.toContain("type: 'simple'");
    expect(unlinkSource).not.toContain('product.update');
  });

  it('preserves the source type when duplicating a product', () => {
    const source = readFileSync(resolve(__dirname, '../products/products.service.ts'), 'utf8');
    expect(source).toContain('type: source.type');
  });
});
