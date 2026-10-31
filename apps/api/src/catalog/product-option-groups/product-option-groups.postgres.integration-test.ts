import { PrismaClient } from '@prisma/client';
import { OptionGroupsService } from '../option-groups/option-groups.service';
import { ProductOptionGroupsService } from './product-option-groups.service';
import { ComboComponentEligibilityService } from '../combo-component-eligibility.service';

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
    return Reflect.construct(
      ProductOptionGroupsService,
      [prisma, tenantContext, new ComboComponentEligibilityService(prisma as never), cacheManager],
    ) as ProductOptionGroupsService;
  }

  function optionGroupsServiceFor(currentTenantId: string): OptionGroupsService {
    const cacheManager = { del: async () => undefined };
    const tenantContext = { getTenantId: () => currentTenantId };
    return Reflect.construct(
      OptionGroupsService,
      [prisma, tenantContext, new ComboComponentEligibilityService(prisma as never), cacheManager],
    ) as OptionGroupsService;
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

  it('atomically authors a contextual group and returns the same result on retry', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const product = await prisma.product.create({ data: { tenantId: currentTenantId, name: 'Produto contextual', slug: `contextual-${suffix}`, basePrice: 12 } });
    const service = serviceFor(currentTenantId);
    const request = {
      idempotencyKey: `contextual-${suffix}`,
      name: 'Tamanhos', selectionType: 'single' as const, isRequired: true, minSelect: 1, maxSelect: 1,
      pricingAxis: 'primary' as const,
      items: [
        { name: 'Pequeno', priceImpactType: 'replace' as const, priceImpactValue: 12, allowQuantity: false, minQty: 1, maxQty: 1 },
        { name: 'Grande', priceImpactType: 'replace' as const, priceImpactValue: 18, allowQuantity: false, minQty: 1, maxQty: 1, productIsActive: false },
      ],
    };
    const first = await service.createContextual(product.id, request);
    const retried = await service.createContextual(product.id, request);
    expect(retried.idempotent).toBe(true);
    expect(retried.group.id).toBe(first.group.id);
    expect(await prisma.optionGroup.count({ where: { tenantId: currentTenantId, name: 'Tamanhos' } })).toBe(1);
    expect(await prisma.optionItem.count({ where: { tenantId: currentTenantId, optionGroupId: first.group.id } })).toBe(2);
    expect(await prisma.productOptionGroupLink.count({ where: { tenantId: currentTenantId, productId: product.id } })).toBe(1);
    expect(await prisma.productOptionItemPrice.findFirst({ where: { tenantId: currentTenantId, productId: product.id, isActive: false } })).not.toBeNull();
  });

  it('rolls back a contextual request rejected by pricing rules and rejects a divergent retry key', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const product = await prisma.product.create({ data: { tenantId: currentTenantId, name: 'Produto rollback', slug: `contextual-rollback-${suffix}`, basePrice: 12 } });
    const service = serviceFor(currentTenantId);
    const invalid = { idempotencyKey: `invalid-${suffix}`, name: 'Inválido', selectionType: 'single' as const, minSelect: 0, maxSelect: 1, pricingAxis: 'secondary' as const, items: [{ name: 'Substitui', priceImpactType: 'replace' as const, priceImpactValue: 15, allowQuantity: false, minQty: 1, maxQty: 1 }] };
    await expect(service.createContextual(product.id, invalid)).rejects.toThrow();
    expect(await prisma.optionGroup.count({ where: { tenantId: currentTenantId, name: 'Inválido' } })).toBe(0);

    const valid = { ...invalid, idempotencyKey: `same-key-${suffix}`, name: 'Válido', pricingAxis: 'primary' as const };
    await service.createContextual(product.id, valid);
    await expect(service.createContextual(product.id, { ...valid, name: 'Outro payload' })).rejects.toThrow();
    expect(await prisma.optionGroup.count({ where: { tenantId: currentTenantId, name: 'Outro payload' } })).toBe(0);
  });

  it('keeps exactly one contextual aggregate when identical requests race', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const product = await prisma.product.create({
      data: { tenantId: currentTenantId, name: 'Produto retry concorrente', slug: `contextual-race-${suffix}`, basePrice: 12 },
    });
    const request = {
      idempotencyKey: `contextual-race-${suffix}`,
      name: 'Grupo retry concorrente',
      selectionType: 'single' as const,
      minSelect: 0,
      maxSelect: 1,
      pricingAxis: 'secondary' as const,
      items: [{ name: 'Opção', priceImpactType: 'fixed' as const, priceImpactValue: 2, allowQuantity: false, minQty: 1, maxQty: 1 }],
    };

    const results = await Promise.allSettled([
      serviceFor(currentTenantId).createContextual(product.id, request),
      serviceFor(currentTenantId).createContextual(product.id, request),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<ProductOptionGroupsService['createContextual']>>> => result.status === 'fulfilled',
    );
    expect(new Set(fulfilled.map((result) => result.value.group.id)).size).toBe(1);
    expect(await prisma.optionGroup.count({ where: { tenantId: currentTenantId, name: request.name } })).toBe(1);
    expect(await prisma.optionItem.count({ where: { tenantId: currentTenantId, name: 'Opção' } })).toBe(1);
    expect(await prisma.productOptionGroupLink.count({ where: { tenantId: currentTenantId, productId: product.id } })).toBe(1);
  });

  it('rolls back a contextual request that fails after creating its group, items, and link', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const product = await prisma.product.create({
      data: { tenantId: currentTenantId, name: 'Produto rollback tardio', slug: `contextual-late-rollback-${suffix}`, basePrice: 12 },
    });
    const existingGroup = await prisma.optionGroup.create({
      data: { tenantId: currentTenantId, name: 'Primário existente', selectionType: 'single', minSelect: 0, maxSelect: 1 },
    });
    await serviceFor(currentTenantId).link({ productId: product.id, optionGroupId: existingGroup.id, pricingAxis: 'primary' });

    await expect(serviceFor(currentTenantId).createContextual(product.id, {
      idempotencyKey: `contextual-late-rollback-${suffix}`,
      name: 'Deve sofrer rollback',
      selectionType: 'single',
      minSelect: 0,
      maxSelect: 1,
      pricingAxis: 'primary',
      items: [{ name: 'Substitui', priceImpactType: 'replace', priceImpactValue: 15, allowQuantity: false, minQty: 1, maxQty: 1 }],
    })).rejects.toThrow();

    expect(await prisma.optionGroup.count({ where: { tenantId: currentTenantId, name: 'Deve sofrer rollback' } })).toBe(0);
    expect(await prisma.optionItem.count({
      where: { tenantId: currentTenantId, optionGroup: { name: 'Deve sofrer rollback' } },
    })).toBe(0);
    expect(await prisma.productOptionGroupLink.count({ where: { tenantId: currentTenantId, productId: product.id } })).toBe(1);
  });

  it('isolates idempotency keys and rejects cross-tenant product IDs', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const otherTenant = await prisma.tenant.create({
      data: { name: `Option links other ${suffix}`, slug: `option-links-other-${suffix}` },
    });
    try {
      const [ownProduct, otherProduct] = await Promise.all([
        prisma.product.create({ data: { tenantId: currentTenantId, name: 'Produto próprio', slug: `contextual-own-${suffix}`, basePrice: 12 } }),
        prisma.product.create({ data: { tenantId: otherTenant.id, name: 'Produto outro tenant', slug: `contextual-other-${suffix}`, basePrice: 12 } }),
      ]);
      const request = {
        idempotencyKey: `shared-key-${suffix}`,
        name: 'Grupo isolado',
        selectionType: 'single' as const,
        minSelect: 0,
        maxSelect: 1,
        pricingAxis: 'secondary' as const,
        items: [{ name: 'Opção isolada', priceImpactType: 'fixed' as const, priceImpactValue: 1, allowQuantity: false, minQty: 1, maxQty: 1 }],
      };

      const ownResult = await serviceFor(currentTenantId).createContextual(ownProduct.id, request);
      const otherResult = await serviceFor(otherTenant.id).createContextual(otherProduct.id, request);
      expect(ownResult.group.id).not.toBe(otherResult.group.id);
      await expect(serviceFor(currentTenantId).createContextual(otherProduct.id, request)).rejects.toThrow();
      expect(await prisma.productOptionGroupAuthoringRequest.count({ where: { idempotencyKey: request.idempotencyKey } })).toBe(2);
    } finally {
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    }
  });

  it('allows unlinking a contextual group and removes its completed idempotency record', async () => {
    const currentTenantId = tenantId;
    if (!currentTenantId) throw new Error('Tenant fixture was not created.');
    const product = await prisma.product.create({
      data: { tenantId: currentTenantId, name: 'Produto unlink contextual', slug: `contextual-unlink-${suffix}`, basePrice: 12 },
    });
    const request = {
      idempotencyKey: `contextual-unlink-${suffix}`,
      name: 'Grupo unlink contextual',
      selectionType: 'single' as const,
      minSelect: 0,
      maxSelect: 1,
      pricingAxis: 'secondary' as const,
      items: [{ name: 'Opção unlink', priceImpactType: 'fixed' as const, priceImpactValue: 1, allowQuantity: false, minQty: 1, maxQty: 1 }],
    };
    const created = await serviceFor(currentTenantId).createContextual(product.id, request);

    await expect(serviceFor(currentTenantId).unlink(created.link.id)).resolves.toEqual({ success: true });
    expect(await prisma.productOptionGroupLink.findUnique({ where: { id: created.link.id } })).toBeNull();
    expect(await prisma.productOptionGroupAuthoringRequest.count({
      where: { tenantId: currentTenantId, productId: product.id, idempotencyKey: request.idempotencyKey },
    })).toBe(0);
  });
});
