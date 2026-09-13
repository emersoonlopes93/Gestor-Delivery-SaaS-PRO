import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Food99FinancialReconciliationService } from './services/food99-financial-reconciliation.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertLocalDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedDatabaseHosts.has(database.hostname) || !allowedDatabaseHosts.has(direct.hostname)) {
    throw new Error('99Food reconciliation test refused a non-local database.');
  }
  if (database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same local database.');
  }
}

describe('99Food financial reconciliation PostgreSQL constraints and concurrency', () => {
  const prisma = new PrismaClient();
  const service = new Food99FinancialReconciliationService(prisma as never, {} as never);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    assertLocalDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixtures(label: string, balance = 0) {
    const tenant = await prisma.tenant.create({
      data: { name: `99Food ${label}`, slug: `f99-${Math.random().toString(16).slice(2, 10)}-${suffix}` },
    });
    const account = await prisma.financialAccount.create({
      data: { tenantId: tenant.id, name: `99Food ${label}`, type: 'bank', balance, active: true },
    });
    const connection = await prisma.marketplaceConnection.create({
      data: {
        tenantId: tenant.id,
        provider: 'FOOD_99',
        status: 'CONNECTED',
        externalStoreId: `${Date.now()}${Math.floor(Math.random() * 100000)}`,
        settlementFinancialAccountId: account.id,
      },
    });
    return { tenant, account, connection };
  }

  async function createSettlement(
    fixture: Awaited<ReturnType<typeof fixtures>>,
    label: string,
    withdrawAmount: bigint,
  ) {
    return prisma.marketplaceSettlement.create({
      data: {
        tenantId: fixture.tenant.id,
        provider: 'FOOD_99',
        connectionId: fixture.connection.id,
        weekPaymentId: `week-${label}-${suffix}`,
        withdrawAmount,
        withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
        shopId: '5764608924570091908',
        settleStartDate: new Date('2026-09-01T00:00:00.000Z'),
        settleEndDate: new Date('2026-09-07T00:00:00.000Z'),
        currency: 'BRL',
        dayPayments: { create: [
          { dayPaymentId: '1945389697417496990' },
          { dayPaymentId: '1945389697417496991' },
        ] },
      },
    });
  }

  it('enforces official Bill, settlement, and structured day-payment identities', async () => {
    const fixture = await fixtures('constraints');
    const bill = {
      tenantId: fixture.tenant.id,
      provider: 'FOOD_99' as const,
      connectionId: fixture.connection.id,
      orderId: '5764609487470920339',
      orderType: 1,
      businessTs: '1945389697417496991',
      dayPaymentId: '1945389697417496990',
      commissionAmount: -100n,
      settlementAmount: 5000n,
      orderAmount: 5500n,
      shopActivityOutcome: -200n,
      shopActivitySubsidy: 300n,
    };
    await prisma.marketplaceBillEntry.create({ data: bill });
    await expect(prisma.marketplaceBillEntry.create({ data: bill })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.marketplaceBillEntry.create({
      data: { ...bill, businessTs: '1945389697417496992', settlementAmount: -1000n, orderType: 4 },
    })).resolves.toBeDefined();
    const secondConnection = await prisma.marketplaceConnection.create({
      data: {
        tenantId: fixture.tenant.id, provider: 'FOOD_99', status: 'CONNECTED',
        externalStoreId: `${Date.now()}${Math.floor(Math.random() * 100000)}`,
      },
    });
    await expect(prisma.marketplaceBillEntry.create({
      data: { ...bill, connectionId: secondConnection.id },
    })).resolves.toBeDefined();
    const foreign = await fixtures('constraints-foreign');
    await expect(prisma.marketplaceBillEntry.create({
      data: { ...bill, tenantId: foreign.tenant.id, connectionId: foreign.connection.id },
    })).resolves.toBeDefined();

    const settlement = await createSettlement(fixture, 'constraints', 4000n);
    await expect(prisma.marketplaceSettlement.create({
      data: {
        tenantId: fixture.tenant.id,
        provider: 'FOOD_99',
        connectionId: fixture.connection.id,
        weekPaymentId: settlement.weekPaymentId,
        withdrawAmount: 4000n,
        withdrawDate: new Date(),
        shopId: '5764608924570091908',
        settleStartDate: new Date(),
        settleEndDate: new Date(),
        currency: 'BRL',
      },
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.marketplaceSettlementDayPayment.create({
      data: { settlementId: settlement.id, dayPaymentId: '1945389697417496990' },
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.marketplaceSettlement.create({
      data: {
        tenantId: foreign.tenant.id,
        provider: 'FOOD_99',
        connectionId: foreign.connection.id,
        weekPaymentId: settlement.weekPaymentId,
        withdrawAmount: 4000n,
        withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
        shopId: '5764608924570091909',
        settleStartDate: new Date('2026-09-01T00:00:00.000Z'),
        settleEndDate: new Date('2026-09-07T00:00:00.000Z'),
        currency: 'BRL',
      },
    })).resolves.toBeDefined();
  });

  it('posts concurrent requests exactly once and preserves large IDs', async () => {
    const fixture = await fixtures('concurrency', 100);
    const settlement = await createSettlement(fixture, 'concurrency', 1234n);
    const [first, second] = await Promise.all([
      service.postSettlement(fixture.tenant.id, settlement.id),
      service.postSettlement(fixture.tenant.id, settlement.id),
    ]);

    expect(first.financialTransactionId).toBe(second.financialTransactionId);
    expect(first.shopId).toBe('5764608924570091908');
    expect(first.dayPaymentIds).toEqual(['1945389697417496990', '1945389697417496991']);
    expect(await prisma.financialTransaction.count({
      where: { tenantId: fixture.tenant.id, referenceId: settlement.weekPaymentId },
    })).toBe(1);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: fixture.account.id } })).balance)).toBe(112.34);
  }, 60_000);

  it('applies a negative withdrawal once using the existing expense ledger convention', async () => {
    const fixture = await fixtures('negative', 100);
    const settlement = await createSettlement(fixture, 'negative', -500n);
    const posted = await service.postSettlement(fixture.tenant.id, settlement.id);
    const transaction = await prisma.financialTransaction.findUniqueOrThrow({
      where: { id: posted.financialTransactionId as string },
    });
    expect(transaction.type).toBe('expense');
    expect(Number(transaction.amount)).toBe(5);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: fixture.account.id } })).balance)).toBe(95);
  });

  it('fully rolls back when linking the financial transaction fails', async () => {
    const fixture = await fixtures('rollback', 100);
    const settlement = await createSettlement(fixture, 'rollback', 2500n);
    await prisma.$executeRawUnsafe("CREATE OR REPLACE FUNCTION fail_food99_settlement_link_test() RETURNS trigger AS $$ BEGIN IF NEW.financial_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'injected settlement link failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql");
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_food99_settlement_link_test BEFORE UPDATE ON marketplace_settlements FOR EACH ROW EXECUTE FUNCTION fail_food99_settlement_link_test()');
    try {
      await expect(service.postSettlement(fixture.tenant.id, settlement.id)).rejects.toThrow('injected settlement link failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_food99_settlement_link_test ON marketplace_settlements');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_food99_settlement_link_test()');
    }
    expect(await prisma.financialTransaction.count({
      where: { tenantId: fixture.tenant.id, referenceId: settlement.weekPaymentId },
    })).toBe(0);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: fixture.account.id } })).balance)).toBe(100);
    expect((await prisma.marketplaceSettlement.findUniqueOrThrow({ where: { id: settlement.id } })).financialTransactionId).toBeNull();
  });

  it('rejects inactive and cross-tenant configured accounts', async () => {
    const fixture = await fixtures('account-safety');
    const foreign = await fixtures('foreign');
    await expect(service.configureSettlementAccount(
      fixture.tenant.id,
      fixture.connection.id,
      foreign.account.id,
    )).rejects.toThrow('deve estar ativa e pertencer ao tenant');
    const settlement = await createSettlement(fixture, 'account-safety', 1000n);
    await prisma.marketplaceConnection.update({
      where: { id: fixture.connection.id },
      data: { settlementFinancialAccountId: foreign.account.id },
    });
    await expect(service.postSettlement(fixture.tenant.id, settlement.id))
      .rejects.toThrow('inativa ou nao pertence ao tenant');
    expect(await prisma.financialTransaction.count({ where: { referenceId: settlement.weekPaymentId } })).toBe(0);
    await prisma.financialAccount.update({ where: { id: fixture.account.id }, data: { active: false } });
    await prisma.marketplaceConnection.update({
      where: { id: fixture.connection.id },
      data: { settlementFinancialAccountId: fixture.account.id },
    });
    await expect(service.configureSettlementAccount(
      fixture.tenant.id,
      fixture.connection.id,
      fixture.account.id,
    )).rejects.toThrow('deve estar ativa e pertencer ao tenant');
    await expect(service.postSettlement(fixture.tenant.id, settlement.id))
      .rejects.toThrow('inativa ou nao pertence ao tenant');
    expect(await prisma.financialTransaction.count({ where: { referenceId: settlement.weekPaymentId } })).toBe(0);
  });
});
