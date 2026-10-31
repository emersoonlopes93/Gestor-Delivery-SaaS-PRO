import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, UnitType as PrismaUnitType } from '@prisma/client';
import { UnitType } from '@gestor/types';
import { RecipeBasesService } from './recipe-bases.service';
import { RecipeExpansionService } from './recipe-expansion.service';
import { RecipesService } from './recipes.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);
function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Product Recipe V2 integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Product Recipe V2 PostgreSQL integrity', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];
  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture(label: string) {
    const token = `${label}-${randomUUID().slice(0, 8)}`;
    const tenant = await prisma.tenant.create({ data: { name: `Recipe V2 ${token}`, slug: `recipe-v2-${token}` } });
    tenantIds.push(tenant.id);
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: `Product ${token}`, slug: `product-${token}`, basePrice: 1 } });
    const flour = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: 'Flour', sku: `flour-${token}`, unit: PrismaUnitType.kg, currentCost: '10.0000' } });
    const oil = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: 'Oil', sku: `oil-${token}`, unit: PrismaUnitType.l, currentCost: '20.0000' } });
    return { tenant, product, flour, oil };
  }

  it('normalizes authored units, persists metadata, expands nested bases, and derives cost once', async () => {
    const data = await fixture('normalization');
    const expansion = new RecipeExpansionService(prisma as never);
    const bases = new RecipeBasesService(prisma as never, new RecipeExpansionService(prisma as never));
    const recipes = new RecipesService(prisma as never, expansion);
    const dough = await bases.create(data.tenant.id, { name: 'Dough', outputUnit: UnitType.KG, yieldQuantity: 1 });
    await bases.replaceComponents(data.tenant.id, dough.id, [
      { type: 'ingredient', ingredientId: data.flour.id, inputQuantity: 500, inputUnit: UnitType.G },
    ]);
    await recipes.upsertProductRecipe(data.tenant.id, data.product.id, [
      { type: 'ingredient', ingredientId: data.oil.id, inputQuantity: 350, inputUnit: UnitType.ML },
      { type: 'base', baseId: dough.id, inputQuantity: 250, inputUnit: UnitType.G },
    ]);
    const recipe = await recipes.getProductRecipe(data.tenant.id, data.product.id);
    expect(recipe.components).toHaveLength(2);
    const flourComponent = await prisma.recipeBaseIngredient.findFirstOrThrow({ where: { tenantId: data.tenant.id, baseId: dough.id } });
    expect(flourComponent.inputQuantity.toString()).toBe('500');
    expect(flourComponent.inputUnit).toBe(PrismaUnitType.g);
    expect(flourComponent.quantity.toString()).toBe('0.5');
    const [direct, baseLink] = await Promise.all([
      prisma.productRecipeIngredient.findFirstOrThrow({ where: { tenantId: data.tenant.id, productId: data.product.id } }),
      prisma.productRecipeBase.findFirstOrThrow({ where: { tenantId: data.tenant.id, productId: data.product.id } }),
    ]);
    expect(direct.quantity.toString()).toBe('0.35');
    expect(baseLink.quantity.toString()).toBe('0.25');
    const expanded = await expansion.expandProductRecipeToIngredients(data.tenant.id, data.product.id, new Prisma.Decimal(1));
    expect(expanded.get(data.flour.id)?.toString()).toBe('0.125');
    expect(expanded.get(data.oil.id)?.toString()).toBe('0.35');
    expect((await expansion.calculateExpandedIngredientCost(data.tenant.id, expanded)).totalCost.toString()).toBe('8.25');
  });

  it('rejects cross-dimension and cross-tenant components atomically, but accepts an empty recipe', async () => {
    const first = await fixture('first');
    const second = await fixture('second');
    const expansion = new RecipeExpansionService(prisma as never);
    const recipes = new RecipesService(prisma as never, expansion);
    await recipes.upsertProductRecipe(first.tenant.id, first.product.id, [{ type: 'ingredient', ingredientId: first.flour.id, inputQuantity: 1, inputUnit: UnitType.KG }]);
    await expect(recipes.upsertProductRecipe(first.tenant.id, first.product.id, [{ type: 'ingredient', ingredientId: first.flour.id, inputQuantity: 1, inputUnit: UnitType.ML }])).rejects.toThrow('compatível');
    await expect(recipes.upsertProductRecipe(first.tenant.id, first.product.id, [{ type: 'ingredient', ingredientId: second.flour.id, inputQuantity: 1, inputUnit: UnitType.KG }])).rejects.toThrow('Componente não encontrado');
    expect(await prisma.productRecipeIngredient.findFirstOrThrow({ where: { tenantId: first.tenant.id, productId: first.product.id } })).toMatchObject({ ingredientId: first.flour.id, quantity: new Prisma.Decimal(1) });
    await expect(recipes.upsertProductRecipe(first.tenant.id, first.product.id, [])).resolves.toMatchObject({ components: [] });
  });

  it('locks outputUnit after product or parent references and keeps archived links usable', async () => {
    const data = await fixture('guard');
    const bases = new RecipeBasesService(prisma as never, new RecipeExpansionService(prisma as never));
    const expansion = new RecipeExpansionService(prisma as never);
    const recipes = new RecipesService(prisma as never, expansion);
    const freeBase = await bases.create(data.tenant.id, { name: 'Free sauce', outputUnit: UnitType.L, yieldQuantity: 1 });
    await expect(bases.update(data.tenant.id, freeBase.id, { name: 'Free sauce', outputUnit: UnitType.ML, yieldQuantity: 1000 })).resolves.toMatchObject({ outputUnit: PrismaUnitType.ml });
    const base = await bases.create(data.tenant.id, { name: 'Sauce', outputUnit: UnitType.L, yieldQuantity: 1 });
    await recipes.upsertProductRecipe(data.tenant.id, data.product.id, [{ type: 'base', baseId: base.id, inputQuantity: 250, inputUnit: UnitType.ML }]);
    await expect(bases.update(data.tenant.id, base.id, { name: 'Sauce', outputUnit: UnitType.ML, yieldQuantity: 1 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RECIPE_BASE_OUTPUT_UNIT_LOCKED' }) });
    await expect(bases.update(data.tenant.id, base.id, { name: 'Sauce renamed', outputUnit: UnitType.L, yieldQuantity: 1 })).resolves.toMatchObject({ name: 'Sauce renamed' });
    await bases.archive(data.tenant.id, base.id);
    const secondProduct = await prisma.product.create({ data: { tenantId: data.tenant.id, name: `Second ${randomUUID()}`, slug: `second-${randomUUID()}`, basePrice: 1 } });
    await expect(recipes.upsertProductRecipe(data.tenant.id, secondProduct.id, [{ type: 'base', baseId: base.id, inputQuantity: 250, inputUnit: UnitType.ML }])).rejects.toThrow('arquivada');
    await expect(recipes.getProductRecipe(data.tenant.id, data.product.id)).resolves.toMatchObject({ components: [expect.objectContaining({ type: 'base', isActive: false })] });
    await expect(expansion.expandProductRecipeToIngredients(data.tenant.id, data.product.id, new Prisma.Decimal(1))).resolves.toBeInstanceOf(Map);

    const parent = await bases.create(data.tenant.id, { name: 'Parent', outputUnit: UnitType.L, yieldQuantity: 1 });
    const child = await bases.create(data.tenant.id, { name: 'Child', outputUnit: UnitType.L, yieldQuantity: 1 });
    await bases.replaceComponents(data.tenant.id, parent.id, [{ type: 'base', baseId: child.id, inputQuantity: 250, inputUnit: UnitType.ML }]);
    await expect(bases.update(data.tenant.id, child.id, { name: 'Child', outputUnit: UnitType.ML, yieldQuantity: 1000 })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RECIPE_BASE_OUTPUT_UNIT_LOCKED' }) });
  });
});
