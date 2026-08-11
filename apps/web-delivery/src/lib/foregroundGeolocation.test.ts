import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: native.isNativePlatform,
    isPluginAvailable: native.isPluginAvailable,
  },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: native.checkPermissions,
    requestPermissions: native.requestPermissions,
    watchPosition: native.watchPosition,
    clearWatch: native.clearWatch,
  },
}));

import { ForegroundGeolocationError, startForegroundGeolocation } from './foregroundGeolocation';

describe('foreground geolocation adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
  });

  it('requests foreground permission and uses the native watcher on Android', async () => {
    native.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    native.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    native.watchPosition.mockImplementation(async (_options, callback) => {
      callback({ coords: { latitude: -23.5, longitude: -46.6 } }, undefined);
      return 'native-watch';
    });
    const onPosition = vi.fn();

    const stop = await startForegroundGeolocation(onPosition, vi.fn());
    await stop();

    expect(native.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] });
    expect(onPosition).toHaveBeenCalledWith({ latitude: -23.5, longitude: -46.6 });
    expect(native.clearWatch).toHaveBeenCalledWith({ id: 'native-watch' });
  });

  it('returns a human message when native foreground permission is denied', async () => {
    native.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
    native.requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });

    await expect(startForegroundGeolocation(vi.fn(), vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<ForegroundGeolocationError>>({
        message: expect.stringContaining('enquanto o app estiver em uso'),
      }),
    );
    expect(native.watchPosition).not.toHaveBeenCalled();
  });

  it('keeps browser geolocation as the web and PWA fallback', async () => {
    native.isNativePlatform.mockReturnValue(false);
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
      return 42;
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch },
    });
    const onPosition = vi.fn();

    const stop = await startForegroundGeolocation(onPosition, vi.fn());
    await stop();

    expect(onPosition).toHaveBeenCalledWith({ latitude: 1, longitude: 2 });
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
