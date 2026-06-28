import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { slugify } from '@gestor/utils';
import { CatalogTemplatesService } from '../catalog-templates.service';
import { AvailabilityService, SalesChannel } from '../publication/availability.service';
import type { Upsell } from '@gestor/types';
import { MediaLibraryService } from '../../upload/media-library.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly catalogTemplates: CatalogTemplatesService,
    private readonly availabilityService: AvailabilityService,
    private readonly mediaLibrary: MediaLibraryService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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

    const type = createProductDto.type ?? 'simple';
    const isCombo = type === 'combo';
    const comboMode = isCombo ? (createProductDto.comboMode ?? 'bundle') : undefined;
    const comboPricingType = isCombo && comboMode === 'bundle'
      ? (createProductDto.comboPricingType ?? 'fixed_price')
      : undefined;
    const comboPricingValue = isCombo && comboMode === 'bundle'
      ? Number(createProductDto.comboPricingValue ?? createProductDto.basePrice ?? 0)
      : undefined;
    const initialBasePrice = isCombo && comboMode === 'bundle'
      ? (comboPricingType === 'fixed_price' ? comboPricingValue : 0)
      : createProductDto.basePrice;
    const safeInitialBasePrice = initialBasePrice ?? 0;
    const normalizedCategoryId =
      typeof createProductDto.categoryId === 'string' && createProductDto.categoryId.trim() === ''
        ? null
        : (createProductDto.categoryId ?? null);
    const normalizedMediaAssetId =
      typeof createProductDto.mediaAssetId === 'string' && createProductDto.mediaAssetId.trim() !== ''
        ? createProductDto.mediaAssetId
        : null;

    const mediaAsset = normalizedMediaAssetId
      ? await this.mediaLibrary.assertProductCanUseAsset(tenantId, normalizedMediaAssetId)
      : null;

    const productExists = await this.prisma.tenantClient.product.findFirst({
      where: {
        tenantId,
        slug,
        deletedAt: null,
      },
    });

    if (productExists) {
      throw new ConflictException(`Já existe um produto com o nome "${createProductDto.name}" (slug: ${slug}).`);
    }

    // Check if there is a soft-deleted product with the same slug.
    // If so, we must rename its slug to avoid unique constraint violation in the database.
    const deletedProductConflict = await this.prisma.tenantClient.product.findFirst({
      where: {
        tenantId,
        slug,
        NOT: { deletedAt: null },
      },
    });

    if (deletedProductConflict) {
      // Free up the slug by renaming the deleted product's slug
      await this.prisma.tenantClient.product.update({
        where: { id: deletedProductConflict.id },
        data: { slug: `${slug}-deleted-${Date.now()}` },
      });
    }

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
        image: mediaAsset ? mediaAsset.publicUrl : (createProductDto.image ?? null),
        mediaAssetId: normalizedMediaAssetId,
        isActive: createProductDto.isActive ?? true,
        isFeatured: createProductDto.isFeatured ?? false,
        isAvailable: createProductDto.isAvailable ?? true,
        sellableOnline: createProductDto.sellableOnline ?? true,
        order: createProductDto.order ?? 0,
        sku: createProductDto.sku && createProductDto.sku.trim() !== '' ? createProductDto.sku : null,
        costPrice: createProductDto.costPrice ?? null,
      },
      include: { category: true, mediaAsset: true }
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

    // Auto-create publication for storefront visibility
    if (createProductDto.sellableOnline !== false) {
      await this.prisma.tenantClient.catalogPublication.create({
        data: {
          tenantId,
          productId: product.id,
          publicationStatus: 'published',
          operationalStatus: 'active',
        },
      });
    }

    await this.invalidateStorefrontCache(tenantId);

    return product;
  }

  async findAll(search?: string, limit?: number, channel?: SalesChannel) {
    const tenantId = this.getRequiredTenantId();
    
    const products = await this.prisma.tenantClient.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: channel ? true : undefined,
        // search logic...
        ...(search && {
          name: { contains: search, mode: 'insensitive' }
        })
      },
      orderBy: { order: 'asc' },
      include: { category: true, mediaAsset: true, publication: { include: { rules: true } } }
    });

    // If channel is provided, filter using AvailabilityService
    if (channel) {
      const filtered: typeof products = [];
      for (const p of products) {
        const decision = await this.availabilityService.decide({
          tenantId,
          productId: p.id,
          channel,
        });
        if (decision.canSell) {
          filtered.push(p);
        }
      }
      return limit ? filtered.slice(0, limit) : filtered;
    }

    if (limit) {
      return products.slice(0, limit);
    }
    
    return products;
  }

  async findOne(id: string) {
    const tenantId = this.getRequiredTenantId();
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: true,
        mediaAsset: true,

        optionGroupLinks: { include: { optionGroup: { include: { items: { orderBy: { order: 'asc' } } } } }, orderBy: { order: 'asc' } },

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

    const nextType = (updateProductDto.type ?? previous?.type ?? 'simple');
    const nextComboMode = nextType === 'combo'
      ? (updateProductDto.comboMode ?? previous?.comboMode ?? 'bundle')
      : null;
    const nextPricingType = nextType === 'combo' && nextComboMode === 'bundle'
      ? (updateProductDto.comboPricingType ?? previous?.comboPricingType ?? 'fixed_price')
      : null;
    const nextPricingValue = nextType === 'combo' && nextComboMode === 'bundle'
      ? Number(updateProductDto.comboPricingValue ?? previous?.comboPricingValue ?? 0)
      : null;

    if (slug) {
      const tenantId = this.getRequiredTenantId();
      const slugExists = await this.prisma.tenantClient.product.findFirst({
        where: {
          tenantId,
          slug,
          id: { not: id },
        },
      });
      if (slugExists) {
        throw new ConflictException(`Já existe outro produto com o nome "${updateProductDto.name}" (slug: ${slug}).`);
      }
    }

    const normalizedCategoryId =
      updateProductDto.categoryId === undefined
        ? undefined
        : (typeof updateProductDto.categoryId === 'string' && updateProductDto.categoryId.trim() === ''
            ? null
            : updateProductDto.categoryId);
    const normalizedMediaAssetId =
      updateProductDto.mediaAssetId === undefined
        ? undefined
        : (typeof updateProductDto.mediaAssetId === 'string' && updateProductDto.mediaAssetId.trim() !== ''
            ? updateProductDto.mediaAssetId
            : null);
    const mediaAsset =
      typeof normalizedMediaAssetId === 'string'
        ? await this.mediaLibrary.assertProductCanUseAsset(this.getRequiredTenantId(), normalizedMediaAssetId)
        : null;

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
        category: normalizedCategoryId === undefined
          ? undefined
          : (normalizedCategoryId === null ? { disconnect: true } : { connect: { id: normalizedCategoryId } }),
        shortDescription: updateProductDto.shortDescription ?? undefined,
        longDescription: updateProductDto.longDescription ?? undefined,
        basePrice: nextBasePrice,
        image: mediaAsset ? mediaAsset.publicUrl : updateProductDto.image ?? undefined,
        mediaAsset: normalizedMediaAssetId === undefined
          ? undefined
          : (normalizedMediaAssetId === null ? { disconnect: true } : { connect: { id: normalizedMediaAssetId } }),
        isActive: updateProductDto.isActive,
        isFeatured: updateProductDto.isFeatured,
        isAvailable: updateProductDto.isAvailable,
        sellableOnline: updateProductDto.sellableOnline,
        sku: updateProductDto.sku && updateProductDto.sku.trim() !== '' ? updateProductDto.sku : (updateProductDto.sku === '' ? null : undefined),
        order: updateProductDto.order,
        costPrice: updateProductDto.costPrice,
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

    await this.invalidateStorefrontCache(this.getRequiredTenantId());

    return product;
  }

  async remove(id: string) {
    const product = await this.findOne(id);

    // Soft delete - we also rename the slug to free it up for new products with the same name
    const timestamp = Date.now();
    const removed = await this.prisma.tenantClient.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${product.slug}-deleted-${timestamp}`,
      },
    });
    await this.invalidateStorefrontCache(this.getRequiredTenantId());
    return removed;
  }

  async listUpsellsForProduct(productId: string): Promise<Upsell[]> {
    await this.findOne(productId);

    const links = await this.prisma.tenantClient.productUpsell.findMany({
      where: { productId },
      include: { upsell: true },
    });

    return links
      .map((l) => l.upsell)
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => ({
        ...u,
        pricingValue: Number(u.pricingValue),
      })) as Upsell[];
  }

  async duplicate(id: string) {
    const tenantId = this.getRequiredTenantId();
    const source = await this.prisma.tenantClient.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        optionGroupLinks: true,

        comboBundleItems: true,
        publication: true,
        recipeIngredients: true,

        optionItemPrices: true,
        upsellLinks: true,
      },
    });

    if (!source) {
      throw new NotFoundException('Produto base não encontrado');
    }

    const newName = `${source.name} (Cópia)`;
    const newSlug = slugify(newName) + '-' + Math.random().toString(36).substring(2, 7);

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.product.create({
        data: {
          tenantId,
          name: newName,
          slug: newSlug,
          type: source.type,
          comboMode: source.comboMode,
          comboPricingType: source.comboPricingType,
          comboPricingValue: source.comboPricingValue,
          categoryId: source.categoryId,
          shortDescription: source.shortDescription,
          longDescription: source.longDescription,
          basePrice: source.basePrice,
          costPrice: source.costPrice,
          image: source.image,
          mediaAssetId: source.mediaAssetId,
          isActive: false, // Start inactive for safety
          isFeatured: source.isFeatured,
          isAvailable: source.isAvailable,
          sellableOnline: source.sellableOnline,
          sku: source.sku ? `${source.sku}-COPY` : null,
          order: (source.order ?? 0) + 1,
          recipeIngredients: {
            create: (source.recipeIngredients || []).map((ri) => ({
              tenantId,
              ingredientId: ri.ingredientId,
              quantity: ri.quantity,
            })),
          },
        },
      });

      // Duplicate Option Group Links
      if (source.optionGroupLinks.length > 0) {
        await tx.productOptionGroupLink.createMany({
          data: source.optionGroupLinks.map((l) => ({
            tenantId,
            productId: duplicate.id,
            optionGroupId: l.optionGroupId,
            order: l.order,
            pricingAxis: l.pricingAxis,
            overrideName: l.overrideName,
            overrideDescription: l.overrideDescription,
            overrideIsRequired: l.overrideIsRequired,
            overrideMinSelect: l.overrideMinSelect,
            overrideMaxSelect: l.overrideMaxSelect,
          })),
        });
      }



      // Duplicate Option Item Prices
      if (source.optionItemPrices && source.optionItemPrices.length > 0) {
        await tx.productOptionItemPrice.createMany({
          data: source.optionItemPrices.map((p) => ({
            tenantId,
            productId: duplicate.id,
            optionItemId: p.optionItemId,
            price: p.price,
          })),
        });
      }

      // Duplicate Upsell Links
      if (source.upsellLinks && source.upsellLinks.length > 0) {
        await tx.productUpsell.createMany({
          data: source.upsellLinks.map((l) => ({
            tenantId,
            productId: duplicate.id,
            upsellId: l.upsellId,
          })),
        });
      }



      // Duplicate Combo Bundle Items
      if (source.comboBundleItems.length > 0) {
        await tx.comboBundleItem.createMany({
          data: source.comboBundleItems.map((bi) => ({
            tenantId,
            comboProductId: duplicate.id, // The combo product
            productId: bi.productId,
            qty: bi.qty,
            sortOrder: bi.sortOrder,
          })),
        });
      }

      // Create Draft Publication
      await tx.catalogPublication.create({
        data: {
          tenantId,
          productId: duplicate.id,
          publicationStatus: 'draft',
          operationalStatus: 'inactive',
        },
      });

      return duplicate;
    });
  }
}
