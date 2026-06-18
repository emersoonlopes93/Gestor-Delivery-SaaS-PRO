import React, { useState, useEffect } from 'react';
import { 
  Banknote, 
  QrCode, 
  CreditCard, 
  CheckCircle2, 
  Copy, 
  Check,
  ChevronRight,
  ArrowLeft,
  X
} from 'lucide-react';
import { PaymentMethod } from '@gestor/types';


interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  subtotal: number;
  discount: number;
  onConfirm: (method: PaymentMethod, details?: { cashAmount?: number }) => void;
  isPending: boolean;
}

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  total,
  subtotal,
  discount,
  onConfirm,
  isPending
}) => {
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.cash);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [pixCopied, setPixCopied] = useState(false);
  const [step, setStep] = useState<'selection' | 'details'>('selection');

  useEffect(() => {
    if (isOpen) {
      setStep('selection');
      setCashAmount(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyPix = () => {
    navigator.clipboard.writeText('00020126360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540510.005802BR5925GESTOR DELIVERY SAAS PRO6009SAO PAULO62070503***6304E2B4');
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const renderSelection = () => (
    <div className="grid grid-cols-1 gap-3 py-4">
      <button
        onClick={() => { setMethod(PaymentMethod.cash); setStep('details'); }}
        className="flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-primary hover:bg-muted transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform border border-primary/20">
            <Banknote size={24} />
          </div>
          <div className="text-left">
            <p className="font-bold text-foreground">Dinheiro</p>
            <p className="text-xs text-muted-foreground">Pagamento em espécie</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-muted-foreground dark:text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </button>

      <button
        onClick={() => { setMethod(PaymentMethod.pix); setStep('details'); }}
        className="flex items-center justify-between p-4 bg-card  border border-border  rounded-2xl hover:border-indigo-500 hover:bg-muted  transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/10 text-indigo-500  rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform border border-indigo-500/20">
            <QrCode size={24} />
          </div>
          <div className="text-left">
            <p className="font-bold text-foreground">PIX</p>
            <p className="text-xs text-muted-foreground">Instantâneo e sem taxas</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-muted-foreground dark:text-muted-foreground group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setMethod(PaymentMethod.credit_card); setStep('details'); }}
          className="flex flex-col items-center justify-center p-4 bg-card  border border-border  rounded-2xl hover:border-amber-500 hover:bg-muted  transition-all group"
        >
          <CreditCard size={24} className="text-amber-500  mb-2 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-foreground text-sm">Crédito</p>
        </button>
        <button
          onClick={() => { setMethod(PaymentMethod.debit_card); setStep('details'); }}
          className="flex flex-col items-center justify-center p-4 bg-card  border border-border  rounded-2xl hover:border-amber-500 hover:bg-muted  transition-all group"
        >
          <CreditCard size={24} className="text-amber-500  mb-2 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-foreground text-sm">Débito</p>
        </button>
      </div>
    </div>
  );

  const renderCashDetails = () => (
    <div className="space-y-4 py-2">
      <div className="text-center bg-muted p-4 rounded-2xl border border-border ">
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">Total a receber</p>
        <p className="text-4xl font-black text-primary  tracking-tighter">{formatCurrency(total)}</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-muted-foreground uppercase font-black tracking-widest ml-1">Quanto o cliente pagou?</label>
        <div className="relative">
          <input
            type="number"
            autoFocus
            value={cashAmount || ''}
            onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
            className={`w-full bg-card  border-2 rounded-2xl px-4 py-4 text-2xl font-black text-foreground outline-none transition-all ${cashAmount < total && cashAmount !== 0 ? 'border-destructive/50 text-destructive' : 'border-border  focus:border-status-success'}`}
            placeholder="0,00"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">R$</div>
        </div>
      </div>

      {/* Quick Cash Buttons */}
      <div className="grid grid-cols-4 gap-2">
         <button 
           onClick={() => setCashAmount(total)}
           className="bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary  py-2 rounded-xl text-[10px] font-black uppercase transition-all"
         >
           Exato
         </button>
         {[20, 50, 100].map(val => (
            <button 
              key={val}
              onClick={() => setCashAmount(val)}
              className="bg-card  hover:bg-muted  border border-border  text-muted-foreground700 dark:text-muted-foreground300 py-2 rounded-xl text-[10px] font-black uppercase transition-all"
            >
              R$ {val}
            </button>
         ))}
      </div>

      <div className={`rounded-2xl p-4 flex justify-between items-center transition-all ${cashAmount >= total ? 'bg-primary/10 border border-primary/20' : 'bg-destructive/10 border border-destructive/20 opacity-80'}`}>
        <div>
          <p className={`text-[10px] uppercase font-black ${cashAmount >= total ? 'text-primary/70' : 'text-destructive/70'}`}>
            {cashAmount >= total ? 'Troco para devolver' : 'Faltando'}
          </p>
          <p className={`text-2xl font-black ${cashAmount >= total ? 'text-primary ' : 'text-destructive'}`}>
            {formatCurrency(Math.abs(cashAmount - total))}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cashAmount >= total ? 'bg-status-success text-white' : 'bg-destructive/20 text-destructive'}`}>
          <Banknote size={20} />
        </div>
      </div>
      
      {cashAmount < total && cashAmount !== 0 && (
        <p className="text-center text-destructive text-[10px] font-black uppercase animate-pulse">Atenção: Valor insuficiente</p>
      )}

      <button
        onClick={() => onConfirm(PaymentMethod.cash, { cashAmount })}
        disabled={isPending || cashAmount < total}
        className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted100 dark:disabled:bg-muted800 disabled:text-muted-foreground text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
      >
        {isPending ? 'FINALIZANDO...' : 'CONFIRMAR RECEBIMENTO'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  const renderPixDetails = () => (
    <div className="space-y-6 py-4 text-center">
      <div className="bg-card dark:bg-muted800 p-4 rounded-3xl inline-block shadow-2xl border border-border dark:border-border700">
        <div className="w-48 h-48 bg-muted50  rounded-2xl flex items-center justify-center overflow-hidden border border-border dark:border-border700">
           {/* Mock QR CODE */}
           <div className="relative">
             <QrCode size={160} className="text-muted-foreground900 dark:text-muted-foreground100" />
             <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg border-2 border-white">
                 <img src="https://logodownload.org/wp-content/uploads/2020/02/pix-bc-logo-0.png" className="w-6 invert brightness-0" alt="PIX" />
               </div>
             </div>
           </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-foreground font-black text-xl">{formatCurrency(total)}</p>
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Escaneie o QR Code acima ou copie a chave</p>
      </div>

      <button
        onClick={handleCopyPix}
        className="w-full bg-muted50  hover:bg-muted100  border border-border dark:border-border700 rounded-2xl px-4 py-3 flex items-center justify-between text-muted-foreground700 dark:text-muted-foreground300 transition-all font-bold text-sm"
      >
        <span className="truncate mr-4">pix.gestordelivery...</span>
        {pixCopied ? <Check size={20} className="text-primary" /> : <Copy size={20} className="text-muted-foreground" />}
      </button>

      <button
        onClick={() => onConfirm(PaymentMethod.pix)}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-muted100 dark:disabled:bg-muted800 disabled:text-muted-foreground text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
      >
        {isPending ? 'Verificando...' : 'Confirmar Pagamento'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  const renderCardDetails = () => (
    <div className="space-y-6 py-4">
       <div className="text-center py-8">
        <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2 border-amber-500/20">
          <CreditCard size={40} />
        </div>
        <p className="text-foreground font-black text-xl">Aguardando Máquina</p>
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mt-2">Insira ou aproxime o cartão na maquininha</p>
        <p className="text-amber-500  font-black text-3xl mt-4">{formatCurrency(total)}</p>
      </div>

      <button
        onClick={() => onConfirm(method)}
        disabled={isPending}
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-muted100 dark:disabled:bg-muted800 disabled:text-muted-foreground text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
      >
        {isPending ? 'Confirmando...' : 'Confirmar Transação'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 safe-modal bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-card  border border-border  rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] w-full max-w-md max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-border  flex items-center gap-4 bg-muted50/50 dark:bg-muted950/50">
          {step === 'details' && (
            <button 
              onClick={() => setStep('selection')}
              className="text-muted-foreground dark:text-muted-foreground hover:text-muted-foreground900 dark:hover:text-white p-2 hover:bg-card  rounded-full transition-all border border-transparent hover:border-border dark:hover:border-border700"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h3 className="text-xl font-black text-foreground tracking-tight leading-none uppercase">Pagamento</h3>
            <p className="text-[10px] text-primary uppercase font-black tracking-[0.2em] mt-1">Status: Aguardando</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-muted-foreground dark:text-muted-foreground hover:text-muted-foreground900 dark:hover:text-white p-2 hover:bg-card  rounded-full transition-all border border-transparent hover:border-border dark:hover:border-border700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-8">
          {step === 'selection' ? renderSelection() : (
            <>
              {method === PaymentMethod.cash && renderCashDetails()}
              {method === PaymentMethod.pix && renderPixDetails()}
              {(method === PaymentMethod.credit_card || method === PaymentMethod.debit_card) && renderCardDetails()}
            </>
          )}
        </div>

        {/* Footer Summary */}
        <div className="px-8 py-4 bg-muted border-t border-border  flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-black">Subtotal: {formatCurrency(subtotal)}</span>
            {discount > 0 && <span className="text-[10px] text-amber-500 uppercase font-black">Desconto: -{formatCurrency(discount)}</span>}
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block mb-0.5 font-bold uppercase tracking-widest">Total Líquido</span>
            <span className="text-xl font-black text-foreground leading-none">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
