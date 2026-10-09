import { AnalyticsService } from './analytics.service';

describe('AnalyticsService canonical financial account balance', () => {
  it('uses only persisted active account balances scoped to the tenant', async () => {
    const prisma = {
      financialTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      financialAccount: { aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 125.5 } }) },
    };
    const service = new AnalyticsService(prisma as never);

    await expect(service.getFinancialMetrics('tenant-1', {
      startDate: '2026-09-09T00:00:00.000Z',
      endDate: '2026-09-09T23:59:59.999Z',
    })).resolves.toMatchObject({ cashBalance: 125.5 });
    expect(prisma.financialAccount.aggregate).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', active: true },
      _sum: { balance: true },
    });
  });

  it('does not derive balance from transactions, projections or marketplace sales', async () => {
    const prisma = {
      financialTransaction: { findMany: jest.fn().mockResolvedValue([
        { type: 'income', amount: 900, status: 'paid' },
        { type: 'expense', amount: 100, status: 'paid' },
      ]) },
      financialAccount: { aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 40 } }) },
    };
    const result = await new AnalyticsService(prisma as never).getFinancialMetrics('tenant-1', {
      startDate: '2026-09-09T00:00:00.000Z',
      endDate: '2026-09-09T23:59:59.999Z',
    });
    expect(result).toMatchObject({ totalIncome: 900, totalExpenses: 100, cashBalance: 40 });
  });
});
