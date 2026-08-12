import type { QueryClient } from '@tanstack/react-query';

export const LOGISTICS_QUERY_KEYS = {
  dispatchOrders: ['dispatchOrders'] as const,
  drivers: ['drivers'] as const,
  mapDrivers: ['delivery-map', 'drivers'] as const,
  mapOrders: ['delivery-map', 'orders'] as const,
  runBuilder: ['delivery-runs', 'builder'] as const,
  activeRuns: ['delivery-runs', 'active'] as const,
  runSettings: ['delivery-runs', 'settings'] as const,
};

/** Invalida caches compartilhados entre Despacho, Mapa e Entregadores. */
export function invalidateLogisticsQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: LOGISTICS_QUERY_KEYS.dispatchOrders });
  void queryClient.invalidateQueries({ queryKey: LOGISTICS_QUERY_KEYS.drivers });
  void queryClient.invalidateQueries({ queryKey: LOGISTICS_QUERY_KEYS.mapDrivers });
  void queryClient.invalidateQueries({ queryKey: LOGISTICS_QUERY_KEYS.mapOrders });
  void queryClient.invalidateQueries({ queryKey: LOGISTICS_QUERY_KEYS.runBuilder });
  void queryClient.invalidateQueries({ queryKey: LOGISTICS_QUERY_KEYS.activeRuns });
}
