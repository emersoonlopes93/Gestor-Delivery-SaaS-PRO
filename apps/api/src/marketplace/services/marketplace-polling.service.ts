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
import { FeatureControlService } from '../../feature-control/feature-control.service';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import type { ParsedMarketplaceEvent } from '../marketplace.types';
import { IfoodApiError } from '../providers/ifood-api.error';
import { MarketplaceEventInboxService } from './marketplace-event-inbox.service';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';

export type MarketplacePollingJob = {
  schemaVersion: 1;
  tenantId: string;
  connectionId: string;
  scheduledAt: string;
};

const EVENT_PRECEDENCE: Record<string, number> = {
  PLACED: 10,
  PLC: 10,
  CONFIRMED: 20,
  CFM: 20,
  PREPARATION_STARTED: 30,
  READY_TO_PICKUP: 40,
  DISPATCHED: 50,
  CONCLUDED: 60,
  COMPLETED: 60,
  CANCELLED: 70,
  CAN: 70,
};

const ACTIONABLE_EVENT_TOPICS = new Set([
  'PLC',
  'PLACED',
  'CFM',
  'CONFIRMED',
  'ORDER_CONFIRMED',
  'SPS',
  'SPE',
  'PREPARATION_STARTED',
  'PREPARATION_REQUESTED',
  'RTP',
  'READY_TO_PICKUP',
  'DSP',
  'DISPATCHED',
  'CON',
  'CONCLUDED',
  'COMPLETED',
  'ORDER_COMPLETED',
  'CAN',
  'CANCELLED',
  'ORDER_CANCELLED',
  'CANCELLATION_REQUESTED',
  'CANCELLATION_REQUEST_FAILED',
]);

@Injectable()
export class MarketplacePollingService implements OnModuleInit {
  private readonly logger = new Logger(MarketplacePollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providers: MarketplaceProviderRegistryService,
    private readonly inbox: MarketplaceEventInboxService,
    private readonly featureControl: FeatureControlService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled() || !this.queue) return;
    await this.queue.add(
      'ifood-polling-scan',
      { schemaVersion: 1 },
      {
        jobId: 'ifood-polling-scan',
        repeat: { every: this.intervalMs() },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }

  async scheduleEligibleConnections(): Promise<{ inspected: number; scheduled: number }> {
    if (!this.isEnabled() || !this.queue) return { inspected: 0, scheduled: 0 };
    const limit = this.integerConfig('MARKETPLACE_IFOOD_POLLING_CONNECTIONS_PER_SCAN', 100, 1, 1000);
    const tenants = await this.prisma.tenant.findMany({
      where: { status: TenantStatus.active },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 1000,
    });
    const connections = tenants.length
      ? await this.prisma.marketplaceConnection.findMany({
          where: {
            tenantId: { in: tenants.map((tenant) => tenant.id) },
            provider: MarketplaceProvider.IFOOD,
            status: MarketplaceConnectionStatus.CONNECTED,
            pollingStatus: { not: MarketplacePollingStatus.BLOCKED },
            externalMerchantId: { not: null },
          },
          orderBy: [{ pollingNextAttemptAt: 'asc' }, { id: 'asc' }],
          take: limit,
        })
      : [];
    const now = Date.now();
    const bucket = Math.floor(now / this.intervalMs());
    let scheduled = 0;
    for (const connection of connections) {
      if (!this.connectionPollingEnabled(connection.settingsJson)) continue;
      if (connection.pollingNextAttemptAt && connection.pollingNextAttemptAt.getTime() > now) continue;
      const capability = await this.featureControl.resolveTenantFeature({
        tenantId: connection.tenantId,
        featureKey: 'ifood_marketplace',
        requiredPermission: [],
      });
      if (!capability.enabled) continue;
      const delay = this.jitterMs(connection.id);
      await this.queue.add(
        'ifood-poll-connection',
        {
          schemaVersion: 1,
          tenantId: connection.tenantId,
          connectionId: connection.id,
          scheduledAt: new Date(now).toISOString(),
        } satisfies MarketplacePollingJob,
        {
          jobId: `ifood-poll-${connection.id}-${bucket}`,
          delay,
          attempts: 3,
          backoff: { type: 'ifood-retry-after', delay: 5000 },
        },
      );
      await this.prisma.marketplaceConnection.updateMany({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: { pollingNextAttemptAt: new Date(now + this.intervalMs() + delay) },
      });
      scheduled += 1;
    }
    return { inspected: connections.length, scheduled };
  }

  async runConnection(job: MarketplacePollingJob, isRetry = false): Promise<{
    received: number;
    persisted: number;
    duplicates: number;
    acknowledged: number;
  }> {
    if (!this.isEnabled()) throw new ServiceUnavailableException('iFood polling fallback is disabled.');
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: {
        id: job.connectionId,
        tenantId: job.tenantId,
        provider: MarketplaceProvider.IFOOD,
      },
      include: { tenant: { select: { status: true } } },
    });
    if (
      !connection
      || connection.status !== MarketplaceConnectionStatus.CONNECTED
      || connection.pollingStatus === MarketplacePollingStatus.BLOCKED
      || connection.tenant.status !== TenantStatus.active
      || !connection.externalMerchantId
      || !this.connectionPollingEnabled(connection.settingsJson)
    ) return { received: 0, persisted: 0, duplicates: 0, acknowledged: 0 };

