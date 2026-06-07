import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import type { Prisma } from '@prisma/client';
import { CreateComplementGroupDto } from './dto/create-complement-group.dto';
import { UpdateComplementGroupDto } from './dto/update-complement-group.dto';
import { CreateComplementItemDto } from './dto/create-complement-item.dto';
import { UpdateComplementItemDto } from './dto/update-complement-item.dto';

@Injectable()
export class ComplementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException('Tenant context não encontrado');
    }
    return tenantId;
  }

  // --- COMPATIBILITY LAYER MAPPER ---
  private mapOptionGroupToLegacyComplementGroup(optionGroup: any) {
    return {
      id: optionGroup.id,
      tenantId: optionGroup.tenantId,
      name: optionGroup.name,
      description: optionGroup.description,
      minSelect: optionGroup.minSelect,
      maxSelect: optionGroup.maxSelect,
      isRequired: optionGroup.isRequired,
      isActive: optionGroup.isActive,
      order: optionGroup.order,
      createdAt: optionGroup.createdAt,
      updatedAt: optionGroup.updatedAt,
      items: optionGroup.items ? optionGroup.items.map((i: any) => this.mapOptionItemToLegacyComplementItem(i)) : undefined,
    };
  }

  private mapOptionItemToLegacyComplementItem(optionItem: any) {
    return {
      id: optionItem.id,
      tenantId: optionItem.tenantId,
      groupId: optionItem.optionGroupId,
      name: optionItem.name,
      description: optionItem.description,
      additionalPrice: optionItem.priceImpactValue,
      sku: optionItem.sku,
      isActive: optionItem.isActive,
      order: optionItem.order,
      createdAt: optionItem.createdAt,
      updatedAt: optionItem.updatedAt,
    };
  }

  async createGroup(tenantId: string, createGroupDto: CreateComplementGroupDto) {
    const maxSelect = createGroupDto.maxSelect ?? 1;
    const optionGroup = await this.prisma.tenantClient.optionGroup.create({
      data: {
        tenantId,
        name: createGroupDto.name,
        description: createGroupDto.description ?? null,
        minSelect: createGroupDto.minSelect ?? 0,
        maxSelect,
        isRequired: createGroupDto.isRequired ?? false,
        isActive: createGroupDto.isActive ?? true,
        order: createGroupDto.order ?? 0,
        selectionType: maxSelect > 1 ? 'multiple' : 'single',
      },
    });
    return this.mapOptionGroupToLegacyComplementGroup(optionGroup);
  }

  async findAllGroups(tenantId: string) {
    const groups = await this.prisma.tenantClient.optionGroup.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
      include: { items: true },
    });
    return groups.map((g) => this.mapOptionGroupToLegacyComplementGroup(g));
  }

  async findOneGroup(tenantId: string, id: string) {
    const group = await this.prisma.tenantClient.optionGroup.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!group) {
      throw new NotFoundException(`Grupo de complementos não encontrado.`);
    }

    return this.mapOptionGroupToLegacyComplementGroup(group);
  }

  async updateGroup(tenantId: string, id: string, updateGroupDto: UpdateComplementGroupDto) {
    const existing = await this.findOneGroup(tenantId, id);

    const maxSelect = updateGroupDto.maxSelect ?? existing.maxSelect;
    
    const updated = await this.prisma.tenantClient.optionGroup.update({
      where: { id },
      data: {
        name: updateGroupDto.name,
        description: updateGroupDto.description ?? undefined,
        minSelect: updateGroupDto.minSelect,
        maxSelect: updateGroupDto.maxSelect,
        isRequired: updateGroupDto.isRequired,
        isActive: updateGroupDto.isActive,
        order: updateGroupDto.order,
        selectionType: maxSelect > 1 ? 'multiple' : 'single',
      },
    });
    
    return this.mapOptionGroupToLegacyComplementGroup(updated);
  }

  async removeGroup(tenantId: string, id: string) {
    await this.findOneGroup(tenantId, id);
    const deleted = await this.prisma.tenantClient.optionGroup.delete({
      where: { id },
    });
    return this.mapOptionGroupToLegacyComplementGroup(deleted);
  }

  // ITEM METHODS

  async createItem(tenantId: string, dto: CreateComplementItemDto) {
    const optionItem = await this.prisma.tenantClient.optionItem.create({
      data: {
        tenantId,
        optionGroupId: dto.groupId,
        name: dto.name,
        description: dto.description ?? null,
        priceImpactType: 'fixed',
        priceImpactValue: dto.additionalPrice ?? 0,
        sku: dto.sku ?? null,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
        allowQuantity: false,
      },
    });
    return this.mapOptionItemToLegacyComplementItem(optionItem);
  }

  async findAllItems(tenantId: string) {
    const items = await this.prisma.tenantClient.optionItem.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });
    return items.map((i) => this.mapOptionItemToLegacyComplementItem(i));
  }

  async findOneItem(tenantId: string, id: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Complemento não encontrado.');
    return this.mapOptionItemToLegacyComplementItem(item);
  }

  async updateItem(tenantId: string, id: string, dto: UpdateComplementItemDto) {
    await this.findOneItem(tenantId, id);
    const updated = await this.prisma.tenantClient.optionItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? undefined,
        priceImpactType: 'fixed',
        priceImpactValue: dto.additionalPrice,
        sku: dto.sku,
        isActive: dto.isActive,
        order: dto.order,
      },
    });
    return this.mapOptionItemToLegacyComplementItem(updated);
  }

  async removeItem(tenantId: string, id: string) {
    await this.findOneItem(tenantId, id);
    const deleted = await this.prisma.tenantClient.optionItem.delete({
      where: { id },
    });
    return this.mapOptionItemToLegacyComplementItem(deleted);
  }
}
