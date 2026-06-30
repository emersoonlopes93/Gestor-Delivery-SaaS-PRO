import { Module, forwardRef } from '@nestjs/common';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminRbacService } from './rbac/admin-rbac.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { AdminTenantsService } from './tenants/admin-tenants.service';
import { AdminModulesController } from './modules/admin-modules.controller';
import { AdminGroupsController } from './groups/admin-groups.controller';
import { AdminGroupsService } from './groups/admin-groups.service';
import { AdminHealthController } from './health/admin-health.controller';
import { AdminHealthService } from './health/admin-health.service';
import { AdminAuditLogsController } from './audit-logs/admin-audit-logs.controller';
import { AdminAuditLogsService } from './audit-logs/admin-audit-logs.service';
import { AdminBillingController } from './billing/admin-billing.controller';

import { AsaasAdminController } from './billing/asaas-admin.controller';
import { AdminFranchiseController } from './franchise/admin-franchise.controller';
import { AdminFranchiseService } from './franchise/admin-franchise.service';
import { AdminIntegrationsController } from './integrations/admin-integrations.controller';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { SystemConfigService } from './services/system-config.service';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { UploadModule } from '../upload/upload.module';
import { AdminModulesModule } from './modules/admin-modules.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { AdminDebugAiAgentController } from '../ai-agent/controllers/admin-debug-ai-agent.controller';
import { AdminAiAgentController } from './ai-agent/admin-ai-agent.controller';
import { AiAgentPlanPresetService } from './ai-agent/ai-agent-plan-preset.service';
import { AdminBaseMediaController } from './base-media/admin-base-media.controller';
import { AdminBaseMediaService } from './base-media/admin-base-media.service';
import { AdminBaseMenuController } from './base-menu/admin-base-menu.controller';
import { AdminBaseMenuService } from './base-menu/admin-base-menu.service';
import { FeatureControlModule } from '../feature-control/feature-control.module';
import { AdminFeaturesController } from './features/admin-features.controller';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    UploadModule,
    AdminModulesModule,
    FeatureControlModule,
    forwardRef(() => AiAgentModule),
  ],
  controllers: [
    AdminAuthController,
    AdminTenantsController,
    AdminModulesController,
    AdminGroupsController,
    AdminHealthController,
    AdminAuditLogsController,
    AdminBillingController,
    AsaasAdminController,
    AdminFranchiseController,
    AdminIntegrationsController,
    AdminDashboardController,
    AdminDebugAiAgentController,
    AdminAiAgentController,
    AdminBaseMenuController,
    AdminBaseMediaController,
    AdminFeaturesController,
  ],
  providers: [
    AdminAuthService, 
    AdminRbacService, 
    AdminTenantsService, 
    AdminGroupsService, 
    AdminHealthService, 
    AdminAuditLogsService,
    AdminFranchiseService,
    SystemConfigService,
    AdminDashboardService,
    AiAgentPlanPresetService,
    AdminBaseMenuService,
    AdminBaseMediaService,
  ],
  exports: [AdminAuthService, AdminRbacService, AdminModulesModule],
})
export class AdminModule {}
