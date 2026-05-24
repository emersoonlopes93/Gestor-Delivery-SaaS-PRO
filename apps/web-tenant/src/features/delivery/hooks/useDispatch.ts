import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { OrderDispatchItemDTO } from '@gestor/types';
import { invalidateLogisticsQueries, LOGISTICS_QUERY_KEYS } from '../lib/invalidate-logistics';

export function useDispatch() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.dispatchOrders,
    queryFn: async (): Promise<OrderDispatchItemDTO[]> => {
      const res = await api.get<OrderDispatchItemDTO[]>('/orders/operation/dispatch');
      return res.data ?? [];
    },
    refetchInterval: 15000,
    staleTime: 0,
  });

  const assignDriver = useMutation({
    mutationFn: async ({ orderId, driverId }: { orderId: string; driverId: string | null }) => {
      const res = await api.post<OrderDispatchItemDTO>(`/orders/${orderId}/assign-driver`, { driverId });
      return res.data;
    },
    onSuccess: (updated) => {
      invalidateLogisticsQueries(queryClient);
      if (updated) {
        queryClient.setQueryData<OrderDispatchItemDTO[]>(
          LOGISTICS_QUERY_KEYS.dispatchOrders,
          (current) => {
            if (!current) return [updated];
            const idx = current.findIndex((o) => o.id === updated.id);
            if (idx === -1) return [...current, updated];
            const next = [...current];
            next[idx] = updated;
            return next;
          },
        );
      }
    },
  });

  const dispatchOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.patch(`/orders/${orderId}/status`, {
        status: 'out_for_delivery',
        note: 'Despachado para entrega.',
      });
      return res.data;
    },
    onSuccess: () => {
      invalidateLogisticsQueries(queryClient);
    },
  });

  const completeOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.patch(`/orders/${orderId}/status`, {
        status: 'completed',
        note: 'Entrega finalizada com sucesso.',
      });
      return res.data;
    },
    onSuccess: () => {
      invalidateLogisticsQueries(queryClient);
    },
  });

  return {
    orders: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    assignDriver: (orderId: string, driverId: string | null) => assignDriver.mutateAsync({ orderId, driverId }),
    dispatchOrder: dispatchOrder.mutateAsync,
    completeOrder: completeOrder.mutateAsync,
  };
}
