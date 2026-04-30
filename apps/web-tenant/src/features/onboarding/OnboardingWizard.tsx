import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { CheckCircle2, Building, CreditCard, Loader2 } from 'lucide-react';
import type { TenantUserSession } from '@gestor/types';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price: number;
  billingCycle: string;
}

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Info
  const [tenantName, setTenantName] = useState('');
  
  // Step 2: Plan
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  useEffect(() => {
    // If tenant already completed, just send to dashboard
    if (user?.onboardingCompletedAt) {
      navigate('/dashboard', { replace: true });
      return;
    }
    
    // Default name
    setTenantName(user?.tenant?.name || '');

    // Fetch plans
    setLoading(true);
    api.get<Plan[]>('/billing/plans')
       .then(res => setPlans(res.data))
       .catch(err => console.error('Error fetching plans', err))
       .finally(() => setLoading(false));
  }, [user, navigate]);

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
    if (!selectedPlan) return;
    setLoading(true);
    try {
      // Create Subscription
      await api.post('/billing/subscription', { planId: selectedPlan });
      // Update step progress
      await api.patch('/tenant/onboarding-step', { step: 'payment', completed: true });
      setStep(3);
    } catch (err) {
      console.error('Failed to subscribe', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.post('/tenant/onboarding-complete');
      // Update local state to bypass guard
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
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col">
        {/* Header */}
        <div className="bg-primary-600 px-8 py-10 text-white min-h-[160px] flex flex-col justify-center">
          <h1 className="text-3xl font-black mb-2 tracking-tight">Bem-vindo ao Gestor Delivery PRO</h1>
          <p className="text-primary-100 font-medium">Configure sua loja e escolha um plano para começar a vender.</p>
        </div>

        {/* Steps */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 py-3 px-8">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
            <Building className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Restaurante</span>
          </div>
          <div className="mx-4 text-gray-300">/</div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
            <CreditCard className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Plano</span>
          </div>
          <div className="mx-4 text-gray-300">/</div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary-600' : 'text-gray-400'}`}>
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Pronto</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 flex-1">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Confirme os dados da sua loja</h2>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Nome do Restaurante</label>
                  <input type="text" value={tenantName} onChange={e => setTenantName(e.target.value)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <button onClick={handleNextSetup} disabled={!tenantName}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95">
                  Continuar
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Escolha seu Plano</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-lg">Todos os planos incluem 7 dias grátis para testes. O faturamento começará automaticamente após este período caso não seja cancelado.</p>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {plans.length === 0 && !loading && (
                  <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800">
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum plano disponível no momento.</p>
                  </div>
                )}
                {loading && plans.length === 0 && (
                   <div className="col-span-full py-12 flex justify-center">
                     <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                   </div>
                )}
                {plans.map(plan => (
                  <div key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                    className={`border-2 rounded-2xl p-6 cursor-pointer transition-all ${
                      selectedPlan === plan.id 
                        ? 'border-primary-500 bg-primary-50 shadow-md ring-4 ring-primary-50' 
                        : 'border-gray-200 dark:border-gray-800 hover:border-primary-300'
                    }`}>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-2xl font-black">{plan.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">/{plan.billingCycle === 'monthly' ? 'mês' : 'ano'}</span>
                    </div>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 mb-6">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-green-500" /> Cardápio Ilimitado</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-green-500" /> POS Integrado</li>
                      {plan.price > 100 && (
                        <li className="flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 text-green-500" /> Integração iFood</li>
                      )}
                    </ul>
                    <div className={`w-full text-center py-2 rounded-lg font-bold text-sm ${
                      selectedPlan === plan.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 dark:text-gray-300'
                    }`}>
                      {selectedPlan === plan.id ? 'Selecionado' : 'Selecionar'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button onClick={() => setStep(1)} disabled={loading}
                  className="px-6 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                  Voltar
                </button>
                <button onClick={handleSubscribe} disabled={!selectedPlan || loading}
                  className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Assinar Plano
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center py-12 max-w-md mx-auto">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-3">Tudo Certo!</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">Sua loja já foi pré-configurada em nosso sistema e seu trial de 7 dias grátis começou.</p>
              
              <button onClick={handleComplete} disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-lg uppercase tracking-wider">
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                Acessar meu Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
