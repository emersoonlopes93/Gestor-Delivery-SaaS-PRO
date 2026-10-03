import {
  assertEphemeralDatabase,
  parseBackfillArguments,
} from '../../scripts/analytics-rollup-backfill';

describe('analytics rollup backfill command guards', () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  };

  afterEach(() => {
    restore('NODE_ENV', original.nodeEnv);
    restore('DATABASE_URL', original.databaseUrl);
    restore('DIRECT_URL', original.directUrl);
  });

  it('requires an explicit tenant and bounded range arguments', () => {
    expect(() => parseBackfillArguments([])).toThrow('--tenant, --from and --to are required');
    expect(() => parseBackfillArguments([
      '--tenant', 'tenant-a',
      '--from', '2026-07-01',
      '--to', '2026-07-07',
      '--dry-run',
    ])).not.toThrow();
  });

  it('rejects production and non-ephemeral database URLs', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.DIRECT_URL = process.env.DATABASE_URL;
    expect(() => assertEphemeralDatabase()).toThrow('backfill is disabled in production');

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@database.example.com:5432/test';
    process.env.DIRECT_URL = process.env.DATABASE_URL;
    expect(() => assertEphemeralDatabase())
      .toThrow('backfill requires matching local or ephemeral PostgreSQL URLs');
  });
});

function restore(key: 'NODE_ENV' | 'DATABASE_URL' | 'DIRECT_URL', value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
