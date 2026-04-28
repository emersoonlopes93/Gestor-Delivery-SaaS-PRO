import { Module } from '@nestjs/common';
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
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminTenantsController, AdminModulesController, AdminGroupsController, AdminHealthController, AdminAuditLogsController],
  providers: [AdminAuthService, AdminRbacService, AdminTenantsService, AdminModulesService, AdminGroupsService, AdminHealthService, AdminAuditLogsService],
  exports: [AdminAuthService, AdminRbacService],
})
export class AdminModule {}
