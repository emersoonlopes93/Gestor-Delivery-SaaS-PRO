import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { Public } from '../common/decorators';

@Controller('public/storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get(':slug')
  @Public() // Explicitly open to the public without generic JWT rules
  async getStorefront(@Param('slug') slug: string) {
    const payload = await this.storefrontService.getStorefrontPayload(slug);
    if (!payload) {
      throw new NotFoundException('Loja não encontrada ou inativa');
    }
    return payload;
  }
}
