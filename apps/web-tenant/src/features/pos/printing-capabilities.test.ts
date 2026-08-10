import { describe, expect, it } from 'vitest';
import { detectPrintingPlatform, resolvePrintingCapabilities } from './printing-capabilities';

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
