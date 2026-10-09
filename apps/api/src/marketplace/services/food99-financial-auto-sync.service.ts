import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceConnectionStatus, MarketplaceProvider, TenantStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  FOOD99_FINANCIAL_AUTO_SYNC_CONNECTION_JOB,
  FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB,
  MARKETPLACE_EVENT_QUEUE,
} from '../marketplace.constants';
import { Food99FinancialReconciliationService } from './food99-financial-reconciliation.service';

export type Food99FinancialAutoSyncTrigger = 'order_activity' | 'scheduled';

export type Food99FinancialAutoSyncJob = {
  schemaVersion: 1;
  tenantId: string;
  connectionId: string;
  trigger: Food99FinancialAutoSyncTrigger;
  scheduledAt: string;
};

@Injectable()
export class Food99FinancialAutoSyncService implements OnModuleInit {
  private readonly logger = new Logger(Food99FinancialAutoSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reconciliation: Food99FinancialReconciliationService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled() || !this.queue) return;
    await this.queue.add(FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB, { schemaVersion: 1 }, {
      jobId: FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB,
      repeat: { every: this.reconciliationCadenceMs() },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  }

  /** Best-effort only: order ingestion never awaits financial provider work. */
  async requestForOrderActivity(input: { tenantId: string; connectionId: string }): Promise<{ scheduled: boolean }> {
    if (!this.enabled() || !this.queue) return { scheduled: false };
    return this.enqueue(input.tenantId, input.connectionId, 'order_activity', new Date());
  }

  async scheduleEligibleConnections(now = new Date()): Promise<{ inspected: number; scheduled: number }> {
    if (!this.enabled() || !this.queue) return { inspected: 0, scheduled: 0 };
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: {
        provider: MarketplaceProvider.FOOD_99,
        status: MarketplaceConnectionStatus.CONNECTED,
        externalStoreId: { not: null },
        tenant: { status: TenantStatus.active },
      },
      select: { id: true, tenantId: true },
      orderBy: { id: 'asc' },
      take: this.integerConfig('MARKETPLACE_99FOOD_FINANCIAL_AUTO_SYNC_CONNECTIONS_PER_SCAN', 100, 1, 1000),
    });
    let scheduled = 0;
    for (const connection of connections) {
      const result = await this.enqueue(connection.tenantId, connection.id, 'scheduled', now);
      if (result.scheduled) scheduled += 1;
    }
    return { inspected: connections.length, scheduled };
  }

  async runConnection(job: Food99FinancialAutoSyncJob): Promise<{ skipped: boolean; recordsReceived: number }> {
    if (!this.enabled()) return { skipped: true, recordsReceived: 0 };
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: {
        id: job.connectionId,
        tenantId: job.tenantId,
        provider: MarketplaceProvider.FOOD_99,
        status: MarketplaceConnectionStatus.CONNECTED,
        externalStoreId: { not: null },
        tenant: { status: TenantStatus.active },
      },
      select: { id: true },
    });
    if (!connection) {
      this.log('99food_financial_auto_sync_skipped', job, { reason: 'ineligible_connection' });
      return { skipped: true, recordsReceived: 0 };
    }

    const now = new Date();
    const input = this.windowFor(job.trigger, now);
    const startedAt = Date.now();
    this.log('99food_financial_auto_sync_started', job, input);
    try {
      const result = await this.reconciliation.syncAutomatically(job.tenantId, {
        connectionId: job.connectionId,
        ...input,
      }, randomUUID());
      if (!result) {
        this.log('99food_financial_auto_sync_skipped', job, { ...input, reason: 'connection_sync_in_progress' });
        return { skipped: true, recordsReceived: 0 };
      }
      const recordsReceived = result.billEntriesReceived + result.settlementsReceived;
      this.log('99food_financial_auto_sync_completed', job, {
        ...input,
        recordsReceived,
        recordsPersisted: result.billEntriesCreated + result.settlementsCreated + result.settlementsUpdated,
        durationMs: Date.now() - startedAt,
      });
      return { skipped: false, recordsReceived };
    } catch (error) {
      this.log('99food_financial_auto_sync_failed', job, {
        ...input,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown_error',
      });
      throw error;
    }
  }

  private async enqueue(tenantId: string, connectionId: string, trigger: Food99FinancialAutoSyncTrigger, now: Date) {
    if (!this.queue) return { scheduled: false };
    const cadence = trigger === 'order_activity' ? this.hotCadenceMs() : this.reconciliationCadenceMs();
    const bucket = Math.floor(now.getTime() / cadence);
    await this.queue.add(FOOD99_FINANCIAL_AUTO_SYNC_CONNECTION_JOB, {
      schemaVersion: 1,
      tenantId,
      connectionId,
      trigger,
      scheduledAt: now.toISOString(),
    } satisfies Food99FinancialAutoSyncJob, {
      jobId: `food99-financial-${trigger}-${tenantId}-${connectionId}-${bucket}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
    return { scheduled: true };
  }

  private windowFor(trigger: Food99FinancialAutoSyncTrigger, now: Date) {
    const lookbackDays = trigger === 'order_activity'
      ? this.integerConfig('MARKETPLACE_99FOOD_FINANCIAL_HOT_LOOKBACK_DAYS', 3, 1, 31)
      : this.integerConfig('MARKETPLACE_99FOOD_FINANCIAL_RECONCILIATION_LOOKBACK_DAYS', 31, 1, 31);
    const endDate = utcDate(now);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (lookbackDays - 1)));
    return { startDate: utcDate(start), endDate };
  }

  private enabled(): boolean {
    return this.config.get<string>('MARKETPLACE_99FOOD_FINANCIAL_AUTO_SYNC_ENABLED') === 'true';
  }

  private hotCadenceMs(): number {
    return this.integerConfig('MARKETPLACE_99FOOD_FINANCIAL_HOT_SYNC_CADENCE_MS', 15 * 60_000, 5 * 60_000, 6 * 60 * 60_000);
  }

  private reconciliationCadenceMs(): number {
    return this.integerConfig('MARKETPLACE_99FOOD_FINANCIAL_RECONCILIATION_CADENCE_MS', 6 * 60 * 60_000, 60 * 60_000, 24 * 60 * 60_000);
  }

  private integerConfig(key: string, fallback: number, min: number, max: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
  }

  private log(message: string, job: Food99FinancialAutoSyncJob, data: Record<string, unknown>) {
    this.logger.debug({ message, trigger: job.trigger, connectionId: mask(job.connectionId), ...data });
  }
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mask(value: string): string {
  return value.length <= 8 ? '***' : `${value.slice(0, 4)}...${value.slice(-4)}`;
}
