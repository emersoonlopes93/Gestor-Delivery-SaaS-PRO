import 'reflect-metadata';
import { FulfillmentType, HistoricalCmvCoverage, HistoricalCostEvidence, OrderLineType, PrismaClient, StockMovementType, UnitType } from '@prisma/client';
import { ComboComponentEligibilityService } from '../catalog/combo-component-eligibility.service';
import { ConfigurableRecipeCompositionService } from '../inventory/configurable-recipe-composition.service';
import { RecipeExpansionService } from '../inventory/recipe-expansion.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { HistoricalCmvService } from './historical-cmv.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required for the PostgreSQL integration test.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedDatabaseHosts.has(database.hostname) || !allowedDatabaseHosts.has(direct.hostname)) {
    throw new Error('Historical CMV PostgreSQL test refused a non-local database host.');
  }
  if (database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

function stockService(prisma: PrismaClient): TheoreticalStockService {
  const expansion = new RecipeExpansionService(prisma as never);
  return new TheoreticalStockService(
    prisma as never,
    new ConfigurableRecipeCompositionService(prisma as never, expansion, { calculatePrice: jest.fn() } as never),
    new ComboComponentEligibilityService(prisma as never),
  );
}

describe('Historical CMV with ephemeral PostgreSQL', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId: string;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
    tenantId = (await prisma.tenant.create({ data: { name: `CMV ${suffix}`, slug: `cmv-${suffix}` } })).id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  async function orderWithItem(productId: string, token: string) {
    const order = await prisma.order.create({
      data: {
        tenantId, orderNumber: `CMV-${token}`.slice(0, 20), fulfillmentType: FulfillmentType.pickup,
        customerName: 'CMV test', customerPhone: `119${Date.now().toString().slice(-8)}`,
        itemsSubtotal: 10, total: 10, idempotencyKey: `cmv-${token}-${suffix}`, publicTrackingToken: `cmv-${token}-${suffix}`,
      },
    });
    await prisma.orderItem.create({
      data: {
        tenantId, orderId: order.id, lineType: OrderLineType.product, productId, quantity: 1,
        unitPrice: 10, lineTotal: 10, snapshotName: 'CMV product', snapshotBasePrice: 10, snapshotExtrasTotal: 0,
      },
    });
    return order;
  }

  it('captures a known historical cost at depletion, preserves it after current cost changes, and nets a reversal to zero', async () => {
    const ingredient = await prisma.ingredient.create({
      data: { tenantId, name: `Known ${suffix}`, sku: `known-${suffix}`, unit: UnitType.un, currentStock: 5, currentCost: 3, currentCostEvidence: HistoricalCostEvidence.known },
    });
    const product = await prisma.product.create({ data: { tenantId, name: `CMV product ${suffix}`, slug: `cmv-product-${suffix}`, basePrice: 10 } });
    await prisma.productRecipeIngredient.create({ data: { tenantId, productId: product.id, ingredientId: ingredient.id, quantity: 1, inputQuantity: 1, inputUnit: UnitType.un } });
    const order = await orderWithItem(product.id, 'known');

    await stockService(prisma).processOrderDepletion(tenantId, order.id);
    await prisma.ingredient.update({ where: { id: ingredient.id }, data: { currentCost: 9 } });

    const reader = new HistoricalCmvService(prisma as never);
    await expect(reader.getOrderCmv(tenantId, order.id)).resolves.toMatchObject({ coverageStatus: 'KNOWN', knownSubtotal: '3.00', totalCmv: '3.00' });
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { tenantId, orderId: order.id, type: StockMovementType.theoretical_depletion } });
    expect(movement.unitCost.toString()).toBe('3');
    expect(movement.costEvidence).toBe(HistoricalCostEvidence.known);
    expect(movement.orderCmvCoverage).toBe(HistoricalCmvCoverage.known);

    await stockService(prisma).reverseOrderDepletion(tenantId, order.id);
    await expect(reader.getOrderCmv(tenantId, order.id)).resolves.toMatchObject({ coverageStatus: 'KNOWN', totalCmv: '0.00', coverageReasons: ['FULLY_REVERSED'] });
  });

  it('does not promote default zero, legacy null cost, absent movements, or another tenant order to known CMV', async () => {
    const unknownIngredient = await prisma.ingredient.create({
      data: { tenantId, name: `Unknown ${suffix}`, sku: `unknown-${suffix}`, unit: UnitType.un, currentStock: 5, currentCost: 0 },
    });
    const product = await prisma.product.create({ data: { tenantId, name: `Unknown product ${suffix}`, slug: `unknown-product-${suffix}`, basePrice: 10 } });
    await prisma.productRecipeIngredient.create({ data: { tenantId, productId: product.id, ingredientId: unknownIngredient.id, quantity: 1, inputQuantity: 1, inputUnit: UnitType.un } });
    const order = await orderWithItem(product.id, 'unknown');
    await stockService(prisma).processOrderDepletion(tenantId, order.id);
    const reader = new HistoricalCmvService(prisma as never);
    await expect(reader.getOrderCmv(tenantId, order.id)).resolves.toMatchObject({ coverageStatus: 'UNKNOWN', totalCmv: null });

    const noMovement = await orderWithItem(product.id, 'no-movement');
    await expect(reader.getOrderCmv(tenantId, noMovement.id)).resolves.toMatchObject({ coverageStatus: 'UNKNOWN', totalCmv: null, coverageReasons: ['NO_THEORETICAL_DEPLETION'] });

    const otherTenant = await prisma.tenant.create({ data: { name: `Other ${suffix}`, slug: `other-cmv-${suffix}` } });
    await expect(reader.getOrderCmv(otherTenant.id, order.id)).rejects.toMatchObject({ status: 404 });
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
