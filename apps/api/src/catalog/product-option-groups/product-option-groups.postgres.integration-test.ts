import { PrismaClient } from '@prisma/client';
import { OptionGroupsService } from '../option-groups/option-groups.service';
import { ProductOptionGroupsService } from './product-option-groups.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) {
    throw new Error('DATABASE_URL and DIRECT_URL are required for the PostgreSQL integration test.');
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  const parsedDirectUrl = new URL(directUrl);
  if (!allowedDatabaseHosts.has(parsedDatabaseUrl.hostname) || !allowedDatabaseHosts.has(parsedDirectUrl.hostname)) {
    throw new Error('PostgreSQL integration test refused a non-local database host.');
  }
  if (parsedDatabaseUrl.host !== parsedDirectUrl.host || parsedDatabaseUrl.pathname !== parsedDirectUrl.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

describe('ProductOptionGroupLink PostgreSQL atomicity', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId: string | undefined;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  function serviceFor(currentTenantId: string): ProductOptionGroupsService {
    const cacheManager = { del: async () => undefined };
    const tenantContext = { getTenantId: () => currentTenantId };
    return Reflect.construct(ProductOptionGroupsService, [prisma, tenantContext, cacheManager]) as ProductOptionGroupsService;
  }

  function optionGroupsServiceFor(currentTenantId: string): OptionGroupsService {
    const cacheManager = { del: async () => undefined };
    const tenantContext = { getTenantId: () => currentTenantId };
    return Reflect.construct(OptionGroupsService, [prisma, tenantContext, cacheManager]) as OptionGroupsService;
  }

  it('keeps one primary replace link when concurrent mutations race', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `Option links ${suffix}`, slug: `option-links-${suffix}` },
    });
    tenantId = tenant.id;

    const [product, firstGroup, secondGroup] = await Promise.all([
      prisma.product.create({
        data: { tenantId: tenant.id, name: 'Produto concorrente', slug: `product-${suffix}`, basePrice: 12 },
      }),
      prisma.optionGroup.create({
        data: { tenantId: tenant.id, name: 'Tamanho A', selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1 },
      }),
      prisma.optionGroup.create({
        data: { tenantId: tenant.id, name: 'Tamanho B', selectionType: 'single', isRequired: true, minSelect: 1, maxSelect: 1 },
      }),
    ]);
    await prisma.optionItem.createMany({
      data: [
        { tenantId: tenant.id, optionGroupId: firstGroup.id, name: 'A', priceImpactType: 'replace', priceImpactValue: 15, minQty: 1, maxQty: 1 },
        { tenantId: tenant.id, optionGroupId: secondGroup.id, name: 'B', priceImpactType: 'replace', priceImpactValue: 18, minQty: 1, maxQty: 1 },
      ],
    });

    const service = serviceFor(tenant.id);
    const results = await Promise.allSettled([
      service.link({ productId: product.id, optionGroupId: firstGroup.id, pricingAxis: 'primary' }),
      service.link({ productId: product.id, optionGroupId: secondGroup.id, pricingAxis: 'primary' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [links, updatedProduct] = await Promise.all([
      prisma.productOptionGroupLink.findMany({ where: { tenantId: tenant.id, productId: product.id, pricingAxis: 'primary' } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { type: true } }),
    ]);
    expect(links).toHaveLength(1);
    expect(updatedProduct.type).toBe('configurable');

    const unlinkedGroup = links[0]?.optionGroupId === firstGroup.id ? secondGroup : firstGroup;
    await expect(service.link({ productId: product.id, optionGroupId: unlinkedGroup.id, pricingAxis: 'primary' })).rejects.toThrow();
    expect(await prisma.productOptionGroupLink.count({
      where: { tenantId: tenant.id, productId: product.id, pricingAxis: 'primary' },
    })).toBe(1);

    const secondaryLink = await service.link({
      productId: product.id,
      optionGroupId: unlinkedGroup.id,
      pricingAxis: 'secondary',
    });
    await expect(service.update(secondaryLink.id, { pricingAxis: 'primary' })).rejects.toThrow();
    expect(await prisma.productOptionGroupLink.findUniqueOrThrow({
      where: { id: secondaryLink.id },
      select: { pricingAxis: true },
    })).toEqual({ pricingAxis: 'secondary' });
  });

  it('removes a link and overrides for active and archived items together', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const service = serviceFor(currentTenantId);
    const [product, group] = await Promise.all([
      prisma.product.create({
        data: { tenantId: currentTenantId, name: 'Produto unlink', slug: `unlink-${suffix}`, basePrice: 12 },
      }),
      prisma.optionGroup.create({
        data: { tenantId: currentTenantId, name: 'Grupo unlink', selectionType: 'multiple', minSelect: 0, maxSelect: 2 },
      }),
    ]);
    const [activeItem, archivedItem] = await Promise.all([
      prisma.optionItem.create({ data: { tenantId: currentTenantId, optionGroupId: group.id, name: 'Ativo' } }),
      prisma.optionItem.create({
        data: { tenantId: currentTenantId, optionGroupId: group.id, name: 'Arquivado', deletedAt: new Date() },
      }),
    ]);
    const link = await service.link({ productId: product.id, optionGroupId: group.id });
    await prisma.productOptionItemPrice.createMany({
      data: [
        { tenantId: currentTenantId, productId: product.id, optionItemId: activeItem.id, price: 2 },
        { tenantId: currentTenantId, productId: product.id, optionItemId: archivedItem.id, price: 3 },
      ],
    });

    await service.unlink(link.id);

    expect(await prisma.productOptionGroupLink.findUnique({ where: { id: link.id } })).toBeNull();
    expect(await prisma.productOptionItemPrice.count({ where: { tenantId: currentTenantId, productId: product.id } })).toBe(0);
  });

  it('rolls back item edits that would make a secondary linked group use replace', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');

    const [product, group] = await Promise.all([
      prisma.product.create({
        data: { tenantId: currentTenantId, name: 'Produto secondary', slug: `secondary-${suffix}`, basePrice: 12 },
      }),
      prisma.optionGroup.create({
        data: { tenantId: currentTenantId, name: 'Grupo secondary', selectionType: 'single', minSelect: 0, maxSelect: 1 },
      }),
    ]);
    const item = await prisma.optionItem.create({
      data: { tenantId: currentTenantId, optionGroupId: group.id, name: 'Fixo', priceImpactType: 'fixed', priceImpactValue: 2 },
    });
    await serviceFor(currentTenantId).link({ productId: product.id, optionGroupId: group.id, pricingAxis: 'secondary' });

    const optionGroupsService = optionGroupsServiceFor(currentTenantId);
    await expect(optionGroupsService.updateItem(item.id, {
      priceImpactType: 'replace',
      priceImpactValue: 15,
      allowQuantity: false,
      minQty: 1,
      maxQty: 1,
    })).rejects.toThrow();

    await expect(optionGroupsService.createItem({
      optionGroupId: group.id,
      name: 'Replace inválido',
      priceImpactType: 'replace',
      priceImpactValue: 16,
      allowQuantity: false,
      minQty: 1,
      maxQty: 1,
    })).rejects.toThrow();

    expect(await prisma.optionItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { priceImpactType: true, priceImpactValue: true },
    })).toEqual({ priceImpactType: 'fixed', priceImpactValue: expect.anything() });
    expect(await prisma.optionItem.count({
      where: { tenantId: currentTenantId, optionGroupId: group.id, priceImpactType: 'replace' },
    })).toBe(0);
  });
});
