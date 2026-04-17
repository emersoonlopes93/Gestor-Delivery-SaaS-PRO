import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CatalogMigrationV2Service {
  private readonly logger = new Logger(CatalogMigrationV2Service.name);

  constructor(private readonly prisma: PrismaService) {}

  async runMigration() {
    this.logger.log('Starting Catalog V2 Migration...');
    const warnings: string[] = [];

    await this.migrateComplementsToOptionGroups();
    await this.migrateCombosToProductsV2(warnings);
    await this.migrateComboSlotsToBundle(warnings);

    this.logger.log('Catalog V2 Migration completed!');
    return { warnings };
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

  private async migrateCombosToProductsV2(warnings: string[]) {
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
          comboMode: 'bundle',
          comboPricingType: 'fixed_price',
          comboPricingValue: lc.basePrice,
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

      const productQtyMap = new Map<string, number>();
      for (const block of lc.blocks) {
        const hasAmbiguousSelection = block.minSelect !== 1 || block.maxSelect !== 1 || block.items.length !== 1;
        if (hasAmbiguousSelection) {
          warnings.push(
            `Combo legado "${lc.name}" (${lc.id}) convertido com warning: bloco "${block.name}" tinha seleção ambígua (min=${block.minSelect}, max=${block.maxSelect}, itens=${block.items.length}).`,
          );
        }
        for (const item of block.items) {
          productQtyMap.set(item.productId, (productQtyMap.get(item.productId) ?? 0) + 1);
        }
      }

      const bundleData = Array.from(productQtyMap.entries()).map(([productId, qty], idx) => ({
        tenantId: lc.tenantId,
        comboProductId: newProduct.id,
        productId,
        qty: Math.max(1, qty),
        sortOrder: idx,
      }));
      if (bundleData.length > 0) {
        await this.prisma.comboBundleItem.createMany({ data: bundleData });
      } else {
        warnings.push(`Combo legado "${lc.name}" (${lc.id}) convertido sem itens de bundle.`);
      }

      this.logger.log(`Created Product(Combo) ${newProduct.id} with ${bundleData.length} itens bundle.`);
    }
  }

  private async migrateComboSlotsToBundle(warnings: string[]) {
    this.logger.log('Migrating ComboSlots to ComboBundleItems...');
    const comboProducts = await this.prisma.product.findMany({
      where: { type: 'combo', deletedAt: null },
      include: {
        comboSlots: {
          include: { allowedItems: true },
          orderBy: { order: 'asc' },
        },
        comboBundleItems: true,
      },
    });

    for (const combo of comboProducts) {
      if (combo.comboBundleItems.length > 0) continue;
      if (combo.comboSlots.length === 0) {
        await this.prisma.product.update({
          where: { id: combo.id },
          data: {
            comboMode: 'bundle',
            comboPricingType: combo.comboPricingType ?? 'fixed_price',
            comboPricingValue: combo.comboPricingValue ?? combo.basePrice,
          },
        });
        continue;
      }

      const productQtyMap = new Map<string, number>();
      for (const slot of combo.comboSlots) {
        const isAmbiguous = slot.minSelect !== 1 || slot.maxSelect !== 1 || slot.allowedItems.length !== 1;
        if (isAmbiguous) {
          warnings.push(
            `Combo "${combo.name}" (${combo.id}) migrado com warning: slot "${slot.name}" ambíguo (min=${slot.minSelect}, max=${slot.maxSelect}, permitidos=${slot.allowedItems.length}).`,
          );
        }
        for (const allowed of slot.allowedItems) {
          productQtyMap.set(allowed.productId, (productQtyMap.get(allowed.productId) ?? 0) + 1);
        }
      }

      const bundleData = Array.from(productQtyMap.entries()).map(([productId, qty], idx) => ({
        tenantId: combo.tenantId,
        comboProductId: combo.id,
        productId,
        qty: Math.max(1, qty),
        sortOrder: idx,
      }));
      if (bundleData.length > 0) {
        await this.prisma.comboBundleItem.createMany({ data: bundleData });
      } else {
        warnings.push(`Combo "${combo.name}" (${combo.id}) não gerou itens bundle na migração.`);
      }

      await this.prisma.product.update({
        where: { id: combo.id },
        data: {
          comboMode: 'bundle',
          comboPricingType: 'fixed_price',
          comboPricingValue: combo.basePrice,
        },
      });
    }
  }
}
