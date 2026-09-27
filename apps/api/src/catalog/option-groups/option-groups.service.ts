import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PriceImpactType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { UpdateOptionGroupDto } from './dto/update-option-group.dto';
import { CreateOptionItemDto } from './dto/create-option-item.dto';
import { UpdateOptionItemDto } from './dto/update-option-item.dto';

@Injectable()
export class OptionGroupsService {
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

  private async audit(
    tenantId: string,
    actorId: string | undefined,
    action: string,
    resource: string,
    details: Record<string, string | boolean | number | null>,
  ) {
    await this.prisma.auditLog.create({
      data: { tenantId, userId: actorId ?? null, userType: 'tenant_user', action, resource, details },
    });
  }

  private validateGroupRules(input: {
    selectionType: 'single' | 'multiple' | 'quantity';
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
  }) {
    const minSelect = Math.max(0, Number(input.minSelect ?? 0));
    const maxSelect = Math.max(0, Number(input.maxSelect ?? 0));

    const effectiveMin = input.isRequired ? Math.max(1, minSelect) : minSelect;

    if (maxSelect === 0) {
      throw new BadRequestException('maxSelect deve ser maior que 0.');
    }

    if (effectiveMin > maxSelect) {
      throw new BadRequestException('minSelect não pode ser maior que maxSelect.');
    }

    if (input.selectionType === 'single' && maxSelect !== 1) {
      throw new BadRequestException('selectionType=single requer maxSelect=1.');
    }

    if (input.selectionType === 'quantity' && maxSelect < 1) {
      throw new BadRequestException('selectionType=quantity requer maxSelect>=1.');
    }
  }

  private validateItemRules(input: {
    priceImpactType: PriceImpactType;
    priceImpactValue: number;
    allowQuantity: boolean;
    minQty: number | null;
    maxQty: number | null;
  }) {
    const value = Number(input.priceImpactValue ?? 0);
    if (Number.isNaN(value)) {
      throw new BadRequestException('priceImpactValue inválido.');
    }

    if (input.priceImpactType === 'percentage') {
      if (value < 0 || value > 100) {
        throw new BadRequestException('percentage deve estar entre 0 e 100.');
      }
    }

    if (input.priceImpactType === 'replace' && value < 0) {
      throw new BadRequestException('replace não pode ser negativo.');
    }

    if (input.priceImpactType === 'fixed' && value < 0) {
      throw new BadRequestException('fixed não pode ser negativo.');
    }

    if (!input.allowQuantity) {
      return;
    }

    const minQty = input.minQty == null ? null : Math.max(1, Number(input.minQty));
    const maxQty = input.maxQty == null ? null : Math.max(1, Number(input.maxQty));

    if (minQty != null && maxQty != null && minQty > maxQty) {
      throw new BadRequestException('minQty não pode ser maior que maxQty.');
    }
  }

