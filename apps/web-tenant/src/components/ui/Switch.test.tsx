import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('keeps a stable size and exposes native switch semantics', () => {
    const html = renderToStaticMarkup(
      <Switch checked onCheckedChange={vi.fn()} aria-label="Ativar recurso" />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('h-6 w-11 shrink-0');
    expect(html).toContain('aria-label="Ativar recurso"');
  });

  it('renders disabled without changing its fixed dimensions', () => {
    const html = renderToStaticMarkup(
      <Switch checked={false} onCheckedChange={vi.fn()} disabled aria-label="Recurso indisponível" />,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('h-6 w-11 shrink-0');
  });
});
