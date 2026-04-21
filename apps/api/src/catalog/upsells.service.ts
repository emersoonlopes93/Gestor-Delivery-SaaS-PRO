import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  Upsell,
  CreateUpsellDto,
  UpdateUpsellDto,
  UpsellWithItems,
} from '@gestor/types';

@Injectable()
export class UpsellsService {
  constructor(private readonly prisma: PrismaService) {}

  async listUpsells(tenantId: string): Promise<Upsell[]> {
    return this.prisma.upsell.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { items: true, productLinks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Upsell[];
  }

  async getUpsellDetail(tenantId: string, id: string): Promise<UpsellWithItems> {
    const upsell = await this.prisma.upsell.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!upsell) {
      throw new NotFoundException('Upsell não encontrado.');
    }

    return upsell as unknown as UpsellWithItems;
  }

  async createUpsell(tenantId: string, dto: CreateUpsellDto): Promise<Upsell> {
    return this.prisma.upsell.create({
      data: {
        ...dto,
        tenantId,
        pricingValue: dto.pricingValue ?? 0,
      },
    }) as unknown as Upsell;
  }

  async updateUpsell(tenantId: string, id: string, dto: UpdateUpsellDto): Promise<Upsell> {
    const upsell = await this.prisma.upsell.findFirst({ where: { id, tenantId } });
    if (!upsell) throw new NotFoundException('Upsell não encontrado.');

    return this.prisma.upsell.update({
      where: { id },
      data: {
        ...dto,
      },
    }) as unknown as Upsell;
  }

  async deleteUpsell(tenantId: string, id: string): Promise<void> {
    const upsell = await this.prisma.upsell.findFirst({ where: { id, tenantId } });
    if (!upsell) throw new NotFoundException('Upsell não encontrado.');

    await this.prisma.upsell.delete({ where: { id } });
  }

  async setUpsellItems(tenantId: string, upsellId: string, productIds: string[]): Promise<void> {
    const upsell = await this.prisma.upsell.findFirst({ where: { id: upsellId, tenantId } });
    if (!upsell) throw new NotFoundException('Upsell não encontrado.');

    // Validate products exist in this tenant
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Um ou mais produtos não encontrados ou inválidos.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.upsellItem.deleteMany({ where: { upsellId } });
      await tx.upsellItem.createMany({
        data: productIds.map((productId, index) => ({
          tenantId,
          upsellId,
          productId,
          sortOrder: index,
        })),
      });
    });
  }

  async linkToProduct(tenantId: string, upsellId: string, productId: string): Promise<void> {
    const [upsell, product] = await Promise.all([
      this.prisma.upsell.findFirst({ where: { id: upsellId, tenantId } }),
      this.prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } }),
    ]);

    if (!upsell || !product) {
      throw new NotFoundException('Upsell ou Produto não encontrado.');
    }

    await this.prisma.productUpsell.upsert({
      where: {
        productId_upsellId: { productId, upsellId },
      },
      create: {
        tenantId,
        productId,
        upsellId,
      },
      update: {},
    });
  }

  async unlinkFromProduct(tenantId: string, upsellId: string, productId: string): Promise<void> {
    await this.prisma.productUpsell.deleteMany({
      where: { productId, upsellId, tenantId },
    });
  }

  calculateUpsellPrice(basePrice: number, pricingType: string, pricingValue: number): number {
    let finalPrice = basePrice;

    switch (pricingType) {
      case 'discount_percent':
        finalPrice = basePrice * (1 - pricingValue / 100);
        break;
      case 'discount_amount':
        finalPrice = basePrice - pricingValue;
        break;
      case 'fixed_price':
        finalPrice = pricingValue;
        break;
      case 'normal':
      default:
        finalPrice = basePrice;
        break;
    }

    return Math.max(0, finalPrice);
  }
}
