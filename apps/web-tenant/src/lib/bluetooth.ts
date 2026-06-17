import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

// Interface for Bluetooth SPP Plugin (BluetoothSerial/Printer)
export interface BluetoothPrinterPlugin {
  requestBluetoothPermissions(): Promise<{ granted: boolean }>;
  connect(options: { address: string }): Promise<{ success: boolean }>;
  disconnect(): Promise<{ success: boolean }>;
  write(options: { data: string }): Promise<{ success: boolean }>;
  listDevices(): Promise<{ devices: Array<{ name: string; address: string }> }>;
}

// In a real scenario, this would map to a custom Capacitor plugin 
// or an existing community plugin like @ionic-native/bluetooth-serial wrapped.
export const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>('BluetoothPrinter');

export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';

function getBluetoothErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido no Bluetooth.';
}

function assertBluetoothPluginAvailable() {
  if (!isNativeAndroid()) {
    throw new Error('Bluetooth SPP só funciona no app Android.');
  }

  if (!Capacitor.isPluginAvailable('BluetoothPrinter')) {
    throw new Error('Plugin BluetoothPrinter não disponível no APK. Rode npx cap sync android e gere novo APK.');
  }
}

export const requestBluetoothPermissions = async () => {
  assertBluetoothPluginAvailable();

  try {
    const result = await BluetoothPrinter.requestBluetoothPermissions();
    if (!result.granted) {
      throw new Error('Permissão Bluetooth negada. Conceda a permissão para listar impressoras pareadas.');
    }
    return true;
  } catch (error) {
    throw new Error(getBluetoothErrorMessage(error));
  }
};

export const scanBluetoothDevices = async () => {
  assertBluetoothPluginAvailable();

  try {
    await requestBluetoothPermissions();
    const result = await BluetoothPrinter.listDevices();
    return result.devices;
  } catch (error) {
    console.error('Failed to list BT devices:', error);
    throw new Error(getBluetoothErrorMessage(error));
  }
};

export const printTicketViaBluetooth = async (macAddress: string, content: string) => {
  assertBluetoothPluginAvailable();

  try {
    await requestBluetoothPermissions();
    await BluetoothPrinter.connect({ address: macAddress });
    await BluetoothPrinter.write({ data: content });
    await BluetoothPrinter.disconnect();
    return true;
  } catch (error) {
    console.error('Print failed:', error);
    throw error;
  }
};
