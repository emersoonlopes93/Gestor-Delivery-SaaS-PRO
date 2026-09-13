import type { OrderBoardItemDTO } from '@gestor/types';

export type OperationalChannelCounters = {
  delivery: { active: number; kitchen: number; ready: number; dispatch: number; route: number };
  pickup: { active: number; kitchen: number; ready: number };
  dineIn: { active: number };
};

export type OperationalTab = 'delivery' | 'pickup' | 'dine_in';
export const OPERATIONAL_TAB_LANES: Record<OperationalTab, readonly ('kitchen' | 'ready' | 'route')[]> = {
  delivery: ['kitchen', 'ready', 'route'], pickup: ['kitchen', 'ready'], dine_in: ['kitchen', 'ready'],
};

const ACTIVE = new Set(['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery']);
const KITCHEN = new Set(['pending', 'confirmed', 'preparing']);

/** One source for Control Center counters; completed/cancelled orders never enter it. */
export function getOperationalChannelCounters(orders: readonly OrderBoardItemDTO[]): OperationalChannelCounters {
  const counters: OperationalChannelCounters = {
    delivery: { active: 0, kitchen: 0, ready: 0, dispatch: 0, route: 0 },
    pickup: { active: 0, kitchen: 0, ready: 0 },
    dineIn: { active: 0 },
  };
  for (const order of orders) {
    if (!ACTIVE.has(order.status)) continue;
    if (order.fulfillmentType === 'delivery') {
      counters.delivery.active += 1;
      if (KITCHEN.has(order.status)) counters.delivery.kitchen += 1;
      if (order.status === 'ready_for_delivery') { counters.delivery.ready += 1; counters.delivery.dispatch += 1; }
      if (order.status === 'out_for_delivery') counters.delivery.route += 1;
    } else if (order.fulfillmentType === 'pickup') {
      counters.pickup.active += 1;
      if (KITCHEN.has(order.status)) counters.pickup.kitchen += 1;
      if (order.status === 'ready_for_pickup') counters.pickup.ready += 1;
    } else {
      counters.dineIn.active += 1;
    }
  }
  return counters;
}

/** Applies one operational tab before board grouping so counts and cards share one source. */
export function filterOrdersForOperationalTab(orders: readonly OrderBoardItemDTO[], tab: OperationalTab): OrderBoardItemDTO[] {
  return orders.filter((order) => order.fulfillmentType === tab);
}
