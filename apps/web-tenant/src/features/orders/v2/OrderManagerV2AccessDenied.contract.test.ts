import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Order Manager V2 access denied state', () => {
  it('puts permission guidance first and keeps technical information secondary', () => {
    const source = readFileSync(resolve(__dirname, 'OrderManagerV2AccessDenied.tsx'), 'utf8');
    expect(source).toContain('Você não tem acesso ao Gestor de Pedidos');
    expect(source).toContain('Voltar ao Gestor atual');
    expect(source).toContain('Detalhes técnicos');
    expect(source).toContain('orders.use_kanban');
    expect(source).toContain("hasPermission(user?.permissions ?? [], 'users.roles')");
  });
});
