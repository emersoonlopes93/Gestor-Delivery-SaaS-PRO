import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintingPoller } from './printing-spooler';
import { selectSpoolerDevice } from './printing-spooler';
import { resolvePrintingCapabilities } from './printing-capabilities';

describe('PrintingPoller lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('starts once, respects its interval and cleans up', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValue(undefined);
    const spooler = new PrintingPoller(poll, 3000);

    expect(spooler.start()).toBe(true);
    expect(spooler.start()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(poll).toHaveBeenCalledTimes(2);

    spooler.stop();
    await vi.advanceTimersByTimeAsync(9000);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(spooler.isRunning()).toBe(false);
  });

  it('only selects a configured adapter supported by the current platform', () => {
    const bluetooth = { id: 'bt', name: 'BT', connectionType: 'BLUETOOTH_SPP', address: 'AA', autoPrintEnabled: true, isPrimary: true };
    const qz = { id: 'qz', name: 'QZ', connectionType: 'QZ_TRAY', address: 'Printer', autoPrintEnabled: true, isPrimary: true };
    expect(selectSpoolerDevice([bluetooth, qz], resolvePrintingCapabilities('android-capacitor'))?.id).toBe('bt');
    expect(selectSpoolerDevice([bluetooth, qz], resolvePrintingCapabilities('desktop-web'))?.id).toBe('qz');
    expect(selectSpoolerDevice([bluetooth, qz], resolvePrintingCapabilities('mobile-web'))).toBeNull();
    expect(selectSpoolerDevice([{ ...qz, autoPrintEnabled: false }], resolvePrintingCapabilities('desktop-web'))).toBeNull();
  });
});
