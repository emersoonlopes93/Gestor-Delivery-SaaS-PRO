export type CoverageConfig = {
  id: string;
  tenantId: string;
  storeLat: number;
  storeLng: number;
  maxRadiusKm: string;
  defaultPricePerKm: string;
  minimumFee: string | null;
  maximumFee: string | null;
  defaultEstimatedDeliveryMinutes: number | null;
  isDeliveryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryZoneKind = 'blocked_zone' | 'custom_zone';
export type DeliveryPricingMode = 'fixed' | 'distance' | 'free' | 'tiers';
export type PolygonCoordinates = ReadonlyArray<readonly [number, number]>;

export type DeliveryRateDistanceTier = {
  id?: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  estimatedDeliveryMinutes: number;
};

export type DeliveryRateRule = {
  id: string;
  type: 'neighborhood' | 'distance' | 'fixed' | 'polygon';
  priority: number;
  isFallback: boolean;
  isActive: boolean;
  neighborhood: string | null;
  rate: string | null;
  minKm: string | null;
  maxKm: string | null;
  ratePerKm: string | null;
  fixedRate: string | null;
  geoJson: {
    type: string;
    properties?: {
      name?: string;
      color?: string;
    };
    geometry?: {
      type: string;
      coordinates: unknown;
    };
  } | null;
  polygonCoordinates: unknown[] | null;
  name: string | null;
  color: string | null;
  zoneKind: DeliveryZoneKind | null;
  pricingMode: DeliveryPricingMode | null;
  fixedFee: string | null;
  pricePerKm: string | null;
  estimatedDeliveryMinutes: number | null;
  blocksDelivery: boolean;
  distanceTiers?: Array<{
    id: string;
    minDistanceKm: string;
    maxDistanceKm: string;
    fee: string;
    estimatedDeliveryMinutes: number | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type TierDraft = {
  id?: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  estimatedDeliveryMinutes: number;
};

export type SpecialAreaDraft = {
  id: string | null;
  name: string;
  color: string;
  zoneKind: DeliveryZoneKind;
  pricingMode: DeliveryPricingMode;
  fixedFee: number | null;
  pricePerKm: number | null;
  estimatedDeliveryMinutes: number;
  polygonCoordinates: PolygonCoordinates | null;
};

export type DeliveryTestResult = {
  available: boolean;
  distanceKm: number | null;
  fee: number;
  estimatedDeliveryMinutes: number | null;
  appliedRule: string;
  reason?: string;
  matchedZoneId: string | null;
  matchedStrategy: string;
  resolvedCoordinates?: { lat: number; lng: number };
};
