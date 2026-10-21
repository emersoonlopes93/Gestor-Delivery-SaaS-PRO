import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreatePurchasePresentationDTO, PurchasePresentationDTO, UnitType as SharedUnitType, UpdatePurchasePresentationDTO } from '@gestor/types';
import { Prisma, UnitType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { convertUnitQuantity, UnitConversionError } from './unit-conversion';

type PresentationRecord = {
  id: string;
  tenantId: string;
  ingredientId: string;
  label: string;
  conversionFactor: Prisma.Decimal;
  contentQuantity: Prisma.Decimal | null;
  contentUnit: UnitType | null;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_PRESENTATION_SCALE = 6;

@Injectable()
export class PurchasePresentationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, ingredientId: string): Promise<PurchasePresentationDTO[]> {
    await this.requireIngredient(tenantId, ingredientId);
    const presentations = await this.prisma.purchasePresentation.findMany({
      where: { tenantId, ingredientId }, orderBy: [{ isActive: 'desc' }, { label: 'asc' }],
    });
    return presentations.map((presentation) => this.map(presentation));
  }

  async create(tenantId: string, ingredientId: string, dto: CreatePurchasePresentationDTO): Promise<PurchasePresentationDTO> {
    const presentation = await this.prisma.$transaction(async (tx) => {
      const ingredient = await this.lockIngredient(tx, tenantId, ingredientId);
      const data = this.canonicalCreateData(dto, ingredient.unit);
      return tx.purchasePresentation.create({
        data: { ...data, tenantId, ingredientId },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.map(presentation);
  }

  async update(tenantId: string, ingredientId: string, id: string, dto: UpdatePurchasePresentationDTO): Promise<PurchasePresentationDTO> {
    const presentation = await this.prisma.$transaction(async (tx) => {
      const ingredient = await this.lockIngredient(tx, tenantId, ingredientId);
      const current = await tx.purchasePresentation.findFirst({ where: { id, tenantId, ingredientId } });
      if (!current) throw new NotFoundException('Apresentacao de compra nao encontrada.');
      const data = this.canonicalUpdateData(dto, ingredient.unit);
      return tx.purchasePresentation.update({ where: { id }, data });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.map(presentation);
  }

  async archive(tenantId: string, ingredientId: string, id: string): Promise<PurchasePresentationDTO> {
    const presentation = await this.requirePresentation(tenantId, ingredientId, id);
    if (!presentation.isActive && presentation.archivedAt !== null) return this.map(presentation);
    const archived = await this.prisma.purchasePresentation.update({
      where: { id }, data: { isActive: false, archivedAt: new Date() },
    });
    return this.map(archived);
  }

  async restore(tenantId: string, ingredientId: string, id: string): Promise<PurchasePresentationDTO> {
    const presentation = await this.requirePresentation(tenantId, ingredientId, id);
    if (presentation.isActive && presentation.archivedAt === null) return this.map(presentation);
    const restored = await this.prisma.purchasePresentation.update({
      where: { id }, data: { isActive: true, archivedAt: null },
    });
    return this.map(restored);
  }

  async remove(tenantId: string, ingredientId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const presentation = await tx.purchasePresentation.findFirst({ where: { id, tenantId, ingredientId }, select: { id: true } });
      if (!presentation) throw new NotFoundException('Apresentacao de compra nao encontrada.');
      const used = await tx.purchaseItem.findFirst({ where: { tenantId, purchasePresentationId: id }, select: { id: true } });
      if (used) {
        throw new ConflictException({
          code: 'PURCHASE_PRESENTATION_IN_USE',
          message: 'Esta apresentacao ja foi usada em uma compra. Arquive-a em vez de excluir.',
        });
      }
      await tx.purchasePresentation.delete({ where: { id } });
    });
  }

  private async lockIngredient(tx: Prisma.TransactionClient, tenantId: string, ingredientId: string): Promise<{ unit: UnitType }> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ingredients
      WHERE id = ${ingredientId} AND tenant_id = ${tenantId}
      FOR UPDATE
    `;
    if (rows.length !== 1) throw new NotFoundException('Insumo nao encontrado.');
    const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, tenantId }, select: { unit: true } });
    if (!ingredient) throw new NotFoundException('Insumo nao encontrado.');
    return ingredient;
  }

  private async requirePresentation(tenantId: string, ingredientId: string, id: string): Promise<PresentationRecord> {
    const presentation = await this.prisma.purchasePresentation.findFirst({ where: { id, tenantId, ingredientId } });
    if (!presentation) throw new NotFoundException('Apresentacao de compra nao encontrada.');
    return presentation;
  }

  private async requireIngredient(tenantId: string, ingredientId: string): Promise<void> {
    const ingredient = await this.prisma.ingredient.findFirst({ where: { id: ingredientId, tenantId }, select: { id: true } });
    if (!ingredient) throw new NotFoundException('Insumo nao encontrado.');
  }

  private canonicalCreateData(dto: CreatePurchasePresentationDTO, ingredientUnit: UnitType): Omit<Prisma.PurchasePresentationUncheckedCreateInput, 'tenantId' | 'ingredientId'> {
    const label = dto.label?.trim();
    if (!label) throw new BadRequestException('Informe o nome da apresentacao.');
    const content = this.resolveContent(dto.contentQuantity, dto.contentUnit, ingredientUnit);
    return { label, ...content };
  }

  private canonicalUpdateData(dto: UpdatePurchasePresentationDTO, ingredientUnit: UnitType): Prisma.PurchasePresentationUncheckedUpdateInput {
    const data: Prisma.PurchasePresentationUncheckedUpdateInput = {};
    if (dto.label !== undefined) {
      const label = dto.label?.trim();
      if (!label) throw new BadRequestException('Informe o nome da apresentacao.');
      data.label = label;
    }
    if ((dto.contentQuantity === undefined) !== (dto.contentUnit === undefined)) {
      throw new BadRequestException('Informe quantidade e unidade do conteudo juntas.');
    }
    if (dto.contentQuantity !== undefined && dto.contentUnit !== undefined) {
      Object.assign(data, this.resolveContent(dto.contentQuantity, dto.contentUnit, ingredientUnit));
    }
    return data;
  }

  private resolveContent(contentQuantity: number, contentUnit: UnitType, ingredientUnit: UnitType): Pick<PresentationRecord, 'contentQuantity' | 'contentUnit' | 'conversionFactor'> {
    const quantity = new Prisma.Decimal(contentQuantity);
    if (!quantity.isFinite() || quantity.lte(0) || quantity.decimalPlaces() > MAX_PRESENTATION_SCALE) {
      throw new BadRequestException('A quantidade do conteudo deve ser positiva e ter no maximo seis casas decimais.');
    }
    let conversionFactor: Prisma.Decimal;
    try {
      conversionFactor = convertUnitQuantity(quantity, contentUnit, ingredientUnit);
    } catch (error) {
      if (error instanceof UnitConversionError) {
        throw new BadRequestException({ code: error.code, message: 'A unidade do conteudo deve ter a mesma dimensao da unidade-base do insumo.' });
      }
      throw error;
    }
    if (!conversionFactor.isFinite() || conversionFactor.lte(0) || conversionFactor.decimalPlaces() > MAX_PRESENTATION_SCALE) {
      throw new BadRequestException('O conteudo normalizado nao cabe na precisao da apresentacao.');
    }
    return { contentQuantity: quantity, contentUnit, conversionFactor };
  }

  private map(presentation: PresentationRecord): PurchasePresentationDTO {
    const status = presentation.archivedAt !== null
      ? 'ARCHIVED'
      : presentation.contentQuantity === null || presentation.contentUnit === null
        ? 'LEGACY_REQUIRES_REVIEW'
        : 'CANONICAL';
    return {
      ...presentation,
      conversionFactor: presentation.conversionFactor.toNumber(),
      contentQuantity: presentation.contentQuantity?.toNumber() ?? null,
      contentUnit: presentation.contentUnit === null ? null : this.mapUnit(presentation.contentUnit),
      archivedAt: presentation.archivedAt,
      status,
    };
  }

  private mapUnit(unit: UnitType): SharedUnitType {
    const map: Record<UnitType, SharedUnitType> = {
      [UnitType.un]: SharedUnitType.UN,
      [UnitType.g]: SharedUnitType.G,
      [UnitType.kg]: SharedUnitType.KG,
      [UnitType.ml]: SharedUnitType.ML,
      [UnitType.l]: SharedUnitType.L,
    };
    return map[unit];
  }
}
