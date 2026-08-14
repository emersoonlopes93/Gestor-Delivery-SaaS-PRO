import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDriverSettlementDTO,
  DriverSettlementHistoryDTO,
  DriverSettlementShiftDTO,
  DriverSettlementSummaryDTO,
} from '@gestor/types';
import { DriverShiftPaymentStatus } from '@gestor/types';
import { api, ApiError } from '@/lib/api-client';
import { driverSettlementPeriodSuffix, type DriverSettlementPeriod } from './driver-settlement-query';

export type SettlementPeriod = DriverSettlementPeriod;

const rootKey = (driverId: string) => ['driver-settlements', driverId] as const;
const EMPTY_SHIFTS: DriverSettlementShiftDTO[] = [];
const EMPTY_HISTORY: DriverSettlementHistoryDTO[] = [];

export function settlementErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Um destes turnos acabou de ser quitado por outro gestor. Atualize a lista antes de tentar novamente.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível carregar as informações financeiras.';
}

export function useDriverSettlements(driverId: string | null, canRead: boolean, period: SettlementPeriod) {
  const queryClient = useQueryClient();
  const enabled = Boolean(driverId && canRead);
  const id = driverId ?? 'none';

  const summary = useQuery({
    queryKey: [...rootKey(id), 'summary'],
    enabled,
    retry: false,
    queryFn: async (): Promise<DriverSettlementSummaryDTO> => (
      await api.get<DriverSettlementSummaryDTO>(`/delivery/settlements/drivers/${driverId}/summary`)
    ).data,
  });
  const pending = useQuery({
    queryKey: [...rootKey(id), 'shifts', DriverShiftPaymentStatus.PENDING, period.from, period.to],
    enabled,
    retry: false,
    queryFn: async (): Promise<DriverSettlementShiftDTO[]> => (
      await api.get<DriverSettlementShiftDTO[]>(`/delivery/settlements/drivers/${driverId}/shifts?status=${DriverShiftPaymentStatus.PENDING}${driverSettlementPeriodSuffix(period)}`)
    ).data,
  });
  const paid = useQuery({
    queryKey: [...rootKey(id), 'shifts', DriverShiftPaymentStatus.PAID, period.from, period.to],
    enabled,
    retry: false,
    queryFn: async (): Promise<DriverSettlementShiftDTO[]> => (
      await api.get<DriverSettlementShiftDTO[]>(`/delivery/settlements/drivers/${driverId}/shifts?status=${DriverShiftPaymentStatus.PAID}${driverSettlementPeriodSuffix(period)}`)
    ).data,
  });
  const history = useQuery({
    queryKey: [...rootKey(id), 'history'],
    enabled,
    retry: false,
    queryFn: async (): Promise<DriverSettlementHistoryDTO[]> => (
      await api.get<DriverSettlementHistoryDTO[]>(`/delivery/settlements/drivers/${driverId}/history`)
    ).data,
  });
  const create = useMutation({
    mutationFn: async (payload: CreateDriverSettlementDTO): Promise<DriverSettlementHistoryDTO> => (
      await api.post<DriverSettlementHistoryDTO>('/delivery/settlements', payload)
    ).data,
  });

  return {
    summary: summary.data ?? null,
    pending: pending.data ?? EMPTY_SHIFTS,
    paid: paid.data ?? EMPTY_SHIFTS,
    history: history.data ?? EMPTY_HISTORY,
    isSummaryLoading: summary.isLoading,
    isPendingLoading: pending.isLoading,
    isPaidLoading: paid.isLoading,
    isHistoryLoading: history.isLoading,
    summaryError: summary.error,
    pendingError: pending.error,
    paidError: paid.error,
    historyError: history.error,
    isCreating: create.isPending,
    createSettlement: create.mutateAsync,
    getDetail: async (settlementId: string): Promise<DriverSettlementHistoryDTO> => (
      await api.get<DriverSettlementHistoryDTO>(`/delivery/settlements/${settlementId}`)
    ).data,
    refresh: async () => queryClient.invalidateQueries({ queryKey: rootKey(id) }),
  };
}
