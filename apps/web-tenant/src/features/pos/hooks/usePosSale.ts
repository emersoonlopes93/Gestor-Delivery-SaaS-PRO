import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { OrderResponseDTO, PosOrderListItemDTO } from '@gestor/types';

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
  fulfillmentType: 'dine_in' | 'pickup' | 'delivery';
  paymentMethod: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'other';
  discountTotal?: number;
  notes?: string;
}

export function useCreatePosSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PosCreateSalePayload) => {
      const res = await api.post('/pos/sales', payload);
      return res.data as OrderResponseDTO;
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
