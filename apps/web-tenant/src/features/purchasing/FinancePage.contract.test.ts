import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./FinancePage.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('./TransactionModal.tsx', import.meta.url), 'utf8');
const navigationRegistry = readFileSync(new URL('../../navigation/navigationRegistry.ts', import.meta.url), 'utf8');

describe('FinancePage UX contract', () => {
  it('uses the finance-read summary and one selected range for summary, transactions, and export', () => {
    expect(source).toContain('/finance/summary?startDate=${startDate}&endDate=${endDate}');
    expect(source).toContain('/finance/transactions?startDate=${startDate}&endDate=${endDate}');
    expect(source).not.toContain('/analytics/dashboard');
    expect(source).toContain('financeiro_${startDate}_a_${endDate}.csv');
  });

  it('keeps sales, recorded receipts, documented receivables, and current balance distinct', () => {
    expect(source).toContain('Vendas concluídas');
    expect(source).toContain('Recebido nas contas');
    expect(source).toContain('A receber confirmado');
    expect(source).toContain('Saldo das contas financeiras');
    expect(source).toContain('summary?.currentAccountsBalance');
    expect(source).toContain('iFood não está disponível aqui');
  });

  it('shows only pending and overdue expenses as payables and calls out cancelled records', () => {
    expect(source).toContain("transaction.status === FinancialStatus.PENDING || transaction.status === FinancialStatus.OVERDUE");
    expect(source).toContain('Canceladas não entram');
    expect(source).toContain('Vencido');
  });

  it('keeps cash operationally separate and preserves the guarded cash destination', () => {
    expect(source).toContain('Caixa operacional');
    expect(source).toContain('Não é somado às contas financeiras nesta tela');
    expect(source).toContain('to="/cash"');
    expect(navigationRegistry).toContain("id: 'cash.home'");
  });

  it('makes a paid creation attributable and avoids unsupported paid-value edits', () => {
    expect(modal).toContain('crypto.randomUUID()');
    expect(modal).toContain('idempotencyKey');
    expect(modal).toContain('Selecione a conta financeira');
    expect(modal).toContain('disabled={isPaidRecord}');
    expect(modal).toContain('Este lançamento já movimentou uma conta');
  });

  it('keeps historical paid records without a date visible for individual review', () => {
    expect(source).toContain('paidWithoutPaymentDate');
    expect(source).toContain('não foram alterados automaticamente');
  });

  it('keeps the detailed workspace compact, paginated, and local to the loaded period', () => {
    expect(source).toContain("type FinanceTab = 'transactions' | 'settlements' | 'payables' | 'channels'");
    expect(source).toContain('const PAGE_SIZE = 20');
    expect(source).toContain('Buscar descrição ou categoria');
    expect(source).toContain('filteredTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)');
    expect(source).toContain('Nenhum lançamento corresponde à busca.');
  });

  it('uses a selected transaction drawer and keeps reconciliation exclusively in the settlements tab', () => {
    expect(source).toContain('Detalhes do lançamento');
    expect(source).toContain('Referências técnicas e identificadores do provedor não são exibidos nesta visão.');
    expect(source).toContain("activeTab === 'settlements' && <Food99ReconciliationPanel");
    expect(source).not.toContain('</section>\n      <Food99ReconciliationPanel');
  });
});
