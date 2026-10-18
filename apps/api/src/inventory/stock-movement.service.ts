import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType as PrismaStockMovementType, type StockMovement } from '@prisma/client';
import { CreateStockMovementDTO, StockMovementDTO, StockMovementType } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import { weightedAverageCost } from './weighted-average-cost';

const MANUAL_MOVEMENT_TYPES = new Set<StockMovementType>([
  StockMovementType.IN,
  StockMovementType.OUT,
  StockMovementType.WASTE,
]);

@Injectable()
export class StockMovementService {
  constructor(private prisma: PrismaService) {}

  private mapType(type: PrismaStockMovementType): StockMovementType {
    switch (type) {
      case PrismaStockMovementType.in: return StockMovementType.IN;
      case PrismaStockMovementType.out: return StockMovementType.OUT;
      case PrismaStockMovementType.adjust: return StockMovementType.ADJUST;
      case PrismaStockMovementType.waste: return StockMovementType.WASTE;
      case PrismaStockMovementType.theoretical_depletion: return StockMovementType.THEORETICAL_DEPLETION;
      case PrismaStockMovementType.theoretical_reversal: return StockMovementType.THEORETICAL_REVERSAL;
      case PrismaStockMovementType.purchase_entry: return StockMovementType.PURCHASE_ENTRY;
      case PrismaStockMovementType.purchase_reversal: return StockMovementType.PURCHASE_REVERSAL;
      case PrismaStockMovementType.inventory_adjustment: return StockMovementType.INVENTORY_ADJUSTMENT;
      default: return StockMovementType.ADJUST;
    }
  }

  async createManual(tenantId: string, userId: string, dto: CreateStockMovementDTO): Promise<StockMovementDTO> {
    if (!MANUAL_MOVEMENT_TYPES.has(dto.type)) {
      throw new BadRequestException('Tipo de movimento manual nao permitido. Use entrada, saida ou perda.');
    }
    const quantity = this.positiveDecimal(dto.quantity, 'Quantidade');
    const suppliedCost = dto.unitCost === undefined ? undefined : this.nonNegativeDecimal(dto.unitCost, 'Custo unitario');

    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const lockKey = `${tenantId}:ingredient:${dto.ingredientId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const ingredient = await tx.ingredient.findFirst({
        where: { id: dto.ingredientId, tenantId },
        select: { id: true, currentStock: true, currentCost: true },
      });
      if (!ingredient) throw new NotFoundException('Insumo nao encontrado');

      const isOutgoing = dto.type === StockMovementType.OUT || dto.type === StockMovementType.WASTE;
      if (isOutgoing && ingredient.currentStock.lessThan(quantity)) {
        throw new ConflictException('Estoque insuficiente para registrar este movimento.');
      }
      const effectiveUnitCost = isOutgoing ? ingredient.currentCost : suppliedCost ?? ingredient.currentCost;
      const nextCost = dto.type === StockMovementType.IN
        ? weightedAverageCost(ingredient.currentStock, ingredient.currentCost, quantity, effectiveUnitCost)
        : ingredient.currentCost;
      const updated = await tx.ingredient.updateMany({
        where: isOutgoing
          ? { id: ingredient.id, tenantId, currentStock: { gte: quantity } }
          : { id: ingredient.id, tenantId },
        data: isOutgoing
          ? { currentStock: { decrement: quantity } }
          : { currentStock: { increment: quantity }, currentCost: nextCost },
      });
      if (updated.count !== 1) throw new ConflictException('Estoque mudou durante o movimento; tente novamente.');
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          ingredientId: ingredient.id,
          type: dto.type,
          quantity,
          unitCost: effectiveUnitCost,
          notes: dto.notes,
          userId,
        },
      });
      return this.mapToDTO(movement);
    });
  }

  async findAll(tenantId: string, ingredientId?: string): Promise<Array<StockMovementDTO & { ingredient?: { name: string } }>> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { tenantId, ...(ingredientId ? { ingredientId } : {}) },
      include: { ingredient: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return movements.map((movement) => this.mapToDTO(movement));
  }

  private positiveDecimal(value: number, label: string): Prisma.Decimal {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0) || (decimal.decimalPlaces() ?? 0) > 4) {
      throw new BadRequestException(`${label} invalida.`);
    }
    return decimal;
  }

  private nonNegativeDecimal(value: number, label: string): Prisma.Decimal {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite() || decimal.lessThan(0) || (decimal.decimalPlaces() ?? 0) > 4) {
      throw new BadRequestException(`${label} invalido.`);
    }
    return decimal;
  }

  private mapToDTO(movement: StockMovement & { ingredient?: { name: string } }): StockMovementDTO & { ingredient?: { name: string } } {
    return {
      ...movement,
      type: this.mapType(movement.type),
      orderId: movement.orderId ?? undefined,
      userId: movement.userId ?? undefined,
      notes: movement.notes ?? undefined,
      quantity: Number(movement.quantity),
      unitCost: movement.unitCost ? Number(movement.unitCost) : undefined,
      ingredient: movement.ingredient,
    };
  }
}
