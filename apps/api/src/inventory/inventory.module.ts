import { Module } from '@nestjs/common';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
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

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [IngredientsController, RecipesController, InventoryCountController, LossesController, StockMovementsController],
  providers: [IngredientsService, StockMovementService, RecipesService, TheoreticalStockService, InventoryCountService, LossesService],
  exports: [IngredientsService, StockMovementService, RecipesService, TheoreticalStockService, InventoryCountService, LossesService],
})
export class InventoryModule {}
// Final environmental stabilization check
