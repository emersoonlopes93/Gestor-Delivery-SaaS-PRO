import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreatePurchasePresentationDTO, PurchasePresentationDTO, UpdatePurchasePresentationDTO } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
    await this.requireIngredient(tenantId, ingredientId);
    const data: Prisma.PurchasePresentationUncheckedCreateInput = {
        ...this.validateCreate(dto),
        // PrismaService enforces the same tenantId at runtime. Keep both
        // foreign keys scalar so Prisma selects the unchecked input.
        tenantId,
        ingredientId,
      };
    const presentation = await this.prisma.purchasePresentation.create({ data });
    return this.map(presentation);
  }

  async update(tenantId: string, ingredientId: string, id: string, dto: UpdatePurchasePresentationDTO): Promise<PurchasePresentationDTO> {
    await this.requireIngredient(tenantId, ingredientId);
    const current = await this.prisma.purchasePresentation.findFirst({ where: { id, tenantId, ingredientId } });
    if (!current) throw new NotFoundException('Apresentacao de compra nao encontrada.');
    const presentation = await this.prisma.purchasePresentation.update({ where: { id }, data: this.validateUpdate(dto) });
    return this.map(presentation);
  }

  private async requireIngredient(tenantId: string, ingredientId: string): Promise<void> {
    const ingredient = await this.prisma.ingredient.findFirst({ where: { id: ingredientId, tenantId }, select: { id: true } });
    if (!ingredient) throw new NotFoundException('Insumo nao encontrado.');
  }

  private validateCreate(dto: CreatePurchasePresentationDTO): { label: string; conversionFactor: number; isActive?: boolean } {
    const label = dto.label?.trim();
    if (!label) throw new BadRequestException('Informe o nome da apresentacao.');
    const conversionFactor = Number(dto.conversionFactor);
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) throw new BadRequestException('O conteudo da apresentacao deve ser maior que zero.');
    return { label, conversionFactor, ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }) };
  }

  private validateUpdate(dto: UpdatePurchasePresentationDTO) {
    const data: { label?: string; conversionFactor?: number; isActive?: boolean } = {};
    if (dto.label !== undefined) {
      const label = dto.label?.trim();
      if (!label) throw new BadRequestException('Informe o nome da apresentacao.');
      data.label = label;
    }
    if (dto.conversionFactor !== undefined) {
      const conversionFactor = Number(dto.conversionFactor);
      if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) throw new BadRequestException('O conteudo da apresentacao deve ser maior que zero.');
      data.conversionFactor = conversionFactor;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return data;
  }

  private map(presentation: { id: string; tenantId: string; ingredientId: string; label: string; conversionFactor: { toNumber(): number }; isActive: boolean; createdAt: Date; updatedAt: Date }): PurchasePresentationDTO {
    return { ...presentation, conversionFactor: presentation.conversionFactor.toNumber() };
  }
}
