import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export enum UnitIntegrityIssueCode {
  LEGACY_PRESENTATION_REQUIRES_REVIEW = 'LEGACY_PRESENTATION_REQUIRES_REVIEW',
  OBJECTIVE_INVALID_CONVERSION_FACTOR = 'OBJECTIVE_INVALID_CONVERSION_FACTOR',
}

export type UnitIntegrityAuditIssue = {
  presentationId: string;
  ingredientId: string;
  code: UnitIntegrityIssueCode;
};

export type UnitIntegrityAuditResult = {
  tenantId: string;
  presentationsScanned: number;
  presentationsRequiringReview: number;
  objectiveViolations: number;
  issues: UnitIntegrityAuditIssue[];
};

type LegacyPresentationRecord = {
  id: string;
  ingredientId: string;
  conversionFactor: Prisma.Decimal;
};

/**
 * Read-only inventory foundation for identifying presentation records whose
 * commercial unit cannot be reconstructed from the legacy schema.
 *
 * Labels and numeric conversion factors are deliberately never used to infer
 * a commercial unit, quantity, or correction.
 */
@Injectable()
export class UnitIntegrityAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async auditPurchasePresentations(tenantId: string): Promise<UnitIntegrityAuditResult> {
    const presentations = await this.prisma.purchasePresentation.findMany({
      where: { tenantId },
      select: {
        id: true,
        ingredientId: true,
        conversionFactor: true,
      },
      orderBy: { id: 'asc' },
    }) as LegacyPresentationRecord[];

    const issues = presentations.flatMap((presentation) => this.classify(presentation));
    return {
      tenantId,
      presentationsScanned: presentations.length,
      presentationsRequiringReview: issues.filter(
        (issue) => issue.code === UnitIntegrityIssueCode.LEGACY_PRESENTATION_REQUIRES_REVIEW,
      ).length,
      objectiveViolations: issues.filter(
        (issue) => issue.code === UnitIntegrityIssueCode.OBJECTIVE_INVALID_CONVERSION_FACTOR,
      ).length,
      issues,
    };
  }

  private classify(presentation: LegacyPresentationRecord): UnitIntegrityAuditIssue[] {
    const subject = {
      presentationId: presentation.id,
      ingredientId: presentation.ingredientId,
    };
    if (!presentation.conversionFactor.isFinite() || presentation.conversionFactor.lte(0)) {
      return [{ ...subject, code: UnitIntegrityIssueCode.OBJECTIVE_INVALID_CONVERSION_FACTOR }];
    }

    return [{ ...subject, code: UnitIntegrityIssueCode.LEGACY_PRESENTATION_REQUIRES_REVIEW }];
  }
}
