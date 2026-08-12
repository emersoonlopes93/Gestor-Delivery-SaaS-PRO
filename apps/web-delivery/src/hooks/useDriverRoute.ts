import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import type { DriverWorkStateDTO } from '@gestor/types';
import { api } from '../lib/api';

const EMPTY_STATE: DriverWorkStateDTO = { shift: null, activeRun: null };

function unwrap<T>(payload: T | { success: boolean; data: T }): T {
  return payload && typeof payload === 'object' && 'success' in payload && 'data' in payload
    ? payload.data
    : payload as T;
}

export function driverActionError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível concluir esta ação.';
}

export function useDriverRoute() {
  const [workState, setWorkState] = useState<DriverWorkStateDTO>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.get<DriverWorkStateDTO>('/delivery/driver/work-state');
      setWorkState(unwrap(response.data));
      setError(null);
    } catch (requestError) {
      setError(driverActionError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const mutate = useCallback(async (request: () => Promise<unknown>) => {
    setIsMutating(true);
    setError(null);
    try {
      await request();
      await refresh();
      return true;
    } catch (requestError) {
      setError(driverActionError(requestError));
      return false;
    } finally {
      setIsMutating(false);
    }
  }, [refresh]);

  const runPath = (runId: string, action: string) =>
    `/delivery/driver/runs/${runId}/${action}`;
  const stopPath = (runId: string, stopId: string, action: string) =>
    `/delivery/driver/runs/${runId}/stops/${stopId}/${action}`;

  return {
    ...workState,
    isLoading,
    isMutating,
    error,
    refresh,
    startShift: () => mutate(() => api.post('/delivery/driver/shift/start')),
    endShift: () => mutate(() => api.post('/delivery/driver/shift/end')),
    acceptRun: (runId: string) => mutate(() => api.post(runPath(runId, 'accept'))),
    rejectRun: (runId: string, reason: string) => mutate(() => api.post(runPath(runId, 'reject'), { reason })),
    startRun: (runId: string) => mutate(() => api.post(runPath(runId, 'start'))),
    markArrived: (runId: string, stopId: string) => mutate(() => api.post(stopPath(runId, stopId, 'arrived'))),
    completeStop: (runId: string, stopId: string) => mutate(() => api.post(stopPath(runId, stopId, 'complete'))),
    markFailed: (runId: string, stopId: string, reason: string) => mutate(() => api.post(stopPath(runId, stopId, 'failed'), { reason })),
    confirmReturn: (runId: string, stopId: string) => mutate(() => api.post(stopPath(runId, stopId, 'returned'))),
    completeRun: (runId: string) => mutate(() => api.post(runPath(runId, 'complete'))),
  };
}
