import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockMovementType, UnitType } from '@gestor/types';

type LossEntryDTO = {
  id: string;
  ingredient: { name: string; unit: UnitType };
  quantity: number;
  reason: string;
  createdAt: Date;
  costImpact: number;
};

@Injectable()
export class LossesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<LossEntryDTO[]> {
    const losses = await this.prisma.stockMovement.findMany({
      where: { tenantId, type: StockMovementType.WASTE },
      include: { ingredient: { select: { name: true, unit: true, currentCost: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return losses.map((loss) => ({
      id: loss.id,
      ingredient: {
        name: loss.ingredient.name,
        unit: loss.ingredient.unit as UnitType,
      },
      quantity: Number(loss.quantity),
      reason: loss.notes?.replace(/^Perda:\s*/, '') || 'other',
      createdAt: loss.createdAt,
      costImpact: Number(loss.quantity) * Number(loss.unitCost ?? loss.ingredient.currentCost),
    }));
  }

  async create(tenantId: string, ingredientId: string, quantity: number, reason: string) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('A quantidade da perda deve ser maior que zero.');
    }

    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, tenantId }
    });

    if (!ingredient) throw new NotFoundException('Insumo não encontrado');

    const unitCost = Number(ingredient.currentCost);

    return this.prisma.$transaction(async (tx) => {
      // The availability predicate and decrement are one atomic database write.
      // This prevents concurrent loss requests from oversubscribing the same stock.
      const updatedIngredient = await tx.ingredient.updateMany({
        where: {
          id: ingredientId,
          tenantId,
          currentStock: { gte: quantity },
        },
        data: {
          currentStock: { decrement: quantity }
        }
      });
      if (updatedIngredient.count !== 1) {
        throw new BadRequestException('Estoque insuficiente para registrar a perda.');
      }

      // The movement uses the pre-write ingredient cost as its historical snapshot.
      // The surrounding transaction rolls the decrement back if this write fails.
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
