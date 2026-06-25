import { Controller, Get, Param, NotFoundException, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { StorefrontService } from './storefront.service';
import { Public } from '../common/decorators';

@Controller('public/storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get(':slug')
  @Public() // Explicitly open to the public without generic JWT rules
  @Throttle({ public: { limit: 120, ttl: 60 } })
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
  
  @Get(':slug/slots')
  @Public()
  @Throttle({ public: { limit: 120, ttl: 60 } })
  async getSlots(
    @Param('slug') slug: string,
    @Query('date') date?: string,
  ) {
    return this.storefrontService.getAvailableSlots(slug, date);
  }

  @Get(':slug/manifest')
  @Public()
  @Throttle({ public: { limit: 120, ttl: 60 } })
  async getManifest(
    @Param('slug') slug: string,
    @Res() res: Response,
  ) {
    const manifest = await this.storefrontService.getStorefrontManifest(slug);
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.json(manifest);
  }
}
