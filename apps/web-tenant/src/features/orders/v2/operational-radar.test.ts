import { describe, expect, it } from 'vitest';
import type { OrderBoardItemDTO } from '@gestor/types';
import { filterRadarOrders } from './operational-radar';

function order(status: OrderBoardItemDTO['status'], fulfillmentType: OrderBoardItemDTO['fulfillmentType'], origin: 'PEDEHUB' | 'IFOOD' = 'PEDEHUB'): OrderBoardItemDTO {
  return { id: `${status}-${fulfillmentType}-${origin}`, orderNumber: origin === 'IFOOD' ? '99' : '42', status, fulfillmentType, customerName: origin === 'IFOOD' ? 'Mário' : 'Ana', customerPhone: '11999999999', total: 30, itemsSubtotal: 30, itemCount: 1, itemsSummary: 'Pizza', createdAt: '2026-09-13T12:00:00.000Z', operational: { origin, displayChannel: origin, deliveryOwnership: origin === 'IFOOD' ? 'PROVIDER' : 'MERCHANT', primaryAction: null, availableActions: [], marketplaceOperation: { state: 'NONE' }, syncState: 'NONE', financialSummary: { operationalValue: 30, operationalValueLabel: 'Venda', saleAmount: 30, customerPaid: null, paymentState: 'PENDING', paymentLabel: 'Pendente' }, deliverySummary: { ownership: 'MERCHANT', label: 'Entrega' }, productionSummary: { state: 'UNKNOWN', label: 'A confirmar' }, capabilities: { canConfirm: false, canStartPreparation: false, canMarkReady: false, canCancel: false, canAssignDriver: false, canDispatch: false, canRecalculateRoute: false, canComplete: false, canPrint: false, canEdit: false }, provider: null, fulfillmentMode: fulfillmentType, secondaryActions: [] } } as OrderBoardItemDTO;
}

describe('Operational Radar projection', () => {
  const orders = [order('preparing', 'delivery'), order('ready_for_delivery', 'delivery'), order('out_for_delivery', 'delivery', 'IFOOD'), order('ready_for_pickup', 'pickup'), order('preparing', 'dine_in')];

  it('uses the reconciled delivery board without pickup or dine-in contamination', () => {
    expect(filterRadarOrders(orders, 'all', '')).toHaveLength(3);
    expect(filterRadarOrders(orders, 'ready', '')).toHaveLength(1);
    expect(filterRadarOrders(orders, 'route', '')).toHaveLength(1);
    expect(filterRadarOrders(orders, 'kitchen', '')).toHaveLength(1);
  });

  it('reuses normalized board search and provider separation', () => {
    expect(filterRadarOrders(orders, 'all', 'mario')).toHaveLength(1);
    expect(filterRadarOrders(orders, 'marketplace', '')).toHaveLength(1);
    expect(filterRadarOrders(orders, 'marketplace', '')[0].operational.origin).toBe('IFOOD');
  });
});
