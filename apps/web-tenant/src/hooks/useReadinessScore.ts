import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api-client';

// ─── Tipos (espelham o backend ReadinessScoreDto) ────────────────────────────

export type ReadinessStatus =
  | 'not_configured'
  | 'partially_configured'
  | 'almost_ready'
  | 'ready';

export interface ReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
}

export interface ReadinessDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  passed: boolean;
  actionPath: string;
  checks: ReadinessCheck[];
}

export interface ReadinessScore {
  score: number;
  status: ReadinessStatus;
  dimensions: ReadinessDimension[];
  missingRequirements: string[];
  canActivate: boolean;
  calculatedAt: string;
}

interface UseReadinessScoreResult {
  data: ReadinessScore | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useReadinessScore(): UseReadinessScoreResult {
  const [data, setData] = useState<ReadinessScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ReadinessScore>('/tenant/readiness-score');
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError('Não foi possível carregar o score de prontidão.');
      }
    } catch {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
