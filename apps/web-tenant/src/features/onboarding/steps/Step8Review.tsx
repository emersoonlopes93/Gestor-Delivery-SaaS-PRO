import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Rocket, Loader2, Store, MapPin, Clock, CreditCard, ShoppingBag, Settings2, Palette, AlertTriangle } from 'lucide-react';
import type { OnboardingCompletionCheck } from '@gestor/types';
import { useReadinessScore } from '../../../hooks/useReadinessScore';
import { OnboardingReadinessCard, OnboardingReadinessCardSkeleton } from '../../../components/ui/OnboardingReadinessCard';
import { ActivationTimeline } from '../../../components/ui/ActivationTimeline';
import { api, ApiError } from '../../../lib/api-client';
import type { OnboardingValidation } from '../useOnboardingState';

interface Step8Props {
  validation: OnboardingValidation;
  onActivate: () => Promise<void>;
  onPrev: () => void;
  goToStep: (index: number) => void;
}

interface CheckItem {
  key: keyof OnboardingValidation;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const CHECK_ITEMS: CheckItem[] = [
  { key: 'hasStoreName', label: 'Identidade da Loja', description: 'Nome e contato configurados', icon: Store },
  { key: 'hasAddress', label: 'Endereco cadastrado', description: 'Localizacao definida para entrega', icon: MapPin },
  { key: 'hasOperatingHours', label: 'Horarios definidos', description: 'Pelo menos 1 dia de funcionamento', icon: Clock },
  { key: 'hasPaymentMethod', label: 'Pagamento configurado', description: 'Ao menos 1 metodo de pagamento', icon: CreditCard },
  { key: 'hasOperationalModes', label: 'Modos operacionais', description: 'Entrega valida ou retirada ativa', icon: Settings2 },
  { key: 'hasProduct', label: 'Produto criado', description: 'Cardapio com ao menos 1 item', icon: ShoppingBag },
];

const OPTIONAL_ITEMS = [
  { label: 'Vitrine personalizada', description: 'Configuravel em Personalizacao', icon: Palette },
];

const REQUIREMENT_TO_STEP: Record<string, number> = {
  store_name: 0,
  structured_address: 1,
  store_coordinates: 1,
  operating_hours: 2,
  payment_methods: 3,
  catalog: 4,
  delivery_config: 1,
  order_modes: 5,
};

const REQUIREMENT_LABELS: Record<string, string> = {
  store_name: 'Nome da loja',
  structured_address: 'Endereco completo da loja',
  store_coordinates: 'Coordenadas da loja',
  operating_hours: 'Horarios de funcionamento',
  payment_methods: 'Metodos de pagamento',
  catalog: 'Pelo menos 1 produto ativo',
  delivery_config: 'Configuracao minima de entrega',
  order_modes: 'Pelo menos 1 modo operacional valido',
};

const WARNING_LABELS: Record<string, string> = {
  business_phone_recommended: 'Adicionar telefone/WhatsApp melhora o setup inicial.',
  logo_optional_missing: 'Logo continua opcional e pode ser configurada depois.',
  delivery_not_enabled: 'Entrega esta desativada; isso nao bloqueia a conclusao se sua operacao nao usar delivery.',
};

export function Step8Review({ validation, onActivate, onPrev, goToStep }: Step8Props) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [completionCheck, setCompletionCheck] = useState<OnboardingCompletionCheck | null>(null);
  const [checkingCompletion, setCheckingCompletion] = useState(true);

  const { data: readinessData, loading: readinessLoading } = useReadinessScore();

  const allValid = Object.values(validation).every(Boolean);
  const completedCount = Object.values(validation).filter(Boolean).length;
  const totalRequired = CHECK_ITEMS.length;

  const loadCompletionCheck = useCallback(async () => {
    setCheckingCompletion(true);
    try {
      const res = await api.get<OnboardingCompletionCheck>('/tenant/onboarding-completion-check');
      if (res.success) {
        setCompletionCheck(res.data);
      }
    } catch {
      setCompletionCheck(null);
    } finally {
      setCheckingCompletion(false);
    }
  }, []);

  useEffect(() => {
    void loadCompletionCheck();
  }, [loadCompletionCheck, validation]);

  const canActivate =
    completionCheck?.canComplete ??
    (readinessData ? readinessData.canActivate : allValid);

