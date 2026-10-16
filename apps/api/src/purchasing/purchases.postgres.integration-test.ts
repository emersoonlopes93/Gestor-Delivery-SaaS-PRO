import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { PaymentStatus } from '@gestor/types';
import {
  FinancialStatus,
  PrismaClient,
  StockMovementType,
  UnitType,
} from '@prisma/client';
import { PurchasesService } from './purchases.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertLocalDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedDatabaseHosts.has(database.hostname) || !allowedDatabaseHosts.has(direct.hostname)) {
    throw new Error('Purchase lifecycle integration test refused a non-local database.');
  }
  if (database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same local database.');
  }
}

describe('Purchase lifecycle PostgreSQL atomicity and concurrency', () => {
  const prisma = new PrismaClient();
  const service = new PurchasesService(prisma as never);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    assertLocalDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixtures(label: string) {
    const tenant = await prisma.tenant.create({ data: { name: `Purchase ${label}`, slug: `purchase-${label}-${suffix}` } });
    const [supplier, ingredient, account] = await Promise.all([
      prisma.supplier.create({ data: { tenantId: tenant.id, name: `Supplier ${label}` } }),
      prisma.ingredient.create({ data: {
        tenantId: tenant.id, name: `Ingredient ${label}`, sku: `sku-${label}-${suffix}`, unit: UnitType.un,
        currentStock: 0, currentCost: 0,
      } }),
      prisma.financialAccount.create({ data: { tenantId: tenant.id, name: `Account ${label}`, balance: 1000, active: true } }),
    ]);
    return { tenant, supplier, ingredient, account };
  }

  it('deduplicates concurrent create, settlement, and cancellation effects', async () => {
    const { tenant, supplier, ingredient, account } = await fixtures('concurrent');
    const createDto = {
      supplierId: supplier.id,
      idempotencyKey: `purchase-create-${suffix}`,
      purchaseDate: '2026-09-10',
      paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: ingredient.id, quantity: 10, unitCost: 10 }],
    };

    const [createdA, createdB] = await Promise.all([
      service.create(tenant.id, createDto),
      service.create(tenant.id, createDto),
    ]);
    expect(createdA.id).toBe(createdB.id);
    expect(await prisma.purchase.count({ where: { tenantId: tenant.id } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, type: StockMovementType.purchase_entry } })).toBe(1);
    const entry = await prisma.stockMovement.findFirstOrThrow({ where: { tenantId: tenant.id, type: StockMovementType.purchase_entry } });
    expect(entry.purchaseId).toBe(createdA.id);
    expect(entry.purchaseItemId).not.toBeNull();
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id, referenceId: createdA.id } })).toBe(1);
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock)).toBe(10);

    await Promise.all([
      service.pay(tenant.id, createdA.id, { accountId: account.id }),
      service.pay(tenant.id, createdA.id, { accountId: account.id }),
    ]);
    expect(await prisma.purchaseSettlement.count({ where: { tenantId: tenant.id, purchaseId: createdA.id } })).toBe(1);
    const settlement = await prisma.purchaseSettlement.findUniqueOrThrow({ where: { purchaseId: createdA.id } });
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id, referenceId: createdA.id, status: FinancialStatus.paid } })).toBe(1);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance)).toBe(900);

    await Promise.all([
      service.cancel(tenant.id, createdA.id),
      service.cancel(tenant.id, createdA.id),
    ]);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, type: StockMovementType.purchase_reversal } })).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id, reversalOfTransactionId: { not: null } } })).toBe(1);
    expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: settlement.financialTransactionId } })).status).toBe('paid');
    const financialReversal = await prisma.financialTransaction.findUniqueOrThrow({ where: { reversalOfTransactionId: settlement.financialTransactionId } });
    expect(financialReversal.accountId).toBe(account.id);
    expect(financialReversal.type).toBe('income');
    expect(Number(financialReversal.amount)).toBe(100);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance)).toBe(1000);
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock)).toBe(0);
    const cancelled = await prisma.purchase.findUniqueOrThrow({ where: { id: createdA.id } });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.paymentStatus).toBe('cancelled');
    expect(cancelled.cancelledAt).not.toBeNull();
  }, 60_000);

  it('deduplicates a concurrent paid create and rejects inactive or cross-tenant accounts', async () => {
    const { tenant, supplier, ingredient, account } = await fixtures('paid-create');
    const paidDto = {
      supplierId: supplier.id,
      idempotencyKey: `purchase-paid-create-${suffix}`,
      paymentStatus: PaymentStatus.PAID,
      accountId: account.id,
      items: [{ ingredientId: ingredient.id, quantity: 2, unitCost: 50 }],
    };
    const [createdA, createdB] = await Promise.all([
      service.create(tenant.id, paidDto),
      service.create(tenant.id, paidDto),
    ]);
    expect(createdA.id).toBe(createdB.id);
    expect(await prisma.purchaseSettlement.count({ where: { tenantId: tenant.id } })).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id, status: 'paid' } })).toBe(1);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance)).toBe(900);
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock)).toBe(2);

    const inactive = await prisma.financialAccount.create({ data: { tenantId: tenant.id, name: 'Inactive', active: false } });
    await expect(service.create(tenant.id, { ...paidDto, idempotencyKey: `inactive-${suffix}`, accountId: inactive.id }))
      .rejects.toThrow('Conta financeira ativa nao encontrada.');
    const foreign = await fixtures('foreign-account');
    await expect(service.create(tenant.id, { ...paidDto, idempotencyKey: `foreign-${suffix}`, accountId: foreign.account.id }))
      .rejects.toThrow('Conta financeira ativa nao encontrada.');
    expect(await prisma.purchase.count({ where: { tenantId: tenant.id } })).toBe(1);
  }, 60_000);

  it('rolls back every cancellation effect when stock is insufficient', async () => {
    const { tenant, supplier, ingredient } = await fixtures('insufficient');
    const purchase = await service.create(tenant.id, {
      supplierId: supplier.id,
      idempotencyKey: `purchase-insufficient-${suffix}`,
      paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: ingredient.id, quantity: 10, unitCost: 4 }],
    });
    await prisma.ingredient.update({ where: { id: ingredient.id }, data: { currentStock: 2 } });
    const beforeMovements = await prisma.stockMovement.count({ where: { tenantId: tenant.id } });
    await expect(service.cancel(tenant.id, purchase.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id } })).toBe(beforeMovements);
    expect((await prisma.financialTransaction.findFirstOrThrow({ where: { tenantId: tenant.id, referenceId: purchase.id } })).status).toBe('pending');
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe('received');
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock)).toBe(2);
  });

  it('blocks legacy unlinked cancellation without parsing movement notes', async () => {
    const { tenant, supplier, ingredient } = await fixtures('legacy');
    const purchase = await prisma.purchase.create({
      data: {
        tenantId: tenant.id, supplierId: supplier.id, totalValue: 10, status: 'received', paymentStatus: 'pending',
        items: { create: { tenantId: tenant.id, ingredientId: ingredient.id, quantity: 1, unitCost: 10, totalCost: 10 } },
      }, include: { items: true },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.id, ingredientId: ingredient.id, type: 'purchase_entry', quantity: 1,
        unitCost: 10, notes: `Entrada via Compra #${purchase.id}`,
      },
    });
    await prisma.financialTransaction.create({
      data: {
        tenantId: tenant.id, type: 'expense', category: 'purchase', amount: 10, status: 'pending',
        referenceId: purchase.id, referenceType: 'purchase',
      },
    });
    await expect(service.cancel(tenant.id, purchase.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, type: 'purchase_reversal' } })).toBe(0);
  });

  it('rolls back payment if settlement persistence fails after the debit', async () => {
    const { tenant, supplier, ingredient, account } = await fixtures('pay-rollback');
    const purchase = await service.create(tenant.id, {
      supplierId: supplier.id, idempotencyKey: `purchase-pay-rollback-${suffix}`,
      paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: ingredient.id, quantity: 1, unitCost: 100 }],
    });
    await prisma.$executeRawUnsafe("CREATE OR REPLACE FUNCTION fail_purchase_settlement_test() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected settlement failure'; END; $$ LANGUAGE plpgsql");
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_purchase_settlement_test BEFORE INSERT ON purchase_settlements FOR EACH ROW EXECUTE FUNCTION fail_purchase_settlement_test()');
    try {
      await expect(service.pay(tenant.id, purchase.id, { accountId: account.id })).rejects.toThrow('injected settlement failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_purchase_settlement_test ON purchase_settlements');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_purchase_settlement_test()');
    }
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance)).toBe(1000);
    expect((await prisma.financialTransaction.findFirstOrThrow({ where: { tenantId: tenant.id, referenceId: purchase.id } })).status).toBe('pending');
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).paymentStatus).toBe('pending');
    expect(await prisma.purchaseSettlement.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });

  it('rolls back cancellation if stock reversal persistence fails', async () => {
    const { tenant, supplier, ingredient } = await fixtures('stock-rollback');
    const purchase = await service.create(tenant.id, {
      supplierId: supplier.id, idempotencyKey: `purchase-stock-rollback-${suffix}`,
      paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: ingredient.id, quantity: 3, unitCost: 10 }],
    });
    await prisma.$executeRawUnsafe("CREATE OR REPLACE FUNCTION fail_purchase_stock_reversal_test() RETURNS trigger AS $$ BEGIN IF NEW.type = 'purchase_reversal' THEN RAISE EXCEPTION 'injected stock reversal failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql");
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_purchase_stock_reversal_test BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION fail_purchase_stock_reversal_test()');
    try {
      await expect(service.cancel(tenant.id, purchase.id)).rejects.toThrow('injected stock reversal failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_purchase_stock_reversal_test ON stock_movements');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_purchase_stock_reversal_test()');
    }
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock)).toBe(3);
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe('received');
    expect((await prisma.financialTransaction.findFirstOrThrow({ where: { tenantId: tenant.id, referenceId: purchase.id } })).status).toBe('pending');
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, type: 'purchase_reversal' } })).toBe(0);
  });

  it('rolls back stock and account restoration if financial reversal fails', async () => {
    const { tenant, supplier, ingredient, account } = await fixtures('finance-rollback');
    const purchase = await service.create(tenant.id, {
      supplierId: supplier.id, idempotencyKey: `purchase-finance-rollback-${suffix}`,
      paymentStatus: PaymentStatus.PAID, accountId: account.id,
      items: [{ ingredientId: ingredient.id, quantity: 4, unitCost: 25 }],
    });
    await prisma.$executeRawUnsafe("CREATE OR REPLACE FUNCTION fail_purchase_financial_reversal_test() RETURNS trigger AS $$ BEGIN IF NEW.category = 'purchase_reversal' THEN RAISE EXCEPTION 'injected financial reversal failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql");
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_purchase_financial_reversal_test BEFORE INSERT ON financial_transactions FOR EACH ROW EXECUTE FUNCTION fail_purchase_financial_reversal_test()');
    try {
      await expect(service.cancel(tenant.id, purchase.id)).rejects.toThrow('injected financial reversal failure');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_purchase_financial_reversal_test ON financial_transactions');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_purchase_financial_reversal_test()');
    }
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock)).toBe(4);
    expect(Number((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance)).toBe(900);
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).paymentStatus).toBe('paid');
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, type: 'purchase_reversal' } })).toBe(0);
    expect(await prisma.financialTransaction.count({ where: { tenantId: tenant.id, reversalOfTransactionId: { not: null } } })).toBe(0);
  });
});
