import { Prisma, PrismaClient } from '@prisma/client';
import {
  getApiEnvFilePaths,
  getApiRoot,
  getWorkspaceRoot,
  loadApiEnvFiles,
} from '../src/config/env-paths';
import { BILLING_REQUIRED_TABLES } from '../src/billing/billing-database-preflight';

type DatabaseIdentity = {
  current_database: string;
  current_schema: string;
  current_user: string;
};

type BillingTableCount = {
  existingBillingTables: number;
};

type UrlDiagnostics = {
  configured: boolean;
  host: string | null;
  database: string | null;
  schema: string;
  connectionKind: 'pooler' | 'direct' | 'unknown';
};

function inspectDatabaseUrl(rawUrl: string | undefined): UrlDiagnostics {
  if (!rawUrl) {
    return {
      configured: false,
      host: null,
      database: null,
      schema: 'public',
      connectionKind: 'unknown',
    };
  }

  const parsed = new URL(rawUrl);
  const host = parsed.hostname;
  const schema = parsed.searchParams.get('schema') ?? 'public';
  const database = parsed.pathname.replace(/^\//, '') || null;

  return {
    configured: true,
    host: maskHost(host),
    database,
    schema,
    connectionKind: host.includes('-pooler.') || host.includes('pooler') ? 'pooler' : 'direct',
  };
}

function maskHost(host: string): string {
  const parts = host.split('.');
  const first = parts[0] ?? '';
  const maskedFirst = first.length <= 8 ? first : `${first.slice(0, 4)}...${first.slice(-4)}`;
  return [maskedFirst, ...parts.slice(1)].join('.');
}

function sameLogicalDatabase(left: UrlDiagnostics, right: UrlDiagnostics): boolean {
  return Boolean(
    left.configured
      && right.configured
      && left.database === right.database
      && left.schema === right.schema,
  );
}

function maskSecretPresence(value: string | undefined): string {
  if (!value?.trim()) return 'not_configured';
  return `configured:${value.trim().length}_chars`;
}

async function getDatabaseIdentity(prisma: PrismaClient): Promise<DatabaseIdentity> {
  const rows = await prisma.$queryRaw<DatabaseIdentity[]>`
    SELECT
      current_database() AS current_database,
      current_schema() AS current_schema,
      current_user AS current_user
  `;
  const first = rows[0];
  if (!first) {
    throw new Error('Could not read database identity.');
  }
  return first;
}

async function countBillingTables(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<BillingTableCount[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "existingBillingTables"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN (${Prisma.join(BILLING_REQUIRED_TABLES)})
  `);
  return rows[0]?.existingBillingTables ?? 0;
}

async function main() {
  const loadedEnvFiles = loadApiEnvFiles();
  const databaseUrl = inspectDatabaseUrl(process.env.DATABASE_URL);
  const directUrl = inspectDatabaseUrl(process.env.DIRECT_URL);
  const prisma = new PrismaClient();

  try {
    const [databaseIdentity, existingBillingTables] = await Promise.all([
      getDatabaseIdentity(prisma),
      countBillingTables(prisma),
    ]);

    const diagnostics = {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      cwd: process.cwd(),
      apiRoot: getApiRoot(),
      workspaceRoot: getWorkspaceRoot(),
      envFileOrder: getApiEnvFilePaths(),
      loadedEnvFiles,
      databaseUrl,
      directUrl,
      databaseUrlAndDirectUrlSameLogicalDb: sameLogicalDatabase(databaseUrl, directUrl),
      runtimeDatabase: databaseIdentity,
      billingTables: {
        required: BILLING_REQUIRED_TABLES.length,
        existing: existingBillingTables,
        missing: BILLING_REQUIRED_TABLES.length - existingBillingTables,
      },
      billingRuntimeFlags: {
        billingDbPreflight: process.env.BILLING_DB_PREFLIGHT ?? '(default)',
        billingPaymentsEnabled: process.env.BILLING_PAYMENTS_ENABLED ?? 'false',
        billingGatewayProvider: process.env.BILLING_GATEWAY_PROVIDER ?? 'manual',
        billingGatewayMode: process.env.BILLING_GATEWAY_MODE ?? 'disabled',
        asaasBillingBaseUrl: process.env.ASAAS_BILLING_BASE_URL ?? '(default sandbox)',
        asaasBillingApiKey: maskSecretPresence(process.env.ASAAS_BILLING_API_KEY),
        asaasBillingWebhookSecret: maskSecretPresence(process.env.ASAAS_BILLING_WEBHOOK_SECRET),
      },
    };

    console.log(JSON.stringify(diagnostics, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('diagnose-env failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
