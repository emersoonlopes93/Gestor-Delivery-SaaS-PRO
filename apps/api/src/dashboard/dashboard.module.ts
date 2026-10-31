import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { DashboardOperationalController } from './dashboard-operational.controller';
import { DashboardOperationalService } from './dashboard-operational.service';

@Module({
  imports: [AuthModule, DatabaseModule, RbacModule],
  controllers: [DashboardOperationalController],
  providers: [DashboardOperationalService],
})
export class DashboardModule {}
