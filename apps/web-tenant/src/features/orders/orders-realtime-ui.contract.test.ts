import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const board = readFileSync(resolve(process.cwd(), 'src/features/orders/OperationBoardPage.tsx'), 'utf8');
const list = readFileSync(resolve(process.cwd(), 'src/features/orders/OrdersListPage.tsx'), 'utf8');
const drawer = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderDrawer.tsx'), 'utf8');

describe('orders realtime UI contract', () => {
  it('reconciles a single board order without resetting search, filters, drawer or scroll', () => {
    expect(board).toContain('/orders/${orderId}?reconcile=');
    expect(board).toContain('reconcileBoardOrder(current, orderId, item)');
    expect(board).toContain('draggingOrderIdRef.current === event.hint.orderId');
    expect(board).not.toContain('setSearch(\'\')');
    expect(board).not.toContain("setActiveFilter('all')");
    expect(board).not.toContain('setActiveOrderId(null);\n        setOrders');
  });

  it('keeps list state stable until the explicit pending-update action', () => {
    expect(list).toContain('Há atualizações');
    expect(list).toContain('setHasPendingUpdates(true)');
    expect(list).toContain('onClick={() => void fetchOrders()}');
    expect(list).not.toContain('event.hint.orderId, setPage');
  });

  it('quietly refreshes an open drawer only for its matching order', () => {
    expect(drawer).toContain("event.hint.orderId === orderId");
    expect(drawer).toContain('void fetchDetail(true)');
  });
});
