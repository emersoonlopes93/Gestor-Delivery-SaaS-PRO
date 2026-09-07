import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockMovementType } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

@Injectable()
export class TheoreticalStockService {
  private readonly logger = new Logger(TheoreticalStockService.name);

  constructor(private prisma: PrismaService) {}

  async processOrderDepletion(tenantId: string, orderId: string): Promise<void> {
    this.logger.log(`Processing theoretical stock depletion for order ${orderId}`);

    await runSerializableTransactionWithRetry(
      this.prisma,
      (tx) => this.processOrderDepletionInTransaction(tx, tenantId, orderId),
      {
        onRetry: (attempt, delayMs) => this.logger.warn(
          `Retrying theoretical stock depletion for order ${orderId} after P2034 (attempt ${attempt + 1}/3, backoff ${delayMs}ms)`,
        ),
      },
    );
  }

  async processOrderDepletionInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
  ): Promise<void> {
    const lockKey = `${tenantId}:${orderId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const existingMovements = await tx.stockMovement.count({
      where: {
        tenantId,
        orderId,
        type: StockMovementType.THEORETICAL_DEPLETION,
      },
    });

    if (existingMovements > 0) {
      this.logger.debug(`Theoretical stock was already depleted for order ${orderId}`);
      return;
    }

    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: true,
      },
    });

    if (!order) return;

    const consumptionByIngredient = new Map<string, number>();

    for (const item of order.items) {
      // 1. Resolve Product Recipe
      if (item.productId) {
        await this.addRecipeConsumption(
          tx,
          tenantId,
          item.productId,
          Number(item.quantity),
          consumptionByIngredient,
        );
      }

      // 2. Resolve Combo V3 Slots (from snapshot)
      if (item.snapshotCatalogV2Json) {
        const v2 = item.snapshotCatalogV2Json as { slots?: Array<{ slotName: string; items?: Array<{ productId?: string; qty?: number }> }> };
        if (v2.slots && Array.isArray(v2.slots)) {
          for (const slot of v2.slots) {
            if (slot.items && Array.isArray(slot.items)) {
              for (const slotItem of slot.items) {
                if (slotItem.productId) {
                  // Os slots abatem como 'product' baseado na quantidade escolhida * a quantidade do item principal
                  await this.addRecipeConsumption(
                    tx,
                    tenantId,
                    slotItem.productId,
                    Number(item.quantity) * Number(slotItem.qty || 1),
                    consumptionByIngredient,
                  );
                }
              }
            }
          }
        }
      }
    }

    if (consumptionByIngredient.size === 0) return;

    const ingredientIds = Array.from(consumptionByIngredient.keys());
    const ingredients = await tx.ingredient.findMany({
      where: { tenantId, id: { in: ingredientIds } },
      select: { id: true, currentCost: true },
    });
    const costByIngredient = new Map(
      ingredients.map((ingredient) => [ingredient.id, Number(ingredient.currentCost)]),
    );

    if (costByIngredient.size !== ingredientIds.length) {
      throw new BadRequestException('Ingrediente da receita não encontrado para este tenant.');
    }

    for (const [ingredientId, quantity] of consumptionByIngredient) {
      const updated = await tx.ingredient.updateMany({
        where: {
          id: ingredientId,
          tenantId,
          currentStock: { gte: quantity },
        },
        data: { currentStock: { decrement: quantity } },
      });

      if (updated.count !== 1) {
        throw new BadRequestException('Estoque insuficiente para confirmar este pedido.');
      }
    }

    await tx.stockMovement.createMany({
      data: Array.from(consumptionByIngredient, ([ingredientId, quantity]) => ({
        tenantId,
        ingredientId,
        type: StockMovementType.THEORETICAL_DEPLETION,
        quantity,
        unitCost: costByIngredient.get(ingredientId) || 0,
        orderId,
        notes: `Baixa teórica via pedido ${orderId}`,
      })),
    });
  }

  async reverseOrderDepletion(tenantId: string, orderId: string): Promise<void> {
    this.logger.log(`Reversing theoretical stock depletion for order ${orderId}`);

    await runSerializableTransactionWithRetry(
      this.prisma,
      (tx) => this.reverseOrderDepletionInTransaction(tx, tenantId, orderId),
      {
        onRetry: (attempt, delayMs) => this.logger.warn(
          `Retrying theoretical stock reversal for order ${orderId} after P2034 (attempt ${attempt + 1}/3, backoff ${delayMs}ms)`,
        ),
      },
    );
  }

  async reverseOrderDepletionInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
  ): Promise<void> {
    const lockKey = `${tenantId}:${orderId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const movements = await tx.stockMovement.findMany({
      where: {
        orderId,
        tenantId,
        type: StockMovementType.THEORETICAL_DEPLETION,
      },
      include: { reversal: true },
    });

    for (const move of movements) {
      if (move.reversal) continue;

      await tx.stockMovement.create({
        data: {
          tenantId,
          ingredientId: move.ingredientId,
          type: StockMovementType.THEORETICAL_REVERSAL,
          quantity: move.quantity,
          unitCost: move.unitCost,
          orderId: move.orderId,
          reversalOfMovementId: move.id,
          notes: `Theoretical reversal for cancelled order ${orderId}`,
        },
      });
      const restored = await tx.ingredient.updateMany({
        where: { id: move.ingredientId, tenantId },
        data: {
          currentStock: {
            increment: move.quantity,
          },
        },
      });
      if (restored.count !== 1) {
        throw new BadRequestException('Ingredient from theoretical depletion was not found for this tenant.');
      }
    }
  }

  private async addRecipeConsumption(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    quantityMultiplier: number,
    consumptionByIngredient: Map<string, number>,
  ): Promise<void> {
    const recipeItems: Array<{ ingredientId: string; quantity: Prisma.Decimal }> =
      await tx.productRecipeIngredient.findMany({
        where: { productId, tenantId },
      });

    for (const recipeItem of recipeItems) {
      const quantity = Number(recipeItem.quantity) * quantityMultiplier;
      consumptionByIngredient.set(
        recipeItem.ingredientId,
        (consumptionByIngredient.get(recipeItem.ingredientId) || 0) + quantity,
      );
    }
  }
}
