import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { WebhookSecurityService } from './webhook-security.service';

type SmokeWebhookPayload = {
  id?: string;
  event?: string;
};

@Controller('billing/webhooks')
export class WebhookSecuritySmokeController {
  constructor(private readonly webhookSecurity: WebhookSecurityService) {}

  @Public()
  @Post('security-smoke')
  async handleSecuritySmoke(@Body() body: SmokeWebhookPayload, @Req() req: Request) {
    const enabled =
      process.env.NODE_ENV !== 'production' ||
      process.env.WEBHOOK_SECURITY_SMOKE_ENABLED === 'true';
    if (!enabled) {
      throw new ForbiddenException('Webhook security smoke endpoint disabled.');
    }

    const eventId = body.id?.trim() || req.get('x-webhook-id')?.trim() || undefined;
    const webhookEvent = await this.webhookSecurity.verifyAndRegister({
      req,
      provider: 'security-smoke',
      eventId,
      hmacSecretEnv: 'ASAAS_WEBHOOK_HMAC_SECRET',
      relatedEntityType: 'security_smoke',
      relatedEntityId: eventId ?? null,
    });

    if (!webhookEvent.duplicate) {
      await this.webhookSecurity.markProcessed(webhookEvent.dbEventId);
    }

    return {
      received: true,
      duplicate: webhookEvent.duplicate,
      idempotencyKey: webhookEvent.eventId,
      event: body.event ?? 'security_smoke',
    };
  }
}
