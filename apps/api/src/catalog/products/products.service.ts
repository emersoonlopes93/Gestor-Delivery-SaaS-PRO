import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import type { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { slugify } from '@gestor/utils';
import { CatalogTemplatesService } from '../catalog-templates.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly catalogTemplates: CatalogTemplatesService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException('Tenant context não encontrado');
    }
    return tenantId;
  }

  private roundMoney(value: number): number {
    return Number((Math.round(value * 100) / 100).toFixed(2));
  }

  calculateComboBundleFinalPrice(
    subtotal: number,
    pricingType: 'fixed_price' | 'discount_percent' | 'discount_amount',
    pricingValue: number,
  ) {
    const normalizedSubtotal = Math.max(0, subtotal);
    const normalizedValue = Math.max(0, pricingValue);

    let finalPrice = normalizedSubtotal;
    if (pricingType === 'fixed_price') {
      finalPrice = normalizedValue;
    } else if (pricingType === 'discount_percent') {
      const percent = Math.min(100, normalizedValue);
      finalPrice = normalizedSubtotal * (1 - percent / 100);
    } else if (pricingType === 'discount_amount') {
      finalPrice = normalizedSubtotal - normalizedValue;
    }

    finalPrice = Math.max(0, finalPrice);
    const discountTotal = Math.max(0, normalizedSubtotal - finalPrice);

    return {
      subtotal: this.roundMoney(normalizedSubtotal),
      finalPrice: this.roundMoney(finalPrice),
      discountTotal: this.roundMoney(discountTotal),
    };
  }

  async recalculateComboBundlePrice(productId: string) {
    const tenantId = this.getRequiredTenantId();
    const combo = await this.prisma.tenantClient.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      include: {
        comboBundleItems: {
          include: {
            product: {
              select: { id: true, basePrice: true, isActive: true, deletedAt: true, type: true },
            },
          },
        },
      },
    });

    if (!combo || combo.type !== 'combo' || combo.comboMode !== 'bundle') {
      return null;
    }

    const subtotal = combo.comboBundleItems.reduce((sum, item) => {
      if (!item.product || item.product.deletedAt || !item.product.isActive) return sum;
      return sum + Number(item.product.basePrice) * Math.max(1, item.qty);
    }, 0);

    const pricingType = (combo.comboPricingType ?? 'fixed_price') as 'fixed_price' | 'discount_percent' | 'discount_amount';
    const pricingValue = Number(combo.comboPricingValue ?? 0);
    const pricing = this.calculateComboBundleFinalPrice(subtotal, pricingType, pricingValue);

    await this.prisma.tenantClient.product.update({
      where: { id: combo.id },
      data: { basePrice: pricing.finalPrice },
    });

    return {
      pricingType,
      pricingValue,
      ...pricing,
    };
  }

  async create(createProductDto: CreateProductDto) {
    const tenantId = this.getRequiredTenantId();
    const slug = slugify(createProductDto.name);

    const type = (createProductDto as unknown as { type?: 'simple' | 'configurable' | 'combo' }).type ?? 'simple';
    const isCombo = type === 'combo';
    const comboMode = isCombo ? ((createProductDto as unknown as { comboMode?: 'bundle' | 'slot' }).comboMode ?? 'bundle') : undefined;
    const comboPricingType = isCombo && comboMode === 'bundle'
      ? ((createProductDto as unknown as { comboPricingType?: 'fixed_price' | 'discount_percent' | 'discount_amount' }).comboPricingType ?? 'fixed_price')
      : undefined;
    const comboPricingValue = isCombo && comboMode === 'bundle'
      ? Number((createProductDto as unknown as { comboPricingValue?: number }).comboPricingValue ?? createProductDto.basePrice ?? 0)
      : undefined;
    const initialBasePrice = isCombo && comboMode === 'bundle'
      ? (comboPricingType === 'fixed_price' ? comboPricingValue : 0)
      : createProductDto.basePrice;
    const safeInitialBasePrice = initialBasePrice ?? 0;
    const normalizedCategoryId =
      typeof createProductDto.categoryId === 'string' && createProductDto.categoryId.trim() === ''
        ? null
        : (createProductDto.categoryId ?? null);

    const product = await this.prisma.tenantClient.product.create({
      data: {
        tenantId,
        slug,
        name: createProductDto.name,
        type,
        comboMode: isCombo ? comboMode : null,
        comboPricingType: isCombo ? comboPricingType ?? null : null,
        comboPricingValue: isCombo ? comboPricingValue ?? null : null,
        categoryId: normalizedCategoryId,
        shortDescription: createProductDto.shortDescription ?? null,
        longDescription: createProductDto.longDescription ?? null,
        basePrice: safeInitialBasePrice,
        image: createProductDto.image ?? null,
        isActive: createProductDto.isActive ?? true,
        isFeatured: createProductDto.isFeatured ?? false,
        isAvailable: createProductDto.isAvailable ?? true,
        sellableOnline: createProductDto.sellableOnline ?? true,
        sku: createProductDto.sku ?? null,
        order: createProductDto.order ?? 0,
      },
      include: { category: true }
    });

    if (isCombo && comboMode === 'bundle') {
      await this.recalculateComboBundlePrice(product.id);
    }

    // Auto-config for specialized templates
    if (normalizedCategoryId) {
      const category = await this.prisma.tenantClient.productCategory.findFirst({
        where: { id: normalizedCategoryId, tenantId, deletedAt: null },
        select: { templateType: true },
      });
      if (category?.templateType === 'pizza') {
        await this.catalogTemplates.configureProductAsFlavor(tenantId, product.id);
      }
    }

    return product;
  }

  async findAll() {
    return this.prisma.tenantClient.product.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: { category: true, publication: true }
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        complementGroups: { include: { group: true } },
        optionGroupLinks: { include: { optionGroup: { include: { items: { orderBy: { order: 'asc' } } } } }, orderBy: { order: 'asc' } },
        comboSlots: { include: { allowedItems: { include: { product: true }, orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
        comboBundleItems: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
        publication: { include: { rules: { orderBy: { createdAt: 'asc' } } } },
        optionItemPrices: true,
      }
    });

    if (!product) {
      throw new NotFoundException(`Produto não encontrado.`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    // Check if exists
    await this.findOne(id);

    const slug = updateProductDto.name ? slugify(updateProductDto.name) : undefined;

    const previous = await this.prisma.tenantClient.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, type: true, comboMode: true, comboPricingType: true, comboPricingValue: true },
    });

    const nextType = ((updateProductDto as unknown as { type?: 'simple' | 'configurable' | 'combo' }).type ?? previous?.type ?? 'simple');
    const nextComboMode = nextType === 'combo'
      ? ((updateProductDto as unknown as { comboMode?: 'bundle' | 'slot' }).comboMode ?? previous?.comboMode ?? 'bundle')
      : null;
    const nextPricingType = nextType === 'combo' && nextComboMode === 'bundle'
      ? ((updateProductDto as unknown as { comboPricingType?: 'fixed_price' | 'discount_percent' | 'discount_amount' }).comboPricingType ?? previous?.comboPricingType ?? 'fixed_price')
      : null;
    const nextPricingValue = nextType === 'combo' && nextComboMode === 'bundle'
      ? Number((updateProductDto as unknown as { comboPricingValue?: number }).comboPricingValue ?? previous?.comboPricingValue ?? 0)
      : null;
    const normalizedCategoryId =
      updateProductDto.categoryId === undefined
        ? undefined
        : (typeof updateProductDto.categoryId === 'string' && updateProductDto.categoryId.trim() === ''
            ? null
            : updateProductDto.categoryId);

    let nextBasePrice = updateProductDto.basePrice;
    if (nextType === 'combo' && nextComboMode === 'bundle') {
      // Combo bundle sempre tem preço derivado da estratégia.
      nextBasePrice = nextPricingType === 'fixed_price' ? nextPricingValue ?? 0 : 0;
    }

    const product = await this.prisma.tenantClient.product.update({
      where: { id },
      data: {
        name: updateProductDto.name,
        type: nextType,
        comboMode: nextType === 'combo' ? nextComboMode : null,
        comboPricingType: nextType === 'combo' ? nextPricingType : null,
        comboPricingValue: nextType === 'combo' ? nextPricingValue : null,
        categoryId: normalizedCategoryId,
        shortDescription: updateProductDto.shortDescription ?? undefined,
        longDescription: updateProductDto.longDescription ?? undefined,
        basePrice: nextBasePrice,
        image: updateProductDto.image ?? undefined,
        isActive: updateProductDto.isActive,
        isFeatured: updateProductDto.isFeatured,
        isAvailable: updateProductDto.isAvailable,
        sellableOnline: updateProductDto.sellableOnline,
        sku: updateProductDto.sku ?? undefined,
        order: updateProductDto.order,
        ...(slug ? { slug } : {}),
      },
    });

    if (nextType === 'combo' && nextComboMode === 'bundle') {
      await this.recalculateComboBundlePrice(id);
    }

    // Bulk update option item prices (size prices for pizza flavors)
    const itemPrices = updateProductDto.optionItemPrices;
    if (itemPrices && itemPrices.length > 0) {
      const tenantId = this.getRequiredTenantId();
      await Promise.all(
        itemPrices.map((p) =>
          this.prisma.tenantClient.productOptionItemPrice.upsert({
            where: {
              productId_optionItemId: {
                productId: id,
                optionItemId: p.optionItemId,
              },
            },
            create: {
              tenantId,
              productId: id,
              optionItemId: p.optionItemId,
              price: p.price,
            },
            update: {
              price: p.price,
            },
          }),
        ),
      );
    }

    return product;
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft delete
    return this.prisma.tenantClient.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
