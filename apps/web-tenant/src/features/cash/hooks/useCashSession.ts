import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type {
  CashSessionDTO,
  CashSessionDetailDTO,
  CashMovementDTO,
} from '@gestor/types';

export function useActiveSession() {
  return useQuery<CashSessionDTO | null>({
    queryKey: ['cashSession', 'active'],
    queryFn: async () => {
      const res = await api.get('/cash/sessions/active');
      return (res.data as CashSessionDTO | null) || null;
    },
    refetchInterval: 15000,
  });
}

export function useCashSessions(page = 1, limit = 20) {
  return useQuery<{ data: CashSessionDTO[]; total: number }>({
    queryKey: ['cashSessions', page, limit],
    queryFn: async () => {
      const res = await api.get(`/cash/sessions?page=${page}&limit=${limit}`);
      return res.data as { data: CashSessionDTO[]; total: number };
    },
  });
}

export function useCashSessionDetail(sessionId: string | null) {
  return useQuery<CashSessionDetailDTO>({
    queryKey: ['cashSession', sessionId],
    queryFn: async () => {
      const res = await api.get(`/cash/sessions/${sessionId}`);
      return res.data as CashSessionDetailDTO;
    },
    enabled: !!sessionId,
  });
}

export function useOpenCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (openingAmount: number) => {
      const res = await api.post('/cash/sessions/open', { openingAmount });
      return res.data as CashSessionDTO;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cashSession'] });
      void qc.invalidateQueries({ queryKey: ['cashSessions'] });
    },
  });
}

export function useCloseCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { sessionId: string; closingAmountDeclared: number; notes?: string }) => {
      const res = await api.post(`/cash/sessions/${args.sessionId}/close`, {
        closingAmountDeclared: args.closingAmountDeclared,
        notes: args.notes,
      });
      return res.data as CashSessionDetailDTO;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cashSession'] });
      void qc.invalidateQueries({ queryKey: ['cashSessions'] });
    },
  });
}

export function useAddCashMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { sessionId: string; type: 'withdrawal' | 'supply'; amount: number; description?: string }) => {
      const res = await api.post(`/cash/sessions/${args.sessionId}/movements`, {
        type: args.type,
        amount: args.amount,
        description: args.description,
      });
      return res.data as CashMovementDTO;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cashSession'] });
    },
  });
}
