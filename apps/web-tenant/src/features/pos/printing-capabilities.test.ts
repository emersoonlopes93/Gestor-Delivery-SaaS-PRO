import { describe, expect, it } from 'vitest';
import { detectPrintingPlatform, isPrinterDeviceCompatible, resolvePrintingCapabilities, selectCurrentPlatformPrinter } from './printing-capabilities';

describe('printing capability matrix', () => {
  it('only offers native Bluetooth in Android Capacitor', () => {
    expect(resolvePrintingCapabilities('android-capacitor')).toEqual({
      platform: 'android-capacitor', bluetooth: true, browserPrint: false, qz: false,
      directUsb: false, network: false, bridge: false,
    });
  });

  it('only offers system printing in mobile web', () => {
    expect(resolvePrintingCapabilities('mobile-web')).toMatchObject({
      bluetooth: false, browserPrint: true, qz: false, bridge: false,
    });
  });

  it('offers system printing and QZ-backed thermal printing on desktop', () => {
    expect(resolvePrintingCapabilities('desktop-web')).toMatchObject({
      bluetooth: false, browserPrint: true, qz: true, directUsb: false, network: false, bridge: false,
    });
  });

  it('does not turn a narrow desktop viewport into a mobile hardware platform', () => {
    expect(detectPrintingPlatform({ isNative: false, mobileUserAgent: false })).toBe('desktop-web');
  });
});

describe('current platform printer selection', () => {
  const bluetooth = { id: 'bt', name: 'Bluetooth Printer', connectionType: 'BLUETOOTH_SPP', isPrimary: true, isActive: true, autoPrintEnabled: true };
  const qz = { id: 'qz', name: 'Desktop QZ', connectionType: 'QZ_TRAY', isPrimary: true, isActive: true, autoPrintEnabled: true };

  it('does not promote a tenant-global Bluetooth printer to the desktop overview', () => {
    const desktop = resolvePrintingCapabilities('desktop-web');
    expect(isPrinterDeviceCompatible(bluetooth, desktop)).toBe(false);
    expect(selectCurrentPlatformPrinter([bluetooth], desktop)).toBeNull();
  });

  it('selects QZ instead of an incompatible Bluetooth primary on desktop', () => {
    expect(selectCurrentPlatformPrinter([bluetooth, qz], resolvePrintingCapabilities('desktop-web'))?.id).toBe('qz');
  });

  it('keeps Bluetooth exclusive to Android Capacitor', () => {
    expect(selectCurrentPlatformPrinter([bluetooth, qz], resolvePrintingCapabilities('android-capacitor'))?.id).toBe('bt');
    expect(selectCurrentPlatformPrinter([qz], resolvePrintingCapabilities('android-capacitor'))).toBeNull();
  });

  it('does not expose tenant hardware as current hardware on mobile web', () => {
    expect(selectCurrentPlatformPrinter([bluetooth, qz], resolvePrintingCapabilities('mobile-web'))).toBeNull();
  });
});