  async createGroup(dto: CreateOptionGroupDto, actorId?: string) {
    const tenantId = this.getRequiredTenantId();

    const isRequired = dto.isRequired ?? false;
    const minSelect = dto.minSelect ?? 0;
    const maxSelect = dto.maxSelect ?? 1;

    this.validateGroupRules({
      selectionType: dto.selectionType,
      isRequired,
      minSelect,
      maxSelect,
    });

    const group = await this.prisma.tenantClient.optionGroup.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        selectionType: dto.selectionType,
        isRequired,
        minSelect,
        maxSelect,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
        fractionalPricingRule: dto.fractionalPricingRule ?? null,
      } satisfies Prisma.OptionGroupUncheckedCreateInput,
      include: { items: { orderBy: { order: 'asc' } } },
    });
    await this.audit(tenantId, actorId, 'catalog.option_group.created', 'option_group', { optionGroupId: group.id });
    return group;
  }

  async listGroups(includeArchived = false) {
    return this.prisma.tenantClient.optionGroup.findMany({
      where: includeArchived ? undefined : { deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        items: { where: includeArchived ? undefined : { deletedAt: null }, orderBy: { order: 'asc' } },
        productLinks: { select: { id: true, productId: true, order: true } },
      },
    });
  }

  async getGroup(id: string, includeArchived = false) {
    const group = await this.prisma.tenantClient.optionGroup.findFirst({
      where: includeArchived ? { id } : { id, deletedAt: null },
      include: {
        items: { where: includeArchived ? undefined : { deletedAt: null }, orderBy: { order: 'asc' } },
        productLinks: {
          orderBy: { order: 'asc' },
          include: { product: { select: { id: true, name: true, type: true, isActive: true } } },
        },
      },
    });

    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return group;
  }

  async updateGroup(id: string, dto: UpdateOptionGroupDto, actorId?: string) {
    const existing = await this.getGroup(id);

    const next = {
      selectionType: dto.selectionType ?? existing.selectionType,
      isRequired: dto.isRequired ?? existing.isRequired,
      minSelect: dto.minSelect ?? existing.minSelect,
      maxSelect: dto.maxSelect ?? existing.maxSelect,
    };

    this.validateGroupRules({
      selectionType: next.selectionType,
      isRequired: next.isRequired,
      minSelect: next.minSelect,
      maxSelect: next.maxSelect,
    });

    const group = await this.prisma.tenantClient.optionGroup.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? undefined,
        selectionType: dto.selectionType,
        isRequired: dto.isRequired,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        isActive: dto.isActive,
        order: dto.order,
        fractionalPricingRule: dto.fractionalPricingRule,
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.option_group.updated', 'option_group', { optionGroupId: id });
    return group;
  }

  async archiveGroup(id: string, actorId?: string) {
    await this.getGroup(id);
    const group = await this.prisma.tenantClient.optionGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.option_group.archived', 'option_group', { optionGroupId: id });
    return group;
  }

  async restoreGroup(id: string, actorId?: string) {
    const group = await this.getGroup(id, true);
    if (!group.deletedAt) throw new BadRequestException('Grupo não está arquivado.');
    const restored = await this.prisma.tenantClient.optionGroup.update({ where: { id }, data: { deletedAt: null } });
    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.option_group.restored', 'option_group', { optionGroupId: id });
    return restored;
  }

  // Compatibility endpoint: existing clients expected the group to leave the active library.
  async deleteGroup(id: string, actorId?: string) {
    return this.archiveGroup(id, actorId);
  }

  async createItem(dto: CreateOptionItemDto, actorId?: string) {
    if (!dto.optionGroupId) {
      throw new BadRequestException('optionGroupId é obrigatório.');
    }
    await this.getGroup(dto.optionGroupId);
    const tenantId = this.getRequiredTenantId();

    const impactType = (dto.priceImpactType ?? 'none') as PriceImpactType;

    this.validateItemRules({
      priceImpactType: impactType,
      priceImpactValue: dto.priceImpactValue ?? 0,
      allowQuantity: dto.allowQuantity ?? false,
      minQty: dto.minQty ?? null,
      maxQty: dto.maxQty ?? null,
    });

    const item = await this.prisma.tenantClient.optionItem.create({
      data: {
        tenantId,
        optionGroupId: dto.optionGroupId,
        name: dto.name,
        description: dto.description ?? null,
        sku: dto.sku ?? null,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
        priceImpactType: impactType,
        priceImpactValue: dto.priceImpactValue ?? 0,
        allowQuantity: dto.allowQuantity ?? false,
        minQty: dto.minQty ?? null,
        maxQty: dto.maxQty ?? null,
      } satisfies Prisma.OptionItemUncheckedCreateInput,
    });
    await this.audit(tenantId, actorId, 'catalog.option_item.created', 'option_item', { optionItemId: item.id, optionGroupId: dto.optionGroupId });
    return item;
  }

  async updateItem(id: string, dto: UpdateOptionItemDto, actorId?: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id, deletedAt: null, optionGroup: { deletedAt: null } },
      include: { optionGroup: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');

    const impactType = (dto.priceImpactType ?? item.priceImpactType) as PriceImpactType;

    this.validateItemRules({
      priceImpactType: impactType,
      priceImpactValue: dto.priceImpactValue ?? Number(item.priceImpactValue),
      allowQuantity: dto.allowQuantity ?? item.allowQuantity,
      minQty: dto.minQty ?? item.minQty,
      maxQty: dto.maxQty ?? item.maxQty,
    });

    const updated = await this.prisma.tenantClient.optionItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? undefined,
        sku: dto.sku ?? undefined,
        isActive: dto.isActive,
        order: dto.order,
        priceImpactType: dto.priceImpactType as PriceImpactType | undefined,
        priceImpactValue: dto.priceImpactValue,
        allowQuantity: dto.allowQuantity,
        minQty: dto.minQty ?? undefined,
        maxQty: dto.maxQty ?? undefined,
      },
    });
    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.option_item.updated', 'option_item', { optionItemId: id, optionGroupId: item.optionGroupId });
    return updated;
  }

  async archiveItem(id: string, actorId?: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, optionGroupId: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');

    const archived = await this.prisma.tenantClient.optionItem.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.option_item.archived', 'option_item', { optionItemId: id, optionGroupId: item.optionGroupId });
    return archived;
  }

  async restoreItem(id: string, actorId?: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({ where: { id }, select: { id: true, optionGroupId: true, deletedAt: true } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (!item.deletedAt) throw new BadRequestException('Item não está arquivado.');
    const restored = await this.prisma.tenantClient.optionItem.update({ where: { id }, data: { deletedAt: null } });
    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.option_item.restored', 'option_item', { optionItemId: id, optionGroupId: item.optionGroupId });
    return restored;
  }

  async deleteItem(id: string, actorId?: string) {
    return this.archiveItem(id, actorId);
  }

  async reorderItems(optionGroupId: string, orderedItemIds: string[]) {
    const group = await this.getGroup(optionGroupId);

    const groupItemIds = new Set(group.items.map((i) => i.id));

    for (const id of orderedItemIds) {
      if (!groupItemIds.has(id)) {
        throw new BadRequestException('Lista de ordenação contém item inválido para este grupo.');
      }
    }

    if (orderedItemIds.length !== group.items.length) {
      throw new BadRequestException('Lista de ordenação incompleta.');
    }

    try {
      await this.prisma.$transaction(
        orderedItemIds.map((id, idx) =>
          this.prisma.tenantClient.optionItem.update({
            where: { id },
            data: { order: idx },
          }),
        ),
      );

      return this.getGroup(optionGroupId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ConflictException('Falha ao reordenar itens.');
      }
      throw err;
    }
  }
}
