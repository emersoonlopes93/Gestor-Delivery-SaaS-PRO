import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  PurchaseDTO, 
  CreatePurchaseDTO, 
  UpdatePurchaseDTO, 
  PurchaseStatus, 
  PaymentStatus, 
  StockMovementType,
  FinancialTransactionType,
  FinancialStatus
} from '@gestor/types';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<PurchaseDTO[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        items: {
          include: {
            ingredient: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return purchases.map(p => this.mapToDTO(p));
  }

  async findOne(tenantId: string, id: string): Promise<PurchaseDTO> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        items: {
          include: {
            ingredient: true
          }
        }
      }
    });

    if (!purchase) {
      throw new NotFoundException('Compra não encontrada');
    }

    return this.mapToDTO(purchase);
  }

  async create(tenantId: string, dto: CreatePurchaseDTO): Promise<PurchaseDTO> {
    const totalValue = dto.items.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Purchase
      const purchase = await tx.purchase.create({
        data: {
          tenantId,
          supplierId: dto.supplierId,
          number: dto.number,
          totalValue,
          status: PurchaseStatus.RECEIVED, // For Phase 3, we assume direct reception for simplicity
          paymentStatus: dto.paymentStatus || PaymentStatus.PAID,
          purchaseDate: dto.purchaseDate || new Date(),
          items: {
            create: dto.items.map(item => ({
              tenantId,
              ingredientId: item.ingredientId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.quantity * item.unitCost,
              expiryDate: item.expiryDate
            }))
          }
        },
        include: {
          items: true
        }
      });

      // 2. Process each item (Stock + Cost)
      for (const item of dto.items) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: item.ingredientId }
        });

        if (!ingredient) throw new NotFoundException(`Insumo ${item.ingredientId} não encontrado`);

        const oldStock = Number(ingredient.currentStock);
        const oldCost = Number(ingredient.currentCost);
        const newQty = Number(item.quantity);
        const newPrice = Number(item.unitCost);

        // Calculate Weighted Average Cost
        // If oldStock <= 0, the new price becomes the new avg cost
        let finalAvgCost = newPrice;
        if (oldStock > 0) {
          finalAvgCost = (oldStock * oldCost + newQty * newPrice) / (oldStock + newQty);
        }

        // Update Ingredient
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            currentStock: { increment: newQty },
            currentCost: finalAvgCost
          }
        });

        // Create Stock Movement
        await tx.stockMovement.create({
          data: {
            tenantId,
            ingredientId: item.ingredientId,
            type: StockMovementType.PURCHASE_ENTRY,
            quantity: newQty,
            unitCost: newPrice,
            notes: `Entrada via Compra #${purchase.id}`
          }
        });
      }

      // 3. Create Financial Transaction if not fully paid
      if (purchase.paymentStatus !== PaymentStatus.PAID) {
        await tx.financialTransaction.create({
          data: {
            tenantId,
            type: FinancialTransactionType.EXPENSE,
            category: 'purchase',
            amount: totalValue,
            status: FinancialStatus.PENDING,
            description: `Compra fornecedor - Ref #${purchase.id}`,
            referenceId: purchase.id,
            referenceType: 'purchase'
          }
        });
      }

      return this.findOne(tenantId, purchase.id);
    });
  }

  private mapToDTO(p: any): PurchaseDTO {
    return {
      ...p,
      totalValue: Number(p.totalValue),
      items: p.items?.map((item: any) => ({
        ...item,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
        ingredientName: item.ingredient?.name
      }))
    };
  }
}
