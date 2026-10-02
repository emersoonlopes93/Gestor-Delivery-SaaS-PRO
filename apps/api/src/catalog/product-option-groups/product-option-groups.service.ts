import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Prisma, PricingAxis } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { runSerializableTransactionWithRetry } from '../../database/serializable-transaction';
import { CreateProductOptionGroupLinkDto } from './dto/create-product-option-group-link.dto';
import { UpdateProductOptionGroupLinkDto } from './dto/update-product-option-group-link.dto';
import { UpdateProductOptionItemOverrideDto } from './dto/update-product-option-item-override.dto';

@Injectable()
export class ProductOptionGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException('Tenant context não encontrado');
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

  private async ensureProduct(tenantId: string, productId: string) {
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }

  private async ensureOptionGroup(tenantId: string, optionGroupId: string) {
    const group = await this.prisma.tenantClient.optionGroup.findFirst({
      where: { id: optionGroupId, tenantId, deletedAt: null },
      select: { id: true, selectionType: true, isRequired: true, minSelect: true, maxSelect: true, isActive: true },
    });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return group;
  }

  private validateOverrideRules(input: {
    selectionType: string;
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
  }

  private async assertNoPrimaryReplaceConflict(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
  ) {
    const primaryLinks = await tx.productOptionGroupLink.findMany({
      where: { tenantId, productId, pricingAxis: 'primary' },
      select: { optionGroupId: true },
    });

    if (primaryLinks.length === 0) return;

    const groupIds = primaryLinks.map((l) => l.optionGroupId);

    const replaceItems = await tx.optionItem.findMany({
      where: {
        tenantId,
        optionGroupId: { in: groupIds },
        isActive: true,
        deletedAt: null,
        priceImpactType: 'replace',
      },
      select: { id: true },
      take: 2,
    });

    if (replaceItems.length > 0 && primaryLinks.length > 1) {
      throw new BadRequestException(
        'Conflito: mais de um grupo PRIMARY com itens REPLACE ativos no mesmo produto.',
      );
    }
  }

  private async assertPricingAxisSupportsReplace(
    tx: Prisma.TransactionClient,
    tenantId: string,
    optionGroupId: string,
    groupIsActive: boolean,
    pricingAxis: PricingAxis,
  ): Promise<void> {
    if (!groupIsActive) return;

    const activeReplaceItem = await tx.optionItem.findFirst({
      where: {
        tenantId,
        optionGroupId,
        deletedAt: null,
        isActive: true,
        priceImpactType: 'replace',
      },
      select: { id: true, allowQuantity: true, minQty: true, maxQty: true },
    });

    if (!activeReplaceItem) return;

    if (activeReplaceItem.allowQuantity || activeReplaceItem.minQty !== 1 || activeReplaceItem.maxQty !== 1) {
      throw new BadRequestException('Item REPLACE ativo deve usar allowQuantity=false e faixa 1..1.');
    }

    if (pricingAxis === 'secondary') {
      throw new BadRequestException('Grupo com item REPLACE ativo deve usar eixo PRIMARY.');
    }
  }

  async link(dto: CreateProductOptionGroupLinkDto, actorId?: string) {
    const tenantId = this.getRequiredTenantId();

    try {
      const { created, promotedToConfigurable } = await runSerializableTransactionWithRetry(
        this.prisma,
        async (tx) => {
          const product = await tx.product.findFirst({
            where: { id: dto.productId, tenantId, deletedAt: null },
            select: { id: true, type: true },
          });
          if (!product) throw new NotFoundException('Produto não encontrado.');

          const group = await tx.optionGroup.findFirst({
            where: { id: dto.optionGroupId, tenantId, deletedAt: null },
            select: { id: true, selectionType: true, isRequired: true, minSelect: true, maxSelect: true, isActive: true },
          });
          if (!group) throw new NotFoundException('Grupo não encontrado.');

          const isRequired = dto.overrideIsRequired ?? group.isRequired;
          const minSelect = dto.overrideMinSelect ?? group.minSelect;
          const maxSelect = dto.overrideMaxSelect ?? group.maxSelect;
          this.validateOverrideRules({ selectionType: group.selectionType, isRequired, minSelect, maxSelect });
          const pricingAxis = (dto.pricingAxis ?? 'secondary') as PricingAxis;
          await this.assertPricingAxisSupportsReplace(tx, tenantId, group.id, group.isActive, pricingAxis);

          const created = await tx.productOptionGroupLink.create({
            data: {
              tenantId,
              productId: dto.productId,
              optionGroupId: dto.optionGroupId,
              order: dto.order ?? 0,
              overrideName: dto.overrideName ?? null,
              overrideDescription: dto.overrideDescription ?? null,
              overrideIsRequired: dto.overrideIsRequired ?? null,
              overrideMinSelect: dto.overrideMinSelect ?? null,
              overrideMaxSelect: dto.overrideMaxSelect ?? null,
              pricingAxis,
            } satisfies Prisma.ProductOptionGroupLinkUncheckedCreateInput,
          });

          await this.assertNoPrimaryReplaceConflict(tx, tenantId, dto.productId);

          const promotion = product.type === 'simple'
            ? await tx.product.updateMany({
              where: { id: product.id, tenantId, type: 'simple', deletedAt: null },
              data: { type: 'configurable' },
            })
            : { count: 0 };

          return { created, promotedToConfigurable: promotion.count > 0 };
        },
      );

      await this.audit(tenantId, actorId, 'catalog.product_option_group.linked', 'product_option_group_link', {
        productId: dto.productId,
        optionGroupId: dto.optionGroupId,
        linkId: created.id,
        promotedToConfigurable,
      });
      await this.invalidateStorefrontCache(tenantId);
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException('Este grupo já está vinculado a este produto.');
        }
      }
      throw err;
    }
  }

  async upsertItemOverride(
    productId: string,
    optionItemId: string,
    dto: UpdateProductOptionItemOverrideDto,
    actorId?: string,
  ) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const item = await this.prisma.tenantClient.optionItem.findFirst({
      where: { id: optionItemId, tenantId, deletedAt: null, optionGroup: { deletedAt: null } },
      select: { id: true, optionGroupId: true, isActive: true },
    });
    if (!item) throw new NotFoundException('Item de opção não encontrado.');

    const link = await this.prisma.tenantClient.productOptionGroupLink.findFirst({
      where: { productId, optionGroupId: item.optionGroupId, tenantId },
      select: { id: true },
    });
    if (!link) {
      throw new BadRequestException('Este item de opção não pertence a um grupo vinculado a este produto.');
    }

    const existing = await this.prisma.tenantClient.productOptionItemPrice.findUnique({
      where: { productId_optionItemId: { productId, optionItemId } },
    });

    const nextIsActive = dto.isActive !== undefined ? dto.isActive : (existing?.isActive ?? null);
    const nextPrice = dto.price !== undefined ? (dto.price !== null ? new Prisma.Decimal(dto.price) : null) : (existing?.price ?? null);

    // Se nenhum override for mantido (isActive é true/null e preço é null), deletar o registro para herdar padrão
    if ((nextIsActive === null || nextIsActive === true) && nextPrice === null) {
      if (existing) {
        await this.prisma.tenantClient.productOptionItemPrice.delete({
          where: { productId_optionItemId: { productId, optionItemId } },
        });
      }
      await this.audit(tenantId, actorId, 'catalog.product_option_item.override_cleared', 'product_option_item_price', { productId, optionItemId });
      await this.invalidateStorefrontCache(tenantId);
      return { success: true, effectiveIsActive: item.isActive, override: null };
    }

    const updated = await this.prisma.tenantClient.productOptionItemPrice.upsert({
      where: { productId_optionItemId: { productId, optionItemId } },
      create: {
        tenantId,
        productId,
        optionItemId,
        isActive: nextIsActive,
        price: nextPrice,
      },
      update: {
        isActive: nextIsActive,
        price: nextPrice,
      },
    });

    const effectiveIsActive = item.isActive && (updated.isActive ?? true);
    await this.audit(tenantId, actorId, 'catalog.product_option_item.override_updated', 'product_option_item_price', { productId, optionItemId });
    await this.invalidateStorefrontCache(tenantId);
    return {
      success: true,
      effectiveIsActive,
      override: {
        id: updated.id,
        isActive: updated.isActive,
        price: updated.price ? Number(updated.price) : null,
      },
    };
  }

  async unlink(linkId: string, actorId?: string) {
    const tenantId = this.getRequiredTenantId();
    const link = await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const existing = await tx.productOptionGroupLink.findFirst({
        where: { id: linkId, tenantId },
        select: { id: true, productId: true, optionGroupId: true },
      });
      if (!existing) throw new NotFoundException('Vínculo não encontrado.');

      const items = await tx.optionItem.findMany({
        where: { optionGroupId: existing.optionGroupId, tenantId },
        select: { id: true },
      });
      const itemIds = items.map((item) => item.id);

      if (itemIds.length > 0) {
        await tx.productOptionItemPrice.deleteMany({
          where: { tenantId, productId: existing.productId, optionItemId: { in: itemIds } },
        });
      }

      await tx.productOptionGroupLink.delete({ where: { id: existing.id } });
      return existing;
    });

    await this.audit(tenantId, actorId, 'catalog.product_option_group.unlinked', 'product_option_group_link', { productId: link.productId, optionGroupId: link.optionGroupId, linkId });
    await this.invalidateStorefrontCache(tenantId);

    return { success: true };
  }

  async update(linkId: string, dto: UpdateProductOptionGroupLinkDto, actorId?: string) {
    const tenantId = this.getRequiredTenantId();
    const { existing, updated } = await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const existing = await tx.productOptionGroupLink.findFirst({
        where: { id: linkId, tenantId },
        select: { id: true, productId: true, optionGroupId: true, pricingAxis: true, overrideIsRequired: true, overrideMinSelect: true, overrideMaxSelect: true },
      });
      if (!existing) throw new NotFoundException('Vínculo não encontrado.');

      const group = await tx.optionGroup.findFirst({
        where: { id: existing.optionGroupId, tenantId, deletedAt: null },
        select: { selectionType: true, isRequired: true, minSelect: true, maxSelect: true, isActive: true },
      });
      if (!group) throw new NotFoundException('Grupo não encontrado.');

      const isRequired = dto.overrideIsRequired ?? existing.overrideIsRequired ?? group.isRequired;
      const minSelect = dto.overrideMinSelect ?? existing.overrideMinSelect ?? group.minSelect;
      const maxSelect = dto.overrideMaxSelect ?? existing.overrideMaxSelect ?? group.maxSelect;
      this.validateOverrideRules({ selectionType: group.selectionType, isRequired, minSelect, maxSelect });
      const pricingAxis = (dto.pricingAxis ?? existing.pricingAxis) as PricingAxis;
      await this.assertPricingAxisSupportsReplace(tx, tenantId, existing.optionGroupId, group.isActive, pricingAxis);

      const updated = await tx.productOptionGroupLink.update({
        where: { id: linkId },
        data: {
          order: dto.order,
          overrideName: dto.overrideName ?? undefined,
          overrideDescription: dto.overrideDescription ?? undefined,
          overrideIsRequired: dto.overrideIsRequired ?? undefined,
          overrideMinSelect: dto.overrideMinSelect ?? undefined,
          overrideMaxSelect: dto.overrideMaxSelect ?? undefined,
          pricingAxis: dto.pricingAxis as PricingAxis | undefined,
        },
      });

      await this.assertNoPrimaryReplaceConflict(tx, tenantId, existing.productId);
      return { existing, updated };
    });

    await this.audit(tenantId, actorId, 'catalog.product_option_group.updated', 'product_option_group_link', { productId: existing.productId, optionGroupId: existing.optionGroupId, linkId });
    await this.invalidateStorefrontCache(tenantId);

    return updated;
  }

  async listByProduct(productId: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const links = await this.prisma.tenantClient.productOptionGroupLink.findMany({
      where: { productId, tenantId, optionGroup: { deletedAt: null } },
      orderBy: { order: 'asc' },
      include: {
        optionGroup: {
          include: { items: { where: { deletedAt: null }, orderBy: { order: 'asc' } } },
        },
      },
    });

    const overrides = await this.prisma.tenantClient.productOptionItemPrice.findMany({
      where: { productId, tenantId },
    });

    const overrideMap = new Map(overrides.map((o) => [o.optionItemId, o]));

    return links.map((link) => ({
      ...link,
      optionGroup: {
        ...link.optionGroup,
        items: link.optionGroup.items.map((item) => {
          const override = overrideMap.get(item.id);
          const effectiveIsActive = item.deletedAt === null && item.isActive && (override?.isActive ?? true);
          return {
            ...item,
            effectiveIsActive,
            override: override
              ? {
                  id: override.id,
                  isActive: override.isActive,
                  price: override.price ? Number(override.price) : null,
                }
              : null,
          };
        }),
      },
    }));
  }

  async reorderLinks(productId: string, orderedLinkIds: string[], actorId?: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const links = await this.prisma.tenantClient.productOptionGroupLink.findMany({
      where: { tenantId, productId },
      select: { id: true },
    });

    const linkIds = new Set(links.map((l) => l.id));

    for (const id of orderedLinkIds) {
      if (!linkIds.has(id)) {
        throw new BadRequestException('Lista de ordenação contém vínculo inválido para este produto.');
      }
    }

    if (orderedLinkIds.length !== links.length) {
      throw new BadRequestException('Lista de ordenação incompleta.');
    }

    await this.prisma.$transaction(
      orderedLinkIds.map((id, idx) =>
        this.prisma.tenantClient.productOptionGroupLink.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );

    await this.audit(tenantId, actorId, 'catalog.product_option_group.reordered', 'product_option_group_link', { productId, count: orderedLinkIds.length });
    await this.invalidateStorefrontCache(tenantId);

    return this.listByProduct(productId);
  }
}
