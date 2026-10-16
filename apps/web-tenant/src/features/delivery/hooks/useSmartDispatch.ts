import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryRunDTO, SmartDispatchSuggestionDTO } from '@gestor/types';
import { api } from '@/lib/api-client';
import { invalidateLogisticsQueries } from '../lib/invalidate-logistics';

const SMART_DISPATCH_QUERY_KEY = ['delivery-runs', 'smart-dispatch', 'suggestion'] as const;

export function useSmartDispatch() {
  const queryClient = useQueryClient();
  const suggestion = useQuery({
    queryKey: SMART_DISPATCH_QUERY_KEY,
    queryFn: async (): Promise<SmartDispatchSuggestionDTO> => {
      const response = await api.get<SmartDispatchSuggestionDTO>('/delivery/runs/smart-dispatch/suggestion');
      return response.data;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  const accept = useMutation({
    mutationFn: async (payload: { driverId: string; orderIds: string[] }) => {
      const response = await api.post<DeliveryRunDTO>('/delivery/runs/smart-dispatch/accept', payload);
      return response.data;
    },
    onSuccess: () => {
      invalidateLogisticsQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: SMART_DISPATCH_QUERY_KEY });
    },
  });
  const overrideKds = useMutation({
    mutationFn: async (payload: { runId: string; reason: string }) => {
      const response = await api.post<DeliveryRunDTO>(`/delivery/runs/${payload.runId}/kds-override`, { reason: payload.reason });
      return response.data;
    },
    onSuccess: () => invalidateLogisticsQueries(queryClient),
  });

  return {
    suggestion: suggestion.data,
    isLoading: suggestion.isLoading,
    isRefreshing: suggestion.isFetching,
    isError: suggestion.isError,
    isStale: suggestion.isStale,
    refresh: suggestion.refetch,
    accept: accept.mutateAsync,
    isAccepting: accept.isPending,
    overrideKds: overrideKds.mutateAsync,
    isOverridingKds: overrideKds.isPending,
  };
}
