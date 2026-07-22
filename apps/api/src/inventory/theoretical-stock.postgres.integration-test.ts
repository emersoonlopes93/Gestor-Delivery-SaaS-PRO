import {
  CashMovementType,
  CashbackTransactionType,
  FulfillmentType,
  OrderLineType,
  PaymentMethod,
  PrismaClient,
  RevenueEventType,
  UnitType,
} from '@prisma/client';
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

describe('TheoreticalStockService PostgreSQL concurrency', () => {
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

  it('deducts once under real concurrent transactions and preserves unique financial effects', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `Concurrency ${suffix}`, slug: `concurrency-${suffix}` },
    });
    tenantId = tenant.id;

    const [product, ingredient, operator, customer, coupon] = await Promise.all([
      prisma.product.create({
        data: { tenantId, name: 'Produto concorrente', slug: `product-${suffix}`, basePrice: 20 },
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
        data: { tenantId, code: `C${suffix}`.slice(0, 32), type: 'fixed', value: 1, usedCount: 1 },
      }),
    ]);

    const cashSession = await prisma.cashSession.create({
      data: { tenantId, operatorId: operator.id, openingAmount: 0 },
    });
    const order = await prisma.order.create({
      data: {
        tenantId,
        orderNumber: '#0001',
        fulfillmentType: FulfillmentType.pickup,
        customerName: customer.name,
        customerPhone: customer.phone,
        itemsSubtotal: 20,
        total: 20,
        idempotencyKey: `order-${suffix}`,
        publicTrackingToken: `tracking-${suffix}`,
        paymentMethod: PaymentMethod.cash,
        cashSessionId: cashSession.id,
        customerId: customer.id,
        couponId: coupon.id,
        cashbackUsed: 1,
      },
    });

    await prisma.$transaction([
      prisma.orderItem.create({
        data: {
          tenantId,
          orderId: order.id,
          lineType: OrderLineType.product,
          productId: product.id,
          quantity: 2,
          unitPrice: 10,
          lineTotal: 20,
          snapshotName: product.name,
          snapshotBasePrice: 10,
          snapshotExtrasTotal: 0,
        },
      }),
      prisma.productRecipeIngredient.create({
        data: { tenantId, productId: product.id, ingredientId: ingredient.id, quantity: 1 },
      }),
      prisma.cashMovement.create({
        data: { tenantId, cashSessionId: cashSession.id, orderId: order.id, type: CashMovementType.sale, amount: 20, paymentMethod: PaymentMethod.cash },
      }),
      prisma.cashbackTransaction.create({
        data: { tenantId, customerId: customer.id, orderId: order.id, type: CashbackTransactionType.used, amount: 1 },
      }),
      prisma.revenueEvent.create({
        data: {
          tenantId,
          orderId: order.id,
          idempotencyKey: `order:${order.id}:status:confirmed`,
          source: 'pos',
          type: RevenueEventType.order_confirmed,
          amount: 20,
          occurredAt: new Date(),
          billingPeriodYear: 2026,
          billingPeriodMonth: 7,
        },
      }),
    ]);

    const service = new TheoreticalStockService(prisma as never);
    const results = await Promise.allSettled([
      service.processOrderDepletion(tenantId, order.id),
      service.processOrderDepletion(tenantId, order.id),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ status: 'fulfilled' }),
      expect.objectContaining({ status: 'fulfilled' }),
    ]);

    const [movements, finalIngredient, orderCount, cashCount, cashbackCount, finalCoupon, ledgerCount] = await Promise.all([
      prisma.stockMovement.findMany({ where: { tenantId, orderId: order.id } }),
      prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } }),
      prisma.order.count({ where: { tenantId, id: order.id } }),
      prisma.cashMovement.count({ where: { tenantId, orderId: order.id } }),
      prisma.cashbackTransaction.count({ where: { tenantId, orderId: order.id } }),
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
      prisma.revenueEvent.count({ where: { tenantId, orderId: order.id } }),
    ]);

    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(2);
    expect(Number(finalIngredient.currentStock)).toBe(8);
    expect(Number(finalIngredient.currentStock)).toBeGreaterThanOrEqual(0);
    expect(orderCount).toBe(1);
    expect(cashCount).toBe(1);
    expect(cashbackCount).toBe(1);
    expect(finalCoupon.usedCount).toBe(1);
    expect(ledgerCount).toBe(1);

    console.info(JSON.stringify({
      movements: movements.length,
      finalStock: Number(finalIngredient.currentStock),
      orders: orderCount,
      cashMovements: cashCount,
      cashbackTransactions: cashbackCount,
      couponUsage: finalCoupon.usedCount,
      revenueEvents: ledgerCount,
    }));
  });
});
