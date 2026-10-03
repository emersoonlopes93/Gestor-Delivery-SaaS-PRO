import { OnlinePaymentActivationStatus } from '@prisma/client';
import { OnlinePaymentActivationService } from './online-payment-activation.service';

describe('OnlinePaymentActivationService', () => {
  const activation = {
    id: 'activation-a', tenantId: 'tenant-a', status: OnlinePaymentActivationStatus.PENDING_ONBOARDING,
    requestedAt: new Date(), termsAcceptedAt: new Date(), termsVersion: 'technical-v1',
    termsAcceptedByUserId: 'user-a', onboardingStartedAt: null, activatedAt: null, suspendedAt: null,
    failureReason: null, metadataJson: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const tx = {
    tenant: { findUnique: jest.fn() },
    onlinePaymentActivation: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(), onlinePaymentActivation: { findUnique: jest.fn(), update: jest.fn() } };
  const service = new OnlinePaymentActivationService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-a' });
    tx.onlinePaymentActivation.upsert.mockResolvedValue(activation);
  });

  it('creates only local onboarding state with actor and terms attribution', async () => {
    const result = await service.requestActivation({ tenantId: 'tenant-a', actorUserId: 'user-a', termsVersion: 'technical-v1' });
    expect(result.status).toBe(OnlinePaymentActivationStatus.PENDING_ONBOARDING);
    expect(tx.onlinePaymentActivation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a' },
      create: expect.objectContaining({ tenantId: 'tenant-a', termsAcceptedByUserId: 'user-a', termsVersion: 'technical-v1' }),
    }));
  });

  it('is idempotent for duplicate activation requests', async () => {
    await service.requestActivation({ tenantId: 'tenant-a', actorUserId: 'user-a', termsVersion: 'technical-v1' });
    await service.requestActivation({ tenantId: 'tenant-a', actorUserId: 'user-a', termsVersion: 'technical-v1' });
    expect(tx.onlinePaymentActivation.upsert).toHaveBeenCalledTimes(2);
    expect(tx.onlinePaymentActivation.upsert.mock.calls[1][0].update).toEqual({});
  });

  it('keeps tenant identity server-scoped', async () => {
    await service.requestActivation({ tenantId: 'tenant-b', actorUserId: 'user-b', termsVersion: 'technical-v1' });
    expect(tx.tenant.findUnique).toHaveBeenCalledWith({ where: { id: 'tenant-b' }, select: { id: true } });
  });
});
