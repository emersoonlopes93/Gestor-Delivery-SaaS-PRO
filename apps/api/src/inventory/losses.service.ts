import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockMovementType } from '@gestor/types';

@Injectable()
export class LossesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, ingredientId: string, quantity: number, reason: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, tenantId }
    });

    if (!ingredient) throw new NotFoundException('Insumo não encontrado');

    const unitCost = Number(ingredient.currentCost);

    return this.prisma.$transaction(async (tx) => {
      // 1. Update stock
      await tx.ingredient.updateMany({
        where: { id: ingredientId, tenantId },
        data: {
          currentStock: { decrement: quantity }
        }
      });

      // 2. Create Waste Movement
      return tx.stockMovement.create({
        data: {
          tenantId,
          ingredientId,
          type: StockMovementType.WASTE,
          quantity: quantity,
          unitCost: unitCost,
          notes: `Perda: ${reason}`
        }
      });
    });
  }
}
