import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/tenants/TenantAccessPage.tsx'), 'utf8');

describe('TenantAccessPage access explanations', () => {
  it('separates release status from store access and keeps technical data secondary', () => {
    expect(source).toContain('Status do recurso');
    expect(source).toContain('Acesso para esta loja');
    expect(source).toContain('Detalhes tecnicos');
  });

  it('offers adjustment only for tenant-controlled states', () => {
    expect(source).toContain("feature.reason === 'tenant_disabled' || feature.reason === 'tenant_opt_in_required'");
    expect(source).toContain('perfil atual nao possui a permissao necessaria');
    expect(source).toContain('plano ou modulo atual desta loja nao inclui');
    expect(source).toContain('ainda esta em preparacao');
  });
});
