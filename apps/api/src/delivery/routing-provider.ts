export interface RoutingCoordinate { lat: number; lng: number }
export interface RoutingLeg { distanceMeters: number; durationSeconds: number }
export interface RoutingProviderResult {
  provider: string;
  geometry: RoutingCoordinate[];
  legs: RoutingLeg[];
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoutingProvider {
  route(origin: RoutingCoordinate, stops: RoutingCoordinate[]): Promise<RoutingProviderResult>;
}
