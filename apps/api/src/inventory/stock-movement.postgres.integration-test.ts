import 'reflect-metadata';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient, StockMovementType as PrismaStockMovementType, UnitType } from '@prisma/client';
import { StockMovementType } from '@gestor/types';
import { StockMovementService } from './stock-movement.service';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertLocalDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedDatabaseHosts.has(database.hostname) || !allowedDatabaseHosts.has(direct.hostname)
    || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Stock movement integration test refused a non-local database.');
  }
}

describe('Manual stock movement PostgreSQL integrity', () => {
  const prisma = new PrismaClient();
  const service = new StockMovementService(prisma as never);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;

  beforeAll(async () => {
    assertLocalDatabase();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  async function fixture(stock = 10, cost = 3) {
    const index = ++sequence;
    const tenant = await prisma.tenant.create({ data: { name: `Manual movement ${index}`, slug: `manual-movement-${suffix}-${index}` } });
    const ingredient = await prisma.ingredient.create({
      data: { tenantId: tenant.id, name: `Ingredient ${index}`, sku: `manual-${suffix}-${index}`, unit: UnitType.un, currentStock: stock, currentCost: cost },
    });
    return { tenant, ingredient };
  }

  it('uses weighted PMP for IN, carries cost for costless IN, and snapshots outgoing cost', async () => {
    const { tenant, ingredient } = await fixture(10, 3);
    await service.createManual(tenant.id, 'user-a', { ingredientId: ingredient.id, type: StockMovementType.IN, quantity: 10, unitCost: 1 });
    let stored = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
    expect(stored.currentStock.toFixed(4)).toBe('20.0000');
    expect(stored.currentCost.toFixed(4)).toBe('2.0000');

    const noCost = await service.createManual(tenant.id, 'user-a', { ingredientId: ingredient.id, type: StockMovementType.IN, quantity: 5 });
    stored = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
    expect(stored.currentCost.toFixed(4)).toBe('2.0000');
    expect(Number(noCost.unitCost)).toBe(2);

    const out = await service.createManual(tenant.id, 'user-a', { ingredientId: ingredient.id, type: StockMovementType.OUT, quantity: 2, unitCost: 999 });
    stored = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
    expect(stored.currentStock.toFixed(4)).toBe('23.0000');
    expect(stored.currentCost.toFixed(4)).toBe('2.0000');
    expect(Number(out.unitCost)).toBe(2);
  });

  it('blocks insufficient OUT and WASTE without movements or negative stock', async () => {
    const { tenant, ingredient } = await fixture(5, 2);
    await expect(service.createManual(tenant.id, 'user-a', { ingredientId: ingredient.id, type: StockMovementType.OUT, quantity: 10 }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.createManual(tenant.id, 'user-a', { ingredientId: ingredient.id, type: StockMovementType.WASTE, quantity: 10 }))
      .rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock.toFixed(4)).toBe('5.0000');
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('allows only one concurrent outgoing movement when both exceed the remaining stock', async () => {
    const { tenant, ingredient } = await fixture(10, 2);
    const results = await Promise.allSettled([
      service.createManual(tenant.id, 'user-a', { ingredientId: ingredient.id, type: StockMovementType.OUT, quantity: 7 }),
      service.createManual(tenant.id, 'user-b', { ingredientId: ingredient.id, type: StockMovementType.OUT, quantity: 7 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock.toFixed(4)).toBe('3.0000');
  });

  it('rejects reserved and adjustment movement types even when a client bypasses shared DTO typing', async () => {
    const { tenant, ingredient } = await fixture();
    const malicious = {
      ingredientId: ingredient.id,
      type: PrismaStockMovementType.purchase_entry,
      quantity: 1,
    };
    await expect(Reflect.apply(service.createManual, service, [tenant.id, 'user-a', malicious])).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id } })).toBe(0);
  });
});
