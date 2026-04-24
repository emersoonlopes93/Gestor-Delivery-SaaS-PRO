import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { DatabaseModule } from '../database/database.module';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { CatalogModule } from '../catalog/catalog.module';

import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
  imports: [DatabaseModule, CatalogModule, SchedulingModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
