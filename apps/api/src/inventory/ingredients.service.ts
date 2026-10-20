import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateIngredientDTO, IngredientDTO, UnitType, CreateIngredientDTO } from '@gestor/types';
import { UnitType as PrismaUnitType, Prisma, StockMovementType as PrismaStockMovementType } from '@prisma/client';
import { IngredientBaseUnitGuardService } from './ingredient-base-unit-guard.service';

type IngredientWithRelations = Prisma.IngredientGetPayload<Record<string, never>>;

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly baseUnitGuard: IngredientBaseUnitGuardService,
  ) {}

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

  private resolveConversionFactor(value: number | undefined): number {
    const conversionFactor = value ?? 1;
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      throw new BadRequestException('O fator de conversão deve ser maior que zero');
    }
    return conversionFactor;
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

    const { initialPurchase, purchasePresentations = [], ...ingredientData } = dto;
    const normalizedPresentations = purchasePresentations.map((presentation) => ({
      label: presentation.label?.trim(), conversionFactor: Number(presentation.conversionFactor),
    }));
    if (normalizedPresentations.some((presentation) => !presentation.label || !Number.isFinite(presentation.conversionFactor) || presentation.conversionFactor <= 0)
      || new Set(normalizedPresentations.map((presentation) => presentation.label?.toLocaleLowerCase())).size !== normalizedPresentations.length) {
      throw new BadRequestException('Cada apresentacao precisa ter nome unico e conteudo maior que zero.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Ingredient
      const ingredient = await tx.ingredient.create({
        data: {
          name: ingredientData.name,
          sku: safeSku,
          description: ingredientData.description,
          unit: this.mapPrismaUnit(ingredientData.unit),
          purchaseUnit: ingredientData.purchaseUnit ? this.mapPrismaUnit(ingredientData.purchaseUnit) : this.mapPrismaUnit(ingredientData.unit),
          conversionFactor: this.resolveConversionFactor(ingredientData.conversionFactor),
          category: ingredientData.category,
          minStock: ingredientData.minStock,
          tenantId,
          currentStock: 0,
          currentCost: 0,
        },
      });

      if (normalizedPresentations.length > 0) {
        await tx.purchasePresentation.createMany({
          data: normalizedPresentations.map((presentation) => ({
            tenantId, ingredientId: ingredient.id, label: presentation.label as string, conversionFactor: presentation.conversionFactor,
          })),
        });
      }

      // 2. Opening stock is not a purchase. It is always expressed in the
      // ingredient's base stock unit and must not create supplier/financial data.
      if (initialPurchase && initialPurchase.quantity > 0) {
        const quantityBase = Number(initialPurchase.quantity);
        const unitCostBase = Number(initialPurchase.totalCost) / quantityBase;

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
            type: PrismaStockMovementType.in,
            quantity: quantityBase,
            unitCost: unitCostBase,
            notes: 'Saldo inicial informado no cadastro do insumo.',
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
    const requestedUnit = updateData.unit === undefined ? undefined : this.mapPrismaUnit(updateData.unit);
    const changesBaseUnit = requestedUnit !== undefined && requestedUnit !== ingredient.unit;

    if (!changesBaseUnit) {
      const updated = await this.prisma.ingredient.update({
        where: { id },
        data: this.updateData(updateData, requestedUnit),
      });
      return this.mapToDTO(updated);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // The row lock conflicts with foreign-key key-share locks. READ COMMITTED
      // deliberately refreshes the snapshot after a lock wait, so dependencies
      // committed by a concurrent writer are visible before the guard runs.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM ingredients
        WHERE id = ${id} AND tenant_id = ${tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException('Insumo nao encontrado');

      const current = await tx.ingredient.findFirst({ where: { id, tenantId } });
      if (!current) throw new NotFoundException('Insumo nao encontrado');
      if (requestedUnit !== current.unit) {
        await this.baseUnitGuard.assertCanChange(tx, tenantId, id, current);
      }

      return tx.ingredient.update({
        where: { id },
        data: this.updateData(updateData, requestedUnit),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    return this.mapToDTO(updated);
  }

  private updateData(updateData: UpdateIngredientDTO, requestedUnit: PrismaUnitType | undefined) {
    return {
      name: updateData.name,
      sku: updateData.sku === undefined ? undefined : (updateData.sku && updateData.sku.trim() !== '' ? updateData.sku.trim() : null),
      description: updateData.description,
      unit: requestedUnit,
      purchaseUnit: updateData.purchaseUnit ? this.mapPrismaUnit(updateData.purchaseUnit) : undefined,
      conversionFactor: updateData.conversionFactor === undefined
        ? undefined
        : this.resolveConversionFactor(updateData.conversionFactor),
      category: updateData.category,
      minStock: updateData.minStock,
      isActive: updateData.isActive,
    };
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
