import { Controller, Post, Body, Headers, Logger, Req } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { Public } from '../common/decorators';
import { AsaasWebhookSchema } from './dto/asaas.dto';
import { WebhookSecurityService } from './webhook-security.service';
import type { Request } from 'express';

@Controller('billing/webhooks')
export class BillingWebhookController {
  private readonly logger = new Logger('BillingWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookSecurity: WebhookSecurityService,
  ) {}

  @Public()
  @Post('asaas')
  async handleAsaasWebhook(
    @Body() body: unknown,
    @Req() req: Request,
    @Headers('asaas-access-token') token?: string,
  ) {
    const parsed = AsaasWebhookSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
      }));
      this.logger.warn(`Invalid Asaas webhook payload: ${JSON.stringify(issues)}`);
      return { received: true };
    }

    const { event, subscription } = parsed.data;
    this.logger.log(`Received Asaas webhook event: ${event}${subscription?.id ? ` (subscriptionId=${subscription.id})` : ''}`);

    const eventId = req.get('x-webhook-id')?.trim()
      || `${event}:${subscription?.id ?? 'no-subscription'}`;
    const webhookEvent = await this.webhookSecurity.verifyAndRegister({
      req,
      provider: 'asaas',
      eventId,
      legacyToken: token,
      legacySecretEnv: 'ASAAS_WEBHOOK_TOKEN',
      hmacSecretEnv: 'ASAAS_WEBHOOK_HMAC_SECRET',
      allowLegacyEnv: 'ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN',
      relatedEntityType: 'subscription',
      relatedEntityId: subscription?.id ?? null,
    });

    if (webhookEvent.duplicate) {
      return { received: true, duplicate: true };
    }

    if (!subscription?.id) {
      await this.webhookSecurity.markProcessed(webhookEvent.dbEventId);
      return { received: true };
    }

    const asaasSubscriptionId = subscription.id;
    const tenantSub = await this.prisma.tenantSubscription.findFirst({
      where: { asaasSubscriptionId },
    });

    if (!tenantSub) {
      this.logger.warn(`Subscription ${asaasSubscriptionId} not found in DB`);
      await this.webhookSecurity.markProcessed(webhookEvent.dbEventId);
      return { received: true };
    }

    let statusToUpdate: SubscriptionStatus | undefined;
    let currentPeriodEndsAt: Date | undefined;

    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_DUNNING_RECEIVED':
        statusToUpdate = SubscriptionStatus.active;
        if (subscription.nextDueDate) {
          currentPeriodEndsAt = new Date(subscription.nextDueDate);
        }
        break;
      case 'PAYMENT_OVERDUE':
        statusToUpdate = SubscriptionStatus.overdue;
        break;
      case 'PAYMENT_DELETED':
      case 'SUBSCRIPTION_DELETED':
        statusToUpdate = SubscriptionStatus.canceled;
        break;
      default:
        break;
    }

    if (statusToUpdate || currentPeriodEndsAt) {
      await this.prisma.tenantSubscription.update({
        where: { id: tenantSub.id },
        data: {
          ...(statusToUpdate && { status: statusToUpdate }),
          ...(currentPeriodEndsAt && { currentPeriodEndsAt }),
        },
      });
      this.logger.log(`Updated subscription ${tenantSub.id} to status ${statusToUpdate || tenantSub.status}`);
    }

    await this.webhookSecurity.markProcessed(webhookEvent.dbEventId);
    return { received: true };
  }
}
