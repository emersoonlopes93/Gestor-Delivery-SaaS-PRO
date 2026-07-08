export type LocationProvider =
  | 'google'
  | 'viacep'
  | 'nominatim'
  | 'haversine'
  | 'manual';

export type LocationLookupSource =
  | 'cep'
  | 'autocomplete'
  | 'manual'
  | 'geocode'
  | 'delivery_quote'
  | 'onboarding'
  | 'settings'
  | 'checkout'
  | 'ai_agent';

export interface NormalizedAddress {
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  formattedAddress?: string;
}

export interface GeocodingResult {
  provider: LocationProvider;
  source: LocationLookupSource;
  address: NormalizedAddress;
  lat?: number;
  lng?: number;
  confidence?: number;
  raw?: unknown;
}
