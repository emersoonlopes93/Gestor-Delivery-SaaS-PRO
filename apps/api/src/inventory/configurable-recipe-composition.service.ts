import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PizzaCompositionDTO } from '@gestor/types';
import { PizzaEngineService } from '../catalog/pizza-engine.service';
import { PrismaService } from '../database/prisma.service';
import { RecipeExpansionService } from './recipe-expansion.service';

export interface ConfigurableRecipeSelection {
  optionGroupId: string;
  items: Array<{ optionItemId: string; qty?: number | string | Prisma.Decimal }>;
}

export interface ConfigurableRecipeCompositionInput {
  productId: string;
  productQuantity: number | string | Prisma.Decimal;
  selections?: ConfigurableRecipeSelection[];
  pizzaComposition?: PizzaCompositionDTO;
}

@Injectable()
export class ConfigurableRecipeCompositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expansion: RecipeExpansionService,
    private readonly pizzaEngine: PizzaEngineService,
  ) {}

  private positive(value: number | string | Prisma.Decimal, label: string): Prisma.Decimal {
    const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
    if (!decimal.isFinite() || decimal.lte(0)) throw new BadRequestException(`${label} deve ser maior que zero.`);
    return decimal;
  }

  private add(target: Map<string, Prisma.Decimal>, source: ReadonlyMap<string, Prisma.Decimal>, multiplier: Prisma.Decimal) {
    for (const [ingredientId, quantity] of source) {
      target.set(ingredientId, (target.get(ingredientId) ?? new Prisma.Decimal(0)).plus(quantity.mul(multiplier)));
    }
  }

  async resolveProductComposition(
    tenantId: string,
    input: ConfigurableRecipeCompositionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    const reader = tx ?? this.prisma;
    const productQuantity = this.positive(input.productQuantity, 'Quantidade do produto');
    const product = await reader.product.findFirst({
      where: { id: input.productId, tenantId, deletedAt: null },
      include: { category: { select: { id: true, templateType: true } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    if (product.category?.templateType === 'pizza') {
      if (!input.pizzaComposition) throw new BadRequestException('Composição de pizza é obrigatória para resolver a receita física.');
      if ((input.selections?.length ?? 0) > 0) throw new BadRequestException('Seleções genéricas de pizza ainda não são suportadas na composição física.');
      // The engine remains the canonical structural validator. Price is deliberately ignored.
      await this.pizzaEngine.calculatePrice(product.category.id, input.pizzaComposition.sizeId, input.pizzaComposition.flavors);
      const result = new Map<string, Prisma.Decimal>();
      for (const flavor of input.pizzaComposition.flavors) {
        const fraction = this.positive(String(flavor.fraction), 'Fração do sabor');
        const fixed = await this.expansion.expandProductRecipeToIngredients(tenantId, flavor.productId, new Prisma.Decimal(1), tx);
        const contextual = await this.expansion.expandProductOptionItemRecipeToIngredients(tenantId, flavor.productId, input.pizzaComposition.sizeId, new Prisma.Decimal(1), tx);
        this.add(result, fixed, fraction);
        this.add(result, contextual, fraction);
      }
      const final = new Map<string, Prisma.Decimal>();
      this.add(final, result, productQuantity);
      return final;
    }

    const result = await this.expansion.expandProductRecipeToIngredients(tenantId, input.productId, new Prisma.Decimal(1), tx);
    const selections = input.selections ?? [];
    if (new Set(selections.map((selection) => selection.optionGroupId)).size !== selections.length) throw new BadRequestException('Grupos de opção duplicados não são permitidos.');
    const seenItems = new Set<string>();
    for (const selection of selections) {
      const link = await reader.productOptionGroupLink.findFirst({
        where: { tenantId, productId: input.productId, optionGroupId: selection.optionGroupId, optionGroup: { isActive: true, deletedAt: null } },
        select: { id: true },
      });
      if (!link) throw new BadRequestException('Grupo de opção inválido para este produto.');
      for (const selected of selection.items) {
        if (seenItems.has(selected.optionItemId)) throw new BadRequestException('Itens de opção duplicados não são permitidos.');
        seenItems.add(selected.optionItemId);
        const quantity = this.positive(selected.qty ?? 1, 'Quantidade da opção');
        if (!quantity.isInteger()) throw new BadRequestException('Quantidade da opção deve ser inteira.');
        const item = await reader.optionItem.findFirst({
          where: { id: selected.optionItemId, tenantId, optionGroupId: selection.optionGroupId, isActive: true, deletedAt: null },
          select: { id: true, allowQuantity: true },
        });
        if (!item) throw new BadRequestException('Item de opção inválido.');
        const override = await reader.productOptionItemPrice.findUnique({ where: { productId_optionItemId: { productId: input.productId, optionItemId: item.id } }, select: { isActive: true } });
        if (override?.isActive === false) throw new BadRequestException('Item de opção indisponível.');
        if (quantity.gt(1) && !item.allowQuantity) throw new BadRequestException('Este item não permite quantidade maior que um.');
        const contextual = await this.expansion.expandProductOptionItemRecipeToIngredients(tenantId, input.productId, item.id, quantity, tx);
        this.add(result, contextual, new Prisma.Decimal(1));
      }
    }
    const final = new Map<string, Prisma.Decimal>();
    this.add(final, result, productQuantity);
    return final;
  }

  async calculateConfiguredCost(tenantId: string, input: ConfigurableRecipeCompositionInput, tx?: Prisma.TransactionClient) {
    const quantities = await this.resolveProductComposition(tenantId, input, tx);
    return this.expansion.calculateExpandedIngredientCost(tenantId, quantities, tx);
  }
}
