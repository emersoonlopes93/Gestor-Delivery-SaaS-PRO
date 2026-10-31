import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HistoricalCmvCoverage, Prisma } from '@prisma/client';
import { StockMovementType } from '@gestor/types';
import { ComboComponentEligibilityService } from '../catalog/combo-component-eligibility.service';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import {
  ConfigurableRecipeCompositionService,
  type ConfigurableRecipeSelection,
} from './configurable-recipe-composition.service';

type JsonRecord = Record<string, Prisma.JsonValue>;

function isRecord(value: Prisma.JsonValue | null): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function positiveIntegerString(value: Prisma.JsonValue | undefined, label: string): string {
  if (value === undefined || value === null || (typeof value !== 'number' && typeof value !== 'string')) {
    throw new BadRequestException(`${label} deve ser um inteiro positivo.`);
  }
  const decimal = new Prisma.Decimal(typeof value === 'number' ? String(value) : value);
  if (!decimal.isFinite() || !decimal.isInteger() || decimal.lte(0)) {
    throw new BadRequestException(`${label} deve ser um inteiro positivo.`);
  }
  return decimal.toString();
}

const PHYSICAL_QUANTITY_SCALE = 6;
const PHYSICAL_QUANTITY_MAX_INTEGER_DIGITS = 8;
const PHYSICAL_QUANTITY_MAX = new Prisma.Decimal(10).pow(PHYSICAL_QUANTITY_MAX_INTEGER_DIGITS);

export function quantizePhysicalStockQuantity(quantity: Prisma.Decimal): Prisma.Decimal {
  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new BadRequestException('Quantidade física expandida deve ser finita e positiva.');
  }
  if (quantity.gte(PHYSICAL_QUANTITY_MAX)) {
    throw new BadRequestException('Quantidade física excede a faixa suportada pelo estoque.');
  }
  const persisted = quantity.toDecimalPlaces(PHYSICAL_QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
  if (!persisted.isFinite() || persisted.lte(0)) {
    throw new BadRequestException('Quantidade física é menor que a precisão mínima suportada pelo estoque.');
  }
  if (persisted.gte(PHYSICAL_QUANTITY_MAX) || persisted.decimalPlaces() > PHYSICAL_QUANTITY_SCALE) {
    throw new BadRequestException('Quantidade física não pode ser persistida com segurança no estoque.');
  }
  return persisted;
}

/**
 * Canonical physical stock ledger. It reads only persisted order snapshots and
 * delegates all recipe expansion to ConfigurableRecipeCompositionService.
 */
@Injectable()
export class TheoreticalStockService {
  private readonly logger = new Logger(TheoreticalStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly composition: ConfigurableRecipeCompositionService,
    private readonly comboEligibility: ComboComponentEligibilityService,
  ) {}

  async processOrderDepletion(tenantId: string, orderId: string): Promise<void> {
    this.logger.log(`Processing theoretical stock depletion for order ${orderId}`);
    await runSerializableTransactionWithRetry(
      this.prisma,
      (tx) => this.processOrderDepletionInTransaction(tx, tenantId, orderId),
      { onRetry: (attempt, delayMs) => this.logger.warn(`Retrying theoretical stock depletion for order ${orderId} after P2034 (attempt ${attempt + 1}/3, backoff ${delayMs}ms)`) },
    );
  }

  async processOrderDepletionInTransaction(tx: Prisma.TransactionClient, tenantId: string, orderId: string): Promise<void> {
    await this.lockOrderInTransaction(tx, tenantId, orderId);
    const existingMovements = await tx.stockMovement.count({
      where: { tenantId, orderId, type: StockMovementType.THEORETICAL_DEPLETION },
    });
    if (existingMovements > 0) {
      this.logger.debug(`Theoretical stock was already depleted for order ${orderId}`);
      return;
    }
    await this.depleteCurrentOrderItemsInTransaction(tx, tenantId, orderId);
  }

