import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverEarningsSummaryDTO } from '@gestor/types';
import { api } from '@/lib/api-client';

const earningsKey = (driverId: string) => ['driver-earnings', driverId] as const;

export function useDriverEarnings(driverId: string | null) {
  const queryClient = useQueryClient();
  const earnings = useQuery({
    queryKey: earningsKey(driverId ?? 'none'),
    enabled: Boolean(driverId),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async (): Promise<DriverEarningsSummaryDTO> => {
      const response = await api.get<DriverEarningsSummaryDTO>(`/delivery/runs/drivers/${driverId}/earnings`);
      return response.data;
    },
  });
  const update = (summary: DriverEarningsSummaryDTO) => queryClient.setQueryData(earningsKey(driverId ?? 'none'), summary);
  const cashTip = useMutation({
    mutationFn: async (payload: { orderId: string; amount: number }) => {
      const response = await api.post<DriverEarningsSummaryDTO>('/delivery/runs/cash-tips', { driverId, ...payload });
      return response.data;
    },
    onSuccess: update,
  });
  const adjustment = useMutation({
    mutationFn: async (payload: { amount: number; reason: string }) => {
      const response = await api.post<DriverEarningsSummaryDTO>('/delivery/runs/adjustments', { driverId, ...payload });
      return response.data;
    },
    onSuccess: update,
  });

  return {
    summary: earnings.data ?? null,
    isLoading: earnings.isLoading,
    isError: earnings.isError,
    error: earnings.error,
    isMutating: cashTip.isPending || adjustment.isPending,
    addCashTip: cashTip.mutateAsync,
    addAdjustment: adjustment.mutateAsync,
  };
}
