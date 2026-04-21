import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PricingAxis } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateProductOptionGroupLinkDto } from './dto/create-product-option-group-link.dto';
import { UpdateProductOptionGroupLinkDto } from './dto/update-product-option-group-link.dto';

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
      where: { id: optionGroupId, tenantId },
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

  async link(dto: CreateProductOptionGroupLinkDto) {
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

  async unlink(linkId: string) {
    const link = await this.prisma.tenantClient.productOptionGroupLink.findFirst({
      where: { id: linkId },
      select: { id: true, productId: true },
    });
    if (!link) throw new NotFoundException('Vínculo não encontrado.');

    await this.prisma.tenantClient.productOptionGroupLink.delete({ where: { id: linkId } });

    return { success: true };
  }

  async update(linkId: string, dto: UpdateProductOptionGroupLinkDto) {
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

    return updated;
  }

  async listByProduct(productId: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    return this.prisma.tenantClient.productOptionGroupLink.findMany({
      where: { productId, tenantId },
      orderBy: { order: 'asc' },
      include: {
        optionGroup: {
          include: { items: { orderBy: { order: 'asc' } } },
        },
      },
    });
  }

  async reorderLinks(productId: string, orderedLinkIds: string[]) {
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

    return this.listByProduct(productId);
  }
}
