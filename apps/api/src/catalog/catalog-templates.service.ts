import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CatalogTemplatesService {
  private readonly logger = new Logger(CatalogTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures that standard OptionGroups for the Pizza template exist for a tenant.
   * If they don't exist, it creates them.
   */
  async ensurePizzaBaseGroups(tenantId: string) {
    // Search for existing groups by name pattern to avoid duplicates
    let sizesGroup = await this.prisma.tenantClient.optionGroup.findFirst({
      where: { tenantId, name: 'Tamanhos [Pizza]' }
    });

    if (!sizesGroup) {
      this.logger.log(`Criando grupo de tamanhos para pizza no tenant ${tenantId}`);
      sizesGroup = await this.prisma.tenantClient.optionGroup.create({
        data: {
          tenantId,
          name: 'Tamanhos [Pizza]',
          selectionType: 'single',
          isRequired: true,
          items: {
            create: [
              { tenantId, name: 'Pequena', order: 1 },
              { tenantId, name: 'Média', order: 2 },
              { tenantId, name: 'Grande', order: 3 },
            ]
          }
        }
      });
    }

    let mountingGroup = await this.prisma.tenantClient.optionGroup.findFirst({
      where: { tenantId, name: 'Montagem [Pizza]' }
    });

    if (!mountingGroup) {
      this.logger.log(`Criando grupo de montagem para pizza no tenant ${tenantId}`);
      mountingGroup = await this.prisma.tenantClient.optionGroup.create({
        data: {
          tenantId,
          name: 'Montagem [Pizza]',
          selectionType: 'single',
          isRequired: true,
          items: {
            create: [
              { tenantId, name: 'Inteira', order: 1 },
              { tenantId, name: 'Meio a Meio', order: 2 },
            ]
          }
        }
      });
    }

    return { sizesGroup, mountingGroup };
  }

  /**
   * Configures a product as a Pizza flavor by linking it to shared groups
   * and initializing per-size pricing.
   */
  async configureProductAsFlavor(tenantId: string, productId: string) {
    const { sizesGroup, mountingGroup } = await this.ensurePizzaBaseGroups(tenantId);

    // 1. Link to "Tamanhos"
    const sizeLink = await this.prisma.tenantClient.productOptionGroupLink.findFirst({
      where: { productId, optionGroupId: sizesGroup.id },
      select: { id: true },
    });
    if (!sizeLink) {
      await this.prisma.tenantClient.productOptionGroupLink.create({
        data: {
          tenantId,
          productId,
          optionGroupId: sizesGroup.id,
          order: 0,
          pricingAxis: 'primary',
        },
      });
    }

    // 2. Link to "Montagem"
    const mountingLink = await this.prisma.tenantClient.productOptionGroupLink.findFirst({
      where: { productId, optionGroupId: mountingGroup.id },
      select: { id: true },
    });
    if (!mountingLink) {
      await this.prisma.tenantClient.productOptionGroupLink.create({
        data: {
          tenantId,
          productId,
          optionGroupId: mountingGroup.id,
          order: 1,
        },
      });
    }

    // 3. Initialize prices for each size
    const sizeItems = await this.prisma.tenantClient.optionItem.findMany({
      where: { optionGroupId: sizesGroup.id }
    });

    const product = await this.prisma.tenantClient.product.findUnique({
      where: { id: productId },
      select: { basePrice: true }
    });

    for (const sizeItem of sizeItems) {
      const existing = await this.prisma.tenantClient.productOptionItemPrice.findFirst({
        where: { productId, optionItemId: sizeItem.id },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      await this.prisma.tenantClient.productOptionItemPrice.create({
        data: {
          tenantId,
          productId,
          optionItemId: sizeItem.id,
          price: product?.basePrice || 0,
        },
      });
    }

    this.logger.log(`Produto ${productId} configurado como sabor de pizza.`);
  }
}
