import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { RbacModule } from '../rbac/rbac.module';
import { BusinessGroupService } from './business-group.service';
import { BusinessGroupController } from './business-group.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [RbacModule],
  controllers: [TenantController, BusinessGroupController],
  providers: [TenantService, BusinessGroupService, OnboardingService],
  exports: [TenantService, BusinessGroupService, OnboardingService],
})
export class TenantModule {}
