import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { DatabaseModule } from '../database/database.module';
import { AvailabilityService } from '../orders/availability.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [DatabaseModule, CatalogModule],
  controllers: [StorefrontController],
  providers: [StorefrontService, AvailabilityService],
})
export class StorefrontModule {}
