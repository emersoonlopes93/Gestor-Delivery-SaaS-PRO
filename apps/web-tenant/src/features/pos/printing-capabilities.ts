import { Capacitor } from '@capacitor/core';
import type { PrinterDevice } from '../../hooks/usePrinting';

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

export function isPrinterDeviceCompatible(device: PrinterDevice, capabilities: PrintingCapabilities) {
  return (device.connectionType === 'BLUETOOTH_SPP' && capabilities.bluetooth)
    || (device.connectionType === 'QZ_TRAY' && capabilities.qz);
}

export function selectCurrentPlatformPrinter(devices: PrinterDevice[], capabilities: PrintingCapabilities) {
  const compatible = devices.filter((device) => isPrinterDeviceCompatible(device, capabilities));
  return compatible.find((device) => device.isPrimary && device.isActive !== false)
    ?? compatible.find((device) => device.isPrimary)
    ?? compatible.find((device) => device.isActive !== false)
    ?? compatible[0]
    ?? null;
}
