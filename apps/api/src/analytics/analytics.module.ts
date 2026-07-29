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

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, forwardRef(() => CrmModule), forwardRef(() => CampaignsModule)],
  controllers: [AnalyticsController, AnalyticsIngestionController],
  providers: [AnalyticsService, BusinessInsightsService, BusinessIntelligenceService, AnalyticsIngestionService, AuthoritativeOrderAnalyticsService],
  exports: [AnalyticsService, BusinessInsightsService, BusinessIntelligenceService, AuthoritativeOrderAnalyticsService],
})
export class AnalyticsModule {}
