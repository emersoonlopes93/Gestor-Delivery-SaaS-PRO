import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type {
  GeocodingResult,
  LocationLookupSource,
  LocationProvider,
  NormalizedAddress,
} from '@gestor/types';

interface CoordinatePair {
  lat: number;
  lng: number;
}

interface GeocodeAddressInput extends NormalizedAddress {
  source: LocationLookupSource;
}

const SENTINEL_COORDINATE: CoordinatePair = {
  lat: -23.55052,
  lng: -46.633308,
};

@Injectable()
export class LocationProviderService {
  private readonly logger = new Logger(LocationProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  private getPrimaryGeocodingProvider(): 'google' | 'nominatim' | 'disabled' {
    const configured = this.configService
      .get<string>('LOCATION_GEOCODING_PROVIDER')
      ?.trim()
      .toLowerCase();

    if (configured === 'nominatim') return 'nominatim';
    if (configured === 'disabled') return 'disabled';
    return 'google';
  }

  private getGeocodingFallbackProvider(): 'nominatim' | 'none' {
    const configured = this.configService
      .get<string>('LOCATION_GEOCODING_FALLBACK')
      ?.trim()
      .toLowerCase();

    if (configured === 'nominatim') return 'nominatim';
    return 'none';
  }

  private allowNominatimFallback(): boolean {
    return this.configService.get<string>('LOCATION_ALLOW_NOMINATIM_FALLBACK') === 'true';
  }

  private getPostalCodeProvider(): 'viacep' | 'disabled' {
    const configured = this.configService
      .get<string>('LOCATION_POSTAL_CODE_PROVIDER')
      ?.trim()
      .toLowerCase();

    if (configured === 'disabled') return 'disabled';
    return 'viacep';
  }

  private getGoogleMapsKey(): string | null {
    const backendKey = this.configService.get<string>('GOOGLE_MAPS_KEY')?.trim();
    if (backendKey) return backendKey;

    const legacyFrontendKey = this.configService.get<string>('VITE_GOOGLE_MAPS_KEY')?.trim();
    if (legacyFrontendKey) {
      this.logger.warn('location_provider_legacy_google_key_fallback source=VITE_GOOGLE_MAPS_KEY');
      return legacyFrontendKey;
    }

    return null;
  }

  private buildFormattedAddress(address: NormalizedAddress): string {
    const baseParts = [
      [address.street, address.number].filter(Boolean).join(', ').trim(),
      address.neighborhood?.trim(),
      [address.city?.trim(), address.state?.trim()].filter(Boolean).join(' - ').trim(),
      address.postalCode?.trim(),
      address.country?.trim() || 'Brasil',
    ].filter((part) => Boolean(part && part.length > 0));

    return address.formattedAddress?.trim() || baseParts.join(', ');
  }

  private normalizeAddress(input: Partial<NormalizedAddress>): NormalizedAddress {
    const postalCode = input.postalCode?.replace(/\D/g, '') || undefined;
    const street = input.street?.trim() || undefined;
    const number = input.number?.trim() || undefined;
    const complement = input.complement?.trim() || undefined;
    const neighborhood = input.neighborhood?.trim() || undefined;
    const city = input.city?.trim() || undefined;
    const state = input.state?.trim() || undefined;
    const country = input.country?.trim() || 'Brasil';
    const formattedAddress = input.formattedAddress?.trim() || undefined;

    return {
      postalCode,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      country,
      formattedAddress,
    };
  }

  private parseGoogleAddressComponents(raw: unknown): NormalizedAddress {
    if (!Array.isArray(raw)) return {};

    const components = raw.filter((item) => item && typeof item === 'object') as Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;

    const getComponent = (type: string, short = false): string | undefined => {
      const component = components.find((item) => item.types?.includes(type));
      const value = short ? component?.short_name : component?.long_name;
      return value?.trim() || undefined;
    };

    return {
      street: getComponent('route'),
      number: getComponent('street_number'),
      neighborhood: getComponent('sublocality_level_1') || getComponent('neighborhood'),
      city: getComponent('administrative_area_level_2') || getComponent('locality'),
      state: getComponent('administrative_area_level_1', true),
      postalCode: getComponent('postal_code')?.replace(/\D/g, ''),
      country: getComponent('country'),
    };
  }

  private buildResult(input: {
    provider: LocationProvider;
    source: LocationLookupSource;
    address: NormalizedAddress;
    lat?: number;
    lng?: number;
    confidence?: number;
    raw?: unknown;
  }): GeocodingResult {
    const lat = typeof input.lat === 'number' ? input.lat : undefined;
    const lng = typeof input.lng === 'number' ? input.lng : undefined;

    return {
      provider: input.provider,
      source: input.source,
      address: input.address,
      ...(lat !== undefined ? { lat } : {}),
      ...(lng !== undefined ? { lng } : {}),
      ...(typeof input.confidence === 'number' ? { confidence: input.confidence } : {}),
      ...(input.raw !== undefined ? { raw: input.raw } : {}),
    };
  }

  private async geocodeWithGoogle(address: NormalizedAddress, source: LocationLookupSource): Promise<GeocodingResult | null> {
    const apiKey = this.getGoogleMapsKey();
    if (!apiKey) {
      this.logger.warn(`location_geocode_skipped provider=google source=${source} reason=no_google_maps_key`);
      return null;
    }

    const query = this.buildFormattedAddress(address);
    if (!query) {
      return this.buildResult({
        provider: 'google',
        source,
        address,
        confidence: 0,
      });
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: query,
          key: apiKey,
          components: 'country:BR',
        },
      });

