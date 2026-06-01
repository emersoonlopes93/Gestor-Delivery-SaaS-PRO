import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export const BILLING_REQUIRED_TABLES = [
  'BillingPlan',
  'billing_settings',
  'billing_revenue_tiers',
  'tenant_billing_subscriptions',
  'billing_cycles',
  'billing_usage_snapshots',
  'invoices',
  'invoice_items',
  'billing_payment_methods',
  'payment_attempts',
] as const;

export type BillingDatabasePreflightMode = 'strict' | 'warn' | 'off';

type BillingTableRow = {
  table_name: string;
};

export function resolveBillingDatabasePreflightMode(env: NodeJS.ProcessEnv): BillingDatabasePreflightMode {
  const configured = env.BILLING_DB_PREFLIGHT;
  if (configured === 'strict' || configured === 'warn' || configured === 'off') {
    return configured;
  }

  return env.NODE_ENV === 'production' ? 'warn' : 'strict';
}

export async function findMissingBillingTables(
  prisma: PrismaClient,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<BillingTableRow[]>(Prisma.sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN (${Prisma.join(BILLING_REQUIRED_TABLES)})
  `);

  const existing = new Set(rows.map((row) => row.table_name));
  return BILLING_REQUIRED_TABLES.filter((table) => !existing.has(table));
}

export async function runBillingDatabasePreflight(input: {
  prisma: PrismaClient;
  mode: BillingDatabasePreflightMode;
  logger: Logger;
}): Promise<void> {
  if (input.mode === 'off') {
    input.logger.warn('Billing database preflight skipped because BILLING_DB_PREFLIGHT=off.');
    return;
  }

  const missingTables = await findMissingBillingTables(input.prisma);
  if (!missingTables.length) {
    input.logger.log('Billing database preflight passed.');
    return;
  }

  const message = `Billing database preflight failed: missing table ${missingTables.join(', ')}. Check DATABASE_URL/DIRECT_URL/migrations.`;
  if (input.mode === 'strict') {
    throw new Error(message);
  }

  input.logger.error(message);
}
