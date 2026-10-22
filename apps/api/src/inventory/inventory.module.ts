import { Module } from '@nestjs/common';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { PurchasePresentationsService } from './purchase-presentations.service';
import { PurchasePresentationsController } from './purchase-presentations.controller';
import { StockMovementService } from './stock-movement.service';
import { RecipesService } from './recipes.service';
import { RecipesController } from './recipes.controller';
import { TheoreticalStockService } from './theoretical-stock.service';
import { InventoryCountService } from './inventory-count.service';
import { InventoryCountController } from './inventory-count.controller';
import { LossesService } from './losses.service';
import { LossesController } from './losses.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

import { StockMovementsController } from './stock-movements.controller';
import { RecipeBasesController } from './recipe-bases.controller';
import { RecipeBasesService } from './recipe-bases.service';
import { RecipeExpansionService } from './recipe-expansion.service';
import { UnitIntegrityAuditService } from './unit-integrity-audit.service';
import { IngredientBaseUnitGuardService } from './ingredient-base-unit-guard.service';
import { ProductOptionItemRecipesService } from './product-option-item-recipes.service';
import { ProductOptionItemRecipesController } from './product-option-item-recipes.controller';
import { ConfigurableRecipeCompositionService } from './configurable-recipe-composition.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, CatalogModule],
  controllers: [IngredientsController, PurchasePresentationsController, RecipesController, ProductOptionItemRecipesController, RecipeBasesController, InventoryCountController, LossesController, StockMovementsController],
  providers: [IngredientsService, IngredientBaseUnitGuardService, PurchasePresentationsService, StockMovementService, RecipesService, ProductOptionItemRecipesService, RecipeBasesService, RecipeExpansionService, ConfigurableRecipeCompositionService, UnitIntegrityAuditService, TheoreticalStockService, InventoryCountService, LossesService],
  exports: [IngredientsService, StockMovementService, RecipesService, RecipeExpansionService, ConfigurableRecipeCompositionService, TheoreticalStockService, InventoryCountService, LossesService],
})
export class InventoryModule {}
// Final environmental stabilization check
