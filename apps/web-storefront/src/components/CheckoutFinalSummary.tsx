import type { CartLineItem, FulfillmentType, PaymentInput } from '@gestor/types';
import { getCheckoutItemDetails } from '../lib/checkout-summary';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const paymentLabels: Record<PaymentInput['method'], string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  credit_card: 'Cartão de crédito on-line',
  debit_card: 'Cartão de débito on-line',
  card_on_delivery: 'Cartão na entrega',
  other: 'Outro',
};

interface CheckoutFinalSummaryProps {
  items: CartLineItem[];
  subtotal: number;
  deliveryFee: number;
  deliveryEstimatedMinutes: number | null;
  discountTotal: number;
  cashbackUsed: number;
  couponCode: string;
  total: number;
  fulfillmentType: FulfillmentType;
  payment: PaymentInput;
  addressSummary?: string;
  notes?: string;
  isValidating: boolean;
}

export function CheckoutFinalSummary({
  items,
  subtotal,
  deliveryFee,
  deliveryEstimatedMinutes,
  discountTotal,
  cashbackUsed,
  couponCode,
  total,
  fulfillmentType,
  payment,
  addressSummary,
  notes,
  isValidating,
}: CheckoutFinalSummaryProps) {
  const couponDiscount = Math.max(0, discountTotal - cashbackUsed);

  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="checkout-final-summary">
      <h2 id="checkout-final-summary" className="mb-4 text-sm font-black uppercase tracking-widest text-gray-700">
        Confira seu pedido
      </h2>

      <div className="space-y-3">
        {items.map((item) => {
          const details = getCheckoutItemDetails(item);
          return (
            <div key={item.cartLineId} className="border-b border-gray-100 pb-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="font-semibold text-gray-800">{item.quantity}x {item.snapshot.productName}</span>
                <span className="shrink-0 font-bold text-gray-900">{currency.format(item.snapshot.lineSubtotal)}</span>
              </div>
              {details.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                  {details.map((detail) => <li key={detail}>• {detail}</li>)}
                </ul>
              )}
              {item.notes?.trim() && <p className="mt-1 text-xs italic text-gray-600">Item: {item.notes.trim()}</p>}
            </div>
          );
        })}
      </div>

      <dl className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-sm">
        <div className="flex justify-between text-gray-600"><dt>Subtotal</dt><dd>{currency.format(subtotal)}</dd></div>
        {fulfillmentType === 'delivery' && (
          <div className="flex justify-between text-gray-600">
            <dt>Taxa de entrega</dt>
            <dd>{isValidating ? 'Calculando…' : deliveryFee === 0 ? 'Grátis' : currency.format(deliveryFee)}</dd>
          </div>
        )}
        {fulfillmentType === 'delivery' && deliveryEstimatedMinutes !== null && (
          <div className="flex justify-between text-gray-600"><dt>Previsão de entrega</dt><dd>{deliveryEstimatedMinutes} min</dd></div>
        )}
        {couponCode && couponDiscount > 0 && (
          <div className="flex justify-between text-green-700"><dt>Cupom {couponCode}</dt><dd>- {currency.format(couponDiscount)}</dd></div>
        )}
        {cashbackUsed > 0 && (
          <div className="flex justify-between text-green-700"><dt>Cashback utilizado</dt><dd>- {currency.format(cashbackUsed)}</dd></div>
        )}
        {!couponCode && cashbackUsed === 0 && discountTotal > 0 && (
          <div className="flex justify-between text-green-700"><dt>Descontos</dt><dd>- {currency.format(discountTotal)}</dd></div>
        )}
        <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-black text-gray-950">
          <dt>Total</dt><dd>{currency.format(total)}</dd>
        </div>
      </dl>

      <dl className="mt-4 space-y-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
        <div><dt className="font-bold">Recebimento</dt><dd>{fulfillmentType === 'delivery' ? 'Entrega' : fulfillmentType === 'pickup' ? 'Retirada na loja' : 'Mesa'}</dd></div>
        {fulfillmentType === 'delivery' && addressSummary && <div><dt className="font-bold">Endereço</dt><dd>{addressSummary}</dd></div>}
        <div><dt className="font-bold">Pagamento</dt><dd>{paymentLabels[payment.method]}</dd></div>
        {payment.method === 'cash' && payment.changeFor != null && payment.changeFor > 0 && (
          <div><dt className="font-bold">Troco para</dt><dd>{currency.format(payment.changeFor)}</dd></div>
        )}
        {notes?.trim() && <div><dt className="font-bold">Observação geral</dt><dd>{notes.trim()}</dd></div>}
      </dl>
    </section>
  );
}
