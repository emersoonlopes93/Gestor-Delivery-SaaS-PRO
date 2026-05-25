import { memo } from 'react';
import { CreditCard, Wallet, Banknote, Ticket, Sparkles, type LucideIcon } from 'lucide-react';

interface OrderPaymentSectionProps {
  itemsSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discountTotal: number;
  total: number;
  paymentMethod: string;
  changeFor?: number | null;
  couponCode?: string | null;
  cashbackUsed?: number | null;
}

const PAYMENT_METHOD_LABELS: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  credit_card: { label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400' },
  debit_card: { label: 'Cartão de Débito', icon: CreditCard, color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-400' },
  pix: { label: 'PIX', icon: Sparkles, color: 'text-teal-600 bg-teal-100 dark:bg-teal-900/40 dark:text-teal-400' },
  cash: { label: 'Dinheiro', icon: Banknote, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400' },
  meal_voucher: { label: 'Vale Refeição', icon: Ticket, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400' },
  online: { label: 'Pagamento Online', icon: Wallet, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-400' },
};

export const OrderPaymentSection = memo(function OrderPaymentSection({ 
  itemsSubtotal, 
  deliveryFee, 
  serviceFee,
  discountTotal,
  total,
  paymentMethod,
  changeFor,
  couponCode,
  cashbackUsed
}: OrderPaymentSectionProps) {
  
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const payment = PAYMENT_METHOD_LABELS[paymentMethod] || { label: paymentMethod, icon: Wallet, color: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400' };
  const Icon = payment.icon;

  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Pagamento e Totais</h3>
      <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
        
        {/* Detalhamento de Valores */}
        <div className="space-y-2.5 mb-5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Subtotal</span>
            <span className="text-slate-700 dark:text-slate-300 font-bold">{fmt(itemsSubtotal)}</span>
          </div>
          
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Taxa de Entrega</span>
              <span className="text-slate-700 dark:text-slate-300 font-bold">{fmt(deliveryFee)}</span>
            </div>
          )}

          {serviceFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Taxa de Serviço</span>
              <span className="text-slate-700 dark:text-slate-300 font-bold">{fmt(serviceFee)}</span>
            </div>
          )}

          {discountTotal > 0 && (
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Ticket className="w-3.5 h-3.5" />
                <span className="font-medium">Descontos {couponCode && `(${couponCode})`}</span>
              </div>
              <span className="text-emerald-600 dark:text-emerald-400 font-black">-{fmt(discountTotal)}</span>
            </div>
          )}

          {cashbackUsed && cashbackUsed > 0 && (
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-medium">Cashback Usado</span>
              </div>
              <span className="text-blue-600 dark:text-blue-400 font-black">-{fmt(cashbackUsed)}</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Total a Pagar</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{fmt(total)}</span>
          </div>
        </div>

        {/* Método de Pagamento */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${payment.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Método</p>
              <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{payment.label}</p>
            </div>
          </div>
          
          {paymentMethod === 'cash' && changeFor && changeFor > total && (
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Troco para</p>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 leading-none">{fmt(changeFor)}</p>
              <p className="text-[9px] font-bold text-slate-400 mt-1">Troco: {fmt(changeFor - total)}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
