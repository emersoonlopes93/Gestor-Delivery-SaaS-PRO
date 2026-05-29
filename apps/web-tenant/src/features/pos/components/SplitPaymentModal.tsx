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
import { PaymentMethod, OrderSplitDTO } from '@gestor/types';

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
  const [splits, setSplits] = useState<OrderSplitDTO[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSplits, setIsLoadingSplits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSplits = React.useCallback(async () => {
    setIsLoadingSplits(true);
    try {
      const res = await api.get<OrderSplitDTO[]>(`/split-payment/orders/${orderId}/splits`);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao dividir conta por pessoas.';
      setError(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao dividir conta por itens.';
      setError(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao processar pagamento do split.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCash = async (paymentId: string) => {
    try {
      await api.post(`/split-payment/splits/payments/${paymentId}/confirm`);
      await fetchSplits();
      onComplete();
    } catch (err: unknown) {
      setError('Erro ao confirmar pagamento em dinheiro.');
    }
  };

  const renderMenu = () => (
    <div className="grid grid-cols-1 gap-4 py-4">
      <button
        onClick={() => setMode('people')}
        className="flex items-center gap-4 p-6 bg-card border border-border rounded-3xl hover:border-status-success hover:bg-muted transition-all text-left group"
      >
        <div className="w-14 h-14 bg-primary/10 text-primary dark:text-primary rounded-2xl flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
          <Users size={28} />
        </div>
        <div>
          <h4 className="font-black text-foreground uppercase tracking-tight leading-none">Dividir por Pessoas</h4>
          <p className="text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-widest">Divide o total igualmente entre X pessoas</p>
        </div>
      </button>

      <button
        onClick={() => setMode('items')}
        className="flex items-center gap-4 p-6 bg-card border border-border rounded-3xl hover:border-primary hover:bg-muted transition-all text-left group"
      >
        <div className="w-14 h-14 bg-primary/10 text-primary dark:text-primary rounded-2xl flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
          <ListChecks size={28} />
        </div>
        <div>
          <h4 className="font-black text-foreground uppercase tracking-tight leading-none">Dividir por Itens</h4>
          <p className="text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-widest">Selecione itens específicos para pagar agora</p>
        </div>
      </button>

      {splits.length > 0 && (
        <button
          onClick={() => setMode('splits')}
          className="flex items-center gap-4 p-6 bg-primary/10 border border-primary/20 rounded-3xl hover:bg-primary/20 transition-all text-left"
        >
          <div className="w-14 h-14 bg-status-success text-foreground rounded-2xl flex items-center justify-center shadow-lg">
            <CheckCircle2 size={28} />
          </div>
          <div>
            <h4 className="font-black text-foreground uppercase tracking-tight">Gerenciar Divisões ({splits.length})</h4>
            <p className="text-xs text-muted-foreground mt-1">Líquidar pagamentos pendentes</p>
          </div>
        </button>
      )}

      {/* Placeholder para fechamento parcial */}
      <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded-2xl flex items-start gap-3 mt-2">
        <AlertCircle size={16} className="text-status-warning shrink-0 mt-0.5" />
        <p className="text-[10px] text-status-warning/70 leading-relaxed uppercase font-black">
          Ao dividir a conta, o pedido permanecerá em aberto até que todos os splits sejam liquidados.
        </p>
      </div>
    </div>
  );

  const renderPeopleSelector = () => (
    <div className="space-y-6 py-4">
        <div className="text-center">
        <p className="text-muted-foreground text-[10px] uppercase font-black tracking-widest mb-4">Quantas pessoas na mesa?</p>
        <div className="flex items-center justify-center gap-8">
          <button 
            onClick={() => setNumberOfPeople(Math.max(2, numberOfPeople - 1))}
            className="w-12 h-12 bg-card rounded-full flex items-center justify-center text-foreground hover:bg-muted transition-all border border-transparent hover:border-border shadow-sm"
          >
            <Minus size={24} />
          </button>
          <span className="text-6xl font-black text-primary dark:text-primary tracking-tighter italic">{numberOfPeople}</span>
          <button 
            onClick={() => setNumberOfPeople(numberOfPeople + 1)}
            className="w-12 h-12 bg-card rounded-full flex items-center justify-center text-foreground hover:bg-muted transition-all border border-transparent hover:border-border shadow-sm"
          >
            <Plus size={24} />
          </button>
        </div>
        <div className="mt-6 p-4 bg-card rounded-2xl border border-border">
           <p className="text-[10px] text-muted-foreground uppercase font-black mb-1">Valor por pessoa</p>
           <p className="text-2xl font-black text-foreground">{(orderTotal / numberOfPeople).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      <button
        onClick={handleSplitByPeople}
        disabled={isSubmitting}
        className="w-full bg-primary hover:bg-primary/90 text-foreground font-black py-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest flex items-center justify-center gap-2"
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
       <div key={item.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-2xl">
             <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-foreground truncate uppercase tracking-tight">{item.snapshotName}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Saldo: {item.quantity} un x {item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
             </div>
         <div className="flex items-center gap-3 ml-4 bg-card p-1.5 rounded-xl border border-border shadow-sm">
                <button 
                   onClick={() => setItemSelections(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))}
             className="w-8 h-8 bg-card rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="w-4 text-center text-xs font-black text-primary dark:text-primary">{itemSelections[item.id] || 0}</span>
                <button 
                   onClick={() => setItemSelections(prev => ({ ...prev, [item.id]: Math.min(item.quantity, (prev[item.id] || 0) + 1) }))}
             className="w-8 h-8 bg-card rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={14} />
                </button>
             </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
         <p className="text-[10px] text-muted-foreground uppercase font-black mb-1">Total Selecionado</p>
         <p className="text-xl font-black text-primary leading-none">
           {Object.entries(itemSelections).reduce((sum, [id, qty]) => {
              const item = items.find(it => it.id === id);
              return sum + (item ? item.unitPrice * qty : 0);
           }, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
         </p>
      </div>

      <button
        onClick={handleSplitByItems}
        disabled={isSubmitting}
        className="w-full bg-primary hover:bg-primary/90 text-foreground font-black py-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest flex items-center justify-center gap-2"
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
        const pendingPayment = split.payments?.find((p) => !p.isPaid);
        
        return (
          <div key={split.id} className={`p-5 rounded-3xl border-2 transition-all ${isPaid ? 'bg-status-success/5 border-status-success/20' : 'bg-card border-border'}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className={`font-black uppercase tracking-tight ${isPaid ? 'text-foreground' : 'text-foreground'}`}>
                  {split.description || `Split ${split.id.substring(0,4)}`}
                </p>
                <p className="text-2xl font-black text-foreground mt-1">
                  {Number(split.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${isPaid ? 'bg-status-success text-foreground' : 'bg-status-warning/20 text-status-warning'}`}>
                {isPaid ? 'PAGO' : 'PENDENTE'}
              </span>
            </div>

            {!isPaid && !pendingPayment && (
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handlePaySplit(split.id, PaymentMethod.cash)}
                  className="flex flex-col items-center gap-2 p-3 bg-card border border-border rounded-2xl hover:border-status-success transition-all text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  <Banknote size={20} /> Dinheiro
                </button>
                <button 
                  onClick={() => handlePaySplit(split.id, PaymentMethod.pix)}
                  className="flex flex-col items-center gap-2 p-3 bg-card border border-border rounded-2xl hover:border-primary transition-all text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  <QrCode size={20} /> PIX
                </button>
              </div>
            )}

            {pendingPayment && !isPaid && (
              <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded-2xl flex flex-col items-center gap-3">
                 <p className="text-[10px] font-black text-status-warning uppercase">Aguardando Confirmação ({pendingPayment.paymentMethod})</p>
                 <button 
                   onClick={() => handleConfirmCash(pendingPayment.id)}
                   className="w-full bg-status-warning text-foreground font-black py-2 rounded-xl text-xs uppercase"
                 >
                   Confirmar Recebimento
                 </button>
              </div>
            )}
            
            {isPaid && (
              <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-[10px] font-black uppercase">
                 <CheckCircle2 size={14} /> Pago em {split.confirmedAt ? new Date(split.confirmedAt).toLocaleDateString() : '---'}
              </div>
            )}
          </div>
        );
      })}
      
      <button 
        onClick={() => setMode('menu')}
        className="w-full py-4 border-2 border-dashed border-border rounded-3xl text-muted-foreground hover:text-foreground hover:border-border transition-all text-xs font-black uppercase"
      >
        + Nova Divisão
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-card border border-border rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="px-8 py-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-foreground tracking-tight uppercase italic flex items-center gap-2">
              {mode === 'menu' ? 'Dividir Conta' : mode === 'people' ? 'Divisão por Pessoas' : 'Divisão por Itens'}
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">
              Pedido ID: #{orderId.substring(0, 8)} 
              {isLoadingSplits && ' • CARREGANDO...'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-all"><X size={24} /></button>
        </div>

        <div className="p-8">
           {error && (
             <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold rounded-xl flex items-center gap-2">
               <AlertCircle size={14} /> {error}
             </div>
           )}

           {mode === 'menu' && renderMenu()}
           {mode === 'people' && renderPeopleSelector()}
           {mode === 'items' && renderItemSelector()}
           {mode === 'splits' && renderSplitsList()}
        </div>

        {mode !== 'menu' && (
           <div className="px-8 py-4 bg-muted/50 border-t border-border">
              <button 
                onClick={() => setMode('menu')}
                className="text-[10px] text-muted-foreground font-black uppercase hover:text-foreground transition-colors"
              >
                ← Voltar para opções
              </button>
           </div>
        )}
      </div>
    </div>
  );
};
