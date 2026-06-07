import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { ComplementsController } from './complements/complements.controller';
import { ComplementsService } from './complements/complements.service';
import { CombosController } from './combos/combos.controller';
import { CombosService } from './combos/combos.service';
import { OptionGroupsController } from './option-groups/option-groups.controller';
import { OptionGroupsService } from './option-groups/option-groups.service';
import { ProductOptionGroupsController } from './product-option-groups/product-option-groups.controller';
import { ProductOptionGroupsService } from './product-option-groups/product-option-groups.service';
import { ComboSlotsController } from './combo-slots/combo-slots.controller';
import { ComboSlotsService } from './combo-slots/combo-slots.service';
import { ComboBundleItemsController } from './combo-bundle-items/combo-bundle-items.controller';
import { ComboBundleItemsService } from './combo-bundle-items/combo-bundle-items.service';
import { PublicationController } from './publication/publication.controller';
import { PublicationService } from './publication/publication.service';
import { CatalogMigrationV2Service } from './migration-v2.service';
import { PizzaEngineService } from './pizza-engine.service';
import { CatalogTemplatesService } from './catalog-templates.service';
import { FractionalPricingEngine } from './fractional-pricing.engine';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { PizzaController } from './pizza.controller';
import { UpsellsController } from './upsells.controller';
import { UpsellsService } from './upsells.service';
import { AvailabilityService } from './publication/availability.service';
import { UploadModule } from '../upload/upload.module';
import { MenuImportService } from './menu-import/menu-import.service';
import { MenuImportController } from './menu-import/menu-import.controller';

@Module({
  imports: [DatabaseModule, RbacModule, UploadModule],
  controllers: [
    CategoriesController,
    ProductsController,
    ComplementsController,
    CombosController,
    OptionGroupsController,
    ProductOptionGroupsController,
    ComboSlotsController,
    ComboBundleItemsController,
    PublicationController,
    PizzaController,
    UpsellsController,
    MenuImportController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    ComplementsService,
    CombosService,
    OptionGroupsService,
    ProductOptionGroupsService,
    ComboSlotsService,
    ComboBundleItemsService,
    PublicationService,
    CatalogMigrationV2Service,
    PizzaEngineService,
    CatalogTemplatesService,
    UpsellsService,
    AvailabilityService,
    MenuImportService,
    FractionalPricingEngine,
  ],
  exports: [PizzaEngineService, CatalogTemplatesService, UpsellsService, AvailabilityService, FractionalPricingEngine],
})
export class CatalogModule {}
