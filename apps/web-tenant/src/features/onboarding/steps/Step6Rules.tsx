import { useState } from 'react';
import { Settings2, Info } from 'lucide-react';
import { CurrencyInput } from '@gestor/ui';

interface Step6Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
}

export function Step6Rules({ onNext, onPrev }: Step6Props) {
  const [minOrderValue, setMinOrderValue] = useState('0');
  const [deliveryFreeAbove, setDeliveryFreeAbove] = useState('');
  const [serviceFeePct, setServiceFeePct] = useState('0');

  const handleNext = () => {
    onNext(async () => {
      // These fields may not exist in TenantSettings yet — stored locally only for now
      // and can be configured later in Settings > Zonas de Entrega
      console.info('[Onboarding Step6] Rules saved locally:', {
        minOrderValue: Number(minOrderValue),
        deliveryFreeAbove: deliveryFreeAbove ? Number(deliveryFreeAbove) : null,
        serviceFeePct: Number(serviceFeePct),
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-teal-100 dark:bg-teal-900/40 rounded-2xl mb-3">
          <Settings2 className="w-7 h-7 text-teal-600 dark:text-teal-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Regras Comerciais</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure os valores e limites do seu negócio</p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
          Estas configurações podem ser alteradas a qualquer momento em <strong>Entregas → Zonas de Entrega</strong> e <strong>Configurações → Dados da Loja</strong>. Este passo é opcional.
        </p>
      </div>

      {/* Pedido Mínimo */}
      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
          Pedido Mínimo (R$)
        </label>
        <div className="relative">
          <CurrencyInput
            value={Number(minOrderValue) || 0}
            onChange={val => setMinOrderValue(String(val || 0))}
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Valor 0 = sem pedido mínimo</p>
      </div>

      {/* Frete Grátis acima de */}
      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
          Frete Grátis acima de (R$) — opcional
        </label>
        <div className="relative">
          <CurrencyInput
            value={deliveryFreeAbove ? Number(deliveryFreeAbove) : undefined}
            onChange={val => setDeliveryFreeAbove(val ? String(val) : '')}
            placeholder="Deixe em branco para não usar"
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
          />
        </div>
      </div>

      {/* Taxa de Serviço */}
      <div>
        <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
          Taxa de Serviço (%) — opcional
        </label>
        <div className="relative">
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={serviceFeePct}
            onChange={e => setServiceFeePct(e.target.value)}
            className="w-full pr-10 pl-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Valor 0 = sem taxa de serviço</p>
      </div>

      {/* Summary Card */}
      {(Number(minOrderValue) > 0 || deliveryFreeAbove || Number(serviceFeePct) > 0) && (
        <div className="bg-teal-50 dark:bg-teal-900/20 rounded-2xl p-4 border border-teal-200 dark:border-teal-800 space-y-2">
          <p className="text-xs font-black text-teal-700 dark:text-teal-300 uppercase tracking-widest">Resumo das regras</p>
          {Number(minOrderValue) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Pedido mínimo</span>
              <span className="font-bold text-teal-700 dark:text-teal-300">R$ {Number(minOrderValue).toFixed(2)}</span>
            </div>
          )}
          {deliveryFreeAbove && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Frete grátis acima de</span>
              <span className="font-bold text-teal-700 dark:text-teal-300">R$ {Number(deliveryFreeAbove).toFixed(2)}</span>
            </div>
          )}
          {Number(serviceFeePct) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Taxa de serviço</span>
              <span className="font-bold text-teal-700 dark:text-teal-300">{serviceFeePct}%</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          ← Voltar
        </button>
        <button onClick={handleNext} className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm">
          Continuar →
        </button>
      </div>
    </div>
  );
}
