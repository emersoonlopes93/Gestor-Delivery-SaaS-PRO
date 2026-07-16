import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { MarketplaceEventInbox, MarketplaceEventStatus, MarketplaceProvider, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';
import { MarketplaceConnectionService } from './marketplace-connection.service';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MarketplaceOrderIngestionService } from './marketplace-order-ingestion.service';

@Injectable()
export class MarketplaceEventInboxService {
  private readonly logger = new Logger(MarketplaceEventInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    private readonly connectionService: MarketplaceConnectionService,
    private readonly ingestionService: MarketplaceOrderIngestionService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async receiveWebhook(input: {
    provider: MarketplaceProvider;
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | string;
    body: unknown;
  }) {
    const provider = this.providerRegistry.get(input.provider);
    const isValid = await provider.validateWebhook(input);
    if (!isValid) {
      this.logger.warn({
        message: 'marketplace_webhook_signature_invalid',
        provider: input.provider,
      });
      throw new BadRequestException('Invalid marketplace webhook signature.');
    }

    const parsed = await provider.parseWebhookEvent({
      headers: input.headers,
      body: input.body,
    });

    const payloadHash = createHash('sha256')
      .update(typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8'))
      .digest('hex');
    const dedupeKey = parsed.eventId?.trim() || payloadHash;
    const connection = await this.connectionService.resolveConnection({
      provider: parsed.provider,
      externalMerchantId: parsed.externalMerchantId,
      externalStoreId: parsed.externalStoreId,
    });

    const existing = await this.prisma.marketplaceEventInbox.findFirst({
      where: { provider: parsed.provider, dedupeKey },
    });
    if (existing) {
      await this.prisma.marketplaceEventInbox.update({
        where: { id: existing.id },
        data: { duplicateCount: { increment: 1 } },
      });
      this.logger.log({
        message: 'marketplace_event_duplicate',
        tenantId: existing.tenantId,
        externalOrderId: existing.externalOrderId,
        eventId: existing.eventId,
        correlationId: existing.correlationId,
      });
      return { accepted: true, duplicate: true, inboxId: existing.id };
    }

    let inbox: MarketplaceEventInbox;
    try {
      inbox = await this.prisma.marketplaceEventInbox.create({
        data: {
          provider: parsed.provider,
          eventId: parsed.eventId?.trim() || null,
          tenantId: connection?.tenantId ?? null,
          connectionId: connection?.id ?? null,
          externalMerchantId: parsed.externalMerchantId ?? null,
          externalStoreId: parsed.externalStoreId ?? null,
          externalOrderId: parsed.externalOrderId ?? null,
          topic: parsed.topic ?? null,
          eventCreatedAt: parsed.eventCreatedAt ?? null,
          eventSequence: parsed.eventSequence ?? null,
          correlationId: randomUUID(),
          payloadHash,
          dedupeKey,
          rawPayload: parsed.rawPayload as Prisma.InputJsonValue,
          headersJson: this.sanitizeHeaders(input.headers) as Prisma.InputJsonValue,
          status: MarketplaceEventStatus.RECEIVED,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      inbox = await this.prisma.marketplaceEventInbox.findFirstOrThrow({
        where: { provider: parsed.provider, dedupeKey },
      });
      await this.prisma.marketplaceEventInbox.update({
        where: { id: inbox.id },
        data: { duplicateCount: { increment: 1 } },
      });
      return { accepted: true, duplicate: true, inboxId: inbox.id };
    }

    if (this.queue) {
      await this.prisma.marketplaceEventInbox.update({
        where: { id: inbox.id },
        data: { status: MarketplaceEventStatus.QUEUED },
      });
      await this.queue.add('event-inbox-process', { eventInboxId: inbox.id, tenantId: inbox.tenantId }, {
        jobId: `marketplace-event-${inbox.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } else {
      await this.ingestionService.processInboxEvent(inbox.id);
    }

    return { accepted: true, duplicate: false, inboxId: inbox.id };
  }

  async reprocessEventInbox(eventInboxId: string, tenantId?: string) {
    const inbox = await this.prisma.marketplaceEventInbox.findFirst({
      where: {
        id: eventInboxId,
        ...(tenantId ? { tenantId } : {}),
      },
    });
    if (!inbox) throw new BadRequestException('Marketplace event inbox not found.');
    if (inbox.status === MarketplaceEventStatus.PROCESSED) {
      return { success: true, skipped: true, reason: 'already_processed' };
    }

    await this.prisma.marketplaceEventInbox.update({
      where: { id: inbox.id },
      data: {
        status: MarketplaceEventStatus.QUEUED,
        lastError: null,
      },
    });

    if (this.queue) {
      await this.queue.add('event-inbox-process', { eventInboxId: inbox.id, tenantId: inbox.tenantId }, {
        jobId: `marketplace-event-retry-${inbox.id}-${inbox.attempts + 1}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } else {
      await this.ingestionService.processInboxEvent(inbox.id);
    }

    return { success: true };
  }

  private sanitizeHeaders(headers: Record<string, string | string[] | undefined>) {
    const masked = new Set(['authorization', 'x-api-key', 'x-ifood-token']);
    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        masked.has(key.toLowerCase()) ? '***' : value,
      ]),
    );
  }
}