  const handleViewed = useCallback(() => {
    void api.post('/tenant/telemetry', {
      event: 'onboarding_readiness_viewed',
      payload: { step: 'review' },
    }).catch(() => {
      // telemetria nao bloqueia UX
    });
  }, []);

  const handleActivate = async () => {
    if (!canActivate) return;
    setActivating(true);
    setError('');
    try {
      await onActivate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        await loadCompletionCheck();
      } else {
        setError('Erro ao ativar a loja. Tente novamente.');
      }
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl mb-3 shadow-lg shadow-indigo-500/30">
          <Rocket className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Revisao Final</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Verifique se tudo esta pronto para ativar sua loja</p>
      </div>

      {checkingCompletion ? (
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          Validando requisitos oficiais do onboarding...
        </div>
      ) : completionCheck ? (
        <div className={`rounded-2xl border p-4 ${completionCheck.canComplete ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${completionCheck.canComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <div className="space-y-2">
              <p className={`text-sm font-black ${completionCheck.canComplete ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {completionCheck.canComplete ? 'Os requisitos minimos reais foram atendidos.' : 'Ainda faltam requisitos minimos para concluir o onboarding.'}
              </p>
              {!completionCheck.canComplete && completionCheck.missingRequirements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {completionCheck.missingRequirements.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        const targetStep = REQUIREMENT_TO_STEP[item];
                        if (targetStep !== undefined) {
                          goToStep(targetStep);
                        }
                      }}
                      className="rounded-full border border-amber-300/80 bg-white/80 px-3 py-1 text-xs font-black text-amber-700 transition-colors hover:bg-white"
                    >
                      {REQUIREMENT_LABELS[item] || item}
                    </button>
                  ))}
                </div>
              ) : null}
              {completionCheck.warnings.length > 0 ? (
                <div className="space-y-1">
                  {completionCheck.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-slate-600 dark:text-slate-300">
                      {WARNING_LABELS[warning] || warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {readinessLoading ? (
        <OnboardingReadinessCardSkeleton />
      ) : readinessData ? (
        <>
          <OnboardingReadinessCard
            data={readinessData}
            compact={false}
            onViewed={handleViewed}
            onAction={(dim) => {
              const stepMap: Record<string, number> = {
                profile: 0,
                location: 1,
                hours: 2,
                payments: 3,
                catalog: 4,
                delivery: 5,
                storefront: 6,
              };
              const targetStep = stepMap[dim.key];
              if (targetStep !== undefined) {
                goToStep(targetStep);
              } else {
                window.location.href = dim.actionPath;
              }
            }}
          />
          <div className="mt-6">
            <ActivationTimeline data={readinessData} />
          </div>
        </>
      ) : (
        <>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Progresso</span>
              <span className={`text-sm font-black ${allValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {completedCount}/{totalRequired} obrigatorios
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allValid ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                style={{ width: `${(completedCount / totalRequired) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Itens Obrigatorios</p>
            {CHECK_ITEMS.map(({ key, label, description, icon: Icon }) => {
              const ok = validation[key];
              return (
                <div
                  key={key}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                    ok
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-500'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm ${ok ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-700 dark:text-red-300'}`}>{label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>
                  </div>
                  {ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Opcional (pode configurar depois)</p>
            {OPTIONAL_ITEMS.map(({ label, description, icon: Icon }) => (
              <div key={label} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-700 text-slate-500">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-slate-700 dark:text-slate-300">{label}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{description}</div>
                </div>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">Depois</span>
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {!checkingCompletion && completionCheck && !completionCheck.canComplete && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            Complete os itens minimos indicados acima para concluir com seguranca.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          ← Voltar
        </button>
        <button
          onClick={handleActivate}
          disabled={!canActivate || activating || readinessLoading || checkingCompletion}
          className={`flex-[2] py-4 font-black rounded-2xl transition-all text-sm flex items-center justify-center gap-2 ${
            canActivate && !readinessLoading && !checkingCompletion
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {activating ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Ativando...</>
          ) : readinessLoading || checkingCompletion ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Verificando...</>
          ) : (
            <><Rocket className="w-4 h-4" />{canActivate ? 'Ativar Loja!' : 'Complete os itens obrigatorios'}</>
          )}
        </button>
      </div>
    </div>
  );
}
