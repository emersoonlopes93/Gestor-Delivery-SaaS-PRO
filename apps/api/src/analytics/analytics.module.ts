import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { BusinessInsightsService } from './business-insights.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CrmModule } from '../crm/crm.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { AnalyticsIngestionController } from './analytics-ingestion.controller';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { AuthoritativeOrderAnalyticsService } from './authoritative-order-analytics.service';
import { BullModule } from '@nestjs/bullmq';
import { ANALYTICS_ROLLUP_QUEUE } from '@gestor/types';
import { AnalyticsRollupService } from './analytics-rollup.service';
import { AnalyticsRollupProcessor } from './analytics-rollup.processor';
import {
  AnalyticsRollupQueueService,
  AnalyticsRollupSchedulerService,
} from './analytics-rollup.queue.service';
import { isAnalyticsRollupQueueEnabled } from './analytics-rollup.config';
import { AnalyticsRetentionService } from './analytics-retention.service';

const enableAnalyticsRollupQueue = isAnalyticsRollupQueueEnabled();

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    forwardRef(() => CrmModule),
    forwardRef(() => CampaignsModule),
    ...(enableAnalyticsRollupQueue
      ? [
          BullModule.registerQueue({
            name: ANALYTICS_ROLLUP_QUEUE,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5_000 },
              removeOnComplete: true,
              removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
            },
          }),
        ]
      : []),
  ],
  controllers: [AnalyticsController, AnalyticsIngestionController],
  providers: [
    AnalyticsService,
    BusinessInsightsService,
    BusinessIntelligenceService,
    AnalyticsIngestionService,
    AuthoritativeOrderAnalyticsService,
    AnalyticsRollupService,
    AnalyticsRetentionService,
    ...(enableAnalyticsRollupQueue
      ? [AnalyticsRollupQueueService, AnalyticsRollupSchedulerService, AnalyticsRollupProcessor]
      : []),
  ],
  exports: [
    AnalyticsService,
    BusinessInsightsService,
    BusinessIntelligenceService,
    AuthoritativeOrderAnalyticsService,
    AnalyticsRollupService,
    AnalyticsRetentionService,
    ...(enableAnalyticsRollupQueue ? [AnalyticsRollupQueueService] : []),
  ],
})
export class AnalyticsModule {}
