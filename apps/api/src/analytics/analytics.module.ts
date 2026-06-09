import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { BusinessInsightsService } from './business-insights.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, BusinessInsightsService],
  exports: [AnalyticsService, BusinessInsightsService],
})
export class AnalyticsModule {}
