import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminModulesController } from './admin-modules.controller';
import { AdminModulesService } from './admin-modules.service';
import { BillingModule } from '../../billing/billing.module';

@Module({
  imports: [DatabaseModule, BillingModule],
  providers: [AdminModulesService],
  exports: [AdminModulesService],
})
export class AdminModulesModule {}
