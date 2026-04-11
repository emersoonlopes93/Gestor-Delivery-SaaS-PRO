import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockMovementType } from '@gestor/core';

@Injectable()
export class TheoreticalStockService {
  private readonly logger = new Logger(TheoreticalStockService.name);

  constructor(private prisma: PrismaService) {}

  async processOrderDepletion(tenantId: string, orderId: string) {
    this.logger.log(`Processing theoretical stock depletion for order ${orderId}`);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: {
            complements: true,
            comboSelections: true,
          },
        },
      },
    });

    if (!order) return;

    for (const item of order.items) {
      // 1. Resolve Product Recipe
      if (item.productId) {
        await this.applyRecipeDepletion(tenantId, orderId, 'product', item.productId, item.quantity);
      }

      // 2. Resolve Complements
      for (const comp of item.complements) {
        await this.applyRecipeDepletion(tenantId, orderId, 'complement', comp.complementItemId, item.quantity);
      }

      // 3. Resolve Combo Selections
      if (item.comboId) {
        // First: Combo-specific items (box, specific combo packaging)
        await this.applyRecipeDepletion(tenantId, orderId, 'combo', item.comboId, item.quantity);

        // Second: The items selected within the combo
        for (const selection of item.comboSelections) {
          // Note: combo_block_item links to product. We find the product from the block item or snapshot.
          // Since we might need the actual product ID for the recipe:
          const blockItem = await this.prisma.productComboBlockItem.findUnique({
            where: { id: selection.comboBlockItemId },
          });
          
          if (blockItem) {
            await this.applyRecipeDepletion(tenantId, orderId, 'product', blockItem.productId, item.quantity);
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
    type: 'product' | 'complement' | 'combo', 
    id: string,
    quantityMultiplier: number
  ) {
    let recipeItems: { ingredientId: string; quantity: any }[] = [];

    if (type === 'product') {
      recipeItems = await this.prisma.productRecipeIngredient.findMany({ where: { productId: id, tenantId } });
    } else if (type === 'complement') {
      recipeItems = await this.prisma.complementRecipeIngredient.findMany({ where: { complementItemId: id, tenantId } });
    } else if (type === 'combo') {
      recipeItems = await this.prisma.comboRecipeIngredient.findMany({ where: { comboId: id, tenantId } });
    }

    for (const recipeItem of recipeItems) {
      const consumptionQty = Number(recipeItem.quantity) * quantityMultiplier;

      await this.prisma.$transaction(async (tx) => {
        // 1. Create movement
        await tx.stockMovement.create({
          data: {
            tenantId,
            ingredientId: recipeItem.ingredientId,
            type: StockMovementType.THEORETICAL_DEPLETION,
            quantity: consumptionQty,
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
