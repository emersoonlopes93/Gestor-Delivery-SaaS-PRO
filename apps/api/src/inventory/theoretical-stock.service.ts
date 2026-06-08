import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockMovementType } from '@gestor/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class TheoreticalStockService {
  private readonly logger = new Logger(TheoreticalStockService.name);

  constructor(private prisma: PrismaService) {}

  async processOrderDepletion(tenantId: string, orderId: string) {
    this.logger.log(`Processing theoretical stock depletion for order ${orderId}`);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: true,
      },
    });

    if (!order) return;

    for (const item of order.items) {
      // 1. Resolve Product Recipe
      if (item.productId) {
        await this.applyRecipeDepletion(tenantId, orderId, 'product', item.productId, Number(item.quantity));
      }

      // 2. Resolve Combo V3 Slots (from snapshot)
      if (item.snapshotCatalogV2Json) {
        const v2 = item.snapshotCatalogV2Json as any;
        if (v2.slots && Array.isArray(v2.slots)) {
          for (const slot of v2.slots) {
            if (slot.items && Array.isArray(slot.items)) {
              for (const slotItem of slot.items) {
                if (slotItem.productId) {
                  // Os slots abatem como 'product' baseado na quantidade escolhida * a quantidade do item principal
                  await this.applyRecipeDepletion(tenantId, orderId, 'product', slotItem.productId, Number(item.quantity) * Number(slotItem.qty || 1));
                }
              }
            }
          }
        }
      }
    }
  }

  async reverseOrderDepletion(tenantId: string, orderId: string) {
    this.logger.log(`Reversing theoretical stock depletion for order ${orderId}`);

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        orderId,
        tenantId,
        type: StockMovementType.THEORETICAL_DEPLETION,
      },
    });

    for (const move of movements) {
      const qtyToReturn = Number(move.quantity);

      await this.prisma.$transaction(async (tx) => {
        // 1. Delete or nullify the depletion movement
        // We delete to "undo" the history if it was just a cancellation
        await tx.stockMovement.delete({
          where: { id: move.id },
        });

        // 2. Increment physical stock back
        await tx.ingredient.update({
          where: { id: move.ingredientId },
          data: {
            currentStock: {
              increment: qtyToReturn,
            },
          },
        });
      });
    }
  }

  private async applyRecipeDepletion(
    tenantId: string, 
    orderId: string, 
    type: 'product', 
    id: string,
    quantityMultiplier: number
  ) {
    let recipeItems: Array<{ ingredientId: string; quantity: Prisma.Decimal }> = [];

    if (type === 'product') {
      recipeItems = await this.prisma.productRecipeIngredient.findMany({ where: { productId: id, tenantId } });
    }

    for (const recipeItem of recipeItems) {
      const consumptionQty = Number(recipeItem.quantity) * quantityMultiplier;

      await this.prisma.$transaction(async (tx) => {
        // 0. Get current cost from ingredient
        const ingredient = await tx.ingredient.findUnique({
          where: { id: recipeItem.ingredientId },
          select: { currentCost: true }
        });
        const unitCost = ingredient?.currentCost ? Number(ingredient.currentCost) : 0;

        // 1. Create movement
        await tx.stockMovement.create({
          data: {
            tenantId,
            ingredientId: recipeItem.ingredientId,
            type: StockMovementType.THEORETICAL_DEPLETION,
            quantity: consumptionQty,
            unitCost: unitCost,
            orderId,
            notes: `Baixa teórica via pedido ${orderId}`,
          },
        });

        // 2. Decrement physical materialized stock
        await tx.ingredient.update({
          where: { id: recipeItem.ingredientId },
          data: {
            currentStock: {
              decrement: consumptionQty,
            },
          },
        });
      });
    }
  }
}
