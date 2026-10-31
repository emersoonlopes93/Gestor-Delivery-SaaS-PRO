import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const RETENTION_DAYS = 30;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 1_000;

@Injectable()
export class DeliveryLocationRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryLocationRetentionService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.DELIVERY_LOCATION_RETENTION_ENABLED === 'false') return;
    void this.purgeExpiredLocations().catch((error: unknown) => {
      this.logger.error(
        'Initial delivery location retention failed.',
        error instanceof Error ? error.stack : String(error),
      );
    });
    this.interval = setInterval(() => {
      void this.purgeExpiredLocations().catch((error: unknown) => {
        this.logger.error(
          'Periodic delivery location retention failed.',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, RETENTION_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async purgeExpiredLocations(
    now = new Date(),
    batchSize = DEFAULT_BATCH_SIZE,
  ): Promise<number> {
    const safeBatchSize = Math.max(1, Math.min(batchSize, 5_000));
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let deleted = 0;

    for (const tenant of tenants) {
      let batch: Array<{ id: string }>;
      do {
        batch = await this.prisma.deliveryDriverLocation.findMany({
          where: { tenantId: tenant.id, recordedAt: { lt: cutoff } },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
          take: safeBatchSize,
          select: { id: true },
        });
        if (batch.length === 0) continue;
        const result = await this.prisma.deliveryDriverLocation.deleteMany({
          where: { tenantId: tenant.id, id: { in: batch.map((point) => point.id) } },
        });
        deleted += result.count;
      } while (batch.length === safeBatchSize);
    }

    if (deleted > 0) this.logger.log(`Expired delivery location samples removed: ${deleted}.`);
    return deleted;
  }
}
