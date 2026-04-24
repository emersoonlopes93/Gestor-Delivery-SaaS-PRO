import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TenantHealthService } from './tenant-health.service';

@Module({
  controllers: [HealthController],
  providers: [TenantHealthService],
})
export class HealthModule {}
