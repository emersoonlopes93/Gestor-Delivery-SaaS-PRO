import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  Clock,
  CreditCard,
  ShoppingBag,
  Settings2,
  Palette,
  CheckCircle2,
  Rocket,
  Cloud,
  CloudOff,
  RefreshCw,
  X,
  Link2,
} from 'lucide-react';

import { useOnboardingState, AutoSaveStatus } from './useOnboardingState';
import { Step1Identity } from './steps/Step1Identity';
import { Step2Location } from './steps/Step2Location';
import { Step3Hours } from './steps/Step3Hours';
import { Step4Payments } from './steps/Step4Payments';
import { Step5Product } from './steps/Step5Product';
import { Step6Rules } from './steps/Step6Rules';
import { Step7Storefront } from './steps/Step7Storefront';
import { Step8Ifood } from './steps/Step8Ifood';
import { Step8Review } from './steps/Step8Review';

interface StepMeta {
  id: string;
  title: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
  colorClass: string;
  bgClass?: string;
  required: boolean;
}

const STEPS: StepMeta[] = [
  { id: 'identity', title: 'Identidade', subtitle: 'Nome, logo, contato', icon: Store, colorClass: 'text-indigo-500', bgClass: 'bg-indigo-100 dark:bg-indigo-500/20', required: true },
  { id: 'location', title: 'Localizacao', subtitle: 'Endereco e entrega', icon: MapPin, colorClass: 'text-emerald-500', required: true },
  { id: 'hours', title: 'Horarios', subtitle: 'Quando voce atende', icon: Clock, colorClass: 'text-amber-500', required: true },
  { id: 'payments', title: 'Pagamentos', subtitle: 'Como cobrar os clientes', icon: CreditCard, colorClass: 'text-violet-500', required: true },
  { id: 'products', title: 'Produtos', subtitle: 'Seu primeiro item no menu', icon: ShoppingBag, colorClass: 'text-orange-500', required: true },
  { id: 'rules', title: 'Pedidos', subtitle: 'Entrega, retirada e agenda', icon: Settings2, colorClass: 'text-teal-500', required: true },
  { id: 'storefront', title: 'Vitrine', subtitle: 'Visual da loja online', icon: Palette, colorClass: 'text-pink-500', required: false },
  { id: 'ifood', title: 'iFood', subtitle: 'Conexao opcional em beta', icon: Link2, colorClass: 'text-sky-500', required: false },
  { id: 'review', title: 'Revisao', subtitle: 'Ativar sua loja', icon: Rocket, colorClass: 'text-indigo-600', required: false },
];

function getStepBgClass(step: StepMeta) {
  if (step.bgClass) return step.bgClass;

  const map: Record<string, string> = {
    'text-indigo-500': 'bg-indigo-100 dark:bg-indigo-500/20',
    'text-indigo-600': 'bg-indigo-100 dark:bg-indigo-500/20',
    'text-emerald-500': 'bg-emerald-100 dark:bg-emerald-500/20',
    'text-amber-500': 'bg-amber-100 dark:bg-amber-500/20',
    'text-violet-500': 'bg-violet-100 dark:bg-violet-500/20',
    'text-orange-500': 'bg-orange-100 dark:bg-orange-500/20',
    'text-teal-500': 'bg-teal-100 dark:bg-teal-500/20',
    'text-pink-500': 'bg-pink-100 dark:bg-pink-500/20',
    'text-sky-500': 'bg-sky-100 dark:bg-sky-500/20',
  };

  return map[step.colorClass] ?? 'bg-slate-100 dark:bg-slate-800';
}

function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') return null;

  const config = {
    saving: { icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />, text: 'Salvando...', cls: 'text-slate-500 dark:text-slate-400' },
    saved: { icon: <Cloud className="w-3.5 h-3.5" />, text: 'Salvo', cls: 'text-emerald-600 dark:text-emerald-400' },
    error: { icon: <CloudOff className="w-3.5 h-3.5" />, text: 'Erro ao salvar', cls: 'text-red-500' },
  }[status];

  return (
    <div className={`flex items-center gap-1.5 text-xs font-bold ${config.cls} transition-all`}>
      {config.icon}
      {config.text}
    </div>
  );
}

