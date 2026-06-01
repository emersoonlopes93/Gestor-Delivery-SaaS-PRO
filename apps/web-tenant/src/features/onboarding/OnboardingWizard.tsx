import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { Building, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import type { TenantUserSession } from '@gestor/types';

type DecimalLike = string | number;

type BillingRevenueTier = {
  id: string;
  minRevenue: DecimalLike;
  maxRevenue: DecimalLike | null;
  price: DecimalLike;
  label: string | null;
  sortOrder: number;
};

type BillingPlanV2 = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  trialDays: number;
  requiresPaymentMethod: boolean;
  allowAllModules: boolean;
  revenueTiers: BillingRevenueTier[];
};

function formatCurrency(value: DecimalLike): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<BillingPlanV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');

  useEffect(() => {
    if (user?.onboardingCompletedAt) {
      navigate('/dashboard', { replace: true });
      return;
    }

    setTenantName(user?.tenant?.name || '');
    setLoading(true);
    api.get<BillingPlanV2[]>('/billing/plans')
      .then((res) => {
        setPlans(res.data);
        setSelectedPlan(res.data[0]?.id ?? '');
      })
      .catch((err) => console.error('Error fetching billing plans', err))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  const chosenPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlan) ?? plans[0] ?? null,
    [plans, selectedPlan],
  );

  const handleNextSetup = async () => {
    if (!tenantName) return;
    setLoading(true);
    try {
      await api.patch('/tenant', { name: tenantName });
      await api.patch('/tenant/onboarding-step', { step: 'basicInfo', completed: true });
      setStep(2);
    } catch (err) {
      console.error('Failed to save step 1', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    const planId = selectedPlan || chosenPlan?.id;
    if (!planId) return;
    setLoading(true);
    try {
      await api.post('/billing/subscription', { planId });
      await api.patch('/tenant/onboarding-step', { step: 'payment', completed: true });
      setStep(3);
    } catch (err) {
      console.error('Failed to activate Billing V2 subscription', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.post('/tenant/onboarding-complete');
      if (user) {
        setUser({ ...user, onboardingCompletedAt: new Date().toISOString() } as TenantUserSession);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Failed to complete onboarding', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col">
        <div className="bg-primary-600 px-8 py-10 text-white min-h-[160px] flex flex-col justify-center">
          <h1 className="text-3xl font-black mb-2 tracking-tight">Bem-vindo ao Gestor Delivery PRO</h1>
          <p className="text-primary-100 font-medium">Configure sua loja com plano por faturamento mensal.</p>
        </div>

        <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 py-3 px-8">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
            <Building className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Restaurante</span>
          </div>
          <div className="mx-4 text-gray-300">/</div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
            <CreditCard className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Billing V2</span>
          </div>
          <div className="mx-4 text-gray-300">/</div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary-600' : 'text-gray-400'}`}>
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Pronto</span>
          </div>
        </div>

        <div className="p-8 flex-1">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Confirme os dados da sua loja</h2>
              <div className="space-y-4 max-w-md">
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Nome do restaurante</span>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(event) => setTenantName(event.target.value)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleNextSetup}
                  disabled={!tenantName}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-60"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Plano por faturamento</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-2xl">
                A mensalidade estimada varia conforme o faturamento mensal apurado. Cobrança automática ainda não está ativa.
              </p>

              {loading && plans.length === 0 ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : null}

              {chosenPlan ? (
                <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 mb-8">
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(chosenPlan.id)}
                    className="text-left border-2 border-primary-500 bg-primary-50 dark:bg-primary-950/30 rounded-2xl p-6 shadow-md ring-4 ring-primary-50 dark:ring-primary-950/20"
                  >
                    <h3 className="font-black text-lg text-gray-900 dark:text-gray-100 mb-1">{chosenPlan.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{chosenPlan.description}</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-white dark:bg-gray-900 p-3 border border-gray-100 dark:border-gray-800">
                        <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Trial</span>
                        <span className="font-bold">{chosenPlan.trialDays} dias</span>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-gray-900 p-3 border border-gray-100 dark:border-gray-800">
                        <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Módulos</span>
                        <span className="font-bold">{chosenPlan.allowAllModules ? 'Todos liberados' : 'Conforme plano'}</span>
                      </div>
                    </div>
                    {chosenPlan.requiresPaymentMethod ? (
                      <p className="mt-4 text-xs font-bold text-amber-700 dark:text-amber-300">
                        Método de pagamento marcado como obrigatório, mas nesta fase é apenas uma pendência futura.
                      </p>
                    ) : null}
                  </button>

                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800 text-xs font-black uppercase tracking-widest text-gray-500">
                      Faixas de faturamento
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {chosenPlan.revenueTiers.map((tier) => (
                        <div key={tier.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                          <span className="font-bold text-gray-800 dark:text-gray-200">{tier.label}</span>
                          <span className="text-gray-500 dark:text-gray-400">{formatCurrency(tier.price)}/mês</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 mb-8">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum plano Billing V2 disponível no momento.</p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="px-6 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={(!selectedPlan && !chosenPlan) || loading}
                  className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Ativar Billing V2
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-12 max-w-md mx-auto">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-3">Billing V2 ativo</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Seu trial começou e os módulos do plano foram liberados sem cobrança automática.
              </p>
              <button
                type="button"
                onClick={handleComplete}
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-lg uppercase tracking-wider disabled:opacity-60"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                Acessar dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
