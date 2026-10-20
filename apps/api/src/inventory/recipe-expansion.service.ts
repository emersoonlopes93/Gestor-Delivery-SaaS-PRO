import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const MAX_BASE_DEPTH = 10;
type RecipeReader = PrismaService | Prisma.TransactionClient;
type LoadedRecipeBase = Prisma.RecipeBaseGetPayload<{
  include: {
    ingredients: { include: { ingredient: true } };
    childDependencies: { include: { componentBase: true } };
  };
}>;

export interface ExpandedIngredientCost {
  ingredientId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}

export interface ExpandedRecipeCost {
  totalCost: Prisma.Decimal;
  ingredients: ExpandedIngredientCost[];
}

/** Read-only canonical expansion of persisted recipes into physical ingredients. */
@Injectable()
export class RecipeExpansionService {
  constructor(private readonly prisma: PrismaService) {}

  private reader(client?: Prisma.TransactionClient): RecipeReader {
    return client ?? this.prisma;
  }

  private positive(value: Prisma.Decimal, label: string): void {
    if (!value.isFinite() || value.lte(0)) throw new ConflictException(`${label} deve ser maior que zero.`);
  }

  private add(result: Map<string, Prisma.Decimal>, ingredientId: string, quantity: Prisma.Decimal): void {
    result.set(ingredientId, (result.get(ingredientId) ?? new Prisma.Decimal(0)).plus(quantity));
  }

  private async expandBase(
    reader: RecipeReader,
    tenantId: string,
    baseId: string,
    requestedOutput: Prisma.Decimal,
    result: Map<string, Prisma.Decimal>,
    visiting: Set<string>,
    depth: number,
    cache: Map<string, LoadedRecipeBase | null>,
  ): Promise<void> {
    if (depth > MAX_BASE_DEPTH) throw new ConflictException('A profundidade máxima de preparações foi excedida.');
    if (visiting.has(baseId)) throw new ConflictException('Ciclo detectado na composição de preparações.');
    this.positive(requestedOutput, 'Consumo da preparação');

    let base = cache.get(baseId);
    if (base === undefined) {
      base = await reader.recipeBase.findFirst({
        where: { id: baseId, tenantId },
        include: {
          ingredients: { include: { ingredient: true } },
          childDependencies: { include: { componentBase: true } },
        },
      });
      cache.set(baseId, base);
    }
    if (!base) throw new NotFoundException('Preparação não encontrada.');
    this.positive(base.yieldQuantity, 'Rendimento da preparação');
    const scale = requestedOutput.div(base.yieldQuantity);
    const nextVisiting = new Set(visiting).add(baseId);

    for (const component of base.ingredients) {
      if (component.tenantId !== tenantId || component.ingredient.tenantId !== tenantId) throw new NotFoundException('Componente não encontrado.');
      this.positive(component.quantity, 'Quantidade do componente');
      this.add(result, component.ingredientId, component.quantity.mul(scale));
    }
    for (const dependency of base.childDependencies) {
      if (dependency.tenantId !== tenantId || dependency.componentBase.tenantId !== tenantId) throw new NotFoundException('Preparação componente não encontrada.');
      this.positive(dependency.quantity, 'Quantidade do componente');
      await this.expandBase(reader, tenantId, dependency.componentBaseId, dependency.quantity.mul(scale), result, nextVisiting, depth + 1, cache);
    }
  }

  async expandProductRecipeToIngredients(
    tenantId: string,
    productId: string,
    productQuantity: Prisma.Decimal,
    client?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    this.positive(productQuantity, 'Quantidade do produto');
    const reader = this.reader(client);
    const product = await reader.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const [directIngredients, baseLinks] = await Promise.all([
      reader.productRecipeIngredient.findMany({ where: { tenantId, productId }, include: { ingredient: true } }),
      reader.productRecipeBase.findMany({ where: { tenantId, productId }, include: { base: true } }),
    ]);
    const result = new Map<string, Prisma.Decimal>();
    for (const item of directIngredients) {
      if (item.ingredient.tenantId !== tenantId) throw new NotFoundException('Componente não encontrado.');
      this.positive(item.quantity, 'Quantidade do ingrediente');
      this.add(result, item.ingredientId, item.quantity.mul(productQuantity));
    }
    const cache = new Map<string, LoadedRecipeBase | null>();
    for (const link of baseLinks) {
      if (link.base.tenantId !== tenantId) throw new NotFoundException('Preparação não encontrada.');
      this.positive(link.quantity, 'Quantidade da preparação');
      await this.expandBase(reader, tenantId, link.baseId, link.quantity.mul(productQuantity), result, new Set(), 0, cache);
    }
    return result;
  }

  async calculateExpandedIngredientCost(
    tenantId: string,
    quantities: ReadonlyMap<string, Prisma.Decimal>,
    client?: Prisma.TransactionClient,
  ): Promise<ExpandedRecipeCost> {
    const ids = [...quantities.keys()];
    if (!ids.length) return { totalCost: new Prisma.Decimal(0), ingredients: [] };
    const ingredients = await this.reader(client).ingredient.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, currentCost: true } });
    if (ingredients.length !== ids.length) throw new NotFoundException('Ingrediente não encontrado.');
    const costs = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.currentCost]));
    const breakdown = ids.map((ingredientId) => {
      const quantity = quantities.get(ingredientId);
      const unitCost = costs.get(ingredientId);
      if (!quantity || !unitCost) throw new NotFoundException('Ingrediente não encontrado.');
      return { ingredientId, quantity, unitCost, totalCost: quantity.mul(unitCost) };
    });
    return { totalCost: breakdown.reduce((total, item) => total.plus(item.totalCost), new Prisma.Decimal(0)), ingredients: breakdown };
  }
}
