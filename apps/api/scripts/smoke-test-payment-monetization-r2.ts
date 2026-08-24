import { randomUUID } from 'crypto';
import { OrderPaymentAttemptStatus, PaymentProvider, PrismaClient, TenantSubscriptionStatus } from '@prisma/client';
import { OnlinePaymentActivationService } from '../src/payment-foundation/online-payment-activation.service';
import { OrderPaymentAttemptService } from '../src/payment-foundation/order-payment-attempt.service';
import { PlatformFeeLifecycleService } from '../src/payment-foundation/platform-fee-lifecycle.service';
import { PlatformFeePolicyService } from '../src/payment-foundation/platform-fee-policy.service';

const prisma = new PrismaClient();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const tenants = await Promise.all([
    ['Free', 'free'],
    ['Active', 'active'],
    ['Trial Valid', 'trial-valid'],
    ['Trial Expired', 'trial-expired'],
    ['Grace Valid', 'grace-valid'],
    ['Grace Expired', 'grace-expired'],
    ['Past Due', 'past-due'],
  ].map(([name, slug]) => prisma.tenant.create({
    data: { name: `R2 ${name} Smoke`, slug: `r2-${slug}-${suffix}` },
  })));
  const [freeTenant, activeTenant, trialValidTenant, trialExpiredTenant, graceValidTenant, graceExpiredTenant, pastDueTenant] = tenants;
  const plan = await prisma.billingPlan.create({
    data: { name: 'R2 Paid Smoke Plan', slug: `r2-paid-${suffix}`, type: 'fixed', currency: 'BRL', trialDays: 0 },
  });

  try {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000);
    const past = new Date(now.getTime() - 60_000);
    const subscriptions = await Promise.all([
      prisma.tenantBillingSubscription.create({
        data: { tenantId: activeTenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.active, provider: 'manual' },
      }),
      prisma.tenantBillingSubscription.create({
        data: { tenantId: trialValidTenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.trialing, trialEndsAt: future, provider: 'manual' },
      }),
      prisma.tenantBillingSubscription.create({
        data: { tenantId: trialExpiredTenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.trialing, trialEndsAt: past, provider: 'manual' },
      }),
      prisma.tenantBillingSubscription.create({
        data: { tenantId: graceValidTenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.grace_period, gracePeriodEndsAt: future, provider: 'manual' },
      }),
      prisma.tenantBillingSubscription.create({
        data: { tenantId: graceExpiredTenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.grace_period, gracePeriodEndsAt: past, provider: 'manual' },
      }),
      prisma.tenantBillingSubscription.create({
        data: { tenantId: pastDueTenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.past_due, gracePeriodEndsAt: future, provider: 'manual' },
      }),
    ]);
    const signupConnections = await prisma.paymentProviderConnection.count({
      where: { tenantId: { in: tenants.map((tenant) => tenant.id) } },
    });
    const signupActivations = await prisma.onlinePaymentActivation.count({
      where: { tenantId: { in: tenants.map((tenant) => tenant.id) } },
    });
    assert(signupConnections === 0, 'Signup unexpectedly created a provider connection.');
    assert(signupActivations === 0, 'Signup unexpectedly created payment onboarding.');

    const createOrder = (tenantId: string, marker: string) => prisma.order.create({
      data: {
        tenantId,
        orderNumber: marker,
        fulfillmentType: 'pickup',
        customerName: 'R2 Smoke',
        customerPhone: '5500000000000',
        itemsSubtotal: '10.00',
        total: '10.00',
        idempotencyKey: marker,
        publicTrackingToken: randomUUID(),
        paymentMethod: 'pix',
      },
    });
    const entitlementCases = [
      { key: 'free', tenant: freeTenant, expected: '0.38' },
      { key: 'active', tenant: activeTenant, expected: '0.20' },
      { key: 'trialValid', tenant: trialValidTenant, expected: '0.20' },
      { key: 'trialExpired', tenant: trialExpiredTenant, expected: '0.38' },
      { key: 'graceValid', tenant: graceValidTenant, expected: '0.20' },
      { key: 'graceExpired', tenant: graceExpiredTenant, expected: '0.38' },
      { key: 'pastDue', tenant: pastDueTenant, expected: '0.38' },
    ];
    const orders = await Promise.all(entitlementCases.map(({ tenant }, index) => createOrder(
      tenant.id,
      `R2-${index}-${suffix}`,
    )));
    const policyService = new PlatformFeePolicyService(prisma as never);
    const attemptService = new OrderPaymentAttemptService(prisma as never, policyService);
    const lifecycleService = new PlatformFeeLifecycleService(prisma as never);
    const activationService = new OnlinePaymentActivationService(prisma as never);

    const attempts = await Promise.all(entitlementCases.map(({ key, tenant }, index) => attemptService.createAttempt({
      tenantId: tenant.id,
      orderId: orders[index].id,
      provider: PaymentProvider.mock,
      idempotencyKey: `attempt-${key}-${suffix}`,
    })));
    entitlementCases.forEach(({ key, expected }, index) => {
      assert(attempts[index].platformFeeExpectedAmount?.toFixed(2) === expected, `${key} policy did not resolve R$ ${expected}.`);
    });
    const [freeAttempt, paidAttempt] = attempts;
    assert(freeAttempt.platformFeePolicyVersion === 1, 'Platform Fee version was not snapshotted.');

    await prisma.tenantBillingSubscription.update({
      where: { id: subscriptions[0].id },
      data: { status: TenantSubscriptionStatus.canceled },
    });
    const immutablePaidAttempt = await prisma.orderPaymentAttempt.findUniqueOrThrow({ where: { id: paidAttempt.id } });
    assert(immutablePaidAttempt.platformFeeExpectedAmount?.toFixed(2) === '0.20', 'Entitlement change reinterpreted an existing snapshot.');

    await attemptService.transitionStatus({ tenantId: freeTenant.id, attemptId: freeAttempt.id, status: OrderPaymentAttemptStatus.PENDING });
    await attemptService.transitionStatus({ tenantId: freeTenant.id, attemptId: freeAttempt.id, status: OrderPaymentAttemptStatus.PAID });
    await lifecycleService.markSettled({
      tenantId: freeTenant.id, attemptId: freeAttempt.id, actualCollectedAmount: '0.38', providerSplitAllocationId: 'smoke-split',
    });
    const [reversalA, reversalB] = await Promise.all([
      lifecycleService.recordProviderReversal({
        tenantId: freeTenant.id, attemptId: freeAttempt.id, amountRetainedByPlatform: '0.00', externalReference: 'smoke-reversal',
      }),
      lifecycleService.recordProviderReversal({
        tenantId: freeTenant.id, attemptId: freeAttempt.id, amountRetainedByPlatform: '0.00', externalReference: 'smoke-reversal',
      }),
    ]);
    assert(reversalA.receivable?.id === reversalB.receivable?.id, 'Duplicate reversal created duplicate receivables.');
    assert(reversalA.receivable?.amount.toFixed(2) === '0.38', 'Provider reversal receivable amount is incorrect.');

    const activationA = await activationService.requestActivation({
      tenantId: freeTenant.id, actorUserId: 'smoke-actor', termsVersion: 'technical-smoke-v1',
    });
    const activationB = await activationService.requestActivation({
      tenantId: freeTenant.id, actorUserId: 'smoke-actor', termsVersion: 'technical-smoke-v1',
    });
    assert(activationA.id === activationB.id, 'Duplicate activation request was not idempotent.');
    assert(await prisma.paymentProviderConnection.count({ where: { tenantId: freeTenant.id } }) === 0, 'Activation called a provider.');

    console.log(JSON.stringify({
      freePolicy: freeAttempt.platformFeeExpectedAmount?.toFixed(2),
      paidPolicy: paidAttempt.platformFeeExpectedAmount?.toFixed(2),
      trialValidPolicy: attempts[2].platformFeeExpectedAmount?.toFixed(2),
      trialExpiredPolicy: attempts[3].platformFeeExpectedAmount?.toFixed(2),
      graceValidPolicy: attempts[4].platformFeeExpectedAmount?.toFixed(2),
      graceExpiredPolicy: attempts[5].platformFeeExpectedAmount?.toFixed(2),
      pastDuePolicy: attempts[6].platformFeeExpectedAmount?.toFixed(2),
      snapshotImmutable: immutablePaidAttempt.platformFeeExpectedAmount?.toFixed(2) === '0.20',
      policyVersion: freeAttempt.platformFeePolicyVersion,
      receivable: reversalA.receivable?.amount.toFixed(2),
      duplicateReceivableId: reversalA.receivable?.id === reversalB.receivable?.id,
      activationLocalOnly: true,
    }));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: tenants.map((tenant) => tenant.id) } } });
    await prisma.billingPlan.deleteMany({ where: { id: plan.id } });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unknown R2 smoke failure.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
