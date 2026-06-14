import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { DateTime } from 'luxon';
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
import { MediaLibraryService } from '../upload/media-library.service';

import { SchedulingService } from '../scheduling/scheduling.service';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly upsellsService: UpsellsService,
    private readonly mediaLibrary: MediaLibraryService,
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
            mediaAsset: true,
          },
        },
      },
    });

    type CategoryWithProducts = Prisma.ProductCategoryGetPayload<{
      include: {
        products: {
          include: {

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
            mediaAsset: true;
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
        mediaAsset: true,
      },
    });

    type ComboWithData = Prisma.ProductGetPayload<{
      include: {
        comboBundleItems: { include: { product: true } };
        comboSlots: { include: { allowedItems: { include: { product: true } } } };
        mediaAsset: true;
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
        templateConfig: cat.templateConfig,
        products: cat.products
          .map((p) => {
            const canSell = availabilityMap.get(p.id) ?? true;
            const isAvailable = Boolean(p.isAvailable) && canSell;
            const image = this.mediaLibrary.resolveFinalImage(p);
            return {
              id: p.id,
              name: p.name,
              slug: p.slug,
              type: p.type as 'simple' | 'combo',
              shortDescription: p.shortDescription,
              description: p.longDescription,
              longDescription: p.longDescription,
              basePrice: Number(p.basePrice),
              compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
              image: image.imageUrl,
              imageUrl: image.imageUrl,
              imageAltText: image.imageAltText,
              imageSource: image.imageSource,
              isAvailable,
              badges: [], // Populated below

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
          .map((p) => {
            const badges: any[] = [];
            
            // Promo badge
            if (p.compareAtPrice && p.compareAtPrice > p.basePrice) {
              badges.push({ id: 'promotion', label: 'Promoção', variant: 'success', priority: 1 });
            }
            // New badge (created in last 30 days)
            const origProd = cat.products.find(op => op.id === p.id);
            if (origProd && origProd.createdAt) {
              const isNew = (new Date().getTime() - new Date(origProd.createdAt).getTime()) < 30 * 24 * 60 * 60 * 1000;
              if (isNew) {
                badges.push({ id: 'new', label: 'Novidade', variant: 'info', priority: 2 });
              }
            }
            // Featured
            if (origProd?.isFeatured) {
              badges.push({ id: 'featured', label: 'Destaque', variant: 'warning', priority: 3 });
            }
            // Combo
            if (p.type === 'combo') {
              badges.push({ id: 'combo', label: 'Combo', variant: 'neutral', priority: 4 });
            }
            // Cashback
            if (tenant.settings?.cashbackEnabled && (tenant.settings?.cashbackPercent ?? 0) > 0) {
              badges.push({ id: 'cashback', label: 'Cashback', variant: 'success', priority: 5 });
            }
            // Unavailable
            if (!p.isAvailable) {
              badges.push({ id: 'unavailable', label: 'Indisponível', variant: 'danger', priority: 0 });
            }

            badges.sort((a, b) => a.priority - b.priority);
            p.badges = badges;

            return p;
          })
          .filter((p) => p.isAvailable) as StorefrontProductPayload[],
      }))
      .filter((cat) => cat.products.length > 0);

    const combos: StorefrontComboPayload[] = comboRows
      .map((combo) => {
        const canSell = availabilityMap.get(combo.id) ?? true;
        const isAvailable = Boolean(combo.isAvailable) && canSell;
        const image = this.mediaLibrary.resolveFinalImage(combo);

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
          image: image.imageUrl,
          imageUrl: image.imageUrl,
          imageAltText: image.imageAltText,
          imageSource: image.imageSource,
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
      .map((c) => {
        const badges: any[] = [];
        badges.push({ id: 'combo', label: 'Combo', variant: 'neutral', priority: 4 });
        if (tenant.settings?.cashbackEnabled && (tenant.settings?.cashbackPercent ?? 0) > 0) {
          badges.push({ id: 'cashback', label: 'Cashback', variant: 'success', priority: 5 });
        }
        if (!c.isAvailable) {
          badges.push({ id: 'unavailable', label: 'Indisponível', variant: 'danger', priority: 0 });
        }
        badges.sort((a, b) => a.priority - b.priority);
        return { ...c, badges };
      })
      .filter((c) => c.isAvailable);

    const storeStatus = await this.availabilityService.getStoreStatus(tenant.id);

    const waInstance = await this.prisma.whatsAppInstance.findFirst({
      where: { tenantId: tenant.id, status: 'connected' },
      select: { phoneNumber: true },
    });

    const tenantInfo = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.settings?.logoUrl || null,
      isOpen: storeStatus.isOpen,
      statusMessage: storeStatus.message,
      nextOpenAt: storeStatus.nextOpenAt,
      paymentMethods: (tenant.settings?.paymentMethods as string[]) || [],
      whatsappNumber: waInstance?.phoneNumber || tenant.settings?.businessPhone || null,
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
      minimumOrderValue: tenant.settings?.minimumOrderValue ? Number(tenant.settings.minimumOrderValue) : null,
      cashback: tenant.settings?.cashbackEnabled ? {
        enabled: tenant.settings.cashbackEnabled,
        percent: Number(tenant.settings.cashbackPercent || 0),
      } : undefined,
      scheduling: {
        enabled: true // Tenant supports scheduling by default if scheduling module is used
      }
    };

    // Build virtual sections
    const virtualSections: StorefrontCategoryPayload[] = [];
    const allProducts = categories.flatMap(c => c.products);

    // 1. Featured (Destaques da Loja)
    const featuredProducts = allProducts.filter(p => p.badges.some(b => b.id === 'featured'));
    if (featuredProducts.length > 0) {
      virtualSections.push({
        id: 'virtual-featured',
        name: 'Destaques da Loja',
        slug: 'destaques',
        order: -3,
        type: 'featured',
        isVirtual: true,
        products: featuredProducts
      });
    }

    // 2. Promotions
    const promoProducts = allProducts.filter(p => p.badges.some(b => b.id === 'promotion'));
    if (promoProducts.length > 0) {
      virtualSections.push({
        id: 'virtual-promotions',
        name: 'Promoções do Dia',
        slug: 'promocoes',
        order: -2,
        type: 'promotions',
        isVirtual: true,
        products: promoProducts
      });
    }

    // 3. New
    const newProducts = allProducts.filter(p => p.badges.some(b => b.id === 'new'));
    if (newProducts.length > 0) {
      virtualSections.push({
        id: 'virtual-new',
        name: 'Novidades',
        slug: 'novidades',
        order: -1,
        type: 'new',
        isVirtual: true,
        products: newProducts
      });
    }

    // Adjust categories type
    categories.forEach(c => {
      c.type = 'category';
      c.isVirtual = false;
    });

    const finalCategories = [...virtualSections, ...categories];

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
      categories: finalCategories,
      combos,
      upsells: globalUpsells,
      customization,
    };

    // Cache for configurable TTL (default 60 seconds)
    const cacheTtl = Number(process.env.STOREFRONT_CACHE_TTL || 60000);
    await this.cacheManager.set(cacheKey, payload, cacheTtl);

    return payload;
  }

  async getAvailableSlots(slug: string, date?: Date | string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, settings: { select: { timezone: true } } },
    });
    if (!tenant) throw new NotFoundException('Store not found');

    const timezone = tenant.settings?.timezone || 'America/Sao_Paulo';
    let targetDate: Date;

    if (typeof date === 'string') {
      const parsed = DateTime.fromISO(date, { zone: timezone });
      if (!parsed.isValid) {
        throw new NotFoundException('Invalid date format');
      }
      targetDate = parsed.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toJSDate();
    } else if (date instanceof Date && !isNaN(date.getTime())) {
      targetDate = date;
    } else {
      targetDate = DateTime.now()
        .setZone(timezone)
        .set({ hour: 12, minute: 0, second: 0, millisecond: 0 })
        .toJSDate();
    }

    return this.schedulingService.getAvailableTimeSlots(targetDate, tenant.id);
  }

  async getStorefrontManifest(slug: string): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: 'active' },
      select: { name: true, settings: { select: { logoUrl: true } } },
    });

    if (!tenant) {
      throw new NotFoundException('Loja inativa ou não encontrada.');
    }

    const tenantName = tenant.name;
    const shortName = tenantName.substring(0, 12);
    const rawLogoUrl = tenant.settings?.logoUrl ?? null;

    // Base URL do frontend para garantir que ícones relativos se tornem absolutos.
    // O manifest é servido pela API mas o scope é o frontend; ícones relativos
    // são resolvidos em relação ao scope, portanto precisam ser absolutos quando
    // apontam para recursos da API (uploads).
    const frontendBase = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');

    // Normaliza a URL da logo para absoluta
    let absoluteLogoUrl: string | null = null;
    if (rawLogoUrl) {
      absoluteLogoUrl = rawLogoUrl.startsWith('http')
        ? rawLogoUrl
        : `${frontendBase}${rawLogoUrl}`;
    }

    // Ícones: se a loja tem logo, usa ela como ícone principal.
    // Sempre inclui os ícones SVG genéricos como fallback.
    const icons: Record<string, unknown>[] = [];

    if (absoluteLogoUrl) {
      const ext = absoluteLogoUrl.split('.').pop()?.split('?')[0]?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };
      const mimeType = mimeMap[ext] ?? 'image/png';
      icons.push(
        { src: absoluteLogoUrl, sizes: '192x192', type: mimeType, purpose: 'any' },
        { src: absoluteLogoUrl, sizes: '512x512', type: mimeType, purpose: 'maskable' },
      );
    }

    // Fallback SVG genérico sempre presente (ícones públicos do frontend)
    const svgBase = frontendBase || '';
    icons.push(
      { src: `${svgBase}/icons/app-icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: `${svgBase}/icons/app-maskable.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    );

    return {
      id: `/${slug}`,
      name: tenantName,
      short_name: shortName,
      description: 'Cardapio, pedidos, carteira, fidelidade e tracking em tempo real.',
      start_url: `/${slug}`,
      scope: `/${slug}`,
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#111827',
      categories: ['food', 'shopping', 'business'],
      lang: 'pt-BR',
      icons,
      shortcuts: [
        {
          name: 'Meus pedidos',
          short_name: 'Pedidos',
          description: 'Abrir historico de pedidos do cliente.',
          url: `/${slug}/orders`,
          icons: [{ src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml' }],
        },
      ],
    };
  }
}