  async reconcileOrderDepletionInTransaction(tx: Prisma.TransactionClient, tenantId: string, orderId: string): Promise<void> {
    await this.lockOrderInTransaction(tx, tenantId, orderId);
    await this.reverseActiveOrderDepletionInTransaction(tx, tenantId, orderId, `Theoretical reversal for reconciled order ${orderId}`);
    await this.depleteCurrentOrderItemsInTransaction(tx, tenantId, orderId);
  }

  async reverseOrderDepletion(tenantId: string, orderId: string): Promise<void> {
    this.logger.log(`Reversing theoretical stock depletion for order ${orderId}`);
    await runSerializableTransactionWithRetry(
      this.prisma,
      (tx) => this.reverseOrderDepletionInTransaction(tx, tenantId, orderId),
      { onRetry: (attempt, delayMs) => this.logger.warn(`Retrying theoretical stock reversal for order ${orderId} after P2034 (attempt ${attempt + 1}/3, backoff ${delayMs}ms)`) },
    );
  }

  async reverseOrderDepletionInTransaction(tx: Prisma.TransactionClient, tenantId: string, orderId: string): Promise<void> {
    await this.lockOrderInTransaction(tx, tenantId, orderId);
    await this.reverseActiveOrderDepletionInTransaction(tx, tenantId, orderId, `Theoretical reversal for cancelled order ${orderId}`);
  }

