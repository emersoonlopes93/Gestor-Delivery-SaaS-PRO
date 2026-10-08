import { describe, expect, it } from 'vitest';
import type { OrderBoardItemDTO, OrderChangedEvent, OrderOperationalViewModel, OrderResponseDTO } from '@gestor/types';
import {
  isOrdersSnapshotStale,
  latestHintForOrder,
  orderDetailToBoardItem,
  reconcileBoardOrder,
} from './order-reconciliation';

function operational(overrides: Partial<OrderOperationalViewModel> = {}): OrderOperationalViewModel {
  return {
    origin: 'PEDEHUB', provider: null, displayChannel: 'PedeHub', deliveryOwnership: 'MERCHANT', fulfillmentMode: 'delivery',
    capabilities: { canConfirm: true, canStartPreparation: true, canMarkReady: true, canCancel: true, canAssignDriver: true, canDispatch: true, canRecalculateRoute: true, canComplete: true, canPrint: true, canEdit: true },
    availableActions: [], marketplaceOperation: { state: 'NONE' }, syncState: 'NONE',
    financialSummary: { operationalValue: 42, operationalValueLabel: 'Venda', saleAmount: 42, customerPaid: null, paymentState: 'UNKNOWN', paymentLabel: 'Pagamento não confirmado' },
    deliverySummary: { ownership: 'MERCHANT', label: 'Entrega própria' }, productionSummary: { state: 'NOT_SENT', label: 'Aguardando cozinha' },
    primaryAction: null, secondaryActions: [], ...overrides,
  };
}

function detail(overrides: Partial<OrderResponseDTO> = {}): OrderResponseDTO {
  return {
    id: 'order-1', orderNumber: '101', status: 'pending', fulfillmentType: 'delivery', customerName: 'Ana', customerPhone: '11999990000',
    itemsSubtotal: 38, discountTotal: 0, deliveryFee: 4, serviceFee: 0, total: 42, sourceChannel: 'storefront', paymentMethod: 'pix' as OrderResponseDTO['paymentMethod'],
    expectedNetAmountCents: null,
    items: [{ id: 'item-1', lineType: 'product', productId: 'product-1', comboId: null, quantity: 2, unitPrice: 19, lineTotal: 38, notes: null, snapshotName: 'Pizza', snapshotImage: null, snapshotBasePrice: 19, snapshotExtrasTotal: 0, snapshotComposition: null }],
    timeline: [], createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z', operational: operational(), ...overrides,
  };
}

function board(input: OrderResponseDTO): OrderBoardItemDTO {
  const item = orderDetailToBoardItem(input);
  if (!item) throw new Error('Expected an active board item');
  return item;
}

describe('order reconciliation', () => {
  it('inserts a new order by stable createdAt order and replaces a status in place', () => {
    const first = board(detail({ id: 'first', createdAt: '2026-09-06T10:00:00.000Z' }));
    const last = board(detail({ id: 'last', createdAt: '2026-09-06T12:00:00.000Z' }));
    const middle = board(detail({ id: 'middle', createdAt: '2026-09-06T11:00:00.000Z' }));
    const inserted = reconcileBoardOrder([first, last], middle.id, middle);
    expect(inserted.map((order) => order.id)).toEqual(['first', 'middle', 'last']);
    const preparing = { ...middle, status: 'preparing' as const };
    expect(reconcileBoardOrder(inserted, middle.id, preparing)).toEqual([first, preparing, last]);
  });

  it('removes completed and cancelled orders from the active board', () => {
    const active = board(detail());
    expect(orderDetailToBoardItem(detail({ status: 'completed' }))).toBeNull();
    expect(orderDetailToBoardItem(detail({ status: 'cancelled' }))).toBeNull();
    expect(reconcileBoardOrder([active], active.id, null)).toEqual([]);
  });

  it('replaces marketplace pending, resolved and failed state plus ownership and driver data', () => {
    const pending = board(detail({ operational: operational({ syncState: 'PENDING', marketplaceOperation: { state: 'PENDING', friendlyMessage: 'Sincronizando' } }) }));
    const resolved = board(detail({ deliveryDriverId: 'driver-1', deliveryDriverName: 'Mário', operational: operational({ syncState: 'NONE', marketplaceOperation: { state: 'NONE' } }) }));
    const failed = board(detail({ operational: operational({ deliveryOwnership: 'PROVIDER', syncState: 'FAILED', marketplaceOperation: { state: 'FAILED', friendlyMessage: 'Falha de sincronização' } }) }));
    expect(reconcileBoardOrder([pending], pending.id, resolved)[0]).toMatchObject({ deliveryDriverId: 'driver-1', deliveryDriverName: 'Mário', operational: { syncState: 'NONE' } });
    expect(reconcileBoardOrder([resolved], resolved.id, failed)[0].operational).toMatchObject({ deliveryOwnership: 'PROVIDER', syncState: 'FAILED' });
  });

  it('keeps the latest concurrent DnD hint and marks a snapshot stale at the centralized threshold', () => {
    const earlier: OrderChangedEvent = { eventId: 'e-1', orderId: 'order-1', occurredAt: '2026-09-06T12:00:00.000Z', reason: 'status' };
    const later: OrderChangedEvent = { eventId: 'e-2', orderId: 'order-1', occurredAt: '2026-09-06T12:00:01.000Z', reason: 'marketplace' };
    expect(latestHintForOrder(earlier, later)).toBe(later);
    expect(isOrdersSnapshotStale(1_000, 120_999)).toBe(false);
    expect(isOrdersSnapshotStale(1_000, 121_000)).toBe(true);
  });
});
