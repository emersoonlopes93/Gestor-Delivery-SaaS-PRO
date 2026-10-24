import 'reflect-metadata';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DriverPayMode } from '@gestor/types';
import { DriverPayFields } from './DriverPayFields';
import { DEFAULT_DRIVER_PAY_VALUE } from './driver-pay-form';

describe('DriverPayFields', () => {
  const rateTable = {
    ...DEFAULT_DRIVER_PAY_VALUE,
    mode: DriverPayMode.DRIVER_RATE_TABLE,
    rateTable: [{ upToKm: 5, amount: 8 }, { upToKm: null, amount: 12 }],
  };

  it('uses store-neutral copy and a mobile-first tier layout', () => {
    const html = renderToStaticMarkup(<DriverPayFields value={rateTable} onChange={vi.fn()} idPrefix="store-pay" scope="store" />);
    expect(html).toContain('Tabela própria de pagamento');
    expect(html).toContain('regra padrão da loja');
    expect(html).not.toContain('Tabela própria do entregador');
    expect(html).toContain('sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]');
  });

  it('locks every numeric tier control while saving', () => {
    const html = renderToStaticMarkup(<DriverPayFields value={rateTable} onChange={vi.fn()} idPrefix="busy-pay" disabled />);
    expect(html).toContain('aria-busy="true"');
    const numericInputs = html.match(/<input[^>]+type="number"[^>]*>/g) ?? [];
    expect(numericInputs.length).toBeGreaterThan(2);
    expect(numericInputs.every((input) => input.includes('disabled=""'))).toBe(true);
  });
});
