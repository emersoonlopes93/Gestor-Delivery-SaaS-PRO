import { randomUUID } from 'node:crypto';
import { PrismaClient, UnitType } from '@prisma/client';

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
    await prisma.recipeBaseIngredient.create({ data: { tenantId: first.tenant.id, baseId: base.id, ingredientId: first.ingredient.id, quantity: '0.123456' } });
    await prisma.recipeBaseDependency.create({ data: { tenantId: first.tenant.id, baseId: base.id, componentBaseId: child.id, quantity: '0.654321' } });
    await prisma.productRecipeBase.create({ data: { tenantId: first.tenant.id, productId: first.product.id, baseId: base.id, quantity: '0.500000' } });
    await prisma.productRecipeIngredient.create({ data: { tenantId: first.tenant.id, productId: first.product.id, ingredientId: first.ingredient.id, quantity: '1.0000' } });
    await expect(prisma.recipeBase.create({ data: { tenantId: first.tenant.id, name: 'Molho', outputUnit: UnitType.kg, yieldQuantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recipeBaseIngredient.create({ data: { tenantId: first.tenant.id, baseId: base.id, ingredientId: first.ingredient.id, quantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recipeBaseDependency.create({ data: { tenantId: first.tenant.id, baseId: base.id, componentBaseId: child.id, quantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.productRecipeBase.create({ data: { tenantId: first.tenant.id, productId: first.product.id, baseId: base.id, quantity: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recipeBaseIngredient.create({ data: { tenantId: first.tenant.id, baseId: base.id, ingredientId: second.ingredient.id, quantity: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    const secondBase = await prisma.recipeBase.create({ data: { tenantId: second.tenant.id, name: 'Outro', outputUnit: UnitType.un, yieldQuantity: 1 } });
    await expect(prisma.recipeBaseDependency.create({ data: { tenantId: first.tenant.id, baseId: base.id, componentBaseId: secondBase.id, quantity: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.productRecipeBase.create({ data: { tenantId: first.tenant.id, productId: first.product.id, baseId: secondBase.id, quantity: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.productRecipeIngredient.count({ where: { productId: first.product.id } })).toBe(1);
  });
});
