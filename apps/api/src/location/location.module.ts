import { Module } from '@nestjs/common';
import { LocationProviderService } from './location-provider.service';

@Module({
  providers: [LocationProviderService],
  exports: [LocationProviderService],
})
export class LocationModule {}

