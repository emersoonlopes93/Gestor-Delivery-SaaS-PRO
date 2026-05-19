import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateStockMovementDTO, StockMovementDTO, StockMovementType } from '@gestor/types';
import type { StockMovement } from '@prisma/client';
import { StockMovementType as PrismaStockMovementType } from '@prisma/client';

@Injectable()
export class StockMovementService {
  constructor(private prisma: PrismaService) {}

  private mapType(type: PrismaStockMovementType): StockMovementType {
    switch (type) {
      case PrismaStockMovementType.in:
        return StockMovementType.IN;
      case PrismaStockMovementType.out:
        return StockMovementType.OUT;
      case PrismaStockMovementType.adjust:
        return StockMovementType.ADJUST;
      case PrismaStockMovementType.waste:
        return StockMovementType.WASTE;
      case PrismaStockMovementType.theoretical_depletion:
        return StockMovementType.THEORETICAL_DEPLETION;
      case PrismaStockMovementType.purchase_entry:
        return StockMovementType.PURCHASE_ENTRY;
      case PrismaStockMovementType.inventory_adjustment:
        return StockMovementType.INVENTORY_ADJUSTMENT;
      default:
        // Fallback para garantir retorno de StockMovementType
        return StockMovementType.ADJUST;
    }
  }

  async createManual(tenantId: string, userId: string, dto: CreateStockMovementDTO): Promise<StockMovementDTO> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: dto.ingredientId, tenantId },
    });

    if (!ingredient) {
      throw new NotFoundException('Insumo não encontrado');
    }

    // Determine quantity multiplier (out and waste are negative)
    const multiplier = [StockMovementType.OUT, StockMovementType.WASTE].includes(dto.type) ? -1 : 1;
    const qtyChange = Number(dto.quantity) * multiplier;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create movement record
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          ingredientId: dto.ingredientId,
          type: dto.type,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          notes: dto.notes,
          userId,
        },
      });

      // 2. Update materialized stock balance
      await tx.ingredient.update({
        where: { id: dto.ingredientId },
        data: {
          currentStock: {
            increment: qtyChange,
          },
          // If it's an IN movement, update currentCost if provided
          ...(dto.type === StockMovementType.IN && dto.unitCost ? { currentCost: dto.unitCost } : {}),
        },
      });

      return this.mapToDTO(movement);
    });
  }

  async findAll(tenantId: string, ingredientId?: string): Promise<Array<StockMovementDTO & { ingredient?: { name: string } }>> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { 
        tenantId,
        ...(ingredientId ? { ingredientId } : {}),
      },
      include: {
        ingredient: {
          select: { name: true }
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Safety limit
    });

    return movements.map(m => this.mapToDTO(m));
  }

  private mapToDTO(m: StockMovement & { ingredient?: { name: string } }): StockMovementDTO & { ingredient?: { name: string } } {
    return {
      ...m,
      type: this.mapType(m.type),
      orderId: m.orderId ?? undefined,
      userId: m.userId ?? undefined,
      notes: m.notes ?? undefined,
      quantity: Number(m.quantity),
      unitCost: m.unitCost ? Number(m.unitCost) : undefined,
      ingredient: m.ingredient,
    };
  }
}
