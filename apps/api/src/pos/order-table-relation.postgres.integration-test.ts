import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');

  const parsedDatabaseUrl = new URL(databaseUrl);
  const parsedDirectUrl = new URL(directUrl);
  if (!allowedDatabaseHosts.has(parsedDatabaseUrl.hostname) || !allowedDatabaseHosts.has(parsedDirectUrl.hostname)) {
    throw new Error('Order table relation integration test refused a non-local database host.');
  }
  if (parsedDatabaseUrl.host !== parsedDirectUrl.host || parsedDatabaseUrl.pathname !== parsedDirectUrl.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

const migrationSql = readFileSync(
  resolve(__dirname, '../../prisma/migrations/20260722090000_add_order_table_relation/migration.sql'),
  'utf8',
);
const backfillSql = migrationSql.slice(migrationSql.indexOf('WITH normalized_tables'));

describe('Order table relation PostgreSQL migration proof', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId: string | undefined;
  let otherTenantId: string | undefined;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    if (otherTenantId) await prisma.tenant.delete({ where: { id: otherTenantId } });
    await prisma.$disconnect();
  });

  it('keeps historical snapshots while safely backfilling only unambiguous tenant-local tables', async () => {
    const tenant = await prisma.tenant.create({ data: { name: `Tables ${suffix}`, slug: `tables-${suffix}` } });
    tenantId = tenant.id;
    const otherTenant = await prisma.tenant.create({ data: { name: `Other ${suffix}`, slug: `other-${suffix}` } });
    otherTenantId = otherTenant.id;

    const [matchedTable, foreignTable] = await Promise.all([
      prisma.dineInTable.create({ data: { tenantId, name: 'Mesa 01' } }),
      prisma.dineInTable.create({ data: { tenantId: otherTenant.id, name: 'Mesa 99' } }),
    ]);
    await prisma.$executeRawUnsafe(
      'INSERT INTO "dine_in_tables" ("id", "tenant_id", "name", "capacity", "status", "created_at", "updated_at") VALUES ($1, $2, $3, 4, \'free\', NOW(), NOW()), ($4, $2, $5, 4, \'free\', NOW(), NOW())',
      `ambiguous-a-${suffix}`,
      tenantId,
      'Mesa 02',
      `ambiguous-b-${suffix}`,
      '  Mesa   02  ',
    );

    const makeOrder = (orderNumber: string, tableNumber: string | null) => prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        status: 'completed',
        fulfillmentType: 'table',
        customerName: 'Migration proof',
        customerPhone: '11999999999',
        itemsSubtotal: 0,
        total: 0,
        idempotencyKey: `migration-${orderNumber}-${suffix}`,
        publicTrackingToken: `migration-${orderNumber}-${suffix}`,
        tableNumber,
      },
    });
    const [matchedOrder, ambiguousOrder, missingOrder] = await Promise.all([
      makeOrder('#9001', '  Mesa   01 '),
      makeOrder('#9002', 'Mesa 02'),
      makeOrder('#9003', 'Mesa inexistente'),
    ]);

    await prisma.$executeRawUnsafe(backfillSql);
    await prisma.$executeRawUnsafe(backfillSql);

    const [matched, ambiguous, missing] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: matchedOrder.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: ambiguousOrder.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: missingOrder.id } }),
    ]);
    expect(matched.tableId).toBe(matchedTable.id);
    expect(matched.tableNumber).toBe('  Mesa   01 ');
    expect(ambiguous.tableId).toBeNull();
    expect(missing.tableId).toBeNull();

    await prisma.dineInTable.delete({ where: { id: matchedTable.id } });
    const deletedTableOrder = await prisma.order.findUniqueOrThrow({ where: { id: matchedOrder.id } });
    expect(deletedTableOrder.tableId).toBeNull();
    expect(deletedTableOrder.tableNumber).toBe('  Mesa   01 ');
    expect(foreignTable.tenantId).not.toBe(tenantId);

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'orders_tenant_id_table_id_idx'
    `;
    expect(indexes).toHaveLength(1);
  });
});
