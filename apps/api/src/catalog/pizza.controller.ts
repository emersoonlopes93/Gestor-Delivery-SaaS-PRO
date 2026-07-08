import { Body, Controller, Post } from '@nestjs/common';
import { PizzaEngineService } from './pizza-engine.service';
import { Public } from '../common/decorators';

@Controller('catalog/pizza')
export class PizzaController {
  constructor(private readonly pizzaEngine: PizzaEngineService) {}

  @Public()
  @Post('simulate')
  async simulate(@Body() body: { categoryId: string; sizeId: string; flavors: { productId: string; fraction: number }[] }) {
    return this.pizzaEngine.calculatePrice(body.categoryId, body.sizeId, body.flavors);
  }
}
