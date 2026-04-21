import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorefrontPayload, StorefrontCategoryPayload, StorefrontComboPayload, StorefrontProductPayload } from '@gestor/types';
import { TenantStatus } from '@gestor/core';
import { Prisma } from '@prisma/client';
import { AvailabilityService, SalesChannel } from '../orders/availability.service';
import { UpsellsService } from '../catalog/upsells.service';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly upsellsService: UpsellsService,
  ) {}

  async getStorefrontPayload(
    slug: string,
    fulfillmentType: 'delivery' | 'pickup' = 'delivery',
  ): Promise<StorefrontPayload> {
    const channel: SalesChannel =
      fulfillmentType === 'pickup' ? 'storefront_pickup' : 'storefront_delivery';

    // 1. Resolve Tenant
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: TenantStatus.ACTIVE as any }, // only active tenants
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
            upsellLinks: {
              include: {
                upsell: {
                  include: { items: { include: { product: true }, orderBy: { sortOrder: 'asc' } } },
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
            upsellLinks: {
              include: {
                upsell: {
                  include: { items: { include: { product: true } } };
                };
              };
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
      .map((cat: CategoryWithProducts) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        products: cat.products
          .map((p: any) => {
            const canSell = availabilityMap.get(p.id) ?? true;
            const isAvailable = Boolean(p.isAvailable) && canSell;
            return {
              id: p.id,
              name: p.name,
              slug: p.slug,
              shortDescription: p.shortDescription,
              longDescription: p.longDescription,
              basePrice: Number(p.basePrice),
              image: p.image,
              isAvailable,
              complements: p.complementGroups.map((link: any) => ({
                id: link.group.id,
                name: link.group.name,
                description: link.group.description,
                minSelect: link.group.minSelect,
                maxSelect: link.group.maxSelect,
                isRequired: link.group.isRequired,
                items: link.group.items.map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  additionalPrice: Number(item.additionalPrice),
                  isAvailable: item.isActive,
                })),
              })),
              upsells: p.upsellLinks
                .filter((link: any) => link.upsell.displayType !== 'cart')
                .map((link: any) => ({
                  id: link.upsell.id,
                  name: link.upsell.name,
                  description: link.upsell.description,
                  displayType: link.upsell.displayType as any,
                  items: link.upsell.items
                    .filter((i: any) => i.product.isActive && i.product.deletedAt === null)
                    .map((i: any) => {
                      const originalPrice = Number(i.product.basePrice);
                      const finalPrice = this.upsellsService.calculateUpsellPrice(
                        originalPrice,
                        link.upsell.pricingType,
                        Number(link.upsell.pricingValue),
                      );
                      return {
                        productId: i.productId,
                        name: i.product.name,
                        image: i.product.image,
                        originalPrice,
                        finalPrice,
                        discountApplied: originalPrice - finalPrice,
                      };
                    }),
                })),
            };
          })
          .filter((p: any) => p.isAvailable) as StorefrontProductPayload[],
      }))
      .filter((cat: any) => cat.products.length > 0);

    const combos: StorefrontComboPayload[] = comboRows
      .map((combo) => {
        const canSell = availabilityMap.get(combo.id) ?? true;
        const isAvailable = Boolean(combo.isAvailable) && canSell;
        return {
          id: combo.id,
          name: combo.name,
          slug: combo.slug,
          description: combo.shortDescription,
          basePrice: Number(combo.basePrice),
          image: combo.image,
          isAvailable,
          comboMode: combo.comboMode ?? 'bundle',
          pricingType: combo.comboPricingType ?? 'fixed_price',
          pricingValue: Number(combo.comboPricingValue ?? 0),
          itemsSubtotal: combo.comboMode === 'bundle'
            ? Number(
                combo.comboBundleItems
                  .reduce((sum: number, item: any) => sum + (item.product ? Number(item.product.basePrice) * Math.max(1, item.qty) : 0), 0)
                  .toFixed(2),
              )
            : undefined,
          discountTotal: combo.comboMode === 'bundle'
            ? Number(
                (
                  combo.comboBundleItems.reduce((sum: number, item: any) => sum + (item.product ? Number(item.product.basePrice) * Math.max(1, item.qty) : 0), 0) -
                  Number(combo.basePrice)
                ).toFixed(2),
              )
            : undefined,
          bundleItems:
            (combo.comboMode ?? 'bundle') === 'bundle'
              ? combo.comboBundleItems
                  .filter((item: any) => item.product && item.product.isActive && item.product.deletedAt === null)
                  .map((item: any) => ({
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
              ? combo.comboSlots.map((b: any) => ({
                  id: b.id,
                  name: b.name,
                  description: b.description,
                  minSelect: b.minSelect,
                  maxSelect: b.maxSelect,
                  items: b.allowedItems
                    .filter((item: any) => item.product.isActive && item.product.deletedAt === null)
                    .map((item: any) => ({
                      id: item.id,
                      productId: item.productId,
                      productName: item.product.name,
                      additionalPrice: Number(item.additionalPrice),
                    })),
                }))
              : undefined,
        };
      })
      .filter((combo) => combo.isAvailable);

    const storeStatus = await this.availabilityService.getStoreStatus(tenant.id);

    const tenantInfo = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.settings?.logoUrl || null,
      isOpen: storeStatus.isOpen,
      statusMessage: storeStatus.message,
      nextOpenAt: storeStatus.nextOpenAt,
      paymentMethods: (tenant.settings?.paymentMethods as string[]) || [],
      address: tenant.settings ? {
        street: tenant.settings.street || '',
        number: tenant.settings.number || '',
        neighborhood: tenant.settings.neighborhood || '',
        city: tenant.settings.city || '',
        state: tenant.settings.state || '',
        zipCode: tenant.settings.zipCode || '',
        lat: tenant.settings.lat || undefined,
        lng: tenant.settings.lng || undefined,
      } : undefined,
    };

    const globalUpsellRows = await this.prisma.upsell.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        displayType: { in: ['cart', 'both'] },
      },
      include: {
        items: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const globalUpsells = globalUpsellRows.map((u: any) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      displayType: u.displayType as any,
      items: u.items
        .filter((i: any) => i.product.isActive && i.product.deletedAt === null)
        .map((i: any) => {
          const originalPrice = Number(i.product.basePrice);
          const finalPrice = this.upsellsService.calculateUpsellPrice(
            originalPrice,
            u.pricingType,
            Number(u.pricingValue),
          );
          return {
            productId: i.productId,
            name: i.product.name,
            image: i.product.image,
            originalPrice,
            finalPrice,
            discountApplied: originalPrice - finalPrice,
          };
        }),
    }));

    return {
      tenant: tenantInfo,
      categories,
      combos,
      upsells: globalUpsells,
    };
  }
}
