import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  PlatformFeePolicy,
  Prisma,
} from '@prisma/client';
import { resolveEffectiveBillingEntitlement } from '../billing/billing-entitlement-decision';
import { PrismaService } from '../database/prisma.service';

type PolicyClient = Pick<Prisma.TransactionClient, 'tenantBillingSubscription' | 'platformFeePolicy'>;

export type ResolvedPlatformFeePolicy = {
  policy: PlatformFeePolicy;
  amount: Prisma.Decimal;
  tenantPlanSnapshot: string;
};

@Injectable()
export class PlatformFeePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForTenant(
    tenantId: string,
    effectiveAt = new Date(),
    client: PolicyClient = this.prisma,
  ): Promise<ResolvedPlatformFeePolicy> {
    const subscription = await client.tenantBillingSubscription.findFirst({
      where: { tenantId },
      select: {
        billingPlanId: true,
        status: true,
        trialEndsAt: true,
        gracePeriodEndsAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    const entitlement = resolveEffectiveBillingEntitlement(subscription, effectiveAt);
    const effectivePlanId = entitlement.effectivePlanId;

    const exactSelector = effectivePlanId ? `PLAN:${effectivePlanId}` : 'FREE';
    const selectors = effectivePlanId ? [exactSelector, 'PAID_DEFAULT'] : [exactSelector];
    const policies = await client.platformFeePolicy.findMany({
      where: {
        selectorKey: { in: selectors },
        active: true,
        effectiveFrom: { lte: effectiveAt },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveAt } }],
      },
      orderBy: [{ version: 'desc' }],
    });
    const policy = policies.find((candidate) => candidate.selectorKey === exactSelector)
      ?? policies.find((candidate) => candidate.selectorKey === 'PAID_DEFAULT');
    if (!policy) {
      throw new UnprocessableEntityException('No effective Platform Fee policy matches this tenant plan.');
    }
    if (policy.currency !== 'BRL') {
      throw new UnprocessableEntityException('Platform Fee policy currency is not supported.');
    }

    return {
      policy,
      amount: new Prisma.Decimal(policy.fixedAmount).toDecimalPlaces(2),
      tenantPlanSnapshot: effectivePlanId
        ? `billing-plan:${effectivePlanId}`
        : `free:${entitlement.reason}`,
    };
  }
}
