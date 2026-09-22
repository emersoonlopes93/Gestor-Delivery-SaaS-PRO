import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import {
  MarketplaceConnection,
  MarketplaceEventChannel,
  MarketplaceEventInbox,
  MarketplaceEventStatus,
  MarketplaceProvider,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';
import { MarketplaceConnectionService } from './marketplace-connection.service';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MarketplaceOrderIngestionService } from './marketplace-order-ingestion.service';
import type { ParsedMarketplaceEvent } from '../marketplace.types';

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
        ...(input.provider === MarketplaceProvider.FOOD_99
          ? this.food99SignatureDiagnostics(input.headers, input.rawBody)
          : {}),
      });
      throw new BadRequestException('Invalid marketplace webhook signature.');
    }

    const parsed = await provider.parseWebhookEvent({
      headers: input.headers,
      rawBody: input.rawBody,
      body: input.body,
    });

    const isFood99ShopStatus = input.provider === MarketplaceProvider.FOOD_99
      && parsed.topic?.toUpperCase() === 'SHOPSTATUS'
      && !parsed.externalOrderId;
    if (input.provider === MarketplaceProvider.FOOD_99 && !isFood99ShopStatus
      && (!parsed.eventId || !parsed.externalOrderId || !parsed.externalStoreId || !parsed.topic)) {
      this.logger.warn({
        message: 'food99_webhook_payload_unmapped',
        payloadShape: this.food99PayloadShape(parsed.rawPayload),
      });
    }

    if (parsed.topic?.toUpperCase() === 'KEEPALIVE') {
      return {
        accepted: true as const,
        heartbeat: true as const,
        merchantIds: await this.resolveWebhookPresenceMerchants(parsed.rawPayload),
      };
    }

    const payloadHash = createHash('sha256')
      .update(typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8'))
      .digest('hex');
    const connection = await this.connectionService.resolveConnection({
      provider: parsed.provider,
      externalMerchantId: parsed.externalMerchantId,
      externalStoreId: parsed.externalStoreId,
    });

    return this.persistParsedEvent({
      parsed,
      payloadHash,
      headers: input.headers,
      channel: MarketplaceEventChannel.WEBHOOK,
      connection,
      process: !isFood99ShopStatus,
    });
  }

  async persistParsedEvent(input: {
    parsed: ParsedMarketplaceEvent;
    payloadHash?: string;
    headers?: Record<string, string | string[] | undefined>;
    channel: MarketplaceEventChannel;
    connection?: MarketplaceConnection | null;
    process?: boolean;
  }): Promise<{ accepted: true; duplicate: boolean; inboxId: string }> {
    const payloadHash = input.payloadHash ?? createHash('sha256')
      .update(JSON.stringify(input.parsed.rawPayload))
      .digest('hex');
    const legacyDedupeKey = input.parsed.eventId?.trim() || payloadHash;
    const dedupeScope = input.parsed.externalMerchantId?.trim()
      ?? input.parsed.externalStoreId?.trim()
      ?? input.connection?.id
      ?? 'unresolved';
    const dedupeKey = createHash('sha256')
      .update(`${input.parsed.provider}:${dedupeScope}:${legacyDedupeKey}`)
      .digest('hex');
    const duplicateWhere: Prisma.MarketplaceEventInboxWhereInput = {
      provider: input.parsed.provider,
      OR: [
        { dedupeKey },
        ...(input.connection ? [{ dedupeKey: legacyDedupeKey, connectionId: input.connection.id }] : []),
      ],
    };
    const existing = await this.prisma.marketplaceEventInbox.findFirst({ where: duplicateWhere });
    if (existing) {
      await this.prisma.marketplaceEventInbox.update({
        where: { id: existing.id },
        data: {
          duplicateCount: { increment: 1 },
          deliveryCount: { increment: 1 },
          lastDeliveryChannel: input.channel,
          lastReceivedAt: new Date(),
        },
      });
      this.logger.log({
        message: 'marketplace_event_duplicate',
        tenantId: existing.tenantId,
        connectionId: existing.connectionId,
        externalOrderId: existing.externalOrderId,
        eventId: existing.eventId,
        correlationId: existing.correlationId,
      });
      if (input.process !== false && (
        existing.status === MarketplaceEventStatus.RECEIVED
        || existing.status === MarketplaceEventStatus.FAILED
      )) {
        await this.dispatchInbox(existing);
      }
      return { accepted: true, duplicate: true, inboxId: existing.id };
    }

    let inbox: MarketplaceEventInbox;
    try {
      inbox = await this.prisma.marketplaceEventInbox.create({
        data: {
          provider: input.parsed.provider,
          eventId: input.parsed.eventId?.trim() || null,
          tenantId: input.connection?.tenantId ?? null,
          connectionId: input.connection?.id ?? null,
          externalMerchantId: input.parsed.externalMerchantId ?? null,
          externalStoreId: input.parsed.externalStoreId ?? null,
          externalOrderId: input.parsed.externalOrderId ?? null,
          topic: input.parsed.topic ?? null,
          eventCreatedAt: input.parsed.eventCreatedAt ?? null,
          eventSequence: input.parsed.eventSequence ?? null,
          correlationId: randomUUID(),
          payloadHash,
          dedupeKey,
          rawPayload: input.parsed.rawPayload as Prisma.InputJsonValue,
          headersJson: input.headers
            ? this.sanitizeHeaders(input.headers) as Prisma.InputJsonValue
            : undefined,
          status: input.process === false ? MarketplaceEventStatus.IGNORED : MarketplaceEventStatus.RECEIVED,
          firstDeliveryChannel: input.channel,
          lastDeliveryChannel: input.channel,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const raced = await this.prisma.marketplaceEventInbox.findFirst({ where: duplicateWhere });
      if (!raced) throw error;
      inbox = raced;
      await this.prisma.marketplaceEventInbox.update({
        where: { id: inbox.id },
        data: {
          duplicateCount: { increment: 1 },
          deliveryCount: { increment: 1 },
          lastDeliveryChannel: input.channel,
          lastReceivedAt: new Date(),
        },
      });
      if (input.process !== false && (
        inbox.status === MarketplaceEventStatus.RECEIVED
        || inbox.status === MarketplaceEventStatus.FAILED
      )) {
        await this.dispatchInbox(inbox);
      }
      return { accepted: true, duplicate: true, inboxId: inbox.id };
    }

    if (input.process === false) {
      await this.prisma.marketplaceEventInbox.update({
        where: { id: inbox.id },
        data: { processedAt: new Date(), lastError: 'non_actionable_event' },
      });
    } else {
      await this.dispatchInbox(inbox);
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
      const replay = await this.ingestionService.reapplyProcessedLifecycleEvent(inbox.id, tenantId);
      return { success: true, skipped: !replay.reapplied, reason: replay.reason };
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
    const masked = new Set([
      'authorization', 'x-api-key', 'x-ifood-token', 'x-app-signature', 'didi-header-sign',
    ]);
    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        masked.has(key.toLowerCase()) ? '***' : value,
      ]),
    );
  }

  private food99SignatureDiagnostics(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ) {
    const headerValue = (name: string): string | undefined => {
      const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
      const value = entry?.[1];
      return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
    };
    const signature = headerValue('didi-header-sign');
    const rawBodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    return {
      receivedHeaderNames: Object.keys(headers).map((name) => name.toLowerCase()).sort(),
      expectedSignatureHeader: 'didi-header-sign',
      signaturePresent: Boolean(signature),
      signatureLength: signature?.length ?? 0,
      signatureFormat: !signature
        ? 'missing'
        : /^[a-f0-9]{32}$/i.test(signature) ? 'hex32' : 'other',
      contentType: headerValue('content-type') ?? null,
      contentLength: headerValue('content-length') ?? null,
      rawBodyByteLength: rawBodyBuffer.byteLength,
      rawBodySha256: createHash('sha256').update(rawBodyBuffer).digest('hex'),
      userAgent: headerValue('user-agent') ?? null,
    };
  }

  private food99PayloadShape(payload: Record<string, unknown>) {
    const asRecord = (value: unknown): Record<string, unknown> | null => (
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
    );
    const data = asRecord(payload.data);
    const orderInfo = asRecord(data?.order_info);
    const valueType = (value: unknown): string => {
      if (Array.isArray(value)) return 'array';
      if (value === null) return 'null';
      return typeof value;
    };
    const types = (value: Record<string, unknown> | null) => value
      ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, valueType(entry)]))
      : null;
    return {
      containerType: valueType(payload),
      topLevelKeys: Object.keys(payload).sort(),
      topLevelTypes: types(payload),
      dataKeys: data ? Object.keys(data).sort() : null,
      dataTypes: types(data),
      orderInfoKeys: orderInfo ? Object.keys(orderInfo).sort() : null,
    };
  }

  private async dispatchInbox(inbox: MarketplaceEventInbox): Promise<void> {
    if (!this.queue) {
      await this.ingestionService.processInboxEvent(inbox.id);
      return;
    }
    await this.prisma.marketplaceEventInbox.update({
      where: { id: inbox.id },
      data: { status: MarketplaceEventStatus.QUEUED },
    });
    try {
      await this.queue.add('event-inbox-process', { eventInboxId: inbox.id, tenantId: inbox.tenantId }, {
        jobId: `marketplace-event-${inbox.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (error) {
      await this.prisma.marketplaceEventInbox.updateMany({
        where: { id: inbox.id, status: MarketplaceEventStatus.QUEUED },
        data: { status: MarketplaceEventStatus.RECEIVED, lastError: 'queue_dispatch_failed' },
      });
      throw error;
    }
  }

  private async resolveWebhookPresenceMerchants(payload: Record<string, unknown>): Promise<string[] | undefined> {
    if (!Array.isArray(payload.merchantIds)) return undefined;
    const requested = payload.merchantIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    if (requested.length === 0) return [];
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: {
        provider: MarketplaceProvider.IFOOD,
        status: 'CONNECTED',
        externalMerchantId: { in: requested },
        tenant: { status: 'active' },
      },
      select: { externalMerchantId: true, settingsJson: true },
    });
    return connections.flatMap((connection) => {
      const settings = connection.settingsJson;
      const pollingPresenceActive = typeof settings === 'object'
        && settings !== null
        && !Array.isArray(settings)
        && 'pollingFallbackEnabled' in settings
        && settings.pollingFallbackEnabled === true
        && 'presenceMode' in settings
        && settings.presenceMode === 'POLLING';
      return connection.externalMerchantId && !pollingPresenceActive ? [connection.externalMerchantId] : [];
    });
  }
}
