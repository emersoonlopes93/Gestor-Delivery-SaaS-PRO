import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../database/prisma.service';
import { 
  StorefrontPayload, 
  StorefrontCategoryPayload, 
  StorefrontComboPayload, 
  StorefrontProductPayload,
  StorefrontCustomizationPayload
} from '@gestor/types';
import { 
  normalizeStorefrontTheme,
  normalizeStorefrontLayout
} from '@gestor/theme';
import { Prisma } from '@prisma/client';
import { AvailabilityService, SalesChannel } from '../catalog/publication/availability.service';
import { UpsellsService } from '../catalog/upsells.service';

import { SchedulingService } from '../scheduling/scheduling.service';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly upsellsService: UpsellsService,
    private readonly schedulingService: SchedulingService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getStorefrontPayload(
    slug: string,
    fulfillmentType: 'delivery' | 'pickup' = 'delivery',
  ): Promise<StorefrontPayload> {
    const channel: SalesChannel =
      fulfillmentType === 'pickup' ? 'storefront_pickup' : 'storefront_delivery';

    const cacheKey = `storefront:${slug}:${fulfillmentType}`;
    const cachedPayload = await this.cacheManager.get<StorefrontPayload>(cacheKey);
    if (cachedPayload) {
      return cachedPayload;
    }

    // 1. Resolve Tenant
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: 'active' }, // only active tenants
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
            optionGroupLinks: {
              include: {
                optionGroup: {
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
            comboBundleItems: {
              include: { product: true },
            },
            comboSlots: {
              include: {
                allowedItems: {
                  include: { product: true },
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
            optionGroupLinks: {
              include: { optionGroup: { include: { items: true } } };
            };
            upsellLinks: {
              include: {
                upsell: {
                  include: { items: { include: { product: true } } };
                };
              };
            };
            comboBundleItems: { include: { product: true } };
            comboSlots: { include: { allowedItems: { include: { product: true } } } };
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

    const productIdsArray = Array.from(idsToCheck);
    const availabilityMapResults = await this.availabilityService.decideMany({
      tenantId: tenant.id,
      productIds: productIdsArray,
      channel,
      ignoreStoreClosed: true,
    });

    const availabilityMap = new Map<string, boolean>();
    for (const [id, decision] of availabilityMapResults.entries()) {
      availabilityMap.set(id, decision.canSell);
    }

    const categories: StorefrontCategoryPayload[] = categoryRows
      .map((cat: CategoryWithProducts) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        order: cat.order ?? 0,
        templateType: cat.templateType,
        products: cat.products
          .map((p) => {
            const canSell = availabilityMap.get(p.id) ?? true;
            const isAvailable = Boolean(p.isAvailable) && canSell;
            return {
              id: p.id,
              name: p.name,
              slug: p.slug,
              type: p.type as 'simple' | 'combo',
              shortDescription: p.shortDescription,
              description: p.longDescription,
              longDescription: p.longDescription,
              basePrice: Number(p.basePrice),
              image: p.image,
              isAvailable,
              complementGroups: (p.complementGroups || []).map((cg) => ({
                id: cg.id,
                complementGroupId: cg.complementGroupId,
                order: cg.order,
                group: {
                  id: cg.group.id,
                  name: cg.group.name,
                  description: cg.group.description,
                  minSelect: cg.group.minSelect,
                  maxSelect: cg.group.maxSelect,
                  isRequired: cg.group.isRequired,
                  items: cg.group.items.map((ci) => ({
                    id: ci.id,
                    name: ci.name,
                    description: ci.description,
                    price: Number(ci.additionalPrice),
                    isActive: ci.isActive,
                    isAvailable: ci.isActive,
                  })),
                },
              })),
              optionGroupLinks: (p.optionGroupLinks || []).map((ol) => ({
                id: ol.id,
                optionGroupId: ol.optionGroupId,
                order: ol.order,
                pricingAxis: ol.pricingAxis,
                overrideName: ol.overrideName,
                overrideDescription: ol.overrideDescription,
                overrideIsRequired: ol.overrideIsRequired,
                overrideMinSelect: ol.overrideMinSelect,
                overrideMaxSelect: ol.overrideMaxSelect,
                optionGroup: {
                  id: ol.optionGroup.id,
                  name: ol.optionGroup.name,
                  description: ol.optionGroup.description,
                  selectionType: ol.optionGroup.selectionType as 'single' | 'multiple' | 'quantity',
                  isRequired: ol.optionGroup.isRequired,
                  minSelect: ol.optionGroup.minSelect,
                  maxSelect: ol.optionGroup.maxSelect,
                  isActive: ol.optionGroup.isActive,
                  items: ol.optionGroup.items.map((oi) => ({
                    id: oi.id,
                    name: oi.name,
                    description: oi.description,
                    isActive: oi.isActive,
                    allowQuantity: oi.allowQuantity,
                    priceImpactType: oi.priceImpactType as 'none' | 'fixed' | 'replace' | 'percentage',
                    priceImpactValue: Number(oi.priceImpactValue),
                  })),
                },
              })),
              upsellLinks: (p.upsellLinks || []).map((l) => ({
                id: l.id,
                upsell: {
                  id: l.upsell.id,
                  name: l.upsell.name,
                  description: l.upsell.description,
                  displayType: l.upsell.displayType as 'inline' | 'cart' | 'both',
                  items: l.upsell.items
                    .filter((i) => i.product.isActive && i.product.deletedAt === null)
                    .map((i) => {
                      const originalPrice = Number(i.product.basePrice);
                      const finalPrice = this.upsellsService.calculateUpsellPrice(
                        originalPrice,
                        l.upsell.pricingType,
                        Number(l.upsell.pricingValue),
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
                },
              })),
            };
          })
          .filter((p) => p.isAvailable) as StorefrontProductPayload[],
      }))
      .filter((cat) => cat.products.length > 0);

    const combos: StorefrontComboPayload[] = comboRows
      .map((combo) => {
        const canSell = availabilityMap.get(combo.id) ?? true;
        const isAvailable = Boolean(combo.isAvailable) && canSell;

        const basePrice = Number(combo.basePrice);
        const pricingValue = Number(combo.comboPricingValue || 0);

        let itemsSubtotal = 0;
        if (combo.comboMode === 'bundle') {
          itemsSubtotal = combo.comboBundleItems
            .reduce((sum, item) => sum + (item.product ? Number(item.product.basePrice) * Math.max(1, item.qty) : 0), 0);
        }

        let discountTotal = 0;
        if (combo.comboMode === 'bundle' && combo.comboPricingType) {
          if (combo.comboPricingType === 'fixed_price') {
            discountTotal = Math.max(0, itemsSubtotal - pricingValue);
          } else if (combo.comboPricingType === 'discount_percent') {
            discountTotal = itemsSubtotal * (pricingValue / 100);
          } else if (combo.comboPricingType === 'discount_amount') {
            discountTotal = pricingValue;
          }
        }

        return {
          id: combo.id,
          name: combo.name,
          slug: combo.slug,
          description: combo.shortDescription,
          basePrice,
          image: combo.image,
          isAvailable,
          comboMode: (combo.comboMode === 'bundle' ? 'bundle' : 'slot') as 'bundle' | 'slot',
          pricingType: combo.comboPricingType as 'fixed_price' | 'discount_percent' | 'discount_amount' | null,
          pricingValue,
          itemsSubtotal,
          discountTotal,
          bundleItems: combo.comboMode === 'bundle'
            ? combo.comboBundleItems
              .filter((item) => item.product && item.product.isActive && item.product.deletedAt === null)
              .map((item) => ({
                id: item.id,
                productId: item.productId,
                productName: item.product.name,
                qty: item.qty,
                unitPrice: Number(item.product.basePrice),
                subtotal: Number(item.product.basePrice) * item.qty,
              }))
            : [],
          blocks: combo.comboMode === 'slot'
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
            : [],
        };
      })
      .filter((c) => c.isAvailable);

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

    // 4. Global Upsells
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

    const globalUpsells = globalUpsellRows.map((u) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      displayType: u.displayType as 'inline' | 'cart' | 'both',
      items: u.items
        .filter((i) => i.product.isActive && i.product.deletedAt === null)
        .map((i) => {
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

    // 5. Storefront Customization (Fully Normalized & Hardened for Public consumption)
    const customization: StorefrontCustomizationPayload = {
      theme: normalizeStorefrontTheme(tenant.settings?.storefrontThemeJson),
      layout: normalizeStorefrontLayout(tenant.settings?.storefrontLayoutJson),
    };

    const payload: StorefrontPayload = {
      tenant: tenantInfo,
      categories,
      combos,
      upsells: globalUpsells,
      customization,
    };

    // Cache for configurable TTL (default 60 seconds)
    const cacheTtl = Number(process.env.STOREFRONT_CACHE_TTL || 60000);
    await this.cacheManager.set(cacheKey, payload, cacheTtl);

    return payload;
  }

  async getAvailableSlots(slug: string, date: Date) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Store not found');

    return this.schedulingService.getAvailableTimeSlots(date, tenant.id);
  }
}
