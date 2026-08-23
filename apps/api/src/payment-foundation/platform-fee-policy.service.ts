import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  PlatformFeePolicy,
  Prisma,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type PolicyClient = Pick<Prisma.TransactionClient, 'tenantBillingSubscription' | 'platformFeePolicy'>;

export type ResolvedPlatformFeePolicy = {
  policy: PlatformFeePolicy;
  amount: Prisma.Decimal;
  tenantPlanSnapshot: string;
};

const PAID_SUBSCRIPTION_STATUSES: TenantSubscriptionStatus[] = [
  TenantSubscriptionStatus.trialing,
  TenantSubscriptionStatus.active,
  TenantSubscriptionStatus.past_due,
  TenantSubscriptionStatus.grace_period,
];

@Injectable()
export class PlatformFeePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForTenant(
    tenantId: string,
    effectiveAt = new Date(),
    client: PolicyClient = this.prisma,
  ): Promise<ResolvedPlatformFeePolicy> {
    const subscription = await client.tenantBillingSubscription.findFirst({
      where: { tenantId, status: { in: PAID_SUBSCRIPTION_STATUSES } },
      select: { billingPlanId: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    const exactSelector = subscription ? `PLAN:${subscription.billingPlanId}` : 'FREE';
    const selectors = subscription ? [exactSelector, 'PAID_DEFAULT'] : [exactSelector];
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
      tenantPlanSnapshot: subscription ? `billing-plan:${subscription.billingPlanId}` : 'free:no-active-billing-plan',
    };
  }
}
