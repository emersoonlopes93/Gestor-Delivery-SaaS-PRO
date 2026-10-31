import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('asks only for phone and PIN without rendering a tenant slug field', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(html).toContain('Telefone');
    expect(html).toContain('PIN / Código de Acesso');
    expect(html).toContain('type="tel"');
    expect(html).toContain('type="password"');
    expect(html).not.toContain('Slug');
    expect(html).not.toContain('Identificador da Loja');
  });
});