    const capability = await this.featureControl.resolveTenantFeature({
      tenantId: connection.tenantId,
      featureKey: 'ifood_marketplace',
      requiredPermission: [],
    });
    if (!capability.enabled) return { received: 0, persisted: 0, duplicates: 0, acknowledged: 0 };

    const provider = this.providers.get(MarketplaceProvider.IFOOD);
    if (!provider.pollEvents || !provider.parsePollingEvent || !provider.acknowledgeEvents) {
      throw new ServiceUnavailableException('iFood polling adapter is incomplete.');
    }

    const correlationId = randomUUID();
    const attemptedAt = new Date();
    const claim = await this.prisma.marketplaceConnection.updateMany({
      where: isRetry
        ? { id: connection.id, tenantId: connection.tenantId }
        : {
            id: connection.id,
            tenantId: connection.tenantId,
            OR: [
              { pollingLastAttemptAt: null },
              { pollingLastAttemptAt: { lt: new Date(attemptedAt.getTime() - Math.min(25_000, this.intervalMs() - 1000)) } },
            ],
          },
      data: { pollingLastAttemptAt: attemptedAt },
    });
    if (claim.count === 0) return { received: 0, persisted: 0, duplicates: 0, acknowledged: 0 };

    try {
      const rawEvents = await provider.pollEvents({
        connection,
        merchantId: connection.externalMerchantId,
        correlationId,
        filters: this.filters(),
      });
      const parsedEvents = await Promise.all(rawEvents.map((event) => provider.parsePollingEvent!(event)));
      parsedEvents.sort((left, right) => this.compareEvents(left, right));

      const acknowledgmentIds: string[] = [];
      let persisted = 0;
      let duplicates = 0;
      for (const parsed of parsedEvents) {
        if (parsed.externalMerchantId !== connection.externalMerchantId) {
          throw new IfoodApiError('Polling event merchant does not match the requested connection.', false, 409, 'MERCHANT_MISMATCH');
        }
        const process = Boolean(
          parsed.externalOrderId?.trim()
          && ACTIONABLE_EVENT_TOPICS.has(parsed.topic?.trim().toUpperCase() ?? ''),
        );
        const result = await this.inbox.persistParsedEvent({
          parsed,
          channel: MarketplaceEventChannel.POLLING,
          connection,
          process,
        });
        if (result.duplicate) duplicates += 1;
        else persisted += 1;
        const eventId = parsed.eventId?.trim();
        if (eventId) acknowledgmentIds.push(eventId);
      }

      let acknowledged = 0;
      for (const batch of this.chunks([...new Set(acknowledgmentIds)], 2000)) {
        try {
          await provider.acknowledgeEvents({ connection, eventIds: batch, correlationId });
        } catch (error) {
          await this.prisma.marketplaceConnection.updateMany({
            where: { id: connection.id, tenantId: connection.tenantId },
            data: { pollingAcknowledgmentFailures: { increment: 1 } },
          });
          throw error;
        }
        acknowledged += batch.length;
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
          pollingAcknowledgedEvents: { increment: acknowledged },
        },
      });
      this.logger.log({
        message: 'ifood_polling_cycle_completed',
        tenantId: connection.tenantId,
        connectionId: connection.id,
        merchantId: connection.externalMerchantId,
        correlationId,
        received: rawEvents.length,
        persisted,
        duplicates,
        acknowledged,
      });
      return { received: rawEvents.length, persisted, duplicates, acknowledged };
    } catch (error) {
      await this.recordFailure(connection.id, connection.tenantId, error, correlationId);
      if (this.isPermanent(error)) return { received: 0, persisted: 0, duplicates: 0, acknowledged: 0 };
      throw error;
    }
  }

  async runNow(input: {
    tenantId: string;
    connectionId: string;
    adminId: string;
    ip?: string;
  }): Promise<{ jobId: string }> {
    if (!this.isEnabled() || !this.queue) throw new ServiceUnavailableException('iFood polling fallback is unavailable.');
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { id: input.connectionId, tenantId: input.tenantId, provider: MarketplaceProvider.IFOOD },
      select: { id: true },
    });
    if (!connection) throw new ServiceUnavailableException('iFood connection not found.');
    const jobId = `ifood-poll-${connection.id}-${Math.floor(Date.now() / this.intervalMs())}`;
    await this.queue.add('ifood-poll-connection', {
      schemaVersion: 1,
      tenantId: input.tenantId,
      connectionId: connection.id,
      scheduledAt: new Date().toISOString(),
    } satisfies MarketplacePollingJob, { jobId, attempts: 1 });
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.adminId,
        userType: 'saas_admin',
        action: 'marketplace.polling.run_now',
        resource: connection.id,
        ip: input.ip ?? null,
        details: { connectionId: connection.id, jobId },
      },
    });
    return { jobId };
  }

  private async recordFailure(connectionId: string, tenantId: string, error: unknown, correlationId: string): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown polling failure.';
    const permanent = this.isPermanent(error);
    const now = new Date();
    await this.prisma.marketplaceConnection.updateMany({
      where: { id: connectionId, tenantId },
      data: {
        pollingStatus: permanent ? MarketplacePollingStatus.BLOCKED : MarketplacePollingStatus.DEGRADED,
        pollingLastFailureAt: now,
        pollingLastError: message,
        pollingBlockedReason: permanent ? message : null,
        pollingConsecutiveFailures: { increment: 1 },
        pollingCycles: { increment: 1 },
        pollingNextAttemptAt: permanent ? null : new Date(now.getTime() + this.failureDelayMs(error)),
      },
    });
    this.logger.error({
      message: permanent ? 'ifood_polling_connection_blocked' : 'ifood_polling_cycle_failed',
      tenantId,
      connectionId,
      correlationId,
      providerCode: error instanceof IfoodApiError ? error.providerCode : undefined,
      retryable: !permanent,
    });
  }

  private isPermanent(error: unknown): boolean {
    return error instanceof IfoodApiError && !error.retryable;
  }

  private failureDelayMs(error: unknown): number {
    if (error instanceof IfoodApiError && error.retryAfterMs) return error.retryAfterMs;
    return 30_000;
  }

  private compareEvents(left: ParsedMarketplaceEvent, right: ParsedMarketplaceEvent): number {
    const leftAt = left.eventCreatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightAt = right.eventCreatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftAt !== rightAt) return leftAt - rightAt;
    if (left.eventSequence !== null && left.eventSequence !== undefined
      && right.eventSequence !== null && right.eventSequence !== undefined
      && left.eventSequence !== right.eventSequence) {
      return left.eventSequence < right.eventSequence ? -1 : 1;
    }
    const leftPrecedence = EVENT_PRECEDENCE[left.topic?.toUpperCase() ?? ''] ?? 0;
    const rightPrecedence = EVENT_PRECEDENCE[right.topic?.toUpperCase() ?? ''] ?? 0;
    if (leftPrecedence !== rightPrecedence) return leftPrecedence - rightPrecedence;
    return (left.eventId ?? '').localeCompare(right.eventId ?? '');
  }

  private isEnabled(): boolean {
    return this.config.get<string>('MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED') === 'true'
      && this.config.get<string>('MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED') === 'true';
  }

  private intervalMs(): number {
    return this.integerConfig('MARKETPLACE_IFOOD_POLLING_INTERVAL_MS', 30_000, 30_000, 300_000);
  }

  private filters(): { categories?: string; types?: string; groups?: string } {
    const categories = this.config.get<string>('MARKETPLACE_IFOOD_POLLING_CATEGORIES')?.trim();
    const types = this.config.get<string>('MARKETPLACE_IFOOD_POLLING_TYPES')?.trim();
    const groups = this.config.get<string>('MARKETPLACE_IFOOD_POLLING_GROUPS')?.trim();
    return {
      ...(categories ? { categories } : {}),
      ...(types ? { types } : {}),
      ...(groups ? { groups } : {}),
    };
  }

  private connectionPollingEnabled(settings: unknown): boolean {
    return typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      && 'pollingFallbackEnabled' in settings
      && settings.pollingFallbackEnabled === true;
  }

  private jitterMs(connectionId: string): number {
    const max = this.integerConfig('MARKETPLACE_IFOOD_POLLING_JITTER_MS', 5000, 0, 15_000);
    if (max === 0) return 0;
    const hash = [...connectionId].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
    return hash % (max + 1);
  }

  private integerConfig(key: string, fallback: number, min: number, max: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
  }

  private chunks<T>(items: T[], size: number): T[][] {
    const output: T[][] = [];
    for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
    return output;
  }
}
