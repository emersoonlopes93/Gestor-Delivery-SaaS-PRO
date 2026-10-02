import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Prisma, PriceImpactType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { runSerializableTransactionWithRetry } from '../../database/serializable-transaction';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { UpdateOptionGroupDto } from './dto/update-option-group.dto';
import { CreateOptionItemDto } from './dto/create-option-item.dto';
import { UpdateOptionItemDto } from './dto/update-option-item.dto';

@Injectable()
export class OptionGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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

  private async invalidateStorefrontCache(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant?.slug) return;

    await Promise.all([
      this.cacheManager.del(`storefront:${tenant.slug}:delivery`),
      this.cacheManager.del(`storefront:${tenant.slug}:pickup`),
    ]);
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

    if (input.priceImpactType === 'replace') {
      if (input.allowQuantity) {
        throw new BadRequestException('REPLACE não permite quantidade.');
      }
      if (input.minQty !== 1) {
        throw new BadRequestException('REPLACE requer minQty igual a 1.');
      }
      if (input.maxQty !== 1) {
        throw new BadRequestException('REPLACE requer maxQty igual a 1.');
      }
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

  private async assertLinkedReplacePricingInvariants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    optionGroupId: string,
    groupIsActive: boolean,
    item: { isActive: boolean; priceImpactType: PriceImpactType; minQty: number | null; maxQty: number | null; allowQuantity: boolean },
  ): Promise<void> {
    this.validateItemRules({
      priceImpactType: item.priceImpactType,
      priceImpactValue: 0,
      allowQuantity: item.allowQuantity,
      minQty: item.minQty,
      maxQty: item.maxQty,
    });

    if (!groupIsActive || !item.isActive || item.priceImpactType !== 'replace') return;

    const secondaryLink = await tx.productOptionGroupLink.findFirst({
      where: { tenantId, optionGroupId, pricingAxis: 'secondary' },
      select: { id: true },
    });
    if (secondaryLink) {
      throw new BadRequestException('Item REPLACE ativo não pode pertencer a grupo vinculado no eixo SECONDARY.');
    }
  }

  private async assertGroupLinkedPricingInvariants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    optionGroupId: string,
    groupIsActive: boolean,
  ): Promise<void> {
    if (!groupIsActive) return;

    const replaceItems = await tx.optionItem.findMany({
      where: { tenantId, optionGroupId, deletedAt: null, isActive: true, priceImpactType: 'replace' },
      select: { isActive: true, priceImpactType: true, allowQuantity: true, minQty: true, maxQty: true },
    });
    for (const item of replaceItems) {
      await this.assertLinkedReplacePricingInvariants(tx, tenantId, optionGroupId, groupIsActive, item);
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
    const groups = await this.prisma.tenantClient.optionGroup.findMany({
      where: includeArchived ? undefined : { deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        items: { where: includeArchived ? undefined : { deletedAt: null }, orderBy: { order: 'asc' } },
        productLinks: { select: { id: true, productId: true, order: true } },
        _count: { select: { productLinks: true } },
      },
    });

    return groups.map(({ _count, ...group }) => ({
      ...group,
      _count: { optionGroupLinks: _count.productLinks },
    }));
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
        _count: { select: { productLinks: true } },
      },
    });

    if (!group) throw new NotFoundException('Grupo não encontrado.');
    const { _count, ...groupData } = group;
    return { ...groupData, _count: { optionGroupLinks: _count.productLinks } };
  }

  async updateGroup(id: string, dto: UpdateOptionGroupDto, actorId?: string) {
    const tenantId = this.getRequiredTenantId();
    const group = await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const existing = await tx.optionGroup.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { selectionType: true, isRequired: true, minSelect: true, maxSelect: true, isActive: true },
      });
      if (!existing) throw new NotFoundException('Grupo não encontrado.');

      const next = {
        selectionType: dto.selectionType ?? existing.selectionType,
        isRequired: dto.isRequired ?? existing.isRequired,
        minSelect: dto.minSelect ?? existing.minSelect,
        maxSelect: dto.maxSelect ?? existing.maxSelect,
        isActive: dto.isActive ?? existing.isActive,
      };
      this.validateGroupRules(next);
      await this.assertGroupLinkedPricingInvariants(tx, tenantId, id, next.isActive);

      return tx.optionGroup.update({
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
    });
    await this.audit(tenantId, actorId, 'catalog.option_group.updated', 'option_group', { optionGroupId: id });
    await this.invalidateStorefrontCache(tenantId);
    return group;
  }

  async archiveGroup(id: string, actorId?: string) {
    await this.getGroup(id);
    const group = await this.prisma.tenantClient.optionGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    const tenantId = this.getRequiredTenantId();
    await this.audit(tenantId, actorId, 'catalog.option_group.archived', 'option_group', { optionGroupId: id });
    await this.invalidateStorefrontCache(tenantId);
    return group;
  }

  async restoreGroup(id: string, actorId?: string) {
    const group = await this.getGroup(id, true);
    if (!group.deletedAt) throw new BadRequestException('Grupo não está arquivado.');
    const restored = await this.prisma.tenantClient.optionGroup.update({ where: { id }, data: { deletedAt: null } });
    const tenantId = this.getRequiredTenantId();
    await this.audit(tenantId, actorId, 'catalog.option_group.restored', 'option_group', { optionGroupId: id });
    await this.invalidateStorefrontCache(tenantId);
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
    const tenantId = this.getRequiredTenantId();
    const impactType = (dto.priceImpactType ?? 'none') as PriceImpactType;
    const item = await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const group = await tx.optionGroup.findFirst({
        where: { id: dto.optionGroupId, tenantId, deletedAt: null },
        select: { id: true, isActive: true },
      });
      if (!group) throw new NotFoundException('Grupo não encontrado.');

      const nextItem = {
        isActive: dto.isActive ?? true,
        priceImpactType: impactType,
        allowQuantity: dto.allowQuantity ?? false,
        minQty: dto.minQty ?? null,
        maxQty: dto.maxQty ?? null,
      };
      this.validateItemRules({ ...nextItem, priceImpactValue: dto.priceImpactValue ?? 0 });
      await this.assertLinkedReplacePricingInvariants(tx, tenantId, group.id, group.isActive, nextItem);

      return tx.optionItem.create({
        data: {
          tenantId,
          optionGroupId: dto.optionGroupId,
          name: dto.name,
          description: dto.description ?? null,
          sku: dto.sku ?? null,
          isActive: nextItem.isActive,
          order: dto.order ?? 0,
          priceImpactType: impactType,
          priceImpactValue: dto.priceImpactValue ?? 0,
          allowQuantity: nextItem.allowQuantity,
          minQty: nextItem.minQty,
          maxQty: nextItem.maxQty,
        } satisfies Prisma.OptionItemUncheckedCreateInput,
      });
    });
    await this.audit(tenantId, actorId, 'catalog.option_item.created', 'option_item', { optionItemId: item.id, optionGroupId: dto.optionGroupId });
    await this.invalidateStorefrontCache(tenantId);
    return item;
  }

  async updateItem(id: string, dto: UpdateOptionItemDto, actorId?: string) {
    const tenantId = this.getRequiredTenantId();
    const updated = await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const item = await tx.optionItem.findFirst({
        where: { id, tenantId, deletedAt: null, optionGroup: { deletedAt: null } },
        include: { optionGroup: { select: { id: true, isActive: true } } },
      });
      if (!item) throw new NotFoundException('Item não encontrado.');

      const nextItem = {
        isActive: dto.isActive ?? item.isActive,
        priceImpactType: (dto.priceImpactType ?? item.priceImpactType) as PriceImpactType,
        allowQuantity: dto.allowQuantity ?? item.allowQuantity,
        minQty: dto.minQty ?? item.minQty,
        maxQty: dto.maxQty ?? item.maxQty,
      };
      this.validateItemRules({ ...nextItem, priceImpactValue: dto.priceImpactValue ?? Number(item.priceImpactValue) });
      await this.assertLinkedReplacePricingInvariants(tx, tenantId, item.optionGroup.id, item.optionGroup.isActive, nextItem);

      const updated = await tx.optionItem.update({
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
      return { updated, optionGroupId: item.optionGroupId };
    });
    await this.audit(tenantId, actorId, 'catalog.option_item.updated', 'option_item', { optionItemId: id, optionGroupId: updated.optionGroupId });
    await this.invalidateStorefrontCache(tenantId);
    return updated.updated;
  }

  async archiveItem(id: string, actorId?: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, optionGroupId: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');

    const archived = await this.prisma.tenantClient.optionItem.update({ where: { id }, data: { deletedAt: new Date() } });
    const tenantId = this.getRequiredTenantId();
    await this.audit(tenantId, actorId, 'catalog.option_item.archived', 'option_item', { optionItemId: id, optionGroupId: item.optionGroupId });
    await this.invalidateStorefrontCache(tenantId);
    return archived;
  }

  async restoreItem(id: string, actorId?: string) {
    const item = await this.prisma.tenantClient.optionItem.findFirst({ where: { id }, select: { id: true, optionGroupId: true, deletedAt: true } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (!item.deletedAt) throw new BadRequestException('Item não está arquivado.');
    const restored = await this.prisma.tenantClient.optionItem.update({ where: { id }, data: { deletedAt: null } });
    const tenantId = this.getRequiredTenantId();
    await this.audit(tenantId, actorId, 'catalog.option_item.restored', 'option_item', { optionItemId: id, optionGroupId: item.optionGroupId });
    await this.invalidateStorefrontCache(tenantId);
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

      await this.invalidateStorefrontCache(this.getRequiredTenantId());

      return this.getGroup(optionGroupId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ConflictException('Falha ao reordenar itens.');
      }
      throw err;
    }
  }
}
