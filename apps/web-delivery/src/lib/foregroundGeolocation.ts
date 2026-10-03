import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface ForegroundPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

export type StopForegroundGeolocation = () => Promise<void>;

export class ForegroundGeolocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForegroundGeolocationError';
  }
}

const LOCATION_PERMISSION_MESSAGE =
  'Localização necessária. Permita o acesso à localização para acompanhar suas entregas enquanto o app estiver em uso.';

export async function startForegroundGeolocation(
  onPosition: (position: ForegroundPosition) => void,
  onError: (message: string) => void,
): Promise<StopForegroundGeolocation> {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('Geolocation')) {
      throw new ForegroundGeolocationError('Localização indisponível neste dispositivo.');
    }

    const current = await Geolocation.checkPermissions();
    const permission = current.location === 'granted'
      ? current
      : await Geolocation.requestPermissions({ permissions: ['location'] });

    if (permission.location !== 'granted') {
      throw new ForegroundGeolocationError(LOCATION_PERMISSION_MESSAGE);
    }

    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 5_000 },
      (position, error) => {
        if (error) {
          onError(error.message || 'Não foi possível obter sua localização.');
          return;
        }
        if (!position) return;
        onPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ...(position.coords.heading !== null ? { heading: position.coords.heading } : {}),
          ...(position.coords.speed !== null ? { speed: position.coords.speed } : {}),
        });
      },
    );

    return async () => Geolocation.clearWatch({ id: watchId });
  }

  if (!navigator.geolocation) {
    throw new ForegroundGeolocationError('Geolocalização não é suportada neste dispositivo.');
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => onPosition({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      ...(position.coords.heading !== null ? { heading: position.coords.heading } : {}),
      ...(position.coords.speed !== null ? { speed: position.coords.speed } : {}),
    }),
    (error) => onError(error.message),
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 5_000 },
  );

  return async () => navigator.geolocation.clearWatch(watchId);
}
