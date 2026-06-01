import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  resolveBillingDatabasePreflightMode,
  runBillingDatabasePreflight,
} from '../src/billing/billing-database-preflight';
import { loadApiEnvFiles } from '../src/config/env-paths';

async function main() {
  loadApiEnvFiles();
  const prisma = new PrismaClient();
  const logger = new Logger('BillingDbCheck');

  try {
    await prisma.$connect();
    await runBillingDatabasePreflight({
      prisma,
      mode: resolveBillingDatabasePreflightMode(process.env),
      logger,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('check-billing-db failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
