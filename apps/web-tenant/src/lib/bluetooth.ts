import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api-client';

const BLUETOOTH_PLUGIN_NAME = 'BluetoothPrinter';

export interface BluetoothPrinterPlugin {
  requestBluetoothPermissions(): Promise<{ granted: boolean }>;
  connect(options: { address: string }): Promise<{ success: boolean; connected?: boolean; name?: string; address?: string }>;
  disconnect(): Promise<{ success: boolean }>;
  write(options: { data: string }): Promise<{ success: boolean }>;
  listDevices(): Promise<{ devices: Array<{ name: string; address: string }> }>;
}

export const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>(BLUETOOTH_PLUGIN_NAME);

export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';

function getBluetoothPluginDiagnostics() {
  return {
    expectedPlugin: BLUETOOTH_PLUGIN_NAME,
    isNativePlatform: Capacitor.isNativePlatform(),
    isPluginAvailable: Capacitor.isPluginAvailable(BLUETOOTH_PLUGIN_NAME),
    platform: Capacitor.getPlatform(),
  };
}

function getBluetoothErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido no Bluetooth.';
}

function assertBluetoothPluginAvailable() {
  const diagnostics = getBluetoothPluginDiagnostics();

  if (!isNativeAndroid()) {
    console.warn('[BluetoothPrinter] Plugin indisponível', diagnostics);
    throw new Error(`Bluetooth SPP só funciona no app Android. Diagnóstico: ${JSON.stringify(diagnostics)}`);
  }

  if (!Capacitor.isPluginAvailable(BLUETOOTH_PLUGIN_NAME)) {
    console.error('[BluetoothPrinter] Plugin nativo não disponível', diagnostics);
    throw new Error(`Plugin BluetoothPrinter não disponível no APK. Diagnóstico: ${JSON.stringify(diagnostics)}. Rode npx cap sync android, faça Clean/Rebuild no Android Studio e reinstale o APK.`);
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
    console.error('[BluetoothPrinter] Falha ao listar dispositivos', {
      ...getBluetoothPluginDiagnostics(),
      error,
    });
    throw new Error(getBluetoothErrorMessage(error));
  }
};

export const connectBluetoothPrinter = async (address: string) => {
  assertBluetoothPluginAvailable();

  try {
    await requestBluetoothPermissions();
    const result = await BluetoothPrinter.connect({ address });
    if (!result.success && !result.connected) {
      throw new Error('A impressora não confirmou a conexão Bluetooth.');
    }
    return result;
  } catch (error) {
    console.error('[BluetoothPrinter] Falha ao conectar', {
      ...getBluetoothPluginDiagnostics(),
      address,
      error,
    });
    throw error;
  }
};

export const printTicketViaBluetooth = async (macAddress: string, content: string) => {
  assertBluetoothPluginAvailable();

  try {
    await connectBluetoothPrinter(macAddress);
    await BluetoothPrinter.write({ data: content });
    await BluetoothPrinter.disconnect();
    return true;
  } catch (error) {
    console.error('[BluetoothPrinter] Falha ao imprimir', {
      ...getBluetoothPluginDiagnostics(),
      error,
    });
    throw error;
  }
};

export const printTicketViaPrimaryBluetooth = async (content: string) => {
  assertBluetoothPluginAvailable();

  try {
    const res = await api.get<Array<{
      id: string;
      name: string;
      address?: string | null;
      isPrimary?: boolean;
      isActive?: boolean;
    }>>('/printing/devices');

    const primary = (res.data || []).find((device) => device.isPrimary && device.isActive && device.address);
    if (!primary?.address) {
      throw new Error('Nenhuma impressora principal Bluetooth ativa foi encontrada.');
    }

    await printTicketViaBluetooth(primary.address, content);
    return true;
  } catch (error) {
    console.error('[BluetoothPrinter] Falha ao imprimir na impressora principal', {
      ...getBluetoothPluginDiagnostics(),
      error,
    });
    throw error;
  }
};
