import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CatalogMigrationV2Service {
  private readonly logger = new Logger(CatalogMigrationV2Service.name);

  constructor(private readonly prisma: PrismaService) {}

  async runMigration() {
    this.logger.log('Starting Catalog V2 Migration...');

    await this.migrateComplementsToOptionGroups();
    await this.migrateCombosToProductsV2();

    this.logger.log('Catalog V2 Migration completed!');
  }

  private async migrateComplementsToOptionGroups() {
    this.logger.log('Migrating Complements to OptionGroups...');
    
    // @ts-ignore - Accessing legacy models that might be removed soon
    const legacyGroups = await this.prisma.productComplementGroup.findMany({
      include: { items: true },
    });

    for (const lg of legacyGroups) {
      const existing = await this.prisma.optionGroup.findFirst({
        where: {
          tenantId: lg.tenantId,
          name: lg.name,
        },
      });

      if (existing) {
        this.logger.log(`OptionGroup "${lg.name}" already exists for tenant ${lg.tenantId}. Skipping.`);
        continue;
      }

      this.logger.log(`Migrating Complement Group: ${lg.name}`);
      
      const newGroup = await this.prisma.optionGroup.create({
        data: {
          tenantId: lg.tenantId,
          name: lg.name,
          description: lg.description,
          isRequired: lg.isRequired,
          minSelect: lg.minSelect,
          maxSelect: lg.maxSelect,
          isActive: lg.isActive,
          order: lg.order,
          selectionType: lg.maxSelect > 1 ? 'multiple' : 'single',
          items: {
            create: lg.items.map((item: any) => ({
              tenantId: item.tenantId,
              name: item.name,
              description: item.description,
              sku: item.sku,
              isActive: item.isActive,
              order: item.order,
              priceImpactType: 'fixed',
              priceImpactValue: item.additionalPrice,
              allowQuantity: false,
            })),
          },
        },
      });

      this.logger.log(`Created OptionGroup ${newGroup.id} with ${lg.items.length} items.`);
    }
  }

  private async migrateCombosToProductsV2() {
    this.logger.log('Migrating Combos to Products V2...');

    // @ts-ignore
    const legacyCombos = await this.prisma.productCombo.findMany({
      include: {
        blocks: {
          include: { items: true },
        },
      },
    });

    for (const lc of legacyCombos) {
      const existingProduct = await this.prisma.product.findFirst({
        where: {
          tenantId: lc.tenantId,
          name: lc.name,
          type: 'combo',
        },
      });

      if (existingProduct) {
        this.logger.log(`Combo/Product "${lc.name}" already exists for tenant ${lc.tenantId}. Skipping.`);
        continue;
      }

      this.logger.log(`Migrating Combo: ${lc.name}`);

      const newProduct = await this.prisma.product.create({
        data: {
          tenantId: lc.tenantId,
          name: lc.name,
          slug: lc.slug,
          shortDescription: lc.description,
          basePrice: lc.basePrice,
          image: lc.image,
          isActive: lc.isActive,
          isFeatured: lc.isFeatured,
          order: lc.order,
          type: 'combo',
          isAvailable: true,
          sellableOnline: true,
        },
      });

      await this.prisma.catalogPublication.create({
        data: {
          tenantId: lc.tenantId,
          productId: newProduct.id,
          publicationStatus: lc.isActive ? 'published' : 'draft',
          operationalStatus: 'active',
        },
      });

      for (const block of lc.blocks) {
        const slot = await this.prisma.comboSlot.create({
          data: {
            tenantId: block.tenantId,
            comboProductId: newProduct.id,
            name: block.name,
            description: block.description,
            isRequired: block.minSelect > 0,
            minSelect: block.minSelect,
            maxSelect: block.maxSelect,
            order: block.order,
          },
        });

        if (block.items.length > 0) {
          await this.prisma.comboSlotAllowedItem.createMany({
            data: block.items.map((item: any) => ({
              tenantId: item.tenantId,
              comboSlotId: slot.id,
              productId: item.productId,
              additionalPrice: item.additionalPrice,
              order: item.order,
            })),
          });
        }
      }

      this.logger.log(`Created Product(Combo) ${newProduct.id} with ${lc.blocks.length} slots.`);
    }
  }
}
