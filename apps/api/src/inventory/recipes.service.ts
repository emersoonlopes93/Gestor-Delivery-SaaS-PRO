import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType as PrismaUnitType } from '@prisma/client';
import { ProductRecipeComponentDTO, ProductRecipeComponentInputDTO, ProductRecipeDTO, ProductRecipeDraftCostPreviewDTO, UnitType } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import { RecipeExpansionService } from './recipe-expansion.service';
import { normalizeRecipeQuantity } from './recipe-unit-normalization';

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expansion: RecipeExpansionService,
  ) {}

  private mapUnit(unit: PrismaUnitType): UnitType { return unit as UnitType; }

  async getProductRecipe(tenantId: string, productId: string): Promise<ProductRecipeDTO> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const [ingredients, bases] = await Promise.all([
      this.prisma.productRecipeIngredient.findMany({ where: { productId, tenantId }, include: { ingredient: true } }),
      this.prisma.productRecipeBase.findMany({ where: { productId, tenantId }, include: { base: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const total = await this.calculateProductTotalCostDecimal(tenantId, productId);
    return { productId, components: this.mapComponents(ingredients, bases), totalEstimatedCost: Number(total) };
  }

  /**
   * Read-only preview for the recipe editor. Draft components are normalized
   * server-side and reusable bases are expanded through the canonical engine;
   * nothing is persisted and no stock/cost ledger is touched.
   */
  async previewProductRecipeCost(
    tenantId: string,
    productId: string,
    components: ProductRecipeComponentInputDTO[],
  ): Promise<ProductRecipeDraftCostPreviewDTO> {
    if (!Array.isArray(components)) throw new BadRequestException('A ficha técnica deve ser uma lista.');
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const ingredients = components.filter((item): item is Extract<ProductRecipeComponentInputDTO, { type: 'ingredient' }> => item.type === 'ingredient');
    const bases = components.filter((item): item is Extract<ProductRecipeComponentInputDTO, { type: 'base' }> => item.type === 'base');
    if (ingredients.length + bases.length !== components.length) throw new BadRequestException('Tipo de componente inválido.');
    if (new Set(ingredients.map((item) => item.ingredientId)).size !== ingredients.length || new Set(bases.map((item) => item.baseId)).size !== bases.length) {
      throw new BadRequestException('Componentes duplicados não são permitidos.');
    }

    const [foundIngredients, foundBases] = await Promise.all([
      this.prisma.ingredient.findMany({ where: { tenantId, id: { in: ingredients.map((item) => item.ingredientId) } } }),
      this.prisma.recipeBase.findMany({ where: { tenantId, id: { in: bases.map((item) => item.baseId) } } }),
    ]);
    if (foundIngredients.length !== ingredients.length || foundBases.length !== bases.length) throw new NotFoundException('Componente não encontrado.');

    const ingredientById = new Map(foundIngredients.map((item) => [item.id, item]));
    const baseById = new Map(foundBases.map((item) => [item.id, item]));
    const quantities = new Map<string, Prisma.Decimal>();
    const addQuantity = (ingredientId: string, quantity: Prisma.Decimal) => quantities.set(ingredientId, (quantities.get(ingredientId) ?? new Prisma.Decimal(0)).plus(quantity));

    for (const component of ingredients) {
      const ingredient = ingredientById.get(component.ingredientId);
      if (!ingredient) throw new NotFoundException('Ingrediente não encontrado.');
      addQuantity(component.ingredientId, normalizeRecipeQuantity(component.inputQuantity, component.inputUnit as PrismaUnitType, ingredient.unit));
    }
    for (const component of bases) {
      const base = baseById.get(component.baseId);
      if (!base) throw new NotFoundException('Preparação não encontrada.');
      if (!base.isActive) throw new ConflictException('Preparação arquivada não pode ser usada no preview da ficha técnica.');
      const requestedOutput = normalizeRecipeQuantity(component.inputQuantity, component.inputUnit as PrismaUnitType, base.outputUnit);
      const expanded = await this.expansion.expandRecipeBaseToIngredients(tenantId, base.id, requestedOutput);
      for (const [ingredientId, quantity] of expanded) addQuantity(ingredientId, quantity);
    }

    const cost = await this.expansion.calculateExpandedIngredientCostCoverage(tenantId, quantities);
    return {
      coverage: cost.coverage,
      estimatedTotalCost: cost.estimatedTotalCost?.toNumber() ?? null,
      partialEstimatedTotalCost: cost.partialEstimatedTotalCost?.toNumber() ?? null,
      knownIngredientCount: cost.knownIngredientCount,
      unknownIngredientCount: cost.unknownIngredientCount,
      basis: 'CURRENT_INGREDIENT_COSTS',
    };
  }

  async upsertProductRecipe(tenantId: string, productId: string, components: ProductRecipeComponentInputDTO[]): Promise<ProductRecipeDTO> {
    if (!Array.isArray(components)) throw new BadRequestException('A ficha técnica deve ser uma lista.');
    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      // Shares the base-composition lock so a product link cannot race an outputUnit change.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe-bases:${tenantId}`}, 0))`;
      const product = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
      if (!product) throw new NotFoundException('Produto não encontrado.');
      const ingredients = components.filter((item): item is Extract<ProductRecipeComponentInputDTO, { type: 'ingredient' }> => item.type === 'ingredient');
      const bases = components.filter((item): item is Extract<ProductRecipeComponentInputDTO, { type: 'base' }> => item.type === 'base');
      if (ingredients.length + bases.length !== components.length) throw new BadRequestException('Tipo de componente inválido.');
      if (new Set(ingredients.map((item) => item.ingredientId)).size !== ingredients.length || new Set(bases.map((item) => item.baseId)).size !== bases.length) {
        throw new BadRequestException('Componentes duplicados não são permitidos.');
      }
      const [foundIngredients, foundBases, existingBaseLinks] = await Promise.all([
        tx.ingredient.findMany({ where: { tenantId, id: { in: ingredients.map((item) => item.ingredientId) } } }),
        tx.recipeBase.findMany({ where: { tenantId, id: { in: bases.map((item) => item.baseId) } } }),
        tx.productRecipeBase.findMany({ where: { tenantId, productId } }),
      ]);
      if (foundIngredients.length !== ingredients.length || foundBases.length !== bases.length) throw new NotFoundException('Componente não encontrado.');
      const ingredientsById = new Map(foundIngredients.map((item) => [item.id, item]));
      const basesById = new Map(foundBases.map((item) => [item.id, item]));
      const existingByBase = new Map(existingBaseLinks.map((item) => [item.baseId, item]));
      const normalizedIngredients = ingredients.map((item) => {
        const ingredient = ingredientsById.get(item.ingredientId);
        if (!ingredient) throw new NotFoundException('Ingrediente não encontrado.');
        return { ...item, quantity: normalizeRecipeQuantity(item.inputQuantity, item.inputUnit as PrismaUnitType, ingredient.unit) };
      });
      const normalizedBases = bases.map((item) => {
        const base = basesById.get(item.baseId);
        if (!base) throw new NotFoundException('Preparação não encontrada.');
        const quantity = normalizeRecipeQuantity(item.inputQuantity, item.inputUnit as PrismaUnitType, base.outputUnit);
        const existing = existingByBase.get(item.baseId);
        if (!base.isActive && (!existing || !existing.quantity.equals(quantity))) {
          throw new ConflictException('Preparação arquivada não pode ser adicionada ou alterada na ficha técnica.');
        }
        return { ...item, quantity };
      });
      await tx.productRecipeIngredient.deleteMany({ where: { productId, tenantId } });
      await tx.productRecipeBase.deleteMany({ where: { productId, tenantId } });
      if (normalizedIngredients.length) await tx.productRecipeIngredient.createMany({ data: normalizedIngredients.map((item) => ({
        tenantId, productId, ingredientId: item.ingredientId, inputQuantity: new Prisma.Decimal(String(item.inputQuantity)), inputUnit: item.inputUnit as PrismaUnitType, quantity: item.quantity,
      })) });
      if (normalizedBases.length) await tx.productRecipeBase.createMany({ data: normalizedBases.map((item) => ({
        tenantId, productId, baseId: item.baseId, inputQuantity: new Prisma.Decimal(String(item.inputQuantity)), inputUnit: item.inputUnit as PrismaUnitType, quantity: item.quantity,
      })) });
      const [storedIngredients, storedBases] = await Promise.all([
      tx.productRecipeIngredient.findMany({ where: { productId, tenantId }, include: { ingredient: true } }),
        tx.productRecipeBase.findMany({ where: { productId, tenantId }, include: { base: true }, orderBy: { createdAt: 'asc' } }),
      ]);
      const quantities = await this.expansion.expandProductRecipeToIngredients(tenantId, productId, new Prisma.Decimal(1), tx);
      const cost = await this.expansion.calculateExpandedIngredientCost(tenantId, quantities, tx);
      return { productId, components: this.mapComponents(storedIngredients, storedBases), totalEstimatedCost: Number(cost.totalCost) };
    });
  }

  private mapComponents(
    ingredients: Array<{ id: string; ingredientId: string; inputQuantity: Prisma.Decimal; inputUnit: PrismaUnitType; quantity: Prisma.Decimal; ingredient: { name: string; unit: PrismaUnitType; currentCost: Prisma.Decimal } }>,
    bases: Array<{ id: string; baseId: string; inputQuantity: Prisma.Decimal; inputUnit: PrismaUnitType; quantity: Prisma.Decimal; base: { name: string; outputUnit: PrismaUnitType; isActive: boolean } }>,
  ): ProductRecipeComponentDTO[] {
    return [
      ...ingredients.map((item) => ({ id: item.id, type: 'ingredient' as const, ingredientId: item.ingredientId, ingredientName: item.ingredient.name, ingredientUnit: this.mapUnit(item.ingredient.unit), inputQuantity: Number(item.inputQuantity ?? item.quantity), inputUnit: this.mapUnit(item.inputUnit ?? item.ingredient.unit), quantity: Number(item.quantity), normalizedUnit: this.mapUnit(item.ingredient.unit), estimatedCost: Number(item.quantity.mul(item.ingredient.currentCost)) })),
      ...bases.map((item) => ({ id: item.id, type: 'base' as const, baseId: item.baseId, baseName: item.base.name, inputQuantity: Number(item.inputQuantity ?? item.quantity), inputUnit: this.mapUnit(item.inputUnit ?? item.base.outputUnit), quantity: Number(item.quantity), normalizedUnit: this.mapUnit(item.base.outputUnit), isActive: item.base.isActive })),
    ];
  }

  private async calculateProductTotalCostDecimal(tenantId: string, productId: string): Promise<Prisma.Decimal> {
    const quantities = await this.expansion.expandProductRecipeToIngredients(tenantId, productId, new Prisma.Decimal(1));
    const cost = await this.expansion.calculateExpandedIngredientCost(tenantId, quantities);
    return cost.totalCost;
  }

  async calculateProductTotalCost(tenantId: string, productId: string): Promise<number> {
    return Number(await this.calculateProductTotalCostDecimal(tenantId, productId));
  }
}
