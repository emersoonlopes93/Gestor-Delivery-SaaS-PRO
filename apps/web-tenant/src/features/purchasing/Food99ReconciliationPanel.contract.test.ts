import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('./Food99ReconciliationPanel.tsx', import.meta.url), 'utf8');
const financePage = readFileSync(new URL('./FinancePage.tsx', import.meta.url), 'utf8');
const legacyPayment = readFileSync(new URL('../orders/components/OrderPaymentSection.tsx', import.meta.url), 'utf8');
const v2Details = readFileSync(new URL('../orders/v2/OrderDetailsModalV2.tsx', import.meta.url), 'utf8');

describe('99Food financial reconciliation UI contract', () => {
  it('adds a finance-only reconciliation surface without changing order calculations', () => {
    expect(financePage).toContain('<Food99ReconciliationPanel canManage={canManageFinance} startDate={startDate} endDate={endDate} />');
    expect(panel).toContain('Conciliação de repasses');
    expect(panel).toContain('Os detalhes explicam os repasses; somente um repasse confirmado altera o saldo.');
    expect(panel).not.toContain('FinancialProjection');
  });

  it('shows explicit account selection and requires a manual posting action', () => {
    expect(panel).toContain('Conta financeira de destino');
    expect(panel).toContain('Não configurada');
    expect(panel).toContain('Registrar no financeiro');
    expect(panel).toContain("settlement.status === 'LIQUIDATED_UNPOSTED'");
    expect(panel).toContain('connection.id === settlement.connectionId');
    expect(panel).toContain('reconciliationResponse.data.connections.length === 1');
    expect(panel).toContain('Selecione uma loja para configurar ou sincronizar');
    expect(panel).toContain('Gerenciar contas financeiras');
    expect(panel).toContain('/management/finance');
  });

  it('does not turn missing WhiteList access into a zero-valued settlement state', () => {
    expect(panel).toContain("caught.code === 'FINANCE_ACCESS_NOT_ENABLED'");
    expect(panel).toContain('A 99Food requer liberação/WhiteList');
    expect(panel).not.toContain("accessNotEnabled ? 'R$ 0,00'");
    expect(panel).toContain('caught.status === 401 || caught.status === 403');
  });

  it('keeps settlement amount aggregate and Bill composition visibly distinct', () => {
    expect(panel).toContain('withdrawAmountCents');
    expect(panel).toContain('linkedSettlementAmountCents');
    expect(panel).toContain('compositionDifferenceCents');
    expect(panel).toContain('Divergência');
    expect(panel).toContain('weekPaymentId');
    expect(panel).toContain('dayPaymentId');
    expect(panel).toContain("'Detalhes'");
  });

  it('preserves the shared legacy/V2 order payment contract', () => {
    expect(legacyPayment).toContain('Venda dos produtos');
    expect(legacyPayment).toContain('Total pago pelo cliente');
    expect(legacyPayment).toContain('Valor a cobrar');
    expect(legacyPayment).toContain('Ganho estimado da loja');
    expect(v2Details).toContain('OrderPaymentSection');
    expect(v2Details).not.toContain('merchantEstimatedReceivable =');
    expect(v2Details).not.toContain('withdrawAmount');
  });
});
