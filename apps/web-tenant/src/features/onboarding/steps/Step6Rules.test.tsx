// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ToggleCard } from './Step6Rules';

function ToggleHarness() {
  const [enabled, setEnabled] = useState(false);
  return (
    <ToggleCard
      title="Agendamento"
      description="Permite pedidos futuros."
      enabled={enabled}
      onChange={setEnabled}
      icon={() => null}
    />
  );
}

describe('ToggleCard', () => {
  it('moves the switch thumb and exposes its checked state to keyboard users', () => {
    render(<ToggleHarness />);

    const toggle = screen.getByRole('switch', { name: 'Agendamento' });
    const thumb = () => toggle.nextElementSibling?.firstElementChild;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(thumb()?.classList.contains('translate-x-0')).toBe(true);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(thumb()?.classList.contains('translate-x-5')).toBe(true);
  });
});
