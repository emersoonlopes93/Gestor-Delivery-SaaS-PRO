/// <reference types="vitest/globals" />

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyInput } from '@gestor/ui';
import { useState } from 'react';

function CurrencyInputHarness({ initialValue }: { initialValue: number }) {
  const [value, setValue] = useState(initialValue);

  return (
    <div>
      <CurrencyInput value={value} onChange={setValue} aria-label="currency-input" />
      <output data-testid="currency-value">{value.toFixed(2)}</output>
    </div>
  );
}

function getCurrencyInput(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>('currency-input');
}

function expectCurrencyDisplay(value: string) {
  const normalized = getCurrencyInput().value.replace(/\u00a0/g, ' ');
  expect(normalized).toBe(value);
}

function replaceAllCurrency(input: HTMLInputElement, value: string) {
  input.focus();
  input.setSelectionRange(0, input.value.length);
  fireEvent.change(input, { target: { value } });
}

describe('CurrencyInput', () => {
  it('renders existing values in reais', () => {
    const { rerender } = render(<CurrencyInput value={45} onChange={() => undefined} aria-label="currency-input" />);
    expectCurrencyDisplay('R$ 45,00');

    rerender(<CurrencyInput value={0.45} onChange={() => undefined} aria-label="currency-input" />);
    expectCurrencyDisplay('R$ 0,45');
  });

  it('builds cents progressively while typing', () => {
    render(<CurrencyInputHarness initialValue={0} />);

    const input = getCurrencyInput();

    replaceAllCurrency(input, '1');
    expectCurrencyDisplay('R$ 0,01');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.01');

    replaceAllCurrency(input, '10');
    expectCurrencyDisplay('R$ 0,10');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.10');

    replaceAllCurrency(input, '100');
    expectCurrencyDisplay('R$ 1,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('1.00');

    replaceAllCurrency(input, '4500');
    expectCurrencyDisplay('R$ 45,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('45.00');
  });

  it('supports select-all replacement and backspace without locking', () => {
    render(<CurrencyInputHarness initialValue={0.05} />);

    const input = getCurrencyInput();

    replaceAllCurrency(input, '50');
    expectCurrencyDisplay('R$ 0,50');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.50');

    replaceAllCurrency(input, '500');
    expectCurrencyDisplay('R$ 5,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('5.00');

    fireEvent.change(input, { target: { value: input.value.slice(0, -1) } });
    expectCurrencyDisplay('R$ 0,50');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.50');
  });

  it('clears to zero before accepting new digits and pasted values', async () => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness initialValue={12.34} />);

    const input = getCurrencyInput();

    await user.clear(input);
    expectCurrencyDisplay('R$ 0,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.00');

    replaceAllCurrency(input, '4500');
    expectCurrencyDisplay('R$ 45,00');

    input.focus();
    input.setSelectionRange(0, input.value.length);
    fireEvent.paste(input, { clipboardData: { getData: () => '100' } });
    fireEvent.change(input, { target: { value: '100' } });
    expectCurrencyDisplay('R$ 1,00');
  });

  it('replaces a selected suffix without retaining the old digits', () => {
    render(<CurrencyInputHarness initialValue={12.34} />);

    const input = getCurrencyInput();
    input.focus();
    input.setSelectionRange(input.value.length - 2, input.value.length);
    fireEvent.change(input, { target: { value: 'R$ 12,00' } });

    expectCurrencyDisplay('R$ 12,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('12.00');
  });
});
