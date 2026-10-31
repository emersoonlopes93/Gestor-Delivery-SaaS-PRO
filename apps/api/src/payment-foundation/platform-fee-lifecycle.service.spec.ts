import { PlatformFeeState, Prisma, TenantReceivableStatus } from '@prisma/client';
import { PlatformFeeLifecycleService } from './platform-fee-lifecycle.service';

describe('PlatformFeeLifecycleService', () => {
  const fee = {
    id: 'fee-a', tenantId: 'tenant-a', orderPaymentAttemptId: 'attempt-a', state: PlatformFeeState.SETTLED,
    expectedAmount: new Prisma.Decimal('0.38'), actualCollectedAmount: new Prisma.Decimal('0.38'), currency: 'BRL',
    providerSplitAllocationId: 'split-a', externalReference: null, earnedAt: new Date(), settledAt: new Date(),
    reversedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const tx = {
    platformFeeEntry: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    tenantReceivable: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(), tenantReceivable: { findMany: jest.fn(), updateMany: jest.fn(), findFirstOrThrow: jest.fn() } };
  const service = new PlatformFeeLifecycleService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it('keeps a settled Platform Fee when a customer refund does not reverse the provider split', () => {
    expect(fee.state).toBe(PlatformFeeState.SETTLED);
  });

  it('moves a pending fee to earned exactly once', async () => {
    tx.platformFeeEntry.findFirst.mockResolvedValue({ ...fee, state: PlatformFeeState.PENDING });
    tx.platformFeeEntry.updateMany.mockResolvedValue({ count: 1 });
    tx.platformFeeEntry.findUniqueOrThrow.mockResolvedValue({ ...fee, state: PlatformFeeState.EARNED });
    const result = await service.markEarned('tenant-a', 'attempt-a');
    expect(result.state).toBe(PlatformFeeState.EARNED);
    expect(tx.platformFeeEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', state: PlatformFeeState.PENDING }),
      data: expect.objectContaining({ state: PlatformFeeState.EARNED }),
    }));
  });

  it('settles an earned fee with provider reconciliation fields', async () => {
    tx.platformFeeEntry.findFirst.mockResolvedValue({ ...fee, state: PlatformFeeState.EARNED });
    tx.platformFeeEntry.updateMany.mockResolvedValue({ count: 1 });
    tx.platformFeeEntry.findUniqueOrThrow.mockResolvedValue(fee);
    const result = await service.markSettled({
      tenantId: 'tenant-a', attemptId: 'attempt-a', actualCollectedAmount: '0.38',
      providerSplitAllocationId: 'split-a', externalReference: 'settlement-a',
    });
    expect(result.state).toBe(PlatformFeeState.SETTLED);
    expect(tx.platformFeeEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actualCollectedAmount: new Prisma.Decimal('0.38'), providerSplitAllocationId: 'split-a' }),
    }));
  });

  it('creates one idempotent tenant receivable for a provider reversal', async () => {
    tx.platformFeeEntry.findFirst.mockResolvedValue(fee);
    tx.platformFeeEntry.update.mockResolvedValue({ ...fee, state: PlatformFeeState.DUE_FROM_TENANT });
    tx.tenantReceivable.upsert.mockResolvedValue({ id: 'receivable-a', status: TenantReceivableStatus.OPEN });
    const first = await service.recordProviderReversal({ tenantId: 'tenant-a', attemptId: 'attempt-a', amountRetainedByPlatform: '0.00' });
    const second = await service.recordProviderReversal({ tenantId: 'tenant-a', attemptId: 'attempt-a', amountRetainedByPlatform: '0.00' });
    expect(first.receivable.id).toBe('receivable-a');
    expect(second.receivable.id).toBe('receivable-a');
    expect(tx.tenantReceivable.upsert).toHaveBeenCalledTimes(2);
    expect(tx.tenantReceivable.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_sourceType_sourceId: expect.objectContaining({ tenantId: 'tenant-a', sourceId: 'fee-a' }) },
    }));
  });

  it('charges only the unretained difference and never twice', async () => {
    tx.platformFeeEntry.findFirst.mockResolvedValue(fee);
    tx.platformFeeEntry.update.mockResolvedValue({ ...fee, state: PlatformFeeState.DUE_FROM_TENANT });
    tx.tenantReceivable.upsert.mockImplementation(async ({ create }: { create: { amount: Prisma.Decimal } }) => create);
    const result = await service.recordProviderReversal({ tenantId: 'tenant-a', attemptId: 'attempt-a', amountRetainedByPlatform: '0.20' });
    expect(result.receivable.amount.toFixed(2)).toBe('0.18');
  });
});
