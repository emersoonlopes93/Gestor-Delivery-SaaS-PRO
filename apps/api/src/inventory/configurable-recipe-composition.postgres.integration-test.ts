import { randomUUID } from 'node:crypto';
import { PrismaClient, UnitType as PrismaUnitType } from '@prisma/client';
import { UnitType } from '@gestor/types';
import { PizzaEngineService } from '../catalog/pizza-engine.service';
import { ConfigurableRecipeCompositionService } from './configurable-recipe-composition.service';
import { ProductOptionItemRecipesService } from './product-option-item-recipes.service';
import { RecipeBasesService } from './recipe-bases.service';
import { RecipeExpansionService } from './recipe-expansion.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);
function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Configurable recipe composition integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Configurable recipe composition PostgreSQL proof', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];
  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture(label: string) {
    const token = `${label}-${randomUUID().slice(0, 8)}`;
    const tenant = await prisma.tenant.create({ data: { name: `Config recipe ${token}`, slug: `config-recipe-${token}` } });
    tenantIds.push(tenant.id);
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: `Drink ${token}`, slug: `drink-${token}`, basePrice: 10 } });
    const sugar = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Sugar ${token}`, sku: `sugar-${token}`, unit: PrismaUnitType.g, currentCost: '0.0100' } });
    const milk = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Milk ${token}`, sku: `milk-${token}`, unit: PrismaUnitType.ml, currentCost: '0.0050' } });
    const group = await prisma.optionGroup.create({ data: { tenantId: tenant.id, name: `Sizes ${token}`, selectionType: 'quantity', maxSelect: 10 } });
    const item = await prisma.optionItem.create({ data: { tenantId: tenant.id, optionGroupId: group.id, name: 'Large', allowQuantity: true } });
    await prisma.productOptionGroupLink.create({ data: { tenantId: tenant.id, productId: product.id, optionGroupId: group.id, pricingAxis: 'primary' } });
    return { tenant, product, sugar, milk, group, item };
  }

  it('persists tenant-scoped contextual recipes, normalizes units, and expands quantities additively', async () => {
    const data = await fixture('generic');
    await prisma.productRecipeIngredient.create({ data: { tenantId: data.tenant.id, productId: data.product.id, ingredientId: data.sugar.id, inputQuantity: '10', inputUnit: UnitType.G, quantity: '10' } });
    const expansion = new RecipeExpansionService(prisma as never);
    const authoring = new ProductOptionItemRecipesService(prisma as never, expansion);
    await authoring.replace(data.tenant.id, data.product.id, data.item.id, [
      { type: 'ingredient', ingredientId: data.milk.id, inputQuantity: 0.5, inputUnit: UnitType.L },
    ]);
    const stored = await prisma.productOptionItemRecipeIngredient.findFirstOrThrow({ where: { tenantId: data.tenant.id, productId: data.product.id, optionItemId: data.item.id } });
    expect(stored.inputQuantity.toString()).toBe('0.5');
    expect(stored.quantity.toString()).toBe('500');
    const resolver = new ConfigurableRecipeCompositionService(prisma as never, expansion, new PizzaEngineService({ tenantClient: prisma } as never));
    const resolved = await resolver.resolveProductComposition(data.tenant.id, {
      productId: data.product.id, productQuantity: 2,
      selections: [{ optionGroupId: data.group.id, items: [{ optionItemId: data.item.id, qty: 2 }] }],
    });
    expect(resolved.get(data.sugar.id)?.toString()).toBe('20');
    expect(resolved.get(data.milk.id)?.toString()).toBe('2000');
    await expect(authoring.replace(data.tenant.id, data.product.id, data.item.id, [
      { type: 'ingredient', ingredientId: data.milk.id, inputQuantity: 1, inputUnit: UnitType.G },
    ])).rejects.toThrow('compatível');
    expect((await prisma.productOptionItemRecipeIngredient.findFirstOrThrow({ where: { id: stored.id } })).quantity.toString()).toBe('500');
  });

  it('applies pizza size recipes by flavor fractions without counting the root product', async () => {
    const token = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `Pizza recipe ${token}`, slug: `pizza-recipe-${token}` } });
    tenantIds.push(tenant.id);
    const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: `Pizza ${token}`, slug: `pizza-${token}`, templateType: 'pizza', templateConfig: { pricingStrategy: 'sum_halves' } } });
    const flour = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Flour ${token}`, sku: `flour-${token}`, unit: PrismaUnitType.g, currentCost: '0.01' } });
    const box = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Box ${token}`, sku: `box-${token}`, unit: PrismaUnitType.un, currentCost: '1' } });
    const group = await prisma.optionGroup.create({ data: { tenantId: tenant.id, name: `Pizza size ${token}`, selectionType: 'single', maxSelect: 1 } });
    const size = await prisma.optionItem.create({ data: { tenantId: tenant.id, optionGroupId: group.id, name: 'Grande' } });
    const [first, second] = await Promise.all(['A', 'B'].map((suffix) => prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name: `Flavor ${suffix}`, slug: `flavor-${suffix}-${token}`, basePrice: 20 } })));
    await prisma.productOptionGroupLink.createMany({ data: [first, second].map((product) => ({ tenantId: tenant.id, productId: product.id, optionGroupId: group.id, pricingAxis: 'primary' })) });
    await prisma.productRecipeIngredient.createMany({ data: [first, second].map((product) => ({ tenantId: tenant.id, productId: product.id, ingredientId: flour.id, inputQuantity: '300', inputUnit: UnitType.G, quantity: '300' })) });
    await prisma.productOptionItemRecipeIngredient.createMany({ data: [first, second].map((product) => ({ tenantId: tenant.id, productId: product.id, optionItemId: size.id, ingredientId: box.id, inputQuantity: '1', inputUnit: UnitType.UN, quantity: '1' })) });
    const expansion = new RecipeExpansionService(prisma as never);
    const resolver = new ConfigurableRecipeCompositionService(prisma as never, expansion, new PizzaEngineService({ tenantClient: prisma } as never));
    const resolved = await resolver.resolveProductComposition(tenant.id, {
      productId: first.id, productQuantity: 1,
      pizzaComposition: { sizeId: size.id, flavors: [{ productId: first.id, fraction: 0.5 }, { productId: second.id, fraction: 0.5 }] },
    });
    expect(resolved.get(flour.id)?.toString()).toBe('300');
    expect(resolved.get(box.id)?.toString()).toBe('1');
  });

  it('locks a contextual base output unit without changing its persisted recipe contribution', async () => {
    const data = await fixture('contextual-base-unit-lock');
    const base = await prisma.recipeBase.create({
      data: { tenantId: data.tenant.id, name: 'Massa', outputUnit: PrismaUnitType.kg, yieldQuantity: '1' },
    });
    const contextual = await prisma.productOptionItemRecipeBase.create({
      data: {
        tenantId: data.tenant.id,
        productId: data.product.id,
        optionItemId: data.item.id,
        baseId: base.id,
        inputQuantity: '0.5',
        inputUnit: PrismaUnitType.kg,
        quantity: '0.5',
      },
    });
    const recipeBases = new RecipeBasesService(prisma as never);

    await expect(recipeBases.update(data.tenant.id, base.id, {
      name: base.name,
      outputUnit: UnitType.KG,
      yieldQuantity: 1,
    })).resolves.toMatchObject({ outputUnit: PrismaUnitType.kg });

    await expect(recipeBases.update(data.tenant.id, base.id, {
      name: base.name,
      outputUnit: UnitType.G,
      yieldQuantity: 1,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RECIPE_BASE_OUTPUT_UNIT_LOCKED' }) });

    expect((await prisma.recipeBase.findUniqueOrThrow({ where: { id: base.id } })).outputUnit).toBe(PrismaUnitType.kg);
    expect((await prisma.productOptionItemRecipeBase.findUniqueOrThrow({ where: { id: contextual.id } })).quantity.toString()).toBe('0.5');

    const unreferenced = await prisma.recipeBase.create({
      data: { tenantId: data.tenant.id, name: 'Livre', outputUnit: PrismaUnitType.kg, yieldQuantity: '1' },
    });
    await expect(recipeBases.update(data.tenant.id, unreferenced.id, {
      name: unreferenced.name,
      outputUnit: UnitType.G,
      yieldQuantity: 1,
    })).resolves.toMatchObject({ outputUnit: PrismaUnitType.g });
  });
});
