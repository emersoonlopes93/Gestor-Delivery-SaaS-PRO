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
import { CatalogModule } from '../catalog/catalog.module';
import { TenantActivationService } from './tenant-activation.service';

@Module({
  imports: [RbacModule, FeatureControlModule, CatalogModule],
  controllers: [TenantController, TenantUserController, BusinessGroupController],
  providers: [
    TenantService,
    TenantUserService,
    BusinessGroupService,
    OnboardingService,
    ReadinessScoreService,
    TenantActivationService,
  ],
  exports: [TenantService, TenantUserService, BusinessGroupService, OnboardingService, ReadinessScoreService, TenantActivationService],
})
export class TenantModule {}
