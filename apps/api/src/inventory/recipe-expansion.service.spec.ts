import { Prisma } from '@prisma/client';
import { RecipeExpansionService } from './recipe-expansion.service';

const decimal = (value: string) => new Prisma.Decimal(value);

describe('RecipeExpansionService', () => {
  const tenantId = 'tenant-a';

  function reader() {
    const ingredients = new Map([
      ['tomato', { id: 'tomato', tenantId, currentCost: decimal('0.01') }],
      ['oil', { id: 'oil', tenantId, currentCost: decimal('0.05') }],
    ]);
    const bases = new Map([
      ['base-a', {
        id: 'base-a', tenantId, yieldQuantity: decimal('1000'),
        ingredients: [{ tenantId, ingredientId: 'tomato', quantity: decimal('700'), ingredient: ingredients.get('tomato') }],
        childDependencies: [],
      }],
      ['base-b', {
        id: 'base-b', tenantId, yieldQuantity: decimal('500'), ingredients: [{ tenantId, ingredientId: 'oil', quantity: decimal('50'), ingredient: ingredients.get('oil') }],
        childDependencies: [{ tenantId, componentBaseId: 'base-a', quantity: decimal('200'), componentBase: { id: 'base-a', tenantId } }],
      }],
    ]);
    return {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-a' }) },
      productRecipeIngredient: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'tomato', quantity: decimal('1'), ingredient: ingredients.get('tomato') }]) },
      productRecipeBase: { findMany: jest.fn().mockResolvedValue([{ baseId: 'base-b', quantity: decimal('100'), base: { id: 'base-b', tenantId } }]) },
      recipeBase: { findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(bases.get(where.id) ?? null)) },
      ingredient: { findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ingredients.get(id)).filter(Boolean))) },
    };
  }

  it('expands nested bases and aggregates direct ingredients without Number arithmetic', async () => {
    const service = new RecipeExpansionService(reader() as never);
    const expanded = await service.expandProductRecipeToIngredients(tenantId, 'product-a', decimal('2'));
    expect(expanded.get('tomato')?.toString()).toBe('58');
    expect(expanded.get('oil')?.toString()).toBe('20');
  });

  it('derives current cost separately and rejects non-positive product quantities', async () => {
    const service = new RecipeExpansionService(reader() as never);
    const cost = await service.calculateExpandedIngredientCost(tenantId, new Map([['tomato', decimal('56')], ['oil', decimal('8')]]));
    expect(cost.totalCost.toString()).toBe('0.96');
    await expect(service.expandProductRecipeToIngredients(tenantId, 'product-a', decimal('0'))).rejects.toThrow('maior que zero');
  });

  it('fails closed for cycles and for a base deeper than the persisted contract allows', async () => {
    const cycleReader = reader();
    cycleReader.recipeBase.findFirst.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({
      id: where.id, tenantId, yieldQuantity: decimal('1'), ingredients: [],
      childDependencies: [{ tenantId, componentBaseId: where.id, quantity: decimal('1'), componentBase: { id: where.id, tenantId } }],
    }));
    const cycleService = new RecipeExpansionService(cycleReader as never);
    await expect(cycleService.expandProductRecipeToIngredients(tenantId, 'product-a', decimal('1'))).rejects.toThrow('Ciclo detectado');

    const depthReader = reader();
    depthReader.recipeBase.findFirst.mockImplementation(({ where }: { where: { id: string } }) => {
      const depth = Number(where.id.slice(6));
      return Promise.resolve({
        id: where.id, tenantId, yieldQuantity: decimal('1'), ingredients: [],
        childDependencies: depth === 11 ? [] : [{ tenantId, componentBaseId: `depth-${depth + 1}`, quantity: decimal('1'), componentBase: { id: `depth-${depth + 1}`, tenantId } }],
      });
    });
    depthReader.productRecipeBase.findMany.mockResolvedValue([{ baseId: 'depth-0', quantity: decimal('1'), base: { id: 'depth-0', tenantId } }]);
    const depthService = new RecipeExpansionService(depthReader as never);
    await expect(depthService.expandProductRecipeToIngredients(tenantId, 'product-a', decimal('1'))).rejects.toThrow('profundidade máxima');
  });
});
