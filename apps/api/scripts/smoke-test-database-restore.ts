import { PrismaClient } from '@prisma/client';
import { loadApiEnvFiles } from '../src/config/env-paths';

loadApiEnvFiles();

type CountCheck = {
  name: string;
  count: number;
  required: boolean;
};

type RestoreSmokeReport = {
  database: {
    provider: string;
    hostClass: string;
    databaseName: string;
  };
  checks: string[];
  warnings: string[];
  counts: CountCheck[];
  migrations: {
    total: number;
    failed: number;
    rolledBack: number;
    latestFinishedAt: string | null;
  };
};

function getRestoreUrl(): string {
  const restoreUrl = process.env.RESTORE_DATABASE_URL?.trim();
  if (restoreUrl) return restoreUrl;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && process.env.DATABASE_RESTORE_SMOKE_CONFIRM === 'restore') {
    return databaseUrl;
  }

  throw new Error('Set RESTORE_DATABASE_URL, or set DATABASE_URL plus DATABASE_RESTORE_SMOKE_CONFIRM=restore for an explicit isolated restore target.');
}

function maskDatabaseTarget(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const provider = host.includes('neon.tech') ? 'Neon PostgreSQL' : 'PostgreSQL';
    const hostClass = host.includes('neon.tech') ? host.split('.').slice(-3).join('.') : 'external-postgres';
    return {
      provider,
      hostClass,
      databaseName: parsed.pathname.replace(/^\//, '') || 'unknown',
    };
  } catch {
    return {
      provider: 'unknown',
      hostClass: 'unknown',
      databaseName: 'unknown',
    };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function countTable(prisma: PrismaClient, modelName: string, query: () => Promise<number>, required: boolean): Promise<CountCheck> {
  try {
    return { name: modelName, count: await query(), required };
  } catch (error) {
    if (required) throw error;
    return { name: modelName, count: -1, required };
  }
}

async function main() {
  const report: RestoreSmokeReport = {
    database: {
      provider: 'unknown',
      hostClass: 'unknown',
      databaseName: 'unknown',
    },
    checks: [],
    warnings: [],
    counts: [],
    migrations: {
      total: 0,
      failed: 0,
      rolledBack: 0,
      latestFinishedAt: null,
    },
  };
  let prisma: PrismaClient | null = null;

  try {
    const restoreUrl = getRestoreUrl();
    process.env.DATABASE_URL = restoreUrl;
    process.env.DIRECT_URL = process.env.RESTORE_DIRECT_URL?.trim() || restoreUrl;
    report.database = maskDatabaseTarget(restoreUrl);

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: restoreUrl,
        },
      },
    });

    await prisma.$queryRaw`SELECT 1`;
    report.checks.push('database connection ok');

    const migrationRows = await prisma.$queryRaw<Array<{ finished_at: Date | null; rolled_back_at: Date | null; logs: string | null }>>`
      SELECT finished_at, rolled_back_at, logs
      FROM "_prisma_migrations"
      ORDER BY started_at DESC
    `;
    report.migrations.total = migrationRows.length;
    report.migrations.failed = migrationRows.filter((row) => !row.finished_at && !row.rolled_back_at).length;
    report.migrations.rolledBack = migrationRows.filter((row) => row.rolled_back_at).length;
    report.migrations.latestFinishedAt = migrationRows.find((row) => row.finished_at)?.finished_at?.toISOString() ?? null;
    assert(report.migrations.total > 0, 'No Prisma migrations found.');
    assert(report.migrations.failed === 0, 'There are unfinished Prisma migrations.');
    report.checks.push('prisma migrations consistent');

    report.counts = await Promise.all([
      countTable(prisma, 'Tenant', () => prisma.tenant.count(), true),
      countTable(prisma, 'Order', () => prisma.order.count(), true),
      countTable(prisma, 'RevenueEvent', () => prisma.revenueEvent.count(), false),
      countTable(prisma, 'BillingUsageSnapshot', () => prisma.billingUsageSnapshot.count(), false),
      countTable(prisma, 'Invoice', () => prisma.invoice.count(), false),
      countTable(prisma, 'AuthSession', () => prisma.authSession.count(), false),
      countTable(prisma, 'ExternalWebhookEvent', () => prisma.externalWebhookEvent.count(), false),
      countTable(prisma, 'TenantBillingSubscription', () => prisma.tenantBillingSubscription.count(), false),
      countTable(prisma, 'SubscriptionStatusHistory', () => prisma.subscriptionStatusHistory.count(), false),
      countTable(prisma, 'PaymentAttempt', () => prisma.paymentAttempt.count(), false),
    ]);

    const tenants = report.counts.find((item) => item.name === 'Tenant')?.count ?? 0;
    assert(tenants > 0, 'No tenants found in restored database.');
    report.checks.push('tenant data readable');

    const orders = report.counts.find((item) => item.name === 'Order')?.count ?? 0;
    if (orders <= 0) report.warnings.push('no orders found in restored database');
    else report.checks.push('orders readable');

    const revenueEvents = report.counts.find((item) => item.name === 'RevenueEvent')?.count ?? 0;
    const invoices = report.counts.find((item) => item.name === 'Invoice')?.count ?? 0;
    const snapshots = report.counts.find((item) => item.name === 'BillingUsageSnapshot')?.count ?? 0;
    if (revenueEvents <= 0) report.warnings.push('no revenue events found in restored database');
    if (invoices <= 0) report.warnings.push('no invoices found in restored database');
    if (snapshots <= 0) report.warnings.push('no billing usage snapshots found in restored database');

    const orphanInvoiceItems = await prisma.invoiceItem.count({
      where: {
        invoice: null,
      },
    });
    assert(orphanInvoiceItems === 0, 'Found orphan invoice items.');
    report.checks.push('billing ledger obvious consistency ok');

    console.log('DATABASE_RESTORE_SMOKE_GO', JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('DATABASE_RESTORE_SMOKE_NO_GO');
    console.error(
      JSON.stringify(
        {
          message: error instanceof Error ? error.message : String(error),
          report,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
  }
}

main();
