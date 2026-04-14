export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const R = 6371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function estimateDeliveryTime(distanceMeters: number): number {
  const averageSpeedMetersPerSecond = 6.94;
  const baseSeconds = distanceMeters / averageSpeedMetersPerSecond;
  const bufferSeconds = 5 * 60;
  return Math.max(1, Math.round(baseSeconds + bufferSeconds));
}
