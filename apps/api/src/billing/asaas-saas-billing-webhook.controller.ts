import { BadRequestException, Body, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../common/decorators';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';
import { WebhookSecurityService } from './webhook-security.service';

const AsaasSaasPaymentWebhookSchema = z.object({
  id: z.string().optional(),
  event: z.string().min(1),
  dateCreated: z.string().optional(),
  payment: z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    externalReference: z.string().optional().nullable(),
  }),
});

@Controller('billing/webhooks')
export class AsaasSaasBillingWebhookController {
  private readonly logger = new Logger(AsaasSaasBillingWebhookController.name);

  constructor(
    private readonly paymentAttemptService: BillingPaymentAttemptService,
    private readonly webhookSecurity: WebhookSecurityService,
  ) {}

  @Public()
  @Throttle({ public: { limit: 120, ttl: 60 } })
  @Post('asaas-saas')
  async handleAsaasSaasWebhook(
    @Body() body: unknown,
    @Req() req: Request,
    @Headers('asaas-access-token') token?: string,
  ) {
    const parsed = AsaasSaasPaymentWebhookSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      }));
      this.logger.warn(`Invalid Asaas SaaS billing webhook payload: ${JSON.stringify(issues)}`);
      throw new BadRequestException('Payload de webhook Asaas billing invalido.');
    }

    const payload = parsed.data;
    const eventId = payload.id?.trim()
      || `${payload.event}:${payload.payment.id}:${payload.payment.status}:${payload.dateCreated ?? 'no-date'}`;
    const webhookEvent = await this.webhookSecurity.verifyAndRegister({
      req,
      provider: 'asaas-saas',
      eventId,
      legacyToken: token,
      legacySecretEnv: 'ASAAS_BILLING_WEBHOOK_SECRET',
      hmacSecretEnv: 'ASAAS_WEBHOOK_HMAC_SECRET',
      allowLegacyEnv: 'ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN',
      relatedEntityType: 'payment',
      relatedEntityId: payload.payment.id,
    });

    if (webhookEvent.duplicate) {
      return {
        received: true,
        duplicate: true,
        idempotencyKey: webhookEvent.eventId,
      };
    }

    try {
      const attempt = await this.paymentAttemptService.applyAsaasPaymentWebhook({
        eventId: webhookEvent.eventId,
        eventType: payload.event,
        providerPaymentId: payload.payment.id,
        providerStatus: payload.payment.status,
      });
      await this.webhookSecurity.markProcessed(webhookEvent.dbEventId);

      this.logger.log({
        message: 'billing_asaas_webhook_processed',
        provider: 'asaas',
        mode: 'sandbox',
        paymentAttemptId: attempt.id,
        providerPaymentId: payload.payment.id,
        eventId: webhookEvent.eventId,
        result: 'processed',
      });

      return {
        received: true,
        idempotencyKey: webhookEvent.eventId,
        attemptId: attempt.id,
        status: attempt.status,
      };
    } catch (err) {
      await this.webhookSecurity.markFailed(webhookEvent.dbEventId, err);
      throw err;
    }
  }
}
