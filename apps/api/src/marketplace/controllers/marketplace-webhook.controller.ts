/* eslint-disable @typescript-eslint/no-unused-vars */
import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MarketplaceProvider } from '@prisma/client';
import { Public } from '../../common/decorators';
import { Throttle } from '@nestjs/throttler';
import { MarketplaceProviderRegistryService } from '../services/marketplace-provider-registry.service';
import { MarketplaceEventInboxService } from '../services/marketplace-event-inbox.service';
import { FOOD99_WEBHOOK_SUCCESS_ACK } from '../food99-webhook-ack';

@Controller('webhooks/marketplaces')
export class MarketplaceWebhookController {
  private readonly logger = new Logger(MarketplaceWebhookController.name);

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
      response.status(HttpStatus.OK);
      this.logger.log({
        message: 'food99_webhook_ack_sent',
        status: HttpStatus.OK,
        errno: FOOD99_WEBHOOK_SUCCESS_ACK.errno,
        errmsg: FOOD99_WEBHOOK_SUCCESS_ACK.errmsg,
      });
      return FOOD99_WEBHOOK_SUCCESS_ACK;
    }
    if ('heartbeat' in result) {
      return result.merchantIds === undefined ? undefined : { merchantIds: result.merchantIds };
    }
    return result;
  }
}
