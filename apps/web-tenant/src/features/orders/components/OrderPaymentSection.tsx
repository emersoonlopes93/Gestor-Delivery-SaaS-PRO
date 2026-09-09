import { memo } from 'react';
import { CreditCard, Wallet, Banknote, Ticket, Sparkles, type LucideIcon } from 'lucide-react';
import type { OrderFinancialSummary } from '@gestor/types';

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
  financialSummary?: OrderFinancialSummary;
}

const PAYMENT_METHOD_LABELS: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  credit_card: { label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400' },
  debit_card: { label: 'Cartão de Débito', icon: CreditCard, color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-400' },
  card_on_delivery: { label: 'Cartão na Entrega', icon: CreditCard, color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-400' },
  pix: { label: 'PIX', icon: Sparkles, color: 'text-teal-600 bg-teal-100 dark:bg-teal-900/40 dark:text-teal-400' },
  cash: { label: 'Dinheiro', icon: Banknote, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400' },
  meal_voucher: { label: 'Vale Refeição', icon: Ticket, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400' },
  online: { label: 'Pagamento Online', icon: Wallet, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-400' },
  other: { label: 'Outro', icon: Wallet, color: 'text-muted-foreground bg-muted dark:bg-slate-800 dark:text-muted-foreground' },
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
  cashbackUsed,
  financialSummary,
}: OrderPaymentSectionProps) {
  
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const payment = PAYMENT_METHOD_LABELS[paymentMethod] || { label: paymentMethod, icon: Wallet, color: 'text-muted-foreground bg-muted dark:bg-slate-800 dark:text-muted-foreground' };
  const Icon = payment.icon;
  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-3">Pagamento e Totais</h3>
      <div className="bg-background p-5 rounded-2xl border border-border">
        
        {/* Detalhamento de Valores */}
        <div className="space-y-2.5 mb-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Venda dos produtos</span>
            <span className="text-foreground font-bold">{fmt(itemsSubtotal)}</span>
          </div>
          
          {deliveryFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">Taxa de entrega do cliente</span>
              <span className="text-foreground font-bold">{fmt(deliveryFee)}</span>
            </div>
          )}

          {serviceFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">Taxa de serviço do cliente</span>
              <span className="text-foreground font-bold">{fmt(serviceFee)}</span>
            </div>
          )}

          {discountTotal > 0 && (
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Ticket className="w-3.5 h-3.5" />
                <span className="font-medium">
                  Descontos{financialSummary?.discountFundingState === 'UNKNOWN' ? ' (origem não informada)' : ''} {couponCode ? `(${couponCode})` : ''}
                </span>
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

          {financialSummary?.amountToCollectState ? (
            <div className="space-y-2.5 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black uppercase tracking-tight text-foreground">Status do pagamento</span>
                <span className="text-sm font-black text-foreground">{financialSummary.paymentLabel}</span>
              </div>
              {typeof financialSummary.customerPaid === 'number' ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-muted-foreground">Total pago pelo cliente</span>
                  <span className="font-black text-foreground">{fmt(financialSummary.customerPaid)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-muted-foreground">Valor a cobrar</span>
                <span className="font-black text-foreground">
                  {financialSummary.amountToCollectState === 'KNOWN' && typeof financialSummary.amountToCollect === 'number'
                    ? fmt(financialSummary.amountToCollect)
                    : 'A confirmar'}
                </span>
              </div>
              {financialSummary.paymentState === 'PAID' && financialSummary.amountToCollect === 0 ? (
                <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Não cobrar na entrega
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-muted-foreground">Repasse previsto para a loja</span>
                <span className="font-black text-foreground">
                  {financialSummary.merchantReceivableState === 'KNOWN' && typeof financialSummary.merchantReceivable === 'number'
                    ? fmt(financialSummary.merchantReceivable)
                    : 'A confirmar'}
                </span>
              </div>
            </div>
          ) : (
            <div className="pt-4 border-t border-border flex justify-between items-center">
              <div>
                <span className="text-sm font-black text-foreground uppercase tracking-tight">{financialSummary?.operationalValueLabel ?? 'Valor do pedido'}</span>
                <p className="mt-1 text-[10px] font-bold text-muted-foreground">{financialSummary?.paymentLabel ?? 'Pagamento não confirmado'}</p>
              </div>
              <span className="text-xl font-black text-foreground">{fmt(financialSummary?.operationalValue ?? total)}</span>
            </div>
          )}
        </div>

        {/* Método de Pagamento */}
        <div className="bg-card p-3.5 rounded-xl border border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${payment.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Método</p>
              <p className="text-sm font-black text-foreground leading-none">{payment.label}</p>
            </div>
          </div>
          
          {paymentMethod === 'cash' && changeFor && changeFor > total && (
            <div className="text-right">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Troco para</p>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 leading-none">{fmt(changeFor)}</p>
              <p className="text-[9px] font-bold text-muted-foreground mt-1">Troco: {fmt(changeFor - total)}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
