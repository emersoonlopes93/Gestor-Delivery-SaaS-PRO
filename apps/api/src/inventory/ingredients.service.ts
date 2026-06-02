import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateIngredientDTO, IngredientDTO, UnitType, CreateIngredientDTO } from '@gestor/types';
import { UnitType as PrismaUnitType, Prisma } from '@prisma/client';

type IngredientWithRelations = Prisma.IngredientGetPayload<Record<string, never>>;

@Injectable()
export class IngredientsService {
  constructor(private prisma: PrismaService) {}

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

  private mapPrismaUnit(unit: UnitType): PrismaUnitType {
    const map: Record<UnitType, PrismaUnitType> = {
      [UnitType.UN]: PrismaUnitType.un,
      [UnitType.G]: PrismaUnitType.g,
      [UnitType.KG]: PrismaUnitType.kg,
      [UnitType.ML]: PrismaUnitType.ml,
      [UnitType.L]: PrismaUnitType.l,
    };
    return map[unit];
  }

  async findAll(tenantId: string): Promise<IngredientDTO[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return ingredients.map(ing => this.mapToDTO(ing));
  }

  async findOne(tenantId: string, id: string): Promise<IngredientDTO> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, tenantId },
    });

    if (!ingredient) {
      throw new NotFoundException('Insumo não encontrado');
    }

    return this.mapToDTO(ingredient);
  }

  async create(tenantId: string, dto: CreateIngredientDTO): Promise<IngredientDTO> {
    const safeSku = dto.sku && dto.sku.trim() !== '' ? dto.sku.trim() : null;

    if (safeSku) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { tenantId, sku: safeSku },
      });

      if (existing) {
        throw new ConflictException('Insumo com este SKU já existe');
      }
    }

    const { initialPurchase, ...ingredientData } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Ingredient
      const ingredient = await tx.ingredient.create({
        data: {
          name: ingredientData.name,
          sku: safeSku,
          description: ingredientData.description,
          unit: this.mapPrismaUnit(ingredientData.unit),
          purchaseUnit: ingredientData.purchaseUnit ? this.mapPrismaUnit(ingredientData.purchaseUnit) : this.mapPrismaUnit(ingredientData.unit),
          conversionFactor: ingredientData.conversionFactor || 1,
          category: ingredientData.category,
          minStock: ingredientData.minStock,
          tenantId,
          currentStock: 0,
          currentCost: 0,
        },
      });

      // 2. Handle Initial Purchase if provided
      if (initialPurchase && initialPurchase.quantity > 0) {
        const factor = Number(ingredient.conversionFactor);
        const quantityBase = Number(initialPurchase.quantity) * factor;
        const unitCostBase = Number(initialPurchase.totalCost) / quantityBase;

        // Create Purchase record for history
        const purchase = await tx.purchase.create({
          data: {
            tenantId,
            supplierId: initialPurchase.supplierId || '', // Handle missing supplier
            totalValue: initialPurchase.totalCost,
            status: 'received',
            purchaseDate: new Date(),
            items: {
              create: {
                tenantId,
                ingredientId: ingredient.id,
                quantity: initialPurchase.quantity,
                unitCost: Number(initialPurchase.totalCost) / Number(initialPurchase.quantity),
                totalCost: initialPurchase.totalCost,
              }
            }
          }
        });

        // Update Ingredient with initial stock and cost
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: {
            currentStock: quantityBase,
            currentCost: unitCostBase,
          }
        });

        // Create Stock Movement
        await tx.stockMovement.create({
          data: {
            tenantId,
            ingredientId: ingredient.id,
            type: 'purchase_entry',
            quantity: quantityBase,
            unitCost: unitCostBase,
            notes: `Entrada inicial via cadastro (Compra #${purchase.id})`,
          }
        });
      }

      // Re-fetch to get updated values
      const finalIngredient = await tx.ingredient.findUnique({
        where: { id: ingredient.id }
      });

      if (!finalIngredient) throw new Error('Falha ao recuperar ingrediente criado');

      return this.mapToDTO(finalIngredient);
    });
  }

  async update(tenantId: string, id: string, dto: UpdateIngredientDTO): Promise<IngredientDTO> {
    const ingredient = await this.findOne(tenantId, id);

    const safeSku = dto.sku === undefined ? undefined : (dto.sku && dto.sku.trim() !== '' ? dto.sku.trim() : null);

    if (safeSku && safeSku !== ingredient.sku) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { tenantId, sku: safeSku },
      });

      if (existing) {
        throw new ConflictException('Insumo com este SKU já existe');
      }
    }

    const { ...updateData } = dto;

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: {
        name: updateData.name,
        sku: safeSku,
        description: updateData.description,
        unit: updateData.unit ? this.mapPrismaUnit(updateData.unit) : undefined,
        purchaseUnit: updateData.purchaseUnit ? this.mapPrismaUnit(updateData.purchaseUnit) : undefined,
        conversionFactor: updateData.conversionFactor,
        category: updateData.category,
        minStock: updateData.minStock,
        isActive: updateData.isActive,
      },
    });

    return this.mapToDTO(updated);
  }

  async getSummary(tenantId: string) {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { tenantId, isActive: true },
    });

    const totalValue = ingredients.reduce((acc, ing) => {
      return acc + (Number(ing.currentStock) * Number(ing.currentCost));
    }, 0);

    const lowStockItems = ingredients.filter(ing => 
      ing.minStock && Number(ing.currentStock) <= Number(ing.minStock)
    ).length;

    const outOfStockItems = ingredients.filter(ing => 
      Number(ing.currentStock) <= 0
    ).length;

    return {
      totalValue,
      lowStockItems,
      outOfStockItems,
      totalActiveItems: ingredients.length,
    };
  }

  private mapToDTO(ing: IngredientWithRelations): IngredientDTO {
    return {
      id: ing.id,
      tenantId: ing.tenantId,
      name: ing.name,
      sku: ing.sku ?? undefined,
      description: ing.description ?? undefined,
      unit: this.mapUnit(ing.unit),
      purchaseUnit: ing.purchaseUnit ? this.mapUnit(ing.purchaseUnit) : undefined,
      conversionFactor: Number(ing.conversionFactor),
      category: ing.category ?? undefined,
      currentCost: Number(ing.currentCost),
      currentStock: Number(ing.currentStock),
      minStock: ing.minStock ? Number(ing.minStock) : undefined,
      isActive: ing.isActive,
      createdAt: ing.createdAt,
      updatedAt: ing.updatedAt,
    };
  }
}
