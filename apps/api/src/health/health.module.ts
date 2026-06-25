import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TenantHealthService } from './tenant-health.service';
import { HealthService } from './health.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    DatabaseModule,
  ],
  controllers: [HealthController],
  providers: [TenantHealthService, HealthService],
  exports: [HealthService],
})
export class HealthModule {}
