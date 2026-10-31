import type { DeliveryStopDTO } from '@gestor/types';

export type RouteCoordinate = { lat: number; lng: number };
export type NavigationProvider = 'google' | 'waze' | 'system';

function finiteCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function coordinatesFromAddress(
  address: Record<string, unknown> | null,
): RouteCoordinate | null {
  if (!address) return null;
  const lat = finiteCoordinate(address.lat ?? address.latitude);
  const lng = finiteCoordinate(address.lng ?? address.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

export function navigationUrl(
  provider: NavigationProvider,
  destination: RouteCoordinate,
  label: string,
  nativePlatform: boolean,
): string {
  const point = `${destination.lat},${destination.lng}`;
  if (provider === 'google') {
    return nativePlatform
      ? `google.navigation:q=${encodeURIComponent(point)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}`;
  }
  if (provider === 'waze') {
    return nativePlatform
      ? `waze://?ll=${encodeURIComponent(point)}&navigate=yes`
      : `https://www.waze.com/ul?ll=${encodeURIComponent(point)}&navigate=yes`;
  }
  return nativePlatform
    ? `geo:${point}?q=${encodeURIComponent(`${point} (${label})`)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`;
}

export function geocodedStops(stops: DeliveryStopDTO[]) {
  return stops.flatMap((stop) => {
    const position = coordinatesFromAddress(stop.address);
    return position ? [{ stop, position }] : [];
  });
}
