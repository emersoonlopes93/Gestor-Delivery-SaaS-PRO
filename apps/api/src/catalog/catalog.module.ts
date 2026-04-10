import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { ComplementsController } from './complements/complements.controller';
import { ComplementsService } from './complements/complements.service';
import { CombosController } from './combos/combos.controller';
import { CombosService } from './combos/combos.service';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [CategoriesController, ProductsController, ComplementsController, CombosController],
  providers: [CategoriesService, ProductsService, ComplementsService, CombosService],
})
export class CatalogModule {}


