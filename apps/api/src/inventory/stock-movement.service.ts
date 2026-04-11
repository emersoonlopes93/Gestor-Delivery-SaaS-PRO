import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateStockMovementDTO, StockMovementDTO } from '@gestor/types';
import { StockMovementType } from '@gestor/core';

@Injectable()
export class StockMovementService {
  constructor(private prisma: PrismaService) {}

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

  async findAll(tenantId: string, ingredientId?: string): Promise<StockMovementDTO[]> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { 
        tenantId,
        ...(ingredientId ? { ingredientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Safety limit
    });

    return movements.map(m => this.mapToDTO(m));
  }

  private mapToDTO(m: any): StockMovementDTO {
    return {
      ...m,
      quantity: Number(m.quantity),
      unitCost: m.unitCost ? Number(m.unitCost) : undefined,
    };
  }
}
