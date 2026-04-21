import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PosCreateSalePayload } from './usePosSale';
import { useToast } from '@/hooks/use-toast';

export function useDraftSale() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: PosCreateSalePayload & { id?: string }) => {
      const res = await api.post<any>('/pos/draft', payload);
      if (!res.success) throw new Error(res.error?.message || 'Erro ao salvar comanda');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
      toast({
        title: 'Comanda Salva',
        description: `Mesa ${data.tableNumber || ''} atualizada com sucesso.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Erro ao Salvar',
        description: err.message,
        variant: 'destructive',
      });
    }
  });
}
