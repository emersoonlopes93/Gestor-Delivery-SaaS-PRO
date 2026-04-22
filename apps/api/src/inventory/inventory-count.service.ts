import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  InventoryCountDTO, 
  CreateInventoryCountDTO, 
  InventoryCountStatus, 
  StockMovementType,
  UnitType
} from '@gestor/types';

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
          await tx.ingredient.update({
            where: { id: item.ingredientId },
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

  private mapToDTO(c: any): InventoryCountDTO {
    return {
      ...c,
      items: c.items?.map((item: any) => ({
        ...item,
        theoreticalStock: Number(item.theoreticalStock),
        physicalStock: Number(item.physicalStock),
        adjustedQuantity: Number(item.adjustedQuantity),
        ingredientName: item.ingredient?.name,
        ingredientUnit: item.ingredient?.unit as any
      }))
    };
  }
}
