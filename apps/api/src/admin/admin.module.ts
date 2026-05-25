import { Module, forwardRef } from '@nestjs/common';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminRbacService } from './rbac/admin-rbac.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { AdminTenantsService } from './tenants/admin-tenants.service';
import { AdminModulesController } from './modules/admin-modules.controller';
import { AdminModulesService } from './modules/admin-modules.service';
import { AdminGroupsController } from './groups/admin-groups.controller';
import { AdminGroupsService } from './groups/admin-groups.service';
import { AdminHealthController } from './health/admin-health.controller';
import { AdminHealthService } from './health/admin-health.service';
import { AdminAuditLogsController } from './audit-logs/admin-audit-logs.controller';
import { AdminAuditLogsService } from './audit-logs/admin-audit-logs.service';
import { AdminBillingController } from './billing/admin-billing.controller';
import { AdminFranchiseController } from './franchise/admin-franchise.controller';
import { AdminFranchiseService } from './franchise/admin-franchise.service';
import { AdminIntegrationsController } from './integrations/admin-integrations.controller';
import { SystemConfigService } from './services/system-config.service';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AdminModulesModule } from './modules/admin-modules.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { AdminDebugAiAgentController } from '../ai-agent/controllers/admin-debug-ai-agent.controller';

@Module({
  imports: [
    AuthModule, 
    BillingModule,
    AdminModulesModule,
  ],
  controllers: [
    AdminAuthController, 
    AdminTenantsController, 
    AdminModulesController, 
    AdminGroupsController, 
    AdminHealthController, 
    AdminAuditLogsController,
    AdminBillingController,
    AdminFranchiseController,
    AdminIntegrationsController,
    AdminDebugAiAgentController,
  ],
  providers: [
    AdminAuthService, 
    AdminRbacService, 
    AdminTenantsService, 
    AdminGroupsService, 
    AdminHealthService, 
    AdminAuditLogsService,
    AdminFranchiseService,
    SystemConfigService
  ],
  exports: [AdminAuthService, AdminRbacService, AdminModulesModule],
})
export class AdminModule {}
