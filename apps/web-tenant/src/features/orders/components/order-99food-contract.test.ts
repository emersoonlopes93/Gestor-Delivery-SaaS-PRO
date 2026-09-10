import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const drawer = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderDrawer.tsx'), 'utf8');
const payment = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderPaymentSection.tsx'), 'utf8');

describe('99Food order operational contract', () => {
  it('keeps the provider order number primary and the PedeHub number available', () => {
    expect(drawer).toContain('Pedido 99Food #${order.operational.providerOrderNumber}');
    expect(drawer).toContain('PedeHub #{order.orderNumber}');
    expect(drawer).toContain("order?.operational?.origin === 'FOOD_99'");
  });

  it('separates gross, customer payment, estimated gain and settled receivable', () => {
    expect(payment).toContain('Venda dos produtos');
    expect(payment).toContain('Total pago pelo cliente');
    expect(payment).toContain('Valor a cobrar');
    expect(payment).toContain('Ganho estimado da loja');
    expect(payment).toContain('Repasse liquidado');
    expect(payment).toContain('financialValue(financialSummary.settledReceivableState');
  });
});
