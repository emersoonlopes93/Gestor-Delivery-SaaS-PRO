import { Prisma } from '@prisma/client';
import {
  UnitIntegrityAuditService,
  UnitIntegrityIssueCode,
} from './unit-integrity-audit.service';

const decimal = (value: string) => new Prisma.Decimal(value);

describe('UnitIntegrityAuditService', () => {
  it('is tenant-scoped, deterministic, and never infers units from labels or factors', async () => {
    const prisma = {
      purchasePresentation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'presentation-a', ingredientId: 'ingredient-a', label: 'Caixa com 10 L', conversionFactor: decimal('10000') },
          { id: 'presentation-b', ingredientId: 'ingredient-b', label: 'Pacote misterioso', conversionFactor: decimal('1') },
        ]),
      },
    };
    const service = new UnitIntegrityAuditService(prisma as never);

    await expect(service.auditPurchasePresentations('tenant-a')).resolves.toEqual({
      tenantId: 'tenant-a',
      presentationsScanned: 2,
      presentationsRequiringReview: 2,
      objectiveViolations: 0,
      issues: [
        { presentationId: 'presentation-a', ingredientId: 'ingredient-a', code: UnitIntegrityIssueCode.LEGACY_PRESENTATION_REQUIRES_REVIEW },
        { presentationId: 'presentation-b', ingredientId: 'ingredient-b', code: UnitIntegrityIssueCode.LEGACY_PRESENTATION_REQUIRES_REVIEW },
      ],
    });
    expect(prisma.purchasePresentation.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { id: true, ingredientId: true, conversionFactor: true },
      orderBy: { id: 'asc' },
    });
    expect(Object.keys(prisma.purchasePresentation)).toEqual(['findMany']);
  });

  it('reports only objectively invalid factors as violations', async () => {
    const prisma = {
      purchasePresentation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'invalid', ingredientId: 'ingredient-a', conversionFactor: decimal('0') },
        ]),
      },
    };
    const service = new UnitIntegrityAuditService(prisma as never);

    await expect(service.auditPurchasePresentations('tenant-a')).resolves.toMatchObject({
      presentationsScanned: 1,
      presentationsRequiringReview: 0,
      objectiveViolations: 1,
      issues: [{ code: UnitIntegrityIssueCode.OBJECTIVE_INVALID_CONVERSION_FACTOR }],
    });
  });
});
