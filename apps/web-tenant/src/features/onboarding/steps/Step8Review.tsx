import { useState } from 'react';
import { CheckCircle2, XCircle, Rocket, Loader2, Store, MapPin, Clock, CreditCard, ShoppingBag, Settings2, Palette } from 'lucide-react';
import type { OnboardingValidation } from '../useOnboardingState';

interface Step8Props {
  validation: OnboardingValidation;
  onActivate: () => Promise<void>;
  onPrev: () => void;
}

interface CheckItem {
  key: keyof OnboardingValidation;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const CHECK_ITEMS: CheckItem[] = [
  { key: 'hasStoreName', label: 'Identidade da Loja', description: 'Nome e contato configurados', icon: Store },
  { key: 'hasAddress', label: 'Endereço cadastrado', description: 'Localização definida para entrega', icon: MapPin },
  { key: 'hasOperatingHours', label: 'Horários definidos', description: 'Pelo menos 1 dia de funcionamento', icon: Clock },
  { key: 'hasPaymentMethod', label: 'Pagamento configurado', description: 'Ao menos 1 método de pagamento', icon: CreditCard },
  { key: 'hasProduct', label: 'Produto criado', description: 'Cardápio com ao menos 1 item', icon: ShoppingBag },
];

const OPTIONAL_ITEMS = [
  { label: 'Regras comerciais', description: 'Configurável em Configurações', icon: Settings2 },
  { label: 'Vitrine personalizada', description: 'Configurável em Personalização', icon: Palette },
];

import React from 'react';

export function Step8Review({ validation, onActivate, onPrev }: Step8Props) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');

  const allValid = Object.values(validation).every(Boolean);
  const completedCount = Object.values(validation).filter(Boolean).length;
  const totalRequired = CHECK_ITEMS.length;

  const handleActivate = async () => {
    if (!allValid) return;
    setActivating(true);
    setError('');
    try {
      await onActivate();
    } catch (err) {
      setError('Erro ao ativar a loja. Tente novamente.');
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
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Revisão Final</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Verifique se tudo está pronto para ativar sua loja</p>
      </div>

      {/* Progress summary */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Progresso</span>
          <span className={`text-sm font-black ${allValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {completedCount}/{totalRequired} obrigatórios
          </span>
        </div>
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${allValid ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${(completedCount / totalRequired) * 100}%` }}
          />
        </div>
      </div>

      {/* Required checks */}
      <div className="space-y-2">
        <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Itens Obrigatórios</p>
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
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                ok ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-500'
              }`}>
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

      {/* Optional items */}
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
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
              Depois
            </span>
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Missing items warning */}
      {!allValid && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            ⚠️ Volte aos steps marcados em vermelho e complete as informações obrigatórias para ativar sua loja.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          ← Voltar
        </button>
        <button
          onClick={handleActivate}
          disabled={!allValid || activating}
          className={`flex-[2] py-4 font-black rounded-2xl transition-all text-sm flex items-center justify-center gap-2 ${
            allValid
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {activating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Ativando...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              {allValid ? 'Ativar Loja! 🚀' : 'Complete os itens obrigatórios'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
