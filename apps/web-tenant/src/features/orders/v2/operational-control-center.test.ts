import type { OrderBoardItemDTO } from '@gestor/types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { filterOrdersForOperationalTab, getOperationalChannelCounters, OPERATIONAL_TAB_LANES } from './operational-control-center';

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
    expect(counters.dineIn).toEqual({ active: 0, kitchen: 0, ready: 0 });
  });

  it('keeps dine-in counters inside the actual fulfillment projection', () => {
    const counters = getOperationalChannelCounters([order('preparing', 'dine_in'), order('ready_for_pickup', 'dine_in'), order('out_for_delivery', 'delivery')]);
    expect(counters.dineIn).toEqual({ active: 2, kitchen: 1, ready: 1 });
    expect(filterOrdersForOperationalTab([order('preparing', 'dine_in'), order('ready_for_pickup', 'pickup')], 'dine_in')).toHaveLength(1);
  });

  it('uses the same fulfillment projection for tabs and their visible lanes', () => {
    const orders = [order('preparing', 'delivery'), order('out_for_delivery', 'delivery'), order('ready_for_pickup', 'pickup'), order('completed', 'dine_in')];
    expect(filterOrdersForOperationalTab(orders, 'delivery')).toHaveLength(2);
    expect(filterOrdersForOperationalTab(orders, 'pickup')).toHaveLength(1);
    expect(OPERATIONAL_TAB_LANES.pickup).not.toContain('route');
    expect(OPERATIONAL_TAB_LANES.delivery).toContain('route');
  });

  it('renders the compact mode strip with real status chips and semantic theme tokens', () => {
    const source = readFileSync(resolve(__dirname, 'OperationalControlCenter.tsx'), 'utf8');
    expect(source).toContain('ModeChannel title="Delivery"');
    expect(source).toContain("label: 'Cozinha'");
    expect(source).toContain("label: 'Entrega'");
    expect(source).toContain('ModeChannel title="Balcão"');
    expect(source).toContain("label: 'Retirar'");
    expect(source).toContain('ModeChannel title="Comandas"');
    expect(source).toContain('statusLabel="Operação"');
    expect(source).toContain('bg-card');
    expect(source).toContain('text-foreground');
    expect(source).toContain('dark:text-emerald-300');
    expect(source).toContain('grid grid-cols-3 gap-1 sm:flex');
    expect(source).toContain('min-h-[44px]');
    expect(source).toContain('ChevronRight');
  });
});
