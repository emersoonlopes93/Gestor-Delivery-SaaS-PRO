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
import { PublicationController } from './publication/publication.controller';
import { PublicationService } from './publication/publication.service';
import { CatalogMigrationV2Service } from './migration-v2.service';
import { PizzaEngineService } from './pizza-engine.service';
import { CatalogTemplatesService } from './catalog-templates.service';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { PizzaController } from './pizza.controller';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [CategoriesController, ProductsController, ComplementsController, CombosController, OptionGroupsController, ProductOptionGroupsController, ComboSlotsController, PublicationController, PizzaController],
  providers: [
    CategoriesService,
    ProductsService,
    ComplementsService,
    CombosService,
    OptionGroupsService,
    ProductOptionGroupsService,
    ComboSlotsService,
    PublicationService,
    CatalogMigrationV2Service,
    PizzaEngineService,
    CatalogTemplatesService,
  ],
  exports: [PizzaEngineService, CatalogTemplatesService],
})
export class CatalogModule {}


