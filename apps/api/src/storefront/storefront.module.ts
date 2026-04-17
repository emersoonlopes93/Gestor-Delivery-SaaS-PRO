import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { DatabaseModule } from '../database/database.module';
import { AvailabilityService } from '../orders/availability.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StorefrontController],
  providers: [StorefrontService, AvailabilityService],
})
export class StorefrontModule {}
