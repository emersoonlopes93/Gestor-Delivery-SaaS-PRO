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
});
