import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_RETENTION_BATCH_SIZE = 1_000;
const MAX_RETENTION_BATCH_SIZE = 5_000;

@Injectable()
export class AnalyticsRetentionService {
  private readonly logger = new Logger(AnalyticsRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purgeTenantRawEvents(input: {
    tenantId: string;
    olderThan: Date;
    batchSize?: number;
  }): Promise<{ deleted: number }> {
    if (process.env.ANALYTICS_RAW_RETENTION_ENABLED !== 'true') {
      throw new Error('analytics_retention_disabled');
    }
    if (!input.tenantId || Number.isNaN(input.olderThan.getTime())) {
      throw new Error('analytics_retention_invalid_input');
    }
    const batchSize = input.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_RETENTION_BATCH_SIZE) {
      throw new Error('analytics_retention_invalid_batch_size');
    }

    let deleted = 0;
    while (true) {
      const batch = await this.prisma.analyticsEvent.findMany({
        where: { tenantId: input.tenantId, receivedAt: { lt: input.olderThan } },
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
        take: batchSize,
        select: { id: true },
      });
      if (batch.length === 0) break;
      const result = await this.prisma.analyticsEvent.deleteMany({
        where: { tenantId: input.tenantId, id: { in: batch.map((event) => event.id) } },
      });
      deleted += result.count;
      if (batch.length < batchSize) break;
    }
    this.logger.log(
      `analytics_retention_complete tenantId=${input.tenantId}`
      + ` olderThan=${input.olderThan.toISOString()} deleted=${deleted}`,
    );
    return { deleted };
  }
}
