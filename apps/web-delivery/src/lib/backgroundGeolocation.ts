import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location,
} from '@capacitor-community/background-geolocation';
import type { ForegroundPosition, StopForegroundGeolocation } from './foregroundGeolocation';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export const BACKGROUND_NOTIFICATION_TITLE = 'PedeHub • Entrega em andamento';
export const BACKGROUND_NOTIFICATION_MESSAGE =
  'Sua localização está sendo usada durante esta rota. Toque para abrir minha rota.';

export class BackgroundGeolocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundGeolocationError';
  }
}

function errorMessage(error: CallbackError): string {
  if (error.code === 'NOT_AUTHORIZED') {
    return 'Localização necessária. Ative a localização para iniciar esta rota. Ela é usada enquanto você estiver realizando as entregas.';
  }
  return error.message || 'Localização indisponível. Estamos tentando reconectar.';
}

export async function startBackgroundGeolocation(
  onPosition: (position: ForegroundPosition & { recordedAt?: string }) => void,
  onError: (message: string) => void,
): Promise<StopForegroundGeolocation> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('BackgroundGeolocation')) {
    throw new BackgroundGeolocationError('O acompanhamento em segundo plano está disponível somente no aplicativo Android.');
  }

  if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('LocalNotifications')) {
    const notificationPermission = await LocalNotifications.checkPermissions();
    if (notificationPermission.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  }

  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: BACKGROUND_NOTIFICATION_TITLE,
      backgroundMessage: BACKGROUND_NOTIFICATION_MESSAGE,
      requestPermissions: true,
      stale: false,
      distanceFilter: 20,
    },
    (location?: Location, error?: CallbackError) => {
      if (error) {
        onError(errorMessage(error));
        return;
      }
      if (!location) return;
      onPosition({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        ...(location.bearing !== null ? { heading: location.bearing } : {}),
        ...(location.speed !== null ? { speed: location.speed } : {}),
        ...(location.time !== null ? { recordedAt: new Date(location.time).toISOString() } : {}),
      });
    },
  );

  return async () => BackgroundGeolocation.removeWatcher({ id: watcherId });
}
