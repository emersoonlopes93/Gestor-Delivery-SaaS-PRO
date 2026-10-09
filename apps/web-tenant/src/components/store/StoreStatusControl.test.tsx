import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoreStatusControl } from './StoreStatusControl';

describe('StoreStatusControl', () => {
  it('shows closed state, next opening and a disabled operational toggle', () => {
    const html = renderToStaticMarkup(
      <StoreStatusControl
        status="closed"
        isPaused={false}
        canTogglePause={false}
        nextOpenTime="08:00"
        isSaving={false}
        onTogglePause={vi.fn()}
      />,
    );
    expect(html).toContain('Loja Fechada');
    expect(html).toContain('Abre às 08:00');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-checked="false"');
  });
});
