/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
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

function expectCurrencyDisplay(value: string) {
  const normalized = (screen.getByLabelText('currency-input') as HTMLInputElement).value.replace(/\u00a0/g, ' ');
  expect(normalized).toBe(value);
}

describe('CurrencyInput', () => {
  it('renders existing values in reais', () => {
    const { rerender } = render(<CurrencyInput value={45} onChange={() => undefined} aria-label="currency-input" />);
    expectCurrencyDisplay('R$ 45,00');

    rerender(<CurrencyInput value={0.45} onChange={() => undefined} aria-label="currency-input" />);
    expectCurrencyDisplay('R$ 0,45');
  });

  it('builds cents progressively while typing', async () => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness initialValue={0} />);

    const input = screen.getByLabelText('currency-input');

    await user.click(input);
    await user.keyboard('{Control>}a{/Control}1');
    expectCurrencyDisplay('R$ 0,01');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.01');

    await user.keyboard('{Control>}a{/Control}10');
    expectCurrencyDisplay('R$ 0,10');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.10');

    await user.keyboard('{Control>}a{/Control}100');
    expectCurrencyDisplay('R$ 1,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('1.00');

    await user.keyboard('{Control>}a{/Control}4500');
    expectCurrencyDisplay('R$ 45,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('45.00');
  });

  it('supports select-all replacement and backspace without locking', async () => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness initialValue={0.05} />);

    const input = screen.getByLabelText('currency-input');

    await user.click(input);
    await user.keyboard('{Control>}a{/Control}50');
    expectCurrencyDisplay('R$ 0,50');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.50');

    await user.keyboard('{Control>}a{/Control}500');
    expectCurrencyDisplay('R$ 5,00');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('5.00');

    await user.keyboard('{Backspace}');
    expectCurrencyDisplay('R$ 0,50');
    expect(screen.getByTestId('currency-value')).toHaveTextContent('0.50');
  });
});
