import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { OrderResponseDTO, PosOrderListItemDTO } from '@gestor/types';
import { PosFulfillmentType, PaymentMethod } from '@gestor/types';

export interface PosCreateSalePayload {
  idempotencyKey: string;
  items: Array<{
    lineType: 'product' | 'combo';
    productId?: string;
    comboId?: string;
    quantity: number;
    notes?: string;
    complements?: Array<{ groupId: string; itemId: string }>;
    comboSelections?: Array<{ blockId: string; blockItemId: string }>;
  }>;
  customerName?: string;
  customerPhone?: string;
  fulfillmentType: PosFulfillmentType;
  tableNumber?: string;
  paymentMethod: PaymentMethod;
  discountTotal?: number;
  notes?: string;
  couponCode?: string;
  useCashbackAmount?: number;
}

export function useCreatePosSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PosCreateSalePayload) => {
      try {
        console.log('Creating POS sale with payload:', payload);
        const res = await api.post('/pos/sales', payload);
        console.log('POS sale created successfully:', res.data);
        return res.data as OrderResponseDTO;
      } catch (error) {
        console.error('Error creating POS sale:', error);
        
        // Capturar erros específicos de conexão
        if (error instanceof Error && error.message.includes('Could not establish connection')) {
          console.error('Chrome extension connection error detected - this may be caused by browser extensions');
          // Relançar com mensagem mais amigável
          throw new Error('Erro de conexão. Tente desabilitar extensões do navegador e recarregar a página.');
        }
        
        throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['posSales'] });
      void qc.invalidateQueries({ queryKey: ['cashSession'] });
    },
  });
}

export function useCancelPosSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/pos/sales/${orderId}/cancel`);
      return res.data as OrderResponseDTO;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['posSales'] });
      void qc.invalidateQueries({ queryKey: ['cashSession'] });
    },
  });
}
