import 'reflect-metadata';
import { AnalyticsRollupJobV1Schema } from '@gestor/types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/database/prisma.service';
import { AnalyticsRollupService } from '../src/analytics/analytics-rollup.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';

const ALLOWED_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

type Arguments = {
  tenantId: string;
  fromDate: string;
  toDate: string;
  dryRun: boolean;
};

export function parseBackfillArguments(argv: string[]): Arguments {
  const parsed: Partial<Arguments> & Pick<Arguments, 'dryRun'> = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
    if (argument === '--tenant') parsed.tenantId = value;
    else if (argument === '--from') parsed.fromDate = value;
    else if (argument === '--to') parsed.toDate = value;
    else throw new Error(`unknown argument ${argument}`);
    index += 1;
  }
  if (!parsed.tenantId || !parsed.fromDate || !parsed.toDate) {
    throw new Error('--tenant, --from and --to are required');
  }
  return {
    tenantId: parsed.tenantId,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
    dryRun: parsed.dryRun,
  };
}

export function assertEphemeralDatabase(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('backfill is disabled in production');
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (
    !ALLOWED_DATABASE_HOSTS.has(database.hostname)
    || !ALLOWED_DATABASE_HOSTS.has(direct.hostname)
    || database.origin !== direct.origin
    || database.pathname !== direct.pathname
  ) {
    throw new Error('backfill requires matching local or ephemeral PostgreSQL URLs');
  }
}

async function main(): Promise<void> {
  assertEphemeralDatabase();
  const args = parseBackfillArguments(process.argv.slice(2));

  const prisma = new PrismaService(new TenantContextService(), new EventEmitter2());
  await prisma.$connect();
  try {
    const rollup = new AnalyticsRollupService(prisma);
    const timezone = await rollup.resolveTenantTimezone(args.tenantId);
    const job = AnalyticsRollupJobV1Schema.parse({
      tenantId: args.tenantId,
      fromDate: args.fromDate,
      toDate: args.toDate,
      timezone,
      reason: 'backfill',
      requestedAt: new Date().toISOString(),
    });
    const result = await rollup.recomputeRange(job, { dryRun: args.dryRun });
    console.info(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'analytics backfill failed');
    process.exitCode = 1;
  });
}
