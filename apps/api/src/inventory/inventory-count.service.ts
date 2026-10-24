import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CloseInventoryCountDTO,
  InventoryCountDTO,
  InventoryCountStatus,
  OpenInventoryCountDTO,
  StockMovementType,
  UnitType,
} from '@gestor/types';
import { Prisma, UnitType as PrismaClientUnitType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const countInclude = { items: { include: { ingredient: true } } } as const;
type CountWithItems = Prisma.InventoryCountGetPayload<{ include: typeof countInclude }>;

@Injectable()
export class InventoryCountService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<InventoryCountDTO[]> {
    const counts = await this.prisma.inventoryCount.findMany({
      where: { tenantId }, include: countInclude, orderBy: { createdAt: 'desc' },
    });
    return counts.map((count) => this.mapToDTO(count));
  }

  async findOne(tenantId: string, id: string): Promise<InventoryCountDTO> {
    const count = await this.prisma.inventoryCount.findFirst({ where: { id, tenantId }, include: countInclude });
    if (!count) throw new NotFoundException('Inventário não encontrado');
    return this.mapToDTO(count);
  }

  async open(tenantId: string, dto: OpenInventoryCountDTO): Promise<InventoryCountDTO> {
    const ingredientIds = this.requireDistinctIds(dto?.ingredientIds);
    return this.prisma.$transaction(async (tx) => {
      await this.lockIngredientRows(tx, tenantId, ingredientIds);
      const ingredients = await tx.ingredient.findMany({
        where: { tenantId, id: { in: ingredientIds } }, orderBy: { id: 'asc' },
      });
      if (ingredients.length !== ingredientIds.length) {
        throw new NotFoundException('Um ou mais insumos não foram encontrados para este tenant');
      }
      const count = await tx.inventoryCount.create({
        data: {
          tenantId, status: InventoryCountStatus.OPEN, note: dto.note,
          items: { create: ingredients.map((ingredient) => ({
            tenantId, ingredientId: ingredient.id,
            theoreticalStock: ingredient.currentStock,
            physicalStock: ingredient.currentStock,
            adjustedQuantity: new Prisma.Decimal(0),
          })) },
        },
        include: countInclude,
      });
      return this.mapToDTO(count);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async close(tenantId: string, id: string, dto: CloseInventoryCountDTO): Promise<InventoryCountDTO> {
    const submittedItems = this.requireCloseItems(dto?.items);
    const inputIds = this.requireDistinctIds(submittedItems.map((item) => item.ingredientId));
    const physicalByIngredient = new Map(submittedItems.map((item) => [item.ingredientId, this.requireStock(item.physicalStock)]));

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM inventory_counts WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`);
      const count = await tx.inventoryCount.findFirst({ where: { id, tenantId }, include: countInclude });
      if (!count) throw new NotFoundException('Inventário não encontrado');
      if (count.status !== InventoryCountStatus.OPEN) {
        throw new ConflictException('Esta contagem já foi finalizada. Atualize a tela para consultar o resultado.');
      }

      const snapshotIds = count.items.map((item) => item.ingredientId).sort();
      if (snapshotIds.length !== inputIds.length || snapshotIds.some((ingredientId, index) => ingredientId !== inputIds[index])) {
        throw new BadRequestException('A finalização deve conter exatamente os insumos do inventário aberto.');
      }

      await this.lockIngredientRows(tx, tenantId, snapshotIds);
      const ingredients = await tx.ingredient.findMany({
        where: { tenantId, id: { in: snapshotIds } }, orderBy: { id: 'asc' },
      });
      if (ingredients.length !== snapshotIds.length) {
        throw new NotFoundException('Um ou mais insumos não foram encontrados para este tenant');
      }
      const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

      for (const item of [...count.items].sort((left, right) => left.ingredientId.localeCompare(right.ingredientId))) {
        const ingredient = ingredientById.get(item.ingredientId);
        if (!ingredient) throw new NotFoundException('Insumo não encontrado para este tenant');
        if (!ingredient.currentStock.equals(item.theoreticalStock)) throw this.staleConflict();

        const physicalStock = physicalByIngredient.get(item.ingredientId);
        if (!physicalStock) throw new BadRequestException('Contagem física inválida.');
        const adjustment = physicalStock.minus(item.theoreticalStock);
        await tx.inventoryCountItem.update({ where: { id: item.id }, data: { physicalStock, adjustedQuantity: adjustment } });

        if (!adjustment.isZero()) {
          const updated = await tx.ingredient.updateMany({
            where: { id: item.ingredientId, tenantId, currentStock: item.theoreticalStock },
            data: { currentStock: { increment: adjustment } },
          });
          if (updated.count !== 1) throw this.staleConflict();
          await tx.stockMovement.create({ data: {
            tenantId, ingredientId: item.ingredientId,
            type: StockMovementType.INVENTORY_ADJUSTMENT,
            quantity: adjustment.abs(), unitCost: ingredient.currentCost,
            notes: `Inventário #${id}: teórico=${item.theoreticalStock.toFixed(4)}; físico=${physicalStock.toFixed(4)}; delta=${adjustment.toFixed(4)}`,
          } });
        }
      }

      const closed = await tx.inventoryCount.updateMany({
        where: { id, tenantId, status: InventoryCountStatus.OPEN },
        data: { status: InventoryCountStatus.CLOSED, closedAt: new Date() },
      });
      if (closed.count !== 1) throw new ConflictException('Esta contagem já foi finalizada.');
      const result = await tx.inventoryCount.findFirst({ where: { id, tenantId }, include: countInclude });
      if (!result) throw new NotFoundException('Inventário não encontrado');
      return this.mapToDTO(result);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw this.staleConflict();
      }
      throw error;
    });
  }

  async cancel(tenantId: string, id: string): Promise<InventoryCountDTO> {
    const cancelled = await this.prisma.inventoryCount.updateMany({
      where: { id, tenantId, status: InventoryCountStatus.OPEN },
      data: { status: InventoryCountStatus.CANCELLED },
    });

    if (cancelled.count !== 1) {
      const existing = await this.prisma.inventoryCount.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Inventário não encontrado');
      throw new ConflictException('Esta contagem já foi encerrada ou cancelada.');
    }

    const result = await this.prisma.inventoryCount.findFirst({ where: { id, tenantId }, include: countInclude });
    if (!result) throw new NotFoundException('Inventário não encontrado');
    return this.mapToDTO(result);
  }

  private staleConflict(): ConflictException {
    return new ConflictException('O estoque deste insumo mudou enquanto a contagem estava em andamento. Atualize/revise a contagem antes de finalizar.');
  }

  private requireDistinctIds(ids: unknown): string[] {
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('Informe ao menos um insumo para a contagem.');
    if (!ids.every((ingredientId): ingredientId is string => typeof ingredientId === 'string' && ingredientId.trim().length > 0)) {
      throw new BadRequestException('Identificador de insumo inválido.');
    }
    const sorted = [...ids].sort();
    if (new Set(sorted).size !== sorted.length) throw new BadRequestException('O mesmo insumo não pode aparecer mais de uma vez.');
    return sorted;
  }

  private requireCloseItems(items: unknown): CloseInventoryCountDTO['items'] {
    if (!Array.isArray(items) || !items.every((item): item is CloseInventoryCountDTO['items'][number] => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.ingredientId === 'string' && typeof candidate.physicalStock === 'number';
    })) {
      throw new BadRequestException('Informe os insumos e suas contagens físicas.');
    }
    return items;
  }

  private requireStock(value: number): Prisma.Decimal {
    if (!Number.isFinite(value) || value < 0) throw new BadRequestException('A contagem física deve ser finita e maior ou igual a zero.');
    const stock = new Prisma.Decimal(value);
    if (stock.decimalPlaces() > 4 || stock.greaterThan('999999.9999')) {
      throw new BadRequestException('A contagem física deve respeitar até quatro casas decimais.');
    }
    return stock;
  }

  private async lockIngredientRows(tx: Prisma.TransactionClient, tenantId: string, ingredientIds: string[]): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM ingredients
      WHERE tenant_id = ${tenantId} AND id IN (${Prisma.join(ingredientIds)})
      ORDER BY id FOR UPDATE
    `);
  }

  private mapUnit(unit: PrismaClientUnitType): UnitType {
    return {
      [PrismaClientUnitType.un]: UnitType.UN, [PrismaClientUnitType.g]: UnitType.G,
      [PrismaClientUnitType.kg]: UnitType.KG, [PrismaClientUnitType.ml]: UnitType.ML,
      [PrismaClientUnitType.l]: UnitType.L,
    }[unit];
  }

  private mapToDTO(count: CountWithItems): InventoryCountDTO {
    return {
      ...count, status: count.status as InventoryCountStatus,
      note: count.note ?? undefined, closedAt: count.closedAt ?? undefined,
      items: count.items.map((item) => ({
        ...item,
        theoreticalStock: Number(item.theoreticalStock), physicalStock: Number(item.physicalStock),
        adjustedQuantity: Number(item.adjustedQuantity), ingredientName: item.ingredient.name,
        ingredientUnit: this.mapUnit(item.ingredient.unit),
      })),
    };
  }
}
