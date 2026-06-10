import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CrmSegmentationService } from './crm-segmentation.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { CustomerProfileController } from './customer-profile.controller';
import { PromotionsModule } from '../promotions/promotions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { CrmEnterpriseController } from './crm-enterprise.controller';
import { CrmEnterpriseService } from './crm-enterprise.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, PromotionsModule, forwardRef(() => AnalyticsModule), forwardRef(() => CampaignsModule)],
  controllers: [CustomerController, CustomerProfileController, CrmEnterpriseController],
  providers: [CustomerService, CrmSegmentationService, CustomerIntelligenceService, CrmEnterpriseService],
  exports: [CustomerService, CrmSegmentationService, CustomerIntelligenceService, CrmEnterpriseService],
})
export class CrmModule {}
