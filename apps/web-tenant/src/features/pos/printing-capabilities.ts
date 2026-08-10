import { Capacitor } from '@capacitor/core';

export type PrintingPlatform = 'android-capacitor' | 'mobile-web' | 'desktop-web';

export interface PrintingCapabilities {
  platform: PrintingPlatform;
  bluetooth: boolean;
  browserPrint: boolean;
  qz: boolean;
  directUsb: false;
  network: false;
  bridge: false;
}
export function resolvePrintingCapabilities(platform: PrintingPlatform): PrintingCapabilities {
  return {
    platform,
    bluetooth: platform === 'android-capacitor',
    browserPrint: platform !== 'android-capacitor',
    qz: platform === 'desktop-web',
    directUsb: false,
    network: false,
    bridge: false,
  };
}

export function detectPrintingPlatform(input: {
  isNative: boolean;
  nativePlatform?: string;
  mobileUserAgent?: boolean;
}): PrintingPlatform {
  if (input.isNative && input.nativePlatform === 'android') return 'android-capacitor';
  return input.mobileUserAgent ? 'mobile-web' : 'desktop-web';
}

function isMobileBrowser(userAgent: string) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function getPrintingCapabilities(): PrintingCapabilities {
  const platform = detectPrintingPlatform({
    isNative: Capacitor.isNativePlatform(),
    nativePlatform: Capacitor.getPlatform(),
    mobileUserAgent: typeof navigator !== 'undefined' && isMobileBrowser(navigator.userAgent),
  });
  return resolvePrintingCapabilities(platform);
}
