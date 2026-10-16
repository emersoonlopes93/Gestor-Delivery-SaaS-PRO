import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const drawer = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderDrawer.tsx'), 'utf8');
const payment = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderPaymentSection.tsx'), 'utf8');
const v2Card = readFileSync(resolve(process.cwd(), 'src/features/orders/v2/OrderCardV2.tsx'), 'utf8');
const v2Details = readFileSync(resolve(process.cwd(), 'src/features/orders/v2/OrderDetailsModalV2.tsx'), 'utf8');

describe('99Food order operational contract', () => {
  it('keeps the provider order number primary and the PedeHub number available', () => {
    expect(drawer).toContain('Pedido 99Food #${order.operational.providerOrderNumber}');
    expect(drawer).toContain('PedeHub #{order.orderNumber}');
    expect(drawer).toContain("order?.operational?.origin === 'FOOD_99'");
  });

  it('uses server-derived logistics and cash-confirmation capability without treating an idle sync state as success', () => {
    expect(drawer).toContain('courierCashConfirmation');
    expect(drawer).toContain('/pay-confirm');
    expect(drawer).toContain('não cria lançamento financeiro');
    expect(v2Details).toContain('providerStatusLabel');
    expect(v2Details).toContain('riderToBusinessEta');
    expect(v2Card).toContain("syncState !== 'NONE'");
    expect(v2Card).not.toContain("'Sincronizado'");
  });

  it('shows only the official expected net amount on the order detail', () => {
    expect(payment).toContain('Venda dos produtos');
    expect(payment).toContain('Total pago pelo cliente');
    expect(payment).toContain('Valor a cobrar');
    expect(payment).toContain('Valor líquido previsto');
    expect(payment).toContain('expectedNetAmountCents / 100');
    expect(payment).not.toContain('Ganho estimado da loja');
    expect(payment).not.toContain('Repasse liquidado');
  });
});
