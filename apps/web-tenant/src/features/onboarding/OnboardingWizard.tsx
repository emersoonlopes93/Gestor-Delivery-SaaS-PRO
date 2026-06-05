import { useState } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { Store, Clock, CreditCard, MessageSquare, Menu, LayoutDashboard, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import type { TenantUserSession } from '@gestor/types';

const STEPS = [
  { id: 'stepBasicInfo', title: 'Dados da Loja', icon: Store, description: 'Nome e informações básicas.' },
  { id: 'stepOperatingHours', title: 'Horários', icon: Clock, description: 'Quando sua loja atende.' },
  { id: 'stepWhatsapp', title: 'WhatsApp & IA', icon: MessageSquare, description: 'Assistente virtual.' },
  { id: 'stepMenu', title: 'Cardápio', icon: Menu, description: 'Categorias e produtos.' },
  { id: 'stepCatalog', title: 'Catálogo Digital', icon: LayoutDashboard, description: 'Link e visibilidade.' },
  { id: 'stepPayments', title: 'Billing', icon: CreditCard, description: 'Ativação do Plano Único.' },
];

export function OnboardingWizard() {
  const { user, setUser } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  if (!user || user.onboardingCompletedAt) {
    return null;
  }

  const handleNext = async () => {
    setLoading(true);
    try {
      if (currentStep < STEPS.length - 1) {
        // Here you could save intermediate steps via API
        setCurrentStep(c => c + 1);
      } else {
        // Finish onboarding
        await api.post('/tenant/onboarding-complete');
        if (user) {
          setUser({ ...user, onboardingCompletedAt: new Date().toISOString() } as TenantUserSession);
        }
      }
    } catch (err) {
      console.error('Failed to complete step', err);
    } finally {
      setLoading(false);
    }
  };

  const StepIcon = STEPS[currentStep].icon;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        {/* Left Side: Progress Menu */}
        <div className="w-full md:w-1/3 bg-slate-50 p-8 border-r border-slate-100 flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Setup Inicial</h2>
          <div className="space-y-4 flex-grow overflow-y-auto pr-2 custom-scrollbar">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStep;
              const isPast = idx < currentStep;

              return (
                <div key={step.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 border border-indigo-100' : 'opacity-70'}`}>
                  <div className={`mt-0.5 ${isActive ? 'text-indigo-600' : isPast ? 'text-green-500' : 'text-slate-400'}`}>
                    {isPast ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{step.title}</h4>
                    <p className="text-xs text-slate-500">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Step Content */}
        <div className="w-full md:w-2/3 p-8 md:p-12 flex flex-col">
          <div className="flex-grow flex flex-col justify-center items-center text-center">
            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
              <StepIcon className="w-10 h-10 text-indigo-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">{STEPS[currentStep].title}</h3>
            <p className="text-slate-600 mb-8 max-w-md">
              Configure as opções essenciais para esta etapa. Suas configurações serão salvas automaticamente.
            </p>

            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-6 text-slate-500 italic text-sm">
              (Opções e configurações da etapa {STEPS[currentStep].title} iriam aqui)
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {currentStep < STEPS.length - 1 ? 'Salvar e Continuar' : 'Finalizar Setup'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
