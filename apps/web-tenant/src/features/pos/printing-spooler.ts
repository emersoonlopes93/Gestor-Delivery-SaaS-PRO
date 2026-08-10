import type { PrinterDevice } from '../../hooks/usePrinting';
import { isPrinterDeviceCompatible, type PrintingCapabilities } from './printing-capabilities';

export type SpoolerState = 'stopped' | 'running' | 'printing' | 'attention';

export function selectSpoolerDevice(devices: PrinterDevice[], capabilities: PrintingCapabilities) {
  const compatible = (device: PrinterDevice) =>
    device.isActive !== false && device.autoPrintEnabled === true && Boolean(device.address)
    && isPrinterDeviceCompatible(device, capabilities);
  return devices.find((device) => device.isPrimary && compatible(device))
    ?? devices.find(compatible)
    ?? null;
}

export class PrintingPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(
    private readonly poll: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly onError?: (error: unknown) => void,
  ) {}

  start() {
    if (this.active) return false;
    this.active = true;
    void this.run();
    return true;
  }

  stop() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  isRunning() {
    return this.active;
  }

  private async run() {
    if (!this.active) return;
    try {
      await this.poll();
    } catch (error) {
      this.onError?.(error);
    } finally {
      if (this.active) {
        this.timer = setTimeout(() => void this.run(), this.intervalMs);
      }
    }
  }
}
