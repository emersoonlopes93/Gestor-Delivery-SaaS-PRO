import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PricingAxis } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateProductOptionGroupLinkDto } from './dto/create-product-option-group-link.dto';
import { UpdateProductOptionGroupLinkDto } from './dto/update-product-option-group-link.dto';
import { UpdateProductOptionItemOverrideDto } from './dto/update-product-option-item-override.dto';

@Injectable()
export class ProductOptionGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
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

  private async assertNoPrimaryReplaceConflict(tenantId: string, productId: string) {
    const primaryLinks = await this.prisma.tenantClient.productOptionGroupLink.findMany({
      where: { tenantId, productId, pricingAxis: 'primary' },
      select: { optionGroupId: true },
    });

    if (primaryLinks.length === 0) return;

    const groupIds = primaryLinks.map((l) => l.optionGroupId);

    const replaceItems = await this.prisma.tenantClient.optionItem.findMany({
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

  async link(dto: CreateProductOptionGroupLinkDto, actorId?: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, dto.productId);
    const group = await this.ensureOptionGroup(tenantId, dto.optionGroupId);

    const pricingAxis = (dto.pricingAxis ?? 'secondary') as PricingAxis;

    const isRequired = dto.overrideIsRequired ?? group.isRequired;
    const minSelect = dto.overrideMinSelect ?? group.minSelect;
    const maxSelect = dto.overrideMaxSelect ?? group.maxSelect;

    this.validateOverrideRules({
      selectionType: group.selectionType,
      isRequired,
      minSelect,
      maxSelect,
    });

    try {
      const created = await this.prisma.tenantClient.productOptionGroupLink.create({
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

      await this.assertNoPrimaryReplaceConflict(tenantId, dto.productId);

      await this.audit(tenantId, actorId, 'catalog.product_option_group.linked', 'product_option_group_link', { productId: dto.productId, optionGroupId: dto.optionGroupId, linkId: created.id });
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
    const link = await this.prisma.tenantClient.productOptionGroupLink.findFirst({
      where: { id: linkId },
      select: { id: true, productId: true, optionGroupId: true },
    });
    if (!link) throw new NotFoundException('Vínculo não encontrado.');

    const items = await this.prisma.tenantClient.optionItem.findMany({
      where: { optionGroupId: link.optionGroupId, deletedAt: null },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);

    if (itemIds.length > 0) {
      await this.prisma.tenantClient.productOptionItemPrice.deleteMany({
        where: {
          productId: link.productId,
          optionItemId: { in: itemIds },
        },
      });
    }

    await this.prisma.tenantClient.productOptionGroupLink.delete({ where: { id: linkId } });

    await this.audit(this.getRequiredTenantId(), actorId, 'catalog.product_option_group.unlinked', 'product_option_group_link', { productId: link.productId, optionGroupId: link.optionGroupId, linkId });

    return { success: true };
  }

  async update(linkId: string, dto: UpdateProductOptionGroupLinkDto, actorId?: string) {
    const existing = await this.prisma.tenantClient.productOptionGroupLink.findFirst({
      where: { id: linkId },
      select: { id: true, productId: true, optionGroupId: true, pricingAxis: true, overrideIsRequired: true, overrideMinSelect: true, overrideMaxSelect: true },
    });
    if (!existing) throw new NotFoundException('Vínculo não encontrado.');

    const tenantId = this.getRequiredTenantId();
    const group = await this.ensureOptionGroup(tenantId, existing.optionGroupId);

    const isRequired = dto.overrideIsRequired ?? existing.overrideIsRequired ?? group.isRequired;
    const minSelect = dto.overrideMinSelect ?? existing.overrideMinSelect ?? group.minSelect;
    const maxSelect = dto.overrideMaxSelect ?? existing.overrideMaxSelect ?? group.maxSelect;

    this.validateOverrideRules({
      selectionType: group.selectionType,
      isRequired,
      minSelect,
      maxSelect,
    });

    const updated = await this.prisma.tenantClient.productOptionGroupLink.update({
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

    await this.assertNoPrimaryReplaceConflict(tenantId, existing.productId);

    await this.audit(tenantId, actorId, 'catalog.product_option_group.updated', 'product_option_group_link', { productId: existing.productId, optionGroupId: existing.optionGroupId, linkId });

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

    return this.listByProduct(productId);
  }
}
