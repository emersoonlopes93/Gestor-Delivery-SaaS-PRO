import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const execFileAsync = promisify(execFile);
const ephemeralHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl || process.env.CI !== 'true') {
    throw new Error('Billing seed rerun proof requires CI and disposable PostgreSQL URLs.');
  }
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!ephemeralHosts.has(database.hostname) || !ephemeralHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname || !database.pathname.includes('gestor_delivery')) {
    throw new Error('Billing seed rerun proof refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Billing seed rerun PostgreSQL proof', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    assertEphemeralDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function runSeed(): Promise<void> {
    const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const repositoryRoot = resolve(__dirname, '../../../..');
    await execFileAsync(command, ['-C', 'apps/api', 'prisma:seed'], {
      cwd: repositoryRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  it('preserves administrator-owned commercial settings and the existing demo subscription on rerun', async () => {
    await runSeed();
    const plan = await prisma.billingPlan.findUniqueOrThrow({ where: { slug: 'revenue-growth' } });
    const tier = await prisma.billingRevenueTier.findFirstOrThrow({
      where: { planId: plan.id },
      orderBy: { sortOrder: 'asc' },
    });
    const settings = await prisma.billingSettings.findUniqueOrThrow({ where: { id: 'global' } });
    const demo = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'pizzaria-demo' } });
    const subscription = await prisma.tenantBillingSubscription.findFirstOrThrow({
      where: { tenantId: demo.id }, orderBy: { createdAt: 'desc' },
    });
    const planCount = await prisma.billingPlan.count({ where: { slug: 'revenue-growth' } });
    const tierCount = await prisma.billingRevenueTier.count({ where: { planId: plan.id } });

    await prisma.billingPlan.update({ where: { id: plan.id }, data: { description: 'admin-owned-description', isPublic: false } });
    await prisma.billingRevenueTier.update({ where: { id: tier.id }, data: { price: 123.45 } });
    await prisma.billingSettings.update({ where: { id: settings.id }, data: { defaultGracePeriodDays: 19 } });
    await runSeed();

    expect(await prisma.billingPlan.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({ description: 'admin-owned-description', isPublic: false });
    expect((await prisma.billingRevenueTier.findUniqueOrThrow({ where: { id: tier.id } })).price.toString()).toBe('123.45');
    expect((await prisma.billingSettings.findUniqueOrThrow({ where: { id: settings.id } })).defaultGracePeriodDays).toBe(19);
    expect(await prisma.billingPlan.count({ where: { slug: 'revenue-growth' } })).toBe(planCount);
    expect(await prisma.billingRevenueTier.count({ where: { planId: plan.id } })).toBe(tierCount);
    expect(await prisma.tenantBillingSubscription.findFirstOrThrow({ where: { id: subscription.id } })).toMatchObject({ billingPlanId: subscription.billingPlanId, status: subscription.status });
    expect(await prisma.tenantBillingSubscription.count({ where: { tenantId: demo.id } })).toBe(1);
  });
});
