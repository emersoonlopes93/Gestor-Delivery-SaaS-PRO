import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./FinancePage.tsx', import.meta.url), 'utf8');
const navigationRegistry = readFileSync(new URL('../../navigation/navigationRegistry.ts', import.meta.url), 'utf8');

describe('FinancePage UX contract', () => {
  it('keeps the one-day dashboard and financial transaction requests unchanged', () => {
    expect(source).toContain("const today = format(new Date(), 'yyyy-MM-dd')");
    expect(source).toContain('`/analytics/dashboard?startDate=${today}&endDate=${today}`');
    expect(source).toContain("api.get<FinancialTransactionDTO[]>('/finance/transactions')");
    expect(source).not.toContain("api.get<FinancialAccountDTO[]>");
  });

  it('preserves finance actions, four overview values, DRE, and in-memory pending composition', () => {
    expect(source).toContain('handleExport');
    expect(source).toContain('TransactionModal');
    expect(source).toContain('onSave={loadData}');
    expect(source).toContain('<PrimaryBalance value={formatCurrency(metrics?.financial.cashBalance)}');
    expect(source).toContain('<SummaryMetric label="Entradas"');
    expect(source).toContain('<SummaryMetric label="Saídas"');
    expect(source).toContain('<SummaryMetric label="Lucro operacional"');
    expect(source).toContain('DRE gerencial');
    expect(source).toContain("transactions.filter((transaction) => transaction.type === 'expense' && transaction.status !== 'paid')");
    expect(source).toContain('pendingExpenses.slice(0, 5)');
  });

  it('keeps existing guarded destinations and accessible responsive structure', () => {
    expect(source).toContain("['management.finance', 'cash.home', 'analytics.reports']");
    expect(source).toContain('aria-label="Contas e pendências"');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:col-span-7 xl:grid-cols-3');
    expect(source).toContain('grid grid-cols-1 xl:grid-cols-12');
    expect(navigationRegistry).toContain("id: 'cash.home'");
    expect(navigationRegistry).toContain("path: '/cash'");
    expect(navigationRegistry).toContain("id: 'analytics.reports'");
    expect(navigationRegistry).toContain("path: '/analytics/reports'");
  });

  it('keeps financial unknown states and mobile reading safeguards explicit', () => {
    expect(source).toContain('const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false)');
    expect(source).toContain('if (transRes.success) {');
    expect(source).toContain('setHasLoadedTransactions(true)');
    expect(source).toContain('isLoading || !hasLoadedTransactions');
    expect(source).toContain('Carregando pendências...');
    expect(source).toContain('break-words text-xl');
    expect(source).not.toContain('truncate text-2xl');
    expect(source.match(/<h1/g)).toHaveLength(1);
  });
});
