import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  Store,
  MapPin,
  Truck,
  Clock,
  CreditCard,
  UtensilsCrossed,
  Palette,
} from 'lucide-react';
import type { ReadinessDimension, ReadinessScore, ReadinessStatus } from '../../hooks/useReadinessScore';
import { api } from '../../lib/api-client';

// ─── Mapa de ícones por dimensão ────────────────────────────────────────────

const DIMENSION_ICONS: Record<string, React.FC<{ className?: string }>> = {
  profile: Store,
  location: MapPin,
  delivery: Truck,
  hours: Clock,
  payments: CreditCard,
  catalog: UtensilsCrossed,
  storefront: Palette,
};

// ─── Labels de status ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ReadinessStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  not_configured: {
    label: 'Não Configurada',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-100 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800',
  },
  partially_configured: {
    label: 'Parcialmente Configurada',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
  },
  almost_ready: {
    label: 'Quase Pronta',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-800',
  },
  ready: {
    label: 'Pronta para Operação',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
};

// ─── Cor da barra de progresso ───────────────────────────────────────────────

function scoreBarColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface OnboardingReadinessCardProps {
  data: ReadinessScore;
  /** Modo compacto: sem checks individuais, apenas dimensões */
  compact?: boolean;
  /** Emitir evento de telemetria quando montado */
  onViewed?: () => void;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function OnboardingReadinessCard({
  data,
  compact = false,
  onViewed,
}: OnboardingReadinessCardProps) {
  const navigate = useNavigate();
  const statusCfg = STATUS_CONFIG[data.status];

  // Telemetria: emitir apenas quando o card for exibido ao usuário
  useEffect(() => {
    onViewed?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedDimensions = [...data.dimensions].sort((a, b) => {
    // 1. Requisitos obrigatórios primeiro (aqueles que falharam e são essenciais)
    // No frontend não temos a isCritical exata do ReadinessDimension, mas `!a.passed` e `!b.passed`
    // são a base para o sorting. Se a falhou e b não, a vem primeiro.
    if (a.passed !== b.passed) return a.passed ? 1 : -1;

    // 2. Score mais baixo
    if (a.score !== b.score) return a.score - b.score;

    // 3. Prioridade definida
    return (a.priority || 99) - (b.priority || 99);
  });

  const handleNavigate = async (dim: ReadinessDimension) => {
    // Telemetry: readiness_action_clicked
    try {
      await api.post('/tenant/telemetry', {
        event: 'readiness_action_clicked',
        payload: {
          dimension: dim.key,
          scoreBefore: data.score,
        },
      });
    } catch (e) {
      // ignore
    }
    navigate(dim.actionPath);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm">
              Prontidão da Loja
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {data.canActivate
                ? 'Sua loja está pronta para operar!'
                : 'Complete os itens abaixo para ativar sua loja.'}
            </p>
          </div>
          <span
            className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* Barra de progresso */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${scoreBarColor(data.score)}`}
              style={{ width: `${data.score}%` }}
            />
          </div>
          <span className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums w-10 text-right">
            {data.score}%
          </span>
        </div>
      </div>

      {/* Quick Fix List */}
      {!data.canActivate && sortedDimensions.filter(d => !d.passed).length > 0 && (
        <div className="px-5 pb-4">
          <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
            O que falta para ativar sua loja
          </h4>
          <div className="space-y-1.5">
            {sortedDimensions.filter(d => !d.passed).slice(0, 3).map(dim => (
              <button
                key={`qf-${dim.key}`}
                onClick={() => handleNavigate(dim)}
                aria-label={`Correção rápida: ${dim.actionLabel}`}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/50 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 truncate">
                    {dim.actionLabel || dim.label}
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dimensões */}
      <div className="px-4 pb-4 space-y-2">
        {sortedDimensions.map((dim) => (
          <DimensionRow
            key={dim.key}
            dim={dim}
            compact={compact}
            onNavigate={() => handleNavigate(dim)}
          />
        ))}
      </div>

      {/* Itens obrigatórios pendentes */}
      {data.missingRequirements.length > 0 && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
            Itens obrigatórios pendentes: conclua-os para ativar sua loja.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Linha de dimensão ───────────────────────────────────────────────────────

interface DimensionRowProps {
  dim: ReadinessDimension;
  compact: boolean;
  onNavigate: () => void;
}

function DimensionRow({ dim, compact, onNavigate }: DimensionRowProps) {
  const Icon = DIMENSION_ICONS[dim.key] ?? Store;
  const isPassed = dim.passed;

  return (
    <div
      className={`group rounded-xl border transition-all ${
        isPassed
          ? 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/10'
          : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-700'
      }`}
      onClick={() => !isPassed && onNavigate()}
      role={!isPassed ? 'button' : undefined}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Ícone */}
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isPassed
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Label + score */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-black truncate ${
                isPassed
                  ? 'text-emerald-800 dark:text-emerald-200'
                  : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {dim.label}
            </span>
            <span
              className={`shrink-0 text-[10px] font-black tabular-nums ${
                isPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {dim.score}%
            </span>
          </div>

          {/* Mini-barra da dimensão */}
          <div className="mt-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isPassed ? 'bg-emerald-400' : 'bg-indigo-400'
              }`}
              style={{ width: `${dim.score}%` }}
            />
          </div>
        </div>

        {/* Status icon / seta */}
        {isPassed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
        )}
      </div>

      {/* Checks individuais e Ações */}
      {!compact && !isPassed && (
        <div className="px-3 pb-2.5 space-y-3">
          {dim.checks.length > 0 && (
            <div className="space-y-1">
              {dim.checks.map((check) => (
                <div key={check.key} className="flex items-center gap-2 pl-10">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      check.passed ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold ${
                      check.passed
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action CTA */}
          {dim.actionLabel && (
            <div className="pl-10 pr-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate();
                }}
                aria-label={`Ação: ${dim.actionLabel}`}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-bold text-xs"
              >
                <span>{dim.actionLabel}</span>
                <ChevronRight className="w-4 h-4 opacity-70" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dimensão já concluída */}
      {!compact && isPassed && (
        <div className="px-3 pb-2.5 pl-13">
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            Configurado corretamente.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton de loading ─────────────────────────────────────────────────────

export function OnboardingReadinessCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-36" />
        <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded-full w-28" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full" />
        <div className="h-4 w-10 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-50 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
      <div className="flex items-center justify-center py-2">
        <Loader2 className="w-4 h-4 text-slate-300 dark:text-slate-600 animate-spin" />
      </div>
    </div>
  );
}
