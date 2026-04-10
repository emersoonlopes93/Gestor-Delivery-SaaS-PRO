import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorefrontPayload, StorefrontCategoryPayload, StorefrontComboPayload, StorefrontProductPayload } from '@gestor/types';
import { TenantStatus } from '@prisma/client';

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async getStorefrontPayload(slug: string): Promise<StorefrontPayload> {
    // 1. Resolve Tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug, status: "active" as any }, // only active tenants
      include: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Loja inativa ou não encontrada.');
    }

    // Tenant info
    const tenantInfo = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.settings?.logoUrl || null,
      isOpen: true, // Simplified layer 1 validation
    };

    // 2. Fetch Active Categories with their Active Products
    const prismaClient = this.prisma as any;
    
    const categoriesDb = await prismaClient.productCategory.findMany({
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

    const categories: StorefrontCategoryPayload[] = categoriesDb.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      products: cat.products.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        shortDescription: p.shortDescription,
        longDescription: p.longDescription,
        basePrice: typeof p.basePrice === 'number' ? p.basePrice : Number(p.basePrice),
        image: p.image,
        isAvailable: p.isAvailable, // Layer 3 logic
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
            additionalPrice: typeof item.additionalPrice === 'number' ? item.additionalPrice : Number(item.additionalPrice),
            isAvailable: item.isActive, // Simplified
          })),
        })),
      })) as StorefrontProductPayload[],
    }));

    // 3. Fetch Active Combos
    const combosDb = await prismaClient.productCombo.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    const combos: StorefrontComboPayload[] = combosDb.map((combo: any) => ({
      id: combo.id,
      name: combo.name,
      slug: combo.slug,
      description: combo.description,
      basePrice: typeof combo.basePrice === 'number' ? combo.basePrice : Number(combo.basePrice),
      image: combo.image,
      isAvailable: true, // Always available basically, unless logic dictates otherwise
      blocks: combo.blocks.map((b: any) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        minSelect: b.minSelect,
        maxSelect: b.maxSelect,
        items: b.items.filter((item: any) => item.product.isActive && item.product.deletedAt === null).map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          additionalPrice: typeof item.additionalPrice === 'number' ? item.additionalPrice : Number(item.additionalPrice),
        })),
      })),
    }));

    return {
      tenant: tenantInfo,
      categories,
      combos,
    };
  }
}
