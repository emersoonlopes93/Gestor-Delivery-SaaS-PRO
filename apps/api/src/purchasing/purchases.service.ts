import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  PurchaseDTO, 
  CreatePurchaseDTO, 
  PurchaseStatus, 
  PaymentStatus, 
  StockMovementType,
  FinancialTransactionType,
  FinancialStatus,
  UnitType
} from '@gestor/types';
import { Prisma, UnitType as PrismaUnitType } from '@prisma/client';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizePurchaseDate(value: Date | string | undefined): Date {
  if (value === undefined) return new Date();

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('Data da compra invalida.');
    }
    return value;
  }

  const dateValue = value.trim();
  if (!dateValue) {
    throw new BadRequestException('Data da compra invalida.');
  }

  const dateOnly = DATE_ONLY_PATTERN.exec(dateValue);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('Data da compra invalida.');
    }
    return date;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Data da compra invalida.');
  }
  return date;
}

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
    const purchaseDate = normalizePurchaseDate(dto.purchaseDate);
    const totalValue = dto.items.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: dto.supplierId, tenantId },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Fornecedor nÃ£o encontrado');

      // 1. Create Purchase
      const purchase = await tx.purchase.create({
        data: {
          tenantId,
          supplierId: dto.supplierId,
          number: dto.number,
          totalValue,
          status: PurchaseStatus.RECEIVED, // For Phase 3, we assume direct reception for simplicity
          paymentStatus: dto.paymentStatus || PaymentStatus.PAID,
          purchaseDate,
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
        const ingredient = await tx.ingredient.findFirst({
          where: { id: item.ingredientId, tenantId },
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

  private mapUnit(unit: PrismaUnitType): UnitType {
    const map: Record<PrismaUnitType, UnitType> = {
      [PrismaUnitType.un]: UnitType.UN,
      [PrismaUnitType.g]: UnitType.G,
      [PrismaUnitType.kg]: UnitType.KG,
      [PrismaUnitType.ml]: UnitType.ML,
      [PrismaUnitType.l]: UnitType.L,
    };
    return map[unit];
  }

  private mapToDTO(p: Prisma.PurchaseGetPayload<{ include: { supplier: true, items: { include: { ingredient: true } } } }>): PurchaseDTO {
    return {
      ...p,
      number: p.number ?? undefined,
      status: p.status as PurchaseStatus,
      paymentStatus: p.paymentStatus as PaymentStatus,
      totalValue: Number(p.totalValue),
      items: p.items?.map((item) => ({
        ...item,
        expiryDate: item.expiryDate ?? undefined,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
        ingredientName: item.ingredient?.name,
        ingredientUnit: item.ingredient?.unit ? this.mapUnit(item.ingredient.unit) : undefined
      }))
    };
  }
}
