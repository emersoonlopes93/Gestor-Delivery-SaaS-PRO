import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Food99FinancialController contract', () => {
  const source = readFileSync(resolve(__dirname, 'food99-financial.controller.ts'), 'utf8');

  it('separates view, provider sync, account configuration, and posting endpoints', () => {
    expect(source).toContain("@Get('reconciliation')");
    expect(source).toContain("@Post('sync')");
    expect(source).toContain("@Put('connections/:connectionId/settlement-account')");
    expect(source).toContain("@Post('settlements/:settlementId/post')");
  });

  it('keeps view read-only and all financial mutations behind finance.manage', () => {
    expect(source.match(/@RequirePermissions\('finance\.read'\)/g)).toHaveLength(1);
    expect(source.match(/@RequirePermissions\('finance\.manage'\)/g)).toHaveLength(3);
    expect(source).toContain("@RequiresFeature('finance')");
  });
});
