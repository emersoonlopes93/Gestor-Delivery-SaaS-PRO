import { randomUUID } from 'crypto';
import { OrderPaymentAttemptStatus, PaymentProvider, PrismaClient } from '@prisma/client';
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
  const freeTenant = await prisma.tenant.create({ data: { name: 'R2 Free Smoke', slug: `r2-free-${suffix}` } });
  const paidTenant = await prisma.tenant.create({ data: { name: 'R2 Paid Smoke', slug: `r2-paid-${suffix}` } });
  const plan = await prisma.billingPlan.create({
    data: { name: 'R2 Paid Smoke Plan', slug: `r2-paid-${suffix}`, type: 'fixed', currency: 'BRL', trialDays: 0 },
  });

  try {
    await prisma.tenantBillingSubscription.create({
      data: { tenantId: paidTenant.id, billingPlanId: plan.id, status: 'active', provider: 'manual' },
    });
    const signupConnections = await prisma.paymentProviderConnection.count({
      where: { tenantId: { in: [freeTenant.id, paidTenant.id] } },
    });
    const signupActivations = await prisma.onlinePaymentActivation.count({
      where: { tenantId: { in: [freeTenant.id, paidTenant.id] } },
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
    const freeOrder = await createOrder(freeTenant.id, `FREE-${suffix}`);
    const paidOrder = await createOrder(paidTenant.id, `PAID-${suffix}`);
    const policyService = new PlatformFeePolicyService(prisma as never);
    const attemptService = new OrderPaymentAttemptService(prisma as never, policyService);
    const lifecycleService = new PlatformFeeLifecycleService(prisma as never);
    const activationService = new OnlinePaymentActivationService(prisma as never);

    const freeAttempt = await attemptService.createAttempt({
      tenantId: freeTenant.id, orderId: freeOrder.id, provider: PaymentProvider.mock, idempotencyKey: `attempt-free-${suffix}`,
    });
    const paidAttempt = await attemptService.createAttempt({
      tenantId: paidTenant.id, orderId: paidOrder.id, provider: PaymentProvider.mock, idempotencyKey: `attempt-paid-${suffix}`,
    });
    assert(freeAttempt.platformFeeExpectedAmount?.toFixed(2) === '0.38', 'Free policy did not resolve R$ 0.38.');
    assert(paidAttempt.platformFeeExpectedAmount?.toFixed(2) === '0.20', 'Paid policy did not resolve R$ 0.20.');
    assert(freeAttempt.platformFeePolicyVersion === 1, 'Platform Fee version was not snapshotted.');

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
      policyVersion: freeAttempt.platformFeePolicyVersion,
      receivable: reversalA.receivable?.amount.toFixed(2),
      duplicateReceivableId: reversalA.receivable?.id === reversalB.receivable?.id,
      activationLocalOnly: true,
    }));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [freeTenant.id, paidTenant.id] } } });
    await prisma.billingPlan.deleteMany({ where: { id: plan.id } });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unknown R2 smoke failure.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
