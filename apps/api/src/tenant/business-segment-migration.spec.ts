import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('business segment migration safety', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../prisma/migrations/20260803120000_add_business_segment_to_tenant_settings/migration.sql'),
    'utf8',
  );

  it('adds a nullable enum column without rewriting existing rows', () => {
    expect(sql).toContain('CREATE TYPE "BusinessSegment" AS ENUM');
    expect(sql).toContain('ADD COLUMN "business_segment" "BusinessSegment";');
    expect(sql).not.toMatch(/\bNOT NULL\b/i);
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});
