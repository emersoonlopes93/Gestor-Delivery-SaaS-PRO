import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PosCreateSalePayload } from './usePosSale';

export function useDraftSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PosCreateSalePayload & { id?: string }) => {
      const res = await api.post<any>('/pos/draft', payload);
      const data = res.data;
      if (res.status >= 400) {
        throw new Error(data?.message || 'Erro ao salvar comanda');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
    },
    onError: (err: Error) => {
      console.error('Draft save error:', err.message);
    }
  });
}
