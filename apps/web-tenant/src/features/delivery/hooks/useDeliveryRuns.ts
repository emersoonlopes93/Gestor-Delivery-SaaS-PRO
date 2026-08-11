import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeliveryRunBuilderDataDTO,
  DeliveryRunDTO,
  DeliveryRunSettingsDTO,
} from '@gestor/types';
import { api } from '@/lib/api-client';
import { invalidateLogisticsQueries, LOGISTICS_QUERY_KEYS } from '../lib/invalidate-logistics';

export function useDeliveryRuns() {
  const queryClient = useQueryClient();
  const builder = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.runBuilder,
    queryFn: async (): Promise<DeliveryRunBuilderDataDTO> => {
      const response = await api.get<DeliveryRunBuilderDataDTO>('/delivery/runs/builder');
      return response.data ?? { drivers: [], orders: [] };
    },
    refetchInterval: 15_000,
  });
  const activeRuns = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.activeRuns,
    queryFn: async (): Promise<DeliveryRunDTO[]> => {
      const response = await api.get<DeliveryRunDTO[]>('/delivery/runs/active');
      return response.data ?? [];
    },
    refetchInterval: 15_000,
  });
  const settings = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.runSettings,
    queryFn: async (): Promise<DeliveryRunSettingsDTO> => {
      const response = await api.get<DeliveryRunSettingsDTO>('/delivery/runs/settings');
      return response.data ?? { requiresAcceptance: true };
    },
  });
  const createRun = useMutation({
    mutationFn: async (payload: { driverId: string; orderIds: string[] }) => {
      const response = await api.post<DeliveryRunDTO>('/delivery/runs', payload);
      return response.data;
    },
    onSuccess: () => invalidateLogisticsQueries(queryClient),
  });
  const reorderStops = useMutation({
    mutationFn: async (payload: { runId: string; stopIds: string[]; expectedVersion: number }) => {
      const response = await api.patch<DeliveryRunDTO>(`/delivery/runs/${payload.runId}/reorder`, {
        stopIds: payload.stopIds,
        expectedVersion: payload.expectedVersion,
      });
      return response.data;
    },
    onSuccess: () => invalidateLogisticsQueries(queryClient),
  });
  const updateSettings = useMutation({
    mutationFn: async (requiresAcceptance: boolean) => {
      const response = await api.patch<DeliveryRunSettingsDTO>('/delivery/runs/settings', { requiresAcceptance });
      return response.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(LOGISTICS_QUERY_KEYS.runSettings, updated);
    },
  });

  return {
    builder: builder.data ?? { drivers: [], orders: [] },
    activeRuns: activeRuns.data ?? [],
    settings: settings.data ?? { requiresAcceptance: true },
    isLoading: builder.isLoading || activeRuns.isLoading || settings.isLoading,
    isError: builder.isError || activeRuns.isError || settings.isError,
    createRun: createRun.mutateAsync,
    isCreating: createRun.isPending,
    reorderStops: reorderStops.mutateAsync,
    updateSettings: updateSettings.mutateAsync,
  };
}
