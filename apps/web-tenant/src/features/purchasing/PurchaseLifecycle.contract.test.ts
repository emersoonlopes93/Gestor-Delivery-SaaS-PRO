import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./PurchasesPage.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('./PurchaseModal.tsx', import.meta.url), 'utf8');

describe('Purchase lifecycle UI contract', () => {
  it('keeps one idempotency key for each logical create attempt', () => {
    expect(modal).toContain("idempotencyKey: createIdempotencyKey()");
    expect(modal).toContain("register('idempotencyKey'");
    expect(page).toContain("api.post('/purchasing/purchases', data)");
  });

  it('requires an active financial account for paid creation', () => {
    expect(modal).toContain("api.get<FinancialAccountDTO[]>('/finance/accounts')");
    expect(modal).toContain('accountRes.data.filter((account) => account.active)');
    expect(modal).toContain("watch('paymentStatus') === PaymentStatus.PAID");
    expect(modal).toContain("register('accountId'");
    expect(modal).not.toContain('PaymentStatus.PARTIAL, label');
  });

  it('exposes guarded full payment and confirmed cancellation without partial payment', () => {
    expect(page).toContain("has('purchasing.manage')");
    expect(page).toContain('`/purchasing/purchases/${purchaseToPay.id}/pay`');
    expect(page).toContain('`/purchasing/purchases/${purchase.id}/cancel`');
    expect(page).toContain("window.confirm('Cancelar esta compra integralmente e reverter seus efeitos?')");
    expect(page).toContain('purchase.paymentStatus !== PaymentStatus.PARTIAL');
    expect(page).toContain('disabled={!payAccountId || actionPending}');
  });
});
