import { Module } from '@nestjs/common';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminRbacService } from './rbac/admin-rbac.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { AdminTenantsService } from './tenants/admin-tenants.service';
import { AdminModulesController } from './modules/admin-modules.controller';
import { AdminModulesService } from './modules/admin-modules.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminTenantsController, AdminModulesController],
  providers: [AdminAuthService, AdminRbacService, AdminTenantsService, AdminModulesService],
  exports: [AdminAuthService, AdminRbacService],
})
export class AdminModule {}
