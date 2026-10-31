import { useState, useEffect } from 'react';
import { CreditCard, Smartphone, Banknote, DollarSign } from 'lucide-react';
import { api } from '../../../lib/api-client';

interface Step4Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

const PAYMENT_OPTIONS = [
  {
    id: 'pix',
    label: 'PIX',
    description: 'Pagamento instantâneo via chave PIX',
    icon: Smartphone,
    color: 'emerald',
  },
  {
    id: 'cash',
    label: 'Dinheiro',
    description: 'Pagamento em espécie na entrega',
    icon: Banknote,
    color: 'amber',
  },
  {
    id: 'card_on_delivery',
    label: 'Cartão na Entrega',
    description: 'Maquininha física na entrega',
    icon: CreditCard,
    color: 'blue',
  },
];

const COLOR_MAP: Record<string, { card: string; check: string; icon: string }> = {
  emerald: {
    card: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20',
    check: 'bg-emerald-500',
    icon: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40',
  },
  amber: {
    card: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20',
    check: 'bg-amber-500',
    icon: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40',
  },
  blue: {
    card: 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20',
    check: 'bg-blue-500',
    icon: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40',
  },
};

export function Step4Payments({ onNext, onPrev, onMarkValid }: Step4Props) {
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['pix', 'cash']);
  const [pixKey, setPixKey] = useState('');
  const [acceptChange, setAcceptChange] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    onMarkValid(selectedMethods.length > 0);
  }, [selectedMethods, onMarkValid]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ settings?: { paymentMethods?: string[]; pixKey?: string } }>('/tenant/me');
      if (res.success && res.data.settings) {
        if (res.data.settings.paymentMethods?.length) {
          setSelectedMethods(res.data.settings.paymentMethods);
        }
        setPixKey(res.data.settings.pixKey || '');
      }
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const toggleMethod = (id: string) => {
    setSelectedMethods(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (selectedMethods.length === 0) {
      alert('Selecione pelo menos 1 método de pagamento.');
      return;
    }
    if (selectedMethods.includes('pix') && !pixKey.trim()) {
      alert('Você habilitou o PIX. Por favor, informe a chave PIX.');
      return;
    }
    onNext(async () => {
      await api.patch('/tenant/settings', {
        paymentMethods: selectedMethods,
        pixKey: pixKey.trim() || undefined,
      });
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-violet-100 dark:bg-violet-900/40 rounded-2xl mb-3">
          <DollarSign className="w-7 h-7 text-violet-600 dark:text-violet-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Métodos de Pagamento</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Como seus clientes vão pagar os pedidos</p>
      </div>

      {/* Payment method cards */}
      <div className="space-y-3">
        {PAYMENT_OPTIONS.map(opt => {
          const isSelected = selectedMethods.includes(opt.id);
          const colors = COLOR_MAP[opt.color];
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              onClick={() => toggleMethod(opt.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                isSelected ? colors.card : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? colors.icon : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-black text-sm text-slate-900 dark:text-white">{opt.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                isSelected ? `${colors.check} border-transparent` : 'border-slate-300 dark:border-slate-600'
              }`}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* PIX key field */}
      {selectedMethods.includes('pix') && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 border border-emerald-200 dark:border-emerald-800 space-y-3">
          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">Chave PIX da Loja</p>
          <input
            type="text"
            value={pixKey}
            onChange={e => setPixKey(e.target.value)}
            placeholder="E-mail, CPF, CNPJ ou chave aleatória"
            className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm"
          />
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Sua chave PIX aparecerá na tela de pagamento do cliente.</p>
        </div>
      )}

      {/* Troco */}
      {selectedMethods.includes('cash') && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setAcceptChange(!acceptChange)}
              className={`relative w-11 h-6 rounded-full transition-all cursor-pointer ${acceptChange ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-primary-foreground shadow transition-all ${acceptChange ? 'left-5' : 'left-0.5'}`} />
            </div>
            <div>
              <div className="font-black text-sm text-amber-800 dark:text-amber-200">Aceitar solicitação de troco</div>
              <div className="text-xs text-amber-600 dark:text-amber-400">Cliente informa o valor para receber o troco</div>
            </div>
          </label>
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
