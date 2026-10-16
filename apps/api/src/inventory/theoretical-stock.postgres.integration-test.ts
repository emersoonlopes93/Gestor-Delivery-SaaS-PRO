import 'reflect-metadata';
import { PaymentMethod as PrismaPaymentMethod, Prisma, PrismaClient, UnitType } from '@prisma/client';
import { PaymentMethod, PosFulfillmentType } from '@gestor/types';
import { CashService } from '../cash/cash.service';
import { CustomerService } from '../crm/customer.service';
import { OrdersService } from '../orders/orders.service';
import { PosService } from '../pos/pos.service';
import { CashbackService } from '../promotions/cashback.service';
import { RevenueLedgerService } from '../billing/revenue-ledger.service';
import { TheoreticalStockService } from './theoretical-stock.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) {
    throw new Error('DATABASE_URL and DIRECT_URL are required for the PostgreSQL integration test.');
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  const parsedDirectUrl = new URL(directUrl);
  if (!allowedDatabaseHosts.has(parsedDatabaseUrl.hostname) || !allowedDatabaseHosts.has(parsedDirectUrl.hostname)) {
    throw new Error('PostgreSQL integration test refused a non-local database host.');
  }
  if (parsedDatabaseUrl.host !== parsedDirectUrl.host || parsedDatabaseUrl.pathname !== parsedDirectUrl.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

describe('POS PostgreSQL concurrent atomicity', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId: string | undefined;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('creates one complete financial and stock result from two concurrent idempotent sales', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `Concurrency ${suffix}`, slug: `concurrency-${suffix}` },
    });
    tenantId = tenant.id;

    const [product, ingredient, operator, customer, coupon] = await Promise.all([
      prisma.product.create({
        data: { tenantId, name: 'Produto concorrente', slug: `product-${suffix}`, basePrice: 10 },
      }),
      prisma.ingredient.create({
        data: { tenantId, name: 'Ingrediente concorrente', sku: `ingredient-${suffix}`, unit: UnitType.un, currentStock: 10, currentCost: 3 },
      }),
      prisma.tenantUser.create({
        data: { tenantId, email: `operator-${suffix}@example.test`, name: 'Operator', passwordHash: 'integration-test-only' },
      }),
      prisma.customer.create({
        data: { tenantId, name: 'Customer', phone: `119${Date.now().toString().slice(-8)}`, cashbackBalance: 5 },
      }),
      prisma.coupon.create({
        data: { tenantId, code: `C${suffix}`.slice(0, 32), type: 'fixed', value: 1, usedCount: 0 },
      }),
    ]);

    const cashSession = await prisma.cashSession.create({
      data: { tenantId, operatorId: operator.id, openingAmount: 0 },
    });
    await prisma.productRecipeIngredient.create({
      data: { tenantId, productId: product.id, ingredientId: ingredient.id, quantity: 1 },
    });

    const before = await Promise.all([
      prisma.order.count({ where: { tenantId } }),
      prisma.stockMovement.count({ where: { tenantId } }),
      prisma.cashMovement.count({ where: { tenantId, cashSessionId: cashSession.id } }),
      prisma.cashbackTransaction.count({ where: { tenantId, customerId: customer.id } }),
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
      prisma.revenueEvent.count({ where: { tenantId } }),
    ]);
    expect({
      orders: before[0],
      stockMovements: before[1],
      cashMovements: before[2],
      cashbackTransactions: before[3],
      couponUsage: before[4].usedCount,
      revenueEvents: before[5],
    }).toEqual({
      orders: 0,
      stockMovements: 0,
      cashMovements: 0,
      cashbackTransactions: 0,
      couponUsage: 0,
      revenueEvents: 0,
    });

    let arrivals = 0;
    let releaseBarrier: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    const checkoutValidator = {
      validateByTenantId: async () => {
        arrivals += 1;
        if (arrivals === 2) releaseBarrier();
        await barrier;
        return {
          lines: [{
            lineType: 'product' as const,
            productId: product.id,
            quantity: 2,
            unitPrice: 10,
            lineTotal: 20,
            name: product.name,
            basePrice: 10,
            extrasTotal: 0,
          }],
          itemsSubtotal: 20,
          discountTotal: 1,
          couponId: coupon.id,
          cashbackUsed: 1,
        };
      },
    };

    const cashService = new CashService(prisma as never);
    const customerService = new CustomerService(prisma as never);
    const cashbackService = new CashbackService(prisma as never);
    const stockService = new TheoreticalStockService(prisma as never);
    const revenueLedgerService = new RevenueLedgerService(prisma as never);
    const ordersService = new OrdersService(
      prisma as never,
      checkoutValidator as never,
      customerService,
      cashbackService,
      {} as never,
      stockService,
      {} as never,
      {} as never,
      { notifyOrderStatus: async () => undefined } as never,
      { emitOrderStatusUpdated: () => undefined, emitOrderChanged: () => undefined } as never,
      { createProductionJobs: async () => [] } as never,
      { createMainReceiptJobForOrder: async () => null } as never,
      revenueLedgerService,
      {} as never,
      {} as never,
    );
    const posService = new PosService(
      prisma as never,
      checkoutValidator as never,
      cashService,
      customerService,
      cashbackService,
      stockService,
      {} as never,
      ordersService,
      {} as never,
    );

    const input = {
      idempotencyKey: `sale-${suffix}`,
      items: [{ lineType: 'product' as const, productId: product.id, quantity: 2 }],
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      fulfillmentType: PosFulfillmentType.PICKUP,
      paymentMethod: PaymentMethod.cash,
      couponCode: coupon.code,
      useCashbackAmount: 1,
    };
    const results = await Promise.allSettled([
      posService.createSale(tenantId, operator.id, input, true),
      posService.createSale(tenantId, operator.id, input, true),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(['P2002', 'P2034']).toContain((rejection.reason as Prisma.PrismaClientKnownRequestError).code);

    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } },
    });
    const [orders, movements, finalIngredient, cashMovements, cashbackTransactions, finalCoupon, ledgerEntries] = await Promise.all([
      prisma.order.count({ where: { tenantId, idempotencyKey: input.idempotencyKey } }),
      prisma.stockMovement.findMany({ where: { tenantId, orderId: finalOrder.id } }),
      prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } }),
      prisma.cashMovement.findMany({ where: { tenantId, orderId: finalOrder.id } }),
      prisma.cashbackTransaction.findMany({ where: { tenantId, orderId: finalOrder.id } }),
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
      prisma.revenueEvent.findMany({ where: { tenantId, orderId: finalOrder.id } }),
    ]);

    expect(orders).toBe(1);
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(2);
    expect(Number(finalIngredient.currentStock)).toBe(8);
    expect(Number(finalIngredient.currentStock)).toBeGreaterThanOrEqual(0);
    expect(cashMovements).toHaveLength(1);
    expect(cashMovements[0].orderId).toBe(finalOrder.id);
    expect(cashMovements[0].paymentMethod).toBe(PrismaPaymentMethod.cash);
    expect(cashbackTransactions).toHaveLength(1);
    expect(cashbackTransactions[0].orderId).toBe(finalOrder.id);
    expect(finalCoupon.usedCount).toBe(1);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].orderId).toBe(finalOrder.id);

    console.info(JSON.stringify({
      promiseResults: results.map((result) => result.status),
      rejectedCode: (rejection.reason as Prisma.PrismaClientKnownRequestError).code,
      orders,
      stockMovements: movements.length,
      initialStock: 10,
      finalStock: Number(finalIngredient.currentStock),
      cashMovements: cashMovements.length,
      cashbackTransactions: cashbackTransactions.length,
      couponUsage: finalCoupon.usedCount,
      revenueEvents: ledgerEntries.length,
    }));
  });
});
