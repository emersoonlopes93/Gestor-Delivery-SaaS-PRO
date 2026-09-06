import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const card = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderCard.tsx'), 'utf8');
const drawer = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderDrawer.tsx'), 'utf8');
const actionsBar = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderActionsBar.tsx'), 'utf8');
const board = readFileSync(resolve(process.cwd(), 'src/features/orders/OperationBoardPage.tsx'), 'utf8');

describe('orders operational UI contract', () => {
  it('uses the backend operational policy for card, drawer and action bar', () => {
    expect(card).toContain('operational.primaryAction');
    expect(card).toContain('operational.secondaryActions');
    expect(drawer).toContain('order?.operational?.availableActions');
    expect(actionsBar).toContain('operational.primaryAction');
    expect(actionsBar).not.toContain("status === 'pending'");
  });

  it('keeps one dominant card action and secondary actions in overflow', () => {
    expect(card).toContain('aria-label="Abrir ações secundárias"');
    expect(card).toContain('primaryAction.label');
    expect(card).not.toContain('marketplace_99food');
  });

  it('makes delivery ownership fail closed before opening driver UI', () => {
    expect(board).toContain("order.operational.deliveryOwnership !== 'MERCHANT'");
    expect(drawer).toContain("order.operational?.deliveryOwnership !== 'MERCHANT'");
    expect(drawer).toContain("order.operational?.deliveryOwnership === 'MERCHANT'");
  });

  it('preserves the last board snapshot after refresh failure', () => {
    const catchBlock = board.slice(board.indexOf("console.error('[OperationBoardPage] Erro ao buscar board:"), board.indexOf('} finally', board.indexOf("console.error('[OperationBoardPage] Erro ao buscar board:")));
    expect(catchBlock).not.toContain('setOrders([])');
  });

  it('provides the drawer P0 dialog and focus contract', () => {
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain('aria-labelledby="order-drawer-title"');
    expect(drawer).toContain("event.key === 'Escape'");
    expect(drawer).toContain("event.key !== 'Tab'");
    expect(drawer).toContain('queueMicrotask(() => restoreFocus?.focus())');
    expect(drawer).toContain('aria-label="Fechar detalhes do pedido"');
  });

  it('allows opening cards with the keyboard', () => {
    expect(card).toContain('tabIndex={0}');
    expect(card).toContain("event.key === 'Enter'");
    expect(card).toContain('aria-label={`Abrir detalhes do pedido');
  });
});
