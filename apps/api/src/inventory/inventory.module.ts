import { Module } from '@nestjs/common';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { StockMovementService } from './stock-movement.service';
import { RecipesService } from './recipes.service';
import { RecipesController } from './recipes.controller';
import { TheoreticalStockService } from './theoretical-stock.service';

@Module({
  controllers: [IngredientsController, RecipesController],
  providers: [IngredientsService, StockMovementService, RecipesService, TheoreticalStockService],
  exports: [IngredientsService, StockMovementService, RecipesService, TheoreticalStockService],
})
export class InventoryModule {}
