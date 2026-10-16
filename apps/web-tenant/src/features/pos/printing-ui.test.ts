import { describe, expect, it } from 'vitest';
import { getPrinterUiStatus, humanizePrintingError, SingleFlight } from './printing-ui';

describe('printing UI truthfulness', () => {
  const device = { id: 'printer-1', name: 'Epson', connectionType: 'QZ_TRAY', isActive: true };

  it('does not call a persisted active record ready or connected', () => {
    expect(getPrinterUiStatus(device)).toBe('Configurada');
    expect(getPrinterUiStatus(device)).not.toBe('Pronta');
  });

  it('humanizes adapter failures', () => {
    expect(humanizePrintingError(new Error('QZ websocket refused'))).toContain('Serviço de impressão');
    expect(humanizePrintingError(new Error('Bluetooth permission denied'))).toContain('Permissão necessária');
  });

  it('protects test printing from double submit', async () => {
    let release: (() => void) | undefined;
    const operation = () => new Promise<void>((resolve) => { release = resolve; });
    const guard = new SingleFlight();

    const first = guard.run(operation);
    const second = guard.run(operation);
    expect(await second).toBe(false);
    release?.();
    expect(await first).toBe(true);
  });
});
