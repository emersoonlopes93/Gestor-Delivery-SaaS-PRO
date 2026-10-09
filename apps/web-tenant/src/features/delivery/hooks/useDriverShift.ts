import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverWorkStateDTO } from '@gestor/types';
import { api } from '@/lib/api-client';

export function useDriverShift(driverId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ['delivery-driver-shift', driverId] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(driverId),
    queryFn: async (): Promise<DriverWorkStateDTO> => (
      await api.get<DriverWorkStateDTO>(`/delivery/runs/drivers/${driverId}/work-state`)
    ).data,
  });
  const mutate = useMutation({
    mutationFn: async (action: 'start' | 'end') => (
      await api.post<DriverWorkStateDTO>(`/delivery/runs/drivers/${driverId}/shift/${action}`)
    ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
  return {
    workState: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    isMutating: mutate.isPending,
    start: () => mutate.mutateAsync('start'),
    end: () => mutate.mutateAsync('end'),
  };
}
