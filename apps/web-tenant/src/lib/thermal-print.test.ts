import { afterEach, describe, expect, it, vi } from 'vitest';
import { printThermalText } from './thermal-print';

describe('printThermalText browser fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a printable ticket and invokes window.print without hardware connectors', () => {
    const print = vi.fn();
    const focus = vi.fn();
    const close = vi.fn();
    let onload: (() => void) | null = null;
    const document = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const printWindow = {
      document,
      focus,
      print,
      close,
      get onload() {
        return onload;
      },
      set onload(value: (() => void) | null) {
        onload = value;
      },
    } as unknown as Window;
    const open = vi.fn().mockReturnValue(printWindow);
    vi.stubGlobal('window', { open, setTimeout: vi.fn() });

    expect(printThermalText('PEDIDO #42\nMESA: 10', { paperWidthMm: 58 })).toBe(true);
    expect(open).toHaveBeenCalledWith('', '_blank', 'width=360,height=640');
    expect(document.write).toHaveBeenCalledWith(expect.stringContaining('PEDIDO #42'));
    expect(document.write).toHaveBeenCalledWith(expect.stringContaining('@page'));

    onload?.();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('reports a blocked popup without pretending that printing succeeded', () => {
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null) });
    expect(printThermalText('PEDIDO #42')).toBe(false);
  });
});
