import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger('GeocodingService');

  private getApiKey(): string | null {
    return process.env.GOOGLE_MAPS_KEY || process.env.VITE_GOOGLE_MAPS_KEY || null;
  }

  private async geocodeQuery(query: string): Promise<{ lat: number; lng: number } | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('geocoding_skipped reason=no_google_maps_key');
      return null;
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: query,
          key: apiKey,
          components: 'country:BR',
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        this.logger.log(`geocoding_success address="${query}"`);
        return { lat: location.lat, lng: location.lng };
      }

      this.logger.warn(`geocoding_no_results address="${query}" status=${response.data.status}`);
      return null;
    } catch (error) {
      this.logger.warn(`geocoding_failed address="${query}" error=${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    return this.geocodeQuery(address);
  }

  async geocodeFreeform(query: string): Promise<{ lat: number; lng: number } | null> {
    return this.geocodeQuery(query);
  }
}
