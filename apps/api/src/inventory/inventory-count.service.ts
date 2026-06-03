import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  InventoryCountDTO, 
  CreateInventoryCountDTO, 
  InventoryCountStatus, 
  StockMovementType,
  UnitType
} from '@gestor/types';
import { Prisma, UnitType as PrismaClientUnitType } from '@prisma/client';

@Injectable()
export class InventoryCountService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<InventoryCountDTO[]> {
    const counts = await this.prisma.inventoryCount.findMany({
      where: { tenantId },
      include: {
        items: {
          include: {
            ingredient: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return counts.map(c => this.mapToDTO(c));
  }

  async findOne(tenantId: string, id: string): Promise<InventoryCountDTO> {
    const count = await this.prisma.inventoryCount.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            ingredient: true
          }
        }
      }
    });

    if (!count) {
      throw new NotFoundException('Inventário não encontrado');
    }

    return this.mapToDTO(count);
  }

  async create(tenantId: string, dto: CreateInventoryCountDTO): Promise<InventoryCountDTO> {
    const ingredientIds = Array.from(new Set(dto.items.map((item) => item.ingredientId)));
    const tenantIngredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, tenantId },
      select: { id: true },
    });
    if (tenantIngredients.length !== ingredientIds.length) {
      throw new NotFoundException('Um ou mais insumos nÃ£o foram encontrados para este tenant');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Inventory Session
      const inventoryCount = await tx.inventoryCount.create({
        data: {
          tenantId,
          status: InventoryCountStatus.CLOSED, // Direct closure for Phase 3 simplicity
          note: dto.note,
          closedAt: new Date(),
          items: {
            create: dto.items.map(item => ({
              tenantId,
              ingredientId: item.ingredientId,
              theoreticalStock: item.theoreticalStock,
              physicalStock: item.physicalStock,
              adjustedQuantity: item.physicalStock - item.theoreticalStock
            }))
          }
        },
        include: {
          items: true
        }
      });

      // 2. Process Adjustments
      for (const item of dto.items) {
        const adjustment = item.physicalStock - item.theoreticalStock;

        if (adjustment !== 0) {
          // Update ingredient stock
          await tx.ingredient.updateMany({
            where: { id: item.ingredientId, tenantId },
            data: {
              currentStock: item.physicalStock // Overwrite with physical count
            }
          });

          // Create stock movement
          await tx.stockMovement.create({
            data: {
              tenantId,
              ingredientId: item.ingredientId,
              type: StockMovementType.INVENTORY_ADJUSTMENT,
              quantity: Math.abs(adjustment),
              notes: `Ajuste via Inventário #${inventoryCount.id}`
            }
          });
        }
      }

      return this.findOne(tenantId, inventoryCount.id);
    });
  }

  private mapUnit(unit: PrismaClientUnitType): UnitType {
    const map: Record<PrismaClientUnitType, UnitType> = {
      [PrismaClientUnitType.un]: UnitType.UN,
      [PrismaClientUnitType.g]: UnitType.G,
      [PrismaClientUnitType.kg]: UnitType.KG,
      [PrismaClientUnitType.ml]: UnitType.ML,
      [PrismaClientUnitType.l]: UnitType.L,
    };
    return map[unit];
  }

  private mapToDTO(c: Prisma.InventoryCountGetPayload<{ include: { items: { include: { ingredient: true } } } }>): InventoryCountDTO {
    return {
      ...c,
      status: c.status as InventoryCountStatus,
      note: c.note ?? undefined,
      closedAt: c.closedAt ?? undefined,
      items: c.items?.map((item) => ({
        ...item,
        theoreticalStock: Number(item.theoreticalStock),
        physicalStock: Number(item.physicalStock),
        adjustedQuantity: Number(item.adjustedQuantity),
        ingredientName: item.ingredient?.name,
        ingredientUnit: item.ingredient?.unit ? this.mapUnit(item.ingredient.unit) : undefined
      }))
    };
  }
}
