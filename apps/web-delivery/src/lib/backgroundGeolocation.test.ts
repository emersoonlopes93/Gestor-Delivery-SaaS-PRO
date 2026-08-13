import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  native: true,
  available: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    isPluginAvailable: () => mocks.available,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({ addWatcher: mocks.addWatcher, removeWatcher: mocks.removeWatcher }),
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
  },
}));

import {
  BACKGROUND_NOTIFICATION_MESSAGE,
  BACKGROUND_NOTIFICATION_TITLE,
  startBackgroundGeolocation,
} from './backgroundGeolocation';

describe('background geolocation adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.native = true;
    mocks.available = true;
    mocks.checkPermissions.mockResolvedValue({ display: 'granted' });
    mocks.addWatcher.mockResolvedValue('watch-1');
    mocks.removeWatcher.mockResolvedValue(undefined);
  });

  it('starts the native foreground service with the visible route notice and stops it', async () => {
    const stop = await startBackgroundGeolocation(vi.fn(), vi.fn());
    expect(mocks.addWatcher).toHaveBeenCalledWith(expect.objectContaining({
      backgroundTitle: BACKGROUND_NOTIFICATION_TITLE,
      backgroundMessage: BACKGROUND_NOTIFICATION_MESSAGE,
      distanceFilter: 20,
      stale: false,
    }), expect.any(Function));
    await stop();
    expect(mocks.removeWatcher).toHaveBeenCalledWith({ id: 'watch-1' });
  });

  it('preserves the native device timestamp and labels quality data', async () => {
    const onPosition = vi.fn();
    await startBackgroundGeolocation(onPosition, vi.fn());
    const callback = mocks.addWatcher.mock.calls[0][1];
    callback({ latitude: -23, longitude: -46, accuracy: 8, bearing: 90, speed: 4, time: 1_723_000_000_000 });
    expect(onPosition).toHaveBeenCalledWith(expect.objectContaining({
      latitude: -23,
      longitude: -46,
      heading: 90,
      recordedAt: new Date(1_723_000_000_000).toISOString(),
    }));
  });

  it('does not pretend background support in the browser', async () => {
    mocks.native = false;
    await expect(startBackgroundGeolocation(vi.fn(), vi.fn())).rejects.toThrow('somente no aplicativo Android');
    expect(mocks.addWatcher).not.toHaveBeenCalled();
  });
});
