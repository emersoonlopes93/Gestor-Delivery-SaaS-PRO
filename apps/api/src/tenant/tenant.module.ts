import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantUserService } from './tenant-user.service';
import { TenantController } from './tenant.controller';
import { TenantUserController } from './tenant-user.controller';
import { RbacModule } from '../rbac/rbac.module';
import { BusinessGroupService } from './business-group.service';
import { BusinessGroupController } from './business-group.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [RbacModule],
  controllers: [TenantController, TenantUserController, BusinessGroupController],
  providers: [
    TenantService,
    TenantUserService,
    BusinessGroupService,
    OnboardingService,
  ],
  exports: [TenantService, TenantUserService, BusinessGroupService, OnboardingService],
})
export class TenantModule {}
