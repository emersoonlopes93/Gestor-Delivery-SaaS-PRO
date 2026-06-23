import { BadRequestException, Body, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../common/decorators';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';
import { WebhookSecurityService } from './webhook-security.service';
import { PrismaService } from '../database/prisma.service';
import { TenantSubscriptionStatus } from '@prisma/client';

const AsaasSaasPaymentWebhookSchema = z.object({
  id: z.string().optional(),
  event: z.string().min(1),
  dateCreated: z.string().optional(),
  payment: z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    externalReference: z.string().optional().nullable(),
    subscription: z.string().optional().nullable(),
  }),
});

@Controller('billing/webhooks')
export class AsaasSaasBillingWebhookController {
  private readonly logger = new Logger(AsaasSaasBillingWebhookController.name);

  constructor(
    private readonly paymentAttemptService: BillingPaymentAttemptService,
    private readonly webhookSecurity: WebhookSecurityService,
    private readonly prisma: PrismaService,
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

    let attemptId: string | undefined;
    let attemptStatus: string | undefined;

    try {
      // 1. Tentar mapear como payment avulso da invoice
      try {
        const attempt = await this.paymentAttemptService.applyAsaasPaymentWebhook({
          eventId: webhookEvent.eventId,
          eventType: payload.event,
          providerPaymentId: payload.payment.id,
          providerStatus: payload.payment.status,
        });
        attemptId = attempt.id;
        attemptStatus = attempt.status;
      } catch (err) {
        // Se falhar e a Subscription estiver presente, ignorar erro de "nao encontrada".
        if (err instanceof Error && err.message.includes('nao encontrada') && payload.payment.subscription) {
          this.logger.log('Payment attempt not found, but subscription exists. Proceeding with subscription update.');
        } else {
          throw err;
        }
      }

      // 2. Tratar Webhook para a Assinatura vinculada (se aplicavel)
      if (payload.payment.subscription) {
        await this.syncSubscriptionStatus(payload.payment.subscription, payload.payment.status);
      }

      await this.webhookSecurity.markProcessed(webhookEvent.dbEventId);

      this.logger.log({
        message: 'billing_asaas_webhook_processed',
        provider: 'asaas',
        mode: 'sandbox',
        paymentAttemptId: attemptId,
        providerPaymentId: payload.payment.id,
        providerSubscriptionId: payload.payment.subscription,
        eventId: webhookEvent.eventId,
        result: 'processed',
      });

      return {
        received: true,
        idempotencyKey: webhookEvent.eventId,
        attemptId,
        status: attemptStatus,
      };
    } catch (err) {
      await this.webhookSecurity.markFailed(webhookEvent.dbEventId, err);
      throw err;
    }
  }

  private async syncSubscriptionStatus(providerSubscriptionId: string, asaasPaymentStatus: string) {
    let nextStatus: TenantSubscriptionStatus = 'active';

    if (asaasPaymentStatus === 'OVERDUE') nextStatus = 'overdue';
    else if (asaasPaymentStatus === 'RECEIVED' || asaasPaymentStatus === 'CONFIRMED') nextStatus = 'active';
    else if (asaasPaymentStatus === 'REFUNDED' || asaasPaymentStatus === 'CHARGEBACK_REQUESTED') nextStatus = 'suspended';
    else if (asaasPaymentStatus === 'DELETED') nextStatus = 'canceled';
    else return; // Outros status como PENDING ignoramos a mudança de status da assinatura

    const sub = await this.prisma.tenantBillingSubscription.findFirst({
      where: { providerSubscriptionId, provider: 'asaas' }
    });

    if (sub && sub.status !== nextStatus) {
      await this.prisma.tenantBillingSubscription.update({
        where: { id: sub.id },
        data: { status: nextStatus }
      });
      this.logger.log(`Subscription ${sub.id} updated from ${sub.status} to ${nextStatus}`);
    }
  }
}