      if (response.data.status === 'OK' && Array.isArray(response.data.results) && response.data.results.length > 0) {
        const firstResult = response.data.results[0];
        const location = firstResult?.geometry?.location;
        const parsed = this.parseGoogleAddressComponents(firstResult?.address_components);
        const mergedAddress = this.normalizeAddress({
          ...address,
          ...parsed,
          formattedAddress: typeof firstResult?.formatted_address === 'string'
            ? firstResult.formatted_address
            : this.buildFormattedAddress(address),
        });

        this.logger.log(`location_geocode_success provider=google source=${source}`);
        return this.buildResult({
          provider: 'google',
          source,
          address: mergedAddress,
          lat: typeof location?.lat === 'number' ? location.lat : undefined,
          lng: typeof location?.lng === 'number' ? location.lng : undefined,
          confidence: 1,
          raw: {
            formattedAddress: firstResult?.formatted_address,
            status: response.data.status,
          },
        });
      }

      this.logger.warn(`location_geocode_no_results provider=google source=${source} status=${response.data.status}`);
      return this.buildResult({
        provider: 'google',
        source,
        address,
        confidence: 0,
        raw: {
          status: response.data.status,
        },
      });
    } catch (error) {
      this.logger.warn(
        `location_geocode_failed provider=google source=${source} reason=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private async geocodeWithNominatim(address: NormalizedAddress, source: LocationLookupSource): Promise<GeocodingResult | null> {
    const query = this.buildFormattedAddress(address);
    if (!query) {
      return this.buildResult({
        provider: 'nominatim',
        source,
        address,
        confidence: 0,
      });
    }

    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          format: 'json',
          limit: 1,
          q: query,
        },
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'PedeHub-API',
        },
      });

      const firstResult = Array.isArray(response.data) ? response.data[0] : null;
      if (!firstResult) {
        this.logger.warn(`location_geocode_no_results provider=nominatim source=${source}`);
        return this.buildResult({
          provider: 'nominatim',
          source,
          address,
          confidence: 0,
        });
      }

      this.logger.log(`location_geocode_success provider=nominatim source=${source}`);
      return this.buildResult({
        provider: 'nominatim',
        source,
        address: this.normalizeAddress({
          ...address,
          formattedAddress: typeof firstResult.display_name === 'string'
            ? firstResult.display_name
            : this.buildFormattedAddress(address),
        }),
        lat: Number(firstResult.lat),
        lng: Number(firstResult.lon),
        confidence: 0.55,
        raw: {
          displayName: firstResult.display_name,
        },
      });
    } catch (error) {
      this.logger.warn(
        `location_geocode_failed provider=nominatim source=${source} reason=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  validateCoordinates(lat?: number | null, lng?: number | null): boolean {
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < -90 || lat > 90) return false;
    if (lng < -180 || lng > 180) return false;
    if (lat === 0 && lng === 0) return false;
    if (Math.abs(lat - SENTINEL_COORDINATE.lat) < 0.00001 && Math.abs(lng - SENTINEL_COORDINATE.lng) < 0.00001) {
      return false;
    }
    return true;
  }

  calculateHaversineDistanceKm(origin: CoordinatePair, destination: CoordinatePair): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(destination.lat - origin.lat);
    const dLng = toRad(destination.lng - origin.lng);
    const lat1 = toRad(origin.lat);
    const lat2 = toRad(destination.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return earthRadiusKm * c;
  }

  async lookupPostalCode(postalCode: string): Promise<GeocodingResult> {
    const cleanPostalCode = postalCode.replace(/\D/g, '');
    const provider = this.getPostalCodeProvider();

    if (provider === 'disabled') {
      this.logger.warn('location_postal_lookup_skipped provider=disabled source=cep');
      return this.buildResult({
        provider: 'manual',
        source: 'cep',
        address: { postalCode: cleanPostalCode || undefined },
        confidence: 0,
      });
    }

    if (cleanPostalCode.length !== 8) {
      return this.buildResult({
        provider: 'viacep',
        source: 'cep',
        address: { postalCode: cleanPostalCode || undefined },
        confidence: 0,
      });
    }

    try {
      const response = await axios.get(`https://viacep.com.br/ws/${cleanPostalCode}/json/`);
      if (response.data?.erro) {
        this.logger.warn('location_postal_lookup_no_results provider=viacep source=cep');
        return this.buildResult({
          provider: 'viacep',
          source: 'cep',
          address: { postalCode: cleanPostalCode },
          confidence: 0,
        });
      }

      this.logger.log('location_postal_lookup_success provider=viacep source=cep');
      return this.buildResult({
        provider: 'viacep',
        source: 'cep',
        address: this.normalizeAddress({
          postalCode: cleanPostalCode,
          street: response.data?.logradouro,
          neighborhood: response.data?.bairro,
          city: response.data?.localidade,
          state: response.data?.uf,
          complement: response.data?.complemento,
          country: 'Brasil',
        }),
        confidence: 0.8,
        raw: {
          ibge: response.data?.ibge,
        },
      });
    } catch (error) {
      this.logger.warn(
        `location_postal_lookup_failed provider=viacep source=cep reason=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.buildResult({
        provider: 'viacep',
        source: 'cep',
        address: { postalCode: cleanPostalCode },
        confidence: 0,
      });
    }
  }

  async geocodeAddress(input: GeocodeAddressInput): Promise<GeocodingResult> {
    const address = this.normalizeAddress(input);
    const source = input.source;
    const primaryProvider = this.getPrimaryGeocodingProvider();

    if (primaryProvider === 'disabled') {
      this.logger.warn(`location_geocode_skipped provider=disabled source=${source}`);
      return this.buildResult({
        provider: 'manual',
        source,
        address,
        confidence: 0,
      });
    }

    const primaryResult = primaryProvider === 'nominatim'
      ? await this.geocodeWithNominatim(address, source)
      : await this.geocodeWithGoogle(address, source);

    if (primaryResult && this.validateCoordinates(primaryResult.lat, primaryResult.lng)) {
      return primaryResult;
    }

    const fallbackProvider = this.getGeocodingFallbackProvider();
    const canUseNominatimFallback =
      this.allowNominatimFallback() &&
      fallbackProvider === 'nominatim' &&
      primaryProvider !== 'nominatim';

    if (!canUseNominatimFallback) {
      if (primaryResult) return primaryResult;

      return this.buildResult({
        provider: primaryProvider === 'google' ? 'google' : 'nominatim',
        source,
        address,
        confidence: 0,
      });
    }

    this.logger.warn(`location_geocode_fallback provider=nominatim source=${source}`);
    const fallbackResult = await this.geocodeWithNominatim(address, source);
    if (fallbackResult && this.validateCoordinates(fallbackResult.lat, fallbackResult.lng)) {
      return fallbackResult;
    }

    return fallbackResult || primaryResult || this.buildResult({
      provider: 'nominatim',
      source,
      address,
      confidence: 0,
    });
  }
}
