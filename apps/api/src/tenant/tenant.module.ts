import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantUserService } from './tenant-user.service';
import { TenantController } from './tenant.controller';
import { TenantUserController } from './tenant-user.controller';
import { RbacModule } from '../rbac/rbac.module';
import { BusinessGroupService } from './business-group.service';
import { BusinessGroupController } from './business-group.controller';
import { OnboardingService } from './onboarding.service';
import { ReadinessScoreService } from './readiness-score.service';
import { FeatureControlModule } from '../feature-control/feature-control.module';

@Module({
  imports: [RbacModule, FeatureControlModule],
  controllers: [TenantController, TenantUserController, BusinessGroupController],
  providers: [
    TenantService,
    TenantUserService,
    BusinessGroupService,
    OnboardingService,
    ReadinessScoreService,
  ],
  exports: [TenantService, TenantUserService, BusinessGroupService, OnboardingService, ReadinessScoreService],
})
export class TenantModule {}
