import { Module } from '@nestjs/common';
import { BillingDomainModule } from '../billing/billing-domain.module';
import { RbacModule } from '../rbac/rbac.module';
import { FeatureControlService } from './feature-control.service';

@Module({
  imports: [BillingDomainModule, RbacModule],
  providers: [FeatureControlService],
  exports: [FeatureControlService],
})
export class FeatureControlModule {}
