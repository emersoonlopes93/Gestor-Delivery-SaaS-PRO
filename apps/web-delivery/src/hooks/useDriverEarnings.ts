import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { DriverEarningsSummaryDTO } from '@gestor/types';
import { api } from '../lib/api';

function unwrap<T>(payload: T | { success: boolean; data: T }): T {
  return payload && typeof payload === 'object' && 'success' in payload && 'data' in payload
    ? payload.data
    : payload as T;
}

function message(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') return error.response.data.message;
  return error instanceof Error && error.message ? error.message : 'Não foi possível carregar seus ganhos.';
}

export function useDriverEarnings() {
  const [summary, setSummary] = useState<DriverEarningsSummaryDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.get<DriverEarningsSummaryDTO>('/delivery/driver/earnings');
      setSummary(unwrap(response.data));
      setError(null);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.status === 404) {
        setSummary(null);
        setError(null);
      } else {
        setError(message(requestError));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const addCashTip = useCallback(async (orderId: string, amount: number): Promise<boolean> => {
    setIsMutating(true);
    setError(null);
    try {
      const response = await api.post<DriverEarningsSummaryDTO>('/delivery/driver/cash-tips', { orderId, amount });
      setSummary(unwrap(response.data));
      return true;
    } catch (requestError) {
      setError(message(requestError));
      return false;
    } finally {
      setIsMutating(false);
    }
  }, []);

  return { summary, isLoading, isMutating, error, refresh, addCashTip };
}
