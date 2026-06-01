import { BadRequestException, Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../common/decorators';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';

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

  constructor(private readonly paymentAttemptService: BillingPaymentAttemptService) {}

  @Public()
  @Post('asaas-saas')
  async handleAsaasSaasWebhook(
    @Body() body: unknown,
    @Headers('asaas-access-token') token?: string,
  ) {
    const expectedToken = process.env.ASAAS_BILLING_WEBHOOK_SECRET?.trim();
    if (!expectedToken) {
      throw new BadRequestException('ASAAS_BILLING_WEBHOOK_SECRET nao configurado.');
    }
    if (!token || token !== expectedToken) {
      this.logger.warn({
        message: 'billing_asaas_webhook_rejected',
        provider: 'asaas',
        mode: 'sandbox',
        result: 'invalid_token',
      });
      throw new BadRequestException('Token de webhook Asaas billing invalido.');
    }

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

    const attempt = await this.paymentAttemptService.applyAsaasPaymentWebhook({
      eventId,
      eventType: payload.event,
      providerPaymentId: payload.payment.id,
      providerStatus: payload.payment.status,
    });

    this.logger.log({
      message: 'billing_asaas_webhook_accepted',
      provider: 'asaas',
      mode: 'sandbox',
      paymentAttemptId: attempt.id,
      providerPaymentId: payload.payment.id,
      eventId,
      result: 'accepted',
    });

    return {
      received: true,
      idempotencyKey: eventId,
      attemptId: attempt.id,
      status: attempt.status,
    };
  }
}
