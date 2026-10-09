import {
  FinancialStatus,
  FinancialTransactionType,
  MarketplaceConnectionStatus,
  MarketplaceProvider,
  MarketplaceSettlementStatus,
  Prisma,
} from '@prisma/client';
import { Food99FinancialReconciliationService } from './food99-financial-reconciliation.service';

const baseBill = {
  orderId: '5764609487470920339',
  orderType: 1,
  businessTs: '1767225600000',
  dayPaymentId: '1945389697417496990',
  commissionAmount: '-100',
  settlementAmount: '5000',
  orderAmount: '5500',
  shopActivityOutcome: '-200',
  shopActivitySubsidy: '300',
  expectSettleDate: '20260912',
};

const baseSettlement = {
  weekPaymentId: '9223372036854775001',
  withdrawDate: '20260912',
  withdrawAmount: 4000,
  liability: 'Nourishflow',
  shopId: '5764608924570091908',
  settleStartDate: '20260901',
  settleEndDate: '20260907',
  currency: 'BRL',
  cnpjWithdrawAmount: 4000,
  cercAmount: 0,
  dayPaymentIDList: ['1945389697417496990', '1945389697417496991'],
};

describe('Food99FinancialReconciliationService', () => {
  function setup(input?: { bills?: Record<string, unknown>[]; settlements?: Record<string, unknown>[] }) {
    const tx = {
      marketplaceSettlement: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'settlement-1' }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialAccount: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'transaction-1' }) },
    };
    const prisma = {
      marketplaceConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'connection-1',
          tenantId: 'tenant-1',
          provider: MarketplaceProvider.FOOD_99,
          externalStoreId: '5764608924570091908',
          status: MarketplaceConnectionStatus.CONNECTED,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      marketplaceBillEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'bill-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      marketplaceSettlement: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financialAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const client = {
      fetchBillEntries: jest.fn().mockResolvedValue(input?.bills ?? []),
      fetchSettlements: jest.fn().mockResolvedValue(input?.settlements ?? []),
    };
    const service = new Food99FinancialReconciliationService(prisma as never, client as never);
    return { service, prisma, client, tx };
  }

  it('does not call the financial provider before the 99Food shop authorization is confirmed', async () => {
    const { service, prisma, client } = setup();
    prisma.marketplaceConnection.findFirst.mockResolvedValue({
      id: 'connection-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      externalStoreId: '5764608924570091908', status: MarketplaceConnectionStatus.DISCONNECTED,
    });

    await expect(service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1')).rejects.toMatchObject({ status: 409 });
    expect(client.fetchBillEntries).not.toHaveBeenCalled();
    expect(client.fetchSettlements).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 4, 5, 8, 9])('ingests orderType %s without changing provider money signs', async (orderType) => {
    const settlementAmount = orderType === 2 || orderType === 3 || orderType === 4 || orderType === 8 ? '-1000' : '5000';
    const { service, prisma } = setup({ bills: [{ ...baseBill, orderType, settlementAmount }] });
    await service.sync('tenant-1', {
      connectionId: 'connection-1',
      startDate: '2026-09-01',
      endDate: '2026-09-12',
    }, 'correlation-1');

    expect(prisma.marketplaceBillEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        tenantId: 'tenant-1',
        connectionId: 'connection-1',
        orderType,
        settlementAmount: BigInt(settlementAmount),
      }),
    }));
    expect(prisma.financialAccount.findFirst).not.toHaveBeenCalled();
  });

  it('supports multiple events for one order and deduplicates only the exact official identity', async () => {
    const eventA = { ...baseBill, businessTs: '1767225600000' };
    const eventB = { ...baseBill, businessTs: '1767225600001', settlementAmount: '4900' };
    const eventC = { ...baseBill, businessTs: '1767225600002', settlementAmount: '-1000', orderType: 4 };
    const { service, prisma } = setup({ bills: [eventA, eventA, eventB, eventC] });
    const result = await service.sync('tenant-1', {
      connectionId: 'connection-1',
      startDate: '2026-09-01',
      endDate: '2026-09-12',
    }, 'correlation-1');

    expect(prisma.marketplaceBillEntry.upsert).toHaveBeenCalledTimes(3);
    expect(result.billEntriesReceived).toBe(4);
    expect(result.billEntriesCreated).toBe(3);
    expect(prisma.marketplaceBillEntry.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_provider_connectionId_orderId_orderType_businessTs: expect.objectContaining({
          tenantId: 'tenant-1',
          connectionId: 'connection-1',
          orderId: baseBill.orderId,
        }),
      },
      select: { id: true },
    });
  });

  it('persists one structured settlement with signed cents, CNPJ/CERC and multiple dayPaymentIds', async () => {
    const settlement = { ...baseSettlement, payeeCnpj: '12345678000199', payerCNpj: '99887766000100', cnpjWithdrawAmount: 4100, cercAmount: -100 };
    const { service, tx } = setup({ settlements: [settlement, settlement] });
    const result = await service.sync('tenant-1', {
      connectionId: 'connection-1',
      startDate: '2026-09-01',
      endDate: '2026-09-12',
    }, 'correlation-1');

    expect(tx.marketplaceSettlement.create).toHaveBeenCalledTimes(1);
    expect(tx.marketplaceSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        weekPaymentId: baseSettlement.weekPaymentId,
        withdrawAmount: 4000n,
        withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
        liabilityParty: 'Nourishflow',
        shopId: baseSettlement.shopId,
        currency: 'BRL',
        payeeCnpj: '12345678000199',
        payerCnpj: '99887766000100',
        cnpjWithdrawAmount: 4100n,
        cercAmount: -100n,
        dayPayments: { create: [
          { dayPaymentId: '1945389697417496990' },
          { dayPaymentId: '1945389697417496991' },
        ] },
      }),
    });
    const persistedSettlement = tx.marketplaceSettlement.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persistedSettlement).not.toHaveProperty('liability');
    expect(result.settlementsReceived).toBe(2);
    expect(result.settlementsCreated).toBe(1);
  });

  it('preserves a negative settlement amount during ingestion', async () => {
    const { service, tx } = setup({ settlements: [{ ...baseSettlement, withdrawAmount: -500 }] });
    await service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1');
    expect(tx.marketplaceSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ withdrawAmount: -500n }),
    });
  });

  it('rejects a missing liability party instead of substituting a cents value', async () => {
    const { service, tx } = setup({ settlements: [{ ...baseSettlement, liability: undefined }] });
    await expect(service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1')).rejects.toThrow('99Food field liability is required.');
    expect(tx.marketplaceSettlement.create).not.toHaveBeenCalled();
  });

  it('keeps a numeric-looking provider liability as text, never as cents', async () => {
    const { service, tx } = setup({ settlements: [{ ...baseSettlement, liability: '500' }] });
    await service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1');
    const persistedSettlement = tx.marketplaceSettlement.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persistedSettlement).toMatchObject({ liabilityParty: '500' });
    expect(persistedSettlement).not.toHaveProperty('liability');
  });

  it.each([
    ['withdrawAmount', { withdrawAmount: '144842' }],
    ['cnpjWithdrawAmount', { cnpjWithdrawAmount: '144842' }],
    ['cercAmount', { cercAmount: '0' }],
  ])('attributes an invalid settlement money field to %s', async (field, override) => {
    const { service, tx } = setup({ settlements: [{ ...baseSettlement, ...override }] });
    await expect(service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1')).rejects.toThrow(`99Food money field ${field} must be integer cents.`);
    expect(tx.marketplaceSettlement.create).not.toHaveBeenCalled();
  });

  it('treats an already persisted identical settlement as idempotent', async () => {
    const { service, tx } = setup({ settlements: [baseSettlement] });
    tx.marketplaceSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      connectionId: 'connection-1',
      shopId: baseSettlement.shopId,
      withdrawAmount: 4000n,
      withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
      currency: 'BRL',
      financialTransactionId: null,
    });
    const result = await service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1');
    expect(tx.marketplaceSettlement.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ settlementsCreated: 0, settlementsUpdated: 0 });
  });

  it('marks provider drift after posting without mutating financial facts', async () => {
    const changed = { ...baseSettlement, withdrawAmount: 4100 };
    const { service, tx } = setup({ settlements: [changed] });
    tx.marketplaceSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      connectionId: 'connection-1',
      shopId: baseSettlement.shopId,
      withdrawAmount: 4000n,
      withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
      currency: 'BRL',
      financialTransactionId: 'transaction-1',
    });

    const result = await service.sync('tenant-1', {
      connectionId: 'connection-1',
      startDate: '2026-09-01',
      endDate: '2026-09-12',
    }, 'correlation-1');

    expect(tx.marketplaceSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: MarketplaceSettlementStatus.RECONCILIATION_DISCREPANCY,
        discrepancyDetails: expect.objectContaining({ observedWithdrawAmount: '4100' }),
      }),
    }));
    expect(tx.marketplaceSettlement.update).not.toHaveBeenCalled();
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    expect(result.discrepanciesDetected).toBe(1);
  });

  it('fails closed when a weekPaymentId is observed through a different shop connection', async () => {
    const { service, tx } = setup({ settlements: [baseSettlement] });
    tx.marketplaceSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      connectionId: 'another-connection',
      shopId: 'another-shop',
      withdrawAmount: 4000n,
      withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
      currency: 'BRL',
      financialTransactionId: null,
    });
    const result = await service.sync('tenant-1', {
      connectionId: 'connection-1', startDate: '2026-09-01', endDate: '2026-09-12',
    }, 'correlation-1');
    expect(tx.marketplaceSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: MarketplaceSettlementStatus.RECONCILIATION_DISCREPANCY,
        discrepancyDetails: expect.objectContaining({ reason: 'SETTLEMENT_SHOP_IDENTITY_CHANGED' }),
      }),
    }));
    expect(tx.marketplaceSettlement.update).not.toHaveBeenCalled();
    expect(result.discrepanciesDetected).toBe(1);
  });

  it('requires an explicit active same-tenant account before posting', async () => {
    const { service, tx } = setup();
    tx.marketplaceSettlement.findFirst.mockResolvedValue({
      id: 'settlement-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      weekPaymentId: baseSettlement.weekPaymentId, withdrawAmount: 4000n,
      withdrawDate: new Date('2026-09-12T00:00:00.000Z'), currency: 'BRL',
      financialTransactionId: null, status: MarketplaceSettlementStatus.LIQUIDATED_UNPOSTED,
      connection: { settlementFinancialAccountId: null },
    });
    await expect(service.postSettlement('tenant-1', 'settlement-1')).rejects.toThrow(
      'Configure explicitamente a conta financeira de destino.',
    );
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    expect(tx.financialAccount.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { cents: 1234n, type: FinancialTransactionType.income, balanceEffect: '12.34' },
    { cents: -500n, type: FinancialTransactionType.expense, balanceEffect: '-5' },
  ])('posts $cents exactly once with ledger-conformant sign', async ({ cents, type, balanceEffect }) => {
    const { service, prisma, tx } = setup();
    tx.marketplaceSettlement.findFirst.mockResolvedValue({
      id: 'settlement-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
      weekPaymentId: baseSettlement.weekPaymentId, withdrawAmount: cents,
      withdrawDate: new Date('2026-09-12T00:00:00.000Z'), currency: 'BRL',
      financialTransactionId: null, status: MarketplaceSettlementStatus.LIQUIDATED_UNPOSTED,
      connection: { settlementFinancialAccountId: 'account-1' },
    });
    tx.financialAccount.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.marketplaceSettlement.findFirst.mockResolvedValue(settlementView(cents));

    await service.postSettlement('tenant-1', 'settlement-1');

    expect(tx.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type,
        amount: new Prisma.Decimal(cents < 0n ? '5.00' : '12.34'),
        status: FinancialStatus.paid,
        referenceId: baseSettlement.weekPaymentId,
      }),
    });
    expect(tx.marketplaceSettlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ financialTransactionId: null }),
    }));
    expect(tx.financialAccount.updateMany.mock.calls[0][0].data.balance.increment.toString()).toBe(balanceEffect);
  });

  it('returns an already posted settlement idempotently without a second balance effect', async () => {
    const { service, prisma, tx } = setup();
    tx.marketplaceSettlement.findFirst.mockResolvedValue({
      ...settlementView(4000n),
      financialTransactionId: 'transaction-1',
      connection: { settlementFinancialAccountId: 'account-1' },
    });
    prisma.marketplaceSettlement.findFirst.mockResolvedValue(settlementView(4000n));
    await service.postSettlement('tenant-1', 'settlement-1');
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    expect(tx.financialAccount.updateMany).not.toHaveBeenCalled();
  });

  it('surfaces a Bill composition discrepancy without fabricating an adjustment', async () => {
    const { service, prisma, tx } = setup();
    prisma.marketplaceConnection.findMany.mockResolvedValue([]);
    prisma.marketplaceSettlement.findMany.mockResolvedValue([settlementView(4000n)]);
    prisma.marketplaceBillEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { settlementAmount: 5000n },
        { settlementAmount: -1000n },
        { settlementAmount: 250n },
      ]);
    const result = await service.findReconciliation('tenant-1', {});
    expect(result.settlements[0]).toMatchObject({
      linkedBillEntryCount: 3,
      linkedSettlementAmountCents: '4250',
      compositionDifferenceCents: '250',
      hasCompositionDiscrepancy: true,
      withdrawAmountCents: '4000',
    });
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });
});

function settlementView(withdrawAmount: bigint) {
  return {
    id: 'settlement-1',
    tenantId: 'tenant-1',
    provider: MarketplaceProvider.FOOD_99,
    connectionId: 'connection-1',
    weekPaymentId: baseSettlement.weekPaymentId,
    withdrawAmount,
    withdrawDate: new Date('2026-09-12T00:00:00.000Z'),
    liabilityParty: 'Nourishflow',
    shopId: baseSettlement.shopId,
    settleStartDate: new Date('2026-09-01T00:00:00.000Z'),
    settleEndDate: new Date('2026-09-07T00:00:00.000Z'),
    currency: 'BRL',
    status: MarketplaceSettlementStatus.POSTED,
    financialTransactionId: 'transaction-1',
    postedAt: new Date('2026-09-12T01:00:00.000Z'),
    compositionDifference: 0n,
    discrepancyDetails: null,
    rawPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    connection: { displayName: 'Loja 99', settlementFinancialAccountId: 'account-1' },
    dayPayments: [
      { id: 'day-1', settlementId: 'settlement-1', dayPaymentId: '1945389697417496990' },
      { id: 'day-2', settlementId: 'settlement-1', dayPaymentId: '1945389697417496991' },
    ],
  };
}
