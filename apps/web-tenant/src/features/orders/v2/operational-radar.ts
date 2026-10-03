import type { OrderBoardItemDTO } from '@gestor/types';
import { matchesOrderSearch } from './order-manager-v2';

export type RadarFilter = 'all' | 'kitchen' | 'ready' | 'route' | 'drivers' | 'marketplace';

export const RADAR_FILTERS: readonly { id: RadarFilter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'kitchen', label: 'Cozinha' }, { id: 'ready', label: 'Prontos' },
  { id: 'route', label: 'Em rota' }, { id: 'drivers', label: 'Motoboys' }, { id: 'marketplace', label: 'Marketplace' },
];

/** The Radar reads the reconciled board; coordinates are joined later only for real map pins. */
export function filterRadarOrders(orders: readonly OrderBoardItemDTO[], filter: RadarFilter, query: string): OrderBoardItemDTO[] {
  return orders.filter((order) => {
    if (order.fulfillmentType !== 'delivery' || !matchesOrderSearch(order, query)) return false;
    if (filter === 'kitchen') return ['pending', 'confirmed', 'preparing'].includes(order.status);
    if (filter === 'ready') return order.status === 'ready_for_delivery';
    if (filter === 'route') return order.status === 'out_for_delivery';
    if (filter === 'marketplace') return order.operational.origin !== 'PEDEHUB';
    return true;
  });
}
