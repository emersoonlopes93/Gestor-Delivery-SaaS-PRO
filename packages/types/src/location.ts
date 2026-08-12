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

export type LocationFreshness = 'fresh' | 'stale' | 'unavailable';

export interface LocationFreshnessResult {
  status: LocationFreshness;
  ageSeconds: number | null;
  label: string;
}

export function getLocationFreshness(
  lastLocationAt: string | Date | null | undefined,
  now = new Date(),
  staleAfterSeconds = 90,
): LocationFreshnessResult {
  if (!lastLocationAt) {
    return { status: 'unavailable', ageSeconds: null, label: 'Localização temporariamente indisponível' };
  }
  const timestamp = lastLocationAt instanceof Date ? lastLocationAt : new Date(lastLocationAt);
  if (Number.isNaN(timestamp.getTime())) {
    return { status: 'unavailable', ageSeconds: null, label: 'Localização temporariamente indisponível' };
  }
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1_000));
  if (ageSeconds <= staleAfterSeconds) {
    return { status: 'fresh', ageSeconds, label: ageSeconds < 30 ? 'Atualizado agora' : `Localização há ${Math.max(1, Math.floor(ageSeconds / 60))} min` };
  }
  return {
    status: 'stale',
    ageSeconds,
    label: `Última localização há ${Math.max(1, Math.floor(ageSeconds / 60))} min`,
  };
}
