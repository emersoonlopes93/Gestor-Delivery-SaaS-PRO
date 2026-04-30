import React, { useState, useEffect } from 'react';
import { 
  Banknote, 
  QrCode, 
  CreditCard, 
  CheckCircle2, 
  Copy, 
  Check,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { PaymentMethod } from '@gestor/types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  subtotal: number;
  discount: number;
  onConfirm: (method: PaymentMethod, details?: any) => void;
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
        className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-2xl hover:border-emerald-500 hover:bg-gray-750 transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <Banknote size={24} />
          </div>
          <div className="text-left">
            <p className="font-bold text-white">Dinheiro</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Pagamento em espécie</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-gray-600 dark:text-gray-400 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
      </button>

      <button
        onClick={() => { setMethod(PaymentMethod.pix); setStep('details'); }}
        className="flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-2xl hover:border-indigo-500 hover:bg-gray-750 transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <QrCode size={24} />
          </div>
          <div className="text-left">
            <p className="font-bold text-white">PIX</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Instantâneo e sem taxas</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-gray-600 dark:text-gray-400 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setMethod(PaymentMethod.credit_card); setStep('details'); }}
          className="flex flex-col items-center justify-center p-4 bg-gray-800 border border-gray-700 rounded-2xl hover:border-amber-500 hover:bg-gray-750 transition-all group"
        >
          <CreditCard size={24} className="text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-white text-sm">Crédito</p>
        </button>
        <button
          onClick={() => { setMethod(PaymentMethod.debit_card); setStep('details'); }}
          className="flex flex-col items-center justify-center p-4 bg-gray-800 border border-gray-700 rounded-2xl hover:border-amber-500 hover:bg-gray-750 transition-all group"
        >
          <CreditCard size={24} className="text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-white text-sm">Débito</p>
        </button>
      </div>
    </div>
  );

  const renderCashDetails = () => (
    <div className="space-y-4 py-2">
      <div className="text-center bg-gray-950/30 p-4 rounded-2xl border border-gray-800">
        <p className="text-gray-500 dark:text-gray-400 text-[10px] uppercase font-black tracking-[0.2em] mb-1">Total a receber</p>
        <p className="text-4xl font-black text-emerald-400 tracking-tighter">{formatCurrency(total)}</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black tracking-widest ml-1">Quanto o cliente pagou?</label>
        <div className="relative">
          <input
            type="number"
            autoFocus
            value={cashAmount || ''}
            onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
            className={`w-full bg-gray-900 border-2 rounded-2xl px-4 py-4 text-2xl font-black text-white outline-none transition-all ${cashAmount < total && cashAmount !== 0 ? 'border-red-500/50 text-red-400' : 'border-gray-800 focus:border-emerald-500'}`}
            placeholder="0,00"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold">R$</div>
        </div>
      </div>

      {/* Quick Cash Buttons */}
      <div className="grid grid-cols-4 gap-2">
         <button 
           onClick={() => setCashAmount(total)}
           className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 py-2 rounded-xl text-[10px] font-black uppercase transition-all"
         >
           Exato
         </button>
         {[20, 50, 100].map(val => (
            <button 
              key={val}
              onClick={() => setCashAmount(val)}
              className="bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-300 py-2 rounded-xl text-[10px] font-black uppercase transition-all"
            >
              R$ {val}
            </button>
         ))}
      </div>

      <div className={`rounded-2xl p-4 flex justify-between items-center transition-all ${cashAmount >= total ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/5 border border-red-500/10 opacity-50'}`}>
        <div>
          <p className={`text-[10px] uppercase font-black ${cashAmount >= total ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
            {cashAmount >= total ? 'Troco para devolver' : 'Faltando'}
          </p>
          <p className={`text-2xl font-black ${cashAmount >= total ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(Math.abs(cashAmount - total))}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cashAmount >= total ? 'bg-emerald-500 text-white' : 'bg-red-500/20 text-red-500'}`}>
          <Banknote size={20} />
        </div>
      </div>
      
      {cashAmount < total && cashAmount !== 0 && (
        <p className="text-center text-red-400 text-[10px] font-black uppercase animate-pulse">Atenção: Valor insuficiente</p>
      )}

      <button
        onClick={() => onConfirm(PaymentMethod.cash, { cashAmount })}
        disabled={isPending || cashAmount < total}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-800 disabled:text-gray-600 dark:text-gray-400 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
      >
        {isPending ? 'FINALIZANDO...' : 'CONFIRMAR RECEBIMENTO'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  const renderPixDetails = () => (
    <div className="space-y-6 py-4 text-center">
      <div className="bg-white dark:bg-gray-900 p-4 rounded-3xl inline-block shadow-2xl">
        <div className="w-48 h-48 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-800">
           {/* Mock QR CODE */}
           <div className="relative">
             <QrCode size={160} className="text-gray-900 dark:text-gray-100" />
             <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg border-2 border-white">
                 <img src="https://logodownload.org/wp-content/uploads/2020/02/pix-bc-logo-0.png" className="w-6 invert brightness-0" alt="PIX" />
               </div>
             </div>
           </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-white font-bold text-xl">{formatCurrency(total)}</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Escaneie o QR Code acima ou copie a chave</p>
      </div>

      <button
        onClick={handleCopyPix}
        className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between text-gray-300 transition-all font-medium"
      >
        <span className="truncate mr-4">pix.gestordelivery...</span>
        {pixCopied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} />}
      </button>

      <button
        onClick={() => onConfirm(PaymentMethod.pix)}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
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
        <p className="text-white font-bold text-xl">Aguardando Máquina</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Insira ou aproxime o cartão na maquininha</p>
        <p className="text-amber-400 font-black text-3xl mt-4">{formatCurrency(total)}</p>
      </div>

      <button
        onClick={() => onConfirm(method)}
        disabled={isPending}
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
      >
        {isPending ? 'Confirmando...' : 'Confirmar Transação'}
        <CheckCircle2 size={20} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] w-full max-w-md overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-800 flex items-center gap-4">
          {step === 'details' && (
            <button 
              onClick={() => setStep('selection')}
              className="text-gray-500 dark:text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-full transition-all"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h3 className="text-xl font-black text-white tracking-tight leading-none">Pagamento</h3>
            <p className="text-[10px] text-emerald-500 uppercase font-black tracking-[0.2em] mt-1">Status: Aguardando</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-gray-500 dark:text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-full transition-all"
          >
            ✕
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
        <div className="px-8 py-4 bg-gray-950/50 border-t border-gray-800 flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black">Subtotal: {formatCurrency(subtotal)}</span>
            {discount > 0 && <span className="text-[10px] text-amber-500 uppercase font-black">Desconto: -{formatCurrency(discount)}</span>}
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400 block mb-0.5">Total Líquido</span>
            <span className="text-xl font-black text-white leading-none">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
