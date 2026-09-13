import type { OrderBoardItemDTO } from '@gestor/types';
import { getOperationalChannelCounters } from './operational-control-center';

const order = (status: OrderBoardItemDTO['status'], fulfillmentType: OrderBoardItemDTO['fulfillmentType']): OrderBoardItemDTO => ({
  id: `${status}-${fulfillmentType}`, orderNumber: '1', status, fulfillmentType, customerName: 'Cliente', customerPhone: null, total: 1, createdAt: new Date().toISOString(), itemsSummary: '', searchText: '', notes: null, deliveryDriverId: null, deliveryDriverName: null,
  operational: { origin: 'PEDEHUB', syncState: 'SYNCED', primaryAction: null, availableActions: [], deliverySummary: { label: 'Entrega', ownership: 'MERCHANT' }, displayChannel: 'PedeHub' },
} as OrderBoardItemDTO);

describe('Operational Control Center counters', () => {
  it('separates delivery/pickup and excludes terminal orders', () => {
    const counters = getOperationalChannelCounters([
      order('preparing', 'delivery'), order('ready_for_delivery', 'delivery'), order('out_for_delivery', 'delivery'), order('ready_for_pickup', 'pickup'), order('completed', 'delivery'), order('cancelled', 'pickup'),
    ]);
    expect(counters.delivery).toEqual({ active: 3, kitchen: 1, ready: 1, dispatch: 1, route: 1 });
    expect(counters.pickup).toEqual({ active: 1, kitchen: 0, ready: 1 });
  });
});