  /**
   * Serializes every operation that can observe or mutate an order's physical
   * consumption. Callers must keep this lock for the whole transaction.
   */
  async lockOrderInTransaction(tx: Prisma.TransactionClient, tenantId: string, orderId: string): Promise<void> {
    const lockKey = `${tenantId}:${orderId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private add(target: Map<string, Prisma.Decimal>, source: ReadonlyMap<string, Prisma.Decimal>): void {
    for (const [ingredientId, quantity] of source) {
      target.set(ingredientId, (target.get(ingredientId) ?? new Prisma.Decimal(0)).plus(quantity));
    }
  }

  private selectionsFromSnapshot(snapshot: JsonRecord): ConfigurableRecipeSelection[] {
    const rawSelections = snapshot.selections;
    if (rawSelections === undefined || rawSelections === null) return [];
    if (!Array.isArray(rawSelections)) throw new BadRequestException('Snapshot de opções do pedido é inválido para baixa de estoque.');
    return rawSelections.map((rawSelection) => {
      if (!isRecord(rawSelection)) throw new BadRequestException('Snapshot de opções do pedido é inválido para baixa de estoque.');
      const optionGroupId = stringValue(rawSelection.groupId);
      const rawItems = rawSelection.items;
      if (!optionGroupId || !Array.isArray(rawItems)) throw new BadRequestException('Snapshot de opções do pedido não possui IDs suficientes para baixa de estoque.');
      return {
        optionGroupId,
        items: rawItems.map((rawItem) => {
          if (!isRecord(rawItem)) throw new BadRequestException('Snapshot de opção inválido para baixa de estoque.');
          const optionItemId = stringValue(rawItem.itemId);
          if (!optionItemId) throw new BadRequestException('Snapshot de opção não possui ID suficiente para baixa de estoque.');
          return { optionItemId, qty: positiveIntegerString(rawItem.qty, 'Quantidade da opção') };
        }),
      };
    });
  }

  private pizzaFromSnapshot(snapshot: JsonRecord): { sizeId: string; flavors: Array<{ productId: string; fraction: number }> } | undefined {
    const rawPizza = snapshot.pizzaComposition;
    if (rawPizza === undefined || rawPizza === null) return undefined;
    if (!isRecord(rawPizza)) throw new BadRequestException('Snapshot de pizza inválido para baixa de estoque.');
    const sizeId = stringValue(rawPizza.sizeId);
    const rawFlavors = rawPizza.flavors;
    if (!sizeId || !Array.isArray(rawFlavors)) throw new BadRequestException('Snapshot de pizza não possui IDs suficientes para baixa de estoque.');
    return {
      sizeId,
      flavors: rawFlavors.map((rawFlavor) => {
        if (!isRecord(rawFlavor)) throw new BadRequestException('Snapshot de sabor inválido para baixa de estoque.');
        const productId = stringValue(rawFlavor.productId);
        const fraction = rawFlavor.fraction;
        if (!productId || typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction <= 0) {
          throw new BadRequestException('Snapshot de pizza não possui IDs ou frações válidas para baixa de estoque.');
        }
        return { productId, fraction };
      }),
    };
  }

  private async resolveProductItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    itemQuantity: number,
    snapshot: Prisma.JsonValue | null,
  ): Promise<Map<string, Prisma.Decimal>> {
    const data = isRecord(snapshot) ? snapshot : null;
    const route = (await this.comboEligibility.getProductConfigurationRoutes(tenantId, [productId], { requireActive: false })).get(productId);
    if (route === 'generic' && (!data || !Array.isArray(data.selections))) {
      throw new BadRequestException('Snapshot legado de produto configurável não possui seleções suficientes para baixa de estoque.');
    }
    if (route === 'combo') {
      throw new BadRequestException('Produto de combo deve usar snapshot de componentes para baixa de estoque.');
    }
    return this.composition.resolveProductComposition(tenantId, {
      productId,
      productQuantity: new Prisma.Decimal(itemQuantity),
      selections: data ? this.selectionsFromSnapshot(data) : [],
      pizzaComposition: data ? this.pizzaFromSnapshot(data) : undefined,
    }, tx);
  }

  private async resolveComboComponents(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemQuantity: number,
    snapshot: Prisma.JsonValue | null,
  ): Promise<Map<string, Prisma.Decimal>> {
    if (!isRecord(snapshot)) throw new BadRequestException('Snapshot legado de combo não possui componentes suficientes para baixa de estoque.');
    const componentCollections = [snapshot.slots, snapshot.bundleItems].filter((value): value is Prisma.JsonArray => Array.isArray(value));
    if (!componentCollections.length) throw new BadRequestException('Snapshot de combo não possui componentes suficientes para baixa de estoque.');

    const components: Array<{ productId: string; qty: string }> = [];
    for (const collection of componentCollections) {
      for (const rawCollectionItem of collection) {
        if (!isRecord(rawCollectionItem)) throw new BadRequestException('Snapshot de combo inválido para baixa de estoque.');
        const rawItems = Array.isArray(rawCollectionItem.items) ? rawCollectionItem.items : [rawCollectionItem];
        for (const rawItem of rawItems) {
          if (!isRecord(rawItem)) throw new BadRequestException('Componente de combo inválido para baixa de estoque.');
          const productId = stringValue(rawItem.productId);
          if (!productId) throw new BadRequestException('Componente de combo não possui produto identificável para baixa de estoque.');
          components.push({ productId, qty: positiveIntegerString(rawItem.qty, 'Quantidade do componente do combo') });
        }
      }
    }
    if (!components.length) throw new BadRequestException('Snapshot de combo não possui componentes suficientes para baixa de estoque.');
    await this.comboEligibility.assertEligibleProductIds(tenantId, components.map((component) => component.productId));

    const result = new Map<string, Prisma.Decimal>();
    for (const component of components) {
      const quantity = new Prisma.Decimal(component.qty).mul(itemQuantity);
      this.add(result, await this.composition.resolveProductComposition(tenantId, {
        productId: component.productId,
        productQuantity: quantity,
      }, tx));
    }
    return result;
  }

  private async depleteCurrentOrderItemsInTransaction(tx: Prisma.TransactionClient, tenantId: string, orderId: string): Promise<void> {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId }, include: { items: true } });
    if (!order) return;

    const consumptionByIngredient = new Map<string, Prisma.Decimal>();
    let hasIncompleteCoverage = false;
    for (const item of order.items) {
      if (item.lineType === 'product') {
        if (!item.productId) {
          // Unmapped marketplace items must never receive an inferred recipe.
          // Persist PARTIAL coverage on any resolved sibling consumption.
          hasIncompleteCoverage = true;
          continue;
        }
        const resolved = await this.resolveProductItem(tx, tenantId, item.productId, item.quantity, item.snapshotCatalogV2Json);
        if (!resolved.size) hasIncompleteCoverage = true;
        this.add(consumptionByIngredient, resolved);
        continue;
      }
      if (item.lineType === 'combo') {
        const resolved = await this.resolveComboComponents(tx, tenantId, item.quantity, item.snapshotCatalogV2Json);
        if (!resolved.size) hasIncompleteCoverage = true;
        this.add(consumptionByIngredient, resolved);
      }
    }
    if (!consumptionByIngredient.size) return;

    const persistedConsumptionByIngredient = new Map<string, Prisma.Decimal>();
    for (const [ingredientId, expandedQuantity] of consumptionByIngredient) {
      persistedConsumptionByIngredient.set(ingredientId, quantizePhysicalStockQuantity(expandedQuantity));
    }

    const ingredientIds = [...persistedConsumptionByIngredient.keys()];
    const ingredients = await tx.ingredient.findMany({
      where: { tenantId, id: { in: ingredientIds } },
      select: { id: true, currentCost: true, currentCostEvidence: true },
    });
    if (ingredients.length !== ingredientIds.length) throw new BadRequestException('Ingrediente da receita não encontrado para este tenant.');
    const costByIngredient = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    const orderCmvCoverage = hasIncompleteCoverage ? HistoricalCmvCoverage.partial : HistoricalCmvCoverage.known;

    for (const [ingredientId, quantity] of persistedConsumptionByIngredient) {
      const updated = await tx.ingredient.updateMany({
        where: { id: ingredientId, tenantId, currentStock: { gte: quantity } },
        data: { currentStock: { decrement: quantity } },
      });
      if (updated.count !== 1) throw new BadRequestException('Estoque insuficiente para confirmar este pedido.');
    }
    await tx.stockMovement.createMany({
      data: [...persistedConsumptionByIngredient].map(([ingredientId, quantity]) => ({
        tenantId,
        ingredientId,
        type: StockMovementType.THEORETICAL_DEPLETION,
        quantity,
        unitCost: costByIngredient.get(ingredientId)?.currentCost ?? new Prisma.Decimal(0),
        costEvidence: costByIngredient.get(ingredientId)?.currentCostEvidence,
        orderCmvCoverage,
        orderId,
        notes: `Baixa teórica via pedido ${orderId}`,
      })),
    });
  }

  private async reverseActiveOrderDepletionInTransaction(tx: Prisma.TransactionClient, tenantId: string, orderId: string, note: string): Promise<void> {
    const movements = await tx.stockMovement.findMany({
      where: { orderId, tenantId, type: StockMovementType.THEORETICAL_DEPLETION },
      include: { reversal: true },
    });
    for (const move of movements) {
      if (move.reversal) continue;
      await tx.stockMovement.create({ data: {
        tenantId, ingredientId: move.ingredientId, type: StockMovementType.THEORETICAL_REVERSAL,
        quantity: move.quantity, unitCost: move.unitCost, costEvidence: move.costEvidence,
        orderCmvCoverage: move.orderCmvCoverage, orderId: move.orderId,
        reversalOfMovementId: move.id, notes: note,
      } });
      const restored = await tx.ingredient.updateMany({ where: { id: move.ingredientId, tenantId }, data: { currentStock: { increment: move.quantity } } });
      if (restored.count !== 1) throw new BadRequestException('Ingrediente da baixa teórica não foi encontrado para este tenant.');
    }
  }
}
