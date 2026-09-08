import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/orders/components/OrderPaymentSection.tsx'),
  'utf8',
);

describe('order payment method labels', () => {
  it.each([
    ['credit_card', 'Cartão de Crédito'],
    ['debit_card', 'Cartão de Débito'],
    ['card_on_delivery', 'Cartão na Entrega'],
    ['pix', 'PIX'],
    ['cash', 'Dinheiro'],
    ['online', 'Pagamento Online'],
    ['other', 'Outro'],
  ])('maps internal method %s to the expected label', (method, label) => {
    expect(source).toContain(`${method}: { label: '${label}'`);
  });

  it('uses the normalized internal payment method instead of provider raw data', () => {
    expect(source).toContain('PAYMENT_METHOD_LABELS[paymentMethod]');
    expect(source).not.toContain('pay_channel');
    expect(source).not.toContain('pay_type');
  });
});
