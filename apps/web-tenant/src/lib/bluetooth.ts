import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

// Interface for Bluetooth SPP Plugin (BluetoothSerial/Printer)
export interface BluetoothPrinterPlugin {
  connect(options: { address: string }): Promise<{ success: boolean }>;
  disconnect(): Promise<{ success: boolean }>;
  write(options: { data: string }): Promise<{ success: boolean }>;
  listDevices(): Promise<{ devices: Array<{ name: string; address: string }> }>;
}

// In a real scenario, this would map to a custom Capacitor plugin 
// or an existing community plugin like @ionic-native/bluetooth-serial wrapped.
export const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>('BluetoothPrinter');

export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';

export const scanBluetoothDevices = async () => {
  if (!isNativeAndroid()) {
    console.warn('Bluetooth is only supported on Android native app.');
    return [];
  }
  try {
    const result = await BluetoothPrinter.listDevices();
    return result.devices;
  } catch (error) {
    console.error('Failed to list BT devices:', error);
    return [];
  }
};

export const printTicketViaBluetooth = async (macAddress: string, content: string) => {
  if (!isNativeAndroid()) {
    throw new Error('Native Bluetooth only supported on Android.');
  }

  try {
    await BluetoothPrinter.connect({ address: macAddress });
    await BluetoothPrinter.write({ data: content });
    await BluetoothPrinter.disconnect();
    return true;
  } catch (error) {
    console.error('Print failed:', error);
    throw error;
  }
};
