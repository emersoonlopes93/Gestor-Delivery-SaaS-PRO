import { Injectable } from '@nestjs/common';
import type { GeocodingResult, NormalizedAddress } from '@gestor/types';
import { LocationProviderService } from '../location/location-provider.service';

@Injectable()
export class GeocodingService {
  constructor(private readonly locationProviderService: LocationProviderService) {}

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const result = await this.locationProviderService.geocodeAddress({
      formattedAddress: address,
      source: 'geocode',
    });

    if (!this.locationProviderService.validateCoordinates(result.lat, result.lng)) {
      return null;
    }

    return {
      lat: result.lat!,
      lng: result.lng!,
    };
  }

  async geocodeFreeform(query: string): Promise<{ lat: number; lng: number } | null> {
    return this.geocodeAddress(query);
  }

  async geocodeStructuredAddress(
    address: NormalizedAddress,
    source: 'geocode' | 'manual' | 'delivery_quote' = 'geocode',
  ): Promise<GeocodingResult> {
    return this.locationProviderService.geocodeAddress({
      ...address,
      source,
    });
  }
}

