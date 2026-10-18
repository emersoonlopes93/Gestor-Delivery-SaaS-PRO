import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryCountStatus, PrismaClient, StockMovementType, UnitType } from '@prisma/client';
import { InventoryCountService } from './inventory-count.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) {
    throw new Error('DATABASE_URL and DIRECT_URL are required for the PostgreSQL integration test.');
  }
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedDatabaseHosts.has(database.hostname) || !allowedDatabaseHosts.has(direct.hostname)) {
    throw new Error('Inventory count integration test refused a non-local database.');
  }
  if (database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

describe('Inventory count PostgreSQL integrity', () => {
  const prisma = new PrismaClient();
  const service = new InventoryCountService(prisma as never);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantIds: string[] = [];
  let sequence = 0;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  async function fixture(label: string, stocks: number[] = [100]) {
    const fixtureId = `${sequence += 1}-${suffix}`;
    const tenant = await prisma.tenant.create({
      data: { name: `Inventory ${label}`, slug: `inventory-${fixtureId}` },
    });
    tenantIds.push(tenant.id);
    const ingredients = [];
    for (const [index, stock] of stocks.entries()) {
      ingredients.push(await prisma.ingredient.create({
        data: {
          id: `${String.fromCharCode(97 + index)}-${fixtureId}`,
          tenantId: tenant.id,
          name: `Ingredient ${label} ${index}`,
          sku: `inventory-${fixtureId}-${index}`,
          unit: UnitType.un,
          currentStock: stock,
          currentCost: 2.3456,
        },
      }));
    }
    return { tenant, ingredients };
  }

  it('uses the server snapshot and records signed negative and positive adjustments once', async () => {
    const { tenant, ingredients } = await fixture('normal', [100, 100]);
    const opened = await service.open(tenant.id, { ingredientIds: ingredients.map((item) => item.id) });
    expect(opened.status).toBe('open');
    expect(opened.items?.map((item) => item.theoreticalStock)).toEqual([100, 100]);

    const closed = await service.close(tenant.id, opened.id, {
      items: [
        { ingredientId: ingredients[0].id, physicalStock: 95 },
        { ingredientId: ingredients[1].id, physicalStock: 105 },
      ],
    });

    expect(closed.status).toBe('closed');
    expect(closed.items?.map((item) => item.adjustedQuantity)).toEqual([-5, 5]);
    const [finalIngredients, movements] = await Promise.all([
      prisma.ingredient.findMany({ where: { tenantId: tenant.id }, orderBy: { id: 'asc' } }),
      prisma.stockMovement.findMany({
        where: { tenantId: tenant.id, type: StockMovementType.inventory_adjustment },
        orderBy: { ingredientId: 'asc' },
      }),
    ]);
    expect(finalIngredients.map((item) => Number(item.currentStock))).toEqual([95, 105]);
    expect(movements.map((item) => Number(item.quantity))).toEqual([5, 5]);
    expect(movements.map((item) => Number(item.unitCost))).toEqual([2.3456, 2.3456]);
    expect(movements[0].notes).toContain('delta=-5.0000');
    expect(movements[1].notes).toContain('delta=5.0000');
  });

  it('ignores an untrusted legacy theoretical value and uses the opened server snapshot', async () => {
    const { tenant, ingredients } = await fixture('tampered-theoretical');
    const opened = await service.open(tenant.id, { ingredientIds: [ingredients[0].id] });
    const payload = {
      items: [{ ingredientId: ingredients[0].id, physicalStock: 95, theoreticalStock: 1 }],
    };

    const closed = await service.close(tenant.id, opened.id, payload);
    expect(closed.items?.[0].theoreticalStock).toBe(100);
    expect(closed.items?.[0].adjustedQuantity).toBe(-5);
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredients[0].id } })).currentStock)).toBe(95);
  });

  it('preserves Decimal(10,4) values without arithmetic drift', async () => {
    const physicalStocks = [0.1, 0.3333, 50, 1000.125];
    const { tenant, ingredients } = await fixture('decimal', [0, 0, 0, 0]);
    const opened = await service.open(tenant.id, { ingredientIds: ingredients.map((item) => item.id) });
    await service.close(tenant.id, opened.id, {
      items: ingredients.map((ingredient, index) => ({
        ingredientId: ingredient.id,
        physicalStock: physicalStocks[index],
      })),
    });

    const stored = await prisma.ingredient.findMany({ where: { tenantId: tenant.id }, orderBy: { id: 'asc' } });
    expect(stored.map((ingredient) => ingredient.currentStock.toFixed(4))).toEqual([
      '0.1000', '0.3333', '50.0000', '1000.1250',
    ]);
  });

  it('rejects duplicate ingredients before creating a count', async () => {
    const { tenant, ingredients } = await fixture('duplicate');
    await expect(service.open(tenant.id, {
      ingredientIds: [ingredients[0].id, ingredients[0].id],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.inventoryCount.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('rejects duplicate ingredients at close without applying a partial adjustment', async () => {
    const { tenant, ingredients } = await fixture('duplicate-close');
    const opened = await service.open(tenant.id, { ingredientIds: [ingredients[0].id] });
    await expect(service.close(tenant.id, opened.id, {
      items: [
        { ingredientId: ingredients[0].id, physicalStock: 90 },
        { ingredientId: ingredients[0].id, physicalStock: 80 },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);

    const [ingredient, count, movements] = await Promise.all([
      prisma.ingredient.findUniqueOrThrow({ where: { id: ingredients[0].id } }),
      prisma.inventoryCount.findUniqueOrThrow({ where: { id: opened.id } }),
      prisma.stockMovement.count({ where: { tenantId: tenant.id, type: StockMovementType.inventory_adjustment } }),
    ]);
    expect(Number(ingredient.currentStock)).toBe(100);
    expect(count.status).toBe(InventoryCountStatus.open);
    expect(movements).toBe(0);
  });

  it.each([
    ['negative', -1],
    ['not finite', Number.POSITIVE_INFINITY],
    ['more than four decimal places', 1.23456],
  ])('rejects %s physical stock before applying changes', async (_label, physicalStock) => {
    const { tenant, ingredients } = await fixture(`invalid-${_label}`);
    const opened = await service.open(tenant.id, { ingredientIds: [ingredients[0].id] });
    await expect(service.close(tenant.id, opened.id, {
      items: [{ ingredientId: ingredients[0].id, physicalStock }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredients[0].id } })).currentStock)).toBe(100);
    expect((await prisma.inventoryCount.findUniqueOrThrow({ where: { id: opened.id } })).status).toBe(InventoryCountStatus.open);
  });

  it('rejects an ingredient from another tenant', async () => {
    const first = await fixture('tenant-a');
    const second = await fixture('tenant-b');
    await expect(service.open(first.tenant.id, {
      ingredientIds: [second.ingredients[0].id],
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.inventoryCount.count({ where: { tenantId: first.tenant.id } })).toBe(0);
  });

  it('keeps a stale count open and preserves the newer stock', async () => {
    const { tenant, ingredients } = await fixture('stale');
    const opened = await service.open(tenant.id, { ingredientIds: [ingredients[0].id] });
    await prisma.ingredient.update({
      where: { id: ingredients[0].id },
      data: { currentStock: { decrement: 4 } },
    });

    await expect(service.close(tenant.id, opened.id, {
      items: [{ ingredientId: ingredients[0].id, physicalStock: 90 }],
    })).rejects.toBeInstanceOf(ConflictException);

    const [ingredient, count, movements] = await Promise.all([
      prisma.ingredient.findUniqueOrThrow({ where: { id: ingredients[0].id } }),
      prisma.inventoryCount.findUniqueOrThrow({ where: { id: opened.id } }),
      prisma.stockMovement.count({ where: { tenantId: tenant.id, type: StockMovementType.inventory_adjustment } }),
    ]);
    expect(Number(ingredient.currentStock)).toBe(96);
    expect(count.status).toBe(InventoryCountStatus.open);
    expect(count.closedAt).toBeNull();
    expect(movements).toBe(0);
  });

  it('rolls back earlier item writes when a later ingredient is stale', async () => {
    const { tenant, ingredients } = await fixture('rollback', [100, 50]);
    const opened = await service.open(tenant.id, { ingredientIds: ingredients.map((item) => item.id) });
    await prisma.ingredient.update({
      where: { id: ingredients[1].id },
      data: { currentStock: { increment: 1 } },
    });

    await expect(service.close(tenant.id, opened.id, {
      items: [
        { ingredientId: ingredients[0].id, physicalStock: 90 },
        { ingredientId: ingredients[1].id, physicalStock: 51 },
      ],
    })).rejects.toBeInstanceOf(ConflictException);

    const [firstIngredient, items, movements] = await Promise.all([
      prisma.ingredient.findUniqueOrThrow({ where: { id: ingredients[0].id } }),
      prisma.inventoryCountItem.findMany({ where: { inventoryCountId: opened.id }, orderBy: { ingredientId: 'asc' } }),
      prisma.stockMovement.count({ where: { tenantId: tenant.id, type: StockMovementType.inventory_adjustment } }),
    ]);
    expect(Number(firstIngredient.currentStock)).toBe(100);
    expect(items.map((item) => Number(item.adjustedQuantity))).toEqual([0, 0]);
    expect(items.map((item) => Number(item.physicalStock))).toEqual([100, 50]);
    expect(movements).toBe(0);
  });

  it('allows only one of two concurrent close requests to commit', async () => {
    const { tenant, ingredients } = await fixture('concurrent');
    const opened = await service.open(tenant.id, { ingredientIds: [ingredients[0].id] });
    const payload = { items: [{ ingredientId: ingredients[0].id, physicalStock: 95 }] };
    const results = await Promise.allSettled([
      service.close(tenant.id, opened.id, payload),
      service.close(tenant.id, opened.id, payload),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [ingredient, count, movements] = await Promise.all([
      prisma.ingredient.findUniqueOrThrow({ where: { id: ingredients[0].id } }),
      prisma.inventoryCount.findUniqueOrThrow({ where: { id: opened.id } }),
      prisma.stockMovement.count({ where: { tenantId: tenant.id, type: StockMovementType.inventory_adjustment } }),
    ]);
    expect(Number(ingredient.currentStock)).toBe(95);
    expect(count.status).toBe(InventoryCountStatus.closed);
    expect(movements).toBe(1);
  });
});