export function OnboardingWizard() {
  const navigate = useNavigate();
  const {
    currentStep,
    visitedSteps,
    autoSaveStatus,
    validation,
    ifoodChoice,
    totalSteps,
    goPrev,
    goToStep,
    saveStep,
    markValidation,
    setIfoodChoice,
    completeOnboarding,
    triggerAutoSave,
  } = useOnboardingState();

  const handleSaveAndNext = useCallback((saveFn: () => Promise<void>) => {
    saveStep(saveFn);
  }, [saveStep]);

  const handleContinueLater = useCallback(() => {
    triggerAutoSave(async () => {});
    navigate('/dashboard');
  }, [navigate, triggerAutoSave]);

  const step = STEPS[currentStep];
  const progressPct = (currentStep / (totalSteps - 1)) * 100;

  const Sidebar = (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-slate-50 dark:bg-slate-900/60 border-r border-slate-200 dark:border-slate-800 p-6">
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Rocket className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-slate-900 dark:text-white text-sm">Setup Inicial</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">Configure sua loja passo a passo</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {STEPS.map((s, idx) => {
          const isActive = idx === currentStep;
          const isPast = idx < currentStep;
          const isVisited = visitedSteps.includes(idx);
          const Icon = s.icon;

          return (
            <button
              key={s.id}
              onClick={() => goToStep(idx)}
              disabled={!isVisited && idx !== 0}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left disabled:cursor-default ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : isPast
                    ? 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isActive ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
              }`}>
                {isPast ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : s.colorClass}`} />
                )}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-black truncate ${isActive ? 'text-white' : ''}`}>
                  {idx + 1}. {s.title}
                </div>
                <div className={`text-[10px] truncate ${isActive ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                  {s.subtitle}
                </div>
              </div>
              {!s.required ? (
                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                }`}>
                  Opt
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <button
        onClick={handleContinueLater}
        className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors"
      >
        <X className="w-3.5 h-3.5" />
        Continuar depois
      </button>
    </aside>
  );

  const MobileHeader = (
    <div className="md:hidden sticky top-0 z-10 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${getStepBgClass(step)}`}>
            <step.icon className={`w-4 h-4 ${step.colorClass}`} />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 dark:text-white">{step.title}</div>
            <div className="text-[10px] text-slate-400">{step.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AutoSaveIndicator status={autoSaveStatus} />
          <span className="text-xs font-black text-slate-400">{currentStep + 1}/{totalSteps}</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-600 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-2">
        {STEPS.map((_, idx) => (
          <div
            key={idx}
            className={`rounded-full transition-all ${
              idx === currentStep ? 'w-5 h-1.5 bg-indigo-600' : idx < currentStep ? 'w-1.5 h-1.5 bg-emerald-500' : 'w-1.5 h-1.5 bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>
    </div>
  );

  const renderStep = () => {
    const commonProps = {
      onNext: handleSaveAndNext,
      onPrev: goPrev,
    };

    switch (currentStep) {
      case 0:
        return <Step1Identity {...commonProps} onMarkValid={(v) => markValidation('hasStoreName', v)} />;
      case 1:
        return <Step2Location {...commonProps} onMarkValid={(v) => markValidation('hasAddress', v)} />;
      case 2:
        return <Step3Hours {...commonProps} onMarkValid={(v) => markValidation('hasOperatingHours', v)} />;
      case 3:
        return <Step4Payments {...commonProps} onMarkValid={(v) => markValidation('hasPaymentMethod', v)} />;
      case 4:
        return <Step5Product {...commonProps} onMarkValid={(v) => markValidation('hasProduct', v)} />;
      case 5:
        return <Step6Rules {...commonProps} onMarkValid={(v) => markValidation('hasOperationalModes', v)} />;
      case 6:
        return <Step7Storefront {...commonProps} />;
      case 7:
        return <Step8Ifood {...commonProps} initialChoice={ifoodChoice} onChoiceChange={setIfoodChoice} />;
      case 8:
        return (
          <Step8Review
            validation={validation}
            onActivate={completeOnboarding}
            onPrev={goPrev}
            goToStep={goToStep}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col md:flex-row bg-white dark:bg-slate-950 overflow-hidden">
      {Sidebar}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="hidden md:flex items-center justify-between px-8 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
          <div className="flex-1 max-w-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Passo {currentStep + 1} de {totalSteps}
              </span>
              <span className="text-xs font-bold text-slate-400">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 ml-8">
            <AutoSaveIndicator status={autoSaveStatus} />
            <button
              onClick={handleContinueLater}
              className="text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Continuar depois
            </button>
          </div>
        </header>

        {MobileHeader}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-4 py-8 md:px-8">
            {renderStep()}
          </div>
        </main>
      </div>
    </div>
  );
}
