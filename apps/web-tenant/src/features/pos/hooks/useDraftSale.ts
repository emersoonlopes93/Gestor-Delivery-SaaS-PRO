import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PosCreateSalePayload } from './usePosSale';

export function useDraftSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PosCreateSalePayload & { id?: string }) => {
      const res = await api.post<{ id: string }>('/pos/draft', payload);
      if (!res.success) {
        throw new Error('Erro ao salvar comanda');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
    }
  });
}
