import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketplaceConnectionStatus,
  MarketplaceEventChannel,
  MarketplacePollingStatus,
  MarketplaceProvider,
  TenantStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import type { MarketplacePollAcknowledgment } from '../marketplace.types';
import { Food99ApiError } from '../providers/food99-api.error';
import { MarketplaceEventInboxService } from './marketplace-event-inbox.service';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';

export type Food99PollingJob = {
  schemaVersion: 1;
  tenantId: string;
  connectionId: string;
  scheduledAt: string;
};

@Injectable()
export class Food99PollingService implements OnModuleInit {
  private readonly logger = new Logger(Food99PollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providers: MarketplaceProviderRegistryService,
    private readonly inbox: MarketplaceEventInboxService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled() || !this.queue) return;
    await this.queue.add('food99-polling-scan', { schemaVersion: 1 }, {
      jobId: 'food99-polling-scan',
      repeat: { every: this.intervalMs() },
      attempts: 3,
      backoff: { type: 'food99-retry-after', delay: 5000 },
    });
  }

  async scheduleEligibleConnections(): Promise<{ inspected: number; scheduled: number }> {
    if (!this.enabled() || !this.queue) return { inspected: 0, scheduled: 0 };
    const now = new Date();
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: {
        provider: MarketplaceProvider.FOOD_99,
        status: MarketplaceConnectionStatus.CONNECTED,
        pollingStatus: { not: MarketplacePollingStatus.BLOCKED },
        externalStoreId: { not: null },
        tenant: { status: TenantStatus.active },
        OR: [{ pollingNextAttemptAt: null }, { pollingNextAttemptAt: { lte: now } }],
      },
      orderBy: [{ pollingNextAttemptAt: 'asc' }, { id: 'asc' }],
      take: this.integerConfig('MARKETPLACE_99FOOD_POLLING_CONNECTIONS_PER_SCAN', 100, 1, 1000),
    });
    let scheduled = 0;
    const bucket = Math.floor(now.getTime() / this.intervalMs());
    for (const connection of connections) {
      if (!this.connectionPollingEnabled(connection.settingsJson)) continue;
      await this.queue.add('food99-poll-connection', {
        schemaVersion: 1,
        tenantId: connection.tenantId,
        connectionId: connection.id,
        scheduledAt: now.toISOString(),
      } satisfies Food99PollingJob, {
        jobId: `food99-poll-${connection.id}-${bucket}`,
        attempts: 3,
        backoff: { type: 'food99-retry-after', delay: 5000 },
      });
      await this.prisma.marketplaceConnection.updateMany({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: { pollingNextAttemptAt: new Date(now.getTime() + this.intervalMs()) },
      });
      scheduled += 1;
    }
    return { inspected: connections.length, scheduled };
  }

  async runConnection(job: Food99PollingJob): Promise<{
    received: number;
    persisted: number;
    duplicates: number;
    acknowledged: number;
  }> {
    if (!this.enabled()) throw new ServiceUnavailableException('99Food polling is disabled.');
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: {
        id: job.connectionId,
        tenantId: job.tenantId,
        provider: MarketplaceProvider.FOOD_99,
        status: MarketplaceConnectionStatus.CONNECTED,
        tenant: { status: TenantStatus.active },
      },
    });
    if (!connection || !this.connectionPollingEnabled(connection.settingsJson)) {
      return { received: 0, persisted: 0, duplicates: 0, acknowledged: 0 };
    }
    const provider = this.providers.get(MarketplaceProvider.FOOD_99);
    if (!provider.pollEvents || !provider.parsePollingEvent || !provider.acknowledgeEvents) {
      throw new ServiceUnavailableException('99Food polling adapter is incomplete.');
    }
    const correlationId = randomUUID();
    await this.prisma.marketplaceConnection.updateMany({
      where: { id: connection.id, tenantId: connection.tenantId },
      data: { pollingLastAttemptAt: new Date() },
    });
    try {
      const rawEvents = await provider.pollEvents({ connection, merchantIds: [], correlationId });
      let persisted = 0;
      let duplicates = 0;
      const acknowledgments: MarketplacePollAcknowledgment[] = [];
      for (const rawEvent of rawEvents) {
        const parsed = await provider.parsePollingEvent(rawEvent);
        const result = await this.inbox.persistParsedEvent({
          parsed,
          channel: MarketplaceEventChannel.POLLING,
          connection,
          process: Boolean(parsed.externalOrderId),
        });
        if (result.duplicate) duplicates += 1;
        else persisted += 1;
        if (parsed.eventId && parsed.externalOrderId && parsed.topic) {
          acknowledgments.push({ id: parsed.eventId, orderId: parsed.externalOrderId, eventType: parsed.topic });
        }
      }
      for (let index = 0; index < acknowledgments.length; index += 2000) {
        const events = acknowledgments.slice(index, index + 2000);
        await provider.acknowledgeEvents({
          connection,
          eventIds: events.map((event) => event.id),
          events,
          correlationId,
        });
      }
      const completedAt = new Date();
      await this.prisma.marketplaceConnection.updateMany({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: {
          pollingStatus: MarketplacePollingStatus.HEALTHY,
          pollingLastSuccessAt: completedAt,
          pollingNextAttemptAt: new Date(completedAt.getTime() + this.intervalMs()),
          pollingLastError: null,
          pollingBlockedReason: null,
          pollingConsecutiveFailures: 0,
          pollingCycles: { increment: 1 },
          pollingEventsReceived: { increment: rawEvents.length },
          pollingEventsPersisted: { increment: persisted },
          pollingDuplicateEvents: { increment: duplicates },
          pollingAcknowledgedEvents: { increment: acknowledgments.length },
        },
      });
      this.logger.log({
        message: 'food99_polling_cycle_completed',
        tenantId: connection.tenantId,
        connectionId: connection.id,
        correlationId,
        received: rawEvents.length,
        persisted,
        duplicates,
        acknowledged: acknowledgments.length,
      });
      return { received: rawEvents.length, persisted, duplicates, acknowledged: acknowledgments.length };
    } catch (error) {
      const permanent = error instanceof Food99ApiError && !error.retryable;
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown 99Food polling failure.';
      await this.prisma.marketplaceConnection.updateMany({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: {
          pollingStatus: permanent ? MarketplacePollingStatus.BLOCKED : MarketplacePollingStatus.DEGRADED,
          pollingLastFailureAt: new Date(),
          pollingLastError: message,
          pollingBlockedReason: permanent ? message : null,
          pollingConsecutiveFailures: { increment: 1 },
          pollingCycles: { increment: 1 },
        },
      });
      if (permanent) return { received: 0, persisted: 0, duplicates: 0, acknowledged: 0 };
      throw error;
    }
  }

  private enabled(): boolean {
    return this.config.get<string>('MARKETPLACE_99FOOD_ENABLED') === 'true'
      && this.config.get<string>('MARKETPLACE_99FOOD_POLLING_ENABLED') === 'true';
  }

  private intervalMs(): number {
    return this.integerConfig('MARKETPLACE_99FOOD_POLLING_INTERVAL_MS', 30_000, 30_000, 300_000);
  }

  private connectionPollingEnabled(settings: unknown): boolean {
    return typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      && 'pollingFallbackEnabled' in settings && settings.pollingFallbackEnabled === true
      && 'presenceMode' in settings && settings.presenceMode === 'POLLING';
  }

  private integerConfig(key: string, fallback: number, min: number, max: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
  }
}
