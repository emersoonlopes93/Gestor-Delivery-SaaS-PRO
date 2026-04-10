import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { DriverDTO, CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';

export function useDrivers() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['drivers'],
    queryFn: async (): Promise<DriverDTO[]> => {
      const res = await api.get('/delivery/drivers');
      return res.data as DriverDTO[];
    },
  });

  const createDriver = useMutation({
    mutationFn: async (payload: CreateDriverDTO) => {
      const res = await api.post('/delivery/drivers', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });

  const updateDriver = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateDriverDTO }) => {
      const res = await api.patch(`/delivery/drivers/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/delivery/drivers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });

  return {
    drivers: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    createDriver: createDriver.mutateAsync,
    updateDriver: (id: string, payload: UpdateDriverDTO) => updateDriver.mutateAsync({ id, payload }),
    deleteDriver: deleteDriver.mutateAsync,
  };
}
