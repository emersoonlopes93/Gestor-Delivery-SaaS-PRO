import { Controller, Post, Body, Headers, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { Public } from '../common/decorators';

@Controller('billing/webhooks')
export class BillingWebhookController {
  private readonly logger = new Logger('BillingWebhookController');

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post('asaas')
  async handleAsaasWebhook(
    @Body() body: any,
    @Headers('asaas-access-token') token?: string,
  ) {
    const asaasWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (asaasWebhookToken && token !== asaasWebhookToken) {
      throw new BadRequestException('Token de webhook inválido');
    }

    const { event, subscription } = body;
    this.logger.log(`Received Asaas webhook event: ${event}`);

    if (!subscription || !subscription.id) {
      return { received: true };
    }

    const asaasSubscriptionId = subscription.id;
    const tenantSub = await this.prisma.tenantSubscription.findFirst({
      where: { asaasSubscriptionId },
    });

    if (!tenantSub) {
      this.logger.warn(`Subscription ${asaasSubscriptionId} not found in DB`);
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
        // OUTROS EVENTOS NÃO MUDAM STATUS
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

    return { received: true };
  }
}
