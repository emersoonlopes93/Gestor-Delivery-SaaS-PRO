import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { OrderResponseDTO } from '@gestor/types';
import { PosFulfillmentType, PaymentMethod } from '@gestor/types';
import type { CreateOrderItemSelectionGroupDTO, CreateOrderItemComboSlotSelectionDTO, PizzaCompositionDTO } from '@gestor/types';

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
    selections?: CreateOrderItemSelectionGroupDTO[];
    pizzaComposition?: PizzaCompositionDTO;
    slots?: CreateOrderItemComboSlotSelectionDTO[];
  }>;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  fulfillmentType: PosFulfillmentType;
  tableNumber?: string;
  deliveryFee?: number;
  selectedAddressId?: string;
  deliveryAddress?: {
    street: string;
    number: string;
    neighborhood: string;
    complement?: string;
    reference?: string;
    zipCode?: string;
    city?: string;
    state?: string;
    lat?: number;
    lng?: number;
  };
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
        const res = await api.post('/pos/sales', payload);
        return res.data as OrderResponseDTO;
      } catch (error) {
        // Capturar erros específicos de conexão
        if (error instanceof Error && error.message.includes('Could not establish connection')) {
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
