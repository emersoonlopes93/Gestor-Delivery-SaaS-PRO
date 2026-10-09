import { useEffect, useMemo, useState } from 'react';
import {
  getOrdersRealtimeConnectionState,
  subscribeOrdersRealtimeEvents,
  type OrdersRealtimeConnectionState,
} from '../../../notifications/ordersRealtimeEvents';
import { isOrdersSnapshotStale } from '../order-reconciliation';

export function useOrdersRealtimeState(lastConfirmedAt: number | null): {
  connectionState: OrdersRealtimeConnectionState;
  isStale: boolean;
  now: number;
} {
  const [connectionState, setConnectionState] = useState(getOrdersRealtimeConnectionState);
  const [now, setNow] = useState(Date.now);

  useEffect(() => subscribeOrdersRealtimeEvents((event) => {
    if (event.type === 'connection') setConnectionState(event.state);
  }), []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(() => ({
    connectionState,
    isStale: isOrdersSnapshotStale(lastConfirmedAt, now),
    now,
  }), [connectionState, lastConfirmedAt, now]);
}
