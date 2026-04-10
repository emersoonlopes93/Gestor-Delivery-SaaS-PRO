import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { OrderDispatchItemDTO, OrderStatus } from '@gestor/types';

export function useDispatch() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dispatchOrders'],
    queryFn: async (): Promise<OrderDispatchItemDTO[]> => {
      const res = await api.get('/orders/operation/dispatch');
      return res.data as OrderDispatchItemDTO[];
    },
    refetchInterval: 15000, // Poll every 15s to see new ready orders
  });

  const assignDriver = useMutation({
    mutationFn: async ({ orderId, driverId }: { orderId: string; driverId: string | null }) => {
      const res = await api.post(`/orders/${orderId}/assign-driver`, { driverId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatchOrders'] });
    },
  });

  const dispatchOrder = useMutation({
    mutationFn: async (orderId: string) => {
      // Transition from ready_for_delivery to out_for_delivery
      const res = await api.patch(`/orders/${orderId}/status`, {
        status: 'out_for_delivery',
        note: 'Despachado para entrega.',
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatchOrders'] });
    },
  });

  const completeOrder = useMutation({
    mutationFn: async (orderId: string) => {
      // Transition from out_for_delivery to completed
      const res = await api.patch(`/orders/${orderId}/status`, {
        status: 'completed',
        note: 'Entrega finalizada com sucesso.',
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatchOrders'] });
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
