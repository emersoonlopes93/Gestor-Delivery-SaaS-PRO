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

  async createGroup(dto: CreateOptionGroupDto) {
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

    return this.prisma.tenantClient.optionGroup.create({
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
      } satisfies Prisma.OptionGroupUncheckedCreateInput,
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async listGroups() {
    return this.prisma.tenantClient.optionGroup.findMany({
      orderBy: { order: 'asc' },
      include: {
        items: { orderBy: { order: 'asc' } },
        productLinks: { select: { id: true, productId: true, order: true } },
      },
    });
  }

  async getGroup(id: string) {
    const group = await this.prisma.tenantClient.optionGroup.findFirst({
      where: { id },
      include: {
        items: { orderBy: { order: 'asc' } },
        productLinks: {
          orderBy: { order: 'asc' },
          include: { product: { select: { id: true, name: true, type: true, isActive: true } } },
        },
      },
    });

    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return group;
  }

  async updateGroup(id: string, dto: UpdateOptionGroupDto) {
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

    return this.prisma.tenantClient.optionGroup.update({
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
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async deleteGroup(id: string) {
    await this.getGroup(id);
    return this.prisma.tenantClient.optionGroup.delete({
      where: { id },
    });
  }

  async createItem(dto: CreateOptionItemDto) {
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

    return this.prisma.tenantClient.optionItem.create({
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
  }

  async updateItem(id: string, dto: UpdateOptionItemDto) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id },
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

    return this.prisma.tenantClient.optionItem.update({
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
  }

  async deleteItem(id: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');

    return this.prisma.tenantClient.optionItem.delete({
      where: { id },
    });
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
