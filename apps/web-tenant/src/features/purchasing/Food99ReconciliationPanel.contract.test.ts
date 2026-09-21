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
    expect(panel.indexOf('Conta financeira de destino')).toBeLessThan(panel.indexOf('aria-expanded={showDetails}'));
    expect(panel).toContain('Não configurada');
    expect(panel).toContain('Registrar no financeiro');
    expect(panel).toContain("settlement.status === 'LIQUIDATED_UNPOSTED'");
    expect(panel).toContain('connection.id === settlement.connectionId');
  });

  it('does not turn missing WhiteList access into a zero-valued settlement state', () => {
    expect(panel).toContain("caught.code === 'FINANCE_ACCESS_NOT_ENABLED'");
    expect(panel).toContain("caught.code === 'FINANCE_PROVIDER_UNAUTHORIZED'");
    expect(panel).toContain('autorização da loja e a habilitação do acesso financeiro');
    expect(panel).not.toContain('Os repasses não foram alterados');
    expect(panel).toContain('safeSupportDetails(caught)');
    expect(panel).not.toContain('setSupportDetails(caught.message)');
    expect(panel).toContain('return `HTTP ${caught.status} · ${code}`');
    expect(panel).toContain('Ver informações para suporte');
    expect(panel).toContain('caught.status === 404');
    expect(panel).toContain("caught.code === 'FINANCE_RESPONSE_UNRECOGNIZED'");
    expect(panel).toContain("caught.code === 'FINANCE_EMPTY_RESPONSE'");
    expect(panel).not.toContain("accessNotEnabled ? 'R$ 0,00'");
  });

  it('keeps settlement amount aggregate and Bill composition visibly distinct', () => {
    expect(panel).toContain('withdrawAmountCents');
    expect(panel).toContain('linkedSettlementAmountCents');
    expect(panel).toContain('compositionDifferenceCents');
    expect(panel).toContain('Divergência');
    expect(panel).toContain('weekPaymentId');
    expect(panel).toContain('dayPaymentId');
    expect(panel).toContain('Ver detalhes e suporte');
    expect(panel).toContain('Criar conta financeira');
    expect(panel).toContain("api.post<FinancialAccountDTO>('/finance/accounts'");
    expect(panel).toContain("api.put(`/finance/marketplaces/99food/connections/${connectionId}/settlement-account`");
    expect(panel).toContain('accountId: createdAccount.id');
    expect(panel).toContain('Conta criada e definida como destino dos repasses. Nenhum repasse foi registrado.');
    expect(panel).toContain('initialBalance: 0');
    expect(panel).toContain('Criar ou escolher uma conta não registra o repasse');
    expect(panel).toContain('Selecione a integração da 99Food antes de configurar a conta de destino.');
    expect(panel).toContain('A conta foi criada, mas não foi possível defini-la como destino.');
  });

  it('preserves the shared legacy/V2 order payment contract', () => {
    expect(legacyPayment).toContain('Venda dos produtos');
    expect(legacyPayment).toContain('Total pago pelo cliente');
    expect(legacyPayment).toContain('Valor a cobrar');
    expect(legacyPayment).toContain('Ganho estimado da loja');
    expect(legacyPayment).toContain('Valor de loja informado pela 99Food no pedido');
    expect(legacyPayment).toContain('Repasse previsto');
    expect(legacyPayment).toContain('O pedido não informa um valor previsto de repasse verificável');
    expect(legacyPayment).toContain('não informou um ganho de loja confiável');
    expect(v2Details).toContain('OrderPaymentSection');
    expect(v2Details).toContain('origin={origin}');
    expect(v2Details).not.toContain('merchantEstimatedReceivable =');
    expect(v2Details).not.toContain('withdrawAmount');
  });
});
