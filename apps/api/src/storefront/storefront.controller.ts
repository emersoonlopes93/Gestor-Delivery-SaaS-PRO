import { Controller, Get, Param, NotFoundException, Query } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { Public } from '../common/decorators';

@Controller('public/storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get(':slug')
  @Public() // Explicitly open to the public without generic JWT rules
  async getStorefront(
    @Param('slug') slug: string,
    @Query('fulfillmentType') fulfillmentType?: 'delivery' | 'pickup',
  ) {
    const payload = await this.storefrontService.getStorefrontPayload(slug, fulfillmentType);
    if (!payload) {
      throw new NotFoundException('Loja não encontrada ou inativa');
    }
    return payload;
  }
}
