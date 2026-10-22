import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType as PrismaUnitType } from '@prisma/client';
import {
  ProductOptionItemRecipeComponentDTO,
  ProductOptionItemRecipeComponentInputDTO,
  ProductOptionItemRecipeDTO,
  UnitType,
} from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import { RecipeExpansionService } from './recipe-expansion.service';
import { normalizeRecipeQuantity } from './recipe-unit-normalization';

@Injectable()
export class ProductOptionItemRecipesService {
  constructor(private readonly prisma: PrismaService, private readonly expansion: RecipeExpansionService) {}

  private unit(unit: PrismaUnitType): UnitType { return unit as UnitType; }

  private async assertContext(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    optionItemId: string,
    requireSelectable: boolean,
  ) {
    const [product, item] = await Promise.all([
      tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null }, select: { id: true } }),
      tx.optionItem.findFirst({
        where: { id: optionItemId, tenantId },
        include: { optionGroup: { select: { id: true, deletedAt: true, isActive: true } } },
      }),
    ]);
    if (!product) throw new NotFoundException('Produto não encontrado.');
    if (!item || !item.optionGroup || item.optionGroup.deletedAt) throw new NotFoundException('Item de opção não encontrado.');
    const link = await tx.productOptionGroupLink.findFirst({
      where: { tenantId, productId, optionGroupId: item.optionGroupId },
      select: { id: true },
    });
    if (!link) throw new BadRequestException('O item não pertence a um grupo vinculado ao produto.');
    const override = await tx.productOptionItemPrice.findUnique({
      where: { productId_optionItemId: { productId, optionItemId } },
      select: { isActive: true },
    });
    if (requireSelectable && (item.deletedAt || !item.isActive || !item.optionGroup.isActive || override?.isActive === false)) {
      throw new ConflictException('Item de opção indisponível não pode receber composição física.');
    }
    return item;
  }

  private mapComponents(
    ingredients: Array<{ id: string; ingredientId: string; inputQuantity: Prisma.Decimal; inputUnit: PrismaUnitType; quantity: Prisma.Decimal; ingredient: { name: string; unit: PrismaUnitType; currentCost: Prisma.Decimal } }>,
    bases: Array<{ id: string; baseId: string; inputQuantity: Prisma.Decimal; inputUnit: PrismaUnitType; quantity: Prisma.Decimal; base: { name: string; outputUnit: PrismaUnitType; isActive: boolean } }>,
  ): ProductOptionItemRecipeComponentDTO[] {
    return [
      ...ingredients.map((item) => ({
        id: item.id, type: 'ingredient' as const, ingredientId: item.ingredientId, ingredientName: item.ingredient.name,
        ingredientUnit: this.unit(item.ingredient.unit), inputQuantity: Number(item.inputQuantity), inputUnit: this.unit(item.inputUnit),
        quantity: Number(item.quantity), normalizedUnit: this.unit(item.ingredient.unit), estimatedCost: Number(item.quantity.mul(item.ingredient.currentCost)),
      })),
      ...bases.map((item) => ({
        id: item.id, type: 'base' as const, baseId: item.baseId, baseName: item.base.name,
        inputQuantity: Number(item.inputQuantity), inputUnit: this.unit(item.inputUnit), quantity: Number(item.quantity),
        normalizedUnit: this.unit(item.base.outputUnit), isActive: item.base.isActive,
      })),
    ];
  }

  async get(tenantId: string, productId: string, optionItemId: string): Promise<ProductOptionItemRecipeDTO> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertContext(tx, tenantId, productId, optionItemId, false);
      const [ingredients, bases] = await Promise.all([
        tx.productOptionItemRecipeIngredient.findMany({ where: { tenantId, productId, optionItemId }, include: { ingredient: true } }),
        tx.productOptionItemRecipeBase.findMany({ where: { tenantId, productId, optionItemId }, include: { base: true } }),
      ]);
      const quantities = await this.expansion.expandProductOptionItemRecipeToIngredients(tenantId, productId, optionItemId, new Prisma.Decimal(1), tx);
      const cost = await this.expansion.calculateExpandedIngredientCost(tenantId, quantities, tx);
      return { productId, optionItemId, components: this.mapComponents(ingredients, bases), totalEstimatedCost: Number(cost.totalCost) };
    });
  }

  async replace(tenantId: string, productId: string, optionItemId: string, components: ProductOptionItemRecipeComponentInputDTO[]): Promise<ProductOptionItemRecipeDTO> {
    if (!Array.isArray(components)) throw new BadRequestException('A composição deve ser uma lista.');
    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe-bases:${tenantId}`}, 0))`;
      await this.assertContext(tx, tenantId, productId, optionItemId, true);
      const ingredients = components.filter((component): component is Extract<ProductOptionItemRecipeComponentInputDTO, { type: 'ingredient' }> => component.type === 'ingredient');
      const bases = components.filter((component): component is Extract<ProductOptionItemRecipeComponentInputDTO, { type: 'base' }> => component.type === 'base');
      if (ingredients.length + bases.length !== components.length) throw new BadRequestException('Tipo de componente inválido.');
      if (new Set(ingredients.map((item) => item.ingredientId)).size !== ingredients.length || new Set(bases.map((item) => item.baseId)).size !== bases.length) {
        throw new BadRequestException('Componentes duplicados não são permitidos.');
      }
      const [storedIngredients, storedBases, existingBases] = await Promise.all([
        tx.ingredient.findMany({ where: { tenantId, id: { in: ingredients.map((item) => item.ingredientId) } } }),
        tx.recipeBase.findMany({ where: { tenantId, id: { in: bases.map((item) => item.baseId) } } }),
        tx.productOptionItemRecipeBase.findMany({ where: { tenantId, productId, optionItemId } }),
      ]);
      if (storedIngredients.length !== ingredients.length || storedBases.length !== bases.length) throw new NotFoundException('Componente não encontrado.');
      const ingredientById = new Map(storedIngredients.map((item) => [item.id, item]));
      const baseById = new Map(storedBases.map((item) => [item.id, item]));
      const existingByBaseId = new Map(existingBases.map((item) => [item.baseId, item]));
      const normalizedIngredients = ingredients.map((item) => {
        const ingredient = ingredientById.get(item.ingredientId);
        if (!ingredient) throw new NotFoundException('Ingrediente não encontrado.');
        return { ...item, quantity: normalizeRecipeQuantity(item.inputQuantity, item.inputUnit as PrismaUnitType, ingredient.unit) };
      });
      const normalizedBases = bases.map((item) => {
        const base = baseById.get(item.baseId);
        if (!base) throw new NotFoundException('Preparação não encontrada.');
        const quantity = normalizeRecipeQuantity(item.inputQuantity, item.inputUnit as PrismaUnitType, base.outputUnit);
        const existing = existingByBaseId.get(item.baseId);
        if (!base.isActive && (!existing || !existing.quantity.equals(quantity))) {
          throw new ConflictException('Preparação arquivada não pode ser adicionada ou alterada na composição.');
        }
        return { ...item, quantity };
      });
      await tx.productOptionItemRecipeIngredient.deleteMany({ where: { tenantId, productId, optionItemId } });
      await tx.productOptionItemRecipeBase.deleteMany({ where: { tenantId, productId, optionItemId } });
      if (normalizedIngredients.length) await tx.productOptionItemRecipeIngredient.createMany({ data: normalizedIngredients.map((item) => ({
        tenantId, productId, optionItemId, ingredientId: item.ingredientId, inputQuantity: new Prisma.Decimal(String(item.inputQuantity)), inputUnit: item.inputUnit as PrismaUnitType, quantity: item.quantity,
      })) });
      if (normalizedBases.length) await tx.productOptionItemRecipeBase.createMany({ data: normalizedBases.map((item) => ({
        tenantId, productId, optionItemId, baseId: item.baseId, inputQuantity: new Prisma.Decimal(String(item.inputQuantity)), inputUnit: item.inputUnit as PrismaUnitType, quantity: item.quantity,
      })) });
      const [resultIngredients, resultBases] = await Promise.all([
        tx.productOptionItemRecipeIngredient.findMany({ where: { tenantId, productId, optionItemId }, include: { ingredient: true } }),
        tx.productOptionItemRecipeBase.findMany({ where: { tenantId, productId, optionItemId }, include: { base: true } }),
      ]);
      const quantities = await this.expansion.expandProductOptionItemRecipeToIngredients(tenantId, productId, optionItemId, new Prisma.Decimal(1), tx);
      const cost = await this.expansion.calculateExpandedIngredientCost(tenantId, quantities, tx);
      return { productId, optionItemId, components: this.mapComponents(resultIngredients, resultBases), totalEstimatedCost: Number(cost.totalCost) };
    });
  }
}
