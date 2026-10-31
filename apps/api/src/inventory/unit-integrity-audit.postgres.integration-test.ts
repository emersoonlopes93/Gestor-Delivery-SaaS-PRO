import { randomUUID } from 'node:crypto';
import { PrismaClient, UnitType } from '@prisma/client';
import { UnitIntegrityAuditService, UnitIntegrityIssueCode } from './unit-integrity-audit.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Unit integrity audit integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Unit integrity audit PostgreSQL proof', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function createPresentation(tenantLabel: string, label: string, factor: string) {
    const token = `${tenantLabel}-${randomUUID().slice(0, 8)}`;
    const tenant = await prisma.tenant.create({ data: { name: `Unit audit ${token}`, slug: `unit-audit-${token}` } });
    tenantIds.push(tenant.id);
    const ingredient = await prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Ingredient ${token}`, sku: `ingredient-${token}`, unit: UnitType.l } });
    const presentation = await prisma.purchasePresentation.create({
      data: { tenantId: tenant.id, ingredientId: ingredient.id, label, conversionFactor: factor },
    });
    return { tenant, presentation };
  }

  it('scopes legacy findings to the requested tenant and does not mutate records', async () => {
    const first = await createPresentation('first', 'Caixa com 10 L', '10000');
    await createPresentation('second', 'Pacote com 50 un', '50');
    const before = await prisma.purchasePresentation.findUniqueOrThrow({ where: { id: first.presentation.id } });
    const service = new UnitIntegrityAuditService(prisma as never);

    const result = await service.auditPurchasePresentations(first.tenant.id);

    expect(result).toEqual({
      tenantId: first.tenant.id,
      presentationsScanned: 1,
      presentationsRequiringReview: 1,
      objectiveViolations: 0,
      issues: [{
        presentationId: first.presentation.id,
        ingredientId: first.presentation.ingredientId,
        code: UnitIntegrityIssueCode.LEGACY_PRESENTATION_REQUIRES_REVIEW,
      }],
    });
    expect(await prisma.purchasePresentation.findUniqueOrThrow({ where: { id: first.presentation.id } })).toEqual(before);
  });
});
