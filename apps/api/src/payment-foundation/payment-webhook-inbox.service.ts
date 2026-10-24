import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExternalWebhookEvent,
  PaymentProvider,
  Prisma,
  WebhookEventStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { redactFinancialSecretText } from './payment-secret-redaction';

export type PaymentWebhookInboxResult<T> = {
  event: ExternalWebhookEvent;
  duplicate: boolean;
  processed: boolean;
  result?: T;
};

@Injectable()
export class PaymentWebhookInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async registerAuthenticatedAndProcess<T>(input: {
    authenticityVerified: true;
    provider: PaymentProvider;
    externalEventId: string;
    eventType: string;
    payload: Buffer | string;
    tenantId?: string | null;
    providerConnectionId?: string | null;
    paymentAttemptId?: string | null;
    externalPaymentId?: string | null;
    process: () => Promise<T>;
  }): Promise<PaymentWebhookInboxResult<T>> {
    const eventId = input.externalEventId.trim();
    const eventType = input.eventType.trim();
    if (!eventId || !eventType) throw new BadRequestException('Webhook event identity is required.');

    await this.assertTenantScope(input);
    const payloadHash = createHash('sha256').update(input.payload).digest('hex');
    let event: ExternalWebhookEvent;
    let ownsProcessing = false;

    try {
      event = await this.prisma.externalWebhookEvent.create({
        data: {
          provider: input.provider,
          eventId,
          eventType,
          payloadHash,
          status: WebhookEventStatus.processing,
          attempts: 1,
          tenantId: input.tenantId ?? null,
          providerConnectionId: input.providerConnectionId ?? null,
          orderPaymentAttemptId: input.paymentAttemptId ?? null,
          externalPaymentId: input.externalPaymentId ?? null,
          relatedEntityType: input.paymentAttemptId ? 'order_payment_attempt' : null,
          relatedEntityId: input.paymentAttemptId ?? null,
        },
      });
      ownsProcessing = true;
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      event = await this.prisma.externalWebhookEvent.findUniqueOrThrow({
        where: {
          provider_eventId: {
            provider: input.provider,
            eventId,
          },
        },
      });
      this.assertDuplicateMatches(event, input, payloadHash);

      if (event.status === WebhookEventStatus.failed) {
        const claimed = await this.prisma.externalWebhookEvent.updateMany({
          where: { id: event.id, status: WebhookEventStatus.failed },
          data: {
            status: WebhookEventStatus.processing,
            attempts: { increment: 1 },
            lastError: null,
          },
        });
        ownsProcessing = claimed.count === 1;
        if (ownsProcessing) {
          event = await this.prisma.externalWebhookEvent.findUniqueOrThrow({
            where: { id: event.id },
          });
        }
      }
    }

    if (!ownsProcessing) {
      return {
        event,
        duplicate: true,
        processed: event.status === WebhookEventStatus.processed,
      };
    }

    try {
      const result = await input.process();
      const processed = await this.prisma.externalWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookEventStatus.processed,
          processedAt: new Date(),
          lastError: null,
        },
      });
      return { event: processed, duplicate: false, processed: true, result };
    } catch (error) {
      const message = redactFinancialSecretText(
        error instanceof Error ? error.message : 'Unknown webhook processing error',
      );
      await this.prisma.externalWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookEventStatus.failed,
          lastError: message.slice(0, 1000),
        },
      });
      throw error;
    }
  }

  private async assertTenantScope(input: {
    provider: PaymentProvider;
    tenantId?: string | null;
    providerConnectionId?: string | null;
    paymentAttemptId?: string | null;
    externalPaymentId?: string | null;
  }): Promise<void> {
    if ((input.providerConnectionId || input.paymentAttemptId) && !input.tenantId) {
      throw new BadRequestException('Tenant is required for payment webhook resolution.');
    }

    if (input.providerConnectionId) {
      const connection = await this.prisma.paymentProviderConnection.findFirst({
        where: {
          id: input.providerConnectionId,
          tenantId: input.tenantId ?? undefined,
          provider: input.provider,
        },
        select: { id: true },
      });
      if (!connection) throw new NotFoundException('Webhook payment connection not found for tenant.');
    }

    if (input.paymentAttemptId) {
      const attempt = await this.prisma.orderPaymentAttempt.findFirst({
        where: {
          id: input.paymentAttemptId,
          tenantId: input.tenantId ?? undefined,
          provider: input.provider,
          ...(input.providerConnectionId
            ? { providerConnectionId: input.providerConnectionId }
            : {}),
        },
        select: { externalPaymentId: true },
      });
      if (!attempt) throw new NotFoundException('Webhook payment attempt not found for tenant.');
      if (input.externalPaymentId
        && attempt.externalPaymentId
        && attempt.externalPaymentId !== input.externalPaymentId) {
        throw new ConflictException('Webhook external payment does not match payment attempt.');
      }
    }
  }

  private assertDuplicateMatches(
    event: ExternalWebhookEvent,
    input: {
      tenantId?: string | null;
      providerConnectionId?: string | null;
      paymentAttemptId?: string | null;
      externalPaymentId?: string | null;
    },
    payloadHash: string,
  ): void {
    if (event.payloadHash !== payloadHash
      || event.tenantId !== (input.tenantId ?? null)
      || event.providerConnectionId !== (input.providerConnectionId ?? null)
      || event.orderPaymentAttemptId !== (input.paymentAttemptId ?? null)
      || event.externalPaymentId !== (input.externalPaymentId ?? null)) {
      throw new ConflictException('Webhook event identity was reused with different payment data.');
    }
  }

  private isUniqueConstraint(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
