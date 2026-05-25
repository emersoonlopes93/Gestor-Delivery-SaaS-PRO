import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminModulesController } from './admin-modules.controller';
import { AdminModulesService } from './admin-modules.service';

@Module({
  imports: [DatabaseModule],
  providers: [AdminModulesService],
  exports: [AdminModulesService],
})
export class AdminModulesModule {}
