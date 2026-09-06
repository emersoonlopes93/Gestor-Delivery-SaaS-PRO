import { describe, expect, it } from 'vitest';
import { DeliveryRunStatus, DeliveryStopStatus, type OrderBoardItemDTO, type OrderOperationalViewModel } from '@gestor/types';
import {
  buildRoutingSummary,
  deliveryStatement,
  matchesBoardFilter,
  matchesBoardSearch,
  presentOrderTime,
  resolveOrderPriority,
} from './order-presenters';

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

function boardOrder(overrides: Partial<OrderBoardItemDTO> = {}): OrderBoardItemDTO {
  return {
    id: 'o-1', orderNumber: '1042', status: 'pending', fulfillmentType: 'delivery', customerName: 'Ana Souza', customerPhone: '11999990000',
    total: 42, itemsSubtotal: 38, itemCount: 2, itemsSummary: '2x Pizza', createdAt: new Date('2026-09-06T12:00:00.000Z').toISOString(),
    operational: operational(), ...overrides,
  };
}

describe('order presenters', () => {
  it('keeps priority, time and financial language operational and provider-neutral', () => {
    const pending = boardOrder();
    expect(resolveOrderPriority(pending).label).toBe('Precisa confirmar');
    expect(presentOrderTime(pending.createdAt, new Date('2026-09-06T12:31:00.000Z').getTime())).toMatchObject({ delayed: true, label: 'atrasado 1 min' });
    expect(pending.operational.financialSummary.operationalValueLabel).toBe('Venda');
  });

  it('searches the whole board snapshot and keeps filters based on shared operational policy', () => {
    const order = boardOrder({ deliveryDriverName: 'Mário' });
    expect(matchesBoardSearch(order, '9999')).toBe(true);
    expect(matchesBoardSearch(order, 'mário')).toBe(true);
    expect(matchesBoardFilter(order, 'merchant')).toBe(true);
    expect(matchesBoardFilter(boardOrder({ operational: operational({ origin: 'IFOOD', displayChannel: 'iFood', deliveryOwnership: 'PROVIDER' }) }), 'IFOOD')).toBe(true);
  });

  it('does not mislabel provider or unknown delivery as no driver', () => {
    expect(deliveryStatement(operational({ origin: 'IFOOD', displayChannel: 'iFood', deliveryOwnership: 'PROVIDER' }), 'delivery')).toBe('Entrega pelo iFood');
    expect(deliveryStatement(operational({ deliveryOwnership: 'UNKNOWN', deliverySummary: { ownership: 'UNKNOWN', label: 'Responsável pela entrega não confirmado' } }), 'delivery')).toBe('Responsável pela entrega não confirmado');
  });

  it('marks degraded routing as estimated instead of a precise road ETA', () => {
    const summary = buildRoutingSummary({
      id: 'run-1', driverId: 'driver-1', driverName: 'Mário', status: DeliveryRunStatus.IN_PROGRESS, version: 1, assignedAt: null, acceptedAt: null, startedAt: '2026-09-06T12:00:00.000Z', returningAt: null, completedAt: null, createdAt: '2026-09-06T12:00:00.000Z',
      stops: [{ id: 'stop-1', orderId: 'o-1', sequence: 2, status: DeliveryStopStatus.PENDING, attempts: 0, orderNumber: '1042', customerName: 'Ana', customerPhone: '11999990000', address: null, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null, payAmount: null, payCurrency: null, routeDistanceMeters: 2200, routeDurationSeconds: 660, estimatedArrivalAt: '2026-09-06T12:20:00.000Z' }],
      route: { provider: 'fallback', quality: 'DEGRADED', version: 1, distanceMeters: 2200, durationSeconds: 660, calculatedAt: '2026-09-06T12:00:00.000Z', geometry: [] },
    }, 'o-1');
    expect(summary?.stopPosition).toBe('Parada 2 de 1');
    expect(summary?.qualityMessage).toContain('linha reta');
  });
});
