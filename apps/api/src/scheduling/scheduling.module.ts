import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingGeneratorService } from './scheduling-generator.service';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingGeneratorService],
  exports: [SchedulingService, SchedulingGeneratorService],
})
export class SchedulingModule {}
