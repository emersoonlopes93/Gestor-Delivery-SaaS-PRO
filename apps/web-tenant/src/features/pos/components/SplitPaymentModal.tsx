import React, { useState } from 'react';
import { 
  Users, 
  ListChecks, 
  Plus, 
  Minus, 
  X,
  Banknote,
  QrCode,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { PaymentMethod } from '@gestor/types';

interface OrderItem {
  id: string;
  snapshotName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface SplitPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderTotal: number;
  items: OrderItem[];
  onComplete: () => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderTotal,
  items,
  onComplete
}) => {
  const [mode, setMode] = useState<'menu' | 'people' | 'items' | 'splits'>('menu');
  const [numberOfPeople, setNumberOfPeople] = useState(2);
  const [itemSelections, setItemSelections] = useState<Record<string, number>>({});
  const [splits, setSplits] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSplits, setIsLoadingSplits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSplits = React.useCallback(async () => {
    setIsLoadingSplits(true);
    try {
      const res = await api.get(`/split-payment/orders/${orderId}/splits`);
      const data = Array.isArray(res.data) ? res.data : [];
      setSplits(data);
      if (data.length > 0 && mode === 'menu') {
        setMode('splits');
      }
    } catch (err) {
      console.error('Failed to fetch splits', err);
    } finally {
      setIsLoadingSplits(false);
    }
  }, [orderId, mode]);

  React.useEffect(() => {
    if (isOpen) {
      fetchSplits();
    }
  }, [isOpen, fetchSplits]);

  if (!isOpen) return null;

  const handleSplitByPeople = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/split-payment/splits/by-people', {
        orderId,
        numberOfPeople
      });
      setIsSubmitting(false);
      onComplete(); // Recarregar dados no pai
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao dividir conta por pessoas.');
      setIsSubmitting(false);
    }
  };

  const handleSplitByItems = async () => {
    const selectedItems = Object.entries(itemSelections)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => ({ orderItemId: id, quantity: qty }));

    if (selectedItems.length === 0) {
      setError('Selecione ao menos um item.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/split-payment/splits/by-items', {
        orderId,
        items: selectedItems
      });
      setIsSubmitting(false);
      fetchSplits();
      setMode('splits');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao dividir conta por itens.');
      setIsSubmitting(false);
    }
  };

  const handlePaySplit = async (splitId: string, method: PaymentMethod) => {
    setIsSubmitting(true);
    try {
      await api.post('/split-payment/splits/payments', {
        orderSplitId: splitId,
        paymentMethod: method,
        amount: splits.find(s => s.id === splitId)?.totalAmount
      });
      await fetchSplits();
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao processar pagamento do split.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCash = async (paymentId: string) => {
    try {
      await api.post(`/split-payment/splits/payments/${paymentId}/confirm`);
      await fetchSplits();
      onComplete();
    } catch (err: any) {
      setError('Erro ao confirmar pagamento em dinheiro.');
    }
  };

  const renderMenu = () => (
    <div className="grid grid-cols-1 gap-4 py-4">
      <button
        onClick={() => setMode('people')}
        className="flex items-center gap-4 p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl hover:border-emerald-500 transition-all text-left"
      >
        <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center">
          <Users size={28} />
        </div>
        <div>
          <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">Dividir por Pessoas</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Divide o total igualmente entre X pessoas</p>
        </div>
      </button>

      <button
        onClick={() => setMode('items')}
        className="flex items-center gap-4 p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl hover:border-blue-500 transition-all text-left"
      >
        <div className="w-14 h-14 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center">
          <ListChecks size={28} />
        </div>
        <div>
          <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">Dividir por Itens</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Selecione itens específicos para pagar agora</p>
        </div>
      </button>

      {splits.length > 0 && (
        <button
          onClick={() => setMode('splits')}
          className="flex items-center gap-4 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl hover:bg-emerald-500/20 transition-all text-left"
        >
          <div className="w-14 h-14 bg-emerald-500 text-gray-900 dark:text-white rounded-2xl flex items-center justify-center shadow-lg">
            <CheckCircle2 size={28} />
          </div>
          <div>
            <h4 className="font-black text-emerald-400 uppercase tracking-tight">Gerenciar Divisões ({splits.length})</h4>
            <p className="text-xs text-emerald-500/70 mt-1">Líquidar pagamentos pendentes</p>
          </div>
        </button>
      )}

      {/* Placeholder para fechamento parcial */}
      <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3 mt-2">
         <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
         <p className="text-[10px] text-amber-600/70 leading-relaxed uppercase font-black">
            Ao dividir a conta, o pedido permanecerá em aberto até que todos os splits sejam liquidados.
         </p>
      </div>
    </div>
  );

  const renderPeopleSelector = () => (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <p className="text-gray-500 dark:text-gray-400 text-[10px] uppercase font-black tracking-widest mb-4">Quantas pessoas na mesa?</p>
        <div className="flex items-center justify-center gap-8">
          <button 
            onClick={() => setNumberOfPeople(Math.max(2, numberOfPeople - 1))}
            className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-100 dark:bg-gray-750 transition-colors"
          >
            <Minus size={24} />
          </button>
          <span className="text-6xl font-black text-emerald-400 tracking-tighter italic">{numberOfPeople}</span>
          <button 
            onClick={() => setNumberOfPeople(numberOfPeople + 1)}
            className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-100 dark:bg-gray-750 transition-colors"
          >
            <Plus size={24} />
          </button>
        </div>
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-950/30 rounded-2xl border border-gray-200 dark:border-gray-800">
           <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black mb-1">Valor por pessoa</p>
           <p className="text-2xl font-black text-gray-900 dark:text-white">{(orderTotal / numberOfPeople).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      <button
        onClick={handleSplitByPeople}
        disabled={isSubmitting}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-gray-900 dark:text-white font-black py-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest flex items-center justify-center gap-2"
      >
        {isSubmitting ? 'PROCESSANDO...' : 'CONFIRMAR DIVISÃO'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  const renderItemSelector = () => (
    <div className="space-y-4 py-2 flex flex-col max-h-[60vh]">
      <div className="flex-1 overflow-y-auto pr-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-xl">
             <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{item.snapshotName}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Saldo: {item.quantity} un x {item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
             </div>
             <div className="flex items-center gap-3 ml-4">
                <button 
                  onClick={() => setItemSelections(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))}
                  className="w-8 h-8 bg-white dark:bg-gray-900 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white"
                >
                  <Minus size={14} />
                </button>
                <span className="w-4 text-center text-xs font-black text-emerald-400">{itemSelections[item.id] || 0}</span>
                <button 
                  onClick={() => setItemSelections(prev => ({ ...prev, [item.id]: Math.min(item.quantity, (prev[item.id] || 0) + 1) }))}
                  className="w-8 h-8 bg-white dark:bg-gray-900 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white"
                >
                  <Plus size={14} />
                </button>
             </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
         <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black mb-1">Total Selecionado</p>
         <p className="text-xl font-black text-blue-400 leading-none">
           {Object.entries(itemSelections).reduce((sum, [id, qty]) => {
              const item = items.find(it => it.id === id);
              return sum + (item ? item.unitPrice * qty : 0);
           }, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
         </p>
      </div>

      <button
        onClick={handleSplitByItems}
        disabled={isSubmitting}
        className="w-full bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-white font-black py-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest flex items-center justify-center gap-2"
      >
        {isSubmitting ? 'PROCESSANDO...' : 'CRIAR PAGAMENTO PARCIAL'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  const renderSplitsList = () => (
    <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-2">
      {splits.map((split) => {
        const isPaid = split.status === 'confirmed';
        const pendingPayment = split.payments.find((p: any) => !p.isPaid);
        
        return (
          <div key={split.id} className={`p-5 rounded-3xl border-2 transition-all ${isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className={`font-black uppercase tracking-tight ${isPaid ? 'text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                  {split.description || `Split ${split.id.substring(0,4)}`}
                </p>
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                  {Number(split.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${isPaid ? 'bg-emerald-500 text-gray-900 dark:text-white' : 'bg-amber-500/20 text-amber-500'}`}>
                {isPaid ? 'PAGO' : 'PENDENTE'}
              </span>
            </div>

            {!isPaid && !pendingPayment && (
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handlePaySplit(split.id, PaymentMethod.cash)}
                  className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl hover:border-emerald-500 transition-all text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white"
                >
                  <Banknote size={20} /> Dinheiro
                </button>
                <button 
                  onClick={() => handlePaySplit(split.id, PaymentMethod.pix)}
                  className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl hover:border-indigo-500 transition-all text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white"
                >
                  <QrCode size={20} /> PIX
                </button>
              </div>
            )}

            {pendingPayment && !isPaid && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col items-center gap-3">
                 <p className="text-[10px] font-black text-amber-500 uppercase">Aguardando Confirmação ({pendingPayment.paymentMethod})</p>
                 <button 
                   onClick={() => handleConfirmCash(pendingPayment.id)}
                   className="w-full bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase"
                 >
                   Confirmar Recebimento
                 </button>
              </div>
            )}
            
            {isPaid && (
              <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase">
                 <CheckCircle2 size={14} /> Pago em {new Date(split.confirmedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      })}
      
      <button 
        onClick={() => setMode('menu')}
        className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white hover:border-gray-300 dark:border-gray-600 transition-all text-xs font-black uppercase"
      >
        + Nova Divisão
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight uppercase italic flex items-center gap-2">
              {mode === 'menu' ? 'Dividir Conta' : mode === 'people' ? 'Divisão por Pessoas' : 'Divisão por Itens'}
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black tracking-widest mt-1">
              Pedido ID: #{orderId.substring(0, 8)} 
              {isLoadingSplits && ' • CARREGANDO...'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-all"><X size={24} /></button>
        </div>

        <div className="p-8">
           {error && (
             <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl flex items-center gap-2">
               <AlertCircle size={14} /> {error}
             </div>
           )}

           {mode === 'menu' && renderMenu()}
           {mode === 'people' && renderPeopleSelector()}
           {mode === 'items' && renderItemSelector()}
           {mode === 'splits' && renderSplitsList()}
        </div>

        {mode !== 'menu' && (
           <div className="px-8 py-4 bg-gray-50 dark:bg-gray-950/50 border-t border-gray-200 dark:border-gray-800">
              <button 
                onClick={() => setMode('menu')}
                className="text-[10px] text-gray-500 dark:text-gray-400 font-black uppercase hover:text-gray-900 dark:text-white transition-colors"
              >
                ← Voltar para opções
              </button>
           </div>
        )}
      </div>
    </div>
  );
};
