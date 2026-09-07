import { NotFoundException } from '@nestjs/common';
import {
  FinancialStatus as PrismaFinancialStatus,
  FinancialTransactionType as PrismaFinancialTransactionType,
} from '@prisma/client';
import { FinancialStatus, FinancialTransactionType } from '@gestor/types';
import { FinancialTransactionsService } from './financial-transactions.service';

type Account = { id: string; tenantId: string; name: string; balance: number };
type Transaction = {
  id: string; tenantId: string; accountId: string | null; type: PrismaFinancialTransactionType;
  category: string; amount: number; status: PrismaFinancialStatus; dueDate: Date | null;
  paymentDate: Date | null; description: string | null; referenceId: string | null;
  referenceType: string | null; createdAt: Date; updatedAt: Date;
};

describe('FinancialTransactionsService account balance effects', () => {
  const makeHarness = () => {
    const accounts: Account[] = [
      { id: 'account-a', tenantId: 'tenant-a', name: 'A', balance: 0 },
      { id: 'account-b', tenantId: 'tenant-a', name: 'B', balance: 0 },
      { id: 'account-other', tenantId: 'tenant-b', name: 'Other', balance: 0 },
    ];
    const transactions: Transaction[] = [];
    const findAccount = (where: { id?: string; tenantId?: string }) =>
      accounts.find((account) => (!where.id || account.id === where.id) && (!where.tenantId || account.tenantId === where.tenantId)) ?? null;
    const findTransaction = (where: { id?: string; tenantId?: string }) =>
      transactions.find((transaction) => (!where.id || transaction.id === where.id) && (!where.tenantId || transaction.tenantId === where.tenantId)) ?? null;
    const withAccount = (transaction: Transaction) => ({ ...transaction, account: findAccount({ id: transaction.accountId ?? undefined }) });

    const tx = {
      financialAccount: {
        findFirst: jest.fn(async ({ where }: { where: { id?: string; tenantId?: string } }) => findAccount(where)),
        updateMany: jest.fn(async ({ where, data }: { where: { id: string; tenantId: string }; data: { balance: { increment: number } } }) => {
          const account = findAccount(where);
          if (!account) return { count: 0 };
          account.balance += data.balance.increment;
          return { count: 1 };
        }),
      },
      financialTransaction: {
        create: jest.fn(async ({ data }: { data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> }) => {
          const transaction: Transaction = {
            ...data, id: `transaction-${transactions.length + 1}`,
            accountId: data.accountId ?? null, dueDate: data.dueDate ?? null, paymentDate: data.paymentDate ?? null,
            description: data.description ?? null, referenceId: data.referenceId ?? null, referenceType: data.referenceType ?? null,
            createdAt: new Date(), updatedAt: new Date(),
          };
          transactions.push(transaction);
          return withAccount(transaction);
        }),
        findFirst: jest.fn(async ({ where }: { where: { id?: string; tenantId?: string } }) => {
          const transaction = findTransaction(where);
          return transaction ? withAccount(transaction) : null;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { id: string; tenantId: string }; data: Partial<Transaction> }) => {
          const transaction = findTransaction(where);
          if (!transaction) return { count: 0 };
          Object.assign(transaction, data, { updatedAt: new Date() });
          return { count: 1 };
        }),
      },
    };
    const prisma = {
      financialAccount: tx.financialAccount,
      financialTransaction: tx.financialTransaction,
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    return { service: new FinancialTransactionsService(prisma as never), accounts };
  };

  const create = (service: FinancialTransactionsService, type: FinancialTransactionType, status: FinancialStatus, amount: number, accountId = 'account-a') =>
    service.create('tenant-a', { accountId, type, category: 'test', amount, status });

  it('leaves pending income and expense outside the account balance', async () => {
    const { service, accounts } = makeHarness();
    await create(service, FinancialTransactionType.INCOME, FinancialStatus.PENDING, 100);
    await create(service, FinancialTransactionType.EXPENSE, FinancialStatus.PENDING, 60);
    expect(accounts[0].balance).toBe(0);
  });

  it('applies paid income and expense with opposite signs', async () => {
    const { service, accounts } = makeHarness();
    await create(service, FinancialTransactionType.INCOME, FinancialStatus.PAID, 100);
    await create(service, FinancialTransactionType.EXPENSE, FinancialStatus.PAID, 60);
    expect(accounts[0].balance).toBe(40);
  });

  it('applies pending-to-paid exactly once and uses only the amount delta thereafter', async () => {
    const { service, accounts } = makeHarness();
    const transaction = await create(service, FinancialTransactionType.INCOME, FinancialStatus.PENDING, 100);
    await service.update('tenant-a', transaction.id, { status: FinancialStatus.PAID });
    await service.update('tenant-a', transaction.id, { amount: 150 });
    await service.update('tenant-a', transaction.id, { amount: 150 });
    expect(accounts[0].balance).toBe(150);
  });

  it('uses the correct delta when a paid expense amount changes', async () => {
    const { service, accounts } = makeHarness();
    const transaction = await create(service, FinancialTransactionType.EXPENSE, FinancialStatus.PAID, 100);
    await service.update('tenant-a', transaction.id, { amount: 150 });
    expect(accounts[0].balance).toBe(-150);
  });

  it('reverts the old account and applies the new one for a paid transaction', async () => {
    const { service, accounts } = makeHarness();
    const transaction = await create(service, FinancialTransactionType.INCOME, FinancialStatus.PAID, 80);
    await service.update('tenant-a', transaction.id, { accountId: 'account-b' });
    expect(accounts[0].balance).toBe(0);
    expect(accounts[1].balance).toBe(80);
  });

  it('reverts a paid transaction when it becomes pending or cancelled without double application', async () => {
    const { service, accounts } = makeHarness();
    const transaction = await create(service, FinancialTransactionType.INCOME, FinancialStatus.PAID, 90);
    await service.update('tenant-a', transaction.id, { status: FinancialStatus.PENDING });
    await service.update('tenant-a', transaction.id, { status: FinancialStatus.PENDING });
    await service.update('tenant-a', transaction.id, { status: FinancialStatus.PAID });
    await service.update('tenant-a', transaction.id, { status: FinancialStatus.CANCELLED });
    expect(accounts[0].balance).toBe(0);
  });

  it('rejects a cross-tenant account change without mutating either balance', async () => {
    const { service, accounts } = makeHarness();
    const transaction = await create(service, FinancialTransactionType.INCOME, FinancialStatus.PAID, 50);
    await expect(service.update('tenant-a', transaction.id, { accountId: 'account-other' })).rejects.toBeInstanceOf(NotFoundException);
    expect(accounts[0].balance).toBe(50);
    expect(accounts[2].balance).toBe(0);
  });
});
