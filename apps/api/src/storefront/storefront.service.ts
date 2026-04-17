import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorefrontPayload, StorefrontCategoryPayload, StorefrontComboPayload, StorefrontProductPayload } from '@gestor/types';
import { TenantStatus, Prisma } from '@prisma/client';
import { AvailabilityService, SalesChannel } from '../orders/availability.service';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async getStorefrontPayload(
    slug: string,
    fulfillmentType: 'delivery' | 'pickup' = 'delivery',
  ): Promise<StorefrontPayload> {
    const channel: SalesChannel =
      fulfillmentType === 'pickup' ? 'storefront_pickup' : 'storefront_delivery';

    // 1. Resolve Tenant
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: TenantStatus.active }, // only active tenants
      include: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Loja inativa ou não encontrada.');
    }

    // 2. Fetch Active Categories with their Active Products
    const categoriesDb = await this.prisma.productCategory.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      include: {
        products: {
          where: { isActive: true, deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            complementGroups: {
              orderBy: { order: 'asc' },
              include: {
                group: {
                  include: {
                    items: {
                      where: { isActive: true },
                      orderBy: { order: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    type CategoryWithProducts = Prisma.ProductCategoryGetPayload<{
      include: {
        products: {
          include: {
            complementGroups: {
              include: { group: { include: { items: true } } };
            };
          };
        };
      };
    }>;

    // 3. Fetch Active Combos (V2 Product combo)
    const combosDb = await this.prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        type: 'combo',
        isActive: true,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      include: {
        comboBundleItems: {
          orderBy: { sortOrder: 'asc' },
          include: { product: true },
        },
        comboSlots: {
          orderBy: { order: 'asc' },
          include: {
            allowedItems: {
              orderBy: { order: 'asc' },
              include: { product: true },
            },
          },
        },
      },
    });

    type ComboWithData = Prisma.ProductGetPayload<{
      include: {
        comboBundleItems: { include: { product: true } };
        comboSlots: { include: { allowedItems: { include: { product: true } } } };
      };
    }>;

    const categoryRows = categoriesDb as CategoryWithProducts[];
    const comboRows = combosDb as ComboWithData[];
    const idsToCheck = new Set<string>();

    for (const cat of categoryRows) {
      for (const product of cat.products) idsToCheck.add(product.id);
    }
    for (const combo of comboRows) idsToCheck.add(combo.id);

    const availabilityPairs = await Promise.all(
      [...idsToCheck].map(async (productId) => {
        const decision = await this.availabilityService.decide({
          tenantId: tenant.id,
          productId,
          channel,
        });
        return [productId, decision.canSell] as const;
      }),
    );
    const availabilityMap = new Map<string, boolean>(availabilityPairs);

    const categories: StorefrontCategoryPayload[] = categoryRows
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        products: cat.products
          .filter((p) => p.isAvailable && availabilityMap.get(p.id) !== false)
          .map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            shortDescription: p.shortDescription,
            longDescription: p.longDescription,
            basePrice: Number(p.basePrice),
            image: p.image,
            isAvailable: true,
            complements: p.complementGroups.map((link) => ({
              id: link.group.id,
              name: link.group.name,
              description: link.group.description,
              minSelect: link.group.minSelect,
              maxSelect: link.group.maxSelect,
              isRequired: link.group.isRequired,
              items: link.group.items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                additionalPrice: Number(item.additionalPrice),
                isAvailable: item.isActive,
              })),
            })),
          })) as StorefrontProductPayload[],
      }))
      .filter((cat) => cat.products.length > 0);

    const combos: StorefrontComboPayload[] = comboRows
      .filter((combo) => combo.isAvailable && availabilityMap.get(combo.id) !== false)
      .map((combo) => ({
        id: combo.id,
        name: combo.name,
        slug: combo.slug,
        description: combo.shortDescription,
        basePrice: Number(combo.basePrice),
        image: combo.image,
        isAvailable: true,
        comboMode: combo.comboMode ?? 'bundle',
        pricingType: combo.comboPricingType ?? 'fixed_price',
        pricingValue: Number(combo.comboPricingValue ?? 0),
        itemsSubtotal: combo.comboMode === 'bundle'
          ? Number(
              combo.comboBundleItems
                .reduce((sum, item) => sum + (item.product ? Number(item.product.basePrice) * Math.max(1, item.qty) : 0), 0)
                .toFixed(2),
            )
          : undefined,
        discountTotal: combo.comboMode === 'bundle'
          ? Number(
              (
                combo.comboBundleItems.reduce((sum, item) => sum + (item.product ? Number(item.product.basePrice) * Math.max(1, item.qty) : 0), 0) -
                Number(combo.basePrice)
              ).toFixed(2),
            )
          : undefined,
        bundleItems:
          (combo.comboMode ?? 'bundle') === 'bundle'
            ? combo.comboBundleItems
                .filter((item) => item.product && item.product.isActive && item.product.deletedAt === null)
                .map((item) => ({
                  id: item.id,
                  productId: item.productId,
                  productName: item.product!.name,
                  qty: Math.max(1, item.qty),
                  unitPrice: Number(item.product!.basePrice),
                  subtotal: Number((Number(item.product!.basePrice) * Math.max(1, item.qty)).toFixed(2)),
                }))
            : undefined,
        blocks:
          (combo.comboMode ?? 'bundle') === 'slot'
            ? combo.comboSlots.map((b) => ({
                id: b.id,
                name: b.name,
                description: b.description,
                minSelect: b.minSelect,
                maxSelect: b.maxSelect,
                items: b.allowedItems
                  .filter((item) => item.product.isActive && item.product.deletedAt === null)
                  .map((item) => ({
                    id: item.id,
                    productId: item.productId,
                    productName: item.product.name,
                    additionalPrice: Number(item.additionalPrice),
                  })),
              }))
            : undefined,
      }));

    const tenantInfo = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.settings?.logoUrl || null,
      isOpen: categories.length > 0 || combos.length > 0,
    };

    return {
      tenant: tenantInfo,
      categories,
      combos,
    };
  }
}
