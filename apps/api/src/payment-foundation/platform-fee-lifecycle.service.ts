import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PlatformFeeState,
  Prisma,
  TenantReceivableSourceType,
  TenantReceivableStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PlatformFeeLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async markEarned(tenantId: string, attemptId: string) {
    return this.transition(tenantId, attemptId, [PlatformFeeState.PENDING], PlatformFeeState.EARNED, {
      earnedAt: new Date(),
    }, 'payment.platform_fee_earned');
  }

  async markSettled(input: {
    tenantId: string;
    attemptId: string;
    actualCollectedAmount: Prisma.Decimal.Value;
    providerSplitAllocationId?: string | null;
    externalReference?: string | null;
  }) {
    const amount = this.money(input.actualCollectedAmount);
    return this.transition(input.tenantId, input.attemptId, [PlatformFeeState.EARNED], PlatformFeeState.SETTLED, {
      actualCollectedAmount: amount,
      providerSplitAllocationId: input.providerSplitAllocationId ?? null,
      externalReference: input.externalReference ?? null,
      settledAt: new Date(),
    }, 'payment.platform_fee_settled');
  }

  async recordProviderReversal(input: {
    tenantId: string;
    attemptId: string;
    amountRetainedByPlatform: Prisma.Decimal.Value;
    externalReference?: string | null;
  }) {
    const retained = this.money(input.amountRetainedByPlatform);
    return this.prisma.$transaction(async (tx) => {
      const fee = await tx.platformFeeEntry.findFirst({
        where: { tenantId: input.tenantId, orderPaymentAttemptId: input.attemptId },
      });
      if (!fee) throw new NotFoundException('Platform Fee entry not found for tenant.');
      const reversibleStates: PlatformFeeState[] = [
        PlatformFeeState.EARNED,
        PlatformFeeState.SETTLED,
        PlatformFeeState.DUE_FROM_TENANT,
      ];
      if (!reversibleStates.includes(fee.state)) {
        throw new ConflictException(`Platform Fee cannot be reversed from ${fee.state}.`);
      }
      const due = Prisma.Decimal.max(new Prisma.Decimal(fee.expectedAmount).minus(retained), 0).toDecimalPlaces(2);
      const nextState = due.isZero() ? PlatformFeeState.SETTLED : PlatformFeeState.DUE_FROM_TENANT;
      const updated = await tx.platformFeeEntry.update({
        where: { id: fee.id },
        data: {
          state: nextState,
          actualCollectedAmount: retained,
          externalReference: input.externalReference ?? fee.externalReference,
          reversedAt: new Date(),
        },
      });
      let receivable = null;
      if (due.greaterThan(0)) {
        receivable = await tx.tenantReceivable.upsert({
          where: {
            tenantId_sourceType_sourceId: {
              tenantId: input.tenantId,
              sourceType: TenantReceivableSourceType.PLATFORM_FEE_PROVIDER_REVERSAL,
              sourceId: fee.id,
            },
          },
          update: {},
          create: {
            tenantId: input.tenantId,
            sourceType: TenantReceivableSourceType.PLATFORM_FEE_PROVIDER_REVERSAL,
            sourceId: fee.id,
            amount: due,
            currency: fee.currency,
            status: TenantReceivableStatus.OPEN,
            reason: 'Platform Fee earned and later reversed by provider.',
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: null,
          userType: 'system',
          action: 'payment.platform_fee_provider_reversed',
          resource: 'platform_fee',
          details: { feeId: fee.id, attemptId: input.attemptId, dueAmount: due.toFixed(2), state: nextState },
        },
      });
      return { fee: updated, receivable };
    });
  }

  async listOpenReceivables(tenantId: string) {
    return this.prisma.tenantReceivable.findMany({
      where: { tenantId, status: TenantReceivableStatus.OPEN },
      orderBy: { createdAt: 'asc' },
    });
  }

  async settleReceivable(tenantId: string, receivableId: string, waive = false) {
    const status = waive ? TenantReceivableStatus.WAIVED : TenantReceivableStatus.SETTLED;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantReceivable.updateMany({
        where: { id: receivableId, tenantId, status: TenantReceivableStatus.OPEN },
        data: { status, settledAt: new Date() },
      });
      if (updated.count !== 1) throw new NotFoundException('Open tenant receivable not found.');
      const receivable = await tx.tenantReceivable.findFirstOrThrow({ where: { id: receivableId, tenantId } });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: null,
          userType: 'system',
          action: waive ? 'payment.tenant_receivable_waived' : 'payment.tenant_receivable_settled',
          resource: 'tenant_receivable',
          details: { receivableId, status },
        },
      });
      return receivable;
    });
  }

  private async transition(
    tenantId: string,
    attemptId: string,
    from: PlatformFeeState[],
    to: PlatformFeeState,
    data: Prisma.PlatformFeeEntryUpdateManyMutationInput,
    action: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const fee = await tx.platformFeeEntry.findFirst({ where: { tenantId, orderPaymentAttemptId: attemptId } });
      if (!fee) throw new NotFoundException('Platform Fee entry not found for tenant.');
      if (fee.state === to) return fee;
      if (!from.includes(fee.state)) throw new ConflictException(`Invalid Platform Fee transition ${fee.state}->${to}.`);
      const claimed = await tx.platformFeeEntry.updateMany({ where: { id: fee.id, tenantId, state: fee.state }, data: { ...data, state: to } });
      if (claimed.count !== 1) throw new ConflictException('Concurrent Platform Fee transition detected.');
      const current = await tx.platformFeeEntry.findUniqueOrThrow({ where: { id: fee.id } });
      await tx.auditLog.create({
        data: { tenantId, userId: null, userType: 'system', action, resource: 'platform_fee', details: { feeId: fee.id, attemptId, state: to } },
      });
      return current;
    });
  }

  private money(value: Prisma.Decimal.Value): Prisma.Decimal {
    const amount = new Prisma.Decimal(value).toDecimalPlaces(2);
    if (amount.isNegative()) throw new ConflictException('Financial amount cannot be negative.');
    return amount;
  }
}
