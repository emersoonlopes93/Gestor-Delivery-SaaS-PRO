import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, UnitType } from '@prisma/client';
import { RecipeExpansionService } from './recipe-expansion.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) throw new Error('Recipe expansion integration test refused a non-ephemeral PostgreSQL database.');
}

describe('Recipe expansion PostgreSQL integrity', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture() {
    const token = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `Expansion ${token}`, slug: `expansion-${token}` } });
    tenantIds.push(tenant.id);
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: `Product ${token}`, slug: `product-${token}`, basePrice: 1 } });
    const tomato = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Tomato ${token}`, sku: `tomato-${token}`, unit: UnitType.g, currentCost: '0.0100' } });
    const oil = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Oil ${token}`, sku: `oil-${token}`, unit: UnitType.ml, currentCost: '0.0500' } });
    const cheese = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Cheese ${token}`, sku: `cheese-${token}`, unit: UnitType.g, currentCost: '0.0200' } });
    return { tenant, product, tomato, oil, cheese };
  }

  it('expands direct and nested archived bases with Decimal aggregation and current derived cost', async () => {
    const data = await fixture();
    const baseA = await prisma.recipeBase.create({ data: { tenantId: data.tenant.id, name: 'Base sauce', outputUnit: UnitType.ml, yieldQuantity: '1000.000000' } });
    const baseB = await prisma.recipeBase.create({ data: { tenantId: data.tenant.id, name: 'Special sauce', outputUnit: UnitType.ml, yieldQuantity: '500.000000', isActive: false, archivedAt: new Date() } });
    await prisma.recipeBaseIngredient.createMany({ data: [
      { tenantId: data.tenant.id, baseId: baseA.id, ingredientId: data.tomato.id, inputQuantity: '700.000000', inputUnit: UnitType.g, quantity: '700.000000' },
      { tenantId: data.tenant.id, baseId: baseA.id, ingredientId: data.oil.id, inputQuantity: '100.000000', inputUnit: UnitType.ml, quantity: '100.000000' },
      { tenantId: data.tenant.id, baseId: baseB.id, ingredientId: data.cheese.id, inputQuantity: '50.000000', inputUnit: UnitType.g, quantity: '50.000000' },
    ] });
    await prisma.recipeBaseDependency.create({ data: { tenantId: data.tenant.id, baseId: baseB.id, componentBaseId: baseA.id, inputQuantity: '200.000000', inputUnit: UnitType.ml, quantity: '200.000000' } });
    await prisma.productRecipeIngredient.create({ data: { tenantId: data.tenant.id, productId: data.product.id, ingredientId: data.tomato.id, inputQuantity: '1.0000', inputUnit: UnitType.g, quantity: '1.0000' } });
    await prisma.productRecipeBase.create({ data: { tenantId: data.tenant.id, productId: data.product.id, baseId: baseB.id, inputQuantity: '100.000000', inputUnit: UnitType.ml, quantity: '100.000000' } });

    const service = new RecipeExpansionService(prisma as never);
    const quantities = await service.expandProductRecipeToIngredients(data.tenant.id, data.product.id, new Prisma.Decimal(2));
    expect(quantities.get(data.tomato.id)?.toString()).toBe('58');
    expect(quantities.get(data.oil.id)?.toString()).toBe('8');
    expect(quantities.get(data.cheese.id)?.toString()).toBe('20');
    const firstCost = await service.calculateExpandedIngredientCost(data.tenant.id, quantities);
    expect(firstCost.totalCost.toString()).toBe('1.38');
    await prisma.ingredient.update({ where: { id: data.oil.id }, data: { currentCost: '0.1000' } });
    const updatedCost = await service.calculateExpandedIngredientCost(data.tenant.id, quantities);
    expect(updatedCost.totalCost.toString()).toBe('1.78');
    expect(await prisma.stockMovement.count({ where: { tenantId: data.tenant.id } })).toBe(0);
  });

  it('rejects cross-tenant products and invalid requested quantities without partial output', async () => {
    const data = await fixture();
    const service = new RecipeExpansionService(prisma as never);
    await expect(service.expandProductRecipeToIngredients(data.tenant.id, data.product.id, new Prisma.Decimal(0))).rejects.toThrow('maior que zero');
    await expect(service.expandProductRecipeToIngredients('other-tenant', data.product.id, new Prisma.Decimal(1))).rejects.toThrow('Produto não encontrado');
  });
});
