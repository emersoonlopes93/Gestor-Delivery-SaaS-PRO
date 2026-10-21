import { randomUUID } from 'node:crypto';
import { PrismaClient, UnitType } from '@prisma/client';
import { UnitType as SharedUnitType } from '@gestor/types';
import { RecipeBasesService } from './recipe-bases.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Recipe base integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Recipe base PostgreSQL schema integrity', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture(label: string) {
    const token = `${label}-${randomUUID().slice(0, 8)}`;
    const tenant = await prisma.tenant.create({ data: { name: `Base ${token}`, slug: `base-${token}` } });
    tenantIds.push(tenant.id);
    const ingredient = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Ingredient ${token}`, sku: `ingredient-${token}`, unit: UnitType.un } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: `Product ${token}`, slug: `product-${token}`, basePrice: 1 } });
    return { tenant, ingredient, product };
  }

  it('persists bases, components, dependencies, product links, six decimals, uniques, and legacy recipes', async () => {
    const first = await fixture('first');
    const second = await fixture('second');
    const base = await prisma.recipeBase.create({ data: { tenantId: first.tenant.id, name: 'Molho', outputUnit: UnitType.kg, yieldQuantity: '1.123456' } });
    const child = await prisma.recipeBase.create({ data: { tenantId: first.tenant.id, name: 'Caldo', outputUnit: UnitType.l, yieldQuantity: '2.000000' } });
    const stored = await prisma.recipeBase.findUniqueOrThrow({ where: { id: base.id } });
    expect(stored.yieldQuantity.toFixed(6)).toBe('1.123456');
    await prisma.recipeBaseIngredient.create({ data: { tenantId: first.tenant.id, baseId: base.id, ingredientId: first.ingredient.id, inputQuantity: '0.123456', inputUnit: UnitType.un, quantity: '0.123456' } });
    await prisma.recipeBaseDependency.create({ data: { tenantId: first.tenant.id, baseId: base.id, componentBaseId: child.id, inputQuantity: '0.654321', inputUnit: UnitType.l, quantity: '0.654321' } });
    await prisma.productRecipeBase.create({ data: { tenantId: first.tenant.id, productId: first.product.id, baseId: base.id, inputQuantity: '0.500000', inputUnit: UnitType.kg, quantity: '0.500000' } });
    await prisma.productRecipeIngredient.create({ data: { tenantId: first.tenant.id, productId: first.product.id, ingredientId: first.ingredient.id, inputQuantity: '1.0000', inputUnit: UnitType.un, quantity: '1.0000' } });
    await expect(prisma.recipeBase.create({ data: { tenantId: first.tenant.id, name: 'Molho', outputUnit: UnitType.kg, yieldQuantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recipeBaseIngredient.create({ data: { tenantId: first.tenant.id, baseId: base.id, ingredientId: first.ingredient.id, inputQuantity: 1, inputUnit: UnitType.un, quantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recipeBaseDependency.create({ data: { tenantId: first.tenant.id, baseId: base.id, componentBaseId: child.id, inputQuantity: 1, inputUnit: UnitType.l, quantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.productRecipeBase.create({ data: { tenantId: first.tenant.id, productId: first.product.id, baseId: base.id, inputQuantity: 1, inputUnit: UnitType.kg, quantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recipeBaseIngredient.create({ data: { tenantId: first.tenant.id, baseId: base.id, ingredientId: second.ingredient.id, inputQuantity: 1, inputUnit: UnitType.un, quantity: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    const secondBase = await prisma.recipeBase.create({ data: { tenantId: second.tenant.id, name: 'Outro', outputUnit: UnitType.un, yieldQuantity: 1 } });
    await expect(prisma.recipeBaseDependency.create({ data: { tenantId: first.tenant.id, baseId: base.id, componentBaseId: secondBase.id, inputQuantity: 1, inputUnit: UnitType.un, quantity: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.productRecipeBase.create({ data: { tenantId: first.tenant.id, productId: first.product.id, baseId: secondBase.id, inputQuantity: 1, inputUnit: UnitType.un, quantity: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.productRecipeIngredient.count({ where: { productId: first.product.id } })).toBe(1);
  });

  it('validates projected cycles, maximum depth, archived children, and preserves inventory invariants', async () => {
    const data = await fixture('graph');
    const service = new RecipeBasesService(prisma as never);
    const createBase = (name: string) => prisma.recipeBase.create({ data: { tenantId: data.tenant.id, name, outputUnit: UnitType.un, yieldQuantity: 1 } });
    const [a, b, c] = await Promise.all([createBase('A'), createBase('B'), createBase('C')]);
    await service.replaceComponents(data.tenant.id, a.id, [{ type: 'base', baseId: b.id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]);
    await service.replaceComponents(data.tenant.id, b.id, [{ type: 'base', baseId: c.id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]);
    await expect(service.replaceComponents(data.tenant.id, c.id, [{ type: 'base', baseId: a.id, inputQuantity: 1, inputUnit: SharedUnitType.UN }])).rejects.toThrow('direta ou indiretamente');
    const chain = await Promise.all(Array.from({ length: 12 }, (_, index) => createBase(`Depth ${index}`)));
    for (let index = 0; index < 10; index += 1) await service.replaceComponents(data.tenant.id, chain[index].id, [{ type: 'base', baseId: chain[index + 1].id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]);
    await service.replaceComponents(data.tenant.id, chain[10].id, [{ type: 'base', baseId: chain[11].id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]);
    await expect(service.replaceComponents(data.tenant.id, chain[0].id, [{ type: 'base', baseId: chain[1].id, inputQuantity: 1, inputUnit: SharedUnitType.UN }])).rejects.toThrow('profundidade máxima');
    const child = await createBase('Archived child');
    await service.replaceComponents(data.tenant.id, a.id, [{ type: 'base', baseId: child.id, inputQuantity: 2, inputUnit: SharedUnitType.UN }]);
    await service.archive(data.tenant.id, child.id);
    await expect(service.replaceComponents(data.tenant.id, a.id, [{ type: 'base', baseId: child.id, inputQuantity: 3, inputUnit: SharedUnitType.UN }])).rejects.toThrow('arquivada');
    await expect(service.replaceComponents(data.tenant.id, a.id, [{ type: 'base', baseId: child.id, inputQuantity: 2, inputUnit: SharedUnitType.UN }])).resolves.toMatchObject({ id: a.id });
    const ingredientBefore = await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } });
    await service.replaceComponents(data.tenant.id, a.id, [{ type: 'ingredient', ingredientId: data.ingredient.id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]);
    const ingredientAfter = await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } });
    expect(ingredientAfter.currentStock).toEqual(ingredientBefore.currentStock);
    expect(ingredientAfter.currentCost).toEqual(ingredientBefore.currentCost);
    expect(await prisma.stockMovement.count({ where: { ingredientId: data.ingredient.id } })).toBe(0);
    expect(await prisma.productRecipeBase.count({ where: { productId: data.product.id } })).toBe(0);
  });

  it('serializes concurrent opposite graph mutations without partial writes', async () => {
    const data = await fixture('concurrent');
    const service = new RecipeBasesService(prisma as never);
    const [a, b] = await Promise.all([
      prisma.recipeBase.create({ data: { tenantId: data.tenant.id, name: 'Concurrent A', outputUnit: UnitType.un, yieldQuantity: 1 } }),
      prisma.recipeBase.create({ data: { tenantId: data.tenant.id, name: 'Concurrent B', outputUnit: UnitType.un, yieldQuantity: 1 } }),
    ]);
    const results = await Promise.allSettled([
      service.replaceComponents(data.tenant.id, a.id, [{ type: 'base', baseId: b.id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]),
      service.replaceComponents(data.tenant.id, b.id, [{ type: 'base', baseId: a.id, inputQuantity: 1, inputUnit: SharedUnitType.UN }]),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const edges = await prisma.recipeBaseDependency.findMany({ where: { tenantId: data.tenant.id, baseId: { in: [a.id, b.id] } } });
    expect(edges).toHaveLength(1);
    expect(new Set(edges.map((edge) => `${edge.baseId}:${edge.componentBaseId}`))).not.toEqual(new Set([`${a.id}:${b.id}`, `${b.id}:${a.id}`]));
  });
});
