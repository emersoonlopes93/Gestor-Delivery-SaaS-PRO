import { 
  Module 
} from '@nestjs/common';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { StockMovementService } from './stock-movement.service';
import { RecipesService } from './recipes.service';
import { RecipesController } from './recipes.controller';
import { TheoreticalStockService } from './theoretical-stock.service';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [IngredientsController, RecipesController],
  providers: [IngredientsService, StockMovementService, RecipesService, TheoreticalStockService],
  exports: [IngredientsService, StockMovementService, RecipesService, TheoreticalStockService],
})
export class InventoryModule {}
// Final environmental stabilization check
