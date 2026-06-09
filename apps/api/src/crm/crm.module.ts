import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CrmSegmentationService } from './crm-segmentation.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { CustomerProfileController } from './customer-profile.controller';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, PromotionsModule],
  controllers: [CustomerController, CustomerProfileController],
  providers: [CustomerService, CrmSegmentationService, CustomerIntelligenceService],
  exports: [CustomerService, CrmSegmentationService, CustomerIntelligenceService],
})
export class CrmModule {}
