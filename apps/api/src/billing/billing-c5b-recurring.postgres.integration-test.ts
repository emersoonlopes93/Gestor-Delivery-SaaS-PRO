import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BillingRecurringAutomationService } from './billing-recurring-automation.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('C5-B proof requires NODE_ENV=test.');
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('C5-B proof refused a non-ephemeral PostgreSQL target.');
  }
}

describe('C5-B recurring billing PostgreSQL guard', () => {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => {
    assertEphemeralDatabase();
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    await prismaA.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
  });

  it('uses two independent PostgreSQL connections and leaves dry-run without writes', async () => {
    const token = randomUUID().slice(0, 8);
    const tenant = await prismaA.tenant.create({ data: { name: `C5B ${token}`, slug: `c5b-${token}` } });
    tenantIds.push(tenant.id);
    const before = await prismaA.billingCycleRecord.count({ where: { tenantId: tenant.id } });
    const service = new BillingRecurringAutomationService(
      prismaA as never,
      {} as never,
      {} as never,
      { getRuntimeConfig: () => ({ paymentsEnabled: true, gatewayStatus: 'sandbox_ready' }) } as never,
    );
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    const result = await service.runBatch({ dryRun: true, limit: 1 });
    const after = await prismaB.billingCycleRecord.count({ where: { tenantId: tenant.id } });
    expect(result.dryRun).toBe(true);
    expect(after).toBe(before);
  });
});
