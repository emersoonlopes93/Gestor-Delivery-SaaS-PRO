import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { DriverSettlementHistoryDTO, DriverSettlementSummaryDTO } from '@gestor/types';
import { api } from '../lib/api';

function unwrap<T>(payload: T | { success: boolean; data: T }): T {
  return payload && typeof payload === 'object' && 'success' in payload && 'data' in payload
    ? payload.data
    : payload as T;
}

function message(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') return error.response.data.message;
  return error instanceof Error && error.message ? error.message : 'Não foi possível carregar seus pagamentos registrados.';
}

export function useDriverSettlements() {
  const [summary, setSummary] = useState<DriverSettlementSummaryDTO | null>(null);
  const [history, setHistory] = useState<DriverSettlementHistoryDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [summaryResponse, historyResponse] = await Promise.all([
        api.get<DriverSettlementSummaryDTO>('/delivery/driver/settlements/summary'),
        api.get<DriverSettlementHistoryDTO[]>('/delivery/driver/settlements/history'),
      ]);
      setSummary(unwrap(summaryResponse.data));
      setHistory(unwrap(historyResponse.data));
      setError(null);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const getDetail = useCallback(async (settlementId: string): Promise<DriverSettlementHistoryDTO> => {
    const response = await api.get<DriverSettlementHistoryDTO>(`/delivery/driver/settlements/${settlementId}`);
    return unwrap(response.data);
  }, []);

  return { summary, history, isLoading, isRefreshing, error, refresh, getDetail };
}
