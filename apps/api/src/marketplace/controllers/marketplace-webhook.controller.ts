/* eslint-disable @typescript-eslint/no-unused-vars */
import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MarketplaceProvider } from '@prisma/client';
import { Public } from '../../common/decorators';
import { Throttle } from '@nestjs/throttler';
import { MarketplaceProviderRegistryService } from '../services/marketplace-provider-registry.service';
import { MarketplaceEventInboxService } from '../services/marketplace-event-inbox.service';

@Controller('webhooks/marketplaces')
export class MarketplaceWebhookController {
  constructor(
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    private readonly inboxService: MarketplaceEventInboxService,
  ) {}

  @Post(':provider')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ public: { limit: 120, ttl: 60 } })
  async receiveWebhook(
    @Param('provider') providerParam: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) response: Response,
  ) {
    const provider = this.providerRegistry.parseProvider(providerParam);
    const result = await this.inboxService.receiveWebhook({
      provider,
      headers,
      rawBody: req.rawBody ?? Buffer.from(JSON.stringify(body ?? {})),
      body,
    });
    if (provider === MarketplaceProvider.FOOD_99) {
      // The native 99Food callback retries when it does not receive this JSON ACK.
      // A 204 empty response is a successful HTTP response, but not a successful
      // provider acknowledgement.
      response.status(HttpStatus.OK);
      return { errno: 0, errmsg: 'ok' };
    }
    if ('heartbeat' in result) {
      return result.merchantIds === undefined ? undefined : { merchantIds: result.merchantIds };
    }
    return result;
  }
}
