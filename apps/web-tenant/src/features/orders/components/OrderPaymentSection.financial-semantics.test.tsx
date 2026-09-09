import { renderToStaticMarkup } from 'react-dom/server';
import type { OrderFinancialSummary } from '@gestor/types';
import { OrderPaymentSection } from './OrderPaymentSection';

const baseFinancial: OrderFinancialSummary = {
  operationalValue: 50,
  operationalValueLabel: 'Venda dos produtos',
  saleAmount: 50,
  customerPaid: null,
  paymentState: 'UNKNOWN',
  paymentLabel: 'Pagamento a confirmar',
  amountToCollect: null,
  amountToCollectState: 'UNKNOWN',
  collectionResponsibility: 'UNKNOWN',
  merchantReceivable: null,
  merchantReceivableState: 'UNKNOWN',
  discountFundingState: 'UNKNOWN',
  platformFees: null,
  platformFeesState: 'UNKNOWN',
};

function render(financialSummary: OrderFinancialSummary, paymentMethod = 'pix', discountTotal = 0): string {
  return renderToStaticMarkup(
    <OrderPaymentSection
      itemsSubtotal={50}
      deliveryFee={0}
      serviceFee={0}
      discountTotal={discountTotal}
      total={42}
      paymentMethod={paymentMethod}
      financialSummary={financialSummary}
    />,
  );
}

describe('OrderPaymentSection 99Food financial semantics', () => {
  it('shows paid online separately from gross and instructs self-delivery not to charge', () => {
    const html = render({
      ...baseFinancial,
      customerPaid: 42,
      paymentState: 'PAID',
      paymentLabel: 'Pago na 99Food',
      amountToCollect: 0,
      amountToCollectState: 'KNOWN',
      collectionResponsibility: 'MARKETPLACE',
    }, 'pix', 8);

    expect(html).toContain('Venda dos produtos');
    expect(html).toContain('50,00');
    expect(html).toContain('Pago na 99Food');
    expect(html).toContain('Total pago pelo cliente');
    expect(html).toContain('Valor a cobrar');
    expect(html).toContain('Não cobrar na entrega');
    expect(html).toContain('Repasse previsto para a loja');
    expect(html).toContain('A confirmar');
    expect(html).toContain('origem não informada');
  });

  it('shows the exact pay-on-delivery amount without claiming it was paid', () => {
    const html = render({
      ...baseFinancial,
      paymentState: 'PENDING',
      paymentLabel: 'A cobrar na entrega',
      amountToCollect: 42,
      amountToCollectState: 'KNOWN',
      collectionResponsibility: 'DRIVER',
    }, 'cash');

    expect(html).toContain('A cobrar na entrega');
    expect(html).toContain('42,00');
    expect(html).not.toContain('Total pago pelo cliente');
    expect(html).not.toContain('NÃ£o cobrar na entrega');
  });

  it('shows unknown collection and receivable values as confirmation pending, never zero', () => {
    const html = render(baseFinancial, 'other');

    expect(html).toContain('Pagamento a confirmar');
    expect(html).toContain('Valor a cobrar');
    expect(html).toContain('A confirmar');
    expect(html).toContain('Valor a cobrar</span><span class="font-black text-foreground">A confirmar');
  });
});
